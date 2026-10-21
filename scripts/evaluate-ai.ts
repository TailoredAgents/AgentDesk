import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { buildAIContext } from "../src/lib/ai-context";
import {
  generateFollowUpPackage,
  generateWorkPackage,
  getAIModelNames,
  rewriteMessage,
  transcribeAudio,
  type GeneratedPackage,
} from "../src/lib/ai";
import { validateAudioUpload } from "../src/lib/audio";
import { ApiError } from "../src/lib/auth";
import type { WorkPackage } from "../src/lib/types";
import {
  aiEvaluationScenarios,
  fictionalAIWorkspace,
  professionalStyle,
} from "../tests/fixtures/ai-scenarios";

// Only fictional fixtures are used; this script never connects to the workspace database.
// Credentials stay in process memory and are never written to the report.
dotenv.config({ path: [".env.local", ".env"], quiet: true });

type Check = { name: string; passed: boolean };
type Result = {
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  checks: Check[];
  error?: string;
  output?: unknown;
};
type Report = {
  startedAt: string;
  completedAt?: string;
  status: "passed" | "failed" | "skipped";
  reason?: string;
  models: ReturnType<typeof getAIModelNames>;
  results: Result[];
  humanReview: string;
};
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`Missing value for ${name}.`);
  return args[index + 1];
};
const reportPath = path.resolve(
  option("--report", "test-results/ai-live-eval.json"),
);
const audioPath = path.resolve(
  option("--audio", "tests/fixtures/fictional-seller.wav"),
);
const report: Report = {
  startedAt: new Date().toISOString(),
  status: "skipped",
  models: getAIModelNames(),
  results: [],
  humanReview:
    "Automated checks are narrow evidence checks, not proof of general factual accuracy or natural writing. Review the saved fictional drafts, uncertainty, tone differences and rewrites before choosing the live demo path. No messages were sent or database records changed. Latencies are measured; operating cost is not estimated. Review actual usage in the OpenAI project.",
};

function safeFailure(error: unknown) {
  if (error instanceof ApiError) return error.code;
  if (error instanceof OpenAI.APIError)
    return `provider_http_${error.status ?? "unknown"}`;
  return error instanceof Error ? error.constructor.name : "UnknownError";
}

async function runCase<T>(
  name: string,
  operation: (check: (name: string, condition: boolean) => void) => Promise<T>,
): Promise<T | undefined> {
  const started = performance.now();
  const checks: Check[] = [];
  try {
    const output = await operation((checkName, passed) =>
      checks.push({ name: checkName, passed }),
    );
    const status = checks.every((check) => check.passed) ? "passed" : "failed";
    report.results.push({
      name,
      status,
      durationMs: Math.round(performance.now() - started),
      checks,
      output,
    });
    console.log(`${status.toUpperCase()} ${name}`);
    return output;
  } catch (error) {
    const safeError = safeFailure(error);
    report.results.push({
      name,
      status: "failed",
      durationMs: Math.round(performance.now() - started),
      checks,
      error: safeError,
    });
    console.log(`FAILED ${name}: ${safeError}`);
    return undefined;
  }
}

function messageOf(generated: GeneratedPackage) {
  return (
    generated.actions.find((action) => action.kind === "message")?.body ?? ""
  );
}

function packageForRewrite(generated: GeneratedPackage): WorkPackage {
  return {
    ...generated,
    id: "eval-package",
    conversationId: "eval-conversation",
    agentId: "eval-jordan",
    clientId: "eval-sarah",
    propertyId: "eval-willow",
    title: "Fictional evaluation",
    status: "pending",
    origin: "openai",
    createdAt: new Date().toISOString(),
    actions: generated.actions.map((action, index) => ({
      ...action,
      id: `eval-${index}`,
      status: "pending",
    })),
  };
}

