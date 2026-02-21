---
creation-date: 2026-02-21
modified-date: 2026-02-21
tags: [automation, reference, index]
status: complete
type: reference
---
# Automation examples index

This index summarizes the automation examples in this folder by trigger and action so they are easier to browse.

## All examples

- [[daily-planning-brief.automation|Daily planning brief]]
- [[deleted-note-audit.automation|Deleted note audit]]
- [[inbox-tag-triage.automation|Inbox tag triage]]
- [[monthly-maintenance-checklist.automation|Monthly maintenance checklist]]
- [[new-project-kickoff.automation|New project kickoff]]
- [[project-file-watcher.automation|Project file watcher]]
- [[startup-context-refresh.automation|Startup context refresh]]
- [[tag-review-queue.automation|Tag review queue]]
- [[vault-open-standup.automation|Vault open standup]]
- [[weekend-retrospective-reminder.automation|Weekend retrospective reminder]]
- [[weekly-review.automation|Weekly review]]

## Browse by trigger

### schedule (4)

- [[daily-planning-brief.automation|Daily planning brief]] — `0 8 * * 1-5` → `run-agent`, `create-note`
- [[monthly-maintenance-checklist.automation|Monthly maintenance checklist]] — `0 9 1 * *` → `run-prompt`, `create-note`, `run-command`
- [[weekend-retrospective-reminder.automation|Weekend retrospective reminder]] — `0 18 * * 6` → `run-agent`, `create-note`
- [[weekly-review.automation|Weekly review]] — `0 17 * * 5` → `run-prompt`, `create-note`

### startup (2)

- [[startup-context-refresh.automation|Startup context refresh]] → `run-skill`, `run-command`
- [[weekly-review.automation|Weekly review]] → `run-prompt`, `create-note`

### tag-added (2)

- [[inbox-tag-triage.automation|Inbox tag triage]] (`#inbox`) → `run-skill`, `run-command`
- [[tag-review-queue.automation|Tag review queue]] (`#review`) → `update-note`

### file-created (1)

- [[new-project-kickoff.automation|New project kickoff]] (`Projects/*.md`, delay `1500`) → `run-agent`, `create-note`

### file-modified (1)

- [[project-file-watcher.automation|Project file watcher]] (`Projects/**/*.md`) → `run-prompt`, `update-note`

### file-deleted (1)

- [[deleted-note-audit.automation|Deleted note audit]] (`Projects/**/*.md`) → `create-note`, `run-command`

### vault-opened (1)

- [[vault-open-standup.automation|Vault open standup]] → `run-agent`, `create-note`

## Browse by action

### create-note (7)

- [[daily-planning-brief.automation|Daily planning brief]]
- [[deleted-note-audit.automation|Deleted note audit]]
- [[monthly-maintenance-checklist.automation|Monthly maintenance checklist]]
- [[new-project-kickoff.automation|New project kickoff]]
- [[vault-open-standup.automation|Vault open standup]]
- [[weekend-retrospective-reminder.automation|Weekend retrospective reminder]]
- [[weekly-review.automation|Weekly review]]

### run-agent (4)

- [[daily-planning-brief.automation|Daily planning brief]]
- [[new-project-kickoff.automation|New project kickoff]]
- [[vault-open-standup.automation|Vault open standup]]
- [[weekend-retrospective-reminder.automation|Weekend retrospective reminder]]

### run-command (4)

- [[deleted-note-audit.automation|Deleted note audit]]
- [[inbox-tag-triage.automation|Inbox tag triage]]
- [[monthly-maintenance-checklist.automation|Monthly maintenance checklist]]
- [[startup-context-refresh.automation|Startup context refresh]]

### run-prompt (3)

- [[monthly-maintenance-checklist.automation|Monthly maintenance checklist]]
- [[project-file-watcher.automation|Project file watcher]]
- [[weekly-review.automation|Weekly review]]

### run-skill (2)

- [[inbox-tag-triage.automation|Inbox tag triage]]
- [[startup-context-refresh.automation|Startup context refresh]]

### update-note (2)

- [[project-file-watcher.automation|Project file watcher]]
- [[tag-review-queue.automation|Tag review queue]]
