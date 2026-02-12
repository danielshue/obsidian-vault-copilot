---
layout: feature
title: Composable Workflows & Custom Agents
subtitle: Build and automate with reusable skills and workflow packs
icon: 🔧
permalink: /features/composable-workflows/
---

## Overview

Vault Copilot enables you to **build, share, and automate workflows** using reusable skills, custom agents, and extension modules. Rather than repeating the same instructions to the AI, you can package domain-specific knowledge into composable units that enhance Copilot's capabilities.

## Key Concepts

### Agent Skills

Skills are reusable workflows that teach the AI how to perform specific tasks:

- **Task management**: Create, track, and organize tasks
- **Meeting notes**: Generate structured meeting summaries
- **Project tracking**: Monitor project status and milestones
- **Documentation**: Auto-generate technical documentation
- **Research**: Compile and synthesize research notes

### Custom Agents

Custom agents are specialized AI personas with:

- **Specific instructions**: Tailored system prompts for domain tasks
- **Pre-loaded skills**: Access to relevant workflow skills
- **Focused behavior**: Optimized for particular use cases

### Workflow Packs

Collections of related skills and templates:

- **Engineering workflows**: Sprint planning, retrospectives, ADRs
- **Content workflows**: Blog post drafts, social media, newsletters
- **Academic workflows**: Literature reviews, citation management
- **Business workflows**: OKRs, project charters, status reports

## How Skills Work

Skills are defined in YAML or Markdown with:

```yaml
name: weekly-review
description: Generate a weekly review summary
instructions: |
  1. Search for notes created this week
  2. Extract key accomplishments and decisions
  3. Identify open tasks and blockers
  4. Create summary note with sections:
     - Accomplishments
     - Decisions Made
     - Open Tasks
     - Next Week Focus
tools:
  - search_vault
  - read_note
  - create_note
  - update_frontmatter
```

The AI uses these instructions and available tools to execute the workflow.

## Creating Custom Agents

Define agents with specific roles:

```yaml
name: meeting-notes-agent
description: AI assistant specialized in meeting documentation
system_message: |
  You are a meeting notes expert. When asked to document meetings:
  - Use structured templates
  - Extract action items with owners
  - Link to related projects
  - Follow company meeting note standards
skills:
  - meeting-notes-template
  - task-extraction
  - project-linking
```

## Extension Marketplace

Discover and install pre-built workflows:

- **Browse catalog**: Explore community-contributed extensions
- **One-click install**: Add skills and agents to your vault
- **Automatic updates**: Keep extensions up to date
- **Version control**: Roll back if needed

### Popular Extensions

- **Daily Journal Agent**: Automated daily notes with prompts
- **Weekly Review Agent**: Structured weekly reflections
- **Meeting Notes Agent**: Standardized meeting documentation
- **Task Management Prompts**: GTD and task workflow helpers

## Building Your Own Workflows

### Step 1: Identify Repetitive Tasks

Look for tasks you perform regularly:
- Creating specific note types
- Updating project statuses
- Compiling information from multiple notes
- Generating reports or summaries

### Step 2: Define the Workflow

Break down the task into steps:
1. What information is needed?
2. What operations should be performed?
3. What format should the output have?

### Step 3: Package as a Skill

Create a skill YAML file:

```yaml
name: project-status-update
description: Update project status across all active projects
instructions: |
  For each project tagged #project/active:
  1. Read the project note
  2. Check for recent updates
  3. Update status field in frontmatter
  4. Create summary in project overview note
```

### Step 4: Test and Refine

- Run the workflow on test data
- Adjust instructions based on results
- Add error handling
- Document usage and examples

### Step 5: Share (Optional)

Submit to the Extension Marketplace:
- Package with metadata
- Include examples and documentation
- Test on fresh vault
- Submit PR to extension catalog

## Example Workflows

### Engineering Runbook

```plaintext
"Create a runbook for our deployment process including steps, rollback procedures, and contact info"
```

### Literature Review

```plaintext
"Review all notes tagged #research/papers and create a summary organized by theme"
```

### Sprint Planning

```plaintext
"Generate sprint planning notes for next sprint with goals from roadmap and team capacity"
```

## Benefits

- **Consistency**: Ensure workflows are followed correctly every time
- **Reusability**: Build once, use many times
- **Collaboration**: Share workflows with your team
- **Efficiency**: Automate repetitive documentation tasks
- **Knowledge capture**: Package expertise into executable workflows

## Best Practices

1. **Start simple**: Begin with single-step workflows
2. **Be specific**: Clear instructions produce better results
3. **Test thoroughly**: Validate on real data before relying on workflows
4. **Version control**: Track changes to your workflow definitions
5. **Document well**: Explain purpose, usage, and examples
6. **Fail gracefully**: Handle edge cases and errors

## Getting Started

1. Browse the [Extension Marketplace](/extensions/) for pre-built workflows
2. Install a few skills to understand the pattern
3. Identify a repetitive task in your workflow
4. Create a simple skill YAML file
5. Test and refine the workflow
6. Share with the community if helpful

## Related Features

- [Extension Marketplace](/features/extension-marketplace/) - Discover and install extensions
- [Agentic Vault Operations](/features/agentic-vault-operations/) - Understand available operations
- [MCP Integrations](/features/mcp-integrations/) - Connect to external systems
