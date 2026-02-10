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

A thoughtful journaling assistant that helps you maintain a consistent daily reflection practice in Obsidian by creating a structured daily note and updating it throughout the day, one section at a time. It’s designed to preserve what you’ve already written, while guiding you with focused prompts and optional narrative-style rewriting.

## Brief overview

Daily Journal Agent supports two modes:

- **Create**: If today’s daily note doesn’t exist, it offers to create it from a consistent template.
- **Update**: If today’s note exists, it helps you update a specific section (intentions, gratitude, log, tasks, mood/energy, reflection, related links) without overwriting the rest.

It can also manage tasks inside your daily journal using **Obsidian Tasks** emoji-based metadata (priority, due dates, recurrence, etc.).

## Features

- **Creates a structured daily journal note** using a consistent template (frontmatter + standard sections)
- **Incremental, section-by-section updates** so you can journal in short bursts throughout the day
- **Section-focused question flows** that prompt you with the right questions at the right time
- **Preserves existing content by default**
  - Replaces only the target section when updating
  - Appends to sections that should accumulate (Daily Log, Related Links)
- **Writing style control for reflective sections**
  - Full narrative (flowing prose)
  - Light polish (clean up phrasing while keeping your voice)
  - Exact words (format only)
- **Structured data stays verbatim**
  - Mood, energy, goals, tags, and tasks are stored exactly as selected/entered
- **Task management inside the journal**
  - Add tasks, mark complete, review, reschedule, and remove tasks
  - Uses Obsidian Tasks emoji conventions (📅 ⏳ 🛫 ✅ 🔁 + priority emojis)
- **Continuity and pattern tracking**
  - Can reference previous entries when relevant to highlight trends and progress
- **Preview-first for rewritten sections**
  - Shows a preview of narrative rewrites before saving so you can request changes

## Usage instructions

### 1) Start a session (create vs. update)

At the start of a session, the agent checks whether today’s daily note exists:

1. **Check today’s daily note** using `get_daily_note`
2. Based on the result:
   - **If it doesn’t exist**: the agent will offer to **create** it (default: yes)
   - **If it exists**: the agent will **read** it and ask which section you want to work on

When updating, you’ll be prompted to choose a section such as:

- 🌅 Morning Intentions  
- 🙏 Gratitude  
- 📝 Daily Log Entry  
- 🎯 Manage Tasks  
- 💭 Evening Reflection  
- 📊 Mood & Energy Check-in  
- 🔗 Add Related Links  

If a section is already filled in, the agent should call that out and offer to revise it or pick a different section.

### 2) Create mode: generate today’s journal from the template

If the note doesn’t exist, the agent creates it using the built-in template (frontmatter + all standard sections). After creation, you’ll be prompted to pick the first section to fill in.

### 3) Update mode: work on one section at a time (without overwriting the rest)

For any section update, the agent follows this safe update workflow:

1. Read the full note with `read_note`
2. Modify **only** the selected section’s content (between its heading and the next heading)
3. For accumulating sections:
   - **Daily Log**: append new entries (don’t replace)
   - **Related Links**: append new links (don’t replace)
4. Update `modified-date` in the YAML frontmatter
5. Write the updated full note back with `update_note`
6. If narrative rewriting is involved, show a **preview** before saving

### 4) Writing style (reflective sections)

The first time you work on a narrative-eligible section in a session (Morning Intentions, Gratitude, Daily Log, Evening Reflection), the agent asks how you want it written:

- **Full narrative**: turns your notes into concise first-person prose
- **Light polish**: cleans up wording but keeps your voice
- **My exact words**: formats what you provide without rewriting

This preference applies only to reflective sections; structured fields (mood, energy, goals, tags, tasks) are always stored as-is.

### 5) Managing tasks in your daily journal

Choose **🎯 Manage Tasks** to work with tasks embedded in your journal note. The agent can:

- **➕ Add new tasks** (optionally add due/scheduled/start dates, priority, recurrence, tags)
- **✅ Mark tasks complete** (adds completion emoji/date formatting)
- **📋 Review all tasks** (filter by overdue, priority, incomplete, etc.)
- **📅 Reschedule tasks** (update due dates in-place following Tasks emoji format)
- **🗑️ Remove tasks** (delete selected task lines from the note)

Task formatting rules:

- Dates use `YYYY-MM-DD`
- Emojis include: `📅` due, `⏳` scheduled, `🛫` start, `➕` created, `✅` done
- Priority emojis: `🔺` highest, `⏫` high, `🔼` medium, `🔽` low, `⏬` lowest
- Recurrence: `🔁 every day`, `🔁 every week on Monday`, etc.
- **Never rewrite the task text** you entered

### 6) Continue or end

After saving a section, the agent asks if you want to work on another section. If you’re done, it ends with a brief encouraging message.

## Examples

### Example: First session in the morning (create + intentions)

1. You start a session.
2. The agent checks today’s daily note:
   - If missing, it offers to create it (default: yes).
3. You choose **🌅 Morning Intentions**.
4. The agent asks your writing style preference (first narrative section of the session).
5. The agent asks:
   - What you want to focus on today
   - How you want to feel by end of day
6. The agent shows a preview (if rewriting is enabled) and saves only the Morning Intentions section.

### Example: Midday update (append to Daily Log)

1. The agent finds today’s note already exists and reads it.
2. You choose **📝 Daily Log Entry**.
3. You describe what’s happened so far; optionally add a follow-up entry.
4. The agent appends the new content to the Daily Log section (keeping earlier log entries intact), previews if rewriting, and saves.

### Example: Evening wrap-up (reflection + goals + mood/energy)

1. You choose **💭 Evening Reflection**.
2. The agent prompts:
   - What went well
   - What could be better
   - What you learned (optional)
   - Which goals you made progress on (stored as structured frontmatter data)
3. The agent writes a concise reflective section (depending on your selected writing style), updates frontmatter goals verbatim, previews, and saves.