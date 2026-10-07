import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { parseEnvInput, saveEnv } from "@/lib/env-vars";
import { slugError } from "@/lib/shared";

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
  try {
    const rows = await q<{ id: number }>(
      "INSERT INTO nuke_projects (name, slug, kind, content, hook_token) VALUES ($1,$2,'html','',replace(gen_random_uuid()::text,'-','')) RETURNING id",
      [name.slice(0, 80), slug],
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
