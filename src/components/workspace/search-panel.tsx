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
  return (
    <Modal title="Find your next step." onClose={onClose}>
      <div className="search-panel">
        <label className="global-search">
          <Search size={20} />
          <input
            autoFocus
            placeholder="Search properties, people, or prepared work…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search workspace"
          />
        </label>
        {properties.length > 0 && (
          <>
            <h3 className="small-heading">PROPERTIES</h3>
            {properties.map((p) => (
              <button key={p.id} onClick={() => onProperty(p.id)}>
                <House size={17} />
                <span>
                  {p.address}
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
            {clients.map((c) => (
              <button key={c.id} onClick={() => onClient(c.id)}>
                <Users size={17} />
                <span>
                  {c.name}
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
            {packages.map((p) => (
              <button key={p.id} onClick={() => onReview(p.id)}>
                <Inbox size={17} />
                <span>
                  {p.title}
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
            title="Nothing here just yet"
            description="Try a name, address, or conversation topic."
          />
        )}
      </div>
    </Modal>
  );
}
