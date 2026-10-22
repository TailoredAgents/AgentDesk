"use client";
import { useEffect, useRef, useState } from "react";
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
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Check size={23} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
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
    panel.current?.focus();
    function key(e: KeyboardEvent) {
      if (activeModals.at(-1) !== element) return;
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const els = panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        );
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
  }, [target]);
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
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
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
