---
layout: extension
title: Daily Journal Agent
permalink: /extensions/agents/daily-journal-agent/
identifier: daily-journal-agent
type: agent
version: 1.1.0
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
  - update_note
  - search_vault
  - get_daily_note
  - ask_question
  - get_tasks
  - create_task
  - list_tasks
  - mark_tasks
last_updated: 2026-02-06
size: 15.2 KB
versions:
  - version: "1.1.0"
    date: "2026-02-06"
    changes:
      - Added GUID for unique extension tracking
      - Included related prompt files (Create and Update Daily Journal)
      - Extended tool list to include task management and question asking capabilities
      - All related files now installed together as a bundle
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
- 📋 **Task Management** - Integrated task tracking with obsidian-tasks format
- 🎙️ **Interactive Questions** - Uses ask_question tool for structured input gathering

## Installation

Install via the Extension Browser in Vault Copilot to get all related files automatically:
- `daily-journal-agent.agent.md` → `Reference/Agents/`
- `create-daily-journal.prompt.md` → `Reference/Prompts/`
- `update-daily-journal.prompt.md` → `Reference/Prompts/`

All three files are bundled together and installed as a complete package.

## Usage

### Creating a New Entry
Use the dedicated prompt for creating a new journal:
> Use prompt: "Create Daily Journal"

Or ask the agent directly:
> "@daily-journal-agent Create a new journal entry for today"

### Updating Throughout the Day
Use the update prompt to work on specific sections:
> Use prompt: "Update Daily Journal"

Or ask the agent:
> "@daily-journal-agent Let's update my gratitude section"

### Evening Reflection  
Complete your entry with evening reflection:
> "@daily-journal-agent Let's do my evening reflection"

### Review Past Entries
Ask the agent to find patterns:
> "@daily-journal-agent What themes have I written about this week?"

## Journal Structure

Each entry includes:
- 🌅 **Morning Intentions** - What to focus on and how you want to feel
- 🙏 **Gratitude** - Things you're grateful for today
- 📝 **Daily Log** - Events, thoughts, and experiences throughout the day
- 📋 **Tasks** - Carry forward tasks and new tasks for today
- 💭 **Evening Reflection** - What went well, what could be better, what you learned
- 📊 **Mood & Energy Check-in** - Track your mood and energy levels
- 🔗 **Related Links** - Links to related notes, projects, or people

## Tools Used

| Tool | Purpose |
|------|---------|
| `create_note` | Creates new journal entries |
| `read_note` | Reviews previous entries for patterns |
| `update_note` | Updates specific sections without overwriting others |
| `search_vault` | Finds related notes to link |
| `get_daily_note` | Accesses today's daily note |
| `ask_question` | Presents interactive questions for structured input |
| `get_tasks` | Retrieves tasks from the journal |
| `create_task` | Adds new tasks with proper formatting |
| `list_tasks` | Lists tasks by filters (priority, date, status) |
| `mark_tasks` | Marks tasks as complete |

## Related Files

This extension includes three complementary files:

1. **daily-journal-agent.agent.md** - The main agent with full journaling logic and section flows
2. **create-daily-journal.prompt.md** - Quick prompt for creating a new journal entry
3. **update-daily-journal.prompt.md** - Quick prompt for updating specific sections

All files reference each other and work together to provide a complete journaling workflow.

## Tips

- Journal at consistent times for best results
- Use "Create Daily Journal" in the morning to set intentions
- Use "Update Daily Journal" throughout the day to add to different sections
- Be honest in your reflections - this is for you
- Use the gratitude section even on difficult days
- Link to projects and people for richer context
- Tasks use obsidian-tasks emoji format for consistency

## Changelog

### v1.1.0 (2026-02-06)
- Added GUID for unique extension tracking across installations
- Bundled related prompt files with the agent
- Extended tool capabilities for task management
- Enhanced documentation about related files

### v1.0.0 (2026-02-01)
- Initial release
- Structured journal template
- Morning and evening prompts
- Pattern recognition across entries

## License

MIT
