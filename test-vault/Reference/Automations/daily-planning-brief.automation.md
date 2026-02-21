---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, schedule, planning]
status: complete
type: reference
name: Daily planning brief
description: Generates a daily planning note every weekday morning with prioritized tasks, calendar highlights, and action items drawn from recent vault activity and the project planner agent.
enabled: true
run-on-install: false
triggers:
  - type: schedule
    schedule: "0 8 * * 1-5"
actions:
  - type: run-agent
    agentId: project-planner
    input:
      task: "Create a daily planning note at Daily Notes/{{date:YYYY-MM-DD}}-plan.md with today's priorities"
---
# Daily planning brief automation

Runs every weekday at 8:00 AM, asks the project planner agent for priorities, and creates a daily planning note.
