---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, schedule, monthly]
status: complete
type: reference
name: Monthly maintenance checklist
description: Runs on the first day of each month to generate a structured maintenance checklist covering orphaned notes, broken links, stale tags, and archival candidates, then opens chat for guided cleanup.
enabled: true
triggers:
  - type: schedule
    schedule: "0 9 1 * *"
actions:
  - type: run-prompt
    promptId: monthly-vault-maintenance
    input:
      task: "Create a maintenance checklist at Reference/Maintenance/{{date:YYYY-MM}}-checklist.md and open the chat view when done"
---
# Monthly maintenance checklist automation

Runs on the first day of each month, creates a maintenance checklist in [[Reference]], and opens chat for guided cleanup.
