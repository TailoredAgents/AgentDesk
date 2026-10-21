import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateAudioUpload } from "../src/lib/audio";

test("live evaluation requires explicit opt-in and never prints a configured key", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agentdesk-eval-"));
  const reportPath = path.join(directory, "report.json");
  const secret = "fictional-secret-that-must-not-appear";
  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/evaluate-ai.ts", "--report", reportPath],
      {
        cwd: process.cwd(),
        env: { ...process.env, OPENAI_API_KEY: secret },
        encoding: "utf8",
        timeout: 20_000,
      },
    );
    assert.equal(result.status, 2);
    const saved = await readFile(reportPath, "utf8");
    const report = JSON.parse(saved);
    assert.equal(report.status, "skipped");
    assert.equal(report.results.length, 0);
    assert.match(report.reason, /opt-in/);
    assert.equal(
      `${result.stdout}${result.stderr}${saved}`.includes(secret),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing credentials produce a skipped report, not a fabricated live pass", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agentdesk-eval-"));
  const reportPath = path.join(directory, "report.json");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/evaluate-ai.ts",
        "--allow-live",
        "--report",
        reportPath,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, OPENAI_API_KEY: "" },
        encoding: "utf8",
        timeout: 20_000,
      },
    );
    assert.equal(result.status, 2);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.status, "skipped");
    assert.equal(report.results.length, 0);
    assert.match(report.reason, /OPENAI_API_KEY is absent/);
    assert.match(result.stdout, /SKIPPED/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the synthetic fictional speech fixture is a valid bounded WAV container", async () => {
  const bytes = await readFile("tests/fixtures/fictional-seller.wav");
  const normalized = await validateAudioUpload(
    new File([bytes], "fictional-seller.wav", { type: "audio/wav" }),
  );
  assert.equal(normalized.name, "recording.wav");
  assert.ok(normalized.size > 100_000);
  assert.ok(normalized.size < 20 * 1024 * 1024);
});
