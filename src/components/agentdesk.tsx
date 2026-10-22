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
  Info,
  AlertCircle,
  Settings2,
} from "lucide-react";
import type { WorkspaceData, Task, Commitment } from "@/lib/types";
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
import { ActivityFeed } from "./workspace/activity-feed";
import { FollowUp } from "./workspace/follow-up";
import { Connections } from "./crm/connections";

const viewNames: Record<View, string> = {
  today: "Today",
  review: "Review",
  listings: "Listings",
  team: "Team",
};

function previewAgent(data: WorkspaceData, id: string | null) {
  const ordered = [...data.agents].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  return (
    ordered.find((person) => person.id === id) ||
    ordered.find((person) =>
      data.packages.some(
        (pkg) => pkg.agentId === person.id && pkg.status === "pending",
      ),
    ) ||
    ordered[0]
  );
}

export default function AgentDesk() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState<View>("today"),
    [panel, setPanel] = useState<Panel>(null),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState<{
      message: string;
      tone: "info" | "success" | "error";
    } | null>(null),
    [selectedPackage, setSelectedPackage] = useState<string | null>(null),
    [property, setProperty] = useState<string | null>(null),
    [client, setClient] = useState<string | null>(null),
    [leader, setLeader] = useState(false),
    [agentId, setAgentId] = useState<string | null>(null),
    [followUpId, setFollowUpId] = useState<string | null>(null),
    [preparing, setPreparing] = useState(false);
  const [workforceRole, setWorkforceRole] = useState<number | null>(null);
  const [searchShortcut, setSearchShortcut] = useState("Ctrl K");
  useEffect(() => {
    setSearchShortcut(
      /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K",
    );
  }, []);
  const applyData = useCallback((incoming: WorkspaceData) => {
    setData((current) =>
      !current ||
      current.workspace.id !== incoming.workspace.id ||
      (incoming.workspace.revision ?? 0) >= (current.workspace.revision ?? 0)
        ? incoming
        : current,
    );
  }, []);
  const refresh = useCallback(async () => {
    try {
      const value = await request<WorkspaceData>("/api/workspace");
      applyData(value);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [applyData]);
  useEffect(() => {
    if (panel) setMobile(false);
  }, [panel]);
  useEffect(() => {
    const owner =
      view === "review"
        ? data?.packages.find((pkg) => pkg.id === selectedPackage)?.agentId
        : undefined;
    if (
      data &&
      ((owner && owner !== agentId) ||
        !data.agents.some((person) => person.id === agentId))
    ) {
      const id = owner || previewAgent(data, null).id;
      setAgentId(id);
      try {
        window.localStorage.setItem("agentdesk-preview-agent", id);
      } catch {
        /* storage is optional */
      }
    }
  }, [data, agentId, selectedPackage, view]);
  useEffect(() => {
    refresh();
    try {
      setAgentId(window.localStorage.getItem("agentdesk-preview-agent"));
    } catch {
      /* storage is optional */
    }
    const read = () => {
      const query = new URLSearchParams(window.location.search);
      const v = query.get("view");
      setSelectedPackage(query.get("package"));
      if (v && v in viewNames) setView(v as View);
      else setView("today");
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [refresh]);
  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const id = setTimeout(() => setToast(null), 6500);
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
    if (id) {
      setSelectedPackage(id);
      const owner = data?.packages.find((pkg) => pkg.id === id)?.agentId;
      if (owner) selectAgent(owner);
    }
    navigate("review");
    if (id) selectPackage(id);
  };
  const selectPackage = (id: string) => {
    setSelectedPackage(id);
    const query = new URLSearchParams(window.location.search);
    query.set("view", "review");
    query.set("package", id);
    window.history.replaceState(null, "", `/?${query.toString()}`);
  };
  const selectAgent = (id: string) => {
    setAgentId(id);
    try {
      window.localStorage.setItem("agentdesk-preview-agent", id);
    } catch {
      /* storage is optional */
    }
  };
  const notify = (
    message: string,
    tone: "info" | "success" | "error" = "info",
  ) => setToast({ message, tone });
  const prepareFollowUps = async (id?: string) => {
    if (!data || preparing) return;
    setPreparing(true);
    try {
      const result = await request<{
        workspace: WorkspaceData;
        prepared: number;
      }>("/api/follow-ups", "POST", {
        agentId: previewAgent(data, agentId).id,
        ...(id ? { recommendationId: id } : {}),
      });
      applyData(result.workspace);
      notify(
        result.prepared
          ? `${result.prepared} personalized follow-up drafts prepared for review.`
          : "Recommendations refreshed from saved records. Existing drafts are preserved.",
      );
    } catch (e) {
      await refresh();
      notify((e as Error).message, "error");
    } finally {
      setPreparing(false);
    }
  };
  const toggleCommitment = async (item: Commitment) => {
    try {
      applyData(
        await request<WorkspaceData>(`/api/commitments/${item.id}`, "PATCH", {
          status: item.status === "open" ? "resolved" : "open",
        }),
      );
      notify(
        item.status === "open"
          ? "Commitment marked resolved by you."
          : "Commitment reopened.",
      );
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };
  const toggleTask = async (task: Task) => {
    try {
      applyData(
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
      notify((e as Error).message, "error");
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
  const agent = previewAgent(data, agentId);
  const pending = data.packages.filter(
    (p) => p.agentId === agent.id && p.status === "pending",
  );
  const followUp = data.recommendations.find((item) => item.id === followUpId);
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
            <button
              key={a.name}
              onClick={() => {
                setWorkforceRole(i);
                setPanel("workforce");
              }}
            >
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
          <button
            className="nav-item mobile-activity"
            onClick={() => setPanel("activity")}
          >
            <Activity size={18} />
            Activity history
          </button>
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
              <kbd>{searchShortcut}</kbd>
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
              key={agent.id}
              data={data}
              agent={agent}
              onReview={review}
              onCapture={() => setPanel("capture")}
              onProperty={setProperty}
              onClient={setClient}
              onTask={toggleTask}
              onView={navigate}
              onWorkforce={() => {
                setWorkforceRole(null);
                setPanel("workforce");
              }}
              onFollowUp={setFollowUpId}
              onRefresh={() => prepareFollowUps()}
              refreshing={preparing}
              onUpdate={applyData}
              notify={notify}
            />
          )}
          {view === "review" && (
            <Review
              key={agent.id}
              data={data}
              agent={agent}
              selected={selectedPackage}
              setSelected={selectPackage}
              onCapture={() => setPanel("capture")}
              onUpdate={applyData}
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
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className={`toast ${toast.tone}`}
        >
          {toast.tone === "error" ? (
            <AlertCircle size={18} />
          ) : (
            <Info size={18} />
          )}
          <span>{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
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
          onComplete={async (id, updated) => {
            const saved =
              updated || (await request<WorkspaceData>("/api/workspace"));
            applyData(saved);
            const owner = saved.packages.find((pkg) => pkg.id === id)?.agentId;
            if (owner) selectAgent(owner);
            close();
            review(id);
          }}
        />
      )}
      {panel === "workforce" && (
        <Modal
          title="Five specialists. One shared context."
          subtitle="A coordinated workforce, with you at the center."
          initialFocus={
            workforceRole === null ? undefined : "[data-active-role]"
          }
          onClose={close}
          wide
        >
          <div className="workforce-modal">
            {workforce.map((a, i) => (
              <div
                className={`workforce-role ${workforceRole === i ? "selected" : ""}`}
                data-active-role={workforceRole === i ? true : undefined}
                tabIndex={-1}
                key={a.name}
              >
                <AssistantIcon index={i} />
                <div>
                  <h3>{a.name}</h3>
                  <p>{a.description}</p>
                  <button
                    className="text-link"
                    onClick={() => {
                      close();
                      if (i === 1) setPanel("capture");
                      else
                        navigate(
                          i === 3 ? "listings" : i === 4 ? "team" : "today",
                        );
                    }}
                  >
                    {
                      [
                        "Open Today",
                        "Add a conversation",
                        "Open follow-ups on Today",
                        "Open listings",
                        "Open Team",
                      ][i]
                    }{" "}
                    <ChevronRight size={14} />
                  </button>
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
                applies proposed changes to client and listing records.
                Recommendations are evaluated when the workspace refreshes; no
                background monitoring is running.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {panel === "integrations" && <Connections onClose={close} />}
      {panel === "activity" && (
        <Modal
          title="The work, all in one place."
          subtitle="A persistent history of your workspace."
          onClose={close}
        >
          <div className="modal-activity">
            <ActivityFeed
              items={data.activities}
              onClient={(id) => {
                close();
                setClient(id);
              }}
              onProperty={(id) => {
                close();
                setProperty(id);
              }}
            />
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
          key={agent.id}
          data={data}
          agent={agent}
          leader={leader}
          onLeader={setLeader}
          onAgentChange={(id) => {
            selectAgent(id);
            setSelectedPackage(null);
          }}
          onClose={close}
          onUpdate={applyData}
          notify={notify}
        />
      )}
      {property && (
        <PropertyDetail
          property={data.properties.find((p) => p.id === property)!}
          data={data}
          onClose={() => setProperty(null)}
          onTask={toggleTask}
          onCommitment={toggleCommitment}
          onUpdate={applyData}
          notify={notify}
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
          onCommitment={toggleCommitment}
          onUpdate={applyData}
          notify={notify}
          onTask={toggleTask}
          onReview={(id) => {
            setClient(null);
            review(id);
          }}
          onClose={() => setClient(null)}
          onProperty={(id) => {
            setClient(null);
            setProperty(id);
          }}
        />
      )}
      {followUp && (
        <FollowUp
          item={followUp}
          data={data}
          busy={preparing}
          onClose={() => setFollowUpId(null)}
          onReview={(id) => {
            setFollowUpId(null);
            review(id);
          }}
          onPrepare={() => prepareFollowUps(followUp.id)}
          onClient={(id) => {
            setFollowUpId(null);
            setClient(id);
          }}
          onProperty={(id) => {
            setFollowUpId(null);
            setProperty(id);
          }}
        />
      )}
    </div>
  );
}
