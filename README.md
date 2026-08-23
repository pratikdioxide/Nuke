# Nuke

Nuke is a private personal shelf for hosting standalone HTML files and saving external websites under custom URLs.

## Variables to set

Set these in your environment before starting the app:

```text
DATABASE_URL=your Neon Postgres connection string
NUKE_PASSWORD=the password you want to use
SESSION_SECRET=a long random string for login sessions
```

The app creates its single `nuke_projects` table automatically on startup. It stores hosted HTML, project names, slugs, and external URLs in Neon only.

## Run

```bash
pnpm install
pnpm run dev
```

The dashboard is at `/`. Hosted projects are available at `/<slug>`.