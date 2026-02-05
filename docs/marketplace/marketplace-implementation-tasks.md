# Extension Marketplace Implementation Tasks

This document breaks down all implementation work by repository and assigns tasks to either the main coding agent or specialized subagents, refer to (Marketplace Implementation Plan)[marketplace-implementation-plan.md] for detailed task descriptions and specifications.

## Repository 1: `obsidian-vault-copilot` (Plugin)

This repository contains the Obsidian plugin that provides the extension browser UI and installation functionality.

### Main Coding Agent Tasks

These tasks require contextual understanding of the existing codebase, architectural decisions, and integration points:

1. **Architecture & Integration**
   - Review existing plugin architecture and identify integration points
   - Design service layer for extension management
   - Plan state management for extension browser
   - Determine settings schema changes
   - Plan event system for update notifications

2. **ExtensionManager Core Logic** (`src/extensions/ExtensionManager.ts`)
   - Implement install/uninstall/update orchestration
   - Implement dependency resolution algorithm
   - Implement rollback mechanism for failed installations
   - Implement MCP server configuration merging
   - Integrate with existing vault operations
   - Add telemetry/logging hooks

3. **ExtensionCatalogService Integration** (`src/extensions/ExtensionCatalogService.ts`)
   - Implement caching strategy aligned with existing cache patterns
   - Integrate with existing HTTP utilities
   - Implement offline fallback strategy
   - Add platform-specific optimizations

4. **Main Plugin Integration** (`src/main.ts`)
   - Register ExtensionBrowserView with workspace
   - Initialize ExtensionManager on plugin load
   - Register extension browser command
   - Set up update check intervals
   - Add cleanup on plugin unload

5. **Settings Integration** (`src/ui/settings/CopilotSettingTab.ts`)
   - Add Extensions section to settings UI
   - Implement settings persistence
   - Add validation for catalog URL
   - Create "Manage Extensions" button handler

6. **Chat View Integration** (`src/ui/ChatView/CopilotChatView.ts`)
   - Add "Extensions" menu item to gear icon
   - Implement update badge on gear icon
   - Handle update notification events
   - Integrate with existing menu system

### Subagent Tasks (Well-Defined, Isolated)

These tasks have clear boundaries and minimal dependencies on existing code:

**Subagent 1: Type Definitions**
- **Task:** Create `src/extensions/types.ts`
- **Deliverable:** Complete TypeScript interfaces and types
- **Input:** JSON schema from plan document
- **Output:** Fully typed interfaces with JSDoc
- **Dependencies:** None

**Subagent 2: Extension Card Component**
- **Task:** Create `src/ui/extensions/ExtensionCard.ts`
- **Deliverable:** Reusable extension card component
- **Input:** ExtensionManifest type, design mockup from plan
- **Output:** Component with props interface, render methods
- **Dependencies:** types.ts

**Subagent 3: Extension Detail Modal**
- **Task:** Create `src/ui/extensions/ExtensionDetailModal.ts`
- **Deliverable:** Modal for extension details with iframe/webview
- **Input:** Platform detection utilities, McpAppContainer pattern
- **Output:** Modal class with platform-specific rendering
- **Dependencies:** types.ts, platform utilities

**Subagent 4: Extension Browser View Structure**
- **Task:** Create `src/ui/extensions/ExtensionBrowserView.ts` (structure only)
- **Deliverable:** View class with layout, sections, filters
- **Input:** ItemView pattern, design mockup
- **Output:** View skeleton with render methods (without service integration)
- **Dependencies:** types.ts, ExtensionCard.ts

**Subagent 5: CSS Styles**
- **Task:** Add extension marketplace styles to `styles.css`
- **Deliverable:** Complete CSS for all extension UI components
- **Input:** Design system from plan, existing styles.css patterns
- **Output:** CSS classes for browser, cards, detail modal, badges
- **Dependencies:** None

