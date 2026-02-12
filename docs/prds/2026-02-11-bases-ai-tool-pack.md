# Bases AI tool pack

> **One-line summary:** Give Vault Copilot the ability to create, query, update, and evolve Obsidian Bases from natural language — making it the first AI that can operate structured data inside a local-first vault.

---

## Problem statement

Obsidian 1.9 introduced **Bases** — a local-first structured view layer that lets users create database-like views (tables, cards, lists, maps) over their vault notes. A `.base` file is a **markdown file containing a view definition** — it describes which notes to include, which frontmatter properties to display, and how to lay them out. The `.base` file itself contains no data; the actual "records" are ordinary vault notes with frontmatter properties. The structured view only materializes when Obsidian **renders** the Base.

This is the biggest structural addition to Obsidian in years and directly closes the gap with Notion databases.

**The problem:** Bases are powerful but manual. Users must:

1. Learn a view-definition syntax with 5 sections (`filters`, `formulas`, `properties`, `summaries`, `views`)
2. Understand a 50+ function expression language for formulas and filters
3. Manually add/update frontmatter properties across dozens or hundreds of notes to populate the view
4. Design views, aggregation summaries, and computed columns by hand

**Evidence:**
- Notion AI's #1 cited advantage over Obsidian is database automation
- Obsidian forum requests for "AI for Bases" and "auto-populate properties" are among the highest-upvoted since Bases launched
- Users migrating from Notion cite inability to bulk-create/update structured data as the top friction point

**Without Bases AI:** Users get a powerful view engine but must author every view definition and maintain every note's frontmatter manually — exactly the kind of structured, repetitive work that AI excels at automating.

---

## Target users

| Persona | Why they care |
|---|---|
| **Software engineers** (primary) | Track projects, ADRs, incidents, runbooks in Bases. Want AI to create trackers from templates, bulk-update statuses, and query across projects. |
| **Knowledge workers / PKM users** | Use Bases for reading lists, habit trackers, CRMs. Want "create a Base for X" without learning YAML syntax. |
| **Team leads / PMs** | Maintain project Bases across many notes. Need bulk schema changes ("add a priority field to all project notes"). |

---

## Goals and success metrics

| Goal | Metric | Target |
|---|---|---|
| Users can create Bases from natural language | % of `create_base` calls producing valid `.base` files | > 90% |
| Users can query Bases conversationally | Accuracy of query results vs. manual Base view | > 85% |
| Bulk operations save significant time | Notes updated per bulk operation (avg) | > 10 |
| Drive Pro adoption | % of Pro trials that use Bases AI tools | > 30% |
| Reduce Bases learning curve | Time-to-first-Base for new users | < 2 minutes |

---

## Scope

### In scope (MVP — Phase B)

| Tool | Description | Edition |
|---|---|---|
| **`create_base`** | Create a `.base` view-definition file from a natural language description. Generates valid Bases syntax with filters, properties, views. | Pro |
| **`read_base`** | Read and parse a `.base` file, return its view definition (properties, filters, formulas, views) in a structured format. Does NOT return data — the Base file is only a view definition. | Pro |
| **`query_base`** | Scan vault notes matching a Base's filters, return matching notes with their frontmatter properties. The Base file defines the query; this tool evaluates it against actual notes. | Pro |
| **`add_base_records`** | Create new notes with frontmatter properties that would appear in a Base's view. Batch-capable. | Pro |
| **`update_base_records`** | Update frontmatter properties on notes matching a Base's filters. Supports bulk operations with dry-run preview. | Pro |
| **`evolve_base_schema`** | Add/remove/rename properties in a Base's view definition and optionally backfill values across matching notes. | Pro |

### Out of scope (this phase)

- Custom view type development (community plugin API)
- Bases formula auto-generation from data analysis
- Real-time Bases change event subscriptions
- Canvas integration with Bases
- Map view geocoding or enrichment
- Cross-vault Base operations

---

## User stories

### US-1: Create a Base from natural language

> As a knowledge worker, I want to say "Create a project tracker Base with columns for status, priority, assignee, and due date" so that I get a working `.base` file without learning YAML syntax.

**Acceptance criteria:**

- **Given** the user sends a chat message describing a Base
- **When** the AI invokes `create_base` with the parsed intent
- **Then** a valid `.base` YAML file is created at the specified path
- **And** the file includes appropriate filters, properties, and a default table view
- **And** the Base renders correctly when opened in Obsidian

**Edge cases:**
- User doesn't specify a folder → create in vault root or current folder
- User requests property types that don't exist → map to closest Obsidian property type
- User describes a Base that duplicates an existing one → warn before overwriting

---

### US-2: Query a Base conversationally

> As a software engineer, I want to ask "What are the open incidents from last week?" and get results from my incidents Base, so that I don't have to open and filter the view manually.

**Acceptance criteria:**

