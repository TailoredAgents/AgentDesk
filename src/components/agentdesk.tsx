"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sun,
  Inbox,
  House,
  Users,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  Menu,
  Activity,
  Link2,
  ShieldCheck,
  X,
  CheckCircle2,
  Settings2,
} from "lucide-react";
import type { WorkspaceData, Task } from "@/lib/types";
import {
  AssistantIcon,
  Avatar,
  Badge,
  Empty,
  Modal,
  workforce,
  shortDate,
  time,
} from "./ui";
import type { View, Panel } from "./workspace/types";
import { Today } from "./workspace/today";
import { Review } from "./workspace/review";
import { Listings } from "./workspace/listings";
import { Team } from "./workspace/team";
import { PropertyDetail } from "./workspace/property-detail";
import { ClientDetail } from "./workspace/client-detail";
import { Capture } from "./workspace/capture";
import { Settings } from "./workspace/settings";
import { SearchPanel } from "./workspace/search-panel";
import { request } from "./workspace/client-api";

const viewNames: Record<View, string> = {
  today: "Today",
  review: "Review",
  listings: "Listings",
  team: "Team",
};

export default function AgentDesk() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState<View>("today"),
    [panel, setPanel] = useState<Panel>(null),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(""),
    [selectedPackage, setSelectedPackage] = useState<string | null>(null),
    [property, setProperty] = useState<string | null>(null),
    [client, setClient] = useState<string | null>(null),
    [leader, setLeader] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const value = await request<WorkspaceData>("/api/workspace");
      setData(value);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (panel) setMobile(false);
  }, [panel]);
  useEffect(() => {
    refresh();
    const read = () => {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v && v in viewNames) setView(v as View);
      else setView("today");
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPanel((v) => (v === "search" ? null : "search"));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const navigate = (next: View) => {
    setView(next);
    setMobile(false);
    window.history.pushState(
      null,
      "",
      next === "today" ? "/" : `/?view=${next}`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const review = (id?: string) => {
    if (id) setSelectedPackage(id);
    navigate("review");
  };
  const notify = (message: string) => setToast(message);
  const toggleTask = async (task: Task) => {
    try {
      setData(
        await request<WorkspaceData>(`/api/tasks/${task.id}`, "PATCH", {
          status: task.status === "done" ? "open" : "done",
        }),
      );
      notify(
        task.status === "done"
          ? "Task reopened."
          : "One less thing on your list.",
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  if (!data)
    return (
      <div className="loading-workspace">
        <div className="brand-mark">
          a<span>↗</span>
        </div>
        <h1>AgentDesk</h1>
        <p>{error || "A clearer day is on its way."}</p>
        {error ? (
          <button className="button primary" onClick={refresh}>
            Try again
          </button>
        ) : (
          <span className="loading-line" />
        )}
      </div>
    );
  const agent = data.agents.find((a) => a.id === "jordan") || data.agents[0];
  const pending = data.packages.filter((p) => p.status === "pending");
  const close = () => setPanel(null);
  return (
    <div className="app-shell">
      {mobile && (
        <div className="mobile-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <button
          className="icon-button mobile-sidebar-close"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={18} />
        </button>
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("today");
          }}
        >
          <span className="brand-mark">
            a<span>↗</span>
          </span>
          <span>
            AgentDesk<span className="brand-dot">.</span>
          </span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => setPanel("settings")}
        >
          <span className="workspace-monogram">W</span>
          <span>
            <strong>{data.workspace.name}</strong>
            <small>Sample workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              ["today", Sun],
              ["review", Inbox],
              ["listings", House],
              ["team", Users],
            ] as const
          ).map(([key, Icon]) => (
            <button
              key={key}
              className={`nav-item ${view === key ? "active" : ""}`}
              aria-current={view === key ? "page" : undefined}
              onClick={() => navigate(key)}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{viewNames[key]}</span>
              {key === "review" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-caption workforce-caption">
          YOUR AI WORKFORCE <span className="status-dot" />
        </div>
        <div className="workforce-nav">
          {workforce.map((a, i) => (
            <button key={a.name} onClick={() => setPanel("workforce")}>
              <AssistantIcon index={i} small />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-eyebrow">A LITTLE LESS BUSYWORK.</span>
            <p>
              More room for
              <br />
              the human side.
            </p>
            <span className="note-line" />
          </div>
          <button className="nav-item" onClick={() => setPanel("integrations")}>
            <Link2 size={18} />
            Connections
            <span className="small-dot" />
          </button>
          <button className="nav-item" onClick={() => setPanel("settings")}>
            <Settings2 size={18} />
            Workspace settings
          </button>
          <button
            className="profile-button"
            onClick={() => setPanel("settings")}
          >
            <Avatar agent={agent} />
            <span>
              <strong>{agent.name}</strong>
              <small>
                {leader ? "Team leader preview" : "Real estate advisor"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          <span className="tailored-brand">
            CRAFTED BY <b>TAILORED AGENTS</b>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span className="desktop-breadcrumb">Workspace</span>
            <ChevronRight size={13} className="desktop-breadcrumb" />
            <strong>{viewNames[view]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="sample-label">
              <span />
              Sample workspace
            </span>
            <button
              className="search-trigger"
              aria-label="Search workspace"
              onClick={() => setPanel("search")}
            >
              <Search size={16} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button activity-trigger"
              title="Activity history"
              aria-label="Activity history"
              onClick={() => setPanel("activity")}
            >
              <Activity size={19} />
            </button>
            <Avatar agent={agent} small />
          </div>
        </header>
        <main className={`main-content view-${view}`}>
          {view === "today" && (
            <Today
              data={data}
              agent={agent}
              onReview={review}
              onCapture={() => setPanel("capture")}
              onProperty={setProperty}
              onClient={setClient}
              onTask={toggleTask}
              onView={navigate}
              onWorkforce={() => setPanel("workforce")}
            />
          )}
          {view === "review" && (
            <Review
              data={data}
              agent={agent}
              selected={selectedPackage}
              setSelected={setSelectedPackage}
              onCapture={() => setPanel("capture")}
              onUpdate={setData}
              notify={notify}
              onProperty={setProperty}
            />
          )}
          {view === "listings" && (
            <Listings data={data} onProperty={setProperty} />
          )}
          {view === "team" && (
            <Team
              data={data}
              onProperty={setProperty}
              onReview={review}
              onClient={setClient}
              onSettings={() => setPanel("settings")}
            />
          )}
          <footer className="page-footer">
            <span>Thoughtfully prepared. Always in your hands.</span>
            <span>
              <ShieldCheck size={13} /> Your approval comes first
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {panel === "capture" && (
        <Capture
          data={data}
          agent={agent}
          onClose={close}
          onComplete={async (id) => {
            await refresh();
            close();
            review(id);
          }}
        />
      )}
      {panel === "workforce" && (
        <Modal
          title="Five specialists. One shared context."
          subtitle="A coordinated workforce, with you at the center."
          onClose={close}
          wide
        >
          <div className="workforce-modal">
            {workforce.map((a, i) => (
              <div key={a.name}>
                <AssistantIcon index={i} />
                <div>
                  <h3>{a.name}</h3>
                  <p>{a.description}</p>
                </div>
                <Badge tone={i === 0 || i === 4 ? "neutral" : "blue"}>
                  {i === 0 || i === 4 ? "Record-based" : "AI-assisted"}
                </Badge>
              </div>
            ))}
            <div className="info-strip">
              <ShieldCheck size={18} />
              <p>
                {data.capabilities.ai
                  ? "Live AI is configured."
                  : "Live AI is not configured. Saved sample results are available."}{" "}
                Assistants prepare proposals together. Only your approval
                changes client and listing records.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {panel === "integrations" && (
        <Modal
          title="Connected to your way of working."
          subtitle="A home for the work around your CRM."
          onClose={close}
        >
          <div className="connections-list">
            {[
              {
                name: "Lofty",
                type: "CRM · client records and notes",
                mark: "L",
              },
              {
                name: "Google Workspace",
                type: "Gmail and Google Calendar",
                mark: "G",
              },
              {
                name: "Microsoft 365",
                type: "Outlook and Microsoft Calendar",
                mark: "M",
              },
              {
                name: "Communications",
                type: "Phone, messaging, and call recordings",
                mark: "C",
              },
            ].map((c) => (
              <div key={c.name}>
                <span className="connection-mark">{c.mark}</span>
                <div>
                  <h3>{c.name}</h3>
                  <p>{c.type}</p>
                </div>
                <Badge>Not connected</Badge>
              </div>
            ))}
            <div className="info-strip">
              <Link2 size={19} />
              <p>
                Provider connections are planned for a future release. Messages
                approved here are saved internally. Nothing is sent or synced to
                an external service.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {panel === "activity" && (
        <Modal
          title="The work, all in one place."
          subtitle="A persistent history of your workspace."
          onClose={close}
        >
          <div className="activity-list modal-activity">
            {data.activities.map((a) => (
              <div key={a.id}>
                <span className="activity-dot">
                  <Check size={13} />
                </span>
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.detail}</p>
                  <small>
                    {shortDate(a.createdAt)} · {time(a.createdAt)}
                  </small>
                </div>
              </div>
            ))}
            {!data.activities.length && (
              <Empty
                title="A fresh start"
                description="Completed work will appear here."
              />
            )}
          </div>
        </Modal>
      )}
      {panel === "search" && (
        <SearchPanel
          data={data}
          onClose={close}
          onProperty={(id) => {
            close();
            setProperty(id);
          }}
          onClient={(id) => {
            close();
            setClient(id);
          }}
          onReview={(id) => {
            close();
            review(id);
          }}
        />
      )}
      {panel === "settings" && (
        <Settings
          data={data}
          agent={agent}
          leader={leader}
          onLeader={setLeader}
          onClose={close}
          onUpdate={setData}
          notify={notify}
        />
      )}
      {property && (
        <PropertyDetail
          property={data.properties.find((p) => p.id === property)!}
          data={data}
          onClose={() => setProperty(null)}
          onTask={toggleTask}
          onReview={(id) => {
            setProperty(null);
            review(id);
          }}
          onClient={(id) => {
            setProperty(null);
            setClient(id);
          }}
        />
      )}
      {client && (
        <ClientDetail
          client={data.clients.find((c) => c.id === client)!}
          data={data}
          onClose={() => setClient(null)}
          onProperty={(id) => {
            setClient(null);
            setProperty(id);
          }}
        />
      )}
    </div>
  );
}
