---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, schedule, monthly]
status: complete
type: reference
name: Monthly maintenance checklist
enabled: true
triggers:
  - type: schedule
    schedule: "0 9 1 * *"
actions:
  - type: run-prompt
    promptId: monthly-vault-maintenance
  - type: create-note
    path: "Reference/Maintenance/{{date:YYYY-MM}}-checklist.md"
  - type: run-command
    commandId: "obsidian-vault-copilot:open-chat"
---
# Monthly maintenance checklist automation

Runs on the first day of each month, creates a maintenance checklist in [[Reference]], and opens chat for guided cleanup.
