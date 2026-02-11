# Context Augmentation

Vault Copilot automatically enhances your chat messages with implicit context from your workspace, providing the AI with rich information about your active work environment.

## Overview

When you send a message to the AI, Vault Copilot automatically includes:

1. **Selected Text** - Any text you have selected in the active editor
2. **Active File Content** - The complete content of the currently active file
3. **Open Tabs** - Content from all other open tabs/files in your workspace

This implicit context helps the AI better understand your working environment and provide more relevant, context-aware responses without you needing to manually attach files or copy-paste content.

## How It Works

### Automatic Context Gathering

Every time you send a chat message, Vault Copilot:

1. Checks if you have any text selected in the editor
2. Reads the content of your active file
3. Identifies all open tabs in your workspace
4. Reads the content from each open tab
5. Formats and includes this information with your message

### Context Formatting

The implicit context is structured in a clear, hierarchical format:

```
--- Selected Text from "filename.md" ---
[Your selected text here]
--- End of Selected Text ---

--- Active File: "active-note.md" ---
[Full content of your active file]
--- End of Active File ---

--- Other Open Tabs (2) ---

File: "reference-note.md"
[Content of first open tab]

File: "research-notes.md"
[Content of second open tab]
--- End of Open Tabs ---

User message:
[Your actual chat message]
```

### Visual Indicators

In the chat interface, the "Used References" section (below each message) shows all context sources:

- **Selected text from [filename]** - Indicates selected text was included
- **Active file: [filename]** - Shows the active file was included  
- **Open tab: [filename]** - Lists each additional open tab that was included

## Use Cases

### Code Review Across Files

When working on a feature that spans multiple files:

1. Open all relevant files in tabs
2. Ask the AI to review the implementation
3. The AI automatically sees all open files and can provide cross-file insights

### Documentation Writing

When documenting code:

1. Open the source code file(s) in tabs
2. Open your documentation file as the active tab
3. Select specific code sections
4. Ask the AI to explain or document the code
5. The AI has full context of both code and documentation

### Debugging

When troubleshooting an issue:

1. Open the problematic file
2. Select the problematic code section
3. Open related files in tabs (dependencies, tests, etc.)
4. Ask for debugging help
5. The AI sees the full context to provide better solutions

### Research and Note Taking

When synthesizing information from multiple sources:

1. Open all reference notes in tabs
2. Open your synthesis note as the active tab
3. Ask the AI to summarize or connect ideas
4. The AI has access to all source material

## Best Practices

### Managing Context Size

- **Be selective with open tabs** - Only keep relevant files open to avoid overwhelming the AI with unrelated context
- **Close unused tabs** - Regularly close tabs you're not actively working with
- **Use file selection** - For very large projects, open only the most relevant files

### Optimizing for Performance

- **Large files** - Be aware that very large files in open tabs will increase context size and may impact response time
- **Many tabs** - Having many tabs open will include more content; consider closing less relevant ones

### When to Use Explicit vs Implicit Context

**Use Implicit Context (automatic) when:**
- Working on related files that are all open
- You want quick, context-aware responses
- Files are reasonably sized (< 1000 lines each)

**Use Explicit Context (Add Context button) when:**
- You need to reference a file that isn't open
- You want to include only specific files, not all open tabs
- The implicit context would be too large or unfocused

## Technical Details

### Context Gathering Process

The ContextAugmentation service:

1. **`getSelectedText()`** - Retrieves selected text from the active MarkdownView
2. **`getOpenTabs()`** - Gets all markdown leaves (tabs) from the workspace
3. **`getOpenTabsContent()`** - Reads content from each open tab file
4. **`gatherImplicitContext()`** - Combines all context sources
5. **`formatImplicitContext()`** - Formats context for AI consumption

### Priority Order

Context is prioritized in this order (from highest to lowest):

1. Selected text (most specific)
2. Active file content
3. Other open tabs content

### Deduplication

- The active file is not duplicated in the "Other Open Tabs" section
- Files are identified by path to avoid duplicates

## Privacy and Performance

### What's Included

- Only markdown (`.md`) files currently open in your workspace
- File paths and content

### What's NOT Included

- Closed tabs or files
- Non-markdown files
- Files outside your vault
- Files in hidden folders (unless explicitly open)

### Performance Considerations

- Context gathering is fast (milliseconds)
- Large context sizes may increase AI response time
- Consider your API rate limits when using large amounts of context

## Future Enhancements

Potential future improvements:

- **Toggle for implicit context** - Enable/disable automatic context inclusion
- **File type filters** - Choose which file types to include
- **Max context size limit** - Automatically truncate or summarize very large context
- **Smart context selection** - AI-powered selection of most relevant open tabs
- **Context preview** - See what context will be sent before sending a message

## Troubleshooting

### Context Not Being Included

If you notice context is missing:

1. Verify files are actually open as tabs
2. Check that files are markdown (`.md`) format
3. Ensure files are readable (not encrypted or locked)
4. Check the console for any error messages

### Too Much Context

If responses seem slower or less focused:

1. Close unnecessary tabs
2. Use explicit context (Add Context button) instead
3. Consider breaking your question into smaller, more focused queries

### Unexpected Context

If unexpected files appear in context:

1. Check which tabs are actually open
2. Close tabs you don't need
3. Remember that all open markdown tabs are included

## See Also

- [Add Context Button](../README.md#context) - Manual context attachment
- [Inline Context Picker](../README.md#inline-picker) - `#` to insert note chips
- [Prompt Variables](../README.md#variables) - Template variables like `${activeNoteContent}`
