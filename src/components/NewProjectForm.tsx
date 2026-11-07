"use client";
import { useState } from "react";
import EnvFields, { blankRow, newlyPublic, toPayload, type EnvRow } from "./EnvFields";
import Uploader from "./Uploader";
import BubbleColorPicker from "./BubbleColorPicker";
import { api } from "@/lib/client/upload";
import { slugError, slugify } from "@/lib/shared";

export default function NewProjectForm({ origin }: { origin: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<EnvRow[]>([blankRow()]);
  const [showOnLanding, setShowOnLanding] = useState(true);
  const [bubbleColor, setBubbleColor] = useState<string | null>(null);
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState("");
  const host = origin.replace(/^https?:\/\//, "");

  async function create(): Promise<string | null> {
    setError("");
    const s = slug.trim().toLowerCase();
    if (!name.trim()) { setError("Give the project a name."); return null; }
    const bad = slugError(s);
    if (bad) { setError(bad); return null; }
    if (protect && password.length < 4) { setError("Use a site password of at least 4 characters."); return null; }
    const exposed = newlyPublic(rows);
    if (exposed.length && !window.confirm(`These will be visible to anyone who opens your site:\n\n${exposed.join(", ")}\n\nContinue?`)) return null;
    try {
      await api("/api/projects", "POST", {
        name, slug: s, env: toPayload(rows),
        hideFromLanding: !showOnLanding, bubbleColor, sitePassword: protect ? password : null,
      });
      return s;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  return (
    <div className="stack">
      <div className="card card-pad stack">
        <label className="field">Project name
          <input className="input" value={name} placeholder="My landing page" onChange={(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} />
        </label>
        <label className="field">URL
          <input className="input mono" value={slug} placeholder="my-landing-page"
            onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)); }} />
          <span className="hint">Your site will live at {host}/{slug || "your-name"}/</span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="card card-pad stack">
        <div>
          <h2 style={{ marginBottom: 4 }}>Environment variables <span className="hint">(optional)</span></h2>
          <p className="hint" style={{ margin: 0 }}>Server-only variables are encrypted and only readable by your <code className="i">api/</code> functions. You can change them later.</p>
        </div>
        <EnvFields rows={rows} setRows={setRows} />
      </div>
      <div className="card card-pad stack">
        <h2>Landing page</h2>
        <label className="row" style={{ alignItems: "center", gap: 12 }}>
          <input type="checkbox" checked={showOnLanding} onChange={(e) => setShowOnLanding(e.target.checked)} />
          <span>Show this project on the landing page</span>
        </label>
        <div className="stack" style={{ gap: 8 }}>
          <span>Bubble color</span>
          <BubbleColorPicker value={bubbleColor} onChange={setBubbleColor} />
        </div>
      </div>
      <div className="card card-pad stack">
        <h2>Password protection</h2>
        <label className="row" style={{ alignItems: "center", gap: 12 }}>
          <input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />
          <span>Ask for a password before this site opens</span>
        </label>
        {protect && (
          <label className="field">Password
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 4 characters" />
          </label>
        )}
        <p className="hint" style={{ margin: 0 }}>Off by default. You can change both of these later in Settings.</p>
      </div>
      <div className="card card-pad">
        <h2>Source</h2>
        <Uploader getSlug={create} />
      </div>
    </div>
  );
}