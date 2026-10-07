import { spawn } from "node:child_process";
import { posix } from "node:path";
import { transform } from "sucrase";
// Imported so the bundler ships these packages with the server: function code loads them at runtime.
import * as neon from "@neondatabase/serverless";
import pg from "pg";
import ws from "ws";
import { q } from "./db";
import { allEnv } from "./env-vars";
import { FUNCTION_EXT, SUPPORTED_PACKAGES } from "./shared";
import { RUNNER } from "./function-runner";

export const BUNDLED_PACKAGES = [neon, pg, ws].length;

const TIMEOUT_MS = 25_000;
const MAX_OUT = 6 * 1024 * 1024;
const MAX_LOG = 8 * 1024;
const CODE = /\.(js|mjs|cjs|ts|json)$/;
const EXT_TRY = ["", ".js", ".mjs", ".cjs", ".ts", ".json", "/index.js", "/index.mjs", "/index.cjs", "/index.ts"];

type Mod = string | { error: string };
const moduleCache = new Map<string, Record<string, Mod>>();

/** api/tracker (no extension) -> the file in this deployment that implements it. */
export async function findFunction(deploymentId: number, route: string): Promise<string | null> {
  const candidates = [".js", ".mjs", ".cjs", ".ts", "/index.js", "/index.mjs", "/index.cjs", "/index.ts"].map((e) => route + e);
  const rows = await q<{ path: string }>(
    "SELECT path FROM nuke_files WHERE deployment_id=$1 AND path = ANY($2::text[]) ORDER BY array_position($2::text[], path) LIMIT 1",
    [deploymentId, candidates],
  );
  return rows[0]?.path ?? null;
}

function toCjs(path: string, code: string): string {
  if (path.endsWith(".json")) return code;
  return transform(code, { transforms: path.endsWith(".ts") ? ["typescript", "imports"] : ["imports"], disableESTransforms: true, production: true }).code;
}

