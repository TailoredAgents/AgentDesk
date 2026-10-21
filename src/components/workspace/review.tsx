"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Plus,
  ChevronDown,
  Check,
  CheckCheck,
  CalendarDays,
  Copy,
  SlidersHorizontal,
  ShieldCheck,
  LoaderCircle,
  AlertCircle,
  X,
  AudioLines,
} from "lucide-react";
import type {
  WorkspaceData,
  Agent,
  ProposedAction,
  ReviewInput,
} from "@/lib/types";
import { AssistantIcon, Badge, Empty, shortDate } from "../ui";
import { request } from "./client-api";

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
  notify: (s: string) => void;
  onProperty: (id: string) => void;
}) {
  const [tab, setTab] = useState<"pending" | "reviewed">(
      data.packages.find((p) => p.id === selected)?.status || "pending",
    ),
    [edits, setEdits] = useState<Record<string, string>>({}),
    [dates, setDates] = useState<Record<string, string>>({}),
    [decisions, setDecisions] = useState<
      Record<string, "approved" | "rejected">
    >({}),
    [busy, setBusy] = useState(false),
    [rewriting, setRewriting] = useState("");
  const list = data.packages.filter((p) => p.status === tab);
  const pkg = list.find((p) => p.id === selected) || list[0];
  const conversation = data.conversations.find(
    (c) => c.id === pkg?.conversationId,
  );
  const client = data.clients.find((c) => c.id === pkg?.clientId);
  const property = data.properties.find((p) => p.id === pkg?.propertyId);
  const pending = pkg?.actions.filter((a) => a.status === "pending") || [];
  useEffect(() => {
    setEdits({});
    setDecisions({});
    setDates({});
  }, [pkg?.id]);
  useEffect(() => {
    const target = data.packages.find((p) => p.id === selected);
    if (target) setTab(target.status);
  }, [selected]);
  const save = async () => {
    if (!pkg) return;
    setBusy(true);
    try {
      const input: ReviewInput = {
        decisions: pending.map((a) => ({
          id: a.id,
          status: decisions[a.id] || "approved",
          body: (edits[a.id] ?? a.body).trim() || a.body,
          dueDate: a.id in dates ? dates[a.id] || null : a.dueDate,
        })),
      };
      onUpdate(
        await request<WorkspaceData>(
          `/api/packages/${pkg.id}/review`,
          "POST",
          input,
        ),
      );
      notify(
        "Review saved. Approved work is now in your workspace. No messages were sent.",
      );
      setTab("reviewed");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rewrite = async (action: ProposedAction, instruction: string) => {
    if (!pkg) return;
    setRewriting(instruction);
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
      notify((e as Error).message);
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
        <button className="button primary" onClick={onCapture}>
          <Plus size={17} />
          New conversation
        </button>
      </div>
      <div className="review-toolbar">
        <div className="underline-tabs">
          <button
            className={tab === "pending" ? "active" : ""}
            onClick={() => setTab("pending")}
          >
            Needs your review{" "}
            <span>
              {data.packages.filter((p) => p.status === "pending").length}
            </span>
          </button>
          <button
            className={tab === "reviewed" ? "active" : ""}
            onClick={() => setTab("reviewed")}
          >
            Reviewed{" "}
            <span>
              {data.packages.filter((p) => p.status === "reviewed").length}
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
          <div className="package-selector">
            {list.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
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
          <div className="review-workspace">
            <section className="source-panel">
              <div className="panel-eyebrow">
                <AudioLines size={17} />
                THE CONVERSATION
                <Badge>
                  {pkg.origin === "sample" ? "Saved sample" : "Live AI result"}
                </Badge>
              </div>
              <div className="source-title">
                <h2>{pkg.title}</h2>
                <p>
                  {shortDate(pkg.createdAt)} · {client?.name} ·{" "}
                  {conversation?.source === "audio"
                    ? "Authorized audio"
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
                Edit the details, keep what’s useful, and approve when it feels
                right.
              </p>
              <div className="action-cards">
                {pkg.actions.map((a) => {
                  const state =
                    a.status === "pending"
                      ? decisions[a.id] || "approved"
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
                          <button
                            className={`keep-toggle ${state}`}
                            aria-label={`${state === "rejected" ? "Include" : "Exclude"} ${a.title}`}
                            onClick={() =>
                              setDecisions((d) => ({
                                ...d,
                                [a.id]:
                                  state === "rejected"
                                    ? "approved"
                                    : "rejected",
                              }))
                            }
                          >
                            {state === "rejected" ? (
                              <X size={14} />
                            ) : (
                              <Check size={14} />
                            )}{" "}
                            {state === "rejected" ? "Excluded" : "Include"}
                          </button>
                        ) : (
                          <Badge
                            tone={a.status === "approved" ? "green" : "neutral"}
                          >
                            {a.status}
                          </Badge>
                        )}
                      </div>
                      <h3>{a.title}</h3>
                      {a.status === "pending" ? (
                        <textarea
                          aria-label={`Edit ${a.title}`}
                          value={edits[a.id] ?? a.body}
                          maxLength={6000}
                          disabled={busy}
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
                                  !!rewriting ||
                                  a.status !== "pending"
                                }
                                onClick={() => rewrite(a, value)}
                              >
                                {rewriting === value ? (
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
                            <button
                              className="copy-draft"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(a.body);
                                  notify(
                                    "Approved draft copied. Nothing has been sent.",
                                  );
                                } catch {
                                  notify(
                                    "Copy is unavailable in this browser. Select the text to copy it.",
                                  );
                                }
                              }}
                            >
                              <Copy size={13} />
                              Copy approved draft
                            </button>
                          )}
                        </>
                      )}
                      {a.kind === "task" && a.status === "pending" ? (
                        <label className="action-date">
                          <CalendarDays size={13} />
                          Due date
                          <input
                            aria-label={`Due date for ${a.title}`}
                            type="date"
                            value={dates[a.id] ?? a.dueDate ?? ""}
                            disabled={busy}
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
                    </article>
                  );
                })}
              </div>
              <div className="review-commit">
                <div>
                  <strong>
                    {pending.length
                      ? pending.filter((a) => decisions[a.id] !== "rejected")
                          .length
                      : pkg.actions.filter((a) => a.status === "approved")
                          .length}{" "}
                    {(pending.length
                      ? pending.filter((a) => decisions[a.id] !== "rejected")
                          .length
                      : pkg.actions.filter((a) => a.status === "approved")
                          .length) === 1
                      ? "action"
                      : "actions"}{" "}
                    {pending.length ? "selected" : "approved"}
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
                      busy ||
                      pending.some(
                        (a) =>
                          decisions[a.id] !== "rejected" &&
                          !(edits[a.id] ?? a.body).trim(),
                      )
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
            </section>
          </div>
        </>
      )}
    </>
  );
}
