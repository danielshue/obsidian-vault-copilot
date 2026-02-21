---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, weekly, review]
status: complete
type: reference
name: Weekly review
description: Runs every Friday afternoon and once on first install to generate a comprehensive weekly review note covering wins, blockers, and next-week priorities using the weekly retrospective prompt.
enabled: true
run-on-install: true
triggers:
  - type: schedule
    schedule: "0 17 * * 5"
  - type: startup
actions:
  - type: run-prompt
    promptId: weekly-retrospective
    input:
      task: "Create a weekly review note at Projects/Weekly Review {{date:YYYY-[W]WW}}.md with wins, blockers, and next-week priorities"
---
# Weekly review automation

Runs every Friday at 5:00 PM (and once on install) to generate a retrospective note for wins, blockers, and next-week priorities.
