import { guard } from "@/lib/auth";
import { validateEnvName } from "@/lib/crypto";
import { revealEnv } from "@/lib/env-vars";
import { getProject } from "@/lib/projects";

// Owner-only (needs the dashboard login). Lets you check a saved value.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; name: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { slug, name } = await params;
  const project = await getProject(slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  let value: string | null;
  try { value = await revealEnv(project.id, validateEnvName(name)); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  if (value === null) return Response.json({ error: "Value not found or cannot be decrypted. Check NUKE_SECRETS_ENCRYPTION_KEY." }, { status: 404 });
  return Response.json({ value }, { headers: { "Cache-Control": "no-store" } });
}
