---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, tag, triage]
status: complete
type: reference
name: Inbox tag triage
enabled: false
triggers:
  - type: tag-added
    tag: "#inbox"
actions:
  - type: run-skill
    skillId: classify-note-priority
  - type: run-command
    commandId: "obsidian-vault-copilot:open-chat"
---
# Inbox tag triage automation

When `#inbox` is added to a note, this workflow classifies urgency and opens the chat interface for quick follow-up actions.
