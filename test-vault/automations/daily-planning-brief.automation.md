---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, schedule, planning]
status: complete
type: reference
name: Daily planning brief
enabled: true
run-on-install: false
triggers:
  - type: schedule
    schedule: "0 8 * * 1-5"
actions:
  - type: run-agent
    agentId: project-planner
  - type: create-note
    path: "Daily Notes/{{date:YYYY-MM-DD}}-plan.md"
---
# Daily planning brief automation

Runs every weekday at 8:00 AM, asks the project planner agent for priorities, and creates a daily planning note.
