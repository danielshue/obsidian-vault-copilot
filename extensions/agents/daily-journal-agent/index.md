---
layout: extension
identifier: "daily-journal-agent"
title: "Daily Journal Agent"
type: agent
version: "1.1.0"
description: "Daily Journal Agent helps you create and incrementally update a structured daily journal note throughout the day, guiding you through section-specific reflection prompts. It preserves existing content, supports incremental section-by-section journaling, and includes mood tracking, task management, and evening reflections."
author: "Dan Shue"
author_url: "https://github.com/danielshue"
icon: "extensions/agents/daily-journal-agent/icon.svg"
categories: ["Productivity", "Journaling"]
tags: ["daily", "journal", "reflection", "gratitude", "goals", "habits"]
size: "98.1 KB"
versions:
  - version: "1.0.0"
    date: "2026-02-01"
    changes:
      - "Initial release"
      - "Structured journal entries with gratitude and goals sections"
      - "Pattern recognition from previous entries"
      - "Smart linking to related notes"
  - version: "1.1.0"
    date: "2026-02-08"
    changes:
      - "Added a new agent-style YAML header replacing the site/extension metadata, including explicit `model: gpt-4o`, a `skills` block, and an expanded tool list."
      - "Added support for **incremental journaling workflows**: create today’s note if missing, then return throughout the day to update only a selected section."
      - "Added **section selector** workflow with explicit supported sections: Morning Intentions, Gratitude, Daily Log Entry, Manage Tasks, Evening Reflection, Mood & Energy Check-in, and Add Related Links."
      - "Added **Tasks integration** via the `obsidian-tasks` skill, including viewing tasks in today’s note and actions to add, complete, review/filter, reschedule, and remove tasks (with emoji-based Tasks metadata like 📅, ✅, ⏫, 🔁)."
      - "Added **Mood & energy tracking** that saves `mood:` and `energy:` into YAML frontmatter for longitudinal tracking."
      - "Added **writing style modes** for narrative sections (Full narrative, Light polish, Exact words) selected once per session when first entering a narrative-eligible section."
      - "Added an explicit **preview-before-save** step for narrative sections so users can request edits prior to writing changes."
      - "Added detailed end-to-end **Examples** (Morning setup, Midday log append, Task management, Evening wrap-up) that document expected agent behavior and outputs."
      - "Rewrote the README from a short “features + simple usage prompts” guide into a **process-driven specification** describing tool calls, decision points, and save behavior step-by-step."
      - "Changed the core behavior from “create structured entries” to **create-or-update** with a strong emphasis on **not overwriting existing content**."
      - "Expanded tooling from read/create + daily note access to include **note updates** (`update_note`) and **interactive question flows** (`ask_question`), plus task-management tools."
      - "Changed “Journal Structure” from a fixed list (including Goals Progress) to a **section-based workflow**, with goals now described as being captured in frontmatter during Evening Reflection (rather than a dedicated “Goals Progress” section)."
      - "Changed Daily Log and Related Links behavior to be explicitly **append-oriented**, accumulating content across the day rather than replacing existing text."
      - "Changed the “pattern recognition” concept into “continuity and pattern awareness,” explicitly noting it should support reflection **without rewriting structured data**."
      - "Changed usage guidance from single-command examples (e.g., “Start my journal for today”) to a **guided multi-step flow** (start session → choose section → answer one question at a time → preview → save only what changed → continue/stop)."
      - "Addressed the risk of unintended overwrites by specifying a **read-then-update-only-the-chosen-section** save process using `read_note` + `update_note`, preserving all other content."
      - "Standardized metadata maintenance by requiring `modified-date` in frontmatter to be updated to “today” on each save."
      - "Removed extension-site frontmatter fields (e.g., `layout`, `permalink`, `identifier`, `version`, `repository`, `license_url`, `categories`, `tags`, `versions`, `size`, and the embedded historical change list)."
      - "Removed the Installation section that referenced the Extension Browser and manual copying instructions."
      - "Removed the Tools Used table in favor of describing tool usage inline as part of the workflow."
      - "Removed the “Tips” section and the standalone “Changelog v1.0.0” section from the README content."
      - "Removed the explicit “License: MIT” section from the body of the README."
---

## Brief overview

This agent supports two core workflows:

- **Create today’s daily journal note** (if it doesn’t exist yet) using a consistent template.
- **Update an existing daily journal note** by selecting a specific section (e.g., Morning Intentions, Gratitude, Daily Log, Tasks, Evening Reflection) and filling it in via focused questions.

It’s designed for incremental journaling: you can do a quick morning intention, add a few log entries midday, manage tasks, and wrap up with an evening reflection—all in the same daily note.

## Features

- **Create daily journal entries automatically**
  - Uses `get_daily_note` to check whether today’s note exists.
  - Creates the note with a consistent structure when needed.

