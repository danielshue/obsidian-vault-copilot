# Engineering roadmap — Bases AI tool pack

> **Scope:** Implementation plan for the Bases AI PRD. Covers architecture, module breakdown, task sequencing, and integration points.
>
> **Prerequisite:** Phase A (Pro Foundation — entitlements service, feature gating) must be in place before Bases AI tools can ship as Pro-only.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│  AI Provider (Copilot SDK / OpenAI / Azure OpenAI)  │
│  ── tool call dispatch ──                           │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│  ToolCatalog                                         │
│  ├── Built-in tools (existing)                       │
│  ├── SkillRegistry tools (extensions)                │
│  ├── MCP tools                                       │
│  └── Bases AI tools (new, Pro-gated)  ◄──────────── │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│  BasesToolHandlers  (src/copilot/tools/bases/)       │
│  ── orchestration layer ──                           │
│  Receives tool calls, validates, delegates           │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│  BasesService  (src/copilot/bases/)                  │
│  ├── BasesYamlGenerator  — NL → .base YAML          │
│  ├── BasesParser         — .base YAML → schema       │
│  ├── BasesQueryEngine    — filter evaluation          │
│  ├── BasesMutator        — batch frontmatter ops      │
│  └── BasesDiscovery      — find .base files in vault  │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│  VaultOperations (existing)                          │
│  ├── create / read / update files                    │
│  ├── patch frontmatter (YAML)                        │
│  └── list / search notes                             │
└─────────────────────────────────────────────────────┘
```

---

## New modules

### `src/copilot/bases/` — Core Bases service

| Module | Responsibility | Key exports |
|---|---|---|
| **`BasesParser.ts`** | Parse `.base` file (markdown) into a typed `BaseSchema` object. Extract the view definition: filters, formulas, properties, summaries, views. The Base file contains no data — only the query/layout definition. | `parseBaseFile(content: string): BaseSchema` |
| **`BasesYamlGenerator.ts`** | Generate valid `.base` view-definition content from structured input. Used by `create_base` and `evolve_base_schema`. | `generateBaseYaml(spec: BaseSpec): string` |
| **`BasesQueryEngine.ts`** | Evaluate a Base's filters against vault notes' frontmatter. Since the Base file contains no data, this module scans actual notes to find matches. Returns matching notes with their properties. | `queryBase(schema: BaseSchema, notes: NoteMetadata[]): QueryResult[]` |
| **`BasesMutator.ts`** | Batch frontmatter operations with dry-run support. Composes on existing `patch_note` / `update_note`. | `previewMutation(...)`, `applyMutation(...)` |
| **`BasesDiscovery.ts`** | Find all `.base` files in the vault. Provide Base name → file path mapping. | `listBases(vault): BaseInfo[]` |
| **`types.ts`** | TypeScript interfaces: `BaseSchema`, `BaseSpec`, `BaseFilter`, `BaseFormula`, `BaseProperty`, `BaseView`, `QueryResult`, `MutationPreview` | Type definitions |

### `src/copilot/tools/bases/` — Tool handlers

| Module | Responsibility |
|---|---|
| **`BasesToolDefinitions.ts`** | Tool names, descriptions, JSON schemas for all 6 Bases AI tools. Follows existing `ToolDefinitions.ts` pattern. |
| **`BasesToolHandlers.ts`** | Handler functions for each tool. Receives parsed arguments, calls BasesService, returns results. |

### Integration points (existing files to modify)

| File | Change |
|---|---|
| `src/copilot/tools/ToolCatalog.ts` | Register Bases AI tools; apply Pro entitlement gate |
| `src/copilot/tools/ToolDefinitions.ts` | Add Bases tool names to `TOOL_NAMES` and `TOOL_CATEGORIES` |
| `src/main.ts` | No changes needed (ToolCatalog handles registration) |

---

## Task breakdown

### Phase B-1: Foundation (week 5)

> Goal: Core parsing and generation modules. No tool integration yet.

| Task | Est. | Notes |
|---|---|---|
| **B1-1** Define `types.ts` — all Base-related interfaces | 0.5d | `BaseSchema`, `BaseSpec`, `BaseFilter`, `BaseFormula`, `BaseProperty`, `BaseView`, `QueryResult` |
| **B1-2** Implement `BasesParser.ts` | 1d | Parse `.base` markdown content → `BaseSchema`. Handle all 5 view-definition sections. Note: the Base file is markdown that defines a view, not a data store. |
| **B1-3** Implement `BasesYamlGenerator.ts` | 1d | `BaseSpec` → valid YAML string. Include validation against known Bases syntax. |
| **B1-4** Implement `BasesDiscovery.ts` | 0.5d | Scan vault for `*.base` files. Return name, path, basic metadata. |
| **B1-5** Unit tests for parser and generator | 1d | Round-trip tests: generate → parse → compare. Test against real `.base` file samples. |

**Deliverable:** `BasesParser` and `BasesYamlGenerator` pass round-trip tests for all documented Bases YAML features.

---

### Phase B-2: Create and read tools (week 6)

> Goal: First two tools working end-to-end.

| Task | Est. | Notes |
|---|---|---|
| **B2-1** Define tool schemas in `BasesToolDefinitions.ts` | 0.5d | `create_base`, `read_base` — JSON schemas, descriptions |
| **B2-2** Implement `create_base` handler | 1d | Receive structured spec from LLM, generate view-definition content, create `.base` file via VaultOperations. Optionally create sample notes so the Base isn't empty when rendered. |
| **B2-3** Implement `read_base` handler | 0.5d | Read `.base` file, parse with `BasesParser`, return the view definition (filters, properties, formulas, views) to LLM. Clarify to LLM that this is the query definition, not data. |
| **B2-4** Register tools in `ToolCatalog` with Pro gate | 0.5d | Conditional registration based on entitlement |
| **B2-5** Integration test: create + read round-trip | 0.5d | Create a Base via tool, read it back, verify schema |
| **B2-6** Add `list_bases` mode to `read_base` | 0.5d | When called without a path, list all Bases in vault |

**Deliverable:** User can say "Create a project tracker" and get a valid `.base` file. Can ask "What Bases do I have?" and get a list.

---

### Phase B-3: Query engine (week 7)

> Goal: Users can ask questions about data in their Bases.

| Task | Est. | Notes |
|---|---|---|
| **B3-1** Implement `BasesQueryEngine.ts` | 2d | Core challenge: the Base file contains no data, so we must scan vault notes and evaluate each note's frontmatter against the Base's filters. Support: property comparisons (is, is not, contains, before, after), boolean logic (AND/OR), date math. NOT: full formula evaluation (formulas only resolve when Obsidian renders the view). |
| **B3-2** Implement `query_base` handler | 1d | Read Base view definition → extract filters → scan vault notes' frontmatter → evaluate matches → return results as table |
| **B3-3** Natural language filter refinement | 0.5d | LLM translates "open incidents from last week" into filter parameters. Tool applies on top of Base's existing filters. |
| **B3-4** Format results for chat output | 0.5d | Markdown table or list rendering. Truncate large result sets with pagination hint. |

**Deliverable:** User can ask "What are the high-priority items in my projects Base?" and get a filtered table.

---

### Phase B-4: Record mutation (week 8)

> Goal: Create and update records. Completes MVP.

| Task | Est. | Notes |
|---|---|---|
| **B4-1** Implement `BasesMutator.ts` — dry-run mode | 1d | Compute which notes would be affected, what frontmatter changes would be made. Return `MutationPreview`. |
| **B4-2** Implement `BasesMutator.ts` — apply mode | 1d | Execute frontmatter patches via existing `patch_note`. Atomic per-note (if one fails, others still succeed; report errors). |
| **B4-3** Implement `add_base_records` handler | 1d | Create new notes with frontmatter matching the Base's property columns. These notes become "records" that appear in the rendered Base view. Support batch (1-N notes). |
| **B4-4** Implement `update_base_records` handler | 1d | Use Base's filters to find matching notes → dry-run preview of frontmatter changes → user confirmation → apply patches. |
| **B4-5** Confirmation UX for bulk operations | 0.5d | Use existing `ask_question` tool to show preview and get user confirmation before applying. |

**Deliverable:** Complete Bases AI MVP. User can create, read, query, add, and update records through chat.

---

### Phase B-5: Schema evolution and polish (weeks 9-10)

> Goal: Advanced Pro features + production hardening.

| Task | Est. | Notes |
|---|---|---|
| **B5-1** Implement `evolve_base_schema` handler | 1.5d | Modify `.base` view definition (add/remove/rename property columns). Optionally backfill values across matching notes' frontmatter. |
| **B5-2** Backfill logic with dry-run | 1d | "Add a 'source' property set to 'web' for all notes" — preview → confirm → apply |
| **B5-3** View-definition validation and error recovery | 1d | Validate generated `.base` content against Bases syntax rules before writing. If LLM produces invalid content, attempt auto-fix or return actionable error. |
| **B5-4** Edge case hardening | 1d | Empty Bases, Bases with 0 matching notes, very large Bases (1000+ notes), duplicate property names, special characters in values |
| **B5-5** Tracing integration | 0.5d | Bases tool calls appear in TracingService with input/output details |
| **B5-6** Extension packaging | 0.5d | Package Bases AI as a Pro extension in the marketplace catalog |

**Deliverable:** Full Bases AI tool pack, production-ready, available as Pro extension.

---

## Supported Bases filter operators (MVP)

The `BasesQueryEngine` will support this subset in Phase B-3. Remaining operators are future work.

| Operator | Types | Example |
|---|---|---|
| `is` | text, number, date, checkbox | `status is "active"` |
| `is not` | text, number, date, checkbox | `status is not "archived"` |
| `contains` | text, list | `tags contains "project"` |
| `does not contain` | text, list | `tags does not contain "archived"` |
| `starts with` | text | `title starts with "ADR"` |
| `ends with` | text | `title ends with "draft"` |
| `is empty` | any | `assignee is empty` |
| `is not empty` | any | `due_date is not empty` |
| `before` | date | `due_date before 2026-03-01` |
| `after` | date | `created after 2026-01-01` |
| `greater than` | number | `priority greater than 3` |
| `less than` | number | `priority less than 2` |

**Not in MVP:** Formula evaluation, `file.*` property queries (e.g., `file.mtime`), regex matching, nested boolean groups.

---

## Tool schema examples

### `create_base`

```json
{
  "name": "create_base",
  "description": "Create a new Obsidian Base (.base file) from a specification. Generates valid Bases YAML with filters, properties, and views.",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "File path for the new .base file (e.g., 'Projects/tracker.base')"
      },
      "description": {
        "type": "string",
        "description": "Natural language description of the Base to create"
      },
      "properties": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "type": { "type": "string", "enum": ["text", "number", "date", "checkbox", "list", "tags"] }
          },
          "required": ["name", "type"]
        },
        "description": "Property columns for the Base"
      },
      "filters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "property": { "type": "string" },
            "operator": { "type": "string" },
            "value": { "type": "string" }
          }
        },
        "description": "Optional filters to scope which notes appear"
      },
      "create_sample_notes": {
        "type": "boolean",
        "description": "Whether to create sample notes matching the Base schema"
      }
    },
    "required": ["path", "description", "properties"]
  }
}
```

### `query_base`

```json
{
  "name": "query_base",
  "description": "Query notes matching an Obsidian Base's filters. Returns matching records with frontmatter properties.",
  "parameters": {
    "type": "object",
    "properties": {
      "base_path": {
        "type": "string",
        "description": "Path to the .base file to query"
      },
      "additional_filters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "property": { "type": "string" },
            "operator": { "type": "string" },
            "value": { "type": "string" }
          }
        },
        "description": "Additional filters to apply on top of the Base's existing filters"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of results to return (default: 50)"
      }
    },
    "required": ["base_path"]
  }
}
```

---

## Testing strategy

| Layer | Approach | Coverage target |
|---|---|---|
| **Unit** | `BasesParser`, `BasesYamlGenerator`, `BasesQueryEngine` — pure functions, easy to test | 90%+ |
| **Integration** | Tool handlers with mocked VaultOperations | All 6 tools |
| **E2E** | Manual testing in test-vault with real `.base` files | Happy paths + edge cases |
| **Provider matrix** | Verify tool calls work across Copilot, OpenAI, Azure | All 3 providers |

### Test vault setup

Add to `test-vault/`:
- `test-vault/Bases/projects.base` — project tracker with 5+ sample notes
- `test-vault/Bases/reading-list.base` — reading list with varied property types
- `test-vault/Projects/` — notes with frontmatter matching the projects Base

---

## Risk register

| Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Bases view-definition syntax undocumented edge cases | Medium | Medium | Build comprehensive test suite with real-world `.base` files; fuzz test the parser | Engineering |
| LLM generates plausible but invalid view definitions | Medium | High | Post-generation validation step; retry with error feedback; template-based generation as fallback | Engineering |
| Query results don't match Obsidian's rendered view | Medium | Medium | Document supported filter subset; we can't call the Bases renderer, so formula-dependent views will have incomplete results. Set user expectations. | Engineering |
| Bulk mutation corrupts notes | Low | Critical | Mandatory dry-run; per-note atomic writes; backup frontmatter before mutation; undo capability | Engineering |
| Performance with large vaults (10K+ notes) | Medium | Medium | Index frontmatter at load time; lazy evaluation; paginate query results | Engineering |
| Phase A (Pro Foundation) delays Bases AI | Medium | High | Begin core modules (parser, generator) before Phase A completes; Pro gating is the last integration step | PM + Engineering |

---

## Dependencies

```
Phase A: Pro Foundation (weeks 1-2)
    └── Entitlements service
    └── Feature gating in ToolCatalog
         │