**Subagent 6: Update Notification UI**
- **Task:** Create update badge and notification components
- **Deliverable:** Badge component, toast notification formatter
- **Input:** Update notification design from plan
- **Output:** Reusable UI components for updates
- **Dependencies:** types.ts

**Subagent 7: Confirmation Modals**
- **Task:** Create reusable confirmation modal for various scenarios
- **Deliverable:** Generic ConfirmationModal class
- **Input:** Modal patterns from plan (dependency install, MCP overwrite, etc.)
- **Output:** Flexible modal with title, message, confirm/cancel callbacks
- **Dependencies:** Obsidian Modal API

**Subagent 8: Unit Tests - Types & Utilities**
- **Task:** Create `src/tests/extensions/types.test.ts`
- **Deliverable:** Type guard tests, validation tests
- **Input:** types.ts
- **Output:** Comprehensive test coverage for type utilities
- **Dependencies:** types.ts, vitest

**Subagent 9: Unit Tests - Extension Manager**
- **Task:** Create `src/tests/extensions/ExtensionManager.test.ts`
- **Deliverable:** Tests for install/uninstall/update/dependency logic
- **Input:** ExtensionManager.ts (after main agent implementation)
- **Output:** Unit tests with mocked vault/catalog service
- **Dependencies:** ExtensionManager.ts

**Subagent 10: Unit Tests - Catalog Service**
- **Task:** Create `src/tests/extensions/ExtensionCatalogService.test.ts`
- **Deliverable:** Tests for fetch, cache, search, filter
- **Input:** ExtensionCatalogService.ts (after main agent implementation)
- **Output:** Unit tests with mocked HTTP requests
- **Dependencies:** ExtensionCatalogService.ts

---

## Repository 2: `vault-copilot-extensions` (Catalog)

This repository hosts the extension catalog, GitHub Pages site, and build automation.

### Main Coding Agent Tasks

These tasks require understanding of the catalog structure, build pipeline, and contributor workflow:

1. **Repository Setup & Configuration**
   - Initialize repository structure per plan
   - Configure GitHub Pages settings
   - Set up branch protection rules
   - Configure GitHub Discussions
   - Set up GitHub Actions secrets (GITHUB_TOKEN for reactions)

2. **Build Script Core Logic** (`scripts/build-catalog.js`)
   - Implement manifest scanning and aggregation
   - Implement GitHub Discussions API integration for reactions
   - Implement featured extension selection logic
   - Implement download URL generation
   - Add error handling and logging

3. **Validation Script** (`scripts/validate-extension.js`)
   - Implement security pattern detection
   - Implement manifest schema validation
   - Implement duplicate ID detection
   - Implement file size checks
   - Create validation report formatter

4. **Jekyll Site Structure**
   - Design site navigation and layout
   - Create responsive design system
   - Implement search/filter functionality (if client-side)
   - Optimize for mobile and desktop

5. **GitHub Actions Workflows**
   - Design PR validation strategy
   - Implement build and deploy pipeline
   - Set up automatic catalog generation
   - Configure workflow permissions

6. **Initial Extension Seeding**
   - Migrate existing agents from test-vault
   - Create manifests for seed extensions
   - Write README.md for each seed extension
   - Generate preview images

### Subagent Tasks (Well-Defined, Isolated)

**Subagent 1: Schema Definition**
- **Task:** Create `schema/manifest.schema.json`
- **Deliverable:** JSON Schema for extension manifests
- **Input:** Schema specification from plan
- **Output:** Validated JSON Schema file with examples
- **Dependencies:** None

**Subagent 2: Repository Documentation**
- **Task:** Create `README.md`
- **Deliverable:** Repository landing page
- **Input:** README template from Part 10
- **Output:** Complete README with badges, links, instructions
- **Dependencies:** None

