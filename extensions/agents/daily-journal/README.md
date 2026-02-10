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

A thoughtful journaling assistant that helps you maintain a consistent daily reflection practice in Obsidian by creating a structured daily note and updating it section-by-section throughout the day. It preserves everything you’ve already written and only edits the section you choose (with optional narrative “write-up” for reflective sections).

## Brief overview

Daily Journal Agent supports two modes: **create** today’s daily journal entry from a consistent template, or **update** an existing entry incrementally as your day progresses. It can also manage tasks inside your daily note using the Obsidian Tasks emoji format (due dates, priorities, recurrence, and completion).

## Features

- **Create today’s journal note automatically**
  - Checks whether today’s daily note exists first (`get_daily_note`)
  - If missing, generates a new entry using a structured template (`create_note`)

- **Section-by-section updates (without overwriting other sections)**
  - Reads the full note (`read_note`)
  - Updates only the selected section between headings (`update_note`)
  - Updates `modified-date` each time

- **Guided reflection flows**
  - Asks targeted questions per section using `ask_question`
  - One question at a time to keep the experience lightweight and focused

- **Daily Log and Related Links accumulate over time**
  - Appends to **📝 Daily Log** instead of replacing, so you can add multiple entries per day
  - Appends to **🔗 Related** as you discover links to projects/people/notes

- **Writing style options for reflective sections**
  - Choose once per session:
    - Full narrative (flowing prose in your voice)
    - Light polish (cleaned up but still you)
    - Exact words (format only)
  - Structured data is always preserved verbatim (tasks, mood/energy, goals, tags)

- **Mood & Energy check-ins stored in frontmatter**
  - Saves `mood:` and `energy:` directly in YAML frontmatter for later tracking/querying

- **Task management inside the journal**
  - View tasks from today’s note
  - Add tasks (optionally with due/scheduled/start dates, priority, recurrence, tags)
  - Mark tasks complete (with today’s completion date)
  - Review/filter tasks (overdue, by priority, incomplete)
  - Reschedule or remove tasks while keeping task text unchanged

- **Continuity & pattern support**
  - Can reference previous entries to help you notice trends and progress over time

## Usage instructions

### 1) Start a journaling session

When you start, the agent determines whether you’re **creating** today’s daily journal note or **updating** an existing one:

1. The agent calls `get_daily_note` for today’s date.
2. If the note **does not exist**, it will ask to create it (default: yes) and then create it from the template.
3. If the note **does exist**, it will read it (`read_note`) and ask which section you want to work on.

### 2) Choose a section to work on

If today’s journal already exists, you’ll pick one of these sections:

- 🌅 Morning Intentions
- 🙏 Gratitude
- 📝 Daily Log Entry
- 🎯 Manage Tasks
- 💭 Evening Reflection
- 📊 Mood & Energy Check-in
- 🔗 Add Related Links

If a section is already filled in, the agent should mention that and offer to revise it or choose another section.

### 3) Answer prompts (one at a time)

Each section uses a tailored flow:

- **Morning Intentions**: focus areas + desired end-of-day feeling  
- **Gratitude**: gratitude items  
- **Daily Log**: what happened + optional “anything else”; then appends  
- **Mood & Energy**: quick radio selections; saved to frontmatter  
- **Evening Reflection**: what went well, what could be better, what you learned (optional), goals progress; reflective text may be written up  
- **Related Links**: adds wiki-links to the Related section  
- **Manage Tasks**: add/complete/review/reschedule/remove tasks using task tools

### 4) Preview before saving (narrative sections)

For narrative-eligible sections (Morning Intentions, Gratitude, Daily Log, Evening Reflection), the agent should show you a preview of the rewritten section before saving so you can request edits.

### 5) Continue or end

After saving a section, the agent asks if you want to work on another section, removing the one you just completed from the list. If you choose “I’m done for now,” it ends with a brief encouraging message.

## Examples

### Example A: First session of the day (morning)

1. Agent checks today’s note with `get_daily_note`
2. Note doesn’t exist → agent creates it from the template (`create_note`)
3. You pick **🌅 Morning Intentions**
4. Agent asks for writing style (once per session) and then your intentions + desired feeling
5. Agent shows a preview, then saves only the Morning Intentions section (`update_note`)
6. You pick **📊 Mood & Energy Check-in**
7. Agent saves mood/energy into YAML frontmatter (`update_note`)
8. You choose “✅ I’m done for now”

### Example B: Midday update (add to Daily Log)

1. Agent finds today’s note exists (`get_daily_note`) and reads it (`read_note`)
2. You pick **📝 Daily Log Entry**
3. You share a few bullets about what happened
4. Agent organizes it (based on your chosen writing style) and **appends** to the Daily Log section
5. Agent shows a preview, then saves (`update_note`)

### Example C: Manage tasks in your journal

1. You pick **🎯 Manage Tasks**
2. Agent retrieves tasks from today’s note (`get_tasks`) and shows them
3. You choose:
   - **➕ Add new tasks** (optionally with due dates, priority, recurrence, tags via `create_task`)
   - **✅ Mark tasks complete** (select tasks, then `mark_tasks`)
   - **📋 Review all tasks** (filter via `list_tasks`)
   - **📅 Reschedule tasks** (updates due dates in emoji format)
   - **🗑️ Remove tasks** (deletes task lines from the note)

### Example D: Evening wrap-up (reflection + goals)

1. You pick **💭 Evening Reflection**
2. Agent asks:
   - What went well?
   - What could be better?
   - What did you learn? (optional)
   - Which goals did you make progress on? (multi-select)
3. Agent synthesizes your reflection (if narrative mode) and updates `goals-completed:` in frontmatter, showing a preview before saving.