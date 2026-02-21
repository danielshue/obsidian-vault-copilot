---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, vault-opened, standup]
status: complete
type: reference
name: Vault open standup
enabled: true
triggers:
  - type: vault-opened
actions:
  - type: run-agent
    agentId: daily-journal
  - type: create-note
    path: "Daily Notes/{{date:YYYY-MM-DD}}-standup.md"
---
# Vault open standup automation

Runs on vault open to generate a quick standup check-in note and seed it with context from the daily journal agent.
