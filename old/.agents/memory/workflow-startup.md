---
name: Workflow startup command
description: The root app may need a direct Node workflow command when the package manager bootstrap stalls before opening the web port.
---

Use the direct server command for the root workflow when the package manager wrapper repeatedly tries to self-install before launching.

**Why:** The app server itself can start normally, while the package manager wrapper can block workflow startup before the configured port opens.

**How to apply:** Diagnose the workflow output first; if the failure is package-manager bootstrapping rather than application code, configure the existing root workflow to invoke the server entrypoint directly.