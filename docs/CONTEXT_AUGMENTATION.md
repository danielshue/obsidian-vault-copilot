# Context Augmentation

Vault Copilot provides multiple ways to augment your chat messages with context, from fully automatic implicit context to manual explicit context attachment. This document covers all context mechanisms available in the application.

## Overview

Vault Copilot supports **six different context mechanisms** that work together to provide the AI with rich information:

### Automatic (Implicit) Context
1. **Workspace Context** - Selected text, active file, and open tabs (automatic)
2. **Agent Instructions** - Custom agent behavior instructions (when agent selected)

### User-Triggered Context
3. **Prompt Variables** - Template variables like `${activeNoteContent}` and `${selection}`
4. **Inline Note References** - `[[wikilinks]]` in your message to include note content
5. **Inline Chip References** - Type `#` to insert note chips inline
6. **Explicit Attachments** - "Add Context..." button to manually attach files
7. **Web Page Fetching** - `#fetch URL` to include web page content

All these mechanisms can be combined in a single message, providing flexible and powerful context control.

---

## Context Mechanisms

### 1. Workspace Context (Automatic Implicit)

**What it is:** Automatically includes workspace information with every message.

**What's included:**
- **Selected Text** - Any text you have selected in the active editor
- **Active File Content** - The complete content of the currently active file
- **Open Tabs** - Content from all other open tabs/files in your workspace

**How it works:** 
Every time you send a chat message, the `ContextAugmentation` service automatically:
1. Checks if you have any text selected in the editor
2. Reads the content of your active file
3. Identifies all open markdown tabs in your workspace
4. Reads the content from each open tab
5. Formats and prepends this information to your message

**Format:**
```
--- Selected Text from "filename.md" ---
[Your selected text here]
--- End of Selected Text ---

--- Active File: "active-note.md" ---
[Full content of your active file]
--- End of Active File ---

--- Other Open Tabs (2) ---

File: "reference-note"
[Content of first open tab]

File: "research-notes"
[Content of second open tab]
--- End of Open Tabs ---

User message:
[Your actual chat message]
```

**Visual indicators:** The "Used References" section shows:
- "Selected text from [filename]"
- "Active file: [filename]"
- "Open tab: [filename]"

**Best practices:**
- Keep only relevant files open to avoid overwhelming context
- Close unused tabs regularly
- Files should be reasonably sized (< 1000 lines each)
- Works automatically - no user action required

**Technical details:**
- Service: `ContextAugmentation` (`src/ui/ChatView/ContextAugmentation.ts`)
- Only markdown (`.md`) files are included
- Active file is not duplicated in "Other Open Tabs"
- Context gathering is fast (milliseconds)

---

### 2. Agent Instructions (Automatic)

**What it is:** Custom instructions that modify the AI's behavior when an agent is selected.

**How it works:**
When you select an agent from the agent selector dropdown:
1. The agent's instruction file is loaded
2. Instructions are prepended to every message
3. The AI follows these instructions for all responses

**Format:**
```
[Agent Instructions for "Agent Name"]
[Agent's custom instructions here]
[End Agent Instructions]

User message:
[Your message with other context]
```

**Usage:**
1. Click the agent selector dropdown in the toolbar
2. Select an agent (e.g., "Code Reviewer", "Documentation Writer")
3. All subsequent messages include the agent's instructions
4. Select "Default" to remove agent instructions

**Visual indicators:**
- Agent name shown in the "Used References" section
- Agent selector button shows current agent

**Technical details:**
- Agents defined in `.github/agents/` directory
- Instructions loaded from agent markdown files
- Agent cache: `AgentCache` service
- Instructions prepended before all other context

---

### 3. Prompt Variables (Template Substitution)

**What it is:** Variables in prompts that are automatically replaced with current workspace values.

**Supported variables:**

**File Context Variables:**
- `${file}` - Full path to the current file
- `${fileBasename}` - Filename with extension
- `${fileDirname}` - Directory of the current file
- `${fileBasenameNoExtension}` - Filename without extension
- `${activeNoteContent}` - Full content of active note

**Workspace Variables:**
- `${workspaceFolder}` - Path to the vault
- `${workspaceFolderBasename}` - Name of the vault

**Selection Variables:**
- `${selection}` - Currently selected text in the editor
- `${selectedText}` - Same as `${selection}`

**Date/Time Variables:**
- `${date}` - Current date (YYYY-MM-DD)
- `${time}` - Current time (localized)
- `${datetime}` - Current date and time (ISO 8601)

