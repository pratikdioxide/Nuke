"use client";
import { useEffect, useRef, useState } from "react";
import SiteThumbnail from "./SiteThumbnail";
import { captureThumbnail, clearThumbFailed, markThumbFailed, needsThumbnail } from "@/lib/client/shot";

/** Overview card: shows the saved screenshot, takes a new one when the live deployment changed, and can retake it. */
export default function ProjectShot({ slug, version, thumbDeployment, thumbAt }: {
  slug: string; version: number | null; thumbDeployment: number | null; thumbAt: number | null;
}) {
  const [at, setAt] = useState(thumbAt);
  const [shooting, setShooting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const tried = useRef(new Set<string>());

  // a new or changed live deployment gets a fresh screenshot, once
  useEffect(() => { setAt(thumbAt); }, [thumbAt]);
  useEffect(() => {
    if (version === null || !needsThumbnail({ slug, version, thumb_deployment: thumbDeployment })) return;
    const key = `${slug}@${version}`;
    if (tried.current.has(key)) return;
    tried.current.add(key);
    setShooting(true);
    captureThumbnail(slug)
      .then((r) => setAt(r.at))
      .catch(() => { markThumbFailed(slug, version); setFailed(true); })
      .finally(() => setShooting(false));
  }, [slug, version, thumbDeployment]);

  async function retake() {
    if (version === null) return;
    setShooting(true); setError(""); setFailed(false);
    clearThumbFailed(slug, version);
    try { setAt((await captureThumbnail(slug)).at); }
    catch (e) { setError((e as Error).message); setFailed(true); }
    setShooting(false);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Preview</h2>
        <button className="btn btn-sm" disabled={shooting || version === null} onClick={retake}>{shooting ? "Taking screenshot…" : "Retake screenshot"}</button>
      </div>
      <div className="card-pad">
        <SiteThumbnail slug={slug} thumbAt={at} capturing={shooting} failed={failed} deployed={version !== null} />
        {error && <p className="error" style={{ marginBottom: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
