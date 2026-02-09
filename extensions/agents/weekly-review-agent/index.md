---
layout: extension
identifier: "weekly-review-agent"
title: "Weekly Review Agent"
type: agent
version: "1.0.0"
description: "Guides you through a comprehensive weekly review process to reflect on accomplishments, plan ahead, and maintain productivity."
author: "Dan Shue"
author_url: "https://danielshue.com"
icon: "extensions/agents/weekly-review-agent/icon.svg"
categories: ["Productivity", "Task Management"]
tags: ["weekly-review", "gtd", "planning", "reflection", "goals", "productivity"]
size: "63.1 KB"
versions:
  - version: "1.0.0"
    date: "2026-02-01"
    changes:
      - "Initial release"
      - "GTD-inspired weekly review workflow"
      - "Accomplishments and goals tracking"
      - "Week-over-week comparison"
---


## Features

- 🏆 **Celebrate Wins** - Start by acknowledging accomplishments
- 🔍 **Systematic Review** - Checklist-driven process for completeness
- 📊 **Goal Tracking** - Monitor progress on weekly and monthly goals
- 🧹 **Clear the Backlog** - Process inbox and capture open loops
- 🎯 **Priority Setting** - Define top 3 focus areas for the week ahead
- 🌱 **Habit Tracking** - Review consistency on key habits

## Installation

Install via the Extension Browser in Vault Copilot, or manually copy `weekly-review-agent.agent.md` to your `Reference/Agents/` folder.

## Usage

### Start Your Weekly Review
Begin the guided review process:
> "@weekly-review-agent Let's do my weekly review"

### Quick Review
Shorter version when time is limited:
> "@weekly-review-agent Quick review - just the essentials"

### Look Back on Progress
Review trends over time:
> "@weekly-review-agent Compare this week to last month"

## The Review Process

### Phase 1: Get Clear (15-20 min)
- Process inboxes (email, physical, notes)
- Capture all open loops
- Empty your head

### Phase 2: Get Current (10-15 min)
- Review past calendar
- Review upcoming calendar
- Check project status
- Update waiting-for list

### Phase 3: Get Creative (10-15 min)
- Review someday/maybe
- Capture new ideas
- Consider long-term goals

### Phase 4: Get Committed (5-10 min)
- Set top 3 priorities
- Make specific commitments
- Time-block important work

## Weekly Review Template

Each review includes:
- 🏆 Accomplishments
- 📊 Metrics & Progress
- 🔍 Review Checklist
- 💭 Reflections
- 🎯 Next Week's Priorities
- 📋 Commitments
- 🌱 Habit Tracking

## Tools Used

| Tool | Purpose |
|------|---------|
| `create_note` | Creates weekly review notes |
| `read_note` | Reviews previous weeks and projects |
| `search_vault` | Finds incomplete tasks and open loops |
| `list_folder` | Scans inbox and project folders |

## Best Practices

- Schedule a recurring time (Sunday evening or Friday afternoon)
- Block 45-60 minutes without interruptions
- Do it even when you're busy - especially then
- Be honest in reflections
- Limit next week's priorities to 3

## Changelog

### v1.0.0 (2026-02-01)
- Initial release
- GTD-inspired review process
- Structured templates
- Progress tracking

## License

MIT