async function main() {
  if (!args.includes("--allow-live")) {
    report.reason =
      "Explicit opt-in is required. Run npm run test:ai:live -- --allow-live to make paid provider calls with fictional fixtures.";
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    report.reason =
      "OPENAI_API_KEY is absent. No provider-level model, generation, rewriting or transcription tests ran.";
    return;
  }
  const unknown = args.filter(
    (argument, index) =>
      argument.startsWith("--") &&
      !["--allow-live", "--audio", "--report"].includes(argument) &&
      !["--audio", "--report"].includes(args[index - 1]),
  );
  if (unknown.length) {
    report.status = "failed";
    report.reason =
      "An unrecognised CLI option was supplied. Supported options: --allow-live, --audio <fictional fixture>, --report <path>.";
    return;
  }
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 90_000,
    maxRetries: 0,
  });
  for (const model of new Set(Object.values(report.models))) {
    await runCase(`model-access:${model}`, async (check) => {
      const accessible = await openai.models.retrieve(model);
      check(
        "The configured project can retrieve this model",
        Boolean(accessible.id),
      );
      return {
        id: accessible.id,
        endpointCompatibility:
          "Tested by the corresponding calls below, not inferred from model retrieval.",
      };
    });
  }
  if (report.results.some((result) => result.status === "failed")) {
    report.status = "failed";
    report.reason =
      "A configured model was not accessible. Generation, rewrite and transcription checks did not run; correct project access/model settings first.";
    return;
  }

  const data = fictionalAIWorkspace();
  let sellerPackage: GeneratedPackage | undefined;
  const seller = aiEvaluationScenarios[0];
  const sellerContext = buildAIContext(
    data,
    seller.agentId,
    seller.clientId,
    seller.propertyId,
    seller.transcript,
  );
  for (const scenario of aiEvaluationScenarios) {
    const result = await runCase(`package:${scenario.id}`, async (check) => {
      const generated = await generateWorkPackage(
        buildAIContext(
          data,
          scenario.agentId,
          scenario.clientId,
          scenario.propertyId,
          scenario.transcript,
        ),
      );
      const message = messageOf(generated);
      const allText = [
        generated.summary,
        ...generated.facts.map((fact) => fact.text),
        ...generated.actions.map((action) => `${action.title} ${action.body}`),
      ].join("\n");
      check(
        "A substantive client follow-up draft was produced",
        message.length >= 40,
      );
      check(
        "Summary and CRM note are proposed for explicit review",
        generated.actions.some((action) => action.kind === "summary") &&
          generated.actions.some((action) => action.kind === "crm_note"),
      );
      check(
        "No generic template opening",
        !/hope.*finds you well/i.test(message),
      );
      if (scenario.id === seller.id) {
        check(
          "Booked cleaning is extracted as a confirmed fact",
          generated.facts.some(
            (fact) =>
              /clean/i.test(fact.text) && fact.certainty === "confirmed",
          ),
        );
        check(
          "Photography is extracted as requested or uncertain",
          generated.facts.some(
            (fact) =>
              /photo/i.test(fact.text) && fact.certainty !== "confirmed",
          ),
        );
        check(
          "The draft keeps photography uncertainty visible",
          /photo/i.test(message) &&
            /(?:confirm|check|availability|await|pending|hear back|requested)/i.test(
              message,
            ),
        );
        check(
          "Checklist has not been sent or attached",
          !/(?:I['’]ve|I have|we have|we['’]ve)\s+(?:already\s+)?(?:sent|attached)|(?:checklist|attachment)\s+(?:is|has been)\s+(?:sent|attached|ready)/i.test(
            message,
          ),
        );
        check(
          "Checklist preparation is a distinct proposed next step",
          generated.actions.some(
            (action) =>
              action.kind === "task" &&
              /checklist/i.test(`${action.title} ${action.body}`),
          ),
        );
        check(
          "No duplicate task for the existing photographer availability task",
          !generated.actions.some(
            (action) =>
              action.kind === "task" &&
              /(?:check|confirm)\b.*(?:photo|availability)|photo.*(?:availability|confirm)/i.test(
                action.title,
              ),
          ),
        );
        check(
          "The unresolved patio question is preserved",
          /patio/i.test(allText + generated.clarifications.join(" ")),
        );
        check(
          "Warm profile greeting is reflected",
          /^Hey\s*,?\s+Sarah\b/i.test(message.trim()),
        );
      } else if (scenario.id.startsWith("buyer")) {
        check(
          "The supported buyer budget is retained",
          /\$625,?000/.test(allText),
        );
        check(
          "Unknown HOA costs remain unresolved",
          /HOA/i.test(allText) &&
            /(?:unknown|not.*(?:have|known|confirm)|need|ask|check|request)/i.test(
              allText,
            ),
        );
        check(
          "Requested tour is not presented as confirmed",
          generated.facts.some(
            (fact) =>
              /tour|showing/i.test(fact.text) && fact.certainty !== "confirmed",
          ),
        );
        check(
          "Both obtaining fees and providing a comparison are planned",
          generated.actions.some(
            (action) =>
              action.kind === "task" &&
              /fee|HOA/i.test(`${action.title} ${action.body}`),
          ) &&
            generated.actions.some(
              (action) =>
                action.kind === "task" &&
                /compar/i.test(`${action.title} ${action.body}`),
            ),
        );
        check(
          "The explicit comparison deadline is retained on its task",
          generated.actions.some(
            (action) =>
              action.kind === "task" &&
              /compar/i.test(`${action.title} ${action.body}`) &&
              action.dueDate === "2026-10-23",
          ),
        );
        check(
          "Professional profile greeting is reflected",
          /^Hi\s*,?\s+Michael\b/i.test(message.trim()) &&
            !message.includes("!"),
        );
      } else {
        check(
          "Conflicting dates trigger a clarification",
          generated.clarifications.some((item) =>
            /date|weekday|Monday|Tuesday/i.test(item),
          ),
        );
        check(
          "Unresolved alternative dates never become task deadlines",
          generated.actions
            .filter((action) => action.kind === "task")
            .every((action) => action.dueDate === null),
        );
        check("No staging price is fabricated", !/\$\s*\d/.test(allText));
        check(
          "Date uncertainty is visible in the message",
          /(?:confirm|check|clarif|uncertain|unconfirmed|not.*confirmed)/i.test(
            message,
          ),
        );
      }
      return generated;
    });
    if (scenario.id === seller.id) sellerPackage = result;
  }

  if (sellerPackage) {
    await runCase("style:professional-on-identical-source", async (check) => {
      const professional = {
        ...sellerContext,
        agent: {
          ...sellerContext.agent,
          name: "Sophie Chen",
          style: professionalStyle,
        },
      };
      const generated = await generateWorkPackage(professional);
      const body = messageOf(generated);
      check(
        "Changing only the agent profile changes the draft",
        body.trim() !== messageOf(sellerPackage!).trim(),
      );
      check(
        "The professional greeting and measured punctuation are used",
        /^Hi\s*,?\s+Sarah\b/i.test(body.trim()) && !body.includes("!"),
      );
      check(
        "The same uncertain photography fact is preserved",
        generated.facts.some(
          (fact) => /photo/i.test(fact.text) && fact.certainty !== "confirmed",
        ),
      );
      return {
        message: body,
        profile: "professional",
        comparedWith: "seller-requested-photography",
      };
    });
    for (const instruction of ["shorter", "natural", "professional"] as const) {
      await runCase(`rewrite:${instruction}`, async (check) => {
        const original = messageOf(sellerPackage!);
        const { body } = await rewriteMessage(
          sellerContext,
          packageForRewrite(sellerPackage!),
          original,
          instruction,
        );
        check(
          "The rewrite meaningfully changes the draft",
          body.trim() !== original.trim(),
        );
        check(
          "The photography topic and its uncertainty survive",
          /photo/i.test(body) &&
            /confirm|check|availability|await|pending|hear back|requested/i.test(
              body,
            ),
        );
        if (instruction === "shorter")
          check(
            "Shorter produces fewer characters",
            body.length < original.length,
          );
        return { original, body };
      });
    }
  } else {
    report.results.push({
      name: "styles-and-rewrites",
      status: "skipped",
      durationMs: 0,
      checks: [],
      error: "The seller generation failed, so dependent checks could not run.",
    });
  }

  await runCase("proactive:outstanding-records", async (check) => {
    const sourceSnapshot =
      "Fictional workspace snapshot as of 2026-10-23. Agent: Jordan Ellis. Client: Sarah Mitchell. Property: 1420 Willow Lane. Open task: Check photographer availability. Task due date: 2026-10-23. Task detail: Confirm requested photography time with the photographer; no confirmation is recorded. Open client question: Should patio furniture remain for photography? No answer is recorded. These records show outstanding work, not proof that no contact has occurred. No message has been sent by AgentDesk.";
    const generated = await generateFollowUpPackage(
      sellerContext,
      sourceSnapshot,
    );
    check(
      "The outstanding record produces a client draft",
      messageOf(generated).length >= 40,
    );
    check(
      "Existing tasks are not duplicated",
      generated.actions.every((action) =>
        ["message", "crm_note", "summary"].includes(action.kind),
      ),
    );
    check(
      "The follow-up is about the recorded property work",
      /photo|patio/i.test(messageOf(generated)),
    );
    return generated;
  });

  const transcription = await runCase(
    "audio:fictional-transcription",
    async (check) => {
      const extension = path.extname(audioPath).toLowerCase();
      const mime: Record<string, string> = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".mp4": "audio/mp4",
        ".m4a": "audio/mp4",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
      };
      const bytes = await readFile(audioPath);
      const file = await validateAudioUpload(
        new File([bytes], `fictional-recording${extension}`, {
          type: mime[extension] ?? "application/octet-stream",
        }),
      );
      const { text } = await transcribeAudio(file);
      check(
        "The fictional client and property work are recognized",
        /Sarah/i.test(text) && /photo/i.test(text) && /clean/i.test(text),
      );
      check(
        "The requested appointment remains unconfirmed",
        /not confirmed|hasn['’]t confirmed|unconfirmed/i.test(text),
      );
      check("The checklist next step is retained", /checklist/i.test(text));
      return { text, fixture: path.basename(audioPath), bytes: bytes.length };
    },
  );
  if (transcription)
    await runCase("audio:transcript-to-package", async (check) => {
      const generated = await generateWorkPackage(
        buildAIContext(
          data,
          seller.agentId,
          seller.clientId,
          seller.propertyId,
          transcription.text,
        ),
      );
      check(
        "Transcribed booked cleaning is confirmed",
        generated.facts.some(
          (fact) => /clean/i.test(fact.text) && fact.certainty === "confirmed",
        ),
      );
      check(
        "Transcribed photography request is not booked",
        generated.facts.some(
          (fact) => /photo/i.test(fact.text) && fact.certainty !== "confirmed",
        ),
      );
      check(
        "Relative weekdays do not become invented dated deadlines",
        generated.actions.every((action) => action.dueDate === null),
      );
      check(
        "An audio-derived message is ready for human review",
        Boolean(messageOf(generated)),
      );
      return generated;
    });
  report.status = report.results.every((result) => result.status === "passed")
    ? "passed"
    : "failed";
}

void main()
  .catch((error) => {
    report.status = "failed";
    report.reason = `Evaluation stopped: ${safeFailure(error)}. No raw provider error or credentials are included.`;
  })
  .finally(async () => {
    report.completedAt = new Date().toISOString();
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(
      `${report.status.toUpperCase()}: ${report.reason ?? "See individual checks and fictional outputs in the report."}`,
    );
    console.log(`Report: ${reportPath}`);
    process.exitCode =
      report.status === "passed" ? 0 : report.status === "skipped" ? 2 : 1;
  });
