"use client";
import Link from "next/link";
import { useState } from "react";
import { formatBytes, timeAgo } from "@/lib/shared";
import { StatusBadge } from "./ui";

type P = { name: string; slug: string; latest_status: string | null; latest_at: string | null; file_count: number | null; total_bytes: number | null; git_repo: string | null };

export default function ProjectGrid({ projects, host }: { projects: P[]; host: string }) {
  const [term, setTerm] = useState("");
  const list = projects.filter((p) => (p.name + p.slug).toLowerCase().includes(term.toLowerCase()));
  return (
    <div className="stack">
      {projects.length > 4 && <input className="input" placeholder="Search projects…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search projects" />}
      {list.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
          <h2>{projects.length ? "No matches" : "No projects yet"}</h2>
          {!projects.length && <p className="sub" style={{ marginBottom: 18 }}>Deploy a single HTML file, a folder or a GitHub repo and get a live URL.</p>}
          {!projects.length && <Link className="btn btn-primary" href="/dashboard/new">Create your first project</Link>}
        </div>
      ) : (
        <div className="grid">
          {list.map((p) => (
            <Link key={p.slug} href={`/dashboard/${p.slug}`} className="card project">
              <h3>{p.name}</h3>
              <div className="url mono">{host}/{p.slug}</div>
              <div className="meta">
                <StatusBadge status={p.latest_status} />
                <span>{timeAgo(p.latest_at)}</span>
                {p.file_count != null && <span>{p.file_count} files · {formatBytes(Number(p.total_bytes))}</span>}
                {p.git_repo && <span className="mono">{p.git_repo}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
