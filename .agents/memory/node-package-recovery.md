---
name: Node package recovery
description: The Replit Node package installer can change existing dependency declarations while restoring missing packages.
---

When restoring missing `node_modules` packages in this app, installing the already-declared package names widened dependency ranges and rewrote package-lock metadata.

**Why:** The application only needed its existing dependencies installed so the Next.js workflow could start; unrelated dependency declaration changes were not part of the requested work.

**How to apply:** Check `package.json` and `package-lock.json` after package recovery. Restore unrelated version-range and lockfile changes when no dependency upgrade was requested.
