---
layout: feature
title: Extension Marketplace & Ecosystem
subtitle: Discover, install, and share workflow packs, skills, and integrations
icon: 🛒
permalink: /features/extension-marketplace/
---

## Overview

The **Extension Marketplace** is a growing catalog of community-contributed workflow packs, agent skills, and integrations. Expand your vault's capabilities by discovering and installing pre-built extensions, or share your own creations with the community.

## What Are Extensions?

Extensions enhance Vault Copilot's capabilities in specific domains:

### Agents

Specialized AI personas for specific workflows:

- **Meeting Notes Agent**: Structured meeting documentation
- **Daily Journal Agent**: Automated daily notes with prompts
- **Weekly Review Agent**: Structured weekly reflections
- **Research Assistant**: Literature review and citation management

### Voice Agents

Specialized agents optimized for voice interactions:

- **Voice Journal Agent**: Capture thoughts via voice
- **Task Dictation Agent**: Create tasks by speaking
- **Meeting Transcriber**: Real-time meeting transcription

### Prompts

Reusable prompt templates:

- **Task Management Prompts**: GTD and task workflow helpers
- **Content Templates**: Blog posts, social media, newsletters
- **Analysis Prompts**: Data analysis and reporting
- **Learning Prompts**: Study guides and flashcard generation

### MCP Servers

Integrations with external tools:

- **GitHub MCP**: Repository and issue management
- **Slack MCP**: Team communication
- **Jira MCP**: Issue tracking and project management
- **Custom APIs**: Connect to your tools

### Skills

Reusable workflow definitions:

- **Sprint Planning**: Agile workflow automation
- **Documentation Generation**: Auto-create technical docs
- **Task Aggregation**: Compile tasks from multiple notes
- **Status Reporting**: Generate status updates

## Browsing the Marketplace

### Explore Categories

Browse extensions by type:

- **All Extensions**: View complete catalog
- **Agents**: Specialized AI personas
- **Voice Agents**: Voice-optimized agents
- **Prompts**: Reusable templates
- **MCP Servers**: External integrations
- **Skills**: Workflow definitions

### Search and Filter

Find what you need:

- **Keyword search**: Search by name, description, tags
- **Category filter**: Filter by extension type
- **Sort options**: By popularity, recent, name
- **Tag filtering**: Find related extensions

### Extension Details

Each extension shows:

- **Description**: What it does and why
- **Author**: Who created it
- **Version**: Current version and changelog
- **Dependencies**: Required extensions or tools
- **Examples**: Usage examples and screenshots
- **Reviews**: Community ratings and feedback
- **Installation count**: Popularity indicator

## Installing Extensions

### One-Click Install

Install extensions easily:

1. Browse marketplace at `/extensions/`
2. Click on extension card
3. Click "Install" button
4. Confirm installation
5. Extension is ready to use

### Installation Process

What happens during installation:

1. **Download**: Extension files downloaded
2. **Validation**: Schema and security checks
3. **Placement**: Files copied to vault
4. **Registration**: Extension registered with plugin
5. **Activation**: Extension activated and ready

### Extension Updates

Keep extensions current:

- **Update notifications**: Alerts for new versions
- **One-click updates**: Update with single click
- **Changelog preview**: Review changes before updating
- **Rollback**: Revert to previous version if needed

## Creating Extensions

Share your workflows with the community:

### Step 1: Build Your Extension

Create your agent, skill, or prompt:

```yaml
# extensions/my-agent/manifest.yaml
type: agent
name: project-manager-agent
version: 1.0.0
description: AI assistant for project management workflows
author: Your Name
icon: 📊

# Agent configuration
instructions: |
  You are a project management expert. Help users:
  - Track project status
  - Manage tasks and milestones
  - Generate status reports
  - Coordinate team workflows

skills:
  - task-management
  - status-reporting
  - sprint-planning
```

### Step 2: Test Locally

Validate your extension:

1. Install locally in your vault
2. Test all workflows and edge cases
3. Document usage and examples
4. Add screenshots or demos
5. Refine based on testing

### Step 3: Prepare for Submission

Package your extension:

- **Metadata**: Complete manifest with all fields
- **Documentation**: README with usage examples
- **Examples**: Sample workflows and outputs
- **License**: Choose an open-source license
- **Screenshots**: Visual demonstrations

