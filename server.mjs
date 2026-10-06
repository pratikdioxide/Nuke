import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { injectPublicEnv, normalizePublicEnv } from "./public-env.mjs";
import { contentTypeForProjectPath, normalizeProjectFiles, normalizeRequestedProjectPath } from "./project-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const sessionSecret = process.env.SESSION_SECRET || "change-me";
const adminPassword = process.env.NUKE_PASSWORD;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

app.use(express.json({ limit: "32mb" }));
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
      kind TEXT NOT NULL CHECK (kind = 'html'),
      content TEXT NOT NULL,
      public_env JSONB NOT NULL DEFAULT '{}'::jsonb,
      project_files JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE nuke_projects ADD COLUMN IF NOT EXISTS public_env JSONB NOT NULL DEFAULT '{}'::jsonb");
}
const dbReady = initDb().catch((error) => {
  console.error("Database initialization failed:", error.message);
});

app.get("/api/auth/session", (req, res) => res.json({ authenticated: isAuthed(req), configured: Boolean(pool && adminPassword) }));
app.get("/api/public-projects", async (req, res) => {
  await dbReady;
  if (!pool) return res.status(503).json({ error: "DATABASE_URL is not configured yet." });
  const { rows } = await pool.query("SELECT name, slug FROM nuke_projects WHERE kind='html' ORDER BY updated_at DESC");
  res.json(rows);
});
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
  const { rows } = await pool.query("SELECT id, name, slug, kind, content, public_env, created_at, updated_at FROM nuke_projects WHERE kind='html' ORDER BY updated_at DESC");
  res.json(rows);
});
app.get("/api/projects/:id", requireAuth, async (req, res) => {
  await dbReady;
  if (!ensureConfigured(res)) return;
  const { rows } = await pool.query("SELECT * FROM nuke_projects WHERE id=$1 AND kind='html'", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Project not found." });
  res.json(rows[0]);
});
app.post("/api/projects", requireAuth, async (req, res) => {
  await dbReady;
  if (!ensureConfigured(res)) return;
  const { name, slug, content } = req.body || {};
  if (typeof name !== "string" || !name.trim() || typeof slug !== "string" || !slug.trim()) {
    return res.status(400).json({ error: "Project name and URL slug are required." });
  }
  if (typeof content !== "string" || !content.trim()) return res.status(400).json({ error: "Add a root index.html page before publishing." });
  let publicEnv;
  let projectFiles;
  try {
    publicEnv = normalizePublicEnv(req.body?.publicEnv);
    projectFiles = normalizeProjectFiles(req.body?.projectFiles, content);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO nuke_projects (name, slug, kind, content, public_env, project_files) VALUES ($1,$2,'html',$3,$4::jsonb,$5::jsonb) RETURNING id, name, slug, kind, content, public_env, created_at, updated_at",
      [name.trim(), slug.trim().toLowerCase(), content, JSON.stringify(publicEnv), JSON.stringify(projectFiles)],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That slug is already in use." });
    console.error("Project create failed:", error.message);
    if (error.code === "42703" && error.message.includes("project_files")) {
      return res.status(500).json({ error: "The Neon database is missing the project_files column. Apply the SQL migration provided with this update, then retry." });
    }
    res.status(500).json({ error: "Could not save the project. Check the server log for details." });
  }
});
app.put("/api/projects/:id", requireAuth, async (req, res) => {
  await dbReady;
  if (!ensureConfigured(res)) return;
  const { name, slug, content } = req.body || {};
  if (typeof name !== "string" || !name.trim() || typeof slug !== "string" || !slug.trim()) {
    return res.status(400).json({ error: "Project name and URL slug are required." });
  }
  if (typeof content !== "string" || !content.trim()) return res.status(400).json({ error: "Add a root index.html page before publishing." });
  let publicEnv;
  let projectFiles;
  try {
    publicEnv = normalizePublicEnv(req.body?.publicEnv);
    projectFiles = normalizeProjectFiles(req.body?.projectFiles, content);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const { rows } = await pool.query(
      "UPDATE nuke_projects SET name=$1, slug=$2, content=$3, public_env=$4::jsonb, project_files=$5::jsonb, updated_at=NOW() WHERE id=$6 AND kind='html' RETURNING id, name, slug, kind, content, public_env, created_at, updated_at",
      [name.trim(), slug.trim().toLowerCase(), content, JSON.stringify(publicEnv), JSON.stringify(projectFiles), req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Project not found." });
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That slug is already in use." });
    console.error("Project update failed:", error.message);
    if (error.code === "42703" && error.message.includes("project_files")) {
      return res.status(500).json({ error: "The Neon database is missing the project_files column. Apply the SQL migration provided with this update, then retry." });
    }
    res.status(500).json({ error: "Could not update the project. Check the server log for details." });
  }
});
app.delete("/api/projects/:id", requireAuth, async (req, res) => {
  await dbReady;
  if (!ensureConfigured(res)) return;
  await pool.query("DELETE FROM nuke_projects WHERE id=$1 AND kind='html'", [req.params.id]);
  res.status(204).end();
});

app.get(/^\/([^/]+)\/(.+)$/, async (req, res, next) => {
  if (!pool) return res.status(503).send("DATABASE_URL is not configured yet.");
  await dbReady;
  const slug = req.params[0];
  const filePath = normalizeRequestedProjectPath(req.params[1]);
  if (!filePath) return res.status(404).send("File not found.");
  let rows;
  try {
    ({ rows } = await pool.query(
      `SELECT content, public_env, kind,
         (SELECT file.value
          FROM jsonb_array_elements(COALESCE(project_files, '[]'::jsonb)) AS file(value)
          WHERE file.value->>'path'=$2
          LIMIT 1) AS project_file
       FROM nuke_projects WHERE slug=$1`,
      [slug, filePath],
    ));
  } catch (error) {
    console.error("Hosted file lookup failed:", error.message);
    if (error.code === "42703" && error.message.includes("project_files")) {
      return res.status(503).send("The Neon database is missing the project_files column. Apply the SQL migration provided with this update.");
    }
    return res.status(500).send("Could not load this hosted file. Check the server logs.");
  }
  const project = rows[0];
  if (!project || project.kind !== "html") return next();

  const normalizedPath = filePath.toLowerCase();
  const file = normalizedPath === "index.html"
    ? { path: "index.html", contentType: "text/html; charset=utf-8", encoding: "utf8", content: project.content || "" }
    : project.project_file;
  if (!file) return next();
  const contentType = file.contentType || contentTypeForProjectPath(file.path);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  if (contentType.startsWith("text/html") && file.encoding !== "base64") {
    return res.send(injectPublicEnv(file.content || "", project.public_env || {}));
  }
  return res.send(file.encoding === "base64" ? Buffer.from(file.content, "base64") : file.content);
});

app.get("/:slug", async (req, res, next) => {
  if (req.params.slug.includes(".")) return next();
  if (!pool) return res.status(503).send("DATABASE_URL is not configured yet.");
  await dbReady;
  const { rows } = await pool.query("SELECT slug, content, public_env FROM nuke_projects WHERE slug=$1 AND kind='html'", [req.params.slug]);
  const project = rows[0];
  if (!project) return next();
  if (!req.path.endsWith("/")) return res.redirect(308, `/${encodeURIComponent(project.slug)}/`);
  res.setHeader("Cache-Control", "no-store");
  return res.type("html").send(injectPublicEnv(project.content || "", project.public_env || {}));
});

export { app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(port, "0.0.0.0", () => console.info(`Nuke listening on ${port}`));
}