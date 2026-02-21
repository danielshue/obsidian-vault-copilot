---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, files, projects]
status: complete
type: reference
name: Project file watcher
description: Watches for any modification to notes inside the Projects folder and summarizes the change using the summarize-project-update prompt, appending an entry to the central project activity log for team visibility.
enabled: true
triggers:
  - type: file-modified
    pattern: "Projects/**/*.md"
actions:
  - type: run-prompt
    promptId: summarize-project-update
    input:
      task: "Summarize the change and append details to Projects/_activity-log.md"
---
# Project file watcher automation

Triggers whenever a note in `Projects/` changes. It summarizes the change and appends details to a central project activity log.
