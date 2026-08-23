# Nuke

Nuke is a private personal shelf for hosting standalone HTML projects and saving external websites under memorable slugs.

## Run & Operate

- `pnpm run dev` — run the root Nuke app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Neon Postgres connection string
- Required env: `NUKE_PASSWORD` — the private dashboard password
- Required env: `SESSION_SECRET` — secret used to sign the login cookie

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `server.mjs` — Express server, Neon schema initialization, auth, CRUD API, and public slug routes
- `public/` — Nuke dashboard and dark/pink UI

## Architecture decisions

- Root-only app by request; no additional artifact or mockup app is required.
- Neon stores both HTML content and external project metadata in one table.
- Hosted HTML slugs are public; the dashboard and admin API require the signed password session.

## Product

- Password-protected personal dashboard
- Upload or paste standalone HTML files
- Save external links under custom slugs
- Edit names, slugs, HTML, and external URLs
- Delete projects and open every project at its own live path

## User preferences

- Do not add Neon/Replit integrations automatically; the user will provide variables.
- Keep the app in the project root, not in an artifact or mockup folder.

## Gotchas

- Set all three environment variables before the first login.
- `DATABASE_URL` must point to the Neon database that the app is allowed to initialize.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
