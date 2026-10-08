import crypto from "node:crypto";
import pg from "pg";
import { encryptValue } from "./crypto";
import { contentTypeFor } from "./shared";

declare global {
  // eslint-disable-next-line no-var
  var __nukePool: pg.Pool | undefined;
  // eslint-disable-next-line no-var
  var __nukeReady: Promise<void> | undefined;
}

/** SSL only when the server can actually do it: skip for sslmode=disable, unix sockets, localhost and PGSSL=disable. */
function sslOption(url: string): false | { rejectUnauthorized: boolean } {
  if (process.env.PGSSL === "disable") return false;
  // Regex instead of new URL(): socket-style URLs (postgresql://u@/db?host=/tmp) are not valid for URL().
  const mode = /[?&]sslmode=([^&#]+)/i.exec(url)?.[1]?.toLowerCase();
  if (mode === "disable") return false;
  const hostParam = decodeURIComponent(/[?&]host=([^&#]+)/i.exec(url)?.[1] ?? "");
  const host = (/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)/i.exec(url)?.[1] ?? "").toLowerCase();
  if (hostParam.startsWith("/")) return false; // unix socket via ?host=
  if (!host || host.startsWith("/")) return false; // no host => unix socket
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) return false;
  return { rejectUnauthorized: false };
}

function pool(): pg.Pool {
  if (!globalThis.__nukePool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    globalThis.__nukePool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX) || 4,
      connectionTimeoutMillis: 8000,
      ssl: sslOption(url),
    });
  }
  return globalThis.__nukePool;
}

