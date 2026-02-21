---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, reference, index]
status: complete
type: reference
---
# Automation examples index

This index summarizes the automation examples in this folder by trigger and action so they are easier to browse.

Automations use three action types — `run-agent`, `run-prompt`, and `run-skill` — which delegate all vault operations (creating notes, updating files, running commands) to the AI through its own tools.

## All examples

| Automation | Description |
|---|---|
| [[daily-planning-brief.automation\|Daily planning brief]] | Generates a daily planning note every weekday morning with prioritized tasks, calendar highlights, and action items drawn from recent vault activity and the project planner agent. |
| [[deleted-note-audit.automation\|Deleted note audit]] | Monitors the Projects folder for deleted notes and automatically logs each deletion to a daily audit file, preserving a record of what was removed and when for accountability and recovery purposes. |
| [[inbox-tag-triage.automation\|Inbox tag triage]] | Automatically classifies newly tagged inbox notes by urgency and priority using the classify-note-priority skill, then opens the chat interface so you can quickly decide on next steps. |
| [[monthly-maintenance-checklist.automation\|Monthly maintenance checklist]] | Runs on the first day of each month to generate a structured maintenance checklist covering orphaned notes, broken links, stale tags, and archival candidates, then opens chat for guided cleanup. |
| [[new-project-kickoff.automation\|New project kickoff]] | Detects when a new note is created in the Projects folder, waits briefly for initial content, then runs the project planner agent to scaffold a kickoff checklist with goals, stakeholders, and first milestones. |
| [[project-file-watcher.automation\|Project file watcher]] | Watches for any modification to notes inside the Projects folder and summarizes the change using the summarize-project-update prompt, appending an entry to the central project activity log for team visibility. |
| [[startup-context-refresh.automation\|Startup context refresh]] | Runs the gather-recent-context skill each time the plugin starts, collecting recent edits, created notes, and open tasks into a concise summary so you can pick up where you left off. |
| [[tag-review-queue.automation\|Tag review queue]] | Listens for the #review tag being added to any note and automatically updates a central Review Queue document with the new item, keeping all pending reviews visible in one place. |
| [[vault-open-standup.automation\|Vault open standup]] | Triggers each time the vault is opened and asks the daily journal agent to create a quick standup note with context from recent vault activity, yesterday's accomplishments, and today's planned focus areas. |
| [[weekend-retrospective-reminder.automation\|Weekend retrospective reminder]] | Fires every Saturday evening to create a weekly retrospective note that reviews learnings, wins, and areas for improvement using the learning companion agent, encouraging regular reflection. |
| [[weekly-review.automation\|Weekly review]] | Runs every Friday afternoon and once on first install to generate a comprehensive weekly review note covering wins, blockers, and next-week priorities using the weekly retrospective prompt. |

## Browse by trigger

### schedule (4)

- [[daily-planning-brief.automation|Daily planning brief]] — `0 8 * * 1-5` → `run-agent`
- [[monthly-maintenance-checklist.automation|Monthly maintenance checklist]] — `0 9 1 * *` → `run-prompt`
- [[weekend-retrospective-reminder.automation|Weekend retrospective reminder]] — `0 18 * * 6` → `run-agent`
- [[weekly-review.automation|Weekly review]] — `0 17 * * 5` → `run-prompt`

### startup (2)

- [[startup-context-refresh.automation|Startup context refresh]] → `run-skill`
- [[weekly-review.automation|Weekly review]] → `run-prompt`

### tag-added (2)

- [[inbox-tag-triage.automation|Inbox tag triage]] (`#inbox`) → `run-skill`
- [[tag-review-queue.automation|Tag review queue]] (`#review`) → `run-agent`

### file-created (1)

- [[new-project-kickoff.automation|New project kickoff]] (`Projects/*.md`, delay `1500`) → `run-agent`

### file-modified (1)

- [[project-file-watcher.automation|Project file watcher]] (`Projects/**/*.md`) → `run-prompt`

### file-deleted (1)

- [[deleted-note-audit.automation|Deleted note audit]] (`Projects/**/*.md`) → `run-agent`

### vault-opened (1)

- [[vault-open-standup.automation|Vault open standup]] → `run-agent`

## Browse by action

### run-agent (6)

- [[daily-planning-brief.automation|Daily planning brief]]
- [[deleted-note-audit.automation|Deleted note audit]]
- [[new-project-kickoff.automation|New project kickoff]]
- [[tag-review-queue.automation|Tag review queue]]
- [[vault-open-standup.automation|Vault open standup]]
- [[weekend-retrospective-reminder.automation|Weekend retrospective reminder]]

### run-prompt (3)

- [[monthly-maintenance-checklist.automation|Monthly maintenance checklist]]
- [[project-file-watcher.automation|Project file watcher]]
- [[weekly-review.automation|Weekly review]]

### run-skill (2)

- [[inbox-tag-triage.automation|Inbox tag triage]]
- [[startup-context-refresh.automation|Startup context refresh]]
