---
layout: feature
title: Context Control & Privacy
subtitle: You decide what context is sent to AI—local-first, portable, private
icon: 🔒
permalink: /features/context-control/
---

## Overview

Vault Copilot is built with **privacy and control** as core principles. Your notes remain local-first, and you have complete control over what context is shared with AI. There's no forced cloud migration, no hidden telemetry, and no automatic vault scanning—you decide exactly what the AI can access.

## Privacy Principles

### Local-First Architecture

Your vault stays on your device:

- **No cloud sync required**: Vault Copilot works entirely with local files
- **No vault uploads**: Notes are never automatically sent to external servers
- **Optional cloud**: Use Obsidian Sync or Git only if you choose
- **Portable vaults**: Your data remains in standard Markdown

### Explicit Context Control

You control what the AI sees:

- **No passive scanning**: AI only accesses what you explicitly share
- **Selective sharing**: Choose specific notes, sections, or search results
- **Permission gates**: Approve each operation before execution
- **Context preview**: See exactly what will be sent to AI

### No Hidden Telemetry

Vault Copilot does not:

- ❌ Send usage analytics without consent
- ❌ Upload vault metadata or filenames
- ❌ Track your note-taking habits
- ❌ Share data with third parties

## Context Mechanisms

Vault Copilot provides multiple ways to share context with AI:

### 1. Workspace Context (Implicit)

Automatically includes:
- **Active note**: The note currently being edited
- **Selection**: Highlighted text in the editor
- **Cursor position**: Context around cursor location

You can disable workspace context in Settings → Chat Preferences.

### 2. Explicit Attachments

Manually attach specific content:
- **File attachments**: Add entire notes to conversation
- **Folder attachments**: Include all notes in a folder
- **Search results**: Attach results of vault search
- **Wikilinks**: Automatically include linked notes

### 3. Prompt Variables

Use variables in prompts to include dynamic context:

```plaintext
${selection}     - Currently selected text
${active_note}   - Content of active note
${clipboard}     - Clipboard content
${date}          - Current date
${time}          - Current time
```

### 4. Search-Based Context

Dynamically gather context:

```plaintext
"Search for notes tagged #project and include in context"
```

The AI will:
1. Execute the search
2. Include results in context
3. Use for answering your query

### 5. Agent Instructions

Custom agents can request specific context:

```yaml
name: meeting-notes-agent
required_context:
  - Current meeting template
  - Today's calendar
  - Recent action items
```

### 6. Wikilink Following

Automatically include linked notes:

```markdown
Discuss [[Project Alpha]] and its relationship to [[Technical Specs]]
```

The AI can optionally:
- Follow wikilinks in the prompt
- Include linked note content
- Respect link depth limits

### 7. Web Context (#fetch)

Fetch external content:

```plaintext
"Summarize this article: #fetch https://example.com/article"
```

Only fetches URLs you explicitly provide.

## Controlling Context Scope

### Global Settings

Configure default context behavior:

- **Auto-include workspace**: Enable/disable workspace context
- **Follow wikilinks**: Automatically include linked notes
- **Max link depth**: Limit how many levels of links to follow
- **Attachment size limits**: Cap total context size

### Per-Conversation Settings

Adjust context for specific chats:

- **Disable workspace context**: For general queries
- **Narrow search scope**: Limit to specific tags or folders
- **Exclude folders**: Prevent access to private notes
- **Preview context**: See what will be sent before each message

### Permission System

Fine-grained control over operations:

- **Read permissions**: Approve which notes AI can read
- **Write permissions**: Approve note creation and updates
- **Search permissions**: Control search scope
- **External access**: Approve MCP and API calls

## Privacy-Preserving Workflows

### Private Notes

Keep sensitive notes private:

1. Store private notes in excluded folders
2. Use tags to mark sensitive content
3. Disable auto-context for private notes
4. Review context before each AI query

### Minimal Context Queries

Ask questions without sharing vault content:

```plaintext
"Explain how to write effective meeting notes" (no vault context needed)
```

### Redacted Context

Share structure without sensitive details:

```plaintext
"Review the structure of my project notes (exclude client names and financial data)"
```

## Data Flow Transparency

### What Gets Sent to AI

When you chat with Vault Copilot, the following may be sent to AI:

1. **Your message**: The prompt you type
2. **Workspace context** (if enabled): Active note, selection
3. **Explicit attachments**: Files you manually attach
4. **Search results**: Notes matching your search criteria
5. **Conversation history**: Previous messages in session

### What Never Gets Sent

Vault Copilot never sends:

- ❌ Entire vault contents
- ❌ Notes you didn't explicitly include
- ❌ Metadata from excluded folders
- ❌ Hidden or system files
- ❌ Plugin data or settings

### Audit and Review

Track all data sharing:

- **Conversation logs**: Review past context sent to AI
- **Operation audit**: See all vault operations performed
- **Context preview**: Preview before sending each message
- **Tracing tools**: Debug and review AI interactions

## Third-Party Integrations

When using MCP integrations:

- **Explicit consent**: Enable each integration individually
- **Credential control**: Store API keys securely
- **Data boundaries**: Only share data you explicitly request
- **Audit logs**: Track all external API calls

## Compliance & Security

### Data Residency

- **Local-first**: Data stays on your device by default
- **Your cloud choices**: Use Obsidian Sync, Git, or any sync method
- **No forced migration**: Never required to move data to specific cloud

### Encryption

- **At rest**: Vault files are standard Markdown (encrypt with OS/disk encryption)
- **In transit**: API calls use HTTPS/TLS
- **Secrets**: API keys stored in Obsidian's SecretStorage

### Access Control

- **No automatic access**: AI only accesses what you share
- **Permission-based**: Approve operations before execution
- **Revocable**: Disable AI access at any time
- **Granular**: Control access per note, folder, or tag

## Best Practices

### Minimize Context

Share only what's needed:

```plaintext
❌ "Include all my project notes and analyze them"
✅ "Include notes tagged #project/alpha and summarize status"
```

### Review Before Sharing

Preview context before sending:

```plaintext
1. Type your query
2. Click "Preview Context"
3. Review what will be sent
4. Confirm or adjust
```

### Use Excluded Folders

Keep private notes separate:

```plaintext
vault/
  ├── projects/     (AI can access)
  ├── personal/     (excluded from AI)
  └── private/      (excluded from AI)
```

### Regular Audits

Periodically review:

- Conversation logs
- Operations performed
- Context shared
- Permissions granted

## Getting Started

1. Review Settings → Privacy & Context
2. Configure workspace context preferences
3. Set up excluded folders for private notes
4. Enable context preview for all queries
5. Start with minimal context, expand as needed

## Related Features

- [Safety & Auditability](/features/safety-auditability/) - Operation approval and audit trails
- [Agentic Vault Operations](/features/agentic-vault-operations/) - Understanding vault operations
- [Real-Time Chats](/features/realtime-chats/) - Contextual conversations
