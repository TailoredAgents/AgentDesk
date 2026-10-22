"use client";
import { useEffect, useState } from "react";
import {
  Database,
  LockKeyhole,
  ArrowUpRight,
  CalendarDays,
} from "lucide-react";
import { Badge, Modal } from "../ui";
export function Connections({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/pilot/readiness")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((v) => {
        if (active) setReady(v.pilotReady);
      })
      .catch(() => {
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Modal
      title="Your connections"
      subtitle="Your CRM holds the records. Your AI workforce puts them to work."
      onClose={onClose}
    >
      <div className="crm-connections">
        <section className="crm-card">
          <div className="crm-card-heading">
            <span className="connection-mark">
              <Database size={24} />
            </span>
            <div>
              <h3>Lofty CRM</h3>
              <p>Assigned leads, CRM notes, tasks, and relationship context</p>
            </div>
            <Badge>Private pilot</Badge>
          </div>
          <div className="crm-notice">
            <LockKeyhole size={18} />
            <p>
              This is the fictional sample workspace. Connect your real account
              from the individually authenticated pilot.
            </p>
          </div>
          <div className="crm-actions">
            <button className="button secondary" disabled>
              Connect in private pilot
            </button>
            <a href="/pilot" className="button primary">
              {ready ? "Open CRM pilot" : "View connection setup"}
              <ArrowUpRight size={16} />
            </a>
          </div>
          <p className="crm-footnote">
            {ready === null
              ? "Checking pilot availability…"
              : ready
                ? "Individual sign-in is available. Lofty approval and account access are checked separately."
                : "Individual sign-in is awaiting setup. No CRM account is connected to this sample."}
          </p>
        </section>
        <section className="crm-card">
          <div className="crm-card-heading">
            <CalendarDays size={22} />
            <div>
              <h3>Google Workspace & Microsoft 365</h3>
              <p>Mail and calendar integrations</p>
            </div>
            <Badge>Planned</Badge>
          </div>
        </section>
        <p className="crm-footnote">
          Personal-phone messages remain copy-and-send drafts. No new phone
          number or messaging service is required.
        </p>
      </div>
    </Modal>
  );
}
