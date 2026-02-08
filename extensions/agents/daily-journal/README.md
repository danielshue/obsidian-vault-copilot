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

Daily Journal Agent is a section-focused journaling assistant for Obsidian that helps you create a structured daily note and return throughout the day to update specific sections (without overwriting anything else). It guides reflection with targeted prompts and can manage tasks directly inside your daily journal using Obsidian Tasks-style formatting.

## Brief overview

This agent supports two primary modes:

- **Create mode**: If today’s daily note doesn’t exist, it offers to create a new entry using a consistent template.
- **Update mode**: If today’s note already exists, it reads the note and helps you update one section at a time (Morning Intentions, Gratitude, Daily Log, Tasks, Mood/Energy, Evening Reflection, Related links).

A key design principle is **surgical updates**: it replaces or appends content only inside the chosen section while preserving the rest of the note exactly as-is.

## Features

- **Daily note creation with a consistent template**
  - Generates a structured daily journal note with standard sections and metadata.
  - Includes frontmatter fields for tracking (e.g., `mood`, `energy`, `status`, tags).

- **Incremental section-by-section updates**
  - You can revisit the agent multiple times per day and update only what you need.
  - Replaces content only between the selected `##` heading and the next `##` heading.

- **Section-specific reflection prompts**
  - Each section has a tailored question flow (intentions, gratitude, reflections, etc.).
  - Uses guided questions to help you write when you’re low on energy or time.

- **Narrative rewriting (optional) for reflective sections**
  - Choose a writing style once per session:
    - Full narrative (flowing prose)
    - Light polish (clean-up while keeping your voice)
    - Exact words (just format what you provide)
  - Applies only to reflective sections (e.g., Morning Intentions, Gratitude, Daily Log, Evening Reflection).

- **Append-only sections where it matters**
  - **Daily Log**: appends new entries rather than replacing, so you can log multiple updates across the day.
  - **Related links**: appends wiki-links and references as you go.

- **Mood & energy check-ins stored in frontmatter**
  - Captures mood and energy using quick pick options.
  - Updates only the YAML frontmatter fields (`mood:` and `energy:`) and preserves everything else.

- **Task management built into the daily journal**
  - Displays tasks found in today’s note.
  - Supports adding tasks, marking complete, reviewing, rescheduling, and removing tasks.
  - Follows Obsidian Tasks emoji conventions (due/scheduled/start/created/done, priority, recurrence).

- **Previews before saving in narrative mode**
  - When rewriting reflective content into narrative form, the agent shows a preview so you can request edits before it updates the note.

## Usage instructions

### 1) Start a journaling session (create vs update)

When you start, the agent checks today’s daily note:

1. It calls `get_daily_note` to see if a note exists for today.
2. If **no note exists**, it will offer to create one using the template.
3. If a **note exists**, it will read it and ask which section you want to work on.

Typical section choices include:

- 🌅 Morning Intentions  
- 🙏 Gratitude  
- 📝 Daily Log Entry  
- 🎯 Manage Tasks  
- 💭 Evening Reflection  
- 📊 Mood & Energy Check-in  
- 🔗 Add Related Links  

If a section is already filled, the agent should tell you and ask whether you want to revise it or pick something else.

### 2) Update one section at a time (without overwriting the rest)

For updates, the agent follows a safe pattern:

1. Reads the entire note (`read_note`)
2. Modifies only the target section (or frontmatter field)
3. Updates `modified-date` to today
4. Writes the full note back (`update_note`)

Rules of thumb:

- **Replace**: Morning Intentions, Gratitude, Evening Reflection
- **Append**: Daily Log, Related Links
- **Frontmatter only**: Mood, Energy (and goals progress if used)

### 3) Choose a writing style (once per session)

The first time you select a narrative-eligible section in a session, the agent asks how you want your reflections written:

- **Full narrative** — turn notes into flowing prose (first-person)
- **Light polish** — clean up phrasing but keep your voice
- **My exact words** — format only; do not rewrite content

Structured fields (mood, energy, goals, tags, tasks) are always stored verbatim.

### 4) Use tasks inside your journal (optional)

In the **🎯 Manage Tasks** section, you can:

- ➕ Add new tasks (one per line)
- ✅ Mark tasks complete
- 📋 Review tasks (overdue, by priority, all incomplete)
- 📅 Reschedule tasks (update due dates)
- 🗑️ Remove tasks (delete task lines from the note)

Task formatting is handled using Obsidian Tasks-style emoji conventions (e.g., `📅 2026-02-10`, priority emojis, recurrence).

### 5) Continue or finish

After saving a section, the agent asks whether you want to work on another section or stop for now. If you’re done, it ends with a short encouraging message.

## Examples

### Example A: Starting the day (create + intentions + mood)

1. You open the agent in the morning.
2. The agent checks today’s daily note; it doesn’t exist, so it creates it from the template.
3. You pick **🌅 Morning Intentions** and answer a couple of prompts (focus + desired end-of-day feeling).
4. You pick **📊 Mood & Energy Check-in** and select quick options.
5. The agent updates only the relevant section and frontmatter fields, then asks if you want to continue.

### Example B: Midday update (append to Daily Log)

1. You return later and choose **📝 Daily Log Entry**.
2. You jot down quick bullets about what happened.
3. The agent (optionally) polishes them into your chosen style and **appends** to the Daily Log section rather than replacing it.
4. Everything else in the note remains unchanged.

### Example C: End-of-day wrap-up (evening reflection + tasks)

1. You choose **💭 Evening Reflection** and answer prompts for wins, challenges, and lessons learned.
2. The agent generates a concise narrative (if you chose narrative mode), shows you a preview, then saves it to just that section.
3. You optionally manage tasks (mark done, reschedule, or add new tasks) directly in today’s note.