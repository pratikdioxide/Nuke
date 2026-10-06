"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cleanPath, formatBytes, isTextPath } from "@/lib/shared";
import { createDeploy, itemsFromInput, pushItems, textItem, type Item } from "@/lib/client/upload";

type F = { path: string; hash: string; size: number };

export default function FileEditor({ slug, files }: { slug: string; files: F[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(files.find((f) => f.path === "index.html")?.path ?? files[0]?.path ?? null);
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, Item>>({}); // path -> new content
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const paths = useMemo(() => {
    const all = new Set(files.map((f) => f.path));
    Object.keys(edits).forEach((p) => all.add(p));
    deleted.forEach((p) => all.delete(p));
    return [...all].sort();
  }, [files, edits, deleted]);
  const changes = Object.keys(edits).length + deleted.size;
  const sizeOf = (p: string) => edits[p]?.data.length ?? files.find((f) => f.path === p)?.size ?? 0;

  async function open(path: string) {
    setSelected(path);
    setError("");
    if (!isTextPath(path) || path in loaded || edits[path]) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${slug}/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Could not load this file.");
      const text = await res.text();
      setLoaded((l) => ({ ...l, [path]: text }));
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }

  const current = selected ? (edits[selected] ? new TextDecoder().decode(edits[selected].data) : loaded[selected]) : undefined;

  function change(path: string, text: string) {
    setEdits((e) => ({ ...e, [path]: textItem(path, text) }));
    setDeleted((d) => { const n = new Set(d); n.delete(path); return n; });
  }
  function addFile() {
    const raw = window.prompt("New file path (e.g. about.html or css/style.css)");
    if (!raw) return;
    try { const p = cleanPath(raw); change(p, ""); setLoaded((l) => ({ ...l, [p]: "" })); setSelected(p); }
    catch (e) { setError((e as Error).message); }
  }
  function remove() {
    if (!selected || !window.confirm(`Delete ${selected}?`)) return;
    setEdits((e) => { const n = { ...e }; delete n[selected]; return n; });
    setDeleted((d) => new Set(d).add(selected));
    setSelected(null);
  }
  async function addUploads(list: FileList) {
    try {
      const its = await itemsFromInput(list);
      setEdits((e) => { const n = { ...e }; its.forEach((i) => (n[i.path] = i)); return n; });
      setDeleted((d) => { const n = new Set(d); its.forEach((i) => n.delete(i.path)); return n; });
    } catch (e) { setError((e as Error).message); }
  }

  async function commit() {
    setBusy(true); setError("");
    try {
      const keep = files.filter((f) => !deleted.has(f.path) && !edits[f.path]);
      const changed = await pushItems(Object.values(edits));
      const result = await createDeploy(slug, { files: [...keep, ...changed], message: message || `Edited ${changes} file(s)` });
      router.push(`/dashboard/${slug}/deployments/${result.number}`);
      router.refresh();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const text = selected && isTextPath(selected);
  return (
    <div className="stack">
      <div className="card">
        <div className="files">
          <div className="tree">
            <div className="row" style={{ padding: "4px 4px 10px" }}>
              <button type="button" className="btn btn-sm" onClick={addFile}>+ New file</button>
              <label className="btn btn-sm" style={{ cursor: "pointer" }}>Upload
                <input type="file" multiple hidden onChange={(e) => e.target.files && addUploads(e.target.files)} />
              </label>
            </div>
            {paths.length === 0 && <p className="hint" style={{ padding: 8 }}>No files yet. Deploy something first from the Overview tab.</p>}
            {paths.map((p) => (
              <button key={p} type="button" className={`node mono ${selected === p ? "sel" : ""}`} onClick={() => open(p)}>
                <span>{p}</span>{edits[p] && <span className="mod">●</span>}
              </button>
            ))}
          </div>
          <div className="editor">
            <div className="bar">
              <span className="mono" style={{ overflowWrap: "anywhere" }}>{selected ?? "Select a file"}{selected && <span className="hint"> · {formatBytes(sizeOf(selected))}</span>}</span>
              {selected && <button type="button" className="btn btn-sm btn-danger" onClick={remove}>Delete</button>}
            </div>
            {!selected ? <p className="hint" style={{ padding: 20 }}>Pick a file on the left.</p>
              : !text ? (
                <div style={{ padding: 20 }}>
                  <p className="hint">Binary file. Replace it with the Upload button.</p>
                  <a className="btn btn-sm" href={`/${slug}/${selected}`} target="_blank" rel="noopener">Open</a>
                </div>
              ) : (
                <textarea className="textarea mono" spellCheck={false} value={loading ? "Loading…" : current ?? ""} readOnly={loading}
                  onChange={(e) => change(selected, e.target.value)} aria-label={`Contents of ${selected}`} />
              )}
          </div>
        </div>
      </div>
      <div className="card card-pad stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span>{changes ? `${changes} pending change${changes === 1 ? "" : "s"}` : "No changes yet"}</span>
          {changes > 0 && <button type="button" className="btn btn-sm" onClick={() => { setEdits({}); setDeleted(new Set()); setLoaded({}); }}>Discard</button>}
        </div>
        <input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Commit message (optional)" />
        {error && <p className="error" role="alert">{error}</p>}
        <div><button type="button" className="btn btn-primary" disabled={!changes || busy} onClick={commit}>{busy ? "Deploying…" : "Commit & deploy"}</button></div>
      </div>
    </div>
  );
}
