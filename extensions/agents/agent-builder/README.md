# Agent Builder

An interactive assistant that guides you through creating custom `.agent.md` files for Vault Copilot.

## What it does

The Agent Builder walks you through an 8-phase creation workflow:

1. **Discovery** — Scans your environment for available tools, skills, and existing agents
2. **Purpose** — Helps define what the agent should do and who it's for
3. **Identity** — Suggests names and descriptions
4. **Tool Selection** — Presents available tools by category for you to choose
5. **Skills** — Offers relevant skills to attach
6. **Instructions** — Guides you through writing effective system prompts
7. **Review** — Runs a quality checklist before generation
8. **Generate** — Creates the `.agent.md` file in your vault

## How to use

1. Select **Agent Builder** from the agent dropdown in the chat toolbar
2. Tell the agent what kind of agent you want to create
3. Follow the interactive prompts to refine your agent's configuration
4. The agent will create the `.agent.md` file in your configured agents directory

## Features

- **Dynamic discovery**: Automatically detects available tools, skills, and existing agents at runtime
- **Best practices**: Follows GitHub's AGENTS.md format and Vault Copilot conventions
- **Interactive**: Uses structured questions (multiple choice, text input, mixed) for each decision
- **Quality validation**: Checks for duplicates, tool overload, vague instructions, and anti-patterns
- **Extensible**: Created agents can use any tools available in your environment, including MCP server tools

## Requirements

- Vault Copilot v0.0.14+
- At least one AI provider configured (GitHub Copilot recommended)

## Example

> **You**: I want an agent that helps me prepare for meetings  
> **Agent Builder**: *discovers available tools and skills, then asks structured questions about meeting prep workflow, note templates, task integration, etc.*  
> **Result**: A focused `meeting-prep.agent.md` with proper frontmatter, tool selection, and detailed instructions
