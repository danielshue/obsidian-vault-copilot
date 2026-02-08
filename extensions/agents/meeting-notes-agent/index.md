---
layout: extension
title: "Meeting Notes Agent"
type: agent
version: "1.0.0"
description: "Captures, organizes, and summarizes meeting notes with action items, attendees, and follow-up tracking."
author: "Dan Shue"
author_url: "https://danielshue.com"
icon: "extensions/agents/meeting-notes-agent/icon.svg"
categories: ["Productivity", "Task Management"]
tags: ["meetings", "notes", "action-items", "agenda", "summary", "collaboration"]
size: "62.5 KB"
versions:
  - version: "1.0.0"
    date: "2026-02-01"
    changes:
      - "Initial release"
      - "Meeting capture with attendees and agenda"
      - "Automatic action item extraction"
      - "Follow-up tracking integration"
---


## Features

- 📝 **Structured Notes** - Consistent meeting note format with agenda, attendees, and discussions
- ✅ **Action Items** - Automatic extraction of tasks with owners and due dates
- 👥 **Attendee Linking** - Links meeting notes to people in your vault
- 📊 **Summaries** - Generate concise summaries for quick reference
- 🔔 **Follow-up Tracking** - Never miss a pending action item

## Installation

Install via the Extension Browser in Vault Copilot, or manually copy `meeting-notes-agent.agent.md` to your `Reference/Agents/` folder.

## Usage

### During a Meeting
Start capturing notes in real-time:
> "@meeting-notes-agent New meeting: Weekly Team Sync"

### After a Meeting
Create notes from memory or a transcript:
> "@meeting-notes-agent Create notes for the client call I just had with John from Acme Corp"

### Extract Action Items
Pull out tasks from existing notes:
> "@meeting-notes-agent Extract action items from today's meeting"

### Follow-up Review
Check pending items:
> "@meeting-notes-agent Show me pending action items from this week"

## Meeting Structure

Each meeting note includes:
- 📋 Basic info (date, time, location)
- 👥 Attendees (linked to people notes)
- 📑 Agenda items
- 📝 Discussion notes by topic
- ✅ Action items with owners
- 🎯 Decisions made
- ➡️ Next steps

## Tools Used

| Tool | Purpose |
|------|---------|
| `create_note` | Creates new meeting notes |
| `read_note` | Reviews previous meetings |
| `search_vault` | Finds related notes and people |
| `update_note` | Updates action item status |

## Best Practices

- Create notes immediately after meetings while details are fresh
- Always assign owners to action items
- Link to project notes for context
- Review pending actions weekly

## Changelog

### v1.0.0 (2026-02-01)
- Initial release
- Structured meeting template
- Action item extraction
- Attendee linking

## License

MIT
