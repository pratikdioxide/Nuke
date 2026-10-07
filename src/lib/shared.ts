// Pure helpers shared by server and browser code (no node: imports here).

export const MAX_FILES = 1000;
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // browser upload limit per file (Vercel body limit ~4.5 MB)
export const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
export const KEEP_DEPLOYMENTS = 15;

export const RESERVED_SLUGS = new Set([
  "dashboard", "login", "logout", "api", "_next", "static", "public", "assets",
  "admin", "favicon", "robots", "sitemap", "nuke", "docs", "new", "settings",
]);

export function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function slugError(slug: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug)) {
    return "Use 1-40 lowercase letters, numbers or dashes (no dash at the start or end).";
  }
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved. Pick another name.`;
  return null;
}

const MIME: Record<string, string> = {
  avif: "image/avif", css: "text/css; charset=utf-8", csv: "text/csv; charset=utf-8",
  eot: "application/vnd.ms-fontobject", gif: "image/gif", htm: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8", ico: "image/x-icon", jpeg: "image/jpeg", jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8", cjs: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8", md: "text/markdown; charset=utf-8",
  mp3: "audio/mpeg", mp4: "video/mp4", m4a: "audio/mp4", mov: "video/quicktime", ogg: "audio/ogg",
  otf: "font/otf", pdf: "application/pdf", png: "image/png", svg: "image/svg+xml",
  ttf: "font/ttf", txt: "text/plain; charset=utf-8", text: "text/plain; charset=utf-8",
  wasm: "application/wasm", webmanifest: "application/manifest+json", webm: "video/webm",
  webp: "image/webp", wav: "audio/wav", woff: "font/woff", woff2: "font/woff2",
  xml: "application/xml; charset=utf-8", yaml: "text/plain; charset=utf-8", yml: "text/plain; charset=utf-8",
  toml: "text/plain; charset=utf-8",
};

export function extOf(path: string): string {
  const name = path.split("/").pop() || "";
  const dot = name.lastIndexOf(".");
  return dot > 0 || (dot === 0 && name.length > 1) ? name.slice(dot + 1).toLowerCase() : "";
}

export function contentTypeFor(path: string): string {
  return MIME[extOf(path)] || "application/octet-stream";
}

export function isTextPath(path: string): boolean {
  const ct = contentTypeFor(path);
  return ct.startsWith("text/") || /json|xml|svg/.test(ct);
}

/** Returns a clean relative path or throws. */
export function cleanPath(input: string): string {
  const p = String(input ?? "").replace(/\\/g, "/").trim();
  const parts = p.split("/");
  if (!p || p.startsWith("/") || p.includes("\0") || /^[a-z]:/i.test(p) || parts.some((s) => !s || s === "." || s === "..")) {
    throw new Error(`Invalid file path: ${p || "(empty)"}. Use a relative path like assets/site.css.`);
  }
  return p;
}

const SECRET_NAMES = new Set([".npmrc", ".netrc", "id_rsa", "id_ed25519"]);
const SKIP_DIRS = new Set([".git", "node_modules", "__macosx", ".next", ".vercel", ".idea", ".vscode"]);

/** "skip" = silently ignored junk, "secret" = skipped with a warning. */
export function classifyPath(path: string): "ok" | "skip" | "secret" {
  const segs = path.split("/").map((s) => s.toLowerCase());
  const name = segs[segs.length - 1];
  if (segs.slice(0, -1).some((s) => SKIP_DIRS.has(s)) || name === ".ds_store" || name === "thumbs.db") return "skip";
  if (/^\.env/.test(name) || SECRET_NAMES.has(name) || name.endsWith(".pem")) return "secret";
  return "ok";
}

const ROOT_CANDIDATES = ["dist", "build", "out", "public", "docs", "www", "site", "_site", "static"];

/**
 * Finds the folder that holds index.html: the root, a single wrapping folder,
 * or a common build folder (dist, build, out, public ...). Returns the prefix to strip.
 */
export function detectRoot(paths: string[]): { prefix: string; note: string | null } {
  let prefix = "";
  for (let round = 0; round < 3; round++) {
    const rel = paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
    if (rel.includes("index.html")) return { prefix, note: prefix ? `Using "${prefix}" as the site root` : null };
    const tops = new Set(rel.map((p) => p.split("/")[0]));
    const onlyFolder = rel.length > 0 && tops.size === 1 && rel.every((p) => p.includes("/"));
    if (onlyFolder) { prefix += `${[...tops][0]}/`; continue; }
    const hit = ROOT_CANDIDATES.find((d) => rel.includes(`${d}/index.html`));
    if (hit) { prefix += `${hit}/`; continue; }
    break;
  }
  return { prefix: "", note: null };
}

export function validateEnvVars(input: unknown): Record<string, string> {
  if (!Array.isArray(input)) throw new Error("Environment variables must be a list.");
  if (input.length > 100) throw new Error("A project can have up to 100 environment variables.");
  const out: Record<string, string> = {};
  let bytes = 0;
  for (const item of input) {
    const key = typeof item?.key === "string" ? item.key.trim() : "";
    const value = typeof item?.value === "string" ? item.value : "";
    if (!key && !value) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`"${key || "(empty)"}" is not a valid name. Use letters, numbers and underscores, not starting with a number.`);
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error(`${key} is listed twice.`);
    bytes += key.length + value.length;
    if (bytes > 256_000) throw new Error("Environment variables must total less than 256 KB.");
    out[key] = value;
  }
  return out;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "never";
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export type LogLevel = "info" | "warn" | "error" | "success";
export type LogLine = { ts: number; level: LogLevel; msg: string };
export type FileRef = { path: string; hash: string; size: number };

/** Packages that api/ functions can import. Everything else must be bundled into your own files. */
export const SUPPORTED_PACKAGES = ["@neondatabase/serverless", "pg", "ws"];
export const FUNCTION_EXT = /\.(js|mjs|cjs|ts)$/;

/** api/tracker.js -> "api/tracker", api/x/index.js -> "api/x" */
export function functionRoute(path: string): string | null {
  if (!path.startsWith("api/") || !FUNCTION_EXT.test(path)) return null;
  return path.replace(FUNCTION_EXT, "").replace(/\/index$/, "");
}
