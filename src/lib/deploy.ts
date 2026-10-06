import { unzipSync } from "fflate";
import { q, tx, sha256 } from "./db";
import type { Project } from "./projects";
import {
  KEEP_DEPLOYMENTS, MAX_FILES, MAX_TOTAL_BYTES, cleanPath, classifyPath, contentTypeFor,
  detectRoot, formatBytes, type FileRef, type LogLevel, type LogLine,
} from "./shared";

export class Logger {
  start = Date.now();
  lines: LogLine[] = [];
  add(level: LogLevel, msg: string) { this.lines.push({ ts: Date.now(), level, msg }); }
  info(msg: string) { this.add("info", msg); }
  warn(msg: string) { this.add("warn", msg); }
  error(msg: string) { this.add("error", msg); }
  success(msg: string) { this.add("success", msg); }
}

export type DeployResult = { ok: boolean; number: number; error?: string };

type Opts = {
  project: Pick<Project, "id" | "slug" | "public_env">;
  refs: FileRef[];
  message: string;
  source: string;
  origin: string;
  log?: Logger;
};

export async function createDeployment(o: Opts): Promise<DeployResult> {
  const log = o.log ?? new Logger();
  const fail = async (msg: string): Promise<DeployResult> => {
    log.error(msg);
    log.error("Deployment failed. The live site was not changed.");
    const number = await saveRow(o, log, "ERROR", [], 0);
    return { ok: false, number, error: msg };
  };

  log.info(`Received ${o.refs.length} file(s).`);
  try {
    // 1. normalise paths, drop junk and secrets
    let refs: FileRef[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (const r of o.refs) {
      const path = cleanPath(r.path);
      const kind = classifyPath(path);
      if (kind === "skip") { skipped++; continue; }
      if (kind === "secret") { log.warn(`Skipped ${path}: secret-looking files are never published.`); continue; }
      if (seen.has(path)) throw new Error(`${path} appears more than once.`);
      seen.add(path);
      refs.push({ ...r, path });
    }
    if (skipped) log.info(`Ignored ${skipped} file(s) in .git, node_modules and similar folders.`);

    // 2. find the site root (index.html)
    const { prefix, note } = detectRoot(refs.map((r) => r.path));
    if (prefix) {
      const before = refs.length;
      refs = refs.filter((r) => r.path.startsWith(prefix)).map((r) => ({ ...r, path: r.path.slice(prefix.length) }));
      if (note) log.info(note + (before !== refs.length ? ` (${before - refs.length} file(s) outside it were left out).` : "."));
    }
    if (!refs.some((r) => r.path === "index.html")) {
      return fail("No index.html found at the project root. Add an index.html and deploy again.");
    }
    if (refs.length > MAX_FILES) return fail(`Too many files (${refs.length}). The limit is ${MAX_FILES}.`);

    // 3. verify blobs and real sizes
    const hashes = [...new Set(refs.map((r) => r.hash))];
    const found = await q<{ hash: string; size: number }>("SELECT hash, size FROM nuke_blobs WHERE hash = ANY($1::text[])", [hashes]);
    const sizes = new Map(found.map((b) => [b.hash, b.size]));
    const missing = refs.filter((r) => !sizes.has(r.hash));
    if (missing.length) return fail(`${missing.length} file(s) were not uploaded (e.g. ${missing[0].path}). Please retry.`);
    refs = refs.map((r) => ({ ...r, size: sizes.get(r.hash)! }));
    const total = refs.reduce((n, r) => n + r.size, 0);
    if (total > MAX_TOTAL_BYTES) return fail(`Project is ${formatBytes(total)}. The limit is ${formatBytes(MAX_TOTAL_BYTES)}.`);
    log.info(`Verified ${refs.length} file(s), ${formatBytes(total)} total.`);

    // 4. env
    const names = Object.keys(o.project.public_env || {});
    log.info(names.length ? `Injecting ${names.length} environment variable(s): ${names.join(", ")}` : "No environment variables set.");

    // 5. publish
    const number = await saveRow(o, log, "READY", refs, total, true);
    return { ok: true, number };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unexpected error.");
  }
}

async function saveRow(o: Opts, log: Logger, status: "READY" | "ERROR", refs: FileRef[], total: number, promote = false) {
  const duration = Date.now() - log.start;
  if (promote) {
    log.success(`Live at ${o.origin}/${o.project.slug}/`);
    log.success(`Ready in ${duration} ms.`);
  }
  const number = await tx(async (c) => {
    const d = await c.query(
      `INSERT INTO nuke_deployments (project_id, number, status, message, source, env, logs, file_count, total_bytes, duration_ms)
       VALUES ($1, (SELECT COALESCE(MAX(number),0)+1 FROM nuke_deployments WHERE project_id=$1), $2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, number`,
      [o.project.id, status, o.message.slice(0, 200), o.source, JSON.stringify(o.project.public_env || {}),
        JSON.stringify(log.lines), refs.length, total, duration],
    );
    const id = d.rows[0].id as number;
    if (refs.length) {
      await c.query(
        `INSERT INTO nuke_files (deployment_id, path, hash, size, content_type)
         SELECT $1, * FROM unnest($2::text[], $3::text[], $4::int[], $5::text[])`,
        [id, refs.map((r) => r.path), refs.map((r) => r.hash), refs.map((r) => r.size), refs.map((r) => contentTypeFor(r.path))],
      );
    }
    if (promote) await c.query("UPDATE nuke_projects SET active_deployment_id=$1, updated_at=NOW() WHERE id=$2", [id, o.project.id]);
    return d.rows[0].number as number;
  });
  await prune(o.project.id).catch(() => {});
  return number;
}

async function prune(projectId: number) {
  await q(
    `DELETE FROM nuke_deployments WHERE project_id=$1
       AND id <> COALESCE((SELECT active_deployment_id FROM nuke_projects WHERE id=$1), -1)
       AND number <= (SELECT MAX(number) FROM nuke_deployments WHERE project_id=$1) - $2`,
    [projectId, KEEP_DEPLOYMENTS],
  );
  await q(`DELETE FROM nuke_blobs b WHERE b.created_at < NOW() - INTERVAL '1 hour'
           AND NOT EXISTS (SELECT 1 FROM nuke_files f WHERE f.hash = b.hash)`);
}

export async function failDeployment(o: Omit<Opts, "refs">, msg: string): Promise<DeployResult> {
  const log = o.log ?? new Logger();
  log.error(msg);
  log.error("Deployment failed. The live site was not changed.");
  const number = await saveRow({ ...o, refs: [] }, log, "ERROR", [], 0);
  return { ok: false, number, error: msg };
}

export async function storeBlobs(items: { hash: string; data: Buffer }[]) {
  for (const it of items) {
    await q("INSERT INTO nuke_blobs (hash,size,data) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [it.hash, it.data.length, it.data]);
  }
}

export async function redeploy(project: Project, fromDeploymentId: number | null, origin: string, message: string, source = "redeploy") {
  const id = fromDeploymentId ?? project.active_deployment_id;
  const log = new Logger();
  if (!id) return failDeployment({ project, message, source, origin, log }, "Nothing to redeploy yet. Upload files first.");
  const refs = await q<FileRef>("SELECT path, hash, size FROM nuke_files WHERE deployment_id=$1", [id]);
  log.info("Reusing files from a previous deployment.");
  return createDeployment({ project, refs, message, source, origin, log });
}

export async function promote(project: Project, number: number) {
  const rows = await q<{ id: number }>("SELECT id FROM nuke_deployments WHERE project_id=$1 AND number=$2 AND status='READY'", [project.id, number]);
  if (!rows[0]) throw new Error("Only successful deployments can be promoted.");
  await tx(async (c) => {
    await c.query("UPDATE nuke_projects SET active_deployment_id=$1, updated_at=NOW() WHERE id=$2", [rows[0].id, project.id]);
    await c.query(
      "UPDATE nuke_deployments SET logs = logs || $1::jsonb WHERE id=$2",
      [JSON.stringify([{ ts: Date.now(), level: "success", msg: "Promoted to production." }]), rows[0].id],
    );
  });
}

export function parseRepo(input: string): { owner: string; name: string; branch?: string; dir?: string } {
  const raw = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "");
  const [owner, name, tree, branch, ...rest] = raw.split("/");
  if (!owner || !name || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) {
    throw new Error("Enter a repository like owner/name or a github.com URL.");
  }
  return tree === "tree" && branch ? { owner, name, branch, dir: rest.join("/") || undefined } : { owner, name };
}

export async function githubDeploy(
  project: Project,
  git: { repo: string; branch?: string; dir?: string },
  origin: string,
  message?: string,
): Promise<DeployResult> {
  const log = new Logger();
  const fallback = (msg: string) => failDeployment({ project, message: message || "GitHub import", source: "github", origin, log }, msg);
  let parsed;
  try { parsed = parseRepo(git.repo); } catch (e) { return fallback((e as Error).message); }
  const branch = git.branch || parsed.branch || "";
  const dir = (git.dir || parsed.dir || "").replace(/^\/+|\/+$/g, "");
  const repo = `${parsed.owner}/${parsed.name}`;
  log.info(`Cloning github.com/${repo}${branch ? ` (${branch})` : ""}...`);
  const headers: Record<string, string> = { "User-Agent": "nuke-hosting" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://codeload.github.com/${repo}/zip/${branch ? `refs/heads/${branch}` : "HEAD"}`, { headers }).catch(() => null);
  if (!res || !res.ok) {
    return fallback(res?.status === 404
      ? "Repository or branch not found. For private repos set GITHUB_TOKEN in your environment."
      : `GitHub download failed${res ? ` (${res.status})` : ""}.`);
  }
  const zip = new Uint8Array(await res.arrayBuffer());
  if (zip.length > MAX_TOTAL_BYTES) return fallback(`Repository archive is ${formatBytes(zip.length)}; the limit is ${formatBytes(MAX_TOTAL_BYTES)}.`);
  log.info(`Downloaded ${formatBytes(zip.length)}.`);

  const entries = unzipSync(zip, { filter: (f) => !f.name.endsWith("/") && classifyPath(f.name.split("/").slice(1).join("/") || "x") !== "skip" });
  const refs: FileRef[] = [];
  const blobs: { hash: string; data: Buffer }[] = [];
  const dirPrefix = dir ? `${dir}/` : "";
  for (const [name, bytes] of Object.entries(entries)) {
    const rel = name.split("/").slice(1).join("/"); // drop "<repo>-<ref>/"
    if (!rel || (dirPrefix && !rel.startsWith(dirPrefix))) continue;
    const data = Buffer.from(bytes);
    const hash = sha256(data);
    blobs.push({ hash, data });
    refs.push({ path: dirPrefix ? rel.slice(dirPrefix.length) : rel, hash, size: data.length });
  }
  if (dir && !refs.length) return fallback(`Folder "${dir}" was not found in the repository.`);
  await storeBlobs(blobs);
  const result = await createDeployment({ project, refs, message: message || `Deploy ${repo}${branch ? `@${branch}` : ""}`, source: "github", origin, log });
  if (result.ok) {
    // remember the source only once it has worked, so a typo never overwrites a good repo
    await q("UPDATE nuke_projects SET git_repo=$1, git_branch=$2, git_dir=$3 WHERE id=$4", [repo, branch || null, dir || null, project.id]);
  }
  return result;
}
