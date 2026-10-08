---
name: Dashboard query payloads
description: Why project-list queries should avoid fetching stored site source and file blobs.
---

For Nuke dashboard project lists, select only the metadata shown in summary cards; avoid `SELECT *` when project rows also store site content, project files, or environment data.

**Why:** Hosted site content can be much larger than card metadata, so wide row reads and React serialization can delay dashboard rendering.

**How to apply:** Keep content and file data in detail or edit flows; list/dashboard queries should return only the fields needed to render each card.