- **Section-focused journaling**
  - Lets you pick exactly what to work on:
    - 🌅 Morning Intentions
    - 🙏 Gratitude
    - 📝 Daily Log Entry
    - 🎯 Manage Tasks
    - 💭 Evening Reflection
    - 📊 Mood & Energy Check-in
    - 🔗 Add Related Links

- **Incremental updates without collateral damage**
  - Reads the full note first (`read_note`).
  - Updates **only** the chosen section and preserves everything else (`update_note`).

- **Append-friendly sections**
  - **Daily Log** and **Related Links** accumulate throughout the day via **append** behavior rather than replacing existing content.

- **Writing style options for reflective sections**
  - Choose how reflective sections are written up (once per session, when you first pick a narrative-eligible section):
    - Full narrative (flowing prose)
    - Light polish (keep your voice)
    - Exact words (format only)

- **Tasks integration (via obsidian-tasks skill)**
  - View tasks in today’s note and take actions:
    - Add tasks (optionally with due/scheduled/start dates, priority, recurrence, tags)
    - Mark complete
    - Review/filter
    - Reschedule
    - Remove tasks
  - Uses emoji-based Tasks syntax (e.g., 📅 due date, ✅ completion date, ⏫ priority).

- **Mood & energy tracking**
  - Captures mood and energy check-ins and saves them to YAML frontmatter for easy tracking over time.

- **Continuity and pattern awareness**
  - Can reference earlier entries when helpful to support reflection and noticing trends (without rewriting your structured data).

## Usage instructions

### 1) Start a session

When you begin, the agent determines whether to create or update today’s daily note:

1. It calls `get_daily_note` to see whether today’s note exists.
2. If the note does not exist, it offers to create it (default: yes).
3. If the note exists, it reads it (`read_note`) and asks which section you want to work on.

### 2) Choose a section

If today’s journal already exists, you’ll be prompted with a section selector similar to:

- 🌅 Morning Intentions  
- 🙏 Gratitude  
- 📝 Daily Log Entry  
- 🎯 Manage Tasks  
- 💭 Evening Reflection  
- 📊 Mood & Energy Check-in  
- 🔗 Add Related Links  

If a section is already filled in, the agent will call that out and offer to revise it or pick another section.

### 3) Answer one question at a time

The agent uses `ask_question` tool calls to keep each step focused and low-friction. Each section has a tailored flow (for example, Morning Intentions asks about focus and how you want to feel; Evening Reflection asks what went well, what could be better, and what you learned).

### 4) Preview before saving (narrative sections)

For narrative-eligible sections (Morning Intentions, Gratitude, Daily Log, Evening Reflection), the agent should show you a preview of the rewritten section before saving so you can request edits.

### 5) The agent saves only what you touched

When saving, the agent will:

1. Read the entire note (`read_note`)
2. Update just the chosen section
3. Update `modified-date` in frontmatter to today
4. Write the note back (`update_note`)

Special cases:
- **Daily Log**: appends new content (so you can add multiple updates per day)
- **Related Links**: appends links (so it grows over time)
- **Mood/Energy**: updates YAML frontmatter fields (`mood:` and `energy:`) verbatim
- **Tasks**: uses task tools (and obsidian-tasks formatting) to add/complete/update tasks without rewriting task text

### 6) Continue or stop

After a section is saved, the agent asks whether you want to work on another section. If you’re done, it ends with a brief, encouraging close.

## Examples

### Example A: Morning setup (create + intentions)

1. You start the agent.
2. It checks `get_daily_note` and finds no note for today.
3. It creates today’s journal note using the template.
4. You choose **🌅 Morning Intentions**.
5. The agent asks:
   - Writing style preference (first narrative section of the session)
   - What you want to focus on today
   - How you want to feel by end of day
6. It shows a preview, then saves the Morning Intentions section only.

### Example B: Midday update (append to Daily Log)

1. You start the agent later in the day.
2. The note already exists; it reads it and asks what section to work on.
3. You choose **📝 Daily Log Entry**.
4. You jot a few bullets about what happened.
5. The agent organizes that into the Daily Log and **appends** it under any existing log content (no overwrites).
6. It previews the new addition and saves.

### Example C: Task management in your daily note

1. You choose **🎯 Manage Tasks**.
2. The agent displays tasks found in today’s note.
3. You choose an action:
   - Add tasks (optionally adding 📅 due dates, ⏫ priority, 🔁 recurrence, etc.)
   - Mark tasks complete (adds ✅ completion date)
   - Reschedule tasks (updates 📅 due dates)
   - Remove tasks (deletes the task lines)
4. Tasks are always preserved exactly as entered—only metadata/emojis change when requested.

### Example D: Evening wrap-up (reflection + goals)

1. You choose **💭 Evening Reflection**.
2. The agent asks what went well, what could be better, and what you learned (optional).
3. It asks which goals you made progress on and stores them in frontmatter (verbatim).
4. It previews a 1–2 paragraph reflection (if narrative mode is selected) and saves that section only.
5. Optionally, it can set `status: complete` in frontmatter when you’re done for the day.