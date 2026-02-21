---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, file-deleted, audit]
status: complete
type: reference
name: Deleted note audit
description: Monitors the Projects folder for deleted notes and automatically logs each deletion to a daily audit file, preserving a record of what was removed and when for accountability and recovery purposes.
enabled: false
triggers:
  - type: file-deleted
    pattern: "Projects/**/*.md"
actions:
  - type: run-agent
    agentId: Reference/Agents/daily-journal.agent
    input:
      task: "Log the deleted project note to Reference/Automation Logs/{{date:YYYY-MM-DD}}-deletions.md for audit"
---
# Deleted note audit automation

Tracks deleted project notes by writing a daily deletion log under [[Reference/Automation Logs]] and opening chat for follow-up review.
