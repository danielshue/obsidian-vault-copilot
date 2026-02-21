---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, tag, review]
status: complete
type: reference
name: Tag review queue
description: Listens for the #review tag being added to any note and automatically updates a central Review Queue document with the new item, keeping all pending reviews visible in one place.
enabled: true
triggers:
  - type: tag-added
    tag: "#review"
actions:
  - type: run-agent
    agentId: Reference/Agents/daily-journal.agent
    input:
      task: "Update Reference/Review Queue.md to add a new review item captured today"
---
# Tag review queue automation

When `#review` is added anywhere, this updates [[Reference/Review Queue]] so review work stays visible.
