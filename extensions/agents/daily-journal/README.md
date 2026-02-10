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

Daily Journal Agent is a thoughtful journaling assistant for Obsidian that helps you maintain a consistent daily reflection practice. It can create a new daily journal note when one doesn’t exist yet, or incrementally update an existing daily note section-by-section throughout the day—without overwriting other sections.

## Brief overview

This agent is designed for lightweight, repeatable journaling: you can check in multiple times per day (morning, midday, evening), and the agent will guide you through focused prompts for the section you want to work on. It preserves your existing content, supports optional narrative “write-up” styles for reflective sections, and integrates task capture/management using Obsidian Tasks formatting.

## Features

- Create a structured daily journal note from a consistent template
- Detect whether today’s daily note already exists and choose the right mode:
  - Create mode: generate today’s entry if it doesn’t exist
  - Update mode: read today’s entry and update only the section you select
- Section-by-section guided reflection flows:
  - 🌅 Morning Intentions
  - 🙏 Gratitude
  - 📝 Daily Log (appends throughout the day)
  - 🎯 Manage Tasks (uses task tools + Obsidian Tasks emoji syntax)
  - 💭 Evening Reflection
  - 📊 Mood & Energy Check-in (stored in YAML frontmatter)
  - 🔗 Related Links (appends throughout the day)
- “Narrative rewriting” options for reflective sections (asked once per session):
  - Full narrative (flowing prose)
  - Light polish (clean up phrasing while keeping your voice)
  - Exact words (format only)
- Structured data safety rules:
  - Never rewrite tasks, tags, mood, energy, or goals (stored verbatim)
  - Update only the targeted section between headings
  - Preserve all other sections and content
- Always updates `modified-date` when saving changes
- Shows a preview of rewritten content before saving (for narrative sections)

## Usage instructions

### 1) Start a journaling session

When you start a session, the agent first checks whether today’s daily note exists:

1. The agent calls `get_daily_note` for today.
2. If the note does not exist, it offers to create it (default: yes).
3. If the note exists, it reads the note (`read_note`) and asks which section you want to work on.

You’ll choose from:

- 🌅 Morning Intentions  
- 🙏 Gratitude  
- 📝 Daily Log Entry  
- 🎯 Manage Tasks  
- 💭 Evening Reflection  
- 📊 Mood & Energy Check-in  
- 🔗 Add Related Links  

If a section is already filled in, the agent should tell you and ask whether you want to revise it or pick a different section.

### 2) Fill in a section (incremental updates)

Once you pick a section, the agent asks a short sequence of questions tailored to that section, then updates only that section in the daily note using `update_note`.

Key update behavior:

- The agent reads the full note first (`read_note`).
- It replaces only the content under the selected `##` heading up to the next `##` heading.
- For sections that accumulate over time, it appends instead of replacing:
  - 📝 Daily Log
  - 🔗 Related
- It updates `modified-date` in the YAML frontmatter to today’s date.
- It writes back the entire note with the one section changed (`update_note`).
- For narrative-eligible sections, it previews the rewritten section before saving so you can request changes.

### 3) Choose your writing style (reflective sections)

The first time you work on a narrative-eligible section in a session, the agent asks how you want your reflections written up:

- Full narrative — turn notes into flowing prose
- Light polish — clean up phrasing but keep your voice
- My exact words — just format what you give

This only affects reflective sections like Morning Intentions, Gratitude, Daily Log, and Evening Reflection. Structured data (mood, energy, goals, tags, tasks) is always stored verbatim.

### 4) Manage tasks inside your journal

When you select **🎯 Manage Tasks**, the agent uses task tools and the **obsidian-tasks** skill conventions to help you:

- Add new tasks (optionally with due dates, priority, recurrence, tags, etc.)
- Mark tasks complete (with today’s completion date)
- Review tasks using filters (overdue, priority, all incomplete)
- Reschedule tasks (update 📅 due dates using emoji date format)
- Remove tasks (delete selected task lines from the note)

Task formatting rules:

- Always use emoji-based metadata:
  - 📅 due, ⏳ scheduled, 🛫 start, ➕ created, ✅ done
- Priority emojis:
  - 🔺 highest, ⏫ high, 🔼 medium, 🔽 low, ⏬ lowest
- Dates use `YYYY-MM-DD`
- Emojis go after the task description, before any tags
- Never rewrite the task text itself

Example task line:

- [ ] Finish quarterly report ⏫ 📅 2026-02-10 🏷️ #work

### 5) Wrap up (or keep going)

After saving a section, the agent asks whether you want to work on another section and removes the just-completed section from the list. If you choose “I’m done for now,” it ends the session with a brief encouraging message.

## Examples

### Example: First session of the day (morning)

1. Agent checks today’s daily note with `get_daily_note`.
2. If it doesn’t exist, the agent creates it using the journal template via `create_note`.
3. You select **🌅 Morning Intentions**.
4. The agent asks for:
   - Writing style preference (first narrative section this session)
   - What you want to focus on today
   - How you want to feel by end of day
5. The agent previews the drafted Morning Intentions section (if narrative/polish is selected).
6. The agent saves only that section using `update_note`.
7. You select **📊 Mood & Energy Check-in** and choose:
   - Mood (saved to frontmatter)
   - Energy (saved to frontmatter)
8. You choose “I’m done for now.”

### Example: Midday update (append to Daily Log)

1. Agent confirms today’s note exists with `get_daily_note`.
2. Agent reads it with `read_note` and you select **📝 Daily Log Entry**.
3. You paste a few bullets about what happened today.
4. The agent formats/rewrites per your selected style and appends below the existing Daily Log content.
5. The agent previews the added entry, then saves via `update_note`.

### Example: Evening wrap-up (reflection + goals)

1. You select **💭 Evening Reflection**.
2. The agent asks:
   - What went well
   - What could have been better
   - What you learned (optional)
   - Which goals you made progress on (saved verbatim to frontmatter)
3. The agent drafts a concise narrative reflection (if narrative mode is selected), previews it, then saves the section and updates frontmatter goals.