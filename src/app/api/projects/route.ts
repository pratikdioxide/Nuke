import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { parseEnvInput, saveEnv } from "@/lib/env-vars";
import { listProjects } from "@/lib/projects";
import { isBubbleColor, slugError } from "@/lib/shared";
import { MIN_SITE_PASSWORD, hashSitePassword } from "@/lib/site-password";

/** One page of project cards for the dashboard's infinite scroll: GET /api/projects?offset=12&q=search */
export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const offset = Math.min(100_000, Math.max(0, Number(url.searchParams.get("offset")) || 0));
  try {
    const page = await listProjects({ offset, term: url.searchParams.get("q") ?? "" });
    return Response.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("list projects failed:", (e as Error).message);
    return Response.json({ error: "Could not load projects." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!name) return Response.json({ error: "Give the project a name." }, { status: 400 });
  const bad = slugError(slug);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  let env;
  try { env = parseEnvInput(body.env); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  if (env.some((v) => v.value === null || v.value === undefined)) return Response.json({ error: "Every environment variable needs a value." }, { status: 400 });
  // Optional settings that can be chosen while creating the project (same fields as the Settings tab).
  const hideFromLanding = body.hideFromLanding === true;
  let bubbleColor: string | null = null;
  if (body.bubbleColor !== undefined && body.bubbleColor !== null) {
    if (!isBubbleColor(body.bubbleColor)) return Response.json({ error: "Pick a valid color." }, { status: 400 });
    bubbleColor = body.bubbleColor.toLowerCase();
  }
  let sitePassword: string | null = null;
  if (body.sitePassword !== undefined && body.sitePassword !== null && body.sitePassword !== "") {
    if (typeof body.sitePassword !== "string" || body.sitePassword.length < MIN_SITE_PASSWORD || body.sitePassword.length > 200) {
      return Response.json({ error: `Use a password of ${MIN_SITE_PASSWORD}-200 characters.` }, { status: 400 });
    }
    sitePassword = hashSitePassword(body.sitePassword);
  }
  try {
    const rows = await q<{ id: number }>(
      `INSERT INTO nuke_projects (name, slug, kind, content, hook_token, hide_from_landing, bubble_color, site_password)
       VALUES ($1,$2,'html','',replace(gen_random_uuid()::text,'-',''),$3,$4,$5) RETURNING id`,
      [name.slice(0, 80), slug, hideFromLanding, bubbleColor, sitePassword],
    );
    if (env.length) {
      try { await saveEnv(rows[0].id, env); }
      catch (e) { await q("DELETE FROM nuke_projects WHERE id=$1", [rows[0].id]); return Response.json({ error: (e as Error).message }, { status: 400 }); }
    }
    return Response.json({ slug }, { status: 201 });
  } catch (e: any) {
    if (e.code === "23505") return Response.json({ error: "That URL name is already taken." }, { status: 409 });
    console.error("create project failed:", e.message);
    return Response.json({ error: "Could not create the project." }, { status: 500 });
  }
}