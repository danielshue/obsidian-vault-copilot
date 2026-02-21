---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, tag, triage]
status: complete
type: reference
name: Inbox tag triage
description: Automatically classifies newly tagged inbox notes by urgency and priority using the classify-note-priority skill, then opens the chat interface so you can quickly decide on next steps.
enabled: false
triggers:
  - type: tag-added
    tag: "#inbox"
actions:
  - type: run-skill
    skillId: classify-note-priority
    input:
      task: "Classify the note's priority and present results"
---
# Inbox tag triage automation

When `#inbox` is added to a note, this workflow classifies urgency and opens the chat interface for quick follow-up actions.
