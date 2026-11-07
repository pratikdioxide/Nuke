import { q, tx } from "./db";
import type { LogLine } from "./shared";

export type Project = {
  id: number; name: string; slug: string; public_env: Record<string, string>;
  hide_from_landing: boolean;
  /** scrypt hash of the site password; null = the site is public */
  site_password: string | null;
  pinned: boolean;
  /** landing-page bubble tint as #rrggbb; null = default look */
  bubble_color: string | null;
  active_deployment_id: number | null; git_repo: string | null; git_branch: string | null;
  git_dir: string | null; hook_token: string; created_at: string; updated_at: string;
};
export type ProjectCard = {
  name: string; slug: string; git_repo: string | null;
  /** true = hidden from the public landing page bubbles (only visible after login) */
  hide_from_landing: boolean;
  pinned: boolean;
  /** the site asks for a password */
  locked: boolean;
  latest_status: string | null; latest_at: string | null; file_count: number | null; total_bytes: number | null;
  /** The live deployment id (null = nothing live). The screenshot is "current" when thumb_deployment equals it. */
  version: number | null;
  thumb_deployment: number | null;
  /** When the saved screenshot was taken (ms). null = none yet. */
  thumb_at: number | null;
};
type ProjectCardRow = Omit<ProjectCard, "latest_at" | "total_bytes" | "thumb_at"> & {
  latest_at: Date | string | null;
  total_bytes: number | string | null;
  thumb_at: Date | string | null;
};
export type Deployment = {
  id: number; project_id: number; number: number; status: "READY" | "ERROR";
  message: string; source: string; env: Record<string, string>; logs: LogLine[];
  file_count: number; total_bytes: number; duration_ms: number; created_at: string;
};

/** How many project cards the dashboard loads at a time. */
export const PROJECT_PAGE = 12;

/** One page of project cards (newest first), plus how many projects match in total. `term` filters by name or URL name. */
export async function listProjects(opts: { offset?: number; term?: string } = {}): Promise<{ projects: ProjectCard[]; total: number }> {
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const term = (opts.term ?? "").trim().slice(0, 80);
  const like = term ? `%${term.replace(/[\\%_]/g, "\\$&")}%` : null;
  const { rows, total } = await tx(async (client) => {
    await client.query("SET LOCAL statement_timeout = '8s'");
    const result = await client.query(`
      SELECT p.name, p.slug, p.git_repo, p.hide_from_landing, p.pinned, (p.site_password IS NOT NULL) AS locked,
        l.status AS latest_status, COALESCE(l.created_at, p.created_at) AS latest_at,
        a.file_count, a.total_bytes,
        p.active_deployment_id AS version, t.deployment_id AS thumb_deployment, t.updated_at AS thumb_at
      FROM nuke_projects p
      LEFT JOIN nuke_thumbs t ON t.project_id = p.id
      LEFT JOIN LATERAL (SELECT status, created_at FROM nuke_deployments WHERE project_id=p.id ORDER BY number DESC LIMIT 1) l ON true
      LEFT JOIN nuke_deployments a ON a.id = p.active_deployment_id
      WHERE ($1::text IS NULL OR p.name ILIKE $1 OR p.slug ILIKE $1)
      ORDER BY p.pinned DESC, COALESCE(l.created_at, p.created_at) DESC, p.id DESC
      LIMIT $2 OFFSET $3`, [like, PROJECT_PAGE, offset]);
    const count = await client.query(
      "SELECT COUNT(*)::int AS n FROM nuke_projects p WHERE ($1::text IS NULL OR p.name ILIKE $1 OR p.slug ILIKE $1)", [like]);
    return { rows: result.rows as ProjectCardRow[], total: count.rows[0].n as number };
  });
  return {
    total,
    projects: rows.map((row) => ({
      ...row,
      latest_at: row.latest_at instanceof Date ? row.latest_at.toISOString() : row.latest_at,
      total_bytes: row.total_bytes == null ? null : Number(row.total_bytes),
      thumb_at: row.thumb_at ? new Date(row.thumb_at).getTime() : null,
    })),
  };
}

export async function listLandingProjects(): Promise<{ name: string; slug: string; color: string | null }[]> {
  return q<{ name: string; slug: string; color: string | null }>(
    "SELECT name, slug, bubble_color AS color FROM nuke_projects WHERE active_deployment_id IS NOT NULL AND NOT hide_from_landing ORDER BY id",
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

/** Screenshot metadata only (never the image bytes). */
export async function getThumbMeta(projectId: number): Promise<{ deployment_id: number; at: number } | null> {
  const r = (await q<{ deployment_id: number; updated_at: string }>(
    "SELECT deployment_id, updated_at FROM nuke_thumbs WHERE project_id=$1", [projectId]))[0];
  return r ? { deployment_id: r.deployment_id, at: new Date(r.updated_at).getTime() } : null;
}