**Input Variables:**
- `${input:name:description}` - Prompt for user input
- `${input:name:description|option1|option2}` - Input with default options

**Legacy Variables (for backward compatibility):**
- `{activeNote}` - Same as `${file}`
- `{activeNoteName}` - Same as `${fileBasenameNoExtension}`
- `{activeNoteContent}` - Same as `${activeNoteContent}`

**How it works:**
1. Variables are processed by `PromptProcessor.processVariables()`
2. Current workspace state is read
3. Variables are replaced with actual values
4. Result is included in the message

**Example usage:**
```
Analyze this function in ${fileBasename}:

${selection}

What does it do?
```

Becomes:
```
Analyze this function in mycode.md:

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

What does it do?
```

**Technical details:**
- Service: `PromptProcessor` (`src/ui/ChatView/PromptProcessor.ts`)
- VS Code compatible syntax
- Variables processed before message is sent
- Failed reads replaced with `[No active file]` or `[Could not read note content]`

---

### 4. Inline Note References (Wikilinks)

**What it is:** Include content from other notes by using wikilink syntax in your message.

**Syntax:**
- `[[filename]]` - Include content from filename.md
- `[[filename|display text]]` - Include with custom display text
- `[link text](path/to/file.md)` - Standard markdown link syntax

**How it works:**
1. Type wikilinks directly in your chat message
2. `extractInlineNoteReferences()` finds all `[[...]]` patterns
3. Content from each referenced file is loaded
4. Content is prepended to your message

**Format:**
```
--- Content of "referenced-note.md" ---
[Full content of the referenced note]
--- End of "referenced-note.md" ---

User message with [[referenced-note]]
```

**Example:**
```
Compare the approaches in [[solution-a]] and [[solution-b]]
```

The AI will receive the full content of both notes plus your question.

**Visual indicators:**
- Referenced files shown in "Used References" section

**Technical details:**
- Uses Obsidian's link resolution (handles aliases, partial paths)
- Processed by `extractInlineNoteReferences()` and `PromptProcessor.resolveMarkdownFileLinksWithTracking()`
- Supports both wikilinks and standard markdown links
- Relative paths resolved from prompt file location

---

### 5. Inline Chip References (# Picker)

**What it is:** Quick note attachment using the `#` trigger in the input field.

**How it works:**
1. Type `#` in the chat input
2. Autocomplete dropdown appears with matching files
3. Select a file to insert as an inline chip
4. Chip appears as a pill in the input
5. When sent, chip content is included in the message

**UI Features:**
- VS Code-style picker with file names and paths
- Keyboard navigation (Arrow keys, Enter, Escape)
- Click to select
- Shows first 10 matching results
- Fuzzy search on file name and path

**Format:**
```
--- Content of "chipfile.md" ---
[Full content of the chipped file]
--- End of "chipfile.md" ---

[Your message]
```

**Visual indicators:**
- Chips displayed as removable pills in input
- Files shown in "Used References" section

**Technical details:**
- Service: `ContextPicker` (`src/ui/ChatView/pickers/ContextPicker.ts`)
- Contenteditable div for inline chips
- Chips stored as `data-file-path` attributes
- Content read when message is sent

---

### 6. Explicit Attachments ("Add Context..." Button)

**What it is:** Manual file attachment via the "Add Context..." button.

**How it works:**
1. Click "Add Context..." button below the input
2. File picker modal appears
3. Search and select files to attach
4. Files appear as chips next to the button
5. Content included when message is sent

**Format:**
```
--- Content of "attached-file-1.md" ---
[Full content]
--- End of "attached-file-1.md" ---

--- Content of "attached-file-2.md" ---
[Full content]
--- End of "attached-file-2.md" ---

User question about the above note(s):
[Your message]
```

**Visual indicators:**
- Attachment chips with remove (×) buttons
- Files shown in "Used References" section

**When to use:**
- Need to reference a file that isn't open
- Want to include only specific files, not all open tabs
- Implicit context would be too large or unfocused

**Technical details:**
- Modal: `NoteSuggestModal`
- Storage: `attachedNotes` array in `CopilotChatView`
- Chips rendered in `attachmentsContainer`
- Cleared after message is sent

---

### 7. Web Page Fetching (#fetch)

**What it is:** Include content from web pages in your message.

**Syntax:**
```
#fetch https://example.com/article
```

**How it works:**
1. Type `#fetch URL` in your message
2. `PromptProcessor.processFetchReferences()` detects the pattern
3. Web page is fetched and converted to markdown
4. Content is prepended to your message
5. Reference replaced with `[Web: URL]` in display

