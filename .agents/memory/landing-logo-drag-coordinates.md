---
name: Landing logo drag coordinates
description: Coordinate model for keeping the Nuke landing logo draggable without changing its initial position.
---

Initialize the logo from its rendered bounding rectangle, then store its top-left position in viewport coordinates and clamp x/y against the current viewport bounds.

**Why:** Mixing percentage-based centering transforms with drag offsets can shift the logo during initial measurement or after viewport resizing.

**How to apply:** Preserve the initial CSS placement until the first client measurement; after that, use absolute viewport coordinates for pointer, keyboard, and resize handling.
