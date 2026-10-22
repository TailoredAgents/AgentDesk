"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  RefreshCw,
  ShieldCheck,
  ArrowUpRight,
  Copy,
  AlertCircle,
  Unplug,
  Check,
} from "lucide-react";
import type { CrmService } from "@/lib/crm/service";
import type { SharedContext } from "@/lib/crm/work";
import { capabilityLabels, allCapabilities } from "@/lib/crm/types";
import { Badge } from "../ui";
import { Workstyle } from "../workspace/workstyle";
import { MessageReview } from "./message-review";

type State = Awaited<ReturnType<CrmService["status"]>>;
const statusNames: Record<string, string> = {
  connected: "Connected",
  disconnected: "Not connected",
  reauth_required: "Reconnect required",
  proposed: "Awaiting approval",
  approved: "Approved · ready to submit",
  submitting: "Submission started · outcome unconfirmed",
  submitted: "Submitted · awaiting confirmation",
  applied: "Confirmed in Lofty",
  outcome_unknown: "Outcome unknown · do not resubmit",
  failed: "Failed",
  conflict: "Conflict · review required",
  canceled: "Canceled",
  rejected: "Rejected",
  ready: "Ready for review",
  preparing: "Preparing",
  interrupted: "Preparation interrupted",
  context_changed: "Context changed · prepare again",
};
const errorNames: Record<string, string> = {
  permission: "Lofty did not grant this operation or record access.",
  unavailable: "The record is missing or no longer accessible.",
  unauthorized:
    "Lofty authorization expired or was revoked. Reconnect your account.",
  network:
    "Lofty could not be reached. Review the saved operation status before continuing.",
  invalid_response:
    "Lofty returned a response that could not be safely verified.",
  rate_limited:
    "Lofty rate limit reached. Wait for the cooldown before refreshing.",
  write_conflict:
    "The task changed in Lofty. Refresh it and prepare a new proposal.",
  confirmation_conflict:
    "Lofty's record differs from the approved action. Review it in Lofty.",
  awaiting_provider_visibility:
    "Lofty accepted the action but has not made the record readable yet. Check confirmation again later.",
  pilot_record_limit:
    "This pilot stops at 2,000 assigned leads. Some records may not be imported.",
  crm_ai_disabled: "CRM AI drafting is not enabled yet.",
  preparation_interrupted:
    "Preparation stopped before a draft was saved. You can prepare a new draft; no CRM changes were made.",
  account_mismatch:
    "This Lofty account does not match the assigned agent and brokerage.",
  history_truncated:
    "Only the first 1,000 timeline entries were retrieved; history is incomplete.",
};
const explain = (code: string) =>
  errorNames[code] ||
  code
    .split(",")
    .map((v) => {
      const [kind, error] = v.split(":");
      return error
        ? `${kind}: ${errorNames[error] || "This portion of context needs attention."}`
        : "This operation needs attention. Check configuration or refresh the connection.";
    })
    .join(" ");
const formatDate = (date: string | null) =>
  date
    ? new Date(date).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not yet";
const leadName = (data: Record<string, unknown>) =>
  [data.firstName, data.lastName].filter(Boolean).join(" ") || "Unnamed lead";
async function api<T>(
  path = "/api/pilot/workspace",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json();
  if (response.status === 401) window.location.assign("/pilot");
  if (!response.ok)
    throw new Error(result.error || "The request failed. Please refresh.");
  return result;
}

