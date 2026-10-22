"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  FileText,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { PageContext, Target, Turn } from "@/lib/copilot/types";
import { request } from "./workspace/client-api";
type PublicTurn = Omit<Turn, "calls"> & {
  operations: number;
  mode?: "live" | "example";
};
type State = { id: string; expiresAt: string; turns: PublicTurn[] };
export function CopilotPanel({
  agentId,
  agentName,
  context,
  contextLabel,
  onClose,
  onOpen,
  onChanged,
}: {
  agentId: string;
  agentName: string;
  context: PageContext;
  contextLabel: string;
  onClose: () => void;
  onOpen: (target: Target) => void;
  onChanged: () => void;
}) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [state, setState] = useState<State | null>(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [available, setAvailable] = useState(true),
    [sending, setSending] = useState(false),
    [clearing, setClearing] = useState(false),
    [confirmClear, setConfirmClear] = useState(false),
    [elapsed, setElapsed] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null),
    log = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLElement>(null);
  const retry = useRef<{
    requestId: string;
    text: string;
    context: PageContext;
  } | null>(null);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    const response = await request<{ conversation: State; available: boolean }>(
      `/api/copilot?agentId=${encodeURIComponent(agentId)}`,
    );
    if (mounted.current) {
      setState(response.conversation);
      setAvailable(response.available);
    }
  }, [agentId]);
  useEffect(() => {
    mounted.current = true;
    load().catch((e) => setError(e.message));
    input.current?.focus();
    document.body.classList.add("copilot-visible");
    return () => {
      mounted.current = false;
      document.body.classList.remove("copilot-visible");
    };
  }, [load]);
  const running =
    sending || Boolean(state?.turns.some((t) => t.status === "running"));
  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsed((n) => n + 1);
    }, 1000);
    const poll = setInterval(() => {
      load().catch(() => {});
    }, 4000);
    return () => {
      clearInterval(timer);
      clearInterval(poll);
    };
  }, [running, load]);
  useEffect(() => {
    if (state?.turns.length || sending)
      log.current?.scrollTo({
        top: log.current.scrollHeight,
        behavior: "smooth",
      });
  }, [state?.turns.length, sending]);
  async function send(previous?: PublicTurn) {
    if (!state || running || !available || (!previous && !text.trim())) return;
    const submission = previous
      ? {
          requestId: previous.id,
          text: previous.text,
          context: previous.context,
        }
      : retry.current && retry.current.text === text
        ? retry.current
        : { requestId: crypto.randomUUID(), text: text.trim(), context };
    retry.current = submission;
    setSending(true);
    setError("");
    try {
      const response = await request<{ conversation: State }>(
        "/api/copilot",
        "POST",
        { agentId, conversationId: state.id, ...submission },
      );
      if (mounted.current) {
        setState(response.conversation);
        setText("");
        retry.current = null;
      }
      onChanged();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) {
        setSending(false);
        input.current?.focus();
      }
    }
  }
  async function clear() {
    if (!state) return;
    setClearing(true);
    setError("");
    try {
      const response = await request<{ conversation: State }>(
        "/api/copilot",
        "DELETE",
        { agentId, conversationId: state.id },
      );
      setState(response.conversation);
      retry.current = null;
      setConfirmClear(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClearing(false);
    }
  }
  const suggestions = context.packageId
    ? [
        "Explain this proposed work.",
        "What needs my decision?",
        "Make the pending message more natural.",
      ]
    : context.clientId || context.propertyId
      ? [
          "What’s happening with this client?",
          "What still needs to be done?",
          "Prepare a follow-up for this client.",
        ]
      : context.page === "team"
        ? [
            "Show me what my AI Employees have accomplished.",
            "Where does the team need attention?",
          ]
        : [
            "Who needs attention today?",
            "Get me ready for my next appointment.",
            "What’s happening with Sarah’s listing?",
          ];
  return (
    <aside
      className="copilot-panel"
      ref={panel}
      role={compact ? "dialog" : "complementary"}
      aria-modal={compact || undefined}
      aria-label="Ask AgentDesk"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
        if (
          e.key === "Tab" &&
          window.matchMedia("(max-width: 900px)").matches
        ) {
          const nodes = [
            ...(panel.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),textarea:not(:disabled),a[href]",
            ) ?? []),
          ];
          if (e.shiftKey && document.activeElement === nodes[0]) {
            e.preventDefault();
            nodes.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
            e.preventDefault();
            nodes[0]?.focus();
          }
        }
      }}
    >
      <header className="copilot-header">
        <div className="copilot-mark">
          <Sparkles size={20} />
        </div>
        <div>
          <h2>Ask AgentDesk</h2>
          <p>Your work, thoughtfully handled.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close Copilot"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="copilot-context">
        <span className="copilot-context-dot" />
        <span>{contextLabel}</span>
        <small>Sample workspace</small>
      </div>
      <div
        className="copilot-chat"
        ref={log}
        role="log"
        aria-label="Copilot conversation"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {!state && <p role="status">Opening your conversation…</p>}
        {state && !state.turns.length && (
          <div className="copilot-welcome">
            <span className="tiny-eyebrow">A LITTLE LESS TO KEEP TRACK OF</span>
            <h3>
              What can I take
              <br />
              off your mind?
            </h3>
            <p>
              I can catch you up, prepare a follow-up, or get a document ready
              for your review.
            </p>
            <div className="copilot-suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setText(s);
                    input.current?.focus();
                  }}
                >
                  {s}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
            <p className="copilot-agent-note">
              Working with {agentName}’s fictional records.
            </p>
          </div>
        )}
        {state?.turns.map((turn) => (
          <div className="copilot-turn" key={turn.id}>
            <div className="copilot-user">{turn.text}</div>
            {turn.mode === "example" && (
              <span className="copilot-example">
                Saved example · not a live AI response
              </span>
            )}
            {turn.reply && (
              <>
                <div className="copilot-answer">
                  <span className="copilot-answer-label">
                    <Sparkles size={13} /> AGENTDESK
                  </span>
                  <p>{turn.reply.text}</p>
                </div>
                {turn.reply.artifacts.length > 0 && (
                  <div className="copilot-results">
                    {turn.reply.artifacts.map((a, i) => (
                      <button
                        className="copilot-result"
                        key={`${a.target.id}-${i}`}
                        onClick={() => onOpen(a.target)}
                      >
                        <span className="copilot-result-icon">
                          {a.target.kind === "document" ? (
                            <FileText size={18} />
                          ) : a.target.kind === "review" ? (
                            <MessageCircle size={18} />
                          ) : (
                            <Check size={18} />
                          )}
                        </span>
                        <span>
                          <small>
                            {a.state === "awaiting_review"
                              ? "READY FOR YOUR REVIEW"
                              : a.state === "reused"
                                ? "EXISTING SAVED WORK"
                                : a.state === "approved"
                                  ? "APPROVED RECORD"
                                  : "FOUND IN YOUR WORKSPACE"}
                          </small>
                          <strong>{a.title}</strong>
                          <em>{a.detail}</em>
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                  </div>
                )}
                {turn.reply.sourceIds.length > 0 && (
                  <small className="copilot-grounded">
                    Based on {turn.reply.sourceIds.length} retrieved record
                    {turn.reply.sourceIds.length === 1 ? "" : "s"} ·{" "}
                    {Math.max(1, Math.round(turn.durationMs / 1000))}s
                  </small>
                )}
              </>
            )}
            {turn.status === "failed" && (
              <div className="copilot-error" role="alert">
                <p>{turn.error}</p>
                <button
                  className="button small"
                  disabled={running || !available}
                  onClick={() => send(turn)}
                >
                  Retry this request
                </button>
              </div>
            )}
          </div>
        ))}
        {running && (
          <div className="copilot-progress" role="status">
            <span className="copilot-pulse" />
            <div>
              <strong>
                {elapsed > 30
                  ? "Preparing and checking your work…"
                  : "Working on your request…"}
              </strong>
              <p>
                {elapsed > 60
                  ? "This request has a time limit. Saved results will stay available."
                  : "You can keep using AgentDesk. Saved drafts will appear here."}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="copilot-compose-area">
        {!available && (
          <div className="copilot-offline">
            <strong>Live Copilot isn’t connected yet.</strong>
            <p>
              An OpenAI key is needed on the server. Your existing workspace and
              saved work remain available.
            </p>
          </div>
        )}
        {error && (
          <p className="copilot-error" role="alert">
            {error}{" "}
            <button onClick={() => load().catch((e) => setError(e.message))}>
              Refresh status
            </button>
          </p>
        )}
        <form
          className="copilot-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="copilot-message">
            Message AgentDesk
          </label>
          <textarea
            id="copilot-message"
            ref={input}
            value={text}
            maxLength={8000}
            rows={2}
            placeholder="Tell me what you need…"
            onChange={(e) => {
              setText(e.target.value);
              retry.current = null;
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="submit"
            aria-label="Send to Copilot"
            disabled={running || !state || !text.trim() || !available}
          >
            <ArrowUp size={19} />
          </button>
        </form>
        <p className="copilot-assurance">
          <ShieldCheck size={13} /> Prepared here. Approved by you.
        </p>
        <div className="copilot-footer">
          <button
            disabled={running || !state || clearing}
            onClick={() => setConfirmClear(!confirmClear)}
          >
            <Plus size={13} /> New chat
          </button>
          <span>Private to this sample sign-in · 14-day retention</span>
        </div>
        {confirmClear && (
          <div className="copilot-clear">
            <p>
              Clear this chat? Saved documents and review proposals will stay in
              AgentDesk.
            </p>
            <button
              className="button small"
              disabled={clearing}
              onClick={clear}
            >
              Clear chat
            </button>
            <button
              className="button small"
              onClick={() => setConfirmClear(false)}
            >
              Keep chat
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