export function sha256(buf: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nuke_projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'html',
  content TEXT NOT NULL DEFAULT '',
  public_env JSONB NOT NULL DEFAULT '{}'::jsonb,
  project_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE nuke_projects ADD COLUMN IF NOT EXISTS public_env JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE nuke_projects ADD COLUMN IF NOT EXISTS project_files JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE nuke_projects ADD COLUMN IF NOT EXISTS active_deployment_id INT;
ALTER TABLE nuke_projects ADD COLUMN IF NOT EXISTS git_repo TEXT;
ALTER TABLE nuke_projects ADD COLUMN IF NOT EXISTS git_branch TEXT;
ALTER TABLE nuke_projects ADD COLUMN IF NOT EXISTS git_dir TEXT;
ALTER TABLE nuke_projects ADD COLUMN IF NOT EXISTS hook_token TEXT;
UPDATE nuke_projects SET hook_token = replace(gen_random_uuid()::text, '-', '') WHERE hook_token IS NULL;

CREATE TABLE IF NOT EXISTS nuke_blobs (
  hash TEXT PRIMARY KEY,
  size INT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS nuke_deployments (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES nuke_projects(id) ON DELETE CASCADE,
  number INT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'upload',
  env JSONB NOT NULL DEFAULT '{}'::jsonb,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_count INT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, number)
);
CREATE TABLE IF NOT EXISTS nuke_files (
  deployment_id INT NOT NULL REFERENCES nuke_deployments(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  hash TEXT NOT NULL,
  size INT NOT NULL,
  content_type TEXT NOT NULL,
  PRIMARY KEY (deployment_id, path)
);
CREATE INDEX IF NOT EXISTS nuke_files_hash_idx ON nuke_files(hash);

CREATE TABLE IF NOT EXISTS nuke_project_secrets (
  project_id INT NOT NULL REFERENCES nuke_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, name)
);
CREATE TABLE IF NOT EXISTS nuke_env_vars (
  project_id INT NOT NULL REFERENCES nuke_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_enc TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, name)
);
CREATE TABLE IF NOT EXISTS nuke_fn_logs (
  id BIGSERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES nuke_projects(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INT NOT NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  output TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS nuke_fn_logs_project_idx ON nuke_fn_logs(project_id, id DESC);
CREATE TABLE IF NOT EXISTS nuke_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** Old single-table projects (content + project_files) become deployment #1. */
async function migrateLegacy(c: pg.PoolClient) {
  const { rows } = await c.query(
    `SELECT p.id, p.content, p.project_files, p.public_env FROM nuke_projects p
     WHERE p.active_deployment_id IS NULL AND p.content <> ''
       AND NOT EXISTS (SELECT 1 FROM nuke_deployments d WHERE d.project_id = p.id)`,
  );
  for (const p of rows) {
    const files: { path: string; buf: Buffer }[] = [{ path: "index.html", buf: Buffer.from(p.content) }];
    for (const f of Array.isArray(p.project_files) ? p.project_files : []) {
      if (!f?.path || typeof f.content !== "string") continue;
      files.push({ path: f.path, buf: Buffer.from(f.content, f.encoding === "base64" ? "base64" : "utf8") });
    }
    for (const f of files) {
      await c.query("INSERT INTO nuke_blobs (hash,size,data) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [sha256(f.buf), f.buf.length, f.buf]);
    }
    const total = files.reduce((n, f) => n + f.buf.length, 0);
    const logs = [{ ts: Date.now(), level: "success", msg: `Imported ${files.length} file(s) from the previous Nuke version.` }];
    const d = await c.query(
      `INSERT INTO nuke_deployments (project_id, number, status, message, source, env, logs, file_count, total_bytes)
       VALUES ($1, 1, 'READY', 'Imported from previous version', 'import', $2, $3, $4, $5) RETURNING id`,
      [p.id, JSON.stringify(p.public_env || {}), JSON.stringify(logs), files.length, total],
    );
    for (const f of files) {
      await c.query(
        "INSERT INTO nuke_files (deployment_id,path,hash,size,content_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [d.rows[0].id, f.path, sha256(f.buf), f.buf.length, contentTypeFor(f.path)],
      );
    }
    await c.query("UPDATE nuke_projects SET active_deployment_id=$1 WHERE id=$2", [d.rows[0].id, p.id]);
  }
}

/** Moves old public_env JSON and the short-lived "private secrets" table into nuke_env_vars (encrypted). */
async function migrateEnv(c: pg.PoolClient) {
  const done = await c.query("SELECT 1 FROM nuke_meta WHERE key='secrets_v1'");
  if (!done.rows.length) {
    await c.query(
      `INSERT INTO nuke_env_vars (project_id, name, value_enc, note, is_public, created_at, updated_at)
       SELECT project_id, name, encrypted_value, '', FALSE, created_at, updated_at FROM nuke_project_secrets
       ON CONFLICT DO NOTHING`,
    );
    await c.query("INSERT INTO nuke_meta (key, value) VALUES ('secrets_v1','1') ON CONFLICT DO NOTHING");
  }
  const { rows } = await c.query("SELECT id, public_env FROM nuke_projects WHERE public_env <> '{}'::jsonb");
  for (const p of rows) {
    for (const [name, value] of Object.entries(p.public_env as Record<string, unknown>)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) || typeof value !== "string") continue;
      await c.query(
        "INSERT INTO nuke_env_vars (project_id, name, value_enc, is_public) VALUES ($1,$2,$3,TRUE) ON CONFLICT DO NOTHING",
        [p.id, name, encryptValue(p.id, name, value)],
      );
    }
    await c.query("UPDATE nuke_projects SET public_env='{}'::jsonb WHERE id=$1", [p.id]);
  }
}

function ready(): Promise<void> {
  if (!globalThis.__nukeReady) {
    globalThis.__nukeReady = (async () => {
      const c = await pool().connect();
      try {
        await c.query("SELECT pg_advisory_lock(727274)");
        await c.query(SCHEMA);
        await migrateLegacy(c);
        await migrateEnv(c);
      } finally {
        await c.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
        c.release();
      }
    })().catch((error) => {
      globalThis.__nukeReady = undefined; // retry on next request
      throw error;
    });
  }
  return globalThis.__nukeReady;
}

export async function q<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const res = await pool().query(text, params);
  return res.rows as T[];
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    c.release();
  }
}