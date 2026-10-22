"use client";
import { useRef, useState } from "react";
import { ArrowUpRight, History, Sparkles } from "lucide-react";
import type {
  Client,
  ProposedAction,
  WorkspaceData,
  WorkPackage,
} from "@/lib/types";
import type { ClientFact } from "@/lib/intelligence-types";
import { situationSampleTranscript } from "@/lib/intelligence-sample";
import { topicLabels } from "@/lib/intelligence-types";
import { proposalImpacts, activeSituationImpacts } from "@/lib/intelligence";
import { Badge, SectionTitle, shortDate } from "../ui";
import { request } from "./client-api";

export function ChangePreview({
  data,
  action,
  pkg,
}: {
  data: WorkspaceData;
  action: ProposedAction;
  pkg: WorkPackage;
}) {
  const c = action.change;
  if (!c) return null;
  const impacts = proposalImpacts(data, action, pkg);
  return (
    <div className="intelligence-change">
      <div className="eyebrow">
        {c.type === "task" ? "UPDATE EXISTING TASK" : "SITUATION CHANGE"}
      </div>
      <strong>Previously recorded</strong>
      {c.type === "task" ? (
        <p>
          {c.before.detail}
          <br />
          Due: {c.before.dueDate || "not set"}
        </p>
      ) : c.before.length ? (
        c.before.map((f) => (
          <p key={f.id}>
            {f.value} <Badge tone="neutral">{f.certainty}</Badge>
          </p>
        ))
      ) : (
        <p>No reviewed information on this topic yet.</p>
      )}
      {c.type === "fact" && (
        <>
          <strong>On approval</strong>
          <p>
            {c.disposition === "replace"
              ? "Retain the earlier plan as superseded history and use the reviewed update."
              : c.disposition === "retire"
                ? "Stop using this information in future work; preserve the correction history."
                : c.disposition === "request"
                  ? "Remember this request alongside the confirmed plan. The confirmed arrangement stays in place."
                  : c.disposition === "conflict"
                    ? "Record a disputed statement alongside the earlier information. A human correction is needed to resolve it."
                    : "Add this source-backed information to the client profile."}{" "}
            {c.observation.certainty === "requested" &&
              "This does not confirm a booking."}
          </p>
        </>
      )}
      {c.type === "task" && (
        <p>
          This updates one existing task. Its completion status and confirmed
          calendar time stay under human control.
        </p>
      )}
      {impacts.length > 0 && (
        <details>
          <summary>
            {new Set(impacts.map((i) => `${i.kind}:${i.targetId}`)).size}{" "}
            connected records may need attention
          </summary>
          {impacts.map((i) => (
            <p key={i.id}>
              <strong>{i.title}</strong>
              <br />
              {i.detail}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}

export function IntelligenceExceptions({
  data,
  agentId,
  clientId,
  propertyId,
  onClient,
  onReview,
}: {
  data: WorkspaceData;
  agentId?: string;
  clientId?: string;
  propertyId?: string;
  onClient?: (id: string) => void;
  onReview?: (id: string) => void;
}) {
  const match = (v: {
    agentId: string;
    clientId: string | null;
    propertyId: string | null;
  }) =>
    (!agentId || v.agentId === agentId) &&
    (!clientId || v.clientId === clientId) &&
    (!propertyId || v.propertyId === propertyId);
  const packages = data.packages.filter(
    (p) =>
      match(p) &&
      p.actions.some(
        (a) => a.kind === "intelligence" && a.status === "pending",
      ),
  );
  const impacts = activeSituationImpacts(data).filter(match);
  const records = [
    ...new Map(impacts.map((i) => [`${i.kind}:${i.targetId}`, i])).values(),
  ];
  const uncertain = (data.clientFacts ?? []).filter(
    (f) =>
      match(f) &&
      f.status === "current" &&
      ["requested", "disputed", "uncertain"].includes(f.certainty),
  );
  if (!packages.length && !records.length && !uncertain.length) return null;
  return (
    <section className="intelligence-exceptions">
      <div className="eyebrow">
        <Sparkles size={14} /> SITUATIONS TO WATCH
      </div>
      <p>
        {packages.length} change review{packages.length === 1 ? "" : "s"} ·{" "}
        {records.length} connected record{records.length === 1 ? "" : "s"} to
        check · {uncertain.length} unconfirmed or disputed fact
        {uncertain.length === 1 ? "" : "s"}
      </p>
      {packages.slice(0, 4).map((p) => (
        <button
          className="text-link"
          key={p.id}
          onClick={() => onReview?.(p.id)}
        >
          {p.title}
          <ArrowUpRight size={14} />
        </button>
      ))}
      {records.slice(0, 4).map((i) => (
        <div className="intelligence-exception" key={i.id}>
          <strong>{i.title}</strong>
          <p>{i.detail}</p>
          {onClient && (
            <button className="text-link" onClick={() => onClient(i.clientId)}>
              Open client context <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      ))}
      {uncertain.slice(0, 3).map((f) => (
        <div className="intelligence-exception" key={f.id}>
          <strong>
            {data.clients.find((c) => c.id === f.clientId)?.name} ·{" "}
            {topicLabels[f.topic]}
          </strong>
          <p>
            {f.value} <Badge tone="amber">{f.certainty}</Badge>
          </p>
          {onClient && (
            <button className="text-link" onClick={() => onClient(f.clientId)}>
              View relationship & situation <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      ))}
      {records.length > 4 && (
        <small>
          Open the client and document history for all affected records.
        </small>
      )}
    </section>
  );
}

export function ClientIntelligence({
  data,
  client,
  onUpdate,
  onReview,
  notify,
}: {
  data: WorkspaceData;
  client: Client;
  onUpdate: (data: WorkspaceData) => void;
  onReview: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState<ClientFact | null>(null);
  const [value, setValue] = useState("");
  const [certainty, setCertainty] = useState<
    "confirmed" | "requested" | "uncertain"
  >("confirmed");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const facts = (data.clientFacts ?? []).filter(
    (f) => f.clientId === client.id && f.agentId === client.agentId,
  );
  const current = facts.filter((f) => f.status === "current");
  const save = async (retire: boolean) => {
    if (!editing || busy || !value.trim()) return;
    setBusy(true);
    const body = {
      value,
      certainty,
      effectiveDate: effectiveDate || null,
      retire,
    };
    const key = editing.id + JSON.stringify(body);
    if (attempt.current?.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    try {
      const result = await request<{
        workspace: WorkspaceData;
        packageId: string;
      }>(`/api/intelligence/${encodeURIComponent(editing.id)}`, "POST", {
        ...body,
        requestId: attempt.current.id,
      });
      onUpdate(result.workspace);
      setEditing(null);
      attempt.current = null;
      notify(
        "Correction prepared. Review and approve it to update the current situation.",
      );
      onReview(result.packageId);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const render = (f: ClientFact) => (
    <article className="intelligence-fact" key={f.id}>
      <div>
        <strong>{topicLabels[f.topic]}</strong>
        <Badge
          tone={
            f.status !== "current"
              ? "neutral"
              : f.certainty === "confirmed"
                ? "green"
                : "amber"
          }
        >
          {f.status === "current" ? f.certainty : f.status}
        </Badge>
      </div>
      <p>{f.value}</p>
      <small>
        {f.propertyId
          ? data.properties.find((p) => p.id === f.propertyId)?.address
          : "Client relationship"}
        {f.effectiveDate ? ` · Effective ${shortDate(f.effectiveDate)}` : ""} ·
        Reviewed{f.humanEdited ? " human correction" : ""}
      </small>
      <details>
        <summary>Evidence & history</summary>
        <blockquote>“{f.sourceQuote}”</blockquote>
        <p>
          Recorded {shortDate(f.recordedAt)} · Reviewed{" "}
          {shortDate(f.reviewedAt)} by {f.reviewer}
        </p>
        <p>
          {
            data.conversations.find((c) => c.id === f.sourceConversationId)
              ?.title
          }
        </p>
        {f.supersedes.map((id) => (
          <p key={id}>
            Replaces: {facts.find((prior) => prior.id === id)?.value || id}
          </p>
        ))}
      </details>
      {f.status === "current" && (
        <button
          className="text-link"
          onClick={() => {
            setEditing(f);
            setValue(f.value);
            setCertainty(
              f.certainty === "disputed" ? "uncertain" : f.certainty,
            );
            setEffectiveDate(f.effectiveDate || "");
          }}
        >
          Correct or retire
        </button>
      )}
    </article>
  );
  return (
    <section className="client-intelligence">
      <SectionTitle title="Relationship & situation" />
      <p className="small-text">
        Reviewed information shared by all five assistants. Requests remain
        requests until a confirmed update is reviewed.
      </p>
      {data.workspace.sample && client.id === "sarah" && (
        <details className="intelligence-demo">
          <summary>Connected example · Sarah’s second conversation</summary>
          <p>
            First approve the original photography task and seller PDF in
            Review. Then open the saved change review to see how the new plan
            affects that work. This is a fictional saved example, not a live
            model result.
          </p>
          <blockquote>{situationSampleTranscript}</blockquote>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                const result = await request<{
                  workspace: WorkspaceData;
                  packageId: string;
                }>("/api/intelligence/sample", "POST", {});
                onUpdate(result.workspace);
                onReview(result.packageId);
              } catch (error) {
                notify((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Open saved change review
          </button>
        </details>
      )}
      {[
        [
          "Who they are",
          current.filter((f) =>
            ["objective", "communication", "buyer_priority"].includes(f.topic),
          ),
        ],
        [
          "What's happening now",
          current.filter(
            (f) =>
              !["objective", "communication", "buyer_priority"].includes(
                f.topic,
              ),
          ),
        ],
      ].map(([heading, list]) => (
        <div key={heading as string}>
          <h3 className="small-heading">{heading as string}</h3>
          {(list as ClientFact[]).length ? (
            (list as ClientFact[]).map(render)
          ) : (
            <p className="small-text">
              No reviewed facts yet. New conversations can propose information
              for approval.
            </p>
          )}
        </div>
      ))}
      {editing && (
        <div className="intelligence-correction">
          <h3>Correct {topicLabels[editing.topic].toLowerCase()}</h3>
          <label>
            Current wording
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={1000}
            />
          </label>
          <label>
            Certainty
            <select
              value={certainty}
              onChange={(e) => setCertainty(e.target.value as typeof certainty)}
            >
              <option value="confirmed">Confirmed</option>
              <option value="requested">Requested</option>
              <option value="uncertain">Uncertain</option>
            </select>
          </label>
          <label>
            Explicit effective date (optional)
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </label>
          <div className="intelligence-buttons">
            <button
              className="button primary"
              disabled={busy || !value.trim()}
              onClick={() => save(false)}
            >
              Prepare correction
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => save(true)}
            >
              Prepare retirement
            </button>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
          <small>
            This creates a review proposal. Retired information stays in audit
            history and is excluded from future AI context. Sample restoration
            removes the sample's saved memory.
          </small>
        </div>
      )}
      <IntelligenceExceptions
        data={data}
        clientId={client.id}
        onReview={onReview}
      />
      {facts.some((f) => f.status !== "current") && (
        <details className="intelligence-history">
          <summary>
            <History size={14} /> Earlier information
          </summary>
          {facts.filter((f) => f.status !== "current").map(render)}
        </details>
      )}
    </section>
  );
}
