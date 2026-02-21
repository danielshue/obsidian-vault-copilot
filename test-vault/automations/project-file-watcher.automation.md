---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, files, projects]
status: complete
type: reference
name: Project file watcher
enabled: true
triggers:
  - type: file-modified
    pattern: "Projects/**/*.md"
actions:
  - type: run-prompt
    promptId: summarize-project-update
  - type: update-note
    path: "Projects/_activity-log.md"
---
# Project file watcher automation

Triggers whenever a note in `Projects/` changes. It summarizes the change and appends details to a central project activity log.
