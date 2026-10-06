"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/upload";

type Row = { key: string; value: string; show: boolean };

function parseDotenv(text: string): Row[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) return [];
    let v = m[2].trim();
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
    return [{ key: m[1], value: v, show: false }];
  });
}

export default function EnvEditor({ slug, initial, hasDeployment }: { slug: string; initial: Record<string, string>; hasDeployment: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => {
    const r = Object.entries(initial).map(([key, value]) => ({ key, value, show: false }));
    return r.length ? r : [{ key: "", value: "", show: true }];
  });
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    setBusy(true); setError(""); setSaved("");
    try {
      const data = await api(`/api/projects/${slug}/env`, "PUT", { vars: rows.map(({ key, value }) => ({ key, value })) });
      if (data.number) { router.push(`/dashboard/${slug}/deployments/${data.number}`); router.refresh(); return; }
      setSaved("Saved. They apply on your next deployment.");
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="stack">
      <div className="notice warn">
        Values are injected into your pages as <code className="i">window.NUKE_ENV</code> and are visible to anyone who opens the site. Use them for public config such as API base URLs or public keys, never for secrets.
      </div>
      <div className="card card-pad stack">
        {rows.map((r, i) => (
          <div className="envrow" key={i}>
            <input className="input mono" placeholder="KEY" value={r.key} onChange={(e) => set(i, { key: e.target.value })} aria-label="Variable name" autoCapitalize="off" spellCheck={false} />
            <input className="input mono" placeholder="value" type={r.show ? "text" : "password"} value={r.value} onChange={(e) => set(i, { value: e.target.value })} aria-label="Variable value" autoComplete="off" spellCheck={false} />
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <button type="button" className="btn btn-sm" onClick={() => set(i, { show: !r.show })}>{r.show ? "Hide" : "Show"}</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ key: "", value: "", show: true }]))} aria-label="Remove variable">✕</button>
            </div>
          </div>
        ))}
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => setRows((r) => [...r, { key: "", value: "", show: true }])}>+ Add variable</button>
          <button type="button" className="btn btn-sm" onClick={() => setShowBulk((s) => !s)}>Paste .env</button>
        </div>
        {showBulk && (
          <div className="stack">
            <textarea className="textarea" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"API_URL=https://api.example.com\nPUBLIC_KEY=abc123"} spellCheck={false} />
            <div><button type="button" className="btn btn-sm" onClick={() => {
              const parsed = parseDotenv(bulk);
              setRows((cur) => {
                const map = new Map(cur.filter((x) => x.key).map((x) => [x.key, x]));
                parsed.forEach((p) => map.set(p.key, p));
                const out = [...map.values()];
                return out.length ? out : cur;
              });
              setBulk(""); setShowBulk(false);
            }}>Add to list</button></div>
          </div>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="hint">{saved}</p>}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : hasDeployment ? "Save & redeploy" : "Save"}</button>
      </div>
    </div>
  );
}
