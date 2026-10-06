import { guard } from "@/lib/auth";
import { q, tx } from "@/lib/db";
import { validateSecretName } from "@/lib/private-secrets";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string; name: string }> };

export async function DELETE(req: Request, { params }: Context) {
  const denied = await guard(req);
  if (denied) return denied;
  const { slug, name: rawName } = await params;
  const project = await getProject(slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  let name: string;
  try {
    name = validateSecretName(rawName);
  } catch {
    return Response.json({ error: "Secret not found." }, { status: 404 });
  }

  const result = await tx(async (client) => {
    const secret = await client.query(
      "SELECT name FROM nuke_project_secrets WHERE project_id=$1 AND name=$2 FOR UPDATE",
      [project.id, name],
    );
    if (!secret.rowCount) return "missing";
    const references = await client.query(
      "SELECT id FROM nuke_api_proxies WHERE project_id=$1 AND secret_name=$2 LIMIT 1",
      [project.id, name],
    );
    if (references.rowCount) return "in-use";
    await client.query("DELETE FROM nuke_project_secrets WHERE project_id=$1 AND name=$2", [project.id, name]);
    return "deleted";
  });

  if (result === "missing") return Response.json({ error: "Secret not found." }, { status: 404 });
  if (result === "in-use") {
    return Response.json({ error: "This secret is used by a proxy. Edit or delete that proxy before deleting the secret." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
