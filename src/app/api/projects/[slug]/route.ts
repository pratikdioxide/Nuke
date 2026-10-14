import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { slugError } from "@/lib/shared";

type Ctx = { params: Promise<{ slug: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : project.name;
  const slug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim().toLowerCase() : project.slug;
  const hideFromLanding = typeof body.hideFromLanding === "boolean" ? body.hideFromLanding : null;
  if (slug !== project.slug) {
    const bad = slugError(slug);
    if (bad) return Response.json({ error: bad }, { status: 400 });
  }
  try {
    const rows = await q<{ hide_from_landing: boolean }>(
      "UPDATE nuke_projects SET name=$1, slug=$2, hide_from_landing=COALESCE($3::boolean, hide_from_landing), updated_at=NOW() WHERE id=$4 RETURNING hide_from_landing",
      [name, slug, hideFromLanding, project.id],
    );
    return Response.json({ slug, hideFromLanding: rows[0]?.hide_from_landing ?? project.hide_from_landing });
  } catch (e: any) {
    if (e.code === "23505") return Response.json({ error: "That URL name is already taken." }, { status: 409 });
    return Response.json({ error: "Could not save." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  await q("DELETE FROM nuke_projects WHERE slug=$1", [(await params).slug]);
  return Response.json({ ok: true });
}
