# Nuke

Private hosting for HTML files and folders. Think GitHub + Vercel in one small app:
upload a file, folder, zip, or GitHub repo and get a live URL at `yourdomain.com/name`.

Built with Next.js 15 (App Router) + Postgres (Neon). Pure black, fully responsive.

## Features
- Deploy a single HTML file, folder, .zip, pasted HTML, or a GitHub repo
- Every deploy is a numbered **deployment with logs**; failed deploys never touch the live site
- **Rollback** by promoting any older deployment, or redeploy in one click
- **Environment variables** (Vercel style), injected as `window.NUKE_ENV`, auto-redeploy on save
- Per-project **private secrets** encrypted at rest, with restricted server-side API proxies
- Built-in **file editor**: edit, add, delete files, then "Commit & deploy"
- **Deploy hook** URL (use as a GitHub push webhook)
- Clean URLs (`/site/about` -> `about.html`), custom `404.html`, ETag caching
- Your old Nuke projects are migrated automatically on first start

## 1. Environment variables
Copy `.env.example` to `.env.local` and fill in:

| Name | What |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `NUKE_PASSWORD` | Password for the login screen |
| `SESSION_SECRET` | Random string, 16+ chars (`openssl rand -hex 32`) |
| `NUKE_SECRETS_ENCRYPTION_KEY` | Stable random key for private project secrets (`openssl rand -hex 32`) |
| `GITHUB_TOKEN` | Optional, only for importing private GitHub repos |

Tables are created automatically on first request. Keep `NUKE_SECRETS_ENCRYPTION_KEY` backed up and unchanged: saved private secrets cannot be decrypted after the key is changed.

## 2. Run locally
```bash
npm install
npm run dev        # http://localhost:3000
```

## 3. Deploy to Vercel
1. Push this folder to a GitHub repo.
2. In Vercel: **Add New > Project**, import the repo (framework is auto-detected as Next.js).
3. Add the required environment variables above, then **Deploy**.
4. Optional: add your custom domain under Project > Settings > Domains.

Your sites then live at `https://your-domain/<name>/`.

## Limits
1000 files, 32 MB per project, 4 MB per uploaded file (Vercel request limit). Larger files can come in through GitHub import. The last 15 deployments per project are kept.

## Security notes
- `.env*`, `.npmrc`, key files, `.git` and `node_modules` are never published.
- Environment variables are visible to site visitors. Do not put secrets in them.
- Private API secrets are encrypted at rest and only attached to requests sent to a configured HTTPS upstream host, path prefix, and method. Proxy endpoints are public; restrict them to low-risk operations.
- Hosted sites share the same origin as the dashboard. Only host content you trust, or serve sites from a separate domain for full isolation.
- Reserved URL names: dashboard, login, api, docs, new, settings, admin.