### Step 4: Submit to Marketplace

Use the in-app submission wizard:

1. Open Settings → Extensions → Submit Extension
2. Select your extension files
3. Fill in metadata (or let AI help)
4. Preview submission
5. Submit pull request to catalog

The wizard guides you through:

- **File selection**: Choose extension directory
- **AI-assisted metadata**: Generate descriptions, examples
- **Validation**: Ensure schema compliance
- **Preview**: Review before submission
- **GitHub integration**: Automated PR creation

### Step 5: Maintenance

Keep your extension maintained:

- **Respond to feedback**: Address user questions
- **Fix bugs**: Resolve issues promptly
- **Add features**: Enhance based on requests
- **Update dependencies**: Keep compatible with new versions

## Extension Quality Standards

High-quality extensions should:

- **Clear purpose**: Solve a specific, well-defined problem
- **Good documentation**: Examples, usage, troubleshooting
- **Error handling**: Graceful failures and user feedback
- **Security**: Safe operations, no malicious code
- **Testing**: Validated on real vaults
- **Maintenance**: Active author, responsive to issues

## Popular Extensions

### Productivity

- **Daily Journal Agent**: Automated daily notes
- **Weekly Review Agent**: Weekly reflection prompts
- **Task Management Prompts**: GTD workflows

### Development

- **Sprint Planning Skill**: Agile workflow automation
- **Code Documentation Agent**: Generate technical docs
- **GitHub Issue Manager**: Link issues to notes

### Content Creation

- **Blog Post Template**: Structured blog drafts
- **Social Media Prompts**: Content for social platforms
- **Newsletter Agent**: Compile newsletter content

### Research

- **Literature Review Agent**: Academic research assistance
- **Citation Manager**: Bibliography management
- **Research Notes Template**: Structured research notes

## Extension Security

### Review Process

All extensions go through:

- **Schema validation**: Ensure proper structure
- **Content review**: Check for malicious code
- **Testing**: Validate functionality
- **Documentation check**: Ensure adequate docs

### Security Best Practices

For extension users:

- **Review code**: Extensions are open source—review before installing
- **Check author**: Install from trusted authors
- **Read permissions**: Understand what extension can access
- **Stay updated**: Keep extensions current

For extension authors:

- **No malicious code**: Only safe, helpful operations
- **Minimal permissions**: Request only necessary access
- **Secure secrets**: Use SecretStorage for API keys
- **Validate inputs**: Check all user-provided data

## Getting Started

### Install Your First Extension

1. Visit the [Extension Marketplace](/extensions/)
2. Browse featured extensions
3. Click on an interesting extension
4. Read description and examples
5. Click "Install"
6. Try it out in a chat

### Create Your First Extension

1. Identify a repetitive workflow
2. Create a simple agent or prompt
3. Test in your vault
4. Package with metadata
5. Submit via Settings → Extensions → Submit

### Share and Discover

- **Join discussions**: Engage with community
- **Share workflows**: Help others with your insights
- **Request features**: Suggest new extension ideas
- **Contribute**: Improve existing extensions

## Community Guidelines

### Be Respectful

- **Credit authors**: Acknowledge original creators
- **Give feedback**: Constructive reviews help improve
- **Report issues**: Help authors fix problems
- **Collaborate**: Work together to enhance ecosystem

### Extension Etiquette

- **Clear naming**: Descriptive, searchable names
- **Accurate descriptions**: Don't overpromise
- **Working examples**: Provide usable samples
- **Responsive maintenance**: Address issues promptly

## Future Roadmap

Planned marketplace enhancements:

- **Extension ratings**: Community-driven quality scores
- **Collections**: Curated extension bundles
- **Analytics**: Installation and usage stats (opt-in)
- **Verified authors**: Trusted contributor badges
- **Sponsorship**: Support extension authors
- **Localization**: Extensions in multiple languages

## Related Features

- [Composable Workflows](/features/composable-workflows/) - Understanding skills and agents
- [MCP Integrations](/features/mcp-integrations/) - Building MCP integrations
- [Agentic Vault Operations](/features/agentic-vault-operations/) - Available operations
