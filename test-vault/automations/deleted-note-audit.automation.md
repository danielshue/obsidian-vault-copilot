---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, file-deleted, audit]
status: complete
type: reference
name: Deleted note audit
enabled: false
triggers:
  - type: file-deleted
    pattern: "Projects/**/*.md"
actions:
  - type: create-note
    path: "Reference/Automation Logs/{{date:YYYY-MM-DD}}-deletions.md"
  - type: run-command
    commandId: "obsidian-vault-copilot:open-chat"
---
# Deleted note audit automation

Tracks deleted project notes by writing a daily deletion log under [[Reference/Automation Logs]] and opening chat for follow-up review.
