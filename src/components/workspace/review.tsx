"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Plus,
  ChevronDown,
  CheckCheck,
  CalendarDays,
  SlidersHorizontal,
  ShieldCheck,
  LoaderCircle,
  AlertCircle,
  AudioLines,
} from "lucide-react";
import type {
  WorkspaceData,
  Agent,
  ProposedAction,
  ReviewInput,
  Decision,
} from "@/lib/types";
import { AssistantIcon, AutoTextarea, Badge, Empty, shortDate } from "../ui";
import { request } from "./client-api";
import { reviewEffect, selectedReviewDecisions } from "./review-helpers";
import { ChangePreview } from "./intelligence";
import { WorkProducts } from "./work-products";
import { MessageActions } from "./message-actions";

export function Review({
  data,
  agent,
  selected,
  setSelected,
  onCapture,
  onUpdate,
  notify,
  onProperty,
}: {
  data: WorkspaceData;
  agent: Agent;
  selected: string | null;
  setSelected: (id: string) => void;
  onCapture: () => void;
  onUpdate: (data: WorkspaceData) => void;
  notify: (s: string, tone?: "info" | "success" | "error") => void;
  onProperty: (id: string) => void;
}) {
  const [tab, setTab] = useState<"pending" | "reviewed">(
      data.packages.find((p) => p.id === selected)?.status || "pending",
    ),
    [edits, setEdits] = useState<Record<string, string>>({}),
    [dates, setDates] = useState<Record<string, string>>({}),
    [decisions, setDecisions] = useState<Record<string, Decision>>({}),
    [busy, setBusy] = useState(false),
    [rewriting, setRewriting] = useState("");
  const [showSource, setShowSource] = useState(false);
  const saving = useRef(false);
  const packageStrip = useRef<HTMLDivElement>(null);
  const drafts = useRef<
    Record<
      string,
      {
        edits: Record<string, string>;
        dates: Record<string, string>;
        decisions: Record<string, Decision>;
      }
    >
  >({});
  const activeDraft = useRef<string | null>(null);
  const agentPackages = data.packages.filter((p) => p.agentId === agent.id);
  const list = agentPackages.filter((p) => p.status === tab);
  const pkg = list.find((p) => p.id === selected) || list[0];
  const conversation = data.conversations.find(
    (c) => c.id === pkg?.conversationId,
  );
  const client = data.clients.find((c) => c.id === pkg?.clientId);
  const property = data.properties.find((p) => p.id === pkg?.propertyId);
  const pending = pkg?.actions.filter((a) => a.status === "pending") || [];
  const chosen = selectedReviewDecisions(pending, decisions, edits, dates);
  const approved = chosen.filter((a) => a.status === "approved");
  const rejected = chosen.filter((a) => a.status === "rejected");
  const remaining = pending.length - chosen.length;
  const completedReviewTasks =
    pkg && chosen.length > 0 && remaining === 0
      ? data.tasks.filter(
          (task) => task.status === "open" && task.reviewPackageId === pkg.id,
        )
      : [];
  const locked = busy || !!rewriting;
  useEffect(() => {
    if (activeDraft.current)
      drafts.current[activeDraft.current] = { edits, dates, decisions };
    activeDraft.current = pkg?.id || null;
    const draft = pkg ? drafts.current[pkg.id] : undefined;
    setEdits(draft?.edits || {});
    setDecisions(draft?.decisions || {});
    setDates(draft?.dates || {});
  }, [pkg?.id]);
  useEffect(() => {
    const target = agentPackages.find((p) => p.id === selected);
    if (target) setTab(target.status);
  }, [selected, agent.id, data.packages]);
  useEffect(() => {
    const strip = packageStrip.current;
    const selectedButton = strip?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (!strip || !selectedButton) return;
    const item = selectedButton.getBoundingClientRect();
    const bounds = strip.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right)
      strip.scrollLeft += item.right - bounds.right;
  }, [pkg?.id]);
  const save = async () => {
    if (!pkg || !chosen.length || saving.current || rewriting) return;
    saving.current = true;
    setBusy(true);
    try {
      const input: ReviewInput = { decisions: chosen };
      const updated = await request<WorkspaceData>(
        `/api/packages/${pkg.id}/review`,
        "POST",
        input,
      );
      onUpdate(updated);
      setDecisions({});
      notify(
        remaining
          ? `Decisions saved. ${remaining} ${remaining === 1 ? "action remains" : "actions remain"} pending. No messages were sent.`
          : "Review saved. Approved work is now in your workspace. No messages were sent.",
      );
      setTab(
        updated.packages.find((p) => p.id === pkg.id)?.status || "pending",
      );
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const rewrite = async (action: ProposedAction, instruction: string) => {
    if (!pkg || locked) return;
    setRewriting(`${action.id}:${instruction}`);
    try {
      const res = await request<{ body: string }>(
        `/api/packages/${pkg.id}/rewrite`,
        "POST",
        {
          actionId: action.id,
          instruction,
          text: edits[action.id] ?? action.body,
        },
      );
      setEdits((v) => ({ ...v, [action.id]: res.body }));
      notify("Draft refined. Review the wording before approving.");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setRewriting("");
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE HUMAN IN THE LOOP</div>
          <h1>
            A thoughtful second look<span className="heading-dot">.</span>
          </h1>
          <p>Your workforce prepares. You make it yours.</p>
        </div>
        <button
          className="button primary"
          onClick={onCapture}
          disabled={locked}
        >
          <Plus size={17} />
          New conversation
        </button>
      </div>
      <div className="review-toolbar">
        <div className="underline-tabs">
          <button
            className={tab === "pending" ? "active" : ""}
            disabled={locked}
            onClick={() => setTab("pending")}
          >
            Needs your review{" "}
            <span>
              {agentPackages.filter((p) => p.status === "pending").length}
            </span>
          </button>
          <button
            className={tab === "reviewed" ? "active" : ""}
            disabled={locked}
            onClick={() => setTab("reviewed")}
          >
            Reviewed{" "}
            <span>
              {agentPackages.filter((p) => p.status === "reviewed").length}
            </span>
          </button>
        </div>
        <span className="muted small-text">
          <ShieldCheck size={14} />
          Nothing happens without your approval
        </span>
      </div>
      {!pkg ? (
        <Empty
          kind={tab === "pending" ? "complete" : "empty"}
          title={
            tab === "pending"
              ? "A clear desk. A clear head."
              : "Your decisions will live here."
          }
          description={
            tab === "pending"
              ? "All prepared work has been reviewed. Add a conversation to get started."
              : "Approve or reject a work package to see its history."
          }
        />
      ) : (
        <>
          <div className="package-selector" ref={packageStrip}>
            {list.map((p) => (
              <button
                key={p.id}
                aria-pressed={p.id === pkg.id}
                onClick={() => setSelected(p.id)}
                disabled={locked}
                className={p.id === pkg.id ? "selected" : ""}
              >
                <AssistantIcon index={1} small />
                <span>
                  <strong>
                    {data.clients.find((c) => c.id === p.clientId)?.name}
                  </strong>
                  <small>{p.title}</small>
                </span>
                <span className="package-count">{p.actions.length}</span>
              </button>
            ))}
          </div>
          <div className="review-summary">
            <div>
              <strong>
                {client?.name} ·{" "}
                {pending.length
                  ? `${pending.length} ${pending.length === 1 ? "decision" : "decisions"} remaining`
                  : "Review complete"}
              </strong>
              <p>{pkg.summary}</p>
            </div>
            <button
              className="button secondary source-toggle"
              aria-expanded={showSource}
              onClick={() => setShowSource(!showSource)}
            >
              {showSource
                ? "Hide conversation"
                : "View conversation & evidence"}
            </button>
          </div>
          <div
            className={`review-workspace ${showSource ? "show-source" : ""}`}
          >
            <section className="source-panel">
              <div className="panel-eyebrow">
                <AudioLines size={17} />
                THE CONVERSATION
                <Badge>
                  {pkg.origin === "sample"
                    ? "Saved sample"
                    : pkg.origin === "human"
                      ? "Human correction"
                      : "Live AI result"}
                </Badge>
              </div>
              <div className="source-title">
                <h2>{pkg.title}</h2>
                <p>
                  {shortDate(pkg.createdAt)} · {client?.name} ·{" "}
                  {conversation?.source === "audio"
                    ? "Authorized audio"
                    : conversation?.source === "followup"
                      ? "Recorded relationship context"
                      : "Conversation notes"}
                </p>
              </div>
              {property && (
                <button
                  className="source-property"
                  onClick={() => onProperty(property.id)}
                >
                  <img src={property.image} alt="" />
                  <span>
                    <strong>{property.address}</strong>
                    <small>{property.city}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              )}
              <h3 className="small-heading">Original source</h3>
              <div className="transcript">
                {conversation?.transcript
                  .split("\n")
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
              </div>
              <h3 className="small-heading facts-heading">What we know</h3>
              <div className="facts-list">
                {pkg.facts.map((f, i) => (
                  <div key={i}>
                    <Badge
                      tone={
                        f.certainty === "confirmed"
                          ? "green"
                          : f.certainty === "requested"
                            ? "blue"
                            : "amber"
                      }
                    >
                      {f.certainty}
                    </Badge>
                    <p>{f.text}</p>
                    <blockquote>“{f.sourceQuote}”</blockquote>
                  </div>
                ))}
              </div>
              {pkg.clarifications.length > 0 && (
                <div className="clarification">
                  <AlertCircle size={18} />
                  <div>
                    <h3>A little clarity needed</h3>
                    {pkg.clarifications.map((c, i) => (
                      <p key={i}>{c}</p>
                    ))}
                  </div>
                </div>
              )}
            </section>
            <section className="actions-panel">
              <div className="actions-intro">
                <div>
                  <span className="eyebrow">
                    ONE CONVERSATION. COORDINATED WORK.
                  </span>
                  <h2>Ready for your finishing touch</h2>
                </div>
                <div className="avatar-stack">
                  {[1, 2, 3].map((i) => (
                    <AssistantIcon key={i} index={i} small />
                  ))}
                </div>
              </div>
              <p className="actions-help">
                Choose Pending, Approved, or Rejected for each proposal. Only
                your explicit decisions are saved when you confirm. Pending
                edits stay unsaved until you decide.
              </p>
              {pending.length > 0 && (
                <button
                  className="text-link approve-all"
                  disabled={locked}
                  onClick={() =>
                    setDecisions(
                      Object.fromEntries(
                        pending.map((a) => [a.id, "approved"]),
                      ),
                    )
                  }
                >
                  <CheckCheck size={14} /> Approve all {pending.length} pending
                  proposals
                </button>
              )}
              <div className="action-cards">
                {pkg.actions.map((a) => {
                  const state =
                    a.status === "pending"
                      ? decisions[a.id] || "pending"
                      : a.status;
                  const role =
                    a.kind === "message"
                      ? 2
                      : a.kind === "task" || a.kind === "listing_update"
                        ? 3
                        : 1;
                  return (
                    <article
                      key={a.id}
                      className={`action-card ${state === "rejected" ? "rejected" : ""}`}
                    >
                      <div className="action-card-heading">
                        <AssistantIcon index={role} small />
                        <span>{a.kind.replace("_", " ")}</span>
                        {a.status === "pending" ? (
                          <select
                            className={`review-decision ${state}`}
                            aria-label={`Decision for ${a.title}`}
                            value={state}
                            disabled={locked}
                            onChange={(e) =>
                              setDecisions((d) => ({
                                ...d,
                                [a.id]: e.target.value as Decision,
                              }))
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        ) : (
                          <Badge
                            tone={a.status === "approved" ? "green" : "neutral"}
                          >
                            {a.status}
                          </Badge>
                        )}
                      </div>
                      <h3>{a.title}</h3>
                      <ChangePreview
                        data={data}
                        action={a}
                        pkg={pkg}
                        proposedBody={edits[a.id] ?? a.body}
                        proposedDate={dates[a.id] ?? a.dueDate}
                      />
                      {a.change && a.status === "pending" && (
                        <label
                          className="field-caption"
                          htmlFor={`edit-${a.id}`}
                        >
                          Edit proposed wording
                        </label>
                      )}
                      {a.status === "pending" ? (
                        <AutoTextarea
                          id={`edit-${a.id}`}
                          aria-label={`Edit ${a.title}`}
                          value={edits[a.id] ?? a.body}
                          maxLength={6000}
                          disabled={locked}
                          rows={
                            a.kind === "message"
                              ? 5
                              : a.kind === "crm_note"
                                ? 4
                                : 3
                          }
                          onChange={(e) =>
                            setEdits((v) => ({ ...v, [a.id]: e.target.value }))
                          }
                        />
                      ) : (
                        <p className="approved-content">{a.body}</p>
                      )}
                      {a.kind === "message" && (
                        <>
                          <div className="writing-tools">
                            {[
                              ["shorter", "Shorter"],
                              ["natural", "More natural"],
                              ["professional", "More professional"],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                title={
                                  !data.capabilities.ai
                                    ? "Configure an OpenAI key to refine with AI"
                                    : label
                                }
                                disabled={
                                  !data.capabilities.ai ||
                                  locked ||
                                  a.status !== "pending"
                                }
                                onClick={() => rewrite(a, value)}
                              >
                                {rewriting === `${a.id}:${value}` ? (
                                  <LoaderCircle size={12} className="spin" />
                                ) : (
                                  <SlidersHorizontal size={12} />
                                )}{" "}
                                {label}
                              </button>
                            ))}
                          </div>
                          <div className="draft-note">
                            <ShieldCheck size={12} />
                            {a.status === "approved"
                              ? "Approved draft · saved internally · not sent"
                              : "Draft only · approval will save it, not send it"}
                          </div>
                          {a.status === "approved" && (
                            <MessageActions body={a.body} notify={notify} />
                          )}
                        </>
                      )}
                      {(a.kind === "task" ||
                        a.kind === "task_update" ||
                        a.kind === "intelligence") &&
                      a.status === "pending" ? (
                        <label className="action-date">
                          <CalendarDays size={13} />
                          {a.kind === "intelligence"
                            ? "Effective date"
                            : "Due date"}
                          <input
                            aria-label={`${a.kind === "intelligence" ? "Effective date" : "Due date"} for ${a.title}`}
                            type="date"
                            value={dates[a.id] ?? a.dueDate ?? ""}
                            disabled={locked}
                            onChange={(e) =>
                              setDates((v) => ({
                                ...v,
                                [a.id]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ) : (
                        a.dueDate && (
                          <div className="action-date">
                            <CalendarDays size={13} />
                            Proposed date: {shortDate(a.dueDate)}
                          </div>
                        )
                      )}
                      <details className="source-evidence">
                        <summary>
                          Source evidence
                          <ChevronDown size={12} />
                        </summary>
                        <p>“{a.sourceQuote}”</p>
                      </details>
                      <details className="source-evidence review-history">
                        <summary>
                          Original proposal & review history
                          <ChevronDown size={12} />
                        </summary>
                        {a.originalAvailable === false ? (
                          <p>
                            The original wording predates review history
                            tracking and cannot be recovered. The saved decision
                            is preserved below.
                          </p>
                        ) : (
                          <div className="history-entry">
                            <strong>{a.original?.title ?? a.title}</strong>
                            <p>{a.original?.body ?? a.body}</p>
                            {(a.original ? a.original.dueDate : a.dueDate) && (
                              <small>
                                Original due date:{" "}
                                {shortDate(
                                  a.original ? a.original.dueDate! : a.dueDate!,
                                )}
                              </small>
                            )}
                          </div>
                        )}
                        {data.reviewHistory
                          .filter(
                            (h) =>
                              h.packageId === pkg.id && h.actionId === a.id,
                          )
                          .map((h) => (
                            <div className="history-entry" key={h.id}>
                              <strong>
                                {h.decision === "approved"
                                  ? "Approved"
                                  : "Rejected"}{" "}
                                · {new Date(h.reviewedAt).toLocaleString()}
                              </strong>
                              <small>{h.actor} · shared workspace review</small>
                              <p>{h.edited.body}</p>
                              {h.edited.dueDate && (
                                <small>
                                  Saved due date: {shortDate(h.edited.dueDate)}
                                </small>
                              )}
                            </div>
                          ))}
                        {a.status === "pending" && (
                          <p>
                            No saved decision yet. Your current edits and
                            choices are saved only when you confirm a decision.
                          </p>
                        )}
                      </details>
                    </article>
                  );
                })}
              </div>
              {pending.length > 0 && (
                <div className="review-effects-preview" aria-live="polite">
                  <strong>When you confirm</strong>
                  {chosen.length > 0 ? (
                    <ul>
                      {chosen.map((decision) => {
                        const action = pending.find(
                          (a) => a.id === decision.id,
                        )!;
                        return (
                          <li key={action.id}>
                            {decision.status === "approved"
                              ? reviewEffect(action, !!pkg.propertyId)
                              : "Reject this proposal without applying it"}
                            : <b>{action.title}</b>
                            {decision.status === "approved" &&
                              action.kind === "task" && (
                                <span>
                                  {" "}
                                  ·{" "}
                                  {decision.dueDate
                                    ? `Due ${shortDate(decision.dueDate)}`
                                    : "No due date"}
                                </span>
                              )}
                          </li>
                        );
                      })}
                      {completedReviewTasks.map((task) => (
                        <li key={`review-task-${task.id}`}>
                          Complete the linked review reminder:{" "}
                          <b>{task.title}</b>. Client follow-up and unresolved
                          commitments remain open until separately completed.
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No actions selected. Undecided proposals remain pending.
                    </p>
                  )}
                  <p>
                    {approved.length} approved · {rejected.length} rejected ·{" "}
                    {remaining} remain pending.
                  </p>
                  <p>
                    Decisions and edits are recorded in the review history. No
                    external messages are sent and no external CRM is updated.
                  </p>
                </div>
              )}
              {pkg.propertyId && (
                <WorkProducts
                  data={data}
                  onUpdate={onUpdate}
                  notify={notify}
                  filter={{ sourcePackageId: pkg.id }}
                  context={{
                    kind: "seller_preparation",
                    agentId: pkg.agentId,
                    clientId: pkg.clientId,
                    propertyId: pkg.propertyId,
                    sourcePackageId: pkg.id,
                  }}
                  title="Turn this conversation into a seller package"
                />
              )}
            </section>
          </div>
          <div className="review-commit">
            <div>
              <strong>
                {pending.length
                  ? `${chosen.length} ${chosen.length === 1 ? "decision" : "decisions"} to save`
                  : `${pkg.actions.filter((a) => a.status === "approved").length} approved`}
              </strong>
              <small>
                {pending.length
                  ? "Changes are saved to AgentDesk only."
                  : "Saved to your shared workspace."}
              </small>
            </div>
            {pending.length > 0 ? (
              <button
                className="button primary"
                disabled={
                  locked || !chosen.length || chosen.some((a) => !a.body.trim())
                }
                onClick={save}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <CheckCheck size={18} />
                )}{" "}
                {busy ? "Saving your decisions…" : "Confirm review"}
              </button>
            ) : (
              <Badge tone="green">
                <CheckCheck size={15} />
                Review complete
              </Badge>
            )}
          </div>
        </>
      )}
    </>
  );
}
