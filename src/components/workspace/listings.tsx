"use client";

import { activeSituationImpacts } from "@/lib/intelligence";
import { useState } from "react";
import {
  ArrowUpRight,
  House,
  Search,
  ChevronRight,
  MapPin,
} from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
import { Avatar, Badge, Empty, money } from "../ui";
import { Progress } from "./shared";
import { orderedTasks } from "@/lib/workspace-insights";

export function Listings({
  data,
  onProperty,
}: {
  data: WorkspaceData;
  onProperty: (id: string) => void;
}) {
  const [filter, setFilter] = useState("All properties");
  const [query, setQuery] = useState("");
  const stages = [
    "All properties",
    ...new Set(data.properties.map((p) => p.stage)),
  ];
  const filtered = [...data.properties]
    .sort(
      (a, b) =>
        (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") ||
        a.address.localeCompare(b.address),
    )
    .filter(
      (p) =>
        (filter === "All properties" || p.stage === filter) &&
        `${p.address} ${p.city}`.toLowerCase().includes(query.toLowerCase()),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            FROM FIRST CONVERSATION TO THE NEXT CHAPTER
          </div>
          <h1>
            Every home has a story<span className="heading-dot">.</span>
          </h1>
          <p>Keep every detail moving, beautifully.</p>
        </div>
        <div className="listing-total">
          <strong>{data.properties.length}</strong>
          <span>
            properties
            <br />
            in your workspace
          </span>
        </div>
      </div>
      <div className="listing-toolbar">
        <div className="filter-chips">
          {stages.map((s) => (
            <button
              key={s}
              className={filter === s ? "active" : ""}
              onClick={() => setFilter(s)}
            >
              {s}
              {s === "All properties" && <span>{data.properties.length}</span>}
            </button>
          ))}
        </div>
        <label className="inline-search">
          <Search size={16} />
          <input
            aria-label="Search properties"
            placeholder="Find a property"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="property-grid">
        {filtered.map((p, i) => {
          const tasks = orderedTasks(
            data.tasks.filter((t) => t.propertyId === p.id),
            data.workspace.referenceDate,
          );
          const done = tasks.filter((t) => t.status === "done").length;
          const agent = data.agents.find((a) => a.id === p.agentId)!;
          const next = tasks.find((t) => t.status === "open");
          const dependency = data.commitments.find(
            (item) => item.propertyId === p.id && item.status === "open",
          );
          return (
            <button
              className={`listing-card ${i === 0 ? "featured" : ""}`}
              key={p.id}
              onClick={() => onProperty(p.id)}
            >
              <div className="listing-image">
                <img src={p.image} alt={p.description} />
                <Badge tone="white">{p.stage}</Badge>
                <span className="round-arrow">
                  <ArrowUpRight size={19} />
                </span>
                <div className="listing-price">
                  {money(p.price)}
                  <span>Sample asking price</span>
                </div>
              </div>
              <div className="listing-card-body">
                <div className="listing-card-title">
                  <div>
                    <h2>{p.address}</h2>
                    <p>
                      <MapPin size={12} />
                      {p.city}
                    </p>
                  </div>
                  <Avatar agent={agent} small />
                </div>
                <div className="property-specs">
                  <span>{p.beds} beds</span>
                  <span>{p.baths} baths</span>
                  <span>{p.sqft.toLocaleString()} sq ft</span>
                </div>
                <div className="listing-progress">
                  <span>Preparation progress</span>
                  <strong>
                    {done}/{tasks.length}
                  </strong>
                </div>
                <Progress done={done} total={tasks.length} />
                {activeSituationImpacts(data).some(
                  (i) => i.propertyId === p.id,
                ) && (
                  <p className="intelligence-warning small-text">
                    Updated plans · connected work needs review
                  </p>
                )}
                <div className="listing-next">
                  <span className={`mini-dot ${next ? "amber" : ""}`} />
                  {dependency
                    ? dependency.title
                    : next
                      ? next.title
                      : tasks.length
                        ? "Recorded tasks complete"
                        : "No preparation tasks recorded"}
                  <ChevronRight size={14} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!filtered.length && (
        <Empty
          title="No homes found"
          description="Try a different address or stage."
        />
      )}
      <div className="listing-endnote">
        <House size={17} />
        <p>
          Beautiful homes. Thoughtful preparation. Every detail has a place.
        </p>
      </div>
    </>
  );
}
