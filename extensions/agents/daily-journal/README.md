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

Daily Journal Agent is a section-focused journaling assistant for Obsidian that helps you create today’s daily note (when missing) and incrementally update it throughout the day without overwriting other sections. It guides you with targeted questions, can optionally rewrite reflective sections in a narrative style, and supports task management plus mood/energy tracking inside your daily entry.

## Brief overview

This agent supports two workflows:

- **Create mode**: If today’s daily note doesn’t exist, it offers to create it using a consistent journal template.
- **Update mode**: If today’s note exists, it reads the note and lets you choose a specific section to work on (e.g., Morning Intentions, Gratitude, Daily Log, Tasks, Evening Reflection).

A core design principle is **safety for existing content**: when you update one section, everything else stays intact. For accumulating sections (Daily Log and Related links), the agent **appends** new content instead of replacing what’s already there.

## Features

- **Daily note creation**
  - Checks whether today’s daily note exists.
  - Creates a structured daily journal note using a consistent template when needed.

- **Section-by-section updates**
  - Lets you pick a single section to work on at a time.
  - Updates only the selected section (between headings) and preserves all other sections.

- **Guided reflection prompts**
  - Asks targeted questions tailored to each section (Morning Intentions, Gratitude, Evening Reflection, etc.).
  - Keeps the flow manageable by asking one question at a time.

- **Narrative rewriting (optional)**
  - For reflective sections, you can choose a writing style:
    - Full narrative (flowing prose)
    - Light polish (clean up but keep your voice)
    - Exact words (format only)
  - Structured data (mood, energy, goals, tags, tasks) is always preserved verbatim.

- **Daily Log that accumulates**
  - Adds new entries to your Daily Log throughout the day (append-only behavior).

- **Task management inside the journal**
  - Uses dedicated task tools to add, review, and complete tasks.
  - Follows the Obsidian Tasks emoji conventions (due dates, priority, recurrence, etc.).
  - Never rewrites your task text.

- **Mood & energy tracking**
  - Captures a quick check-in and stores it in YAML frontmatter for easier tracking over time.

- **Related links**
  - Appends wikilinks to a “Related” section to connect your day to projects/people/notes.

## Usage instructions

### 1) Start the agent

Open your chat with **Daily Journal Agent** and tell it you want to journal (for example, “Let’s do my daily journal” or “Update my journal”).

At the start of each session the agent will:

1. Use `get_daily_note` to check if today’s daily note exists.
2. If it doesn’t exist, it will offer to create it (default: yes).
3. If it does exist, it will read the note and ask which section you want to work on.

### 2) Choose create vs update

- **If today’s note does not exist**
  - The agent creates it using the journal template and then asks what section you want to fill in first.

- **If today’s note exists**
  - The agent asks what you’d like to work on (examples):
    - 🌅 Morning Intentions
    - 🙏 Gratitude
    - 📝 Daily Log Entry
    - 🎯 Manage Tasks
    - 💭 Evening Reflection
    - 📊 Mood & Energy Check-in
    - 🔗 Add Related Links

If a section is already filled, it will call that out so you can revise it or pick another section.

### 3) Complete a section (and keep everything else intact)

When updating, the agent follows a consistent safe-update loop:

1. Read the entire note (`read_note`)
2. Update only the chosen section (or append for Daily Log / Related)
3. Update `modified-date` in frontmatter
4. Show you a **preview** of the rewritten/updated section (for narrative sections)
5. Save the updated note (`update_note`)

### 4) Continue or end the session

After saving a section, the agent asks if you want to work on another section. If you choose “I’m done for now,” it ends with a brief encouraging message.

### Notes on rewriting and data safety

The agent treats content differently depending on the section type:

- **Always verbatim (no rewriting)**
  - Mood, energy, goals progress, tags
  - Tasks (task text is never rewritten)

- **Narrative eligible**
  - Morning Intentions
  - Gratitude
  - Daily Log
  - Evening Reflection

For narrative eligible sections, it can rewrite in first person (your perspective), preserve names/dates/facts, and keep the result concise.

### Task management behavior (high level)

In the “🎯 Manage Tasks” section, the agent can:

- Add new tasks (optionally with due/scheduled/start dates, priority, recurrence, tags)
- Mark tasks complete
- Review tasks by filters (e.g., overdue, by priority)
- Reschedule or remove tasks

It uses the Obsidian Tasks emoji format (e.g., `⏫`, `📅 YYYY-MM-DD`, `✅ YYYY-MM-DD`) and keeps emojis after the description and before tags.

## Examples

### Example: Create today’s journal (first session)

1. You: “Start my daily journal.”
2. Agent checks today’s note:
   - If missing, it creates it from the template.
3. Agent: “Which section would you like to work on first?”
4. You select: “🌅 Morning Intentions”
5. Agent asks:
   - Writing style preference (narrative / light polish / exact words)
   - What you want to focus on today
   - How you want to feel by end of day
6. Agent shows a preview and saves that section.

### Example: Midday update (append to Daily Log)

1. You: “Add a quick update to my Daily Log.”
2. Agent reads today’s note and prompts for what happened.
3. You provide a few bullets or raw notes.
4. Agent organizes them (optionally into narrative prose), previews, then **appends** to the Daily Log so earlier entries remain.

### Example: Evening wrap-up

1. You: “Let’s do Evening Reflection.”
2. Agent asks what went well, what could be better, and what you learned (optional).
3. Agent asks which goals you made progress on and stores those in frontmatter.
4. Agent previews a concise 1–2 paragraph reflection and saves only that section.