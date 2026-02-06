---
layout: extension
title: Daily Journal Agent
permalink: /extensions/agents/daily-journal-agent/
identifier: daily-journal-agent
type: agent
version: 1.0.0
author: Dan Shue
author_url: https://danielshue.com
repository: https://github.com/danielshue/vault-copilot-extensions
license: MIT
license_url: https://github.com/danielshue/vault-copilot-extensions/blob/main/LICENSE
categories:
  - Productivity
  - Journaling
tags:
  - daily
  - journal
  - reflection
  - gratitude
  - goals
  - habits
tools:
  - create_note
  - read_note
  - search_vault
  - get_daily_note
last_updated: 2026-02-01
size: 2.4 KB
versions:
  - version: "1.0.0"
    date: "2026-02-01"
    changes:
      - Initial release
      - Structured journal entries with gratitude and goals sections
      - Pattern recognition from previous entries
      - Smart linking to related notes
description: "A thoughtful AI journaling assistant that helps you maintain a consistent daily reflection practice with structured prompts for gratitude, goals, and self-improvement."
---

## Features

- ✨ **Structured Journal Entries** - Consistent formatting with sections for intentions, gratitude, daily log, goals, and reflection
- 🎯 **Goal Tracking** - Track daily progress on your personal goals
- 🔄 **Pattern Recognition** - References previous entries to identify trends
- 💬 **Guided Prompts** - Thoughtful questions to deepen your reflection
- 🔗 **Smart Linking** - Automatically suggests links to related notes

## Installation

Install via the Extension Browser in Vault Copilot, or manually copy `daily-journal-agent.agent.md` to your `Reference/Agents/` folder.

## Usage

### Starting Your Day
Simply ask the agent to start your daily journal:
> "@daily-journal-agent Start my journal for today"

### Evening Reflection  
Complete your entry with evening reflection:
> "@daily-journal-agent Let's do my evening reflection"

### Review Past Entries
Ask the agent to find patterns:
> "@daily-journal-agent What themes have I written about this week?"

## Journal Structure

Each entry includes:
- 🌅 Morning Intentions
- 🙏 Gratitude (3 items)
- 📝 Daily Log
- 🎯 Goals Progress
- 💭 Evening Reflection
- 🔗 Related Links

## Tools Used

| Tool | Purpose |
|------|---------|
| `create_note` | Creates new journal entries |
| `read_note` | Reviews previous entries for patterns |
| `search_vault` | Finds related notes to link |
| `get_daily_note` | Accesses today's daily note |

## Tips

- Journal at consistent times for best results
- Be honest in your reflections - this is for you
- Use the gratitude section even on difficult days
- Link to projects and people for richer context

## Changelog

### v1.0.0 (2026-02-01)
- Initial release
- Structured journal template
- Morning and evening prompts
- Pattern recognition across entries

## License

MIT
