# Bases AI Tools - Quick Reference

## The 6 Tools

### 1. create_base
**Create new Bases from natural language**
- "Create a CRM with name, email, status"
- "Make a book tracker Base"

### 2. read_base
**Read schema or list all Bases**
- "What Bases do I have?"
- "Show me the projects Base schema"

### 3. query_base
**Query notes matching filters**
- "What active projects do I have?"
- "Show me all high-priority items"

### 4. add_base_records
**Create notes matching Base schema**
- "Add a new project called X"
- "Create 3 sample contacts"

### 5. update_base_records
**Bulk frontmatter updates (with preview)**
- "Mark all Q4 projects as complete"
- "Assign unassigned tasks to Alice"

### 6. evolve_base_schema
**Modify Base schema (with backfill)**
- "Add a priority field to my tasks"
- "Rename status to state in CRM"
- "Remove the 'notes' column"

## Key Concepts

### Base = View Definition, Not Data
- `.base` file contains YAML frontmatter only
- Defines filters, properties, formulas, views
- NO data stored in the Base file
- Data lives in vault notes' frontmatter

### Query Flow
1. Read `.base` file → extract filters
2. Scan vault notes → parse frontmatter
3. Evaluate filters → find matches
4. Format results → return table

### Mutation Flow
1. Query matching notes (dry-run)
2. Preview changes → show affected notes
3. User confirmation
4. Apply updates atomically
5. Report results

## Safety Features

✅ **Preview by default** - update_base_records and evolve_base_schema
✅ **User confirmation** - Shows impact before applying
✅ **Per-note isolation** - One error doesn't stop others
✅ **Clear error messages** - Actionable feedback
✅ **Validation** - Specs validated before generation

## Modules

- **BasesParser** - Parse .base → BaseSchema
- **BasesYamlGenerator** - BaseSpec → YAML
- **BasesQueryEngine** - Filter evaluation
- **BasesMutator** - Batch updates
- **BasesDiscovery** - Find .base files
- **BasesToolHandlers** - Tool orchestration

## Example Workflow

```
1. "Create a project tracker"
   → create_base generates projects.base

2. "What Bases do I have?"
   → read_base lists all Bases

3. "Add 3 sample projects"
   → add_base_records creates notes

4. "What active projects?"
   → query_base scans and filters

5. "Mark project X as complete"
   → update_base_records previews → applies

6. "Add budget field"
   → evolve_base_schema modifies schema
```

## Testing

```bash
# Run unit tests
npm test -- src/tests/copilot/bases/

# Demo scripts
node poc-read-base.mjs test-vault/projects.base
node poc-query-base.mjs
```

## Files

```
src/copilot/bases/       - Core modules (6 files)
src/tests/copilot/bases/ - Unit tests (2 files, 26 tests)
docs/                    - Documentation (4 files)
test-vault/              - Sample Base and notes
```
