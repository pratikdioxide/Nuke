"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatBytes, timeAgo } from "@/lib/shared";
import { StatusBadge } from "./ui";
import SiteThumbnail from "./SiteThumbnail";
import { captureThumbnail, markThumbFailed, needsThumbnail } from "@/lib/client/shot";

type P = { name: string; slug: string; latest_status: string | null; latest_at: string | null; file_count: number | null; total_bytes: number | null; git_repo: string | null; version: number | null; thumb_deployment: number | null; thumb_at: number | null };

export default function ProjectGrid({ projects, host }: { projects: P[]; host: string }) {
  const [term, setTerm] = useState("");
  const [capturing, setCapturing] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Record<string, { deployment: number; at: number }>>({}); // screenshots taken in this session
  const attempted = useRef(new Set<string>());

  // the list from the server, plus any screenshot taken since the page loaded
  const merged = projects.map((p) => (fresh[p.slug] ? { ...p, thumb_deployment: fresh[p.slug].deployment, thumb_at: fresh[p.slug].at } : p));

  // Take a screenshot only when a project is new or its live deployment changed (never on every visit). One at a time.
  useEffect(() => {
    if (capturing) return;
    const next = merged.find((p) => needsThumbnail(p) && !attempted.current.has(`${p.slug}@${p.version}`));
    if (!next) return;
    attempted.current.add(`${next.slug}@${next.version}`);
    setCapturing(next.slug);
    captureThumbnail(next.slug)
      .then((r) => setFresh((f) => ({ ...f, [next.slug]: r })))
      .catch(() => { markThumbFailed(next.slug, next.version!); setFailed((f) => new Set(f).add(next.slug)); })
      .finally(() => setCapturing(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, fresh, capturing]);

  const list = merged.filter((p) => (p.name + p.slug).toLowerCase().includes(term.toLowerCase()));
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
              <SiteThumbnail slug={p.slug} thumbAt={p.thumb_at} deployed={p.version !== null} capturing={capturing === p.slug} failed={failed.has(p.slug)} />
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