**Format:**
```
--- Content from "Page Title" (https://example.com) ---
[Markdown content of the web page]
--- End of web page content ---

User message with [Web: https://example.com]
```

**Example:**
```
#fetch https://docs.example.com/api Compare this API design to our implementation
```

**Visual indicators:**
- URL hostname shown in "Used References" section

**Technical details:**
- Uses `VaultOperations.fetchWebPage()`
- Web pages converted to markdown
- Failed fetches show error in context
- Multiple URLs can be fetched in one message

---

## How Context is Combined

When you send a message, context is gathered and combined in this specific order:

### Context Gathering Order

1. **Agent Instructions** (if agent selected)
2. **Web Page Content** (#fetch URLs)
3. **Inline Note References** ([[wikilinks]])
4. **Inline Chip References** (# picker)
5. **Explicit Attachments** ("Add Context..." button)
6. **Implicit Workspace Context** (selected text, active file, open tabs)
7. **Your Message**

### Final Message Structure

```
[Agent Instructions for "Agent Name"]
{agent instructions}
[End Agent Instructions]

--- Content from "webpage.com" (https://webpage.com) ---
{web page content}
--- End of web page content ---

--- Content of "[[wikilinked-note]]" ---
{wikilink content}
--- End of "[[wikilinked-note]]" ---

--- Content of "#chipped-note" ---
{chip content}
--- End of "#chipped-note" ---

--- Content of "attached-note.md" ---
{attached content}
--- End of "attached-note.md" ---

--- Selected Text from "current-file.md" ---
{selected text}
--- End of Selected Text ---

--- Active File: "current-file.md" ---
{active file content}
--- End of Active File ---

--- Other Open Tabs (2) ---

File: "tab1"
{tab1 content}

File: "tab2"
{tab2 content}
--- End of Open Tabs ---

User message:
{your actual message with variables replaced}
```

### Important Notes

- **Variables are processed first** - `${...}` variables are replaced before any context is attached
- **Explicit context takes precedence** - Manually attached files come before implicit context
- **Active file not duplicated** - If the active file is explicitly attached, it won't be included again in implicit context
- **All mechanisms can be combined** - Use as many or as few as needed for your use case

---

## Practical Examples

### Example 1: Code Review with Multiple Context Sources

**Input:**
```
Agent: Code Reviewer selected
Open tabs: api.ts, tests.spec.ts
Message: Review this implementation [[design-doc]] #fetch https://bestpractices.dev/api-design
```

**Context included:**
1. Code Reviewer agent instructions
2. Content from design-doc.md
3. Content from https://bestpractices.dev/api-design
4. Content of api.ts (active file)
5. Content of tests.spec.ts (open tab)

### Example 2: Documentation with Variables

**Input:**
```
File: mymodule.ts (active)
Selection: class UserService { ... }
Message: Document this class from ${fileBasename}:

${selection}

Follow our style guide [[docs/style-guide]]
```

**Context included:**
1. Content from docs/style-guide.md
2. Active file content (mymodule.ts)
3. Message with variables replaced:
   ```
   Document this class from mymodule.ts:
   
   class UserService { ... }
   
   Follow our style guide [[docs/style-guide]]
   ```

### Example 3: Research with Explicit Attachments

**Input:**
```
Add Context: research-paper.md, data-analysis.md
Message: Summarize the findings and suggest next steps
```

**Context included:**
1. Content of research-paper.md
2. Content of data-analysis.md
3. Message: "Summarize the findings and suggest next steps"

(Note: Implicit context still included unless you close all tabs)

---

## Automatic Context Gathering (Detailed)

### Automatic Context Gathering

This section provides detailed information about the automatic workspace context feature.

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
- Explicit attachments are not duplicated in implicit context

---

## Complete Technical Reference

### Processing Pipeline

When a message is sent, context is processed in this order:

```
User sends message
    ↓
1. Process #fetch URL references → fetchedContext
    ↓
2. Extract [[wikilinks]] → inlineNoteContext
    ↓
3. Extract # chip references → chipContext
    ↓
4. Read attached files → attachmentContext
    ↓
5. Gather implicit context → implicitContext
    ↓
6. Process variables ${...} → processedMessage
    ↓
7. Combine all context + processedMessage → fullMessage
    ↓
8. Send fullMessage to AI
    ↓
9. Display references in UI
```

### Key Services and Their Roles

| Service | Location | Purpose |
|---------|----------|---------|
| `PromptProcessor` | `src/ui/ChatView/PromptProcessor.ts` | Variable substitution, #fetch processing, wikilink resolution |
| `ContextAugmentation` | `src/ui/ChatView/ContextAugmentation.ts` | Implicit workspace context gathering |
| `ContextPicker` | `src/ui/ChatView/pickers/ContextPicker.ts` | # trigger autocomplete UI |
| `NoteSuggestModal` | `src/ui/ChatView/modals/NoteSuggestModal.ts` | "Add Context..." file picker |
| `MessageRenderer` | `src/ui/ChatView/renderers/MessageRenderer.ts` | Display used references |
| `CopilotChatView` | `src/ui/ChatView/CopilotChatView.ts` | Main chat UI, context orchestration |
| `AgentCache` | `src/copilot/customization/AgentCache.ts` | Agent instruction loading |

### Context Methods in CopilotChatView

| Method | Purpose |
|--------|---------|
| `sendMessage()` | Main orchestration - combines all context types |
| `extractInlineNoteReferences()` | Find [[wikilinks]] in message |
| `openNotePicker()` | Open "Add Context..." modal |
| `attachNote()` | Add file to attachedNotes array |
| `renderAttachments()` | Display attachment chips |
| `insertInlineChip()` | Add # picker result as chip |

### Variables Available in PromptProcessor

| Variable | Source | Type |
|----------|--------|------|
| `${file}` | `workspace.getActiveFile().path` | String |
| `${fileBasename}` | `workspace.getActiveFile().name` | String |
| `${fileDirname}` | `workspace.getActiveFile().parent.path` | String |
| `${fileBasenameNoExtension}` | `workspace.getActiveFile().basename` | String |
| `${activeNoteContent}` | `vault.cachedRead(activeFile)` | String |
| `${workspaceFolder}` | `vault.adapter.basePath` | String |
| `${workspaceFolderBasename}` | `vault.getName()` | String |
| `${selection}` | `editor.getSelection()` | String |
| `${selectedText}` | `editor.getSelection()` | String |
| `${date}` | `new Date().toISOString().split('T')[0]` | String |
| `${time}` | `new Date().toLocaleTimeString()` | String |
| `${datetime}` | `new Date().toISOString()` | String |

---

## Privacy and Performance

### What's Included in Implicit Context

- Only markdown (`.md`) files currently open in your workspace
- File paths and content
- Text selected in the active editor

### What's NOT Included

- Closed tabs or files
- Non-markdown files (unless explicitly attached)
- Files outside your vault
- Files in hidden folders (unless explicitly open)
- Private or encrypted content (read errors shown)

### Performance Considerations

**Context gathering speed:**
- Implicit context gathering is fast (milliseconds)
- Variable processing is instant
- File reading depends on file size
- Web fetching depends on network speed

**Message size impact:**
- Large context increases AI response time
- API providers have token limits (128k-200k tokens typically)
- ~750 words ≈ ~1000 tokens
- Monitor total context size with multiple mechanisms

**Optimization tips:**
1. Close unnecessary tabs (reduces implicit context)
2. Use explicit attachments for better control
3. Limit open files to relevant ones
4. Avoid very large files (> 10,000 lines)
5. Use variables instead of full content when possible

---

## Configuration and Settings

### Current Settings

All context mechanisms are currently enabled by default with no user configuration required.

### Future Configuration Options

Planned enhancements include:

- **Toggle for implicit context** - Enable/disable automatic workspace context
- **File type filters** - Choose which file types to include  
- **Max context size limits** - Auto-truncate or summarize large context
- **Smart context selection** - AI-powered selection of most relevant tabs
- **Context preview** - See what will be sent before sending
- **Per-agent context settings** - Different context rules for different agents

---

## Troubleshooting

### Implicit Context Not Being Included

**Symptoms:** Expected files not appearing in "Used References"

**Solutions:**
1. Verify files are actually open as tabs (check tab bar)
2. Check that files are markdown (`.md`) format
3. Ensure files are readable (not encrypted or locked)
4. Check browser console for error messages (`Ctrl+Shift+I`)
5. Try closing and reopening the file

### Variables Not Being Replaced

**Symptoms:** `${varname}` appears literally in AI response

**Solutions:**
1. Check variable syntax: `${varname}` not `{varname}` (except legacy)
2. Verify the source exists (active file, selection, etc.)
3. Check for typos in variable name
4. Review console for processing errors

**Common mistakes:**
- `{file}` instead of `${file}` (use `$` prefix)
- `${fileName}` instead of `${fileBasename}` (check exact name)
- Using variables when no file is active

### Wikilinks Not Working

**Symptoms:** `[[notename]]` appears literally, content not included

**Solutions:**
1. Verify note exists in vault
2. Check link syntax: `[[notename]]` or `[[path/to/note]]`
3. Try full path if partial doesn't work
4. Ensure file extension is `.md`
5. Check for typos in note name

### # Picker Not Appearing

**Symptoms:** Typing `#` doesn't show dropdown

**Solutions:**
1. Type `#` followed by a letter (not space)
2. Ensure cursor is in the input field
3. Check that files exist in vault
4. Try typing more characters to filter

### Too Much Context

**Symptoms:** Slow responses, unfocused answers, token limit errors

**Solutions:**
1. **Close unnecessary tabs** - Reduces implicit context significantly
2. **Use explicit attachments** - Include only specific files
3. **Remove wikilinks** - Don't include [[refs]] if not needed
4. **Clear chips** - Remove # chips before sending
5. **Break into smaller queries** - Focus questions with less context

### Unexpected Context

**Symptoms:** Files you didn't intend to include appear in references

**Solutions:**
1. **Check open tabs** - All open markdown tabs are included
2. **Review attachments** - Look at "Add Context..." chips
3. **Look for wikilinks** - `[[links]]` in your message
4. **Check # chips** - Inline chips in input field
5. **Review "Used References"** - Shows all context sources

### File Reading Errors

**Symptoms:** `[Could not read: filename]` in context

**Solutions:**
1. Check file permissions
2. Ensure file is not corrupted
3. Try closing and reopening the file
4. Check for file locks (other apps using file)
5. Review console for specific error messages

### Performance Issues

**Symptoms:** Long delays before AI response

**Solutions:**
1. Reduce number of open tabs
2. Close large files (> 5000 lines)
3. Use fewer context mechanisms simultaneously
4. Check network speed (for #fetch and API calls)
5. Monitor total context size

---

## Advanced Usage

### Combining Multiple Context Sources

**Example: Comprehensive code review**
```
Agent: Code Reviewer
Open tabs: api.ts, api.spec.ts, types.ts
Attached: [[architecture-decisions]]
Message: Review the API implementation using our coding standards #fetch https://company.com/standards
```

**Result:** AI receives:
- Code Reviewer instructions
- Content from architecture-decisions.md
- Web page from company standards
- All three open files (api.ts, api.spec.ts, types.ts)
- Your message

### Using Variables with Other Context

**Example: Templated analysis**
```
Selection: function calculateTotal() {...}
Message: Analyze this function from ${fileBasename}:

${selection}

Compare it to the pattern in [[design-patterns/calculator]]
```

**Result:** Variables replaced first, then wikilink content added

### Strategic Context Management

**For large codebases:**
1. Use explicit attachments instead of keeping many files open
2. Leverage variables for file metadata without full content
3. Use agents to provide context rules once instead of repeatedly
4. Combine wikilinks for documentation with open tabs for code

**For research:**
1. Keep all reference materials open as tabs
2. Use #fetch for web sources
3. Use wikilinks to cross-reference your own notes
4. Select specific passages for focused analysis

---

## See Also

### Related Documentation

- [README.md](../README.md) - Main plugin documentation
- [AGENTS.md](../AGENTS.md) - Obsidian plugin development guide
- [AUTHORING.md](AUTHORING.md) - Creating custom agents and prompts

### Related Features

- **Agents** - Custom AI behavior instructions
- **Prompts** - Reusable prompt templates  
- **Skills** - AI tools and functions
- **MCP Servers** - External tool integrations
- **Voice Chat** - Voice-based interactions

### Context-Related UI Elements

- **Add Context Button** - Manual file attachment (`openNotePicker()`)
- **# Picker** - Inline note chip insertion (`ContextPicker`)
- **Used References Panel** - Shows all context sources (`MessageRenderer`)
- **Agent Selector** - Choose agent instructions (`agentSelectorEl`)

---

## Summary

Vault Copilot provides **seven powerful context mechanisms** that work together seamlessly:

1. **Workspace Context** (automatic) - Selected text, active file, open tabs
2. **Agent Instructions** (automatic when selected) - Custom AI behavior
3. **Prompt Variables** - Template substitution with `${...}`
4. **Inline Note References** - `[[wikilinks]]` for note content
5. **Inline Chip References** - `#` picker for quick attachment
6. **Explicit Attachments** - "Add Context..." button
7. **Web Page Fetching** - `#fetch URL` for web content

All mechanisms combine in a specific order, can be used together, and are clearly indicated in the "Used References" section. This provides maximum flexibility for providing the AI with exactly the context it needs to generate the best possible responses.
