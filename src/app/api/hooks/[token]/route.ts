import { originFromRequest } from "@/lib/auth";
import { githubDeploy, redeploy } from "@/lib/deploy";
import { q } from "@/lib/db";
import type { Project } from "@/lib/projects";

export const maxDuration = 60;

// Deploy hook: call this URL (e.g. from a GitHub webhook or cron) to redeploy.
async function run(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const project = (await q<Project>("SELECT * FROM nuke_projects WHERE hook_token=$1", [token]))[0];
  if (!project || token.length < 20) return Response.json({ error: "Invalid hook." }, { status: 404 });
  const origin = originFromRequest(req);
  const r = project.git_repo
    ? await githubDeploy(project, { repo: project.git_repo, branch: project.git_branch ?? undefined, dir: project.git_dir ?? undefined }, origin, "Deploy hook")
    : await redeploy(project, null, origin, "Deploy hook");
  return Response.json({ ok: r.ok, deployment: r.number, error: r.error }, { status: r.ok ? 200 : 422 });
}
export { run as GET, run as POST };