**Subagent 3: Contributing Guide**
- **Task:** Create `CONTRIBUTING.md`
- **Deliverable:** Contributor documentation
- **Input:** CONTRIBUTING template from Part 10
- **Output:** Complete contributor guide with examples
- **Dependencies:** None

**Subagent 4: Security Policy**
- **Task:** Create `SECURITY.md`
- **Deliverable:** Security policy and reporting guidelines
- **Input:** SECURITY template from Part 10
- **Output:** Complete security policy
- **Dependencies:** None

**Subagent 5: PR Template**
- **Task:** Create `.github/PULL_REQUEST_TEMPLATE.md`
- **Deliverable:** Pull request template for submissions
- **Input:** PR template from Part 10
- **Output:** Markdown template with checklist
- **Dependencies:** None

**Subagent 6: Issue Templates**
- **Task:** Create `.github/ISSUE_TEMPLATE/new-extension.yml`
- **Deliverable:** Issue form for extension submissions
- **Input:** Issue template from Part 10
- **Output:** YAML form configuration
- **Dependencies:** None

**Subagent 7: Extension Authoring Guide**
- **Task:** Create `docs/AUTHORING.md`
- **Deliverable:** Step-by-step tutorial for extension authors
- **Input:** Authoring guide from Part 10
- **Output:** Complete tutorial with examples
- **Dependencies:** None

**Subagent 8: Jekyll Configuration**
- **Task:** Create `_config.yml`
- **Deliverable:** Jekyll site configuration
- **Input:** Jekyll config from Part 5
- **Output:** Complete Jekyll configuration
- **Dependencies:** None

**Subagent 9: Jekyll Layouts - Default**
- **Task:** Create `_layouts/default.html`
- **Deliverable:** Base layout for all pages
- **Input:** Layout structure from Part 5
- **Output:** HTML layout with header/footer includes
- **Dependencies:** None

**Subagent 10: Jekyll Layouts - Extension Detail**
- **Task:** Create `_layouts/extension.html`
- **Deliverable:** Layout for extension detail pages
- **Input:** Extension layout from Part 5 & 9 (with giscus)
- **Output:** HTML layout with metadata sidebar, giscus integration
- **Dependencies:** _layouts/default.html

**Subagent 11: Jekyll Includes - Header**
- **Task:** Create `_includes/header.html`
- **Deliverable:** Site header component
- **Input:** Site structure from plan
- **Output:** Header with navigation, logo, search
- **Dependencies:** None

**Subagent 12: Jekyll Includes - Footer**
- **Task:** Create `_includes/footer.html`
- **Deliverable:** Site footer component
- **Input:** Site structure from plan
- **Output:** Footer with links, credits
- **Dependencies:** None

**Subagent 13: Jekyll Includes - Metadata Sidebar**
- **Task:** Create `_includes/metadata-sidebar.html`
- **Deliverable:** Extension metadata component
- **Input:** Sidebar design from Part 6
- **Output:** HTML template for extension metadata
- **Dependencies:** None

**Subagent 14: Site CSS**
- **Task:** Create `assets/css/extensions.css`
- **Deliverable:** Site stylesheet
- **Input:** Design system from plan
- **Output:** Complete CSS for Jekyll site
- **Dependencies:** None

**Subagent 15: GitHub Actions - Build and Deploy**
- **Task:** Create `.github/workflows/build-and-deploy.yml`
- **Deliverable:** Workflow for catalog build and Pages deployment
- **Input:** Workflow specification from Part 2
- **Output:** Complete workflow YAML
- **Dependencies:** scripts/build-catalog.js

**Subagent 16: GitHub Actions - PR Validation**
- **Task:** Create `.github/workflows/validate-pr.yml`
- **Deliverable:** Workflow for PR validation
- **Input:** Validation workflow from Part 4
- **Output:** Complete workflow YAML with security checks
- **Dependencies:** scripts/validate-extension.js

