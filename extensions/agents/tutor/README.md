---
title: tutor.agent
date-created: 2026-01-31
date-modified: 2026-01-31
description: Graduate-level tutor specialized in deep learning and mastery of specific topics
name: tutor
tools:
  - list_notes_recursively
  - read_note
  - search_note
  - web_fetch
---

# Tutor Agent

A graduate-level tutoring agent designed to help you achieve master’s-degree depth in any subject you choose. It teaches through Socratic questioning, progressive complexity, and real-world application while leveraging your Obsidian vault as a living knowledge base.

## Brief overview

Tutor Agent runs focused study sessions around a specific **subject area** and a designated **learning folder** in your vault. It references your existing notes with [[wikilinks]], helps you practice and synthesize concepts, and can pull in up-to-date examples or research when needed.

## Features

- **Graduate-level rigor with supportive coaching**
  - Pushes toward mastery (comprehension → analysis → application → synthesis → evaluation)
  - Maintains high standards while normalizing struggle and reinforcing progress

- **Socratic, active-learning teaching style**
  - Probes your understanding instead of jumping straight to answers
  - Uses counterexamples, edge cases, and “why” questions to deepen reasoning

- **Progressive lesson design**
  - Starts from your current baseline and builds toward advanced topics
  - Connects new ideas to prerequisites and previously learned material

- **Practice-driven learning**
  - Assigns problems, scenarios, and case studies
  - Encourages you to explain concepts back (a key signal of true understanding)

- **Obsidian-native note support**
  - References notes in your learning folder using [[wikilinks]]
  - Helps organize a knowledge graph with cross-links and prerequisites
  - Encourages structured note naming for concepts, examples, practice, and summaries

- **Current examples and research (optional)**
  - Uses `web_fetch` to pull in recent papers, articles, or industry references when useful

## Usage instructions

### 1) Configure the agent for your topic

In the agent content, set:

- **SUBJECT AREA:** The topic you want to master  
  Example: `Machine Learning`, `Corporate Finance`, `Statistical Methods`

- **LEARNING FOLDER:** The folder in your vault where your study notes live  
  Example: `Learning/Machine-Learning`

Tip: Keep one learning folder per subject area so your notes and links stay clean and navigable.

### 2) Start your first session

1. Tell the agent what you’re studying and what you want to achieve (depth, goals, constraints).
2. Share what you already know and where you feel stuck.
3. Ask the agent to review or list notes in your learning folder (to establish baseline context).
4. Begin with a focused topic slice (one concept, method, theorem, or chapter section).

### 3) Follow the typical session flow

- **Opening check-in:** clarify the exact goal for today
- **Core teaching:** short explanations + frequent comprehension checks
- **Practice:** you attempt problems; the agent gives hints, not immediate solutions
- **Wrap-up:** summarize key takeaways, assign next steps, and optionally update/plan notes

### 4) Recommended note patterns (optional but helpful)

Use consistent filenames so future sessions can quickly find and build on your work:

- `[Topic] - Concept Name.md`
- `[Topic] - Example - Description.md`
- `[Topic] - Practice - Description.md`
- `[Topic] - Summary - Week X.md`

## Examples

### Example: Start a new tutoring thread

“I need help understanding variational inference at a master’s level. Use the Tutor Agent focused on **Machine Learning** and my **Learning/Machine-Learning** folder. Start by asking questions to assess what I know, then give me one practice problem to work through.”

### Example: Continue from prior work

“Let’s pick up where we left off on Kalman filters. I completed last session’s practice problems—please ask me to explain the key idea, then give me a harder scenario that forces me to choose modeling assumptions.”

### Example: Push into advanced and current research

“I feel solid on the basics of causal inference. What advanced topics and current research directions should I learn next? Use `web_fetch` to cite 2–3 recent references, then propose a study path with practice checkpoints.”