import { q, tx } from "./db";
import type { LogLine } from "./shared";

export type Project = {
  id: number; name: string; slug: string; public_env: Record<string, string>;
  active_deployment_id: number | null; git_repo: string | null; git_branch: string | null;
  git_dir: string | null; hook_token: string; created_at: string; updated_at: string;
};
export type ProjectCard = {
  name: string; slug: string; git_repo: string | null;
  latest_status: string | null; latest_at: string | null; file_count: number | null; total_bytes: number | null;
};
type ProjectCardRow = Omit<ProjectCard, "latest_at" | "total_bytes"> & {
  latest_at: Date | string | null;
  total_bytes: number | string | null;
};
export type Deployment = {
  id: number; project_id: number; number: number; status: "READY" | "ERROR";
  message: string; source: string; env: Record<string, string>; logs: LogLine[];
  file_count: number; total_bytes: number; duration_ms: number; created_at: string;
};

export async function listProjects(): Promise<ProjectCard[]> {
  const rows = await tx(async (client) => {
    await client.query("SET LOCAL statement_timeout = '8s'");
    const result = await client.query(`
      SELECT p.name, p.slug, p.git_repo,
        l.status AS latest_status, COALESCE(l.created_at, p.created_at) AS latest_at,
        a.file_count, a.total_bytes
      FROM nuke_projects p
      LEFT JOIN LATERAL (SELECT status, created_at FROM nuke_deployments WHERE project_id=p.id ORDER BY number DESC LIMIT 1) l ON true
      LEFT JOIN nuke_deployments a ON a.id = p.active_deployment_id
      ORDER BY COALESCE(l.created_at, p.created_at) DESC`);
    return result.rows as ProjectCardRow[];
  });
  return rows.map((row) => ({
    ...row,
    latest_at: row.latest_at instanceof Date ? row.latest_at.toISOString() : row.latest_at,
    total_bytes: row.total_bytes == null ? null : Number(row.total_bytes),
  }));
}

export async function listLandingProjects(): Promise<{ name: string; slug: string }[]> {
  return q<{ name: string; slug: string }>(
    "SELECT name, slug FROM nuke_projects WHERE active_deployment_id IS NOT NULL ORDER BY id",
  );
}

export async function getProject(slug: string): Promise<Project | null> {
  return (await q<Project>("SELECT * FROM nuke_projects WHERE slug=$1", [slug]))[0] ?? null;
}

const DEP_COLS = "id, project_id, number, status, message, source, env, file_count, total_bytes, duration_ms, created_at";

export async function listDeployments(projectId: number): Promise<Omit<Deployment, "logs">[]> {
  return q(`SELECT ${DEP_COLS} FROM nuke_deployments WHERE project_id=$1 ORDER BY number DESC`, [projectId]);
}

export async function getDeployment(projectId: number, number: number): Promise<Deployment | null> {
  return (await q<Deployment>(`SELECT ${DEP_COLS}, logs FROM nuke_deployments WHERE project_id=$1 AND number=$2`, [projectId, number]))[0] ?? null;
}

export async function getFiles(deploymentId: number) {
  return q<{ path: string; hash: string; size: number; content_type: string }>(
    "SELECT path, hash, size, content_type FROM nuke_files WHERE deployment_id=$1 ORDER BY path", [deploymentId]);
}
