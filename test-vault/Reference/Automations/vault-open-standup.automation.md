---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, vault-opened, standup]
status: complete
type: reference
name: Vault open standup
description: Triggers each time the vault is opened and asks the daily journal agent to create a quick standup note with context from recent vault activity, yesterday's accomplishments, and today's planned focus areas.
enabled: true
triggers:
  - type: vault-opened
actions:
  - type: run-agent
    agentId: Reference/Agents/daily-journal.agent
    input:
      task: "Create a standup note at Daily Notes/{{date:YYYY-MM-DD}}-standup.md with context from recent vault activity"
---
# Vault open standup automation

Runs on vault open to generate a quick standup check-in note and seed it with context from the daily journal agent.
