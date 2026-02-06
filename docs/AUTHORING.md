---
layout: default
title: Extension Authoring Guide
permalink: /docs/authoring/
---

# Extension Authoring Guide

A step-by-step tutorial for creating and submitting extensions to the Vault Copilot Extensions catalog.

## Overview

This guide walks you through creating an extension from scratch and submitting it to the catalog.

---

## Before You Start

### Prerequisites

1. A GitHub account
2. Familiarity with Markdown
3. An Obsidian vault with Vault Copilot installed (for testing)
4. An idea for an extension!

### Choose Your Extension Type

| Type | Best For | Files |
|------|----------|-------|
| **Agent** | Task-specific AI assistants | `.agent.md` |
| **Voice Agent** | Voice-activated assistants | `.voice-agent.md` |
| **Prompt** | Reusable prompt templates | `.prompt.md` |
| **Skill** | Agent capabilities | `skill.md` |
| **MCP Server** | External integrations | `mcp-config.json` |

---

## Step 1: Plan Your Extension

### Define the Purpose

Answer these questions:
- What problem does it solve?
- Who is the target user?
- What makes it different from existing extensions?

### List Required Tools

Identify which Vault Copilot tools your extension needs:
- `create_note` - Create new notes
- `read_note` - Read note content
- `update_note` - Modify notes
- `search_vault` - Search the vault
- `list_files` - List files in a folder
- etc.

---

## Step 2: Create the Extension

### 2.1 Fork the Repository

1. Go to [obsidian-vault-copilot](https://github.com/danielshue/obsidian-vault-copilot)
2. Click **Fork**
3. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/obsidian-vault-copilot.git
cd obsidian-vault-copilot
```

### 2.2 Create Your Extension Folder

```bash
mkdir -p extensions/agents/my-agent-name
cd extensions/agents/my-agent-name
```

### 2.3 Create manifest.json

```json
{
  "$schema": "../../../schema/manifest.schema.json",
  "id": "my-agent-name",
  "name": "My Agent Name",
  "version": "1.0.0",
  "type": "agent",
  "description": "A brief description of what your agent does.",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/yourusername"
  },
  "repository": "https://github.com/yourusername/my-agent-name",
  "license": "MIT",
  "minVaultCopilotVersion": "0.1.0",
  "categories": ["Productivity"],
  "tags": ["automation", "notes"],
  "files": [
    {
      "source": "my-agent-name.agent.md",
      "installPath": "Reference/Agents/"
    }
  ],
  "tools": ["create_note", "read_note"],
  "dependencies": [],
  "preview": "preview.png",
  "featured": false
}
```

### 2.4 Create the Extension File

For an agent (`my-agent-name.agent.md`):

```markdown
---
title: My Agent Name
description: A brief description
tools:
  - create_note
  - read_note
---

# Instructions

You are a helpful assistant that [describe purpose].

## Goals

1. [Primary goal]
2. [Secondary goal]
3. [Tertiary goal]

## Personality

- Professional but friendly
- Proactive in suggestions
- Concise and clear

## Tools

Use `create_note` to generate new content.
Use `read_note` to gather context.

## Examples

### Example 1

**User:** Help me with...

**Assistant:** I'll help you by...

[Show full conversation example]
```

### 2.5 Create README.md

```markdown
---
layout: extension
title: My Agent Name
---

# My Agent Name

![Preview](preview.png)

Brief description of what your extension does.

## Features

- ✨ Feature one
- 🚀 Feature two
- 📝 Feature three

## Installation

Install via the Extension Browser in Vault Copilot:

1. Open Chat View → Gear Icon → Extensions
2. Search for "My Agent Name"
3. Click **Install**

## Usage

Explain how to use your extension with examples.

## Configuration

Document any customizable settings.

## Changelog

### v1.0.0 (Date)
- Initial release

## License

MIT
```

### 2.6 Add Preview Image

Create a `preview.png` screenshot:
- Dimensions: 1280x720 (16:9)
- Format: PNG
- Size: < 500 KB
- Show your extension in action

---

## Step 3: Test Your Extension

### Local Testing

1. Copy your extension file to your test vault
2. Reload Vault Copilot
3. Test all features
4. Verify tools work as expected

### Checklist

- [ ] Extension loads without errors
- [ ] All features work as documented
- [ ] Error messages are helpful
- [ ] No console errors
- [ ] Preview image displays correctly

---

## Step 4: Validate

```bash
npm install
npm run validate extensions/agents/my-agent-name
```

Fix any errors before submitting.

---

## Step 5: Submit

### Create Pull Request

```bash
git checkout -b add-my-agent-name
git add extensions/agents/my-agent-name
git commit -m "feat: add My Agent Name extension"
git push origin add-my-agent-name
```

1. Go to your fork on GitHub
2. Click **Compare & pull request**
3. Fill out the PR template
4. Submit!

### What Happens Next

1. Automated validation runs
2. Maintainers review your submission
3. You may receive feedback
4. Once approved, your extension is merged
5. Catalog rebuilds automatically
6. Users can install your extension!

---

## Tips for Success

### Do

- Write clear, concise documentation
- Include real-world examples
- Test thoroughly
- Respond to feedback promptly

### Don't

- Include sensitive information
- Use obfuscated code
- Copy others' work without attribution
- Submit incomplete extensions

---

## Getting Help

- 💬 [Discussions](https://github.com/danielshue/obsidian-vault-copilot/discussions)
- 📖 [CONTRIBUTING.md](../CONTRIBUTING.md)
- 🐛 [Issues](https://github.com/danielshue/obsidian-vault-copilot/issues)
