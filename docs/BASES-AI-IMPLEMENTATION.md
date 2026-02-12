# Bases AI: Full Implementation Guide

## Overview

Complete implementation of the Bases AI tool pack for Obsidian Vault Copilot. Provides 6 AI-powered tools for creating, reading, querying, and managing Obsidian Bases through natural language chat.

## Architecture

```
┌─────────────────────────────────────────┐
│         User Chat Interface              │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   6 Bases AI Tools (via Copilot SDK)    │
├─────────────────────────────────────────┤
│ • create_base                            │
│ • read_base                              │
│ • query_base                             │
│ • add_base_records                       │
│ • update_base_records                    │
│ • evolve_base_schema                     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      BasesToolHandlers Layer            │
│  (Orchestration & validation)            │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│        Core Bases Modules                │
├─────────────────────────────────────────┤
│ • BasesParser - Parse .base files       │
│ • BasesYamlGenerator - Generate YAML    │
│ • BasesQueryEngine - Filter evaluation  │
│ • BasesMutator - Batch updates          │
│ • BasesDiscovery - Find .base files     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      Vault Operations (Obsidian API)    │
│  create/read/update files & folders     │
└─────────────────────────────────────────┘
```

## Core Modules

### 1. BasesParser.ts
**Purpose:** Parse .base markdown files into typed BaseSchema objects

**Key Functions:**
- `parseBaseFile(content: string): BaseSchema | null`
- `validateBaseSchema(schema: BaseSchema): boolean`
- `summarizeBaseSchema(schema: BaseSchema): string`

**What it does:**
- Extracts YAML frontmatter from .base files
- Parses filters, properties, formulas, summaries, views
- Validates structure

### 2. BasesYamlGenerator.ts
**Purpose:** Generate valid .base YAML from structured specifications

**Key Functions:**
- `generateBaseYaml(spec: BaseSpec): string`
- `validateBaseSpec(spec: BaseSpec): string | null`
- `createDefaultBaseSpec(name, properties, description): BaseSpec`

**What it does:**
- Converts BaseSpec objects to valid YAML
- Includes all sections: filters, properties, views
- Validates before generation
- Round-trip tested with parser

### 3. BasesQueryEngine.ts
**Purpose:** Evaluate Base filters against vault notes

**Key Functions:**
- `queryBase(app, schema, limit): Promise<QueryResult[]>`
- `formatQueryResults(results, schema): string`

**What it does:**
- Scans all markdown files in vault
- Parses frontmatter from each note
- Evaluates filters (AND logic)
- Returns matching notes with properties
- Formats as markdown table

**Supported Operators:**
- `is`, `is not` - Exact match/mismatch
- `contains`, `does not contain` - String/array containment
- `starts with`, `ends with` - String prefix/suffix
- `is empty`, `is not empty` - Null/undefined checks
- `greater than`, `less than` - Numeric comparison
- Special: `file.folder` filter handling

### 4. BasesMutator.ts
**Purpose:** Batch frontmatter updates with dry-run support

**Key Functions:**
- `previewPropertyUpdates(app, schema, updates): Promise<MutationPreview>`
- `applyPropertyUpdates(app, schema, updates): Promise<MutationResult>`
- `formatMutationPreview(preview): string`
- `formatMutationResult(result): string`

**What it does:**
- Previews which notes will be affected
- Shows current vs. proposed values
- Applies updates atomically per-note
- Reports successes and errors

### 5. BasesDiscovery.ts
**Purpose:** Find and catalog .base files in the vault

**Key Functions:**
- `listBases(app, includeSchema): Promise<BaseInfo[]>`
- `findBaseByName(app, name): Promise<BaseInfo | null>`
- `formatBasesList(bases, includeDetails): string`

**What it does:**
- Scans vault for *.base files
- Fuzzy name matching
- Optional schema parsing
- Formatted listing for chat

## Tools Reference

### Tool 1: create_base

