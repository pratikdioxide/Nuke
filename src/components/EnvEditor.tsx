"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/upload";
import EnvFields, { blankRow, newlyPublic, toPayload, type EnvRow } from "./EnvFields";

type Item = { name: string; note: string; is_public: boolean; broken: boolean };

export default function EnvEditor({ slug, initial, mode }: { slug: string; initial: Item[]; mode: "dedicated" | "session" | "none" }) {
  const router = useRouter();
  const [rows, setRows] = useState<EnvRow[]>(() =>
    initial.length
      ? initial.map((v) => ({ name: v.name, value: "", note: v.note, is_public: v.is_public, wasPublic: v.is_public, existing: true, broken: v.broken, show: false }))
      : [blankRow()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function save() {
    setError(""); setSaved("");
    const exposed = newlyPublic(rows);
    if (exposed.length && !window.confirm(`These will be visible to anyone who opens your site:\n\n${exposed.join(", ")}\n\nContinue?`)) return;
    setBusy(true);
    try {
      const data = await api(`/api/projects/${slug}/env`, "PUT", { vars: toPayload(rows) });
      if (data.redeployed && data.number) { router.push(`/dashboard/${slug}/deployments/${data.number}`); router.refresh(); return; }
      setSaved("Saved. Server-only variables apply to your functions immediately.");
      setRows((r) => r.filter((x) => x.name.trim()).map((x) => ({ ...x, value: "", existing: true, wasPublic: x.is_public, broken: false, show: false })));
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="stack">
      <div className="notice">
        <strong style={{ color: "#fff" }}>Server only</strong> (default): encrypted in the Nuke database and never sent to browsers. Your <code className="i">api/</code> functions read them as <code className="i">process.env.NAME</code>.
        <br /><strong style={{ color: "#fff" }}>Public</strong>: injected into your pages as <code className="i">window.NUKE_ENV.NAME</code>. Anyone can read these.
      </div>
      {mode === "session" && (
        <div className="notice warn">Values are encrypted with a key derived from SESSION_SECRET. Set <code className="i">NUKE_SECRETS_ENCRYPTION_KEY</code> (openssl rand -hex 32) <b>before</b> saving variables, and never change it afterwards, or saved values can no longer be read.</div>
      )}
      <div className="card card-pad stack">
        <EnvFields rows={rows} setRows={setRows} slug={slug} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="hint">{saved}</p>}
      <div><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></div>
    </div>
  );
}
