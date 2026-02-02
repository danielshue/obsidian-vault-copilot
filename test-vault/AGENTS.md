# Test Vault - Agent Instructions

This is a sample Obsidian vault for testing and demonstrating the Vault Copilot plugin.

## Vault Overview

This vault contains:
- **Daily Notes/**: Daily journal entries (YYYY-MM-DD.md format)
- **Projects/**: Active project notes and meeting documentation  
- **Reference/**: Knowledge base, documentation, and reusable content
  - **Agents/**: Custom agent definitions (*.agent.md)
  - **Prompts/**: Reusable prompt templates (*.prompt.md)
  - **Skills/**: Skill definitions for extending capabilities
  - **Instructions/**: Additional instruction files
- **MyOtherCustomAgents/**: Alternative location for custom agents

## Working with This Vault

### Conversation Style
- Be conversational and helpful
- Ask clarifying questions when requests are ambiguous
- Use Socratic questioning for learning/tutoring scenarios
- Provide examples when explaining concepts

### Creating Content
- Always use [[wikilinks]] when referencing other notes
- Create notes in the appropriate folder based on content type
- Use descriptive filenames

### Frontmatter Requirements

Every document MUST include YAML frontmatter. Use this template:

```yaml
---
creation-date: YYYY-MM-DD
modified-date: YYYY-MM-DD
tags: []
status: draft | in-progress | complete | archived
type: note | project | reference | daily | meeting
---
```

**When creating new documents:**
- Set `creation-date` and `modified-date` to today's date
- Include relevant tags as an array
- Set appropriate `status` and `type` values

**When modifying existing documents:**
- Update `modified-date` to today's date
- Preserve the original `creation-date`
- Add new tags without removing existing ones unless requested

### Project Notes
Projects in this vault track work items, meeting notes, and documentation. When working with projects:
- Link related notes together
- Reference daily notes for context
- Update status fields in frontmatter as work progresses

### Daily Notes
Daily notes capture journal entries, tasks, and daily reflections. When referencing dates:
- Today's date: Use `get_daily_note` tool
- Specific dates: Format as YYYY-MM-DD
- Link daily notes to relevant projects

## Available Custom Agents

Check the **Reference/Agents/** and **MyOtherCustomAgents/** folders for specialized agents:
- **tutor.agent**: Graduate-level tutoring with Socratic method
- **daily-journal.agent**: Daily journaling assistance
- **meeting-notes.agent**: Meeting documentation
- **project-planner.agent**: Project planning and tracking
- **learning-companion.agent**: Learning support

## Tool Usage Guidelines

When the user asks you to do something in the vault:
1. **Actually use the tools** - don't just describe what you would do
2. **Verify actions** - after creating/updating, confirm the result
3. **Be transparent** - explain what you're doing when using tools
4. **Handle errors gracefully** - if a tool fails, explain why and suggest alternatives