**Subagent 17: Seed Extension - Daily Journal Agent**
- **Task:** Create `extensions/agents/daily-journal-agent/`
- **Deliverable:** Complete extension folder
- **Input:** Existing agent from test-vault, manifest template
- **Output:** manifest.json, README.md, .agent.md file, preview.png
- **Dependencies:** schema/manifest.schema.json

**Subagent 18: Seed Extension - Meeting Notes Agent**
- **Task:** Create `extensions/agents/meeting-notes-agent/`
- **Deliverable:** Complete extension folder
- **Input:** Existing agent from test-vault (if exists), manifest template
- **Output:** manifest.json, README.md, .agent.md file, preview.png
- **Dependencies:** schema/manifest.schema.json

**Subagent 19: Seed Extension - Task Management Prompt**
- **Task:** Create `extensions/prompts/task-management-prompt/`
- **Deliverable:** Complete extension folder
- **Input:** Prompt template, manifest template
- **Output:** manifest.json, README.md, .prompt.md file, preview.png
- **Dependencies:** schema/manifest.schema.json

**Subagent 20: Seed Extension - Weekly Review Agent**
- **Task:** Create `extensions/agents/weekly-review-agent/`
- **Deliverable:** Complete extension folder (use as reference example)
- **Input:** Agent template from AUTHORING.md
- **Output:** manifest.json, README.md, .agent.md file, preview.png
- **Dependencies:** schema/manifest.schema.json

**Subagent 21: Example MCP Server Extension**
- **Task:** Create `extensions/mcp-servers/example-weather/`
- **Deliverable:** Complete MCP extension example
- **Input:** MCP config format, manifest template
- **Output:** manifest.json, README.md, mcp-config.json, preview.png
- **Dependencies:** schema/manifest.schema.json

---

## Execution Strategy

### Phase 1: Foundation (Week 1)
**Parallel Execution:**

**vault-copilot-extensions repo:**
- Main Agent: Repository setup, Jekyll configuration
- Subagent 1: Schema definition
- Subagent 2-7: All documentation files
- Subagent 8-14: Jekyll templates and CSS
- Subagent 15-16: GitHub Actions workflows

**obsidian-vault-copilot repo:**
- Main Agent: Architecture review and planning
- Subagent 1: Type definitions
- Subagent 2-7: UI components (without service integration)

### Phase 2: Core Services (Week 2)
**Sequential Execution (dependencies):**

**obsidian-vault-copilot repo:**
- Main Agent: ExtensionManager implementation
- Main Agent: ExtensionCatalogService implementation
- Subagent 8-10: Unit tests (after services complete)

**vault-copilot-extensions repo:**
- Main Agent: Build script implementation
- Main Agent: Validation script implementation
- Subagent 17-21: Seed extensions (after build script ready)

### Phase 3: Integration (Week 3)
**Main Agent Focus:**

**obsidian-vault-copilot repo:**
- Main Agent: Plugin integration (main.ts, settings, chat view)
- Main Agent: ExtensionBrowserView service integration
- Main Agent: End-to-end testing

**vault-copilot-extensions repo:**
- Main Agent: Initial extension seeding and validation
- Main Agent: Test GitHub Actions workflows

### Phase 4: Polish (Week 4)
**Both repos:**
- Main Agent: Bug fixes, optimization, cross-platform testing
- Main Agent: Documentation updates
- Main Agent: Launch preparation

---

## Task Assignment Summary

| Repository | Main Agent Tasks | Subagent Tasks | Total |
|------------|------------------|----------------|-------|
| obsidian-vault-copilot | 6 | 10 | 16 |
| vault-copilot-extensions | 6 | 21 | 27 |
| **Total** | **12** | **31** | **43** |

**Main Agent** handles complex integration, architecture, and contextual decisions (28% of tasks).

**Subagents** handle well-defined, isolated work with clear inputs/outputs (72% of tasks).

This distribution maximizes parallelization while ensuring quality through main agent oversight of critical integration points.