export function PilotWorkspace() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(""),
    [context, setContext] = useState<SharedContext | null>(null),
    [search, setSearch] = useState("");
  const [disconnect, setDisconnect] = useState(false),
    [operation, setOperation] = useState("notes.create"),
    [content, setContent] = useState(""),
    [due, setDue] = useState(""),
    [taskId, setTaskId] = useState(""),
    [transcript, setTranscript] = useState("");
  const writeRequest = useRef<string | null>(null),
    workRequest = useRef<string | null>(null);
  const load = useCallback(async () => {
    const next = await api<State>();
    setState(next);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const outcome = new URLSearchParams(window.location.search).get(
      "connection",
    );
    if (outcome && outcome !== "connected")
      setError(
        outcome === "authorization_declined"
          ? "Lofty authorization was declined. No account was connected."
          : "Lofty authorization did not complete. Check the account and connection setup, then start again.",
      );
  }, [load]);
  useEffect(() => {
    let active = true;
    setContext(null);
    setContent("");
    setTaskId("");
    setTranscript("");
    writeRequest.current = null;
    workRequest.current = null;
    if (selected)
      api<SharedContext>(
        `/api/pilot/workspace?leadId=${encodeURIComponent(selected)}`,
      )
        .then((value) => {
          if (active) setContext(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selected]);
  const act = async (body: unknown, success: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{
        ok?: boolean;
        code?: string;
        status?: string;
      }>("/api/pilot/workspace", body);
      if (result.ok === false) setError(explain(result.code || ""));
      else
        setNotice(
          result.status ? statusNames[result.status] || result.status : success,
        );
      await load();
      setContext(null);
      if (selected && (body as { action: string }).action !== "disconnect")
        setContext(
          await api<SharedContext>(
            `/api/pilot/workspace?leadId=${encodeURIComponent(selected)}`,
          ),
        );
      return result.ok !== false;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The request was interrupted. Refresh to check its saved status.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ authorizationUrl: string }>(
        "/api/pilot/lofty/connect",
        {},
      );
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  if (!state)
    return (
      <section className="crm-card crm-loading" aria-live="polite">
        {error ? (
          <>
            <h2>Unable to open your CRM pilot</h2>
            <p role="alert">{error}</p>
            <button
              className="button secondary"
              onClick={() => load().catch((e) => setError(e.message))}
            >
              Try again
            </button>
          </>
        ) : (
          <p>Opening your individual workspace…</p>
        )}
      </section>
    );
  const connected = state.connection.status === "connected";
  const filtered = state.leads.filter((lead) =>
    `${leadName(lead.data)} ${lead.externalId}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const tasks =
    context?.sources.filter(
      (s) => s.kind === "task" && s.data.type !== "Appointment",
    ) || [];
  const work = state.work.filter((w) => w.leadId === selected);
  return (
    <>
      <div className="crm-page-heading">
        <div>
          <span className="eyebrow">{state.actor.brokerageName}</span>
          <h1>Your connected workspace</h1>
          <p>
            {state.actor.label} ·{" "}
            {state.actor.role === "leader" ? "Team leader" : "Agent"} · Your
            assigned Lofty records
          </p>
        </div>
        <Badge>Private pilot</Badge>
      </div>
      {error && (
        <div className="crm-alert" role="alert">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      <details className="crm-card">
        <summary>Agent Workstyle · your preferences and suggestions</summary>
        <Workstyle
          endpoint="/api/pilot/workstyle"
          notify={(message, tone) =>
            tone === "error" ? setError(message) : setNotice(message)
          }
          onChanged={async () => {
            await load();
            if (selected)
              setContext(
                await api<SharedContext>(
                  `/api/pilot/workspace?leadId=${selected}`,
                ),
              );
          }}
        />
      </details>
      {notice && (
        <div className="crm-notice" role="status">
          <Check size={18} />
          <p>{notice}</p>
        </div>
      )}
      <section className="crm-card">
        <div className="crm-card-heading">
          <span className="crm-provider-mark">
            <Database size={26} />
          </span>
          <div>
            <h2>Lofty CRM</h2>
            <p>
              {state.connection.identity
                ? `${state.connection.identity.label} · Account ${state.connection.identity.userId}`
                : "Connect your authorized account to get started."}
            </p>
          </div>
          <Badge>
            {statusNames[state.connection.status] || state.connection.status}
          </Badge>
        </div>
        <div className="crm-metrics">
          <div>
            <span>Last complete lead refresh</span>
            <strong>{formatDate(state.connection.lastSyncAt)}</strong>
          </div>
          <div>
            <span>Records in this view</span>
            <strong>
              {state.leads.length}
              {state.moreLeads ? "+" : ""} assigned leads
            </strong>
          </div>
          <div>
            <span>Synchronization</span>
            <strong>On demand · no background monitoring</strong>
          </div>
        </div>
        {state.connection.errorCode && (
          <div className="crm-notice">
            <AlertCircle size={18} />
            <p>{explain(state.connection.errorCode)}</p>
          </div>
        )}
        {state.connection.cooldownUntil &&
          Date.parse(state.connection.cooldownUntil) > Date.now() && (
            <p className="crm-muted">
              Next refresh after {formatDate(state.connection.cooldownUntil)}.
            </p>
          )}
        {!state.configuration.ready && (
          <details className="crm-checklist" open>
            <summary>Connection setup is incomplete</summary>
            <ul>
              {state.configuration.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="crm-actions">
          {!connected && (
            <button
              className="button primary"
              disabled={busy || !state.configuration.ready}
              onClick={connect}
            >
              Connect Lofty <ArrowUpRight size={16} />
            </button>
          )}
          {connected && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                act(
                  { action: "sync" },
                  "Lead refresh saved. Check the refresh history for partial results.",
                )
              }
            >
              <RefreshCw size={16} />
              {state.connection.scanId
                ? "Continue lead import"
                : "Refresh assigned leads"}
            </button>
          )}
          {state.connection.status !== "disconnected" && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDisconnect(true)}
            >
              <Unplug size={16} />
              Disconnect
            </button>
          )}
          <a
            href="https://crm.lofty.com"
            target="_blank"
            rel="noreferrer"
            className="crm-text-link"
          >
            Open Lofty <ArrowUpRight size={14} />
          </a>
        </div>
        {disconnect && (
          <div className="crm-confirm">
            <h3>Disconnect this account?</h3>
            <p>
              This removes server tokens, cached CRM content, and pilot drafts.
              Execution metadata stays in the audit history. Revoke the
              application in Lofty as well.
            </p>
            <div className="crm-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setDisconnect(false)}
              >
                Keep connected
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  if (
                    await act(
                      { action: "disconnect" },
                      "Disconnected. Revoke the application in Lofty to complete provider-side revocation.",
                    )
                  ) {
                    setDisconnect(false);
                    setSelected("");
                    setContext(null);
                  }
                }}
              >
                Disconnect and clear CRM content
              </button>
            </div>
          </div>
        )}
        <details className="crm-checklist">
          <summary>Read access & approved write access</summary>
          <p>
            These are configured endpoint grants. Lofty checks the authorizing
            account’s actual permissions on every request.
          </p>
          <ul className="crm-capabilities">
            {allCapabilities.map((cap) => (
              <li key={cap}>
                <span>{capabilityLabels[cap]}</span>
                <Badge>
                  {state.connection.capabilities.includes(cap)
                    ? "Configured"
                    : "Not enabled"}
                </Badge>
              </li>
            ))}
          </ul>
          <p>
            Broader listing inventory, separate calendars, communication
            sending, and assignment changes are outside this pilot. Property
            details linked to an imported lead can appear in context.
          </p>
        </details>
      </section>
      <div className="crm-workspace-grid">
        <aside className="crm-card crm-leads">
          <h2>Your assigned leads</h2>
          <label className="crm-search">
            Find a lead
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or Lofty ID"
            />
          </label>
          {!filtered.length ? (
            <p className="crm-muted">
              {connected
                ? "Refresh your assigned leads to populate this list."
                : "Your real CRM records will appear after an authorized connection."}
            </p>
          ) : (
            <div className="crm-lead-list">
              {filtered.map((lead) => (
                <button
                  disabled={busy}
                  key={lead.id}
                  className={selected === lead.externalId ? "selected" : ""}
                  onClick={() => setSelected(lead.externalId)}
                >
                  <strong>{leadName(lead.data)}</strong>
                  <span>
                    {String(lead.data.stage || "No pipeline stage provided")}
                  </span>
                  <small>Lofty · {lead.externalId}</small>
                </button>
              ))}
            </div>
          )}
          {state.moreLeads && (
            <p className="crm-footnote">
              Showing the first 250 imported leads. Use the exact Lofty lead ID
              below to open another assigned record.
            </p>
          )}
          <form
            className="crm-actions"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const id = String(form.get("leadId") || "");
              if (
                /^[1-9]\d{0,18}$/.test(id) &&
                (await act(
                  { action: "refresh", leadId: id },
                  "Lead context refreshed.",
                ))
              )
                setSelected(id);
            }}
          >
            <label>
              Open by Lofty lead ID
              <input
                name="leadId"
                inputMode="numeric"
                pattern="[1-9][0-9]{0,18}"
                required
                disabled={!connected || busy}
              />
            </label>
            <button className="button secondary" disabled={!connected || busy}>
              Open
            </button>
          </form>
        </aside>
        <div className="crm-detail-stack">
          {!selected ? (
            <section className="crm-card crm-empty">
              <ShieldCheck size={32} />
              <h2>One relationship. One shared context.</h2>
              <p>
                Select a lead to refresh authorized CRM history, prepare work
                with your five AI Employees, and review proposed updates.
              </p>
              <p className="crm-footnote">
                The sample workspace and real pilot are stored separately.
              </p>
            </section>
          ) : (
            <>
              <section className="crm-card">
                <div className="crm-section-heading">
                  <div>
                    <span className="eyebrow">CRM SOURCE CONTEXT</span>
                    <h2>
                      {leadName(
                        context?.sources.find((s) => s.kind === "lead")?.data ||
                          {},
                      )}
                    </h2>
                    <p>Lofty lead {selected}</p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        { action: "refresh", leadId: selected },
                        "Context refreshed. Review any partial-result notices.",
                      )
                    }
                  >
                    <RefreshCw size={16} />
                    Refresh context
                  </button>
                </div>
                {!context ? (
                  <p>Loading your authorized context…</p>
                ) : (
                  <>
                    <p className="crm-footnote">
                      Read-only projections · Source timestamps are shown when
                      Lofty supplies an unambiguous time. Missing history does
                      not mean no contact occurred.
                    </p>
                    {context.syncError && (
                      <p className="crm-warning">
                        {explain(context.syncError)}
                      </p>
                    )}
                    <div className="crm-source-list">
                      {context.sources.map((source) => (
                        <details key={`${source.kind}:${source.externalId}`}>
                          <summary>
                            <span>
                              <strong>
                                {source.kind === "lead"
                                  ? "Contact & property details"
                                  : String(
                                      source.data.content ||
                                        source.data.transactionName ||
                                        source.data.emailSubject ||
                                        source.data.note ||
                                        source.data.channel ||
                                        source.kind,
                                    ).slice(0, 110)}
                              </strong>
                              <small>
                                {source.kind} · {source.externalId} · fetched{" "}
                                {formatDate(source.observedAt)}
                              </small>
                            </span>
                            <Badge>
                              {source.freshness === "recently_fetched"
                                ? "Recently fetched"
                                : source.freshness}
                            </Badge>
                          </summary>
                          <dl className="crm-source-fields">
                            {Object.entries(source.data).map(([key, value]) => (
                              <div key={key}>
                                <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                                <dd>
                                  {typeof value === "object"
                                    ? JSON.stringify(value)
                                    : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <p className="crm-footnote">
                            Provider update:{" "}
                            {formatDate(source.sourceUpdatedAt)} · CRM is the
                            source of truth.
                          </p>
                        </details>
                      ))}
                    </div>
                    {context.reviewedIntelligence.length > 0 && (
                      <div className="crm-intelligence">
                        <h3>Reviewed AgentDesk intelligence</h3>
                        {context.reviewedIntelligence.map((f) => (
                          <p
                            key={f.id}
                            className={
                              f.status === "superseded" ? "crm-muted" : ""
                            }
                          >
                            <Badge>
                              {f.status} · {f.certainty}
                            </Badge>{" "}
                            {f.value}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
              <section className="crm-card">
                <span className="eyebrow">YOUR FIVE AI EMPLOYEES</span>
                <h2>Prepare the next useful step</h2>
                <p>
                  Draft a follow-up, identify open work, and review new
                  observations against the same CRM context.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    workRequest.current ??= crypto.randomUUID();
                    if (
                      await act(
                        {
                          action: "prepare",
                          leadId: selected,
                          transcript,
                          requestId: workRequest.current,
                        },
                        "AI work prepared for review.",
                      )
                    )
                      workRequest.current = null;
                  }}
                >
                  <label>
                    New conversation notes{" "}
                    <span className="crm-muted">(optional)</span>
                    <textarea
                      rows={4}
                      maxLength={16000}
                      value={transcript}
                      onChange={(e) => {
                        setTranscript(e.target.value);
                        workRequest.current = null;
                      }}
                      placeholder="Add an authorized conversation or a new confirmation. Do not include unrelated personal information."
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={busy || !context || !state.aiEnabled}
                  >
                    {busy ? "Working…" : "Prepare AI work"}
                  </button>
                </form>
                {!state.aiEnabled && (
                  <p className="crm-footnote">
                    CRM AI drafting is awaiting brokerage setup. No CRM context
                    is sent to the AI provider until enabled.
                  </p>
                )}
                {work.map((w) => (
                  <article className="crm-work-product" key={w.id}>
                    <div className="crm-section-heading">
                      <h3>Work package · {formatDate(w.createdAt)}</h3>
                      <Badge>{statusNames[w.status] || w.status}</Badge>
                    </div>
                    {w.errorCode && (
                      <p className="crm-warning">{explain(w.errorCode)}</p>
                    )}
                    {w.content && (
                      <>
                        <p>{w.content.summary}</p>
                        {w.content.warnings.map((warning, i) => (
                          <p className="crm-warning" key={i}>
                            {warning}
                          </p>
                        ))}
                        <div className="crm-employee-grid">
                          {w.content.employees.map((employee) => (
                            <details key={employee.employee}>
                              <summary>{employee.employee}</summary>
                              <p>{employee.recommendation}</p>
                              {employee.evidence.map((e, i) => (
                                <blockquote key={i}>
                                  {e.quote}
                                  <cite>{e.source}</cite>
                                </blockquote>
                              ))}
                            </details>
                          ))}
                        </div>
                        {w.content.messageDraft && (
                          <MessageReview
                            key={w.id + String(Boolean(w.reviewedMessage))}
                            workId={w.id}
                            original={w.content.messageDraft}
                            approved={w.reviewedMessage?.body}
                            disabled={busy || w.status !== "ready"}
                            onReview={async (workId, body) =>
                              Boolean(
                                await act(
                                  { action: "review_message", workId, body },
                                  "Message draft approved for copying. Nothing was sent.",
                                ),
                              )
                            }
                            notify={(message, error) =>
                              error ? setError(message) : setNotice(message)
                            }
                          />
                        )}
                        {w.content.noteDraft && (
                          <div className="crm-draft">
                            <h4>Proposed CRM note</h4>
                            <p>{w.content.noteDraft}</p>
                            <button
                              className="button secondary"
                              disabled={busy || w.status !== "ready"}
                              onClick={() => {
                                setOperation("notes.create");
                                setContent(w.content!.noteDraft);
                                writeRequest.current = null;
                                document
                                  .getElementById("crm-write-form")
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                              }}
                            >
                              Review this note below
                            </button>
                          </div>
                        )}
                        {w.content.observations.map((o, i) => (
                          <div className="crm-observation" key={i}>
                            <span className="eyebrow">
                              {o.key} · {o.certainty}
                            </span>
                            <p>{o.value}</p>
                            <blockquote>{o.evidence.quote}</blockquote>
                            <div className="crm-actions">
                              <button
                                className="button secondary"
                                disabled={busy || w.status !== "ready"}
                                onClick={() =>
                                  act(
                                    {
                                      action: "fact",
                                      workId: w.id,
                                      candidate: i,
                                      replaceExisting: false,
                                    },
                                    "Observation saved to AgentDesk intelligence.",
                                  )
                                }
                              >
                                Save reviewed observation
                              </button>
                              {o.certainty === "confirmed" && (
                                <button
                                  className="button secondary"
                                  disabled={busy || w.status !== "ready"}
                                  onClick={() =>
                                    act(
                                      {
                                        action: "fact",
                                        workId: w.id,
                                        candidate: i,
                                        replaceExisting: true,
                                      },
                                      "Confirmed plan saved; previous plan marked as superseded.",
                                    )
                                  }
                                >
                                  Confirm this replaces the earlier plan
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </article>
                ))}
              </section>
              <section className="crm-card" id="crm-write-form">
                <span className="eyebrow">HUMAN APPROVAL REQUIRED</span>
                <h2>Propose a CRM update</h2>
                <p>
                  Save a proposal, approve its exact content, then submit it.
                  AgentDesk checks the record again before writing.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    writeRequest.current ??= crypto.randomUUID();
                    const target = tasks.find((t) => t.externalId === taskId);
                    const proposal = {
                      operation,
                      leadId: selected,
                      content,
                      ...(operation === "tasks.update"
                        ? { targetId: taskId, expectedHash: target?.hash }
                        : {}),
                      ...(operation !== "notes.create" && due
                        ? { endAt: new Date(due).toISOString() }
                        : {}),
                    };
                    if (
                      await act(
                        {
                          action: "propose",
                          proposal,
                          requestId: writeRequest.current,
                        },
                        "Proposal saved. Review and approve it below.",
                      )
                    ) {
                      setContent("");
                      writeRequest.current = null;
                    }
                  }}
                >
                  <div className="crm-form-grid">
                    <label>
                      Operation
                      <select
                        value={operation}
                        onChange={(e) => {
                          setOperation(e.target.value);
                          writeRequest.current = null;
                        }}
                      >
                        <option value="notes.create">Create a note</option>
                        <option value="tasks.create">Create a task</option>
                        <option value="tasks.update">Update a task</option>
                      </select>
                    </label>
                    {operation === "tasks.update" && (
                      <label>
                        Existing task
                        <select
                          value={taskId}
                          required
                          onChange={(e) => {
                            setTaskId(e.target.value);
                            writeRequest.current = null;
                          }}
                        >
                          <option value="">Choose a task</option>
                          {tasks.map((t) => (
                            <option key={t.externalId} value={t.externalId}>
                              {String(t.data.content || t.externalId)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {operation !== "notes.create" && (
                      <label>
                        Deadline ·{" "}
                        {Intl.DateTimeFormat().resolvedOptions().timeZone}
                        <input
                          type="datetime-local"
                          value={due}
                          required={operation === "tasks.create"}
                          onChange={(e) => {
                            setDue(e.target.value);
                            writeRequest.current = null;
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <label>
                    {operation === "notes.create"
                      ? "Exact note to create"
                      : "Task description"}
                    <textarea
                      rows={4}
                      required
                      maxLength={operation === "notes.create" ? 2000 : 1000}
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        writeRequest.current = null;
                      }}
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !context ||
                      !state.connection.capabilities.includes(
                        operation as keyof typeof capabilityLabels,
                      )
                    }
                  >
                    Save proposal for review
                  </button>
                </form>
              </section>
            </>
          )}
        </div>
      </div>
      <section className="crm-card">
        <div className="crm-section-heading">
          <div>
            <span className="eyebrow">ACCOUNTABILITY</span>
            <h2>Approval & execution history</h2>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => load().catch((e) => setError(e.message))}
          >
            Refresh status
          </button>
        </div>
        <p className="crm-footnote">
          “Submitted” means Lofty returned an ID. “Confirmed in Lofty” requires
          a separate read of matching content. Unknown outcomes are never
          automatically resent.
        </p>
        {!state.execution.length ? (
          <p className="crm-muted">
            Your reviewed CRM actions will appear here.
          </p>
        ) : (
          <div className="crm-execution-list">
            {state.execution.map((write) => (
              <article key={write.id}>
                <div className="crm-section-heading">
                  <strong>{capabilityLabels[write.proposal.operation]}</strong>
                  <Badge>{statusNames[write.status] || write.status}</Badge>
                </div>
                <p className="crm-preserve">{write.proposal.content}</p>
                <p className="crm-footnote">
                  Lead {write.proposal.leadId}
                  {write.proposal.targetId
                    ? ` · Task ${write.proposal.targetId}`
                    : ""}
                  {write.proposal.endAt
                    ? ` · Deadline ${formatDate(write.proposal.endAt)}`
                    : ""}{" "}
                  · Proposed {formatDate(write.createdAt)}
                </p>
                {write.approvedAt && (
                  <p className="crm-footnote">
                    Approved by member {write.approvedBy} ·{" "}
                    {formatDate(write.approvedAt)}
                  </p>
                )}
                {write.providerResultId && (
                  <p className="crm-footnote">
                    Lofty result ID {write.providerResultId} · Confirmed{" "}
                    {formatDate(write.confirmedAt)}
                  </p>
                )}
                {write.errorCode && (
                  <p className="crm-warning">{explain(write.errorCode)}</p>
                )}
                {["submitting", "outcome_unknown"].includes(write.status) && (
                  <p className="crm-warning">
                    Check Lofty and the audit record before preparing another
                    action. Automatic retries are blocked to avoid duplicates.
                  </p>
                )}
                <div className="crm-actions">
                  {write.status === "proposed" && (
                    <>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            {
                              action: "review",
                              writeId: write.id,
                              approve: true,
                            },
                            "Approved.",
                          )
                        }
                      >
                        Approve exact update
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            {
                              action: "review",
                              writeId: write.id,
                              approve: false,
                            },
                            "Rejected.",
                          )
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {write.status === "approved" && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        act(
                          { action: "execute", writeId: write.id },
                          "Submission status saved.",
                        )
                      }
                    >
                      Submit approved update to Lofty
                    </button>
                  )}
                  {write.status === "submitted" && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        act(
                          { action: "confirm", writeId: write.id },
                          "Confirmation checked.",
                        )
                      }
                    >
                      Check Lofty confirmation
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="crm-bottom-grid">
        <section className="crm-card">
          <h2>Refresh history</h2>
          {state.history.length ? (
            state.history.map((run) => (
              <div className="crm-history-row" key={run.id}>
                <div>
                  <strong>
                    {run.status} · {run.count} records
                  </strong>
                  <small>
                    {formatDate(run.startedAt)} · {run.detail}
                  </small>
                  {run.errorCode && (
                    <p className="crm-warning">{explain(run.errorCode)}</p>
                  )}
                </div>
                <Badge>{run.status}</Badge>
              </div>
            ))
          ) : (
            <p className="crm-muted">No CRM refresh has run yet.</p>
          )}
        </section>
        <section className="crm-card">
          <h2>
            {state.actor.role === "leader"
              ? "Team connection health"
              : "Connection audit"}
          </h2>
          {state.actor.role === "leader" &&
            state.team.map((member) => (
              <div className="crm-history-row" key={member.label}>
                <strong>{member.label}</strong>
                <span>
                  {statusNames[member.status || "disconnected"] ||
                    member.status}
                </span>
              </div>
            ))}
          <details className="crm-checklist">
            <summary>Recent audit events</summary>
            {state.audit.map((event) => (
              <p className="crm-footnote" key={event.id}>
                {formatDate(event.at)} · {event.kind.replace(/_/g, " ")}
              </p>
            ))}
          </details>
          <p className="crm-footnote">
            Each agent authorizes their own account. A team leader can see
            connection health within their brokerage; this does not grant access
            to another agent’s private CRM content.
          </p>
        </section>
      </div>
    </>
  );
}
