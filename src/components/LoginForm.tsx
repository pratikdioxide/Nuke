"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/upload";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError("");
      try { await api("/api/auth/login", "POST", { password }); router.replace("/dashboard"); router.refresh(); }
      catch (err) { setError((err as Error).message); setBusy(false); }
    }}>
      <label className="field">Password
        <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
    </form>
  );
}
