# POC: Reading Data from Obsidian Bases

## Overview

This Proof of Concept demonstrates the ability to read and parse data from Obsidian Bases (.base files).

## What are Bases?

**Bases** are a feature introduced in Obsidian 1.9 that provides a local-first structured view layer. Key characteristics:

- A `.base` file is a **markdown file** containing YAML frontmatter that defines a view
- The file contains **NO data** - only the view definition (filters, properties, formulas, summaries, views)
- The actual data comes from vault notes with frontmatter properties that match the Base's schema
- The structured view only materializes when Obsidian renders the Base

## POC Components

### 1. Type Definitions (`src/copilot/bases/types.ts`)

Defines TypeScript interfaces for:
- `BaseSchema` - Complete Base schema parsed from a .base file
- `BaseFilter` - Filter conditions
- `BaseProperty` - Property column configuration
- `BaseView` - View configuration (table, card, list, etc.)
- `QueryResult` - Results from querying a Base
- And more...

### 2. Parser (`src/copilot/bases/BasesParser.ts`)

Core functionality:
- `parseBaseFile(content: string)` - Parse .base file content into a BaseSchema object
- `validateBaseSchema(schema: BaseSchema)` - Validate schema structure
- `summarizeBaseSchema(schema: BaseSchema)` - Get human-readable summary

### 3. Sample .base File (`test-vault/projects.base`)

Example Base file with:
- Filters (e.g., exclude archived items)
- Properties (status, priority, assignee, due_date)
- Summaries (count aggregations)
- Views (table view with sorting)

### 4. Demo Script (`poc-read-base.mjs`)

Command-line tool to demonstrate reading and displaying Base data.

## Usage

### Run the Demo Script

```bash
node poc-read-base.mjs test-vault/projects.base
```

This will:
1. Read the .base file
2. Parse the YAML frontmatter
3. Display the parsed schema in a readable format

### Run Unit Tests

```bash
npm test -- src/tests/copilot/bases/BasesParser.test.ts
```

The tests verify:
- Parsing valid .base files with all sections
- Parsing minimal .base files
- Handling invalid input
- Schema validation
- Schema summarization

## Example Output

```
📖 Reading Base file: test-vault/projects.base

📊 Base Schema Contents:

============================================================

🔍 FILTERS:
  1. status is not archived
  2. file.folder is Projects

📋 PROPERTIES:
  • status
    - Width: 120px
    - Position: 0
  • priority
    - Width: 100px
    - Position: 1
  • assignee
    - Width: 150px
    - Position: 2
  • due_date
    - Width: 120px
    - Position: 3

📊 SUMMARIES:
  • priority:
    - count

👁️  VIEWS:
  1. "All Projects" (table)
     Sort by: priority asc

============================================================

✅ Successfully read and parsed Base file!

💡 Key Insight: The .base file contains ONLY the view definition.
   It has NO data - data comes from vault notes with frontmatter.
```

## Key Insights

### What This POC Demonstrates

1. **.base files are just markdown** - They can be read and parsed like any other markdown file
2. **View definition, not data** - The Base file only contains the schema/structure, not actual records
3. **YAML frontmatter** - All Base configuration is in YAML frontmatter
4. **Multiple sections** - A Base can have filters, properties, formulas, summaries, and views

### What's NOT in This POC

- **Querying vault notes** - This POC only reads the Base definition, not the actual data
- **Formula evaluation** - Formulas are shown but not computed
- **Creating Bases** - Only reading, not generating new .base files
- **Modifying records** - No mutation of vault notes

## Next Steps

To build on this POC, you could:

1. **Query Engine** - Scan vault notes and apply Base filters to find matching records
2. **YAML Generator** - Create new .base files from structured input
3. **Record Mutation** - Update frontmatter properties on vault notes
4. **Schema Evolution** - Add/remove/rename properties in Base definitions

## Technical Notes

- Uses Obsidian's built-in `parseYaml` function (mocked in tests)
- Type-safe with TypeScript interfaces
- Comprehensive unit tests with 100% passing
- Minimal dependencies
- Works in both Node.js and Obsidian environments

## License

This POC is part of the Obsidian Vault Copilot project.
