---
name: classify-note-priority
description: Classify a note's priority level based on its content, tags, and context
tools: [read_note, search_vault]
---
Analyze the given note and classify its priority level.

**Priority Levels:**
- **P0 (Critical)** — Urgent items requiring immediate attention
- **P1 (High)** — Important items for this week
- **P2 (Medium)** — Items to address this month
- **P3 (Low)** — Nice-to-have, no time pressure

**Consider:**
- Deadlines mentioned in the note
- Tags (e.g., #urgent, #important)
- Links to active projects
- Recency of the note

Return the priority classification with a brief justification.
