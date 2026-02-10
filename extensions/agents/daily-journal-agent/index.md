---
layout: extension
identifier: "daily-journal-agent"
title: "Daily Journal Agent"
type: agent
version: "1.1.1"
description: "Daily Journal Agent helps you create a structured daily journal note and then update it throughout the day, one section at a time (intentions, gratitude, log, mood/energy, reflection, and related l..."
author: "Dan Shue"
author_url: "https://github.com/danielshue"
icon: "extensions/agents/daily-journal-agent/icon.svg"
categories: ["Productivity", "Journaling"]
tags: ["daily", "journal", "reflection", "gratitude", "goals", "habits"]
size: "103.2 KB"
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
  - version: "1.1.1"
    date: "2026-02-10"
    changes:
      - "Added explicit **Create vs. Update mode** framing in the overview, describing what the agent does when today’s note is missing vs. already exists."
      - "Added a dedicated **Create mode** section explaining that the agent generates the full daily journal structure (frontmatter + all standard sections) before prompting for the first section to fill."
      - "Added a more explicit **safe update workflow** for section updates, including that updates target content **between a section heading and the next heading**."
      - "Added detailed **task formatting rules** for Obsidian Tasks, including:"
      - "Added clearer documentation that **structured fields remain verbatim**, explicitly including **goals** and **tags** (in addition to mood/energy/tasks)."
      - "Added “Preview-first for rewritten sections” as a first-class feature item (highlighting preview before saving narrative rewrites)."
      - "Rewrote the opening description from a workflow-heavy explanation to a concise “thoughtful journaling assistant” summary emphasizing **focused prompts**, **optional narrative rewriting**, and **preserving existing writing**."
      - "Reworked “Brief overview” from “two core workflows” into “two modes” with clearer, tighter definitions and an explicit note that the agent can manage tasks via Obsidian Tasks metadata."
      - "Consolidated and reorganized the **Features** list from detailed tool-by-tool behavior into higher-level capabilities, while still calling out:"
      - "Updated the **writing style options** wording and descriptions:"
      - "Restructured **Usage instructions**:"
      - "Expanded and clarified **task management** behavior:"
      - "Updated the **Examples** section:"
      - "Removed the explicit “Special cases” breakdown that previously enumerated behavior for Daily Log, Related Links, Mood/Energy (with exact `mood:` / `energy:` field names), and Tasks as separate bullet rules."
      - "Removed the dedicated **Task management example** walkthrough (previous “Example C”), replacing it with a more formal task rules section plus shorter scenario examples."
      - "Removed the documented optional behavior to set `status: complete` in frontmatter when finishing the day."
---

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