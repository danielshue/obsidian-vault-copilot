---
name: Quick Note
description: Format a quick note with title, summary, key points, actions, and open questions
argument-hint: Paste the raw note text
timeout: 120
tools: [create_note]
---
Transform the provided content into a concise, structured note.

**Source Content:**
${userInput}

**Output Format (markdown):**
1) **Title** — include a short, descriptive title plus the current date/time in `YYYY-MM-DD HH:mm` (local).
2) **Summary** — 2-4 bullet points capturing the essence.
3) **Key Points** — bulleted list of the most important facts/ideas.
4) **Action Items** — checklist (`- [ ]`) with owners/due dates if implied; omit if none.
5) **Open Questions** — bullets for uncertainties or follow-ups; omit if none.

**Rules:**
- Derive all content from the provided text; do not invent details.
- Keep wording crisp and specific; avoid filler.
- If a section has no content, omit its heading entirely.
