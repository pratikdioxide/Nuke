"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/lib/shared";
import { checkItems, createDeploy, itemsFromDrop, itemsFromInput, pushItems, textItem, type Item } from "@/lib/client/upload";

type Mode = "upload" | "paste" | "github";

export default function Uploader({ slug: fixedSlug, getSlug: createSlug, existing = false, git }: {
  slug?: string;
  getSlug?: () => Promise<string | null>;
  existing?: boolean;
  git?: { repo: string; branch: string; dir: string } | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("upload");
  const [items, setItems] = useState<Item[]>([]);
  const [pastedFiles, setPastedFiles] = useState([{ id: 0, path: "index.html", content: "" }]);
  const nextPastedFileId = useRef(1);
  const [repo, setRepo] = useState(git?.repo ?? "");
  const [branch, setBranch] = useState(git?.branch ?? "");
  const [dir, setDir] = useState(git?.dir ?? "");
  const [message, setMessage] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const total = items.reduce((n, i) => n + i.data.length, 0);

  async function take(promise: Promise<Item[]>) {
    setError("");
    try { setItems(await promise); } catch (e) { setError((e as Error).message || "Could not read those files."); }
  }

  async function deploy() {
    setError("");
    setBusy(true);
    try {
      let prepared: Item[] = [];
      if (mode === "upload") {
        prepared = checkItems(items).items;
      } else if (mode === "paste") {
        prepared = checkItems(pastedFiles.map((file) => textItem(file.path, file.content))).items;
        const seen = new Set<string>();
        for (const file of prepared) {
          if (seen.has(file.path)) throw new Error(`More than one pasted file uses "${file.path}".`);
          seen.add(file.path);
        }
        if (!seen.has("index.html")) throw new Error("Add a file named index.html at the project root.");
        if (!prepared.find((file) => file.path === "index.html")?.data.length) throw new Error("Paste the HTML for index.html before deploying.");
      } else if (!repo.trim()) {
        throw new Error("Enter a GitHub repository.");
      }
      const slug = fixedSlug ?? (await createSlug?.()) ?? null;
      if (!slug) { setBusy(false); return; }
      let result;
      if (mode === "github") {
        setProgress({ label: "Cloning from GitHub…", pct: 40 });
        result = await createDeploy(slug, { git: { repo, branch, dir }, message });
      } else {
        const files = await pushItems(prepared, (label, pct) => setProgress({ label, pct }));
        setProgress({ label: "Deploying…", pct: 92 });
        result = await createDeploy(slug, { files, message });
      }
      setProgress({ label: "Done", pct: 100 });
      router.push(`/dashboard/${slug}/deployments/${result.number}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="stack">
      <div className="seg" role="tablist" style={{ width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
        {([["upload", "Files / folder / zip"], ["paste", "Paste HTML"], ["github", "GitHub"]] as const).map(([m, label]) => (
          <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => { setMode(m); setError(""); }}>{label}</button>
        ))}
      </div>

      {mode === "upload" && (
        <>
          <div
            className={`drop ${over ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); take(itemsFromDrop(e.dataTransfer)); }}
          >
            <p style={{ margin: "0 0 12px" }}>Drop an HTML file, a folder, or a .zip here</p>
            <div className="row" style={{ justifyContent: "center" }}>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>Choose files</button>
              <button type="button" className="btn btn-sm" onClick={() => folderRef.current?.click()}>Choose folder</button>
            </div>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && take(itemsFromInput(e.target.files))} />
            <input ref={folderRef} type="file" hidden onChange={(e) => e.target.files && take(itemsFromInput(e.target.files))}
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
          </div>
          {items.length > 0 && (
            <div className="notice">
              <strong style={{ color: "#fff" }}>{items.length} file{items.length === 1 ? "" : "s"}</strong> · {formatBytes(total)}
              <div className="mono hint" style={{ marginTop: 6, maxHeight: 120, overflow: "auto" }}>
                {items.slice(0, 40).map((i) => <div key={i.path}>{i.path}</div>)}
                {items.length > 40 && <div>…and {items.length - 40} more</div>}
              </div>
            </div>
          )}
        </>
      )}

      {mode === "paste" && (
        <div className="stack">
          <p className="hint" style={{ margin: 0 }}>Add each file by its path and paste its contents. Include a root-level <code className="i">index.html</code> to deploy.</p>
          {pastedFiles.map((file) => (
            <div key={file.id} className="stack" style={{ gap: 10, padding: 14, border: "1px solid var(--line)", borderRadius: 8 }}>
              <div className="row" style={{ alignItems: "end" }}>
                <label className="field" style={{ flex: 1, minWidth: 180 }}>File name or path
                  <input className="input mono" value={file.path} onChange={(e) => setPastedFiles((current) => current.map((item) => item.id === file.id ? { ...item, path: e.target.value } : item))} placeholder="index.html or css/site.css" />
                </label>
                {pastedFiles.length > 1 && (
                  <button type="button" className="btn btn-sm btn-danger" aria-label={`Remove ${file.path || "unnamed file"}`} onClick={() => setPastedFiles((current) => current.filter((item) => item.id !== file.id))}>Remove</button>
                )}
              </div>
              <label className="field">File contents
                <textarea className="textarea" rows={file.id === 0 ? 12 : 8} value={file.content} onChange={(e) => setPastedFiles((current) => current.map((item) => item.id === file.id ? { ...item, content: e.target.value } : item))} placeholder={file.path === "index.html" ? "<!doctype html>…" : "Paste file contents…"} spellCheck={false} />
              </label>
            </div>
          ))}
          <div><button type="button" className="btn btn-sm" onClick={() => setPastedFiles((current) => [...current, { id: nextPastedFileId.current++, path: "", content: "" }])}>+ Add another file</button></div>
        </div>
      )}

      {mode === "github" && (
        <div className="stack">
          <label className="field">Repository
            <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name or https://github.com/owner/name" />
          </label>
          <div className="row" style={{ alignItems: "stretch" }}>
            <label className="field" style={{ flex: 1, minWidth: 140 }}>Branch (optional)
              <input className="input" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="default branch" />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 140 }}>Folder (optional)
              <input className="input" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="repo root" />
            </label>
          </div>
          <p className="hint" style={{ margin: 0 }}>Public repos work out of the box. Set GITHUB_TOKEN to import private repos. If there is no root index.html, Nuke looks in dist, build, out, public and docs.</p>
        </div>
      )}

      {existing && (
        <label className="field">Message (optional)
          <input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What changed?" />
        </label>
      )}

      {progress && <div><div className="hint" style={{ marginBottom: 6 }}>{progress.label}</div><div className="progress"><i style={{ width: `${progress.pct}%` }} /></div></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div><button type="button" className="btn btn-primary" disabled={busy} onClick={deploy}>{busy ? "Deploying…" : existing ? "Deploy new version" : "Deploy"}</button></div>
    </div>
  );
}
