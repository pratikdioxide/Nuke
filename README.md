# Nuke

Private hosting for HTML files and folders, with server-side `api/` functions and encrypted environment variables.
Think GitHub + Vercel in one small app: upload a file, folder, zip or GitHub repo and get a live URL at `yourdomain.com/name`.

Built with Next.js 15 (App Router) + Postgres (Neon). Pure black, fully responsive.

## What you get
- Deploy a single HTML file, folder, .zip, pasted HTML, or a GitHub repo
- Every deploy is a numbered **deployment with logs**. Failed deploys never touch the live site. Roll back by promoting any older deployment
- **Environment variables**, set when creating a project or later, each with an optional note
  - **Server only** (default): encrypted in the database, never sent to browsers, readable only by your `api/` functions as `process.env.NAME`
  - **Public**: injected into pages as `window.NUKE_ENV.NAME`
- **Functions**: files in `api/` run on the server (like Vercel). `fetch("/api/x")` from your page just works
- **Function logs** tab: every call, status, duration and `console.log` output
- File editor, deploy hook URL (GitHub push webhook), clean URLs, custom `404.html`
- Existing projects, env vars and secrets from earlier versions are migrated automatically

## 1. Environment variables (for Nuke itself)
Copy `.env.example` to `.env.local` and fill in:

| Name | What |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `NUKE_PASSWORD` | Password for the login screen |
| `SESSION_SECRET` | Random string, 16+ chars (`openssl rand -hex 32`) |
| `NUKE_SECRETS_ENCRYPTION_KEY` | Random string, 32+ chars. Encrypts project variables. **Set once, never change** |
| `GITHUB_TOKEN` | Optional, for private GitHub repos |

Tables are created automatically on first request.

## 2. Run locally
```bash
npm install
npm run dev        # http://localhost:3000
```

## 3. Deploy to Vercel
1. Push this folder to a GitHub repo.
2. In Vercel: **Add New > Project**, import the repo (Next.js is auto-detected).
3. Add the environment variables above, then **Deploy**.
4. Optional: add your custom domain under Project > Settings > Domains.

## How secrets stay secret
A static page runs in the visitor's browser, so a browser can only use a value that was sent to it. Real secrets therefore never go to the page. They live encrypted in Nuke's database; when your page calls `/your-site/api/something`, Nuke runs your function in an isolated process that receives **only that project's variables** (never Nuke's own `DATABASE_URL`, `NUKE_PASSWORD`, etc.), and the function talks to your database or API on the server.

Vercel's own environment variables are only for Nuke itself: your hosted files live in Nuke's database, not in a Vercel deployment, so Nuke has to run the functions itself.

## Functions (api/)
```
my-project/
├── index.html           -> /my-project/
└── api/tracker.js       -> /my-project/api/tracker
```
```js
export default async function handler(req, res) {
  const db = process.env.DATABASE_URL;           // Server only variable
  res.status(200).json({ ok: true });
}
```
- `.js`, `.mjs`, `.cjs`, `.ts`; `import` and `require` both work; relative imports of your own files work
- Importable packages: `@neondatabase/serverless`, `pg`, `ws`. Nuke does not run `npm install`; bundle anything else into your file
- Limits: 25 s per call, 4 MB request, 6 MB response, 120 calls/min per visitor
- Everything under `api/` is private: it runs, it is never downloadable

## Limits
1000 files, 32 MB per project, 4 MB per file uploaded from the browser (Vercel request limit). The last 15 deployments per project are kept.

## Security notes
- `.env*`, `.npmrc`, key files, `.git` and `node_modules` are never published.
- Functions run in a separate Node process with a clean environment, but on the same server. Run code you trust.
- Hosted sites share the same origin as the dashboard. Only host content you trust, or serve sites from a separate domain for full isolation.
- Reserved URL names: dashboard, login, api, docs, new, settings, admin.
