"use client";

/** Asks the server to take the screenshot (api/projects/<slug>/shot) and store it. Resolves with the time it was stored. */
export async function captureThumbnail(slug: string): Promise<{ at: number; deployment: number }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/shot`, { method: "POST" })
    .catch(() => { throw new Error("Could not reach the server. Check your connection."); });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON (e.g. a platform timeout page) */ }
  if (!res.ok) throw new Error(json.error || `Could not take the screenshot (${res.status}).`);
  return { at: json.thumb_at as number, deployment: json.deployment as number };
}

/* A capture that failed is remembered per project + live deployment, so the dashboard does not retry on every visit.
   A new deployment (or pressing "Retake screenshot") tries again. */
const failKey = (slug: string, version: number) => `nuke:thumb-failed:${slug}@${version}`;
export function thumbFailedBefore(slug: string, version: number): boolean {
  try { return localStorage.getItem(failKey(slug, version)) === "1"; } catch { return false; }
}
export function markThumbFailed(slug: string, version: number) {
  try { localStorage.setItem(failKey(slug, version), "1"); } catch { /* storage unavailable: just retry next time */ }
}
export function clearThumbFailed(slug: string, version: number) {
  try { localStorage.removeItem(failKey(slug, version)); } catch { /* ignore */ }
}

/** True when the live deployment has no screenshot of its own yet and an automatic capture is worth trying. */
export function needsThumbnail(p: { slug: string; version: number | null; thumb_deployment: number | null }): boolean {
  return p.version !== null && p.thumb_deployment !== p.version && !thumbFailedBefore(p.slug, p.version);
}

export const thumbUrl = (slug: string, at: number) => `/api/projects/${encodeURIComponent(slug)}/shot?v=${at}`;