- **Given** the user references a Base (by name or context)
- **When** the AI invokes `query_base` with natural language filters
- **Then** matching notes are returned with their relevant frontmatter properties
- **And** results are formatted as a readable table or list in chat

---

### US-3: Bulk-update records

> As a team lead, I want to say "Mark all Q4 projects as archived" so that I can update dozens of notes at once instead of editing each one.

**Acceptance criteria:**

- **Given** the user describes a bulk update operation
- **When** the AI invokes `update_base_records` with the filter and patch
- **Then** a dry-run preview shows which notes will be affected and what changes will be made
- **And** the user confirms before changes are applied
- **And** all matching notes have their frontmatter updated atomically

---

### US-4: Evolve a Base schema

> As a PKM user, I want to say "Add a 'source' property to my reading list Base and set it to 'unknown' for all existing entries" so that I can extend my Base without manual edits.

**Acceptance criteria:**

- **Given** the user describes a schema change
- **When** the AI invokes `evolve_base_schema`
- **Then** the `.base` file is updated with the new property definition
- **And** matching notes have the new property added to their frontmatter
- **And** a backfill value is applied if specified

---

### US-5: Add records to a Base

> As an engineer, I want to say "Add three new ADRs to my architecture decisions Base: caching strategy, auth migration, and API versioning" so that new tracking entries are created with the correct schema.

**Acceptance criteria:**

- **Given** the user describes new records to add
- **When** the AI invokes `add_base_records`
- **Then** new notes are created with frontmatter matching the Base's property schema
- **And** the notes appear in the Base view immediately
- **And** each note has a reasonable template body (not just frontmatter)

---

## Edition impact

| Feature | Community | Pro |
|---|---|---|
| All Bases AI tools | — | Yes |
| Bases AI as extension | — | Pro-only extension in marketplace |
| Basic `.base` file read (via `read_note`) | Yes | Yes |

**Rationale:** Bases AI is the anchor Pro feature. It demonstrates clear workflow automation value beyond what's achievable with basic chat, justifying the Pro upgrade.

---

## Technical considerations

### Architecture

```
Chat message
    ↓
AI Provider (Copilot / OpenAI / Azure)
    ↓ tool call
ToolCatalog → Bases AI tools (Pro-gated)
    ↓
BasesService (new module)
    ├── BasesYamlGenerator — generates valid .base YAML
    ├── BasesParser — parses .base files into structured schema
    ├── BasesQueryEngine — evaluates filters against vault notes
    └── BasesMutator — batch frontmatter operations with dry-run
    ↓
VaultOperations (existing)
    ├── create/read/update files
    └── patch frontmatter
```

### Data model: Bases are views, notes are records

```
┌─────────────────────────────────────┐
│  .base file (markdown)              │
│  ── view definition only ──         │
│  filters, formulas, properties,     │
│  summaries, views                   │
│                                     │
│  Contains NO data.                  │
└──────────────┬──────────────────────┘
               │ defines query
               ▼
┌─────────────────────────────────────┐
│  Vault notes (.md files)            │
│  ── actual data ("records") ──      │
│  Frontmatter = columns/properties   │
│  Note body = content                │
│                                     │
│  Bases evaluates filters against    │
│  all notes to produce the view.     │
└─────────────────────────────────────┘
```

A `.base` file is a **markdown file** that Obsidian renders as a structured view. On disk it's just text — the table/card/list view only exists in the Obsidian renderer. Our tools operate on the raw file content:

- **Creating a Base** = writing a `.base` file with valid view-definition syntax
- **"Records"** = ordinary vault notes with frontmatter properties
- **"Columns"** = frontmatter property keys referenced in the Base
- **Querying** = reading the Base's filter definition, then scanning vault notes' frontmatter to find matches
- **Adding/updating records** = creating/patching notes' frontmatter so they appear in (or change within) the rendered view

### Key technical decisions

1. **File-system approach, not API integration.** `.base` files are markdown. We read/write them as text. There is no Obsidian API to "query a Base" — the rendering happens inside Obsidian's view layer, which plugins cannot call. We must replicate the filter evaluation ourselves by scanning vault notes.

2. **Filter evaluation is partial.** We can evaluate most Bases filter expressions (property comparisons, boolean logic, date math) by reading notes' frontmatter. We cannot replicate all 50+ built-in functions or formula evaluation. For complex queries, we return what we can and recommend the user open the rendered Base view for full fidelity.

3. **Frontmatter mutation uses existing tools.** `update_note` and `patch_note` already handle YAML frontmatter. Since "records" are just notes, Bases AI tools compose on top of these rather than reimplementing.

4. **Dry-run is mandatory for bulk operations.** Any operation touching > 1 note must show a preview and require confirmation. This aligns with the Agentic Reliability Layer workstream.

5. **Pro gating via entitlements.** Tools are registered in ToolCatalog but gated by the entitlements service (Phase A prerequisite).