**Description:** Create a new Obsidian Base from natural language description

**Parameters:**
- `path` (required) - File path for new .base file
- `properties` (required) - Array of property definitions
- `name` (optional) - Display name
- `description` (optional) - Natural language description
- `filters` (optional) - Filter conditions
- `create_sample_notes` (optional) - Create 2-3 sample notes

**Example Usage:**
```
User: "Create a CRM Base at CRM/contacts.base with name, email, phone, and status fields"

AI calls create_base with:
{
  "path": "CRM/contacts.base",
  "name": "Contacts",
  "properties": [
    {"name": "name", "type": "text", "width": 200},
    {"name": "email", "type": "text", "width": 250},
    {"name": "phone", "type": "text", "width": 150},
    {"name": "status", "type": "text", "width": 100}
  ],
  "create_sample_notes": true
}
```

**Returns:** Success message with file path and optional sample note creation results

---

### Tool 2: read_base

**Description:** Read a Base's view definition or list all Bases

**Parameters:**
- `base_path` (optional) - Path to specific Base. If omitted, lists all Bases
- `include_schema_details` (optional) - Include full schema in list mode

**Example Usage:**

**Single Base:**
```
User: "Show me the schema of my projects Base"

AI calls read_base with:
{ "base_path": "projects.base" }

Returns:
**Base: projects.base**

**Filters (2):**
  - status is not archived
  - file.folder is Projects

**Properties (4):**
  - status, type: text, width: 120
  - priority, type: text, width: 100
  - assignee, type: text, width: 150
  - due_date, type: date, width: 120

**Views (1):**
  - All Projects (table)
```

**List Mode:**
```
User: "What Bases do I have?"

AI calls read_base with: {}

Returns:
Found 3 Base(s) in the vault:

📊 **Projects**
   Path: projects.base

📊 **Contacts**
   Path: CRM/contacts.base

📊 **Tasks**
   Path: tasks.base
```

---

### Tool 3: query_base

**Description:** Query notes matching a Base's filters

**Parameters:**
- `base_path` (required) - Path to .base file
- `limit` (optional) - Max results (default: 50)

**Example Usage:**
```
User: "What high-priority projects are in my projects Base?"

AI calls query_base with:
{ "base_path": "projects.base", "limit": 50 }

Returns:
Found 2 record(s) in projects.base:

| Note | status | priority | assignee | due_date |
| --- | --- | --- | --- | --- |
| API Integration | active | medium | Bob | 2026-02-28 |
| Website Redesign | active | high | Alice | 2026-03-01 |
```

---

### Tool 4: add_base_records

**Description:** Create new notes that appear as Base records

**Parameters:**
- `base_path` (required) - Path to .base file
- `records` (required) - Array of {title, properties, content?}
- `folder` (optional) - Target folder (inferred from Base if omitted)

**Example Usage:**
```
User: "Add a new project called Mobile App to my projects Base with high priority assigned to David"

AI calls add_base_records with:
{
  "base_path": "projects.base",
  "records": [{
    "title": "Mobile App",
    "properties": {
      "status": "active",
      "priority": "high",
      "assignee": "David",
      "due_date": "2026-03-15"
    }
  }]
}

Returns:
Successfully created 1 record(s):
- Projects/Mobile App.md
```

---

### Tool 5: update_base_records

**Description:** Update frontmatter on notes matching filters

**Parameters:**
- `base_path` (required) - Path to .base file
- `property_updates` (required) - Object mapping properties to new values
- `preview_only` (optional) - Preview mode (default: true for safety)

**Example Usage:**

**Preview Mode (default):**
```
User: "Mark all Q4 projects as complete"

AI calls update_base_records with:
{
  "base_path": "projects.base",
  "property_updates": { "status": "completed" },
  "preview_only": true
}

Returns:
**Preview: 5 note(s) will be affected**

**Changes:**
  - status → completed

**Affected notes:**
  - API Integration
  - Website Redesign
  - Mobile App
  - Q4 Report
  - Year-end Analysis

*To apply these changes, call update_base_records again with preview_only: false*
```

