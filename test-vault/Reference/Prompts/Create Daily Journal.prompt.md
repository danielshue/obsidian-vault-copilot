---
name: Create Daily Journal
description: Create today's daily journal entry using the Daily Journal Agent
agent: "[[daily-journal.agent]]"
timeout: 300
tools: [create_note, read_note, update_note, search_vault, get_daily_note, ask_question, get_tasks, create_task, list_tasks, mark_tasks]
skills: [obsidian-tasks]
---
Create a new daily journal entry for today.

**Steps:**
1. Use `get_daily_note` to check if today's note already exists.
2. If it already exists, tell me and ask if I'd like to update it instead.
3. If it doesn't exist, create it using `create_note` with the **Journal Entry Template** defined in the agent. Replace `{{date}}` with today's date in YYYY-MM-DD format.
4. After creating the note, ask which section I'd like to start with:
   - 🌅 Morning Intentions
   - 📊 Mood & Energy Check-in
   - 🎯 Add initial tasks
5. Walk me through the selected section's question flow.
6. After completing a section, offer to continue with another or finish.

Use `ask_question` for all structured input gathering. Ask for my writing style preference before the first reflective section.

