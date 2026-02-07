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

Tutor Agent is a graduate-level (master’s-level) tutoring assistant designed to help you deeply master a specific subject using Socratic questioning, active learning, and real-world application. It can ground sessions in your Obsidian vault by reading and searching your learning notes, and it can optionally pull in current examples or references from the web when appropriate.

## Features

- **Master’s-level rigor with supportive coaching**
  - Helps you build from fundamentals to advanced nuance
  - Promotes clear explanations, precise definitions, and correct reasoning

- **Socratic-method teaching**
  - Guides you to discover answers through targeted questions
  - Surfaces misconceptions and tests understanding with counterexamples

- **Progressive complexity**
  - Starts with what you know and increases difficulty deliberately
  - Moves from comprehension → analysis → application → synthesis → evaluation

- **Active learning built-in**
  - Practice problems, case studies, thought experiments, and “teach it back” prompts
  - Structured wrap-ups with next steps and suggested exercises

- **Real-world and research connections**
  - Connects theory to industry practice and current research
  - Uses `web_fetch` when you want recent sources, examples, or studies

- **Vault-aware learning workflow**
  - Can list, read, and search notes in your chosen learning folder
  - Encourages linking concepts with [[wikilinks]] to build a knowledge graph

## Usage instructions

### 1) Configure the agent for your subject and notes

Open the agent file and fill in:

- **SUBJECT AREA:** the topic you want to master  
  Examples: “Machine Learning”, “Corporate Finance”, “Statistical Methods”, “Distributed Systems”, “Real Analysis”

- **LEARNING FOLDER:** the folder in your vault where your study notes live  
  Examples: `Learning/Machine-Learning`, `Learning/Finance`, `Learning/Stats`

Tip: Choose a single folder per subject to keep sessions coherent and make it easy to reference and expand your knowledge base over time.

### 2) Start a session (recommended flow)

1. **State your immediate goal**
   - What concept, skill, or assignment are you working on?
2. **Provide your current baseline**
   - What you already know, where you’re stuck, what you’ve tried
3. **Let the agent assess understanding**
   - Expect probing questions before explanations
4. **Work through practice**
   - You’ll be asked to solve or explain steps; hints come before full solutions
5. **Wrap up with next actions**
   - You’ll get a summary, targeted exercises, and suggested notes to create/update

### 3) How it uses your notes (what to expect)

- The agent can:
  - **List notes** in your learning folder (to map what you already have)
  - **Read notes** you point to (to build on your existing material)
  - **Search notes** for concepts/keywords (to connect related ideas)

- Recommended note naming patterns:
  - `[Topic] - Concept Name.md`
  - `[Topic] - Example - Description.md`
  - `[Topic] - Practice - Description.md`
  - `[Topic] - Summary - Week X.md`

### 4) When to use web_fetch

Use web fetching when:
- you want **recent papers, standards, benchmarks, or industry practices**
- you need **fresh examples** (e.g., current model architectures, current regulations, modern tooling)

Avoid web fetching when:
- you’re practicing fundamentals and want to rely on your own understanding and notes
- you’re working from a specific textbook/lecture and want to stay aligned to that source (unless you explicitly ask to expand)

## Examples

### Example 1: Start a new tutoring thread

**Prompt:**
- “I need help understanding backpropagation at a master’s level. Use the tutor agent focused on Machine Learning. My learning folder is `Learning/Machine-Learning`. I understand derivatives, but I get lost in the chain rule through matrix layers.”

**What you’ll get:**
- Baseline questions to pinpoint where the chain rule breaks down
- A step-by-step derivation with comprehension checks
- Short practice problems (scalar → vector → matrix) and suggested note updates

### Example 2: Continue from existing notes

**Prompt:**
- “Let’s pick up where we left off on Bayesian model comparison. I completed the practice problems from last time. Please review my note [[Learning/Stats/Bayes - Model Comparison]] and challenge any weak points.”

**What you’ll get:**
- A targeted critique (assumptions, edge cases, common pitfalls)
- Questions that force you to justify steps and interpretations
- A refined checklist for when Bayes factors are appropriate

### Example 3: Application + real-world context

**Prompt:**
- “I’m comfortable with the basics of corporate valuation. I want advanced concepts and current practice. Can you compare DCF vs. multiples under different market regimes, and use web_fetch to cite recent practitioner guidance?”

**What you’ll get:**
- A structured comparison (assumptions, failure modes, sensitivity)
- Case-style scenarios and decision criteria
- Pointers to sources and suggested note structure for long-term study