**Apply Mode:**
```
AI calls again with preview_only: false after user confirms

Returns:
Updated 5 note(s) successfully.

**Successfully updated (5):**
  ✓ Projects/API Integration.md
  ✓ Projects/Website Redesign.md
  ...
```

---

### Tool 6: evolve_base_schema

**Description:** Modify Base schema and optionally backfill

**Parameters:**
- `base_path` (required) - Path to .base file
- `operation` (required) - "add_property", "remove_property", or "rename_property"
- `property_name` (required) - Property to modify
- `new_property_name` (optional) - For rename operation
- `property_type` (optional) - For add operation (default: "text")
- `backfill_value` (optional) - Value to set on all matching notes
- `preview_only` (optional) - Preview mode (default: true)

**Example Usage:**

**Add Property:**
```
User: "Add a priority field to my tasks Base and set it to 'medium' for all existing tasks"

AI calls evolve_base_schema with:
{
  "base_path": "tasks.base",
  "operation": "add_property",
  "property_name": "priority",
  "property_type": "text",
  "backfill_value": "medium",
  "preview_only": true
}

Returns preview, then applies with preview_only: false
```

**Rename Property:**
```
User: "Rename 'status' to 'state' in my CRM Base"

AI calls evolve_base_schema with:
{
  "base_path": "CRM/contacts.base",
  "operation": "rename_property",
  "property_name": "status",
  "new_property_name": "state",
  "preview_only": false
}
```

## Implementation Details

### Tool Registration Pattern

All tools follow this pattern:

1. **Define in BasesToolDefinitions.ts:**
   - Add to `BASES_TOOL_NAMES`
   - Add to `BASES_TOOL_DESCRIPTIONS`
   - Add to `BASES_TOOL_JSON_SCHEMAS`
   - Define parameter interface

2. **Implement in BasesToolHandlers.ts:**
   - Create handler function
   - Validate inputs
   - Call core modules
   - Format results
   - Handle errors

3. **Register in GitHubCopilotCliService:**
   - Import handler and types
   - Add `defineTool()` call in `createObsidianTools()`

4. **Add to ToolCatalog:**
   - Add to `BUILTIN_TOOLS` array
   - Set display name and description

### Safety Features

**Preview by Default:**
- `update_base_records` - preview_only: true by default
- `evolve_base_schema` - preview_only: true by default

**User Confirmation:**
- Preview shows affected notes
- Requires explicit confirmation to apply
- Clear messaging about impact

