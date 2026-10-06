import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
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
  try {
    await q(
      "INSERT INTO nuke_projects (name, slug, kind, content, hook_token) VALUES ($1,$2,'html','',replace(gen_random_uuid()::text,'-',''))",
      [name.slice(0, 80), slug],
    );
    return Response.json({ slug }, { status: 201 });
  } catch (e: any) {
    if (e.code === "23505") return Response.json({ error: "That URL name is already taken." }, { status: 409 });
    console.error("create project failed:", e.message);
    return Response.json({ error: "Could not create the project." }, { status: 500 });
  }
}
