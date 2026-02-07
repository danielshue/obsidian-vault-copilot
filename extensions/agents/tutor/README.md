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

## Brief overview

Tutor Agent is a graduate-level tutoring assistant designed to help you achieve master’s-level mastery in a specific subject area using Socratic questioning, active learning, and real-world application. It can leverage your Obsidian vault as a “learning workspace” by referencing, searching, and building on your existing notes, and it can pull in current examples or research when needed.

## Features

- Master’s-level learning support
  - Targets deep understanding, not just answers
  - Emphasizes synthesis, evaluation, and transfer to new problems

- Socratic, inquiry-driven tutoring
  - Probing questions to uncover gaps and misconceptions
  - Encourages you to justify reasoning and challenge assumptions

- Progressive complexity
  - Starts from fundamentals and builds toward advanced applications
  - Introduces nuance, edge cases, and trade-offs after core concepts land

- Active learning workflow
  - Practice problems, case studies, and thought experiments
  - “Teach it back” prompts to verify understanding

- Real-world and research connection
  - Links theory to industry practice and current literature
  - Uses web_fetch to retrieve up-to-date examples (when appropriate)

- Vault-aware learning support (within the configured scope)
  - Browse a learning folder (list_notes_recursively)
  - Read specific notes (read_note)
  - Search for relevant material (search_note / search_note equivalent)
  - Reference notes using [[wikilinks]] so you can navigate easily

## Usage instructions

### 1) Choose your subject area

Decide what you’re studying and be explicit. Examples:
- Machine Learning (focus: optimization and generalization)
- Corporate Finance (focus: valuation and capital structure)
- Statistical Methods (focus: causal inference)

When you begin a session, state the subject area in your prompt so the agent can frame questions and examples appropriately.

### 2) Set a learning folder in your vault

Pick a folder that will hold your study notes for this subject (existing or new). Examples:
- Learning/Machine-Learning
- Learning/Corporate-Finance
- Learning/Stats-Causal-Inference

The agent will treat this folder as the “source of truth” for your current knowledge and will use it to:
- list what you already have,
- locate prerequisites and missing pieces,
- reference notes via [[wikilinks]] during the session.

### 3) Start a session (recommended structure)

Use a prompt that includes:
- your subject area,
- your learning folder,
- what you want to accomplish today,
- what’s currently confusing or blocking you.

During the session, expect the agent to:
- assess your baseline with targeted questions,
- teach via a question-first approach,
- assign practice and ask you to explain concepts back,
- summarize takeaways and propose next steps.

### 4) Keep the session rigorous and iterative

To get the most value:
- Answer questions in your own words (even if imperfect).
- Ask for a quick diagnostic when you feel “stuck.”
- Request practice problems that match your current level.
- Ask for critique of your solution approach (not just correctness).

### 5) (Optional) Use the web for recency

If you want current examples, papers, or industry practices, explicitly request that the agent use web_fetch and specify what you want:
- “Find a recent survey paper on X and summarize key ideas.”
- “Pull a current real-world case study and help me analyze it.”

## Examples

### Example 1: First session setup

“I want master’s-level tutoring in Machine Learning, focused on optimization and generalization. Use my learning folder ‘Learning/Machine-Learning’. First, list what notes already exist there, then assess my current understanding with a few probing questions and build a plan for what to study next.”

### Example 2: Diagnosing a misconception

“I’m studying Corporate Finance in ‘Learning/Corporate-Finance’. I keep mixing up WACC, discount rates, and required return. Ask me questions to pinpoint exactly where my reasoning breaks, then give me a short framework and a practice problem to confirm the fix.”

### Example 3: Deepening toward research-level intuition

“I’m comfortable with the basics of causal inference, but I’m struggling with identification assumptions. Use ‘Learning/Stats-Causal-Inference’. Ask me to articulate the assumptions behind difference-in-differences and then challenge them with counterexamples. After that, propose two practice scenarios and explain how I should reason through them.”

### Example 4: Continue from previous work

“Let’s pick up where we left off on [topic]. I completed the practice problems from last time. Please review my approach, identify weaknesses, and then push me with a harder variant that requires synthesis across concepts.”