### Provider constraints

- All providers (Copilot, OpenAI, Azure) support function/tool calling — Bases tools work uniformly
- Tool schemas must be JSON Schema (already the standard in ToolDefinitions.ts)

### Platform considerations

- **Desktop:** Full support
- **Mobile:** Full support (file operations work cross-platform; no local process spawning needed)

### Dependencies

- **Phase A (Pro Foundation)** must ship first — entitlements service + feature gating
- **Bases YAML syntax** must be stable (it is as of Obsidian 1.10)
- **Existing tools** (`patch_note`, `create_note`, `read_note`) are foundation — no changes needed

---

## Competitive context

| Competitor | Bases/database AI capability | Our advantage |
|---|---|---|
| **Notion AI** | Deep database automation, autofill, AI columns, bulk actions | Local-first, no cloud lock-in, BYOK |
| **Copilot Plus for Obsidian** | No Bases-specific tools (as of early 2026) | First mover in Bases AI |
| **Smart Connections** | No structured data support | Purpose-built for Bases |
| **Khoj** | No Bases awareness | Integrated into plugin ecosystem |

**Key insight:** Nobody is doing AI for Obsidian Bases yet. First-mover advantage is significant because Bases is new and users are actively looking for automation.

---

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Obsidian changes Bases YAML format | Low | High | Pin to documented syntax; add format version detection; YAML parsing is resilient to additive changes |
| Obsidian exposes a Bases API that makes our approach obsolete | Medium | Medium | Our file-based approach still works; migrate to API if/when available for better fidelity |
| Filter evaluation mismatches Obsidian's behavior | Medium | Medium | Document supported filter subset; fall back to "open the Base view" for complex queries |
| Bulk operations corrupt notes | Low | Critical | Mandatory dry-run; atomic writes; undo support via backup before mutation |
| LLM generates invalid Bases YAML | Medium | Medium | Validate YAML against known schema before writing; provide error feedback loop |

---

## Open questions

1. **Since the Base file contains no data, how does `query_base` work?** It reads the Base's filter definition, then scans vault notes' frontmatter to find matches and return their properties. This is independent of Obsidian's rendering — we replicate the filter logic ourselves. Recommendation: Start with basic filter support (property comparisons, boolean logic, date math). Add formula evaluation incrementally.

2. **Should we support inline `` ```base ``` `` code blocks or only `.base` files?** Bases can be embedded as code blocks in regular `.md` files. Recommendation: MVP targets `.base` files only. Inline blocks are a follow-up.

3. **How do we handle Bases with formulas?** Formulas are computed columns — they only produce values when Obsidian renders the view. We can't evaluate them without reimplementing the expression engine. Recommendation: Show formula definitions in `read_base` output; skip formula evaluation in `query_base` MVP. Document this limitation clearly.

4. **Should `create_base` also create sample notes?** Since "records" are just notes, the Base view would be empty without them. Recommendation: Yes, optionally. "Create a CRM Base with 3 example contacts" should create both the `.base` file and 3 notes with matching frontmatter.

5. **Base discovery — how does the AI know which Bases exist?** Recommendation: Add a `list_bases` helper that scans for `.base` files. Include in `read_base` as a mode.

6. **Can we verify our query results match what Obsidian shows?** No — we can't call the Bases renderer. Our query results are a best-effort approximation. For simple filter-only Bases this will be accurate; for formula-heavy Bases it will be incomplete. We should set user expectations accordingly.

---

## T-shirt size

**L (2-4 weeks)** for MVP (create, read, query, add/update records)

**XL (4+ weeks)** including schema evolution, bulk operations with dry-run, and polish

---

## Appendix: Bases file format

A `.base` file is a **markdown file** that Obsidian recognizes and renders as a structured view. The file content is a view definition — it contains zero data rows. The structure:

```yaml
# filters — which notes appear in the Base
filters:
  - property: status
    operator: is not
    value: archived
  - property: file.folder
    operator: is
    value: Projects

# formulas — computed columns
formulas:
  days_until_due: |
    dateDiff(due_date, now(), "days")

# properties — column configuration
properties:
  status:
    width: 120
    position: 0
  priority:
    width: 100
    position: 1

# summaries — aggregations
summaries:
  priority:
    - type: count

# views — named views
views:
  - name: All Projects
    type: table
    sort:
      - property: priority
        order: asc
```

Built-in functions available in formulas and filters: `if()`, `date()`, `link()`, `now()`, `contains()`, `startsWith()`, `endsWith()`, `length()`, `lower()`, `upper()`, `trim()`, `round()`, `floor()`, `ceil()`, `abs()`, `min()`, `max()`, `sum()`, `average()`, `map()`, `filter()`, `reduce()`, `hasTag()`, `inFolder()`, `hasLink()`, `dateFormat()`, `dateDiff()`, and more.