/** Entry file plus every local file it (transitively) imports, converted to CommonJS. */
async function collectModules(deploymentId: number, entry: string): Promise<Record<string, Mod>> {
  const key = `${deploymentId}|${entry}`;
  const hit = moduleCache.get(key);
  if (hit) return hit;

  const files = await q<{ path: string; hash: string }>("SELECT path, hash FROM nuke_files WHERE deployment_id=$1", [deploymentId]);
  const byPath = new Map(files.filter((f) => CODE.test(f.path)).map((f) => [f.path, f.hash]));
  const out: Record<string, Mod> = {};
  const queue = [entry];
  let total = 0;
  while (queue.length) {
    const path = queue.pop()!;
    if (path in out) continue;
    const blob = (await q<{ data: Buffer }>("SELECT data FROM nuke_blobs WHERE hash=$1", [byPath.get(path)]))[0];
    if (!blob) { out[path] = { error: "file data missing" }; continue; }
    total += blob.data.length;
    if (total > 4 * 1024 * 1024) { out[path] = { error: "function files are too large (4 MB max)" }; continue; }
    const src = blob.data.toString("utf8");
    try { out[path] = toCjs(path, src); } catch (e) { out[path] = { error: (e as Error).message }; continue; }
    if (path.endsWith(".json")) continue;
    for (const m of src.matchAll(/(?:require\(\s*|from\s+|import\s+|import\(\s*)(["'])(\.{1,2}(?:\/[^"']*)?)\1/g)) {
      const base = posix.normalize(posix.join(posix.dirname(path), m[2]));
      const found = EXT_TRY.map((e) => base + e).find((p) => byPath.has(p));
      if (found && !(found in out)) queue.push(found);
    }
  }
  if (moduleCache.size > 40) moduleCache.delete(moduleCache.keys().next().value!);
  moduleCache.set(key, out);
  return out;
}

// --- limits -------------------------------------------------------------------------------
const MAX_CONCURRENT = Number(process.env.NUKE_FN_CONCURRENCY) || 4;
let running = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<boolean> {
  if (running < MAX_CONCURRENT) { running++; return true; }
  if (waiters.length >= 20) return false;
  await new Promise<void>((r) => waiters.push(r)); // slot is handed over by release()
  return true;
}
function release() { const next = waiters.shift(); if (next) next(); else running--; }

const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > 120;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

async function logCall(projectId: number, method: string, path: string, status: number, ms: number, output: string) {
  try {
    await q("INSERT INTO nuke_fn_logs (project_id, method, path, status, duration_ms, output) VALUES ($1,$2,$3,$4,$5,$6)",
      [projectId, method, path.slice(0, 300), status, ms, output.slice(0, MAX_LOG)]);
    if (Math.random() < 0.1) {
      await q(`DELETE FROM nuke_fn_logs WHERE project_id=$1 AND id < COALESCE((SELECT id FROM nuke_fn_logs WHERE project_id=$1 ORDER BY id DESC OFFSET 199 LIMIT 1), 0)`, [projectId]);
    }
  } catch { /* logging must never break a response */ }
}

type Call = {
  project: { id: number; slug: string };
  deploymentId: number;
  entry: string;
  method: string;
  url: string; // path + query as the function should see it, e.g. /api/tracker?x=1
  headers: Record<string, string>;
  body: Buffer;
  ip: string;
};

export async function runFunction(c: Call): Promise<Response> {
  const started = Date.now();
  const logPath = c.url;
  if (rateLimited(`${c.ip}|${c.project.slug}`)) return json(429, { error: "Too many requests. Slow down." }, { "Retry-After": "60" });
  if (!(await acquire())) return json(503, { error: "The server is busy. Try again in a moment." });

  let output = "";
  let status = 500;
  try {
    const [modules, env] = await Promise.all([collectModules(c.deploymentId, c.entry), allEnv(c.project.id)]);
    for (const k of ["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH"]) delete env[k];

    const child = spawn(process.execPath, ["-e", RUNNER], {
      // Only the project's own variables. None of Nuke's (DATABASE_URL, NUKE_PASSWORD, ...) are passed.
      env: { ...env, NUKE: "1", NODE_ENV: "production", NUKE_PROJECT: c.project.slug, PATH: "/usr/local/bin:/usr/bin:/bin" },
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let outBytes = 0;
    let errText = "";
    let tooBig = false;
    child.stdout.on("data", (d: Buffer) => { outBytes += d.length; if (outBytes > MAX_OUT) { tooBig = true; child.kill("SIGKILL"); } else stdout.push(d); });
    child.stderr.on("data", (d: Buffer) => { if (errText.length < MAX_LOG) errText += d.toString("utf8"); });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({
      entry: c.entry, modules, packages: SUPPORTED_PACKAGES,
      req: { method: c.method, url: c.url, headers: c.headers, body: c.body.toString("base64"), ip: c.ip },
    }));

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, TIMEOUT_MS);
    await new Promise<void>((resolve) => { child.on("close", () => resolve()); child.on("error", (e) => { errText += `spawn failed: ${e.message}\n`; resolve(); }); });
    clearTimeout(timer);

    output = errText;
    if (timedOut) { status = 504; output += `\nTimed out after ${TIMEOUT_MS / 1000}s.`; return json(504, { error: "The function took too long." }); }
    if (tooBig) { status = 502; output += "\nResponse was larger than 6 MB."; return json(502, { error: "The function response was too large." }); }

    let result: { status?: number; headers?: Record<string, string | string[]>; body?: string; error?: string } | null = null;
    try { result = JSON.parse(Buffer.concat(stdout).toString("utf8")); } catch { /* handled below */ }
    if (!result || result.error) {
      output += `\n${result?.error || "The function process exited without a response."}`;
      return json(500, { error: "The function crashed. Open Logs in the Nuke dashboard for details." });
    }

    status = Number(result.status) || 200;
    const headers = new Headers();
    for (const [k, v] of Object.entries(result.headers || {})) {
      const key = k.toLowerCase();
      if (["connection", "keep-alive", "transfer-encoding", "content-length", "upgrade"].includes(key)) continue;
      for (const val of Array.isArray(v) ? v : [String(v)]) {
        if (key === "set-cookie" && /^\s*nuke_session\s*=/i.test(val)) continue; // never let a site touch the owner's login
        try { headers.append(key, val); } catch { /* skip invalid header */ }
      }
    }
    headers.set("X-Content-Type-Options", "nosniff");
    if (!headers.has("cache-control")) headers.set("Cache-Control", "no-store");
    const body = Buffer.from(result.body || "", "base64");
    return new Response([204, 205, 304].includes(status) || c.method === "HEAD" ? null : new Uint8Array(body), { status, headers });
  } catch (e) {
    output += `\n${(e as Error).message}`;
    status = 500;
    return json(500, { error: "The function could not start. Open Logs in the Nuke dashboard for details." });
  } finally {
    release();
    await logCall(c.project.id, c.method, logPath, status, Date.now() - started, output.trim());
  }
}
