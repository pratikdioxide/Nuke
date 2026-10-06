"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/upload";
import CopyButton from "./CopyButton";

export function GeneralForm({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [n, setN] = useState(name);
  const [s, setS] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="card card-pad stack">
      <h2>General</h2>
      <label className="field">Name<input className="input" value={n} onChange={(e) => setN(e.target.value)} /></label>
      <label className="field">URL name<input className="input mono" value={s} onChange={(e) => setS(e.target.value.toLowerCase())} /></label>
      {s !== slug && <p className="hint">Changing the URL name moves the live site immediately. The old address stops working.</p>}
      {error && <p className="error">{error}</p>}{msg && <p className="hint">{msg}</p>}
      <div><button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setError(""); setMsg("");
        try { const r = await api(`/api/projects/${slug}`, "PATCH", { name: n, slug: s }); setMsg("Saved."); if (r.slug !== slug) router.replace(`/dashboard/${r.slug}/settings`); router.refresh(); }
        catch (e) { setError((e as Error).message); }
        setBusy(false);
      }}>Save</button></div>
    </div>
  );
}

export function HookCard({ slug, token, origin }: { slug: string; token: string; origin: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const url = `${origin}/api/hooks/${token}`;
  return (
    <div className="card card-pad stack">
      <h2>Deploy hook</h2>
      <p className="sub" style={{ margin: 0 }}>Open or POST this URL to redeploy. For GitHub projects it pulls the latest commit, so you can use it as a push webhook (Repo → Settings → Webhooks, content type JSON).</p>
      <code className="mono notice" style={{ overflowWrap: "anywhere" }}>{url}</code>
      <div className="row">
        <CopyButton text={url} />
        <button className="btn btn-sm" disabled={busy} onClick={async () => {
          if (!confirm("Create a new hook URL? The old one stops working.")) return;
          setBusy(true);
          try { await api(`/api/projects/${slug}/hook`, "POST"); router.refresh(); } finally { setBusy(false); }
        }}>Regenerate</button>
      </div>
    </div>
  );
}

export function DangerCard({ slug }: { slug: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="card card-pad stack" style={{ borderColor: "#4a1d1d" }}>
      <h2 style={{ color: "var(--err)" }}>Delete project</h2>
      <p className="sub" style={{ margin: 0 }}>Removes the site, all deployments and logs. This cannot be undone. Type <code className="i">{slug}</code> to confirm.</p>
      <input className="input mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={slug} />
      <div><button className="btn btn-danger" disabled={confirm !== slug || busy} onClick={async () => {
        setBusy(true);
        try { await api(`/api/projects/${slug}`, "DELETE"); router.replace("/dashboard"); router.refresh(); } catch { setBusy(false); }
      }}>Delete this project</button></div>
    </div>
  );
}
