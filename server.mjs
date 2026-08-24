import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const sessionSecret = process.env.SESSION_SECRET || "change-me";
const adminPassword = process.env.NUKE_PASSWORD;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function tokenFor(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("hex");
}
function isAuthed(req) {
  const token = req.headers.cookie?.match(/nuke_session=([^;]+)/)?.[1];
  return token === tokenFor("nuke-admin");
}
function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: "Authentication required" });
  next();
}
function ensureConfigured(res) {
  if (!pool) {
    res.status(503).json({ error: "DATABASE_URL is not configured yet." });
    return false;
  }
  if (!adminPassword) {
    res.status(503).json({ error: "NUKE_PASSWORD is not configured yet." });
    return false;
  }
  return true;
}
async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nuke_projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('html', 'external')),
      content TEXT,
      external_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
const dbReady = initDb().catch((error) => {
  console.error("Database initialization failed:", error.message);
});

const embedCache = new Map(); // url -> { ok: boolean, expires: number }
const EMBED_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function canEmbed(url) {
  const cached = embedCache.get(url);
  if (cached && cached.expires > Date.now()) return cached.ok;

  let ok = true; // if we can't determine, prefer attempting the iframe
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    let resp;
    try {
      resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; NukeFrameCheck/1.0)" } });
    } catch {
      resp = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; NukeFrameCheck/1.0)" } });
      resp.body?.cancel?.().catch(() => {});
    }
    clearTimeout(timeout);

    const xfo = (resp.headers.get("x-frame-options") || "").toLowerCase();
    if (xfo.includes("deny") || xfo.includes("sameorigin")) ok = false;

    const csp = resp.headers.get("content-security-policy") || "";
    const match = csp.match(/frame-ancestors\s+([^;]+)/i);
    if (match) {
      const sources = match[1].trim().toLowerCase();
      if (sources.includes("'none'")) ok = false;
      else if (!sources.includes("*") && !sources.includes("'self'")) ok = false;
    }
  } catch {
    ok = true; // network hiccup — don't punish the site, just try to embed it
  }

  embedCache.set(url, { ok, expires: Date.now() + EMBED_CACHE_TTL });
  return ok;
}

app.get("/api/auth/session", (req, res) => res.json({ authenticated: isAuthed(req), configured: Boolean(pool && adminPassword) }));
app.post("/api/auth/login", (req, res) => {
  if (!ensureConfigured(res)) return;
  const submitted = Buffer.from(typeof req.body?.password === "string" ? req.body.password : "");
  const expected = Buffer.from(adminPassword);
  if (submitted.length !== expected.length || !crypto.timingSafeEqual(submitted, expected)) {
    return res.status(401).json({ error: "That password isn’t right." });
  }
  res.setHeader("Set-Cookie", `nuke_session=${tokenFor("nuke-admin")}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
  res.json({ authenticated: true });
});
app.post("/api/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "nuke_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ authenticated: false });
});

app.get("/api/projects", requireAuth, async (req, res) => {
  await dbReady;
  if (!ensureConfigured(res)) return;
  const { rows } = await pool.query("SELECT id, name, slug, kind, content, external_url, created_at, updated_at FROM nuke_projects ORDER BY updated_at DESC");
  res.json(rows);
});
app.post("/api/projects", requireAuth, async (req, res) => {
  await dbReady;
  if (!ensureConfigured(res)) return;
  const { name, slug, kind, content, externalUrl } = req.body || {};
  if (!name?.trim() || !slug?.trim() || !["html", "external"].includes(kind)) return res.status(400).json({ error: "Name, slug, and a valid project type are required." });
  if (kind === "html" && !content?.trim()) return res.status(400).json({ error: "HTML content is required." });
  if (kind === "external" && !/^https?:\/\//i.test(externalUrl || "")) return res.status(400).json({ error: "Use a complete http:// or https:// URL." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO nuke_projects (name, slug, kind, content, external_url) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name.trim(), slug.trim().toLowerCase(), kind, kind === "html" ? content : null, kind === "external" ? externalUrl.trim() : null],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That slug is already in use." });
    res.status(500).json({ error: "Could not save the project." });
  }
});
app.put("/api/projects/:id", requireAuth, async (req, res) => {
  await dbReady;
  if (!ensureConfigured(res)) return;
  const { name, slug, content, externalUrl } = req.body || {};
  if (!name?.trim() || !slug?.trim()) return res.status(400).json({ error: "Name and slug are required." });
  try {
    const { rows } = await pool.query(
      "UPDATE nuke_projects SET name=$1, slug=$2, content=CASE WHEN kind='html' THEN $3 ELSE content END, external_url=CASE WHEN kind='external' THEN $4 ELSE external_url END, updated_at=NOW() WHERE id=$5 RETURNING *",
      [name.trim(), slug.trim().toLowerCase(), content || null, externalUrl?.trim() || null, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Project not found." });
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That slug is already in use." });
    res.status(500).json({ error: "Could not update the project." });
  }
});
app.delete("/api/projects/:id", requireAuth, async (req, res) => {
  await dbReady;
  if (!ensureConfigured(res)) return;
  await pool.query("DELETE FROM nuke_projects WHERE id=$1", [req.params.id]);
  res.status(204).end();
});

app.get("/:slug", async (req, res, next) => {
  if (req.params.slug.includes(".")) return next();
  if (!pool) return res.status(503).send("DATABASE_URL is not configured yet.");
  await dbReady;
  const { rows } = await pool.query("SELECT * FROM nuke_projects WHERE slug=$1", [req.params.slug]);
  const project = rows[0];
  if (!project) return next();
  if (project.kind === "html") return res.type("html").send(project.content);
  const safeUrl = project.external_url;
  const safeName = project.name.replaceAll("<", "&lt;");
  const embeddable = await canEmbed(safeUrl);

  if (embeddable) {
    return res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeName} · Nuke</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#0B0B0D}body{overflow:hidden}.fallback{position:fixed;bottom:18px;left:18px;padding:10px 16px;border-radius:999px;background:#F5A9C8;color:#1A0F16;font:600 13px system-ui;text-decoration:none;box-shadow:0 8px 20px rgba(0,0,0,.4);z-index:10}</style></head><body><iframe src="${safeUrl}" title="${project.name.replaceAll('"', "&quot;")}"></iframe><a class="fallback" href="${safeUrl}" target="_blank" rel="noreferrer">Open externally ↗</a></body></html>`);
  }

  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${safeUrl}"><title>${safeName} · Nuke</title><style>html,body{margin:0;height:100%;background:#0B0B0D;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#F5F5F5}.wrap{text-align:center}img{width:44px;height:44px;opacity:.5;animation:spin 2s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}p{color:#9A9A9E;font-size:13px;margin:14px 0 6px}a{color:#F5A9C8;font-size:13px;text-decoration:none;font-weight:600}</style></head><body><div class="wrap"><img src="/nuke-logo.svg" alt=""><p>Opening ${safeName}…</p><a href="${safeUrl}">Continue if you're not redirected →</a></div><script>location.replace(${JSON.stringify(safeUrl)});</script></body></html>`);
});

export { app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(port, "0.0.0.0", () => console.info(`Nuke listening on ${port}`));
}