# POC Extension: Query and Add Records to Bases

## Overview

This extension to the Bases POC adds the ability to:
1. **Query data** from a Base (find vault notes matching Base filters)
2. **Add records** to a Base (create notes with appropriate frontmatter)
3. **Use via chat** (tools registered for AI interaction)

## What Was Added

### 1. Query Engine (`src/copilot/bases/BasesQueryEngine.ts`)

Scans vault notes and evaluates their frontmatter against a Base's filter definitions.

**Key Functions:**
- `queryBase(app, schema, limit)` - Queries matching notes, returns array of QueryResults
- `formatQueryResults(results, schema)` - Formats results as markdown table

**Supported Filter Operators:**
- `is`, `is not` - Exact match/mismatch
- `contains`, `does not contain` - String/array containment
- `starts with`, `ends with` - String prefix/suffix
- `is empty`, `is not empty` - Null/undefined checks
- `greater than`, `less than` - Numeric comparison
- `file.folder` - Special handling for folder filters

### 2. Tool Definitions (`src/copilot/bases/BasesToolDefinitions.ts`)

Defines two new AI tools:

#### `query_base`
**Purpose:** Query vault notes matching a Base's filters
**Parameters:**
- `base_path` (required): Path to .base file (e.g., "projects.base")
- `limit` (optional): Max results to return (default: 50)

**Returns:** Formatted markdown table with matching notes and their properties

#### `add_base_records`
**Purpose:** Create new vault notes matching a Base's schema
**Parameters:**
- `base_path` (required): Path to .base file that defines schema
- `records` (required): Array of records to create, each with:
  - `title`: Note title/name
  - `properties`: Frontmatter key-value pairs
  - `content` (optional): Note body content
- `folder` (optional): Folder for new notes (defaults to Base's file.folder filter)

**Returns:** List of created notes and any errors

### 3. Tool Handlers (`src/copilot/bases/BasesToolHandlers.ts`)

Implementation of the tool logic:

- `handleQueryBase()` - Reads Base, queries notes, formats results
- `handleAddBaseRecords()` - Creates notes with proper frontmatter and folder placement

### 4. Integration Points

**GitHubCopilotCliService** (`src/copilot/providers/GitHubCopilotCliService.ts`)
- Bases tools added to `createObsidianTools()`
- Registered with `defineTool()` for SDK compatibility

**ToolCatalog** (`src/copilot/tools/ToolCatalog.ts`)
- Bases tools added to `BUILTIN_TOOLS` array
- Visible in UI, enabled by default

## Test Data

### Base Definition
`test-vault/projects.base` - Defines a project tracker with:
- **Filters:** Excludes archived projects, includes only Projects folder
- **Properties:** status, priority, assignee, due_date
- **Views:** Table view sorted by priority

### Sample Notes
1. `test-vault/Projects/Website Redesign.md`
   - status: active, priority: high, assignee: Alice
   - **Matches filters** ✅

2. `test-vault/Projects/API Integration.md`
   - status: active, priority: medium, assignee: Bob
   - **Matches filters** ✅

3. `test-vault/Projects/Old Database Migration.md`
   - status: archived, priority: low, assignee: Charlie
   - **Excluded by filter** ❌ (status=archived)

## Demo Output

```
🎯 POC Demo: Query Base and Add Records

============================================================

📖 Reading Base file: test-vault/projects.base
✅ Base schema loaded
   - 1 filters
   - 4 properties
   - 1 views

🔍 Querying vault notes matching Base filters...

Found 2 matching record(s):

| Note | status | priority | assignee | due_date |
| --- | --- | --- | --- | --- |
| API Integration | active | medium | Bob | 2026-02-28 |
| Website Redesign | active | high | Alice | 2026-03-01 |

============================================================

💡 Key Insights:
   - The .base file defines filters but contains NO data
   - Query engine scans vault notes' frontmatter
   - Only notes matching filters are returned
   - 'Old Database Migration' is excluded (status=archived)

✅ POC Complete - Chat integration ready!
```

## Chat Usage Examples

### Query Example
**User:** "What projects are in my projects Base?"

**AI (using `query_base`):**
```
Found 2 record(s) in projects.base:

| Note | status | priority | assignee | due_date |
| --- | --- | --- | --- | --- |
| API Integration | active | medium | Bob | 2026-02-28 |
| Website Redesign | active | high | Alice | 2026-03-01 |
```

### Add Records Example
**User:** "Add a new project called Mobile App to my projects Base with high priority, assigned to David, due March 15"

**AI (using `add_base_records`):**
```
Successfully created 1 record(s):
- Projects/Mobile App.md
```

The new note would be created with:
```markdown
---
status: active
priority: high
assignee: David
due_date: 2026-03-15
---

# Mobile App
```

## Architecture

```
Chat Message
    ↓
GitHub Copilot SDK
    ↓
GitHubCopilotCliService.createObsidianTools()
    ↓
query_base / add_base_records tools
    ↓
BasesToolHandlers
    ├── handleQueryBase()
    │   ├── Read .base file
    │   ├── Parse schema (BasesParser)
    │   ├── Query notes (BasesQueryEngine)
    │   └── Format results
    └── handleAddBaseRecords()
        ├── Read .base file
        ├── Parse schema
        ├── Build frontmatter
        └── Create notes (VaultOperations)
```

## Key Differences from Full Implementation

This POC provides:
- ✅ Basic filter evaluation (11 operators)
- ✅ Table formatting
- ✅ Folder inference from filters
- ✅ Community edition access

Full implementation would add:
- Formula evaluation (computed columns)
- Date parsing and comparison
- Regex matching
- Nested boolean groups
- Schema validation
- Dry-run/preview for bulk operations
- Pro entitlement gating
- Undo support

## Testing

Run the standalone demo:
```bash
node poc-query-base.mjs
```

Or test through chat (when plugin is loaded):
- "Show me what's in my projects Base"
- "Add a new task to my projects Base"

## Next Steps

This POC demonstrates technical feasibility for:
1. ✅ Reading Base definitions
2. ✅ Querying vault notes based on filters
3. ✅ Adding new records programmatically
4. ✅ Chat integration

Ready for:
- User acceptance testing
- Performance optimization
- Pro edition gating
- Additional operators/features per roadmap
