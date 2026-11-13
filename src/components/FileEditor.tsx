"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zipSync } from "fflate";
import { classifyPath, cleanPath, formatBytes, isTextPath } from "@/lib/shared";
import { FileIcon, FolderIcon } from "@/components/FileIcon";
import { createDeploy, itemsFromInput, pushItems, textItem, type Item } from "@/lib/client/upload";

type F = { path: string; hash: string; size: number };
// One live file in the editor. `from` = its path on the server (if it already exists there),
// `ref` = the server copy, `item` = new content typed/uploaded here, `loaded` = text fetched from the server.
type Entry = { from?: string; ref?: F; item?: Item; loaded?: string };
type Work = Record<string, Entry>;
type TNode = { name: string; path: string; dir: boolean; children: TNode[] };
type Target = { kind: "file" | "folder" | "root"; path: string };
type Menu = { x: number; y: number; target: Target };
type Prompt = { mode: "file" | "folder" | "rename"; target: Target; value: string };

const initWork = (files: F[]): Work => Object.fromEntries(files.map((f) => [f.path, { from: f.path, ref: f }]));
const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function Ico({ d, size = 15, w = 2, style }: { d: string[]; size?: number; w?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", ...style }}>
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const P = {
  chevron: ["m9 6 6 6-6 6"],
  dots: ["M12 5h.01", "M12 12h.01", "M12 19h.01"],
  filePlus: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M12 12v6", "M9 15h6"],
  folderPlus: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M12 11v6", "M9 14h6"],
  upload: ["M12 16V4", "m7 9 5-5 5 5", "M5 20h14"],
  pencil: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  trash: ["M3 6h18", "M8 6V4h8v2", "m19 6-1 14H6L5 6", "M10 11v6", "M14 11v6"],
  download: ["M12 3v12", "m7 11 5 5 5-5", "M5 21h14"],
};
const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 } as const;

export default function FileEditor({ slug, files }: { slug: string; files: F[] }) {
  const router = useRouter();
  const defaultSelected = files.find((f) => f.path === "index.html")?.path ?? files[0]?.path ?? null;
  const [work, setWork] = useState<Work>(() => initWork(files));
  const [emptyDirs, setEmptyDirs] = useState<Set<string>>(new Set()); // folders created here that have no file yet
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set()); // all folders start closed
  const [selected, setSelected] = useState<string | null>(defaultSelected);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [promptError, setPromptError] = useState("");
  const [confirmDel, setConfirmDel] = useState<Target | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadDir = useRef("");

  const paths = useMemo(() => Object.keys(work), [work]);

  // Every folder = parents of all files + folders created empty.
  const folderSet = useMemo(() => {
    const s = new Set<string>();
    const add = (p: string) => { const parts = p.split("/"); for (let i = 1; i <= parts.length; i++) s.add(parts.slice(0, i).join("/")); };
    paths.forEach((p) => { const d = parentOf(p); if (d) add(d); });
    emptyDirs.forEach(add);
    return s;
  }, [paths, emptyDirs]);

  const tree = useMemo(() => {
    const root: TNode = { name: "", path: "", dir: true, children: [] };
    const dirs = new Map<string, TNode>([["", root]]);
    const ensure = (p: string): TNode => {
      const hit = dirs.get(p);
      if (hit) return hit;
      const node: TNode = { name: baseOf(p), path: p, dir: true, children: [] };
      ensure(parentOf(p)).children.push(node);
      dirs.set(p, node);
      return node;
    };
    folderSet.forEach(ensure);
    paths.forEach((p) => ensure(parentOf(p)).children.push({ name: baseOf(p), path: p, dir: false, children: [] }));
    const sort = (n: TNode) => {
      n.children.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name)));
      n.children.forEach(sort);
    };
    sort(root);
    return root;
  }, [folderSet, paths]);

  // Pending changes = edited/new/renamed files + files removed from the live version.
  const changes = useMemo(() => {
    let n = 0;
    const kept = new Set<string>();
    for (const [p, e] of Object.entries(work)) { if (e.from) kept.add(e.from); if (e.item || e.from !== p) n++; }
    for (const f of files) if (!kept.has(f.path)) n++;
    return n;
  }, [work, files]);

  const isMod = (p: string) => !!work[p]?.item || work[p]?.from !== p;
  const sizeOf = (p: string) => work[p]?.item?.data.length ?? work[p]?.ref?.size ?? 0;

  // ---------- tree helpers ----------
  function reveal(p: string, includeSelf = false) {
    const parts = p.split("/");
    const end = includeSelf ? parts.length : parts.length - 1;
    setOpenDirs((o) => { const n = new Set(o); for (let i = 1; i <= end; i++) n.add(parts.slice(0, i).join("/")); return n; });
  }
  function toggle(p: string) {
    setOpenDirs((o) => { const n = new Set(o); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  }
  function dropEmptyAncestors(p: string) {
    const parts = p.split("/");
    setEmptyDirs((s) => { const n = new Set(s); for (let i = 1; i < parts.length; i++) n.delete(parts.slice(0, i).join("/")); return n; });
  }
  function assertFree(full: string, kind: "file" | "folder") {
    if (classifyPath(kind === "folder" ? `${full}/x` : full) !== "ok") throw new Error("That name is not allowed (secret files and ignored folders cannot be published).");
    const parts = full.split("/");
    for (let i = 1; i < parts.length; i++) {
      const up = parts.slice(0, i).join("/");
      if (work[up]) throw new Error(`"${up}" is a file, not a folder.`);
    }
    if (work[full]) throw new Error(`A file named "${full}" already exists.`);
    if (folderSet.has(full)) throw new Error(`A folder named "${full}" already exists.`);
  }

  // ---------- file actions ----------
  async function openFile(path: string) {
    setSelected(path);
    setError("");
    const e = work[path];
    if (!e || e.item || e.loaded !== undefined || !e.from || !isTextPath(path) || !isTextPath(e.from)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${slug}/file?path=${encodeURIComponent(e.from)}`);
      if (!res.ok) throw new Error("Could not load this file.");
      const text = await res.text();
      setWork((w) => (w[path] ? { ...w, [path]: { ...w[path], loaded: text } } : w));
    } catch (err) { setError((err as Error).message); }
    setLoading(false);
  }

  const sel = selected ? work[selected] : undefined;
  const current = sel ? (sel.item ? new TextDecoder().decode(sel.item.data) : sel.loaded) : undefined;
  const canEdit = !!selected && isTextPath(selected) && (!sel?.from || isTextPath(sel.from));

  function change(path: string, text: string) {
    setWork((w) => ({ ...w, [path]: { ...w[path], item: textItem(path, text) } }));
  }

  function createFile(dir: string, name: string) {
    const full = cleanPath(dir ? `${dir}/${name}` : name);
    assertFree(full, "file");
    setWork((w) => ({ ...w, [full]: { item: textItem(full, ""), loaded: "" } }));
    dropEmptyAncestors(full);
    reveal(full);
    setSelected(full);
  }
  function createFolder(dir: string, name: string) {
    const full = cleanPath(dir ? `${dir}/${name}` : name);
    assertFree(full, "folder");
    setEmptyDirs((s) => new Set(s).add(full));
    reveal(full, true);
  }
  function renameTarget(t: Target, raw: string) {
    const name = raw.trim();
    if (!name || name === "." || name === ".." || /[\\/]/.test(name)) throw new Error("Use a plain name without slashes.");
    const dir = parentOf(t.path);
    const full = dir ? `${dir}/${name}` : name;
    if (full === t.path) return;
    if (t.kind === "file") {
      assertFree(full, "file");
      setWork((w) => { const n = { ...w }; n[full] = n[t.path]; delete n[t.path]; return n; });
      if (selected === t.path) setSelected(full);
      return;
    }
    assertFree(full, "folder");
    const pre = `${t.path}/`;
    const remap = (p: string) => (p === t.path ? full : p.startsWith(pre) ? `${full}/${p.slice(pre.length)}` : p);
    setWork((w) => { const n: Work = {}; for (const [p, e] of Object.entries(w)) n[remap(p)] = e; return n; });
    setEmptyDirs((s) => new Set([...s].map(remap)));
    setOpenDirs((s) => new Set([...s].map(remap)));
    if (selected) setSelected(remap(selected));
  }
  function deleteTarget(t: Target) {
    setMenu(null);
    setConfirmDel(t);
  }
  function doDelete(t: Target) {
    setConfirmDel(null);
    if (t.kind === "file") {
      setWork((w) => { const n = { ...w }; delete n[t.path]; return n; });
      if (selected === t.path) setSelected(null);
      return;
    }
    const pre = `${t.path}/`;
    const inside = (p: string) => p === t.path || p.startsWith(pre);
    setWork((w) => { const n: Work = {}; for (const [p, e] of Object.entries(w)) if (!inside(p)) n[p] = e; return n; });
    setEmptyDirs((s) => new Set([...s].filter((p) => !inside(p))));
    setOpenDirs((s) => new Set([...s].filter((p) => !inside(p))));
    if (selected && inside(selected)) setSelected(null);
  }
  async function addUploads(list: File[]) {
    try {
      const dir = uploadDir.current;
      const its = await itemsFromInput(list);
      const fresh = its
        .map((i) => ({ ...i, path: cleanPath(dir ? `${dir}/${i.path}` : i.path) }))
        .filter((i) => classifyPath(i.path) === "ok" && !folderSet.has(i.path));
      if (!fresh.length) throw new Error("Nothing to add (those files are not allowed or clash with a folder).");
      setWork((w) => {
        const n = { ...w };
        for (const i of fresh) n[i.path] = { from: n[i.path]?.from, ref: n[i.path]?.ref, item: i };
        return n;
      });
      fresh.forEach((i) => { dropEmptyAncestors(i.path); reveal(i.path); });
    } catch (e) { setError((e as Error).message); }
  }

  async function commit() {
    setBusy(true); setError("");
    try {
      const entries = Object.entries(work);
      const keep = entries.filter(([, e]) => e.ref && !e.item).map(([p, e]) => ({ path: p, hash: e.ref!.hash, size: e.ref!.size }));
      const changed = await pushItems(entries.filter(([, e]) => e.item).map(([p, e]) => ({ path: p, data: e.item!.data })));
      const result = await createDeploy(slug, { files: [...keep, ...changed], message: message || `Edited ${changes} file(s)` });
      router.push(`/dashboard/${slug}/deployments/${result.number}`);
      router.refresh();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  // Downloads what you see: unsaved edits come from the browser, everything else from the server.
  function downloadSelected() {
    if (!selected || !sel?.item) return;
    saveBlob(sel.item.data as BlobPart, baseOf(selected) || "file");
  }

  // Saves bytes from the browser as a file.
  function saveBlob(data: BlobPart, name: string, type = "application/octet-stream") {
    const href = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  // Bytes of one entry: unsaved content from the browser, otherwise the live copy from the server.
  async function bytesOf(e: Entry): Promise<Uint8Array> {
    if (e.item) return e.item.data;
    if (!e.from) return new Uint8Array();
    const res = await fetch(downloadUrl(e.from));
    if (!res.ok) throw new Error(`Could not download "${e.from}".`);
    return new Uint8Array(await res.arrayBuffer());
  }
  // Menu download: a file saves directly, a folder (or the whole project) saves as a .zip of what you see now.
  async function downloadTarget(t: Target) {
    setMenu(null);
    setError("");
    try {
      if (t.kind === "file") {
        const e = work[t.path];
        if (!e) return;
        saveBlob(new Uint8Array(await bytesOf(e)), baseOf(t.path) || "file");
        return;
      }
      const pre = t.path ? `${t.path}/` : "";
      const list = Object.entries(work).filter(([p]) => p.startsWith(pre));
      if (!list.length) throw new Error("This folder has no files to download.");
      const out: Record<string, Uint8Array> = {};
      for (const [p, e] of list) out[p.slice(pre.length)] = await bytesOf(e);
      saveBlob(new Uint8Array(zipSync(out)), `${t.path ? baseOf(t.path) : slug}.zip`, "application/zip");
    } catch (err) { setError((err as Error).message); }
  }

  // ---------- menu + dialog ----------
  function showMenu(e: RMouseEvent, target: Target, anchor?: DOMRect) {
    e.preventDefault();
    e.stopPropagation();
    const W = 196;
    const H = (target.kind === "file" ? 3 : target.kind === "folder" ? 6 : 4) * 40 + 20;
    let x = e.clientX, y = e.clientY;
    if (anchor) { x = anchor.right - W; y = anchor.bottom + 4; if (y + H > window.innerHeight - 8) y = anchor.top - H - 4; }
    x = Math.max(8, Math.min(x, window.innerWidth - W - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - H - 8));
    setMenu({ x, y, target });
  }
  function ask(mode: Prompt["mode"], target: Target) {
    setMenu(null);
    setPromptError("");
    setPrompt({ mode, target, value: mode === "rename" ? baseOf(target.path) : "" });
  }
  function pickUpload(dir: string) {
    setMenu(null);
    uploadDir.current = dir;
    fileInput.current?.click();
  }
  function submitPrompt(e: FormEvent) {
    e.preventDefault();
    if (!prompt) return;
    try {
      const dir = prompt.target.kind === "folder" ? prompt.target.path : "";
      if (prompt.mode === "file") createFile(dir, prompt.value);
      else if (prompt.mode === "folder") createFolder(dir, prompt.value);
      else renameTarget(prompt.target, prompt.value);
      setPrompt(null); setPromptError("");
    } catch (err) { setPromptError((err as Error).message); }
  }

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);
  useEffect(() => {
    if (!prompt && !confirmDel) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setPrompt(null); setConfirmDel(null); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [prompt, confirmDel]);

  // ---------- render ----------
  function renderNode(n: TNode, depth: number): ReactNode {
    const pad = 8 + depth * 14;
    if (n.dir) {
      const isOpen = openDirs.has(n.path);
      const target: Target = { kind: "folder", path: n.path };
      return (
        <div key={`d:${n.path}`}>
          <div className="nrow" onContextMenu={(e) => showMenu(e, target)}>
            <button type="button" className="node mono" style={{ paddingLeft: pad }} aria-expanded={isOpen} onClick={() => toggle(n.path)}>
              <Ico d={P.chevron} size={13} style={{ transition: "transform .16s ease", transform: isOpen ? "rotate(90deg)" : "none" }} />
              <FolderIcon name={n.name} open={isOpen} />
              <span className="nname">{n.name}</span>
            </button>
            <button type="button" className="nmenu" aria-label={`Actions for folder ${n.name}`} aria-haspopup="menu" onClick={(e) => showMenu(e, target, e.currentTarget.getBoundingClientRect())}><Ico d={P.dots} w={3} /></button>
          </div>
          {isOpen && (n.children.length
            ? n.children.map((c) => renderNode(c, depth + 1))
            : <div className="hint" style={{ padding: `4px 8px 4px ${pad + 38}px` }}>Empty folder</div>)}
        </div>
      );
    }
    const target: Target = { kind: "file", path: n.path };
    return (
      <div key={`f:${n.path}`} className="nrow" onContextMenu={(e) => showMenu(e, target)}>
        <button type="button" className={`node mono ${selected === n.path ? "sel" : ""}`} style={{ paddingLeft: pad + 21 }} onClick={() => openFile(n.path)}>
          <FileIcon name={n.name} />
          <span className="nname">{n.name}</span>
          {isMod(n.path) && <span className="mod" role="img" aria-label="Modified" />}
        </button>
        <button type="button" className="nmenu" aria-label={`Actions for ${n.name}`} aria-haspopup="menu" onClick={(e) => showMenu(e, target, e.currentTarget.getBoundingClientRect())}><Ico d={P.dots} w={3} /></button>
      </div>
    );
  }

  const downloadUrl = (p: string) => `/api/projects/${slug}/download?path=${encodeURIComponent(p)}`;
  const promptDir = prompt?.target.kind === "folder" ? prompt.target.path : "";
  const promptTitle = !prompt ? "" : prompt.mode === "rename" ? `Rename ${prompt.target.kind}` : prompt.mode === "file" ? (promptDir ? `New file in ${promptDir}/` : "New file") : (promptDir ? `New folder in ${promptDir}/` : "New folder");
  const menuItems = (t: Target): ReactNode => {
    const item = (icon: string[], label: string, fn: () => void, danger = false) => (
      <button key={label} type="button" role="menuitem" className={danger ? "danger" : ""} onClick={fn}><Ico d={icon} />{label}</button>
    );
    if (t.kind === "file") return [item(P.download, "Download", () => downloadTarget(t)), item(P.pencil, "Rename", () => ask("rename", t)), item(P.trash, "Delete file", () => { setMenu(null); deleteTarget(t); }, true)];
    if (t.kind === "folder") return [
      item(P.filePlus, "New file", () => ask("file", t)),
      item(P.folderPlus, "New folder", () => ask("folder", t)),
      item(P.upload, "Upload here", () => pickUpload(t.path)),
      item(P.download, "Download as .zip", () => downloadTarget(t)),
      item(P.pencil, "Rename", () => ask("rename", t)),
      item(P.trash, "Delete folder", () => { setMenu(null); deleteTarget(t); }, true),
    ];
    return [item(P.filePlus, "New file", () => ask("file", t)), item(P.folderPlus, "New folder", () => ask("folder", t)), item(P.upload, "Upload", () => pickUpload("")), item(P.download, "Download all as .zip", () => downloadTarget(t))];
  };

  const root: Target = { kind: "root", path: "" };
  return (
    <div className="stack">
      <div className="card">
        <div className="files">
          <div className="tree" onContextMenu={(e) => showMenu(e, root)}>
            <div className="row" style={{ padding: "4px 4px 10px" }}>
              <button type="button" className="btn btn-sm" style={iconBtn} onClick={() => ask("file", root)}><Ico d={P.filePlus} size={14} />File</button>
              <button type="button" className="btn btn-sm" style={iconBtn} onClick={() => ask("folder", root)}><Ico d={P.folderPlus} size={14} />Folder</button>
              <button type="button" className="btn btn-sm" style={iconBtn} onClick={() => pickUpload("")}><Ico d={P.upload} size={14} />Upload</button>
              {files.length > 0 && (
                <a className="btn btn-sm" style={iconBtn} href={`/api/projects/${slug}/download`} download title="Download all files as .zip (live version, unsaved edits not included)" aria-label="Download all files as zip"><Ico d={P.download} />ZIP</a>
              )}
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => { const list = Array.from(e.target.files ?? []); e.target.value = ""; if (list.length) addUploads(list); }} />
            </div>
            {paths.length === 0 && folderSet.size === 0 && <p className="hint" style={{ padding: 8 }}>No files yet. Deploy something first from the Overview tab, or add a file above.</p>}
            {tree.children.map((c) => renderNode(c, 0))}
          </div>
          <div className="editor">
            <div className="bar">
              <span className="mono" style={{ overflowWrap: "anywhere" }}>{selected ?? "Select a file"}{selected && <span className="hint"> · {formatBytes(sizeOf(selected))}</span>}</span>
              {selected && (
                <div className="row">
                  {sel?.item
                    ? <button type="button" className="btn btn-sm" style={iconBtn} onClick={downloadSelected} title="Download this file" aria-label={`Download ${selected}`}><Ico d={P.download} /></button>
                    : sel?.from && <a className="btn btn-sm" style={iconBtn} href={downloadUrl(sel.from)} download title="Download this file" aria-label={`Download ${selected}`}><Ico d={P.download} /></a>}
                  <button type="button" className="btn btn-sm" onClick={() => ask("rename", { kind: "file", path: selected })}>Rename</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteTarget({ kind: "file", path: selected })}>Delete</button>
                </div>
              )}
            </div>
            {!selected ? <p className="hint" style={{ padding: 20 }}>Pick a file from the tree.</p>
              : !canEdit ? (
                <div style={{ padding: 20 }}>
                  <p className="hint">Binary file. Replace it with the Upload button.</p>
                  {sel?.from && <div className="row"><a className="btn btn-sm" href={`/${slug}/${sel.from}`} target="_blank" rel="noopener">Open</a></div>}
                </div>
              ) : (
                <textarea className="textarea mono" spellCheck={false} value={current ?? (loading ? "Loading…" : "")} readOnly={current === undefined}
                  onChange={(e) => change(selected, e.target.value)} aria-label={`Contents of ${selected}`} />
              )}
          </div>
        </div>
      </div>
      <div className="card card-pad stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span>{changes ? `${changes} pending change${changes === 1 ? "" : "s"}` : "No changes yet"}</span>
          {changes > 0 && <button type="button" className="btn btn-sm" onClick={() => { setWork(initWork(files)); setEmptyDirs(new Set()); setSelected(defaultSelected); }}>Discard</button>}
        </div>
        <input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Commit message (optional)" />
        {error && <p className="error" role="alert">{error}</p>}
        <div><button type="button" className="btn btn-primary" disabled={!changes || busy} onClick={commit}>{busy ? "Deploying…" : "Commit & deploy"}</button></div>
      </div>

      {menu && (
        <>
          <div className="ctx-back" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="ctx" role="menu" style={{ left: menu.x, top: menu.y }}>{menuItems(menu.target)}</div>
        </>
      )}
      {confirmDel && (() => {
        const t = confirmDel;
        const count = t.kind === "folder" ? paths.filter((p) => p.startsWith(`${t.path}/`)).length : 0;
        return (
          <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDel(null); }}>
            <div className="modal card card-pad stack" role="alertdialog" aria-modal="true" aria-label={`Delete ${t.path}`}>
              <h2>{t.kind === "folder" ? "Delete folder?" : "Delete file?"}</h2>
              <p className="hint" style={{ margin: 0, fontSize: 13, overflowWrap: "anywhere" }}>
                <span className="mono" style={{ color: "var(--text)" }}>{t.path}</span>
                {t.kind === "folder" && ` and the ${count} file${count === 1 ? "" : "s"} inside will be removed`}
                {t.kind === "file" && " will be removed"} from the next deployment. Nothing goes live until you press Commit &amp; deploy, and Discard brings it back.
              </p>
              <div className="row">
                <button type="button" className="btn btn-danger btn-sm" onClick={() => doDelete(t)}>Delete</button>
                <button type="button" className="btn btn-sm" autoFocus onClick={() => setConfirmDel(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
      {prompt && (
        <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setPrompt(null); }}>
          <form className="modal card card-pad stack" role="dialog" aria-modal="true" aria-label={promptTitle} onSubmit={submitPrompt}>
            <h2>{promptTitle}</h2>
            <label className="field">{prompt.mode === "rename" ? "New name" : prompt.mode === "file" ? "File name or path" : "Folder name or path"}
              <input className="input mono" autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false} value={prompt.value}
                onFocus={(e) => prompt.mode === "rename" && e.currentTarget.select()}
                onChange={(e) => { setPrompt({ ...prompt, value: e.target.value }); setPromptError(""); }}
                placeholder={prompt.mode === "file" ? "about.html or css/style.css" : prompt.mode === "folder" ? "api or assets/img" : ""} />
            </label>
            {promptError && <p className="error" role="alert">{promptError}</p>}
            <div className="row">
              <button type="submit" className="btn btn-primary btn-sm">{prompt.mode === "rename" ? "Rename" : "Create"}</button>
              <button type="button" className="btn btn-sm" onClick={() => setPrompt(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
