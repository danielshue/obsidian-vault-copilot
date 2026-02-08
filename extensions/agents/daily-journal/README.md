---
name: Daily Journal Agent
description: Creates and incrementally updates daily journal entries with section-focused question flows
model: gpt-4o
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
skills:
  - obsidian-tasks
---

# Daily Journal Agent

Daily Journal Agent is a section-focused journaling assistant for Obsidian that helps you create a structured daily note and then return throughout the day to update specific sections without overwriting the rest. It supports reflective question flows, optional narrative “write-up” modes, and lightweight task management directly inside your journal.

## Brief overview

This agent is designed for an “incremental journaling” workflow: you don’t need to write everything at once. It checks whether today’s daily note exists, creates it from a consistent template if needed, and then guides you through targeted prompts for whichever section you want to work on (morning intentions, gratitude, daily log, tasks, mood/energy, evening reflection, and related links).

It is careful about note safety: when updating, it edits only the selected section (or appends where appropriate) and preserves all other content.

## Features

- **Create today’s journal note automatically**
  - Uses `get_daily_note` to check if today’s note exists
  - Uses `create_note` to create a new entry from a structured template when missing

- **Section-by-section updates (no accidental overwrites)**
  - Reads the whole note with `read_note`
  - Rewrites only the chosen section between headings
  - Keeps all other sections unchanged

- **Two update styles for reflective sections**
  - **Full narrative**: turns your bullet notes into concise first-person prose
  - **Light polish**: cleans up phrasing while keeping your voice
  - **My exact words**: formats what you provide with minimal rewriting

- **Daily Log and Related Links accumulate over time**
  - **Daily Log**: appends new entries instead of replacing (ideal for multiple check-ins)
  - **Related Links**: appends additional wiki-links as your day evolves

- **Mood & Energy tracking in frontmatter**
  - Saves `mood:` and `energy:` values directly to YAML frontmatter for easy tracking over time
  - Stores these values verbatim (never rewritten)

- **Integrated task management (Obsidian Tasks)**
  - Review tasks from today’s journal
  - Add new tasks (optionally with due/scheduled/start dates, priority, recurrence, tags)
  - Mark tasks complete with today’s date
  - Uses emoji-based formatting compatible with the **Obsidian Tasks** plugin conventions

- **Continuity and pattern awareness**
  - Can reference previous entries (via search) to help you notice trends and progress

## Usage instructions

### 1) Start a journaling session

When you begin interacting with the Daily Journal Agent, it will:

1. Call `get_daily_note` to check whether today’s daily note exists.
2. If the note does not exist, it will ask to create it (default: yes) and generate it using the journal template.
3. If the note exists, it will call `read_note` and prompt you to choose a section to work on.

Typical section choices include:
- 🌅 Morning Intentions
- 🙏 Gratitude
- 📝 Daily Log Entry
- 🎯 Manage Tasks
- 💭 Evening Reflection
- 📊 Mood & Energy Check-in
- 🔗 Add Related Links

### 2) Pick a section and answer the prompts

The agent asks one question at a time (using `ask_question`) based on the section you choose. For narrative-eligible sections (Morning Intentions, Gratitude, Daily Log, Evening Reflection), it may ask once per session how you’d like the writing to be handled (full narrative / light polish / exact words).

### 3) Preview and save safely

For rewritten reflective sections, the agent should show you a preview of the updated section before saving. When you confirm, it will:

- Update only the relevant section content (or append where specified)
- Update `modified-date` in the YAML frontmatter to today’s date
- Write the updated note back using `update_note`

### 4) Continue or end

After saving a section, the agent will offer to continue with another section or end for now. If you’re done, it ends with a brief encouraging message.

### Notes on task behavior

When you choose **🎯 Manage Tasks**, the agent will use task-specific tools (`get_tasks`, `create_task`, `mark_tasks`, `list_tasks`) and follow the **obsidian-tasks** formatting rules:

- Dates are `YYYY-MM-DD` immediately after their emoji
- Priority emojis: `🔺` highest, `⏫` high, `🔼` medium, `🔽` low, `⏬` lowest
- Never rewrites task text; tasks are stored exactly as entered

Example task line format:
- [ ] Finish quarterly report ⏫ 📅 2026-02-10 🏷️ #work

## Examples

### Example: First check-in of the day (create + morning intentions)

1. You start the agent.
2. It checks for today’s daily note:
   - If missing, it creates a new note from the template.
3. It asks what section you want to work on → choose **🌅 Morning Intentions**.
4. It asks how you want reflective sections written (Full narrative / Light polish / Exact words).
5. It asks:
   - “What do you want to focus on today?”
   - “How do you want to feel by end of day?”
6. It shows a preview, then saves only the **Morning Intentions** section.

### Example: Midday update (append to daily log)

1. The agent finds today’s note already exists and reads it.
2. You choose **📝 Daily Log Entry**.
3. It asks what’s been happening and (optionally) whether there’s anything else to add.
4. It appends your new log entry under **📝 Daily Log** (without removing earlier entries).
5. It previews the appended text and saves.

### Example: Evening wrap-up (reflection + goals)

1. You choose **💭 Evening Reflection**.
2. The agent prompts:
   - What went well
   - What could be better
   - What you learned (optional)
   - Which goals you made progress on (multi-select)
3. It previews a 1–2 paragraph narrative reflection (if you chose narrative mode).
4. It saves:
   - Updated **Evening Reflection** section
   - `goals-completed:` in frontmatter (verbatim)
   - Updated `modified-date`

### Example: Quick mood/energy check-in

1. You choose **📊 Mood & Energy Check-in**.
2. The agent asks you to select mood and energy.
3. It updates only the YAML frontmatter fields `mood:` and `energy:` and leaves the rest of the note unchanged.