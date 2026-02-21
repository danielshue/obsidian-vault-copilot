---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, file-created, project]
status: complete
type: reference
name: New project kickoff
enabled: true
triggers:
  - type: file-created
    pattern: "Projects/*.md"
    delay: 1500
actions:
  - type: run-agent
    agentId: project-planner
  - type: create-note
    path: "Projects/Kickoff/{{date:YYYY-MM-DD}}-kickoff-checklist.md"
---
# New project kickoff automation

When a new project note is created in [[Projects]], this automation waits briefly, runs the project planner agent, and scaffolds a kickoff checklist note.
