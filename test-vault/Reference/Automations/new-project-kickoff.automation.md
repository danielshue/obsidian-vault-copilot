---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, file-created, project]
status: complete
type: reference
name: New project kickoff
description: Detects when a new note is created in the Projects folder, waits briefly for initial content, then runs the project planner agent to scaffold a kickoff checklist with goals, stakeholders, and first milestones.
enabled: true
triggers:
  - type: file-created
    pattern: "Projects/*.md"
    delay: 1500
actions:
  - type: run-agent
    agentId: project-planner
    input:
      task: "Create a kickoff checklist at Projects/Kickoff/{{date:YYYY-MM-DD}}-kickoff-checklist.md for the new project"
---
# New project kickoff automation

When a new project note is created in [[Projects]], this automation waits briefly, runs the project planner agent, and scaffolds a kickoff checklist note.
