"use client";
import { useState } from "react";

export type EnvRow = {
  name: string; value: string; note: string; is_public: boolean;
  existing: boolean;   // already saved on the server (its value is not in the browser)
  wasPublic: boolean;
  broken?: boolean;    // saved but cannot be decrypted with the current key
  show: boolean;
};

export const blankRow = (): EnvRow => ({ name: "", value: "", note: "", is_public: false, existing: false, wasPublic: false, show: true });

export function toPayload(rows: EnvRow[]) {
  return rows
    .filter((r) => r.name.trim() || r.value)
    .map((r) => ({ name: r.name.trim(), value: r.existing && r.value === "" ? null : r.value, note: r.note, is_public: r.is_public }));
}

/** Names that would newly become visible to site visitors. */
export function newlyPublic(rows: EnvRow[]) {
  return rows.filter((r) => r.name.trim() && r.is_public && !(r.existing && r.wasPublic)).map((r) => r.name.trim());
}

export function parseDotenv(text: string): { name: string; value: string }[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) return [];
    let v = m[2].trim();
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
    return [{ name: m[1], value: v }];
  });
}

export default function EnvFields({ rows, setRows, slug }: { rows: EnvRow[]; setRows: (fn: (r: EnvRow[]) => EnvRow[]) => void; slug?: string }) {
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const set = (i: number, patch: Partial<EnvRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function reveal(i: number) {
    const r = rows[i];
    if (!r.existing || r.value !== "" || !slug) return set(i, { show: !r.show });
    setBusy(i); setNote("");
    try {
      const res = await fetch(`/api/projects/${slug}/env/${encodeURIComponent(r.name)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load the value.");
      set(i, { value: data.value, show: true });
    } catch (e) { setNote((e as Error).message); }
    setBusy(null);
  }

  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div className="envcard" key={i}>
          <div className="envrow">
            <input className="input mono" placeholder="NAME" value={r.name} disabled={r.existing} onChange={(e) => set(i, { name: e.target.value })} aria-label="Variable name" autoCapitalize="off" spellCheck={false} />
            <input className="input mono" placeholder={r.existing && r.value === "" ? (r.broken ? "cannot decrypt, enter a new value" : "saved · type to replace") : "value"}
              type={r.show ? "text" : "password"} value={r.value} onChange={(e) => set(i, { value: e.target.value })} aria-label="Variable value" autoComplete="off" spellCheck={false} />
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <button type="button" className="btn btn-sm" disabled={busy === i || (r.existing && r.broken && r.value === "")} onClick={() => reveal(i)}>{busy === i ? "…" : r.show ? "Hide" : "Reveal"}</button>
              <button type="button" className="btn btn-sm btn-danger" aria-label={`Remove ${r.name || "variable"}`}
                onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [blankRow()]))}>✕</button>
            </div>
          </div>
          <div className="envmeta">
            <div className="seg" role="group" aria-label="Who can read this value">
              <button type="button" className={!r.is_public ? "on" : ""} onClick={() => set(i, { is_public: false })}>Server only</button>
              <button type="button" className={r.is_public ? "on" : ""} onClick={() => set(i, { is_public: true })}>Public</button>
            </div>
            <input className="input" placeholder="Note (optional): what is this for?" value={r.note} maxLength={200} onChange={(e) => set(i, { note: e.target.value })} aria-label="Note" />
          </div>
          <div className="hint">
            {r.is_public ? "Visible to anyone who opens the site (injected as window.NUKE_ENV)." : "Hidden from visitors. Only your api/ functions can read it, as process.env." }
            {r.broken && <span style={{ color: "var(--err)" }}> · Cannot be decrypted with the current key. Enter the value again.</span>}
          </div>
        </div>
      ))}
      {note && <p className="error">{note}</p>}
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => setRows((r) => [...r, blankRow()])}>+ Add variable</button>
        <button type="button" className="btn btn-sm" onClick={() => setShowBulk((s) => !s)}>Paste .env</button>
      </div>
      {showBulk && (
        <div className="stack">
          <textarea className="textarea" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"DATABASE_URL=postgresql://...\nEDIT_PASSWORD=secret"} spellCheck={false} />
          <div><button type="button" className="btn btn-sm" onClick={() => {
            const parsed = parseDotenv(bulk);
            setRows((cur) => {
              const next = cur.filter((x) => x.name || x.value);
              for (const p of parsed) {
                const at = next.findIndex((x) => x.name === p.name);
                if (at >= 0) next[at] = { ...next[at], value: p.value, show: false };
                else next.push({ ...blankRow(), name: p.name, value: p.value, show: false });
              }
              return next.length ? next : [blankRow()];
            });
            setBulk(""); setShowBulk(false);
          }}>Add to list</button></div>
        </div>
      )}
    </div>
  );
}
