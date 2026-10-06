"use client";
import { useState } from "react";
import Uploader from "./Uploader";
import { api } from "@/lib/client/upload";
import { slugError, slugify } from "@/lib/shared";

export default function NewProjectForm({ origin }: { origin: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const host = origin.replace(/^https?:\/\//, "");

  async function create(): Promise<string | null> {
    setError("");
    const s = slug.trim().toLowerCase();
    if (!name.trim()) { setError("Give the project a name."); return null; }
    const bad = slugError(s);
    if (bad) { setError(bad); return null; }
    try {
      await api("/api/projects", "POST", { name, slug: s });
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
      <div className="card card-pad">
        <h2>Source</h2>
        <Uploader getSlug={create} />
      </div>
    </div>
  );
}
