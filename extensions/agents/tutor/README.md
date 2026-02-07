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

A graduate-level tutoring agent designed to help you achieve master’s-degree mastery of a specific subject using Socratic questioning, active learning, and real-world application. It can leverage your Obsidian vault as a “learning workspace” by reading and searching notes in your chosen learning folder and (when supported by your host setup) pulling in current references via web fetch.

## Brief overview

Tutor Agent runs structured, high-rigor learning sessions around a topic you specify. It starts by assessing your baseline, then guides you through progressively more complex concepts using questions, practice, and synthesis—while grounding the work in your existing notes and study materials.

## Features

- Graduate-level rigor with supportive coaching
  - Maintains high standards while normalizing confusion and encouraging persistence
  - Prompts you to explain ideas back, defend assumptions, and critique alternatives

- Socratic, inquiry-first teaching style
  - Uses probing questions to reveal misconceptions and deepen understanding
  - Avoids giving answers too quickly; emphasizes reasoning and independent problem solving

- Progressive complexity and mastery-based pacing
  - Builds from fundamentals to advanced nuance, edge cases, and synthesis
  - Connects new material to previously mastered concepts and adjacent topics

- Active learning built in
  - Practice problems, case studies, thought experiments, and “teach it back” prompts
  - Clear wrap-ups with takeaways and next-step exercises

- Vault-aware study workflow (via tools)
  - Browse a learning folder to understand your existing knowledge base (`list_notes_recursively`)
  - Read specific notes for context and continuity (`read_note`)
  - Find relevant prior work quickly (`search_note`)
  - Pull in up-to-date examples or research references when useful (`web_fetch`)

## Usage instructions

### 1) Configure the agent for your subject and notes

In the agent content, set:

- **SUBJECT AREA**: the topic you want to master (e.g., Machine Learning, Corporate Finance, Statistical Methods)
- **LEARNING FOLDER**: the folder in your vault where your study notes live (e.g., `Learning/Machine-Learning`)

Tip: Start with a single subject area and a single learning folder to keep sessions coherent and cumulative.

### 2) Start a session

Open a chat with Tutor Agent and state:

1. The topic and your target depth (e.g., “master’s level”)
2. What you’re currently struggling with or what you want to achieve
3. Any constraints (exam date, project deliverable, preferred resources, time per week)

Tutor Agent will typically:
- Ask baseline questions to assess your current understanding
- Identify gaps and propose a learning path for the session
- Use your learning folder as a reference point for continuity

### 3) Keep continuity across sessions

To continue effectively:
- Begin by summarizing what you learned last time and what you practiced
- Share what was confusing and what felt solid
- Ask Tutor Agent to review (or help you create) a short summary note and a small set of targeted practice problems for next time

### 4) Use (optional) web lookups for “stay current” topics

If your subject benefits from current research or industry examples, ask Tutor Agent to:
- Pull a recent reference
- Summarize the key idea
- Compare it to the canonical theory you’re learning
- Highlight tradeoffs, limitations, and common pitfalls

## Examples

### Example 1: Start a new tutoring track

“I need help understanding variational inference at a master’s level. Use the tutor agent focused on Machine Learning, and use my learning folder `Learning/Machine-Learning`. Start by assessing what I already know and then build a plan for today’s session.”

### Example 2: Continue from last session

“Let’s continue where we left off on logistic regression vs. SVMs. I did the practice problems from last time, but I’m still confused about the role of margins and regularization. Can you quiz me first, then we’ll debug my understanding?”

### Example 3: Push into advanced/application territory

“I’m solid on the basics of gradient descent and backprop. What are the most important modern optimizers and training stability techniques I should know, and when would I choose each? Please include at least one real-world failure mode and how to diagnose it.”

### Example 4: Use your notes as the teaching substrate

“Search my learning folder for anything about ‘bias-variance’ and ‘cross-validation’, summarize what I already have, and then challenge me with 3 Socratic questions and 2 practice prompts that would expose any misconceptions.”