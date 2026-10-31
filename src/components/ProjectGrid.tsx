"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatBytes, timeAgo } from "@/lib/shared";
import { StatusBadge } from "./ui";
import SiteThumbnail from "./SiteThumbnail";
import { captureThumbnail, markThumbFailed, needsThumbnail } from "@/lib/client/shot";

type P = { name: string; slug: string; latest_status: string | null; latest_at: string | null; file_count: number | null; total_bytes: number | null; git_repo: string | null; version: number | null; thumb_deployment: number | null; thumb_at: number | null };

/** `projects` is the first page (12) from the server; the rest is fetched 12 at a time while the user scrolls. */
export default function ProjectGrid({ projects, total: initialTotal, host }: { projects: P[]; total: number; host: string }) {
  const [items, setItems] = useState<P[]>(projects);
  const [total, setTotal] = useState(initialTotal);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exhausted, setExhausted] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Record<string, { deployment: number; at: number }>>({}); // screenshots taken in this session
  const attempted = useRef(new Set<string>());
  const reqId = useRef(0); // only the newest request may change the list
  const lastReq = useRef({ offset: 0, q: "", replace: false }); // what to repeat if "Retry" is pressed
  const sentinel = useRef<HTMLDivElement>(null);
  const showSearch = useRef(initialTotal > 4).current; // keep the box visible while a search has no matches

  // the page was refreshed on the server (new project, deploy...): start again from its first page
  useEffect(() => {
    if (term) return;
    reqId.current++;
    setItems(projects); setTotal(initialTotal); setExhausted(false); setLoading(false); setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, initialTotal]);

  async function load(offset: number, q: string, replace: boolean) {
    const id = ++reqId.current;
    lastReq.current = { offset, q, replace };
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/projects?offset=${offset}&q=${encodeURIComponent(q)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not load projects.");
      if (id !== reqId.current) return;
      const page = json.projects as P[];
      setTotal(json.total as number);
      if (replace) { setItems(page); setExhausted(false); }
      else {
        // a project added meanwhile can shift the pages: never show a card twice
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.slug));
          const add = page.filter((p) => !seen.has(p.slug));
          if (add.length === 0) setExhausted(true);
          return [...prev, ...add];
        });
      }
    } catch (e) {
      if (id === reqId.current) setError((e as Error).message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  // searching asks the database (the browser only holds the cards loaded so far)
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const t = setTimeout(() => load(0, term.trim(), true), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  // when the end of the list scrolls into view, fetch the next 12
  const hasMore = items.length < total && !exhausted;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading || error) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) load(items.length, term.trim(), false);
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, error, items.length, term]);

  // the cards loaded so far, plus any screenshot taken since the page loaded
  const merged = items.map((p) => (fresh[p.slug] ? { ...p, thumb_deployment: fresh[p.slug].deployment, thumb_at: fresh[p.slug].at } : p));

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
  }, [items, fresh, capturing]);

  const empty = merged.length === 0 && !loading;
  return (
    <div className="stack">
      {showSearch && <input className="input" placeholder="Search projects…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search projects" />}
      {empty ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
          <h2>{term ? "No matches" : "No projects yet"}</h2>
          {!term && <p className="sub" style={{ marginBottom: 18 }}>Deploy a single HTML file, a folder or a GitHub repo and get a live URL.</p>}
          {!term && <Link className="btn btn-primary" href="/dashboard/new">Create your first project</Link>}
        </div>
      ) : (
        <div className="grid">
          {merged.map((p) => (
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
      {loading && <div className="row" style={{ justifyContent: "center", padding: 8 }} role="status"><i className="spin" aria-hidden="true" /><span className="sub" style={{ margin: 0 }}>Loading projects…</span></div>}
      {error && (
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="error">{error}</span>
          <button className="btn btn-sm" onClick={() => load(lastReq.current.offset, lastReq.current.q, lastReq.current.replace)}>Retry</button>
        </div>
      )}
      {hasMore && <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />}
    </div>
  );
}