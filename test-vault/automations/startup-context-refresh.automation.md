---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, startup, context]
status: complete
type: reference
name: Startup context refresh
enabled: true
triggers:
  - type: startup
actions:
  - type: run-skill
    skillId: gather-recent-context
  - type: run-command
    commandId: "obsidian-vault-copilot:open-chat"
---
# Startup context refresh automation

On plugin startup, this runs a context-gathering skill and opens chat so you can begin from a fresh summary of recent vault activity.