Phase B-1: Foundation (week 5)  ← can start in parallel with Phase A
    └── types.ts, BasesParser, BasesYamlGenerator, BasesDiscovery
         │
Phase B-2: Create + Read tools (week 6)
    └── depends on B-1 + Phase A (for Pro gating)
         │
Phase B-3: Query engine (week 7)
    └── depends on B-1
         │
Phase B-4: Record mutation (week 8)
    └── depends on B-2, B-3
         │
Phase B-5: Schema evolution + polish (weeks 9-10)
    └── depends on B-4
```

**Note:** Phase B-1 (core modules) can begin in parallel with Phase A since it has no dependency on entitlements. This de-risks the schedule.

---

## Definition of done

- [ ] All 6 Bases AI tools registered in ToolCatalog and working across all 3 AI providers
- [ ] Pro entitlement gate enforced — tools unavailable in Community edition
- [ ] Unit test coverage > 90% for core modules (parser, generator, query engine)
- [ ] Integration tests pass for all tool handlers
- [ ] Dry-run preview required and working for all bulk operations
- [ ] View-definition validation catches and reports invalid Base definitions
- [ ] Documentation: tool descriptions, parameter docs, usage examples
- [ ] Extension catalog entry for Bases AI Pro extension
- [ ] Test vault includes sample `.base` files for manual testing
- [ ] Performance acceptable with 1000+ note vault (query < 2s)
