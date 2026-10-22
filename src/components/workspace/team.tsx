"use client";
import { useWorkspaceNavigation } from "./navigation-context";
import { IntelligenceExceptions } from "./intelligence";

import {
  ArrowUpRight,
  Users,
  Check,
  Activity,
  ShieldCheck,
} from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
import {
  AssistantIcon,
  Avatar,
  Badge,
  Empty,
  SectionTitle,
  shortDate,
} from "../ui";
import { Progress } from "./shared";
import { isOverdue, teamInsights } from "@/lib/workspace-insights";

export function Team({
  data,
  onProperty,
  onReview,
  onClient,
  onSettings,
}: {
  data: WorkspaceData;
  onProperty: (id: string) => void;
  onReview: (id?: string) => void;
  onClient: (id: string) => void;
  onSettings: () => void;
}) {
  const navigation = useWorkspaceNavigation();
  const open = data.tasks.filter((t) => t.status === "open");
  const completed = data.tasks.filter((t) => t.status === "done");
  const pending = data.packages.filter((p) => p.status === "pending");
  const insight = teamInsights(data);
  const productVersions = (data.workProducts || []).flatMap(
    (product) => product.versions,
  );
  const approvedDocuments = productVersions.filter(
    (version) => version.status === "approved" && version.hasPdf,
  );
  const pendingDocuments = productVersions.filter(
    (version) => version.status === "pending",
  );
  const bottlenecks = insight.listings
    .map((p) => ({
      p,
      tasks: open.filter((t) => t.propertyId === p.id),
      dependencies: insight.dependencies.filter(
        (item) => item.propertyId === p.id,
      ),
    }))
    .filter((p) => p.tasks.length || p.dependencies.length);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A SHARED VIEW. A STRONGER TEAM.</div>
          <h1>
            Good work, together<span className="heading-dot">.</span>
          </h1>
          <p>
            {data.agents.length} people. Individual strengths. A little support
            where it counts.
          </p>
        </div>
        <button className="button secondary" onClick={onSettings}>
          <Users size={17} />
          Team preferences
        </button>
      </div>
      <section className="bottlenecks team-support">
        <SectionTitle
          title="Where your team needs support"
          aside={
            <Badge tone="amber">{bottlenecks.length} need attention</Badge>
          }
        />
        {bottlenecks.map(({ p, tasks, dependencies }) => (
          <button
            key={p.id}
            className="bottleneck"
            onClick={() => onProperty(p.id)}
          >
            <img src={p.image} alt="" />
            <div>
              <h3>{p.address}</h3>
              <p>{dependencies[0]?.title || tasks[0]?.title}</p>
              <span>
                {data.agents.find((a) => a.id === p.agentId)?.name} ·{" "}
                {tasks.length} open {tasks.length === 1 ? "task" : "tasks"} ·{" "}
                {dependencies.length} unresolved{" "}
                {dependencies.length === 1 ? "dependency" : "dependencies"}
              </span>
            </div>
            <ArrowUpRight size={17} />
          </button>
        ))}
        {!bottlenecks.length && (
          <Empty
            kind="complete"
            title="Nothing holding you back"
            description="No recorded listing tasks or dependencies are outstanding."
          />
        )}
      </section>
      <IntelligenceExceptions
        compact
        data={data}
        onClient={onClient}
        onReview={onReview}
      />
      <div className="team-briefing">
        <AssistantIcon index={4} />
        <div>
          <div className="eyebrow">A NOTE FROM YOUR TEAM COACH</div>
          <h2>A few small moves can make a big difference.</h2>
          <p>{insight.coaching}</p>
          <div className="team-metrics">
            <div>
              <strong>{pending.length}</strong>
              <span>Reviews waiting</span>
            </div>
            <div>
              <strong>
                {
                  open.filter((task) =>
                    isOverdue(task, data.workspace.referenceDate),
                  ).length
                }
              </strong>
              <span>Overdue tasks</span>
            </div>
            <div>
              <strong>{bottlenecks.length}</strong>
              <span>Listings needing attention</span>
            </div>
            <div>
              <strong>{approvedDocuments.length}</strong>
              <span>Approved PDF versions</span>
            </div>
          </div>
          <details className="team-record-details">
            <summary>More workspace counts</summary>
            <p>
              {completed.length} tasks complete · {pendingDocuments.length}{" "}
              documents in review · {insight.liveUsers} agents with live AI
              reviews · {insight.livePackages.length} live AI reviews.
            </p>
            <p>
              Saved samples are excluded from live usage. Document counts do not
              confirm delivery.
            </p>
          </details>
        </div>
        <Badge tone="white">Based on workspace records</Badge>
      </div>
      <div className="team-table-section">
        <SectionTitle
          title="The people behind the progress"
          aside={
            <span className="small-text muted">
              Current workspace · {data.agents.length} agents
            </span>
          }
        />
        <div className="team-agent-cards">
          {data.agents.map((agent) => {
            const tasks = data.tasks.filter((t) => t.agentId === agent.id);
            const packages = data.packages.filter(
              (p) => p.agentId === agent.id,
            );
            const pending = packages.filter((p) => p.status === "pending");
            const followUps = data.recommendations.filter(
              (r) => r.agentId === agent.id,
            );
            const versions = data.workProducts
              .filter((p) => p.agentId === agent.id)
              .flatMap((p) => p.versions);
            return (
              <article className="team-agent-card" key={agent.id}>
                <div className="team-person">
                  <Avatar agent={agent} />
                  <div>
                    <h3>{agent.name}</h3>
                    <p>{agent.role}</p>
                  </div>
                </div>
                <div className="record-summary">
                  <Badge tone={pending.length ? "blue" : "green"}>
                    {pending.length
                      ? `${pending.length} ${pending.length === 1 ? "review" : "reviews"} waiting`
                      : "Reviews up to date"}
                  </Badge>
                  <Badge tone="amber">
                    {
                      tasks.filter((t) =>
                        isOverdue(t, data.workspace.referenceDate),
                      ).length
                    }{" "}
                    overdue
                  </Badge>
                </div>
                <div className="product-actions">
                  {pending.length > 0 && (
                    <button
                      className="button secondary"
                      onClick={() => onReview(pending[0].id)}
                    >
                      Review work <ArrowUpRight size={15} />
                    </button>
                  )}
                  {followUps.length > 0 && (
                    <button
                      className="text-link"
                      onClick={() =>
                        navigation?.openFollowUps(followUps[0].agentId)
                      }
                    >
                      {followUps.length}{" "}
                      {followUps.length === 1 ? "follow-up" : "follow-ups"}{" "}
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </div>
                <details>
                  <summary>All workspace counts</summary>
                  <dl>
                    <div>
                      <dt>Listings</dt>
                      <dd>
                        {
                          data.properties.filter((p) => p.agentId === agent.id)
                            .length
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>Open tasks</dt>
                      <dd>{tasks.filter((t) => t.status === "open").length}</dd>
                    </div>
                    <div>
                      <dt>Completed tasks</dt>
                      <dd>
                        {tasks.filter((t) => t.status === "done").length} /{" "}
                        {tasks.length}
                      </dd>
                    </div>
                    <div>
                      <dt>Prepared reviews</dt>
                      <dd>
                        {packages.filter((p) => p.origin === "openai").length}{" "}
                        live ·{" "}
                        {packages.filter((p) => p.origin === "sample").length}{" "}
                        saved
                      </dd>
                    </div>
                    <div>
                      <dt>Approved PDFs</dt>
                      <dd>
                        {
                          versions.filter(
                            (v) => v.status === "approved" && v.hasPdf,
                          ).length
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>Documents in review</dt>
                      <dd>
                        {versions.filter((v) => v.status === "pending").length}
                      </dd>
                    </div>
                    <div>
                      <dt>Recorded activities</dt>
                      <dd>
                        {
                          data.activities.filter((a) => a.agentId === agent.id)
                            .length
                        }
                      </dd>
                    </div>
                  </dl>
                </details>
              </article>
            );
          })}
        </div>
        <div className="team-table-wrap">
          <table className="team-table">
            <thead>
              <tr>
                <th>TEAM MEMBER</th>
                <th>LISTINGS</th>
                <th>OPEN TASKS</th>
                <th>FOLLOW-UPS</th>
                <th>OVERDUE</th>
                <th>COMPLETED</th>
                <th>IN REVIEW</th>
                <th>WORK PREPARED</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((a) => {
                const tasks = data.tasks.filter((t) => t.agentId === a.id);
                const done = tasks.filter((t) => t.status === "done").length;
                const pkgs = data.packages.filter((p) => p.agentId === a.id);
                const followUps = data.recommendations.filter(
                  (item) => item.agentId === a.id,
                );
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="team-person">
                        <Avatar agent={a} />
                        <div>
                          <strong>{a.name}</strong>
                          <small>{a.role}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {data.properties.filter((p) => p.agentId === a.id).length}
                    </td>
                    <td>{tasks.filter((t) => t.status === "open").length}</td>
                    <td>
                      {followUps.length ? (
                        <button
                          className="review-table-link"
                          onClick={() =>
                            navigation?.openFollowUps(followUps[0].agentId)
                          }
                        >
                          {followUps.length} open
                          <ArrowUpRight size={13} />
                        </button>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td>
                      {
                        tasks.filter((task) =>
                          isOverdue(task, data.workspace.referenceDate),
                        ).length
                      }
                    </td>
                    <td>
                      <div className="completion-cell">
                        <strong>
                          {done}/{tasks.length}
                        </strong>
                        <Progress done={done} total={tasks.length} />
                      </div>
                    </td>
                    <td>
                      {pkgs.some((p) => p.status === "pending") ? (
                        <button
                          className="review-table-link"
                          onClick={() =>
                            onReview(
                              pkgs.find((p) => p.status === "pending")?.id,
                            )
                          }
                        >
                          {pkgs.filter((p) => p.status === "pending").length}{" "}
                          {pkgs.filter((p) => p.status === "pending").length ===
                          1
                            ? "review"
                            : "reviews"}
                          <ArrowUpRight size={13} />
                        </button>
                      ) : (
                        <span className="caught-up">
                          <Check size={13} />
                          Caught up
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="prepared-count">
                        {pkgs.filter((p) => p.origin === "openai").length} live
                        · {pkgs.filter((p) => p.origin === "sample").length}{" "}
                        saved
                      </span>
                      <div className="small-text muted">
                        {
                          (data.workProducts || [])
                            .filter((product) => product.agentId === a.id)
                            .flatMap((product) => product.versions)
                            .filter(
                              (version) =>
                                version.status === "approved" && version.hasPdf,
                            ).length
                        }{" "}
                        approved PDF versions ·{" "}
                        {
                          (data.workProducts || [])
                            .filter((product) => product.agentId === a.id)
                            .flatMap((product) => product.versions)
                            .filter((version) => version.status === "pending")
                            .length
                        }{" "}
                        documents in review
                      </div>
                      <div className="small-text muted">
                        {
                          data.activities.filter(
                            (item) => item.agentId === a.id,
                          ).length
                        }{" "}
                        recorded activities
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="team-bottom-grid">
        <section className="team-recent">
          <SectionTitle title="Forward, one detail at a time" />
          <div className="activity-list">
            {data.activities.slice(0, 4).map((a) => (
              <div key={a.id}>
                <span className="activity-dot">
                  <Activity size={13} />
                </span>
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.detail}</p>
                  <small>{shortDate(a.createdAt)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="team-disclosure">
        <ShieldCheck size={15} />
        Leadership preview uses the shared sample workspace. It is not a
        production permission boundary. Counts describe available records, not
        productivity or external client contact.
      </div>
    </>
  );
}
