---
layout: feature
title: Real-Time Agentic Chats
subtitle: Live conversations that search, update, and organize your vault
icon: 💬
permalink: /features/realtime-chats/
---

## Overview

Vault Copilot provides **real-time agentic chat** capabilities that go beyond traditional question-and-answer interfaces. During live conversations, the AI can actively search your vault, update notes, create content, and organize information—all while maintaining a natural conversational flow.

## How It Works

Real-time agentic chats combine:

- **Conversational AI**: Natural language understanding and generation
- **Live vault operations**: Search, read, create, and update notes in real-time
- **Context awareness**: Use conversation history and vault state
- **Streaming responses**: See AI responses as they're generated
- **Tool execution**: Run vault operations during the conversation

## Key Capabilities

### Multi-Turn Conversations

Maintain context across multiple exchanges:

```plaintext
You: "What projects am I working on?"
AI: "You have 3 active projects: Mobile App Redesign, API Migration, and Documentation Overhaul."

You: "Update the Mobile App project status to 'in review'"
AI: "I've updated the project note with status 'in review' in the frontmatter."

You: "Create a status update note for this week"
AI: "I've created 'Weekly Status 2026-W07' with updates from all three projects."
```

### Contextual Operations

The AI understands context from previous messages:

```plaintext
You: "Show me my meeting notes from yesterday"
AI: "Here's your 'Team Sync 2026-02-11' note..."

You: "Extract the action items and add them to my task list"
AI: "I've found 4 action items and added them to your 'Tasks' note with due dates."
```

### Streaming Responses

See responses as they're generated:

- **Faster feedback**: Start reading before completion
- **Progress indication**: Know the AI is working
- **Interruption**: Stop if response is off-track
- **Reasoning visibility**: See thinking process (on supported models)

### Reasoning Traces

Some models (like o1) show their reasoning:

```plaintext
You: "Organize my research notes by theme"
AI (reasoning): "Let me analyze the notes... I see three main themes: 
     Machine Learning, Data Privacy, and System Architecture. 
     I'll group related notes and create a summary."
AI (response): "I've organized 15 research notes into 3 theme-based sections..."
```

## Conversation Modes

### Chat Mode (Default)

Standard conversational interface:
- Back-and-forth dialogue
- Context maintained across turns
- Operations executed inline
- History preserved

### Voice Mode

Speak naturally to the AI:
- **Voice input**: Use speech-to-text for queries
- **Voice output**: Hear responses (on supported platforms)
- **Hands-free**: Interact while taking notes
- **Transcription**: Automatic transcript of conversation

### Realtime Mode (Advanced)

Low-latency streaming conversations:
- **Interrupt**: Stop and redirect mid-response
- **Think aloud**: Follow AI reasoning in real-time
- **Collaborative**: Work together on complex tasks
- **Adaptive**: AI adjusts based on your reactions

## Session Management

### Session Persistence

Conversations are saved and resumable:
- **Session history**: Review past conversations
- **Resume sessions**: Continue where you left off
- **Export transcripts**: Save conversations as notes
- **Search history**: Find previous exchanges

### Session Context

Each session maintains:
- **Conversation history**: Previous messages and responses
- **Tool call logs**: Operations performed
- **Workspace context**: Active notes and selections
- **User preferences**: Model, agent, and settings

### Multiple Sessions

Run parallel conversations:
- **Topic separation**: Different sessions for different topics
- **Agent switching**: Use specialized agents per session
- **Independent context**: Isolated conversation histories
- **Session comparison**: Review multiple approaches

## Advanced Features

### Agent Selection

Choose specialized agents for specific tasks:

```plaintext
Select: Meeting Notes Agent
You: "Document today's standup"
AI: "I'll use the meeting notes template and structure..."
```

Agents have:
- **Custom instructions**: Tailored for specific workflows
- **Pre-loaded skills**: Domain-specific capabilities
- **Preferred tools**: Optimized tool selection

### Model Selection

Switch between AI models:

- **GPT-4o**: Fast, versatile, good for general tasks
- **GPT-5**: Most capable, best for complex reasoning
- **Claude Sonnet**: Strong at structured tasks
- **o1**: Advanced reasoning, shows thinking process

### Context Augmentation

Enhance conversations with vault context:

- **Selection context**: Include highlighted text
- **Wikilink context**: Automatically include linked notes
- **Tag context**: Gather notes by tag
- **Search context**: Add search results to conversation

## Example Workflows

### Knowledge Base Query

```plaintext
You: "Summarize everything I know about GraphQL"
AI: [Searches vault, reads related notes, compiles summary]
```

### Content Creation

```plaintext
You: "Draft a blog post about our new API based on my implementation notes"
AI: [Finds implementation notes, creates outline, writes draft]
```

### Task Management

```plaintext
You: "What tasks are overdue?"
AI: [Searches for tasks, filters by due date, lists results]
You: "Reschedule them for next week"
AI: [Updates task due dates, confirms changes]
```

### Research Assistance

```plaintext
You: "I'm researching database optimization. What do my notes say?"
AI: [Compiles related notes, identifies patterns, suggests next steps]
```

## Best Practices

### Be Specific

```plaintext
❌ "Update my notes"
✅ "Update the 'Project Alpha' note status to 'completed'"
```

### Use Context

```plaintext
❌ Start new session for every question
✅ Continue conversation for related queries
```

### Review Changes

```plaintext
❌ Blindly approve all operations
✅ Preview changes before confirming
```

### Choose Right Model

```plaintext
❌ Use o1 for simple lookups (expensive, slow)
✅ Use GPT-4o for quick queries, o1 for complex reasoning
```

## Safety & Control

All real-time operations are subject to:

- **Permission gates**: Approve before execution
- **Operation preview**: See what will change
- **Undo capability**: Revert recent changes
- **Execution budgets**: Limit operations per session
- **Audit trails**: Review all actions taken

## Getting Started

1. Open the chat panel in Obsidian (icon in left sidebar)
2. Start typing or click the microphone for voice
3. Ask the AI to perform vault operations
4. Review and approve operations before execution
5. Continue the conversation as needed

## Tips for Effective Chats

- **Start broad, then narrow**: Begin with general queries, refine as needed
- **Use follow-ups**: Build on previous responses
- **Leverage context**: Reference earlier parts of conversation
- **Switch models**: Use appropriate model for the task
- **Save sessions**: Resume important conversations later

## Related Features

- [Agentic Vault Operations](/features/agentic-vault-operations/) - Available operations
- [Composable Workflows](/features/composable-workflows/) - Custom agents and skills
- [Context Control](/features/context-control/) - Manage AI context
