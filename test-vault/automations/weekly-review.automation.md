---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, weekly, review]
status: complete
type: reference
name: Weekly review
enabled: true
run-on-install: true
triggers:
  - type: schedule
    schedule: "0 17 * * 5"
  - type: startup
actions:
  - type: run-prompt
    promptId: weekly-retrospective
  - type: create-note
    path: "Projects/Weekly Review {{date:YYYY-[W]WW}}.md"
---
# Weekly review automation

Runs every Friday at 5:00 PM (and once on install) to generate a retrospective note for wins, blockers, and next-week priorities.
