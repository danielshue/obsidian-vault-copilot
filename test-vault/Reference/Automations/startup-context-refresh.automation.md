---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, startup, context]
status: complete
type: reference
name: Startup context refresh
description: Runs the gather-recent-context skill each time the plugin starts, collecting recent edits, created notes, and open tasks into a concise summary so you can pick up where you left off.
enabled: true
triggers:
  - type: startup
actions:
  - type: run-skill
    skillId: gather-recent-context
    input:
      task: "Gather recent vault activity and present a summary"
---
# Startup context refresh automation

On plugin startup, this runs a context-gathering skill and opens chat so you can begin from a fresh summary of recent vault activity.