**Error Handling:**
- Per-note error isolation (one failure doesn't stop others)
- Detailed error messages
- Success/error counts in results

### File Structure

```
src/copilot/bases/
├── types.ts                    - Type definitions
├── BasesParser.ts              - Parse .base files
├── BasesYamlGenerator.ts       - Generate .base YAML
├── BasesQueryEngine.ts         - Query engine with filters
├── BasesMutator.ts             - Batch update operations
├── BasesDiscovery.ts           - Find .base files
├── BasesToolDefinitions.ts     - Tool schemas
└── BasesToolHandlers.ts        - Tool implementations

src/tests/copilot/bases/
├── BasesParser.test.ts         - Parser tests (15)
└── BasesYamlGenerator.test.ts  - Generator tests (11)

test-vault/
├── projects.base               - Sample Base
└── Projects/                   - Sample notes
    ├── Website Redesign.md
    ├── API Integration.md
    └── Old Database Migration.md
```

## Testing

### Unit Tests
```bash
npm test -- src/tests/copilot/bases/
```

**Coverage:**
- BasesParser: 15 tests (parsing, validation, summarization)
- BasesYamlGenerator: 11 tests (generation, validation, round-trip)
- **Total: 26 tests, 24 passing**

**Round-Trip Tests:**
Generate → Parse → Compare ensures generated YAML is valid

### Manual Testing via Chat

**Create Base:**
- "Create a project tracker Base with title, status, priority, and due date fields"

**List Bases:**
- "What Bases do I have?"

**Read Base:**
- "Show me the schema of the projects Base"

**Query Base:**
- "What are the active projects?"

**Add Records:**
- "Add a new project called X with high priority"

**Update Records:**
- "Mark all Q4 items as complete" (preview first, then confirm)

**Evolve Schema:**
- "Add a tags field to my projects Base"

## Migration from POC

The POC included:
- BasesParser (✓ kept)
- BasesQueryEngine (✓ kept)
- query_base tool (✓ kept)
- add_base_records tool (✓ kept)

Full implementation adds:
- BasesYamlGenerator (new)
- BasesDiscovery (new)
- BasesMutator (new)
- create_base tool (new)
- read_base tool (new)
- update_base_records tool (new)
- evolve_base_schema tool (new)

## Next Steps

### Production Readiness (Per Roadmap):
1. **Pro Entitlement Gating** - Conditional registration based on license
2. **Tracing Integration** - Tool calls logged in TracingService
3. **Edge Case Hardening** - Empty Bases, large Bases (1000+ notes), special characters
4. **Error Recovery** - Validation and auto-fix for invalid YAML
5. **Extension Packaging** - Package as Pro extension for marketplace

### Enhancement Opportunities:
- Formula evaluation (currently metadata-only)
- Date parsing and comparison
- Regex filter support
- OR boolean groups (currently AND only)
- Undo support for mutations
- Pagination for large query results

## Usage Examples

### Example 1: Complete Workflow

```
User: "Create a book tracking Base"

1. AI calls create_base:
   - Generates .base file with title, author, status, rating properties
   - Creates sample notes

User: "What books do I have?"

2. AI calls query_base:
   - Returns table of all books

User: "Add 'The Hobbit' by Tolkien with 5-star rating"

3. AI calls add_base_records:
   - Creates note with frontmatter

User: "Mark all 5-star books as favorites"

4. AI calls update_base_records (preview):
   - Shows which books would be affected

User: "Yes, apply it"

5. AI calls update_base_records (apply):
   - Updates frontmatter on matching notes

User: "Add a genre field to my books Base"

6. AI calls evolve_base_schema:
   - Modifies Base schema
   - Optionally backfills values
```

### Example 2: Project Management

```
User: "Create a project tracker with name, status, priority, assignee, and due date"

AI: Creates projects.base

User: "What active projects do we have?"

AI: Queries and shows filtered table

User: "Assign all unassigned projects to Alice"

AI: Previews update → User confirms → Applies changes

User: "Add a 'budget' field to track project costs"

AI: Evolves schema, adds property column
```

## Technical Notes

### YAML Generation
- Follows Obsidian Bases syntax exactly
- Properties sorted by position
- Views default to "table" type
- Filters use expression strings (evaluated by Obsidian)

### Filter Evaluation
- POC implements basic operators
- Full implementation would need Bases expression parser
- Current: String matching, numeric comparison
- Future: Date math, regex, boolean OR groups

### Frontmatter Handling
- Preserves existing properties not in update set
- Handles strings, numbers, booleans, arrays
- YAML-safe formatting
- Line-by-line parsing for compatibility

### Performance
- Query limit: 50 notes default, configurable
- Mutation limit: 1000 notes max
- Vault scan: O(n) where n = total markdown files
- No caching (stateless operations)

## Troubleshooting

### Common Issues

**"Base file not found"**
- Check path uses correct extension (.base not .md)
- Path is relative to vault root
- Use read_base list mode to see all Bases

**"No matching records"**
- Verify filters in Base definition
- Check note frontmatter has required properties
- Use read_base to see Base's filter configuration

**"Failed to create note"**
- Check folder exists or will be created
- Verify no duplicate note names
- Check file system permissions

## License

Part of Obsidian Vault Copilot - MIT License
