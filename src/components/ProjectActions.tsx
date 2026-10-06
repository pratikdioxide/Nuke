"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/upload";

export function DeploymentActions({ slug, number, isProduction, ready }: { slug: string; number: number; isProduction: boolean; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function run(action: "promote" | "redeploy") {
    setBusy(action); setError("");
    try {
      const r = await api(`/api/projects/${slug}/deployments/${number}`, "POST", { action });
      if (action === "redeploy") router.push(`/dashboard/${slug}/deployments/${r.number}`);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  }
  return (
    <div className="stack">
      <div className="row">
        {ready && !isProduction && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("promote")}>{busy === "promote" ? "Promoting…" : "Promote to production"}</button>}
        {ready && <button className="btn btn-sm" disabled={!!busy} onClick={() => run("redeploy")}>{busy === "redeploy" ? "Redeploying…" : "Redeploy"}</button>}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function RedeployButton({ slug, number }: { slug: string; number: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = await api(`/api/projects/${slug}/deployments/${number}`, "POST", { action: "redeploy" }); router.push(`/dashboard/${slug}/deployments/${r.number}`); router.refresh(); }
      catch { setBusy(false); }
    }}>{busy ? "Redeploying…" : "Redeploy"}</button>
  );
}
