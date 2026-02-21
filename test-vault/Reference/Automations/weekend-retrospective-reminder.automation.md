---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, schedule, retrospective]
status: complete
type: reference
name: Weekend retrospective reminder
description: Fires every Saturday evening to create a weekly retrospective note that reviews learnings, wins, and areas for improvement using the learning companion agent, encouraging regular reflection.
enabled: false
triggers:
  - type: schedule
    schedule: "0 18 * * 6"
actions:
  - type: run-agent
    agentId: learning-companion
    input:
      task: "Create a retrospective note at Daily Notes/{{date:YYYY-MM-DD}}-retrospective.md reviewing this week's learnings"
---
# Weekend retrospective reminder automation

Every Saturday evening, this creates a retrospective prompt note in [[Daily Notes]] and runs the learning companion agent.
