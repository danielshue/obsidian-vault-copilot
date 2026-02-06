
---
name: Update Daily Journal
description: Update a section of today's daily journal entry using the Daily Journal Agent
agent: "[[daily-journal.agent]]"
timeout: 300
tools: [create_note, read_note, update_note, search_vault, get_daily_note, ask_question, get_tasks, create_task, mark_tasks, list_tasks]
skills: [obsidian-tasks]
---
Update today's daily journal entry.

**Steps:**
1. Use `get_daily_note` to find today's note. If it doesn't exist, offer to create it first.
2. Read the current note with `read_note` and check which sections are already filled in.
3. Ask me which section to work on:
   - 🌅 Morning Intentions
   - 🙏 Gratitude
   - 📝 Daily Log Entry
   - 🎯 Manage Tasks
   - 📊 Mood & Energy Check-in
   - 💭 Evening Reflection
   - 🔗 Add Related Links
4. Note which sections are already populated so I can decide whether to revise or skip them.
5. Walk me through the selected section's question flow.
6. Preview the changes, then update only that section — don't overwrite other sections.
7. For Daily Log and Related Links, append new content rather than replacing.
8. After saving, offer to continue with another section or finish.

Use `ask_question` for all structured input gathering. Ask for my writing style preference before the first reflective section.
