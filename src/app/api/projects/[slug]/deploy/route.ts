import { guard, originFromRequest } from "@/lib/auth";
import { createDeployment, githubDeploy, Logger } from "@/lib/deploy";
import { getProject } from "@/lib/projects";
import type { FileRef } from "@/lib/shared";

export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const project = await getProject((await params).slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const origin = originFromRequest(req);
  const message = typeof body.message === "string" ? body.message.trim() : "";

  let result;
  if (body.git && typeof body.git.repo === "string") {
    result = await githubDeploy(project, body.git, origin, message);
  } else if (Array.isArray(body.files)) {
    const refs: FileRef[] = body.files
      .filter((f: any) => f && typeof f.path === "string" && /^[a-f0-9]{64}$/.test(f.hash))
      .map((f: any) => ({ path: f.path, hash: f.hash, size: Number(f.size) || 0 }));
    const log = new Logger();
    result = await createDeployment({ project, refs, message: message || "Manual deploy", source: "upload", origin, log });
  } else {
    return Response.json({ error: "Nothing to deploy." }, { status: 400 });
  }
  return Response.json(result, { status: result.ok ? 201 : 422 });
}
