"use client";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CopilotAccess } from "./copilot-access";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Check,
  X,
  Compass,
  MessageSquareText,
  HeartHandshake,
  House,
  ChartNoAxesCombined,
  Search,
  Inbox,
  Sparkles,
} from "lucide-react";
import type { Agent } from "@/lib/types";
export const workforce = [
  {
    name: "Daily Coordinator",
    short: "Coordinator",
    icon: Compass,
    color: "blue",
    description:
      "Connects the dots across your tasks, appointments, and approvals. Your day, with a clear sense of direction.",
  },
  {
    name: "Conversation Assistant",
    short: "Conversation",
    icon: MessageSquareText,
    color: "purple",
    description:
      "Turns authorized conversation notes into sourced facts, clear summaries, and practical next steps.",
  },
  {
    name: "Relationship Assistant",
    short: "Relationship",
    icon: HeartHandshake,
    color: "rose",
    description:
      "Finds evidenced follow-ups and prepares messages in your voice. Approved messages remain saved drafts; nothing is sent.",
  },
  {
    name: "Listing Coordinator",
    short: "Listing",
    icon: House,
    color: "teal",
    description:
      "Keeps property preparation moving, with linked tasks and a clear distinction between requests and confirmations.",
  },
  {
    name: "Team Coach",
    short: "Team coach",
    icon: ChartNoAxesCombined,
    color: "amber",
    description:
      "Surfaces outstanding work and listing bottlenecks from your team’s actual records.",
  },
];
export function AssistantIcon({
  index = 0,
  small = false,
}: {
  index?: number;
  small?: boolean;
}) {
  const a = workforce[index];
  const Icon = a.icon;
  return (
    <span className={`assistant-icon ${a.color} ${small ? "small" : ""}`}>
      <Icon size={small ? 15 : 20} strokeWidth={1.7} />
    </span>
  );
}
export function Avatar({
  agent,
  small = false,
}: {
  agent: Pick<Agent, "initials" | "color" | "name">;
  small?: boolean;
}) {
  return (
    <span
      title={agent.name}
      className={`avatar ${small ? "small" : ""}`}
      style={{ background: agent.color }}
    >
      {agent.initials}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function SectionTitle({
  title,
  aside,
}: {
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {aside}
    </div>
  );
}
export function Empty({
  title,
  description,
  kind = "empty",
  action,
}: {
  title: string;
  description: string;
  kind?: "empty" | "search" | "complete";
  action?: React.ReactNode;
}) {
  const Icon = kind === "complete" ? Check : kind === "search" ? Search : Inbox;
  return (
    <div className={`empty-state empty-${kind}`}>
      <span className="empty-icon">
        <Icon size={23} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
const activeModals: HTMLDivElement[] = [];
let beforeModalOverflow = "";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  initialFocus,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  initialFocus?: string;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const copilot = useContext(CopilotAccess);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.body);
  }, []);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const element = panel.current;
    if (!element) return;
    if (!activeModals.length)
      beforeModalOverflow = document.body.style.overflow;
    activeModals.push(element);
    document.body.style.overflow = "hidden";
    (initialFocus
      ? element.querySelector<HTMLElement>(initialFocus)
      : null
    )?.focus();
    if (!element.contains(document.activeElement)) element.focus();
    function key(e: KeyboardEvent) {
      if ((document.activeElement as HTMLElement)?.closest(".copilot-panel"))
        return;
      if (activeModals.at(-1) !== element) return;
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const els = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
          ) || []),
        ].filter((item) => item.getClientRects().length > 0);
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      const index = activeModals.indexOf(element);
      if (index !== -1) activeModals.splice(index, 1);
      if (!activeModals.length)
        document.body.style.overflow = beforeModalOverflow;
      document.removeEventListener("keydown", key);
      if (before?.isConnected) before.focus();
    };
  }, [target, initialFocus]);
  if (!target) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal={!copilot.open}
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        className={`modal ${wide ? "wide" : ""} ${className}`}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {copilot.enabled && (
            <button
              className="copilot-launch modal-copilot-launch"
              aria-label="Ask AgentDesk"
              title="Ask AgentDesk"
              onClick={copilot.show}
            >
              <Sparkles size={14} />
              <span>Ask AgentDesk</span>
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    target,
  );
}

export function AutoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "auto";
      input.style.height = `${Math.max(input.scrollHeight + input.offsetHeight - input.clientHeight, 72)}px`;
    };
    resize();
    // Width changes need a new wrapping measurement; avoid observing our own height.
    let width = input.getBoundingClientRect().width;
    const widthObserver = new ResizeObserver(() => {
      const next = input.getBoundingClientRect().width;
      if (next !== width) {
        width = next;
        resize();
      }
    });
    widthObserver.observe(input);
    return () => {
      widthObserver.disconnect();
    };
  }, [props.value]);
  return <textarea {...props} data-autosize ref={ref} />;
}

export function SectionNav({
  items,
  label = "Sections",
  mobileSelect = false,
}: {
  items: { id: string; label: string }[];
  label?: string;
  mobileSelect?: boolean;
}) {
  const jump = (id: string) => {
    const section = document.getElementById(id);
    if (section instanceof HTMLDetailsElement) section.open = true;
    section?.scrollIntoView({ block: "start", behavior: "instant" });
    section?.focus({ preventScroll: true });
  };
  return (
    <nav
      className={`section-nav ${mobileSelect ? "mobile-section-select" : ""}`}
      aria-label={label}
    >
      {mobileSelect && (
        <label className="section-jump">
          Jump to section
          <select
            aria-label="Jump to document section"
            defaultValue=""
            onChange={(event) => {
              jump(event.target.value);
              event.target.value = "";
            }}
          >
            <option value="" disabled>
              Choose a section
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            jump(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function useDraftGuard(dirty: boolean, keepForLater?: () => void) {
  const [leave, setLeave] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return {
    requestLeave: (action: () => void) =>
      dirty ? setLeave(() => action) : action(),
    dialog: leave ? (
      <Modal
        title="Keep your changes?"
        subtitle="This draft has unsaved edits."
        onClose={() => setLeave(null)}
        initialFocus="[data-keep-editing]"
      >
        <div className="draft-guard">
          <p>
            {keepForLater
              ? "Keep this draft in the current tab and return later, continue editing, or explicitly discard it."
              : "Return to the draft to save your work, or discard these edits and continue."}
          </p>
          <div className="product-actions">
            {keepForLater && (
              <button
                className="button secondary"
                onClick={() => {
                  setLeave(null);
                  keepForLater();
                }}
              >
                Keep draft & close
              </button>
            )}
            <button
              className="button secondary danger"
              onClick={() => {
                setLeave(null);
                leave();
              }}
            >
              Discard edits & continue
            </button>
            <button
              className="button primary"
              data-keep-editing
              onClick={() => setLeave(null)}
            >
              Keep editing
            </button>
          </div>
        </div>
      </Modal>
    ) : null,
  };
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
export const shortDate = (value: string | null) =>
  value
    ? new Date(
        value.length === 10 ? `${value}T12:00:00` : value,
      ).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      })
    : "No date set";
export const time = (value: string) =>
  new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
export function TextLink({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
