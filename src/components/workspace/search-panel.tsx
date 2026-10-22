"use client";

import { useState } from "react";
import { ArrowUpRight, Inbox, House, Users, Search } from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
import { Empty, Modal } from "../ui";

export function SearchPanel({
  data,
  onClose,
  onProperty,
  onClient,
  onReview,
}: {
  data: WorkspaceData;
  onClose: () => void;
  onProperty: (id: string) => void;
  onClient: (id: string) => void;
  onReview: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase().trim();
  const properties = data.properties.filter((p) =>
    `${p.address} ${p.city}`.toLowerCase().includes(q),
  );
  const clients = data.clients.filter((c) => c.name.toLowerCase().includes(q));
  const packages = data.packages.filter((p) =>
    p.title.toLowerCase().includes(q),
  );
  const count = properties.length + clients.length + packages.length;
  const highlight = (text: string) => {
    if (!q) return text;
    const start = text.toLowerCase().indexOf(q);
    return start < 0 ? (
      text
    ) : (
      <>
        {text.slice(0, start)}
        <mark>{text.slice(start, start + q.length)}</mark>
        {text.slice(start + q.length)}
      </>
    );
  };
  return (
    <Modal
      title="Find your next step."
      onClose={onClose}
      initialFocus="[data-search-input]"
    >
      <div className="search-panel">
        <label className="global-search">
          <Search size={20} />
          <input
            data-search-input
            placeholder="Search properties, people, or prepared work…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search workspace"
          />
        </label>
        <p className="search-count" role="status">
          {q
            ? `${count} ${count === 1 ? "result" : "results"}`
            : "A few places to start. Type to search the full workspace."}
        </p>
        {properties.length > 0 && (
          <>
            <h3 className="small-heading">PROPERTIES</h3>
            {properties.slice(0, q ? undefined : 3).map((p) => (
              <button key={p.id} onClick={() => onProperty(p.id)}>
                <House size={17} />
                <span>
                  {highlight(p.address)}
                  <small>{p.city}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </>
        )}
        {clients.length > 0 && (
          <>
            <h3 className="small-heading">PEOPLE</h3>
            {clients.slice(0, q ? undefined : 3).map((c) => (
              <button key={c.id} onClick={() => onClient(c.id)}>
                <Users size={17} />
                <span>
                  {highlight(c.name)}
                  <small>{c.type}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </>
        )}
        {packages.length > 0 && (
          <>
            <h3 className="small-heading">PREPARED WORK</h3>
            {packages.slice(0, q ? undefined : 3).map((p) => (
              <button key={p.id} onClick={() => onReview(p.id)}>
                <Inbox size={17} />
                <span>
                  {highlight(p.title)}
                  <small>
                    {p.status === "pending" ? "Ready for review" : "Reviewed"}
                  </small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </>
        )}
        {!properties.length && !clients.length && !packages.length && (
          <Empty
            kind="search"
            title={
              q
                ? `No results for “${query.trim()}”`
                : "Your workspace is ready to grow"
            }
            description="Try a client name, property address, or prepared-work title."
          />
        )}
      </div>
    </Modal>
  );
}
