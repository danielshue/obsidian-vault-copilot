---
layout: feature
title: MCP Integrations & Cross-System Automation
subtitle: Connect your vault to GitHub, Slack, Jira, and more
icon: 🔌
permalink: /features/mcp-integrations/
---

## Overview

The **Model Context Protocol (MCP)** enables Vault Copilot to connect with external tools, APIs, and services. Through MCP integrations, the AI can orchestrate work across multiple systems—syncing action items, automating updates, and coordinating engineering workflows between your vault and the tools you use every day.

## What is MCP?

MCP (Model Context Protocol) is a standardized protocol for connecting AI assistants to external systems. It provides:

- **Structured tool definitions**: Type-safe operations on external systems
- **Context sharing**: Pass relevant information between systems
- **Authentication**: Secure API access with credentials
- **Error handling**: Graceful failures and retries

## Supported Integrations

### GitHub

Connect your vault to GitHub for:

- **Issue management**: Create, update, and track GitHub issues from notes
- **Pull request workflows**: Link PR reviews to vault documentation
- **Repository operations**: Clone, commit, and push from within Obsidian
- **Project boards**: Sync vault tasks with GitHub Projects

### Slack

Integrate with Slack for:

- **Message automation**: Post updates from vault to channels
- **Thread summaries**: Capture Slack discussions in notes
- **Status updates**: Broadcast project status to teams
- **Notification routing**: Alert teams about vault changes

### Jira

Sync with Jira for:

- **Issue tracking**: Create and update Jira tickets from vault
- **Sprint planning**: Import sprint goals into vault planning notes
- **Status synchronization**: Keep vault and Jira in sync
- **Custom field mapping**: Map vault frontmatter to Jira fields

### File Systems

Access local and remote files:

- **Read files**: Import data from external sources
- **Write files**: Export vault content to other formats
- **Directory operations**: Organize files outside vault
- **Template processing**: Generate files from vault templates

### Web APIs

Connect to any HTTP-based API:

- **REST APIs**: Call external services
- **Webhooks**: Trigger actions on external events
- **GraphQL**: Query complex data sources
- **Custom integrations**: Build your own connectors

## Transport Types

MCP supports two transport mechanisms:

### Stdio (Desktop Only)

Spawns local MCP server processes:

- **Configuration**: Define in `.github/copilot-mcp-servers.json`
- **Local execution**: Server runs as child process
- **Full access**: Can access local filesystem and resources
- **Best for**: Tools that need system access (Git, file operations)

### HTTP (Cross-Platform)

Connects to remote MCP servers over HTTP:

- **Configuration**: Specify HTTP endpoint URLs
- **Cross-platform**: Works on desktop and mobile
- **Cloud services**: Connect to hosted APIs
- **Best for**: SaaS integrations (GitHub, Slack, Jira)

## Configuration

### Stdio MCP Servers

Define in `.github/copilot-mcp-servers.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### HTTP MCP Servers

Configure in Vault Copilot Settings → MCP Servers:

- **Server Name**: Friendly name for the integration
- **Server URL**: HTTP endpoint (e.g., `https://api.example.com/mcp`)
- **API Key**: Authentication token (stored securely)
- **Enabled**: Toggle server on/off

## Example Workflows

### GitHub Issue Creation

```plaintext
"Create a GitHub issue for the bug I described in today's daily note"
```

The AI will:
1. Read your daily note
2. Extract bug description
3. Call GitHub MCP to create issue
4. Update note with issue link

### Slack Status Update

```plaintext
"Post this week's project accomplishments to #engineering-updates"
```

The AI will:
1. Compile accomplishments from weekly notes
2. Format message for Slack
3. Post to specified channel
4. Log confirmation in vault

### Jira Sprint Sync

```plaintext
"Import active sprint stories from Jira and create tracking notes"
```

The AI will:
1. Fetch current sprint from Jira
2. Create note for each story
3. Add frontmatter with Jira metadata
4. Link notes to sprint planning

### Cross-System Automation

```plaintext
"When I close a project note, update the GitHub project status and notify Slack"
```

The AI can orchestrate:
1. Detect project note closure (frontmatter change)
2. Update GitHub Project status
3. Post completion message to Slack
4. Archive project documentation

## Building Custom MCP Servers

Create your own MCP integrations:

### Step 1: Choose a Framework

Use existing MCP server implementations:
- **TypeScript**: `@modelcontextprotocol/sdk`
- **Python**: `mcp-server-python`
- **Custom**: Implement HTTP JSON-RPC 2.0 protocol

### Step 2: Define Tools

Specify available operations:

```typescript
server.setTools([
  {
    name: "create_ticket",
    description: "Create a support ticket",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] }
      }
    }
  }
]);
```

### Step 3: Implement Handlers

Handle tool invocations:

```typescript
server.onToolCall(async (tool, params) => {
  if (tool === "create_ticket") {
    const ticket = await ticketingSystem.create({
      title: params.title,
      description: params.description,
      priority: params.priority
    });
    return { ticketId: ticket.id, url: ticket.url };
  }
});
```

### Step 4: Deploy and Configure

For HTTP servers:
- Deploy to cloud (AWS Lambda, Vercel, etc.)
- Add URL to Vault Copilot settings
- Test with sample workflows

For Stdio servers:
- Publish to npm or package repository
- Add to `.github/copilot-mcp-servers.json`
- Restart Vault Copilot to load

## Security Considerations

- **Credentials**: Store API keys securely using Obsidian's SecretStorage
- **Permissions**: Grant minimal necessary access to external systems
- **Validation**: Validate all inputs before external API calls
- **Audit**: Log all MCP operations for review
- **Rate limiting**: Respect API rate limits and quotas

## Benefits

- **Unified workflow**: Manage everything from your vault
- **Reduced context switching**: Stay in Obsidian while working across tools
- **Automation**: Orchestrate multi-system workflows
- **Data synchronization**: Keep vault and external systems in sync
- **Extensibility**: Add new integrations as needed

## Getting Started

1. Review available MCP servers in the [Extension Marketplace](/extensions/)
2. Install pre-built integrations for your tools
3. Configure API credentials in Settings → MCP Servers
4. Test with simple workflows
5. Build complex automations as you get comfortable

## Related Features

- [Composable Workflows](/features/composable-workflows/) - Automate with skills
- [Agentic Vault Operations](/features/agentic-vault-operations/) - Understand vault operations
- [Extension Marketplace](/features/extension-marketplace/) - Find MCP integrations
