"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Lightbulb,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Badge } from "../ui";
import {
  preferenceOptions,
  labels,
  PHOTO_GUIDANCE,
  type PreferenceKey,
  type Values,
} from "@/lib/workstyle/types";
import type { WorkstyleState } from "@/lib/workstyle/service";
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401)
    window.location.assign(url.startsWith("/api/pilot/") ? "/pilot" : "/login");
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "Could not load workstyle. Please refresh.",
    );
  return result;
}
type Notify = (message: string, tone?: "info" | "success" | "error") => void;
export function Workstyle({
  agentId,
  endpoint,
  notify,
  onChanged,
}: {
  agentId?: string;
  endpoint?: string;
  notify: Notify;
  onChanged?: () => Promise<void>;
}) {
  const url = endpoint || `/api/agents/${agentId}/workstyle`;
  const [data, setData] = useState<WorkstyleState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<"suggestions" | "preferences" | "history">(
      "suggestions",
    ),
    [custom, setCustom] = useState<string | null>(null),
    [choices, setChoices] = useState<Values>({}),
    [preview, setPreview] = useState(false);
  const submitting = useRef(false);
  const load = useCallback(async () => {
    try {
      setData(await request<WorkstyleState>(url));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  const act = async (body: Record<string, unknown>) => {
    if (!data || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      setData(
        await request<WorkstyleState>(url, "POST", {
          ...body,
          revision: data.revision,
        }),
      );
      setCustom(null);
      await onChanged?.();
      notify(
        body.action === "suggestion" && body.decision === "dismiss"
          ? "Suggestion dismissed. It will not be suggested again."
          : body.action === "undo"
            ? "Preference change undone."
            : "Workstyle updated.",
        "success",
      );
    } catch (e) {
      notify((e as Error).message, "error");
      await load();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  if (error)
    return (
      <div className="workstyle-error" role="alert">
        {error}
        <button className="text-link" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  if (!data)
    return (
      <p className="workstyle-loading">
        <LoaderCircle size={15} className="spin" /> Loading workstyle…
      </p>
    );
  const pending = data.suggestions.filter((s) => s.status === "pending"),
    past = data.suggestions.filter((s) =>
      ["dismissed", "accepted", "undone"].includes(s.status),
    );
  const previewShort = data.context.values.followupLength === "concise",
    previewGreeting = data.context.values.followupGreeting !== "none";
  return (
    <section className="workstyle" aria-label="Agent Workstyle">
      <div className="workstyle-heading">
        <span className="workstyle-mark">
          <SlidersHorizontal size={21} />
        </span>
        <div>
          <h3>Agent Workstyle</h3>
          <p>Small improvements. Always your choice.</p>
        </div>
        <Badge>{data.sample ? "Fictional sample" : "Private to you"}</Badge>
      </div>
      <p className="settings-description">
        Your approved preferences shape new drafts. Learning never changes
        settings, trains a model, or sends anything on its own.
      </p>
      <div className="workstyle-learning">
        <div>
          <strong>Suggest improvements from my reviews</strong>
          <p>
            {data.enabled
              ? "Repeated patterns can become suggestions. Your acceptance is required."
              : "New behavioral examples are not collected. Existing preferences still apply."}
          </p>
        </div>
        <button
          className={`toggle ${data.enabled ? "on" : ""}`}
          role="switch"
          aria-label="Behavioral preference suggestions"
          aria-checked={data.enabled}
          disabled={busy}
          onClick={() =>
            void act({ action: "learning", enabled: !data.enabled })
          }
        >
          <span />
        </button>
      </div>
      <nav className="workstyle-tabs" aria-label="Workstyle sections">
        {(["suggestions", "preferences", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
          >
            {t === "suggestions"
              ? `Suggestions${data.enabled && pending.length ? ` · ${pending.length}` : ""}`
              : t === "preferences"
                ? "Current preferences"
                : "Recent changes"}
          </button>
        ))}
      </nav>
      {tab === "suggestions" && (
        <div className="workstyle-stack">
          {!data.enabled ? (
            <div className="workstyle-empty">
              <ShieldCheck size={24} />
              <h4>You're in control.</h4>
              <p>
                Suggestions are paused. Configure preferences directly, or
                enable suggestions when you're ready.
              </p>
            </div>
          ) : pending.length === 0 ? (
            <div className="workstyle-empty">
              <Lightbulb size={24} />
              <h4>No pattern to suggest yet.</h4>
              <p>
                Suggestions need at least four consistent examples across
                different contexts. A single edit is never enough.
              </p>
            </div>
          ) : (
            pending.map((s) => {
              const examples = data.evidence.filter((e) =>
                s.evidenceIds.includes(e.id),
              );
              return (
                <article className="workstyle-suggestion" key={s.id}>
                  <div className="workstyle-kicker">
                    <Sparkles size={14} />
                    {s.rule === "followup_style"
                      ? "Relationship Assistant"
                      : s.rule === "seller_checklist"
                        ? "Listing Coordinator"
                        : "Daily Coordinator"}
                    <Badge>{s.supporting} supporting examples</Badge>
                  </div>
                  <h4>{s.title}</h4>
                  <p>{s.why}</p>
                  <div className="workstyle-proposal">
                    {Object.entries(s.proposed).map(([key, value]) => (
                      <div key={key}>
                        <span>
                          {preferenceOptions[key as PreferenceKey].label}
                        </span>
                        <strong>{labels[value!] || value}</strong>
                      </div>
                    ))}
                  </div>
                  {s.rule === "seller_checklist" && (
                    <blockquote>{PHOTO_GUIDANCE}</blockquote>
                  )}
                  <p className="workstyle-effect">
                    <strong>What changes</strong> {s.effect}
                  </p>
                  <details className="workstyle-evidence">
                    <summary>
                      See the recorded examples <ChevronRight size={14} />
                    </summary>
                    <p>
                      {data.sample
                        ? "Saved fictional review examples for this demonstration. These are not real employee activity or live AI output."
                        : "Your own recorded actions. Excerpts are bounded; a pattern is a suggestion, not proof of intent."}
                    </p>
                    {examples.map((e, i) => (
                      <div className="workstyle-example" key={e.id}>
                        <span>
                          Example {i + 1} ·{" "}
                          {new Date(e.recordedAt).toLocaleDateString()}{" "}
                          {e.fictional ? "· Fictional" : ""}
                        </span>
                        <div>
                          <strong>Prepared excerpt</strong>
                          <p>{e.before}</p>
                        </div>
                        <div>
                          <strong>Approved / requested excerpt</strong>
                          <p>{e.after}</p>
                        </div>
                      </div>
                    ))}
                  </details>
                  {custom === s.id && (
                    <fieldset className="workstyle-custom" disabled={busy}>
                      <legend>Make this preference yours</legend>
                      {Object.keys(s.proposed).map((key) => {
                        const k = key as PreferenceKey;
                        return (
                          <label key={k}>
                            {preferenceOptions[k].label}
                            <select
                              value={choices[k]}
                              onChange={(e) =>
                                setChoices({ ...choices, [k]: e.target.value })
                              }
                            >
                              {preferenceOptions[k].values.map((v) => (
                                <option key={v} value={v}>
                                  {labels[v]}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                  <div className="workstyle-actions">
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: "suggestion",
                          id: s.id,
                          decision: "accept",
                          values: custom === s.id ? choices : s.proposed,
                        })
                      }
                    >
                      <Check size={14} />
                      {custom === s.id
                        ? "Use customized preference"
                        : "Use this preference"}
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setCustom(custom === s.id ? null : s.id);
                        setChoices(s.proposed);
                      }}
                    >
                      Customize
                    </button>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: "suggestion",
                          id: s.id,
                          decision: "dismiss",
                        })
                      }
                    >
                      Not now · dismiss
                    </button>
                  </div>
                </article>
              );
            })
          )}
          {data.sample && agentId === "jordan" && (
            <div className="workstyle-demo">
              <div className="workstyle-kicker">Fictional demonstration</div>
              <h4>See what the preference changes</h4>
              <p>
                This saved comparison follows Jordan's current choices. It is
                not a live AI generation and makes no change to Sarah's records.
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setPreview(true)}
              >
                Preview saved comparison
              </button>
              {preview && (
                <div className="workstyle-comparison">
                  <div>
                    <strong>Before personalization · saved</strong>
                    <p>
                      Dear Sarah, I wanted to follow up regarding your
                      preparation checklist. When you have a moment, please let
                      me know which items you would like to review together. We
                      can discuss your questions before moving ahead.
                    </p>
                  </div>
                  <div>
                    <strong>With current preferences · saved</strong>
                    <p>
                      {previewGreeting ? "Hi Sarah, " : ""}
                      {previewShort
                        ? "Which preparation checklist items would you like to review together?"
                        : "I wanted to follow up on your preparation checklist. Let me know which items you would like to review, and we can discuss your questions together."}
                    </p>
                    <span>
                      {previewShort
                        ? "Concise follow-up preference applied."
                        : "Standard length; accept or configure a preference to compare."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {tab === "preferences" && (
        <div className="workstyle-stack">
          <p className="settings-description">
            These are scoped choices on top of your existing communication
            style. Remove a choice to return to the baseline. Changes apply to
            future work, not approved documents.
          </p>
          {Object.entries(preferenceOptions)
            .filter(([key]) => data.sample || key !== "briefingShortcut")
            .map(([key, definition]) => {
              const k = key as PreferenceKey,
                p = data.preferences[k],
                mandatory = data.context.mandatory[k];
              return (
                <div className="workstyle-preference" key={k}>
                  <div>
                    <span className="workstyle-kicker">{definition.area}</span>
                    <label htmlFor={`workstyle-${agentId || "pilot"}-${k}`}>
                      {definition.label}
                    </label>
                    <p>{definition.scope}</p>
                    {p && (
                      <small>
                        {p.source === "configured"
                          ? "Manually configured"
                          : "Accepted suggestion"}{" "}
                        · {new Date(p.updatedAt).toLocaleString()}
                      </small>
                    )}
                    {mandatory && <small>Required brokerage standard</small>}
                  </div>
                  <select
                    id={`workstyle-${agentId || "pilot"}-${k}`}
                    value={mandatory || p?.value || ""}
                    disabled={busy || Boolean(mandatory)}
                    onChange={(e) =>
                      void act({
                        action: "configure",
                        values: { [k]: e.target.value || null },
                      })
                    }
                  >
                    <option value="">Use baseline</option>
                    {definition.values.map((v) => (
                      <option value={v} key={v}>
                        {labels[v]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          <div className="workstyle-standards">
            <ShieldCheck size={17} />
            <div>
              <strong>Brokerage standards stay separate</strong>
              {data.context.requirements.map((r, i) => (
                <p key={i}>{r}</p>
              ))}
              <p>
                Individual behavior never becomes team policy. Client-specific
                facts and communication requests remain in the client record.
              </p>
            </div>
          </div>
        </div>
      )}
      {tab === "history" && (
        <div className="workstyle-stack">
          {data.history.length === 0 ? (
            <p className="settings-description">
              Accepted and manually configured changes will appear here.
            </p>
          ) : (
            data.history.map((h) => {
              const changed = Object.keys({ ...h.before, ...h.after }).filter(
                (k) =>
                  JSON.stringify(h.before[k as PreferenceKey]) !==
                  JSON.stringify(h.after[k as PreferenceKey]),
              );
              return (
                <div className="workstyle-history" key={h.id}>
                  <div>
                    <strong>{h.kind.replaceAll("_", " ")}</strong>
                    <p>
                      {new Date(h.createdAt).toLocaleString()}
                      {h.undone ? " · Undone" : ""}
                    </p>
                    {changed.map((k) => (
                      <p key={k}>
                        {preferenceOptions[k as PreferenceKey].label}:{" "}
                        {h.after[k as PreferenceKey]
                          ? labels[h.after[k as PreferenceKey]!.value]
                          : "Baseline"}
                      </p>
                    ))}
                  </div>
                  {changed.length > 0 && !h.undone && h.kind !== "undo" && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => void act({ action: "undo", id: h.id })}
                    >
                      <RotateCcw size={14} />
                      Undo
                    </button>
                  )}
                </div>
              );
            })
          )}
          <details className="workstyle-evidence">
            <summary>Previous suggestion decisions · {past.length}</summary>
            {past.map((s) => (
              <div className="workstyle-history" key={s.id}>
                <span>{s.title}</span>
                <Badge>{s.status}</Badge>
              </div>
            ))}
          </details>
          <details className="workstyle-evidence">
            <summary>Stored examples & privacy</summary>
            <p>
              Only recorded AgentDesk reviews and preparation requests are
              considered. CRM-origin activity is not mined for behavior. Only
              your own AgentDesk draft reviews can contribute examples. At most
              100 bounded examples are retained per profile. Clear examples to
              remove their text; approved preferences and dismissed decisions
              remain.
            </p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void act({ action: "forget" })}
            >
              Clear stored examples
            </button>
          </details>
        </div>
      )}
      {busy && (
        <span className="workstyle-saving" role="status">
          <LoaderCircle size={14} className="spin" /> Saving…
        </span>
      )}
    </section>
  );
}
