"use client";

import { ArrowUpRight, Users, Check, ShieldCheck } from "lucide-react";
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
      <div className="team-briefing">
        <AssistantIcon index={4} />
        <div>
          <div className="eyebrow">A NOTE FROM YOUR TEAM COACH</div>
          <h2>A few small moves can make a big difference.</h2>
          <p>
            {insight.summary} {insight.coaching}
          </p>
          <p className="small-text">
            {completed.length} tasks marked complete · {insight.liveUsers}{" "}
            agents with live AI packages · {insight.livePackages.length} live AI
            packages. Saved sample output is excluded from live usage.
          </p>
          <p className="small-text">
            {approvedDocuments.length} approved PDF{" "}
            {approvedDocuments.length === 1 ? "version" : "versions"} saved ·{" "}
            {pendingDocuments.length} document{" "}
            {pendingDocuments.length === 1 ? "version" : "versions"} awaiting
            review. These are produced documents, not delivery confirmations.
          </p>
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
                          onClick={() => onClient(followUps[0].clientId)}
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
                            ? "package"
                            : "packages"}
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
        <section className="bottlenecks">
          <SectionTitle
            title="A little support goes a long way"
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
                  {tasks.length} open tasks · {dependencies.length} unresolved
                  dependencies
                </span>
              </div>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {!bottlenecks.length && (
            <Empty
              title="Nothing holding you back"
              description="No recorded listing tasks or dependencies are outstanding."
            />
          )}
        </section>
        <section className="team-recent">
          <SectionTitle title="Forward, one detail at a time" />
          <div className="activity-list">
            {data.activities.slice(0, 4).map((a) => (
              <div key={a.id}>
                <span className="activity-dot">
                  <Check size={13} />
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
