---
name: Landing canvas viewport sizing
description: Keep the Nuke landing project's bubble canvas and initial logo position tied to the viewport.
---

Set the landing canvas CSS and drawing buffer from viewport dimensions rather than relying on percentage sizing and `clientHeight`; calculate the initial logo's top and right placement from the viewport as well.

**Why:** In the current development preview, the fixed canvas reported a zero `clientHeight` despite a nonzero viewport, placing bubbles outside the visible area. The logo's first measurement also inherited an off-screen top position.

**How to apply:** Preserve explicit viewport-based sizing and initial placement when changing the landing canvas or drag-logo initialization.
