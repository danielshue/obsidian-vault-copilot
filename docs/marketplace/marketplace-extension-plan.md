# Extension Marketplace Plan for Vault Copilot

A comprehensive extension ecosystem that enables users to discover, install, and manage extensions (agents, voice agents, prompts, skills, and MCP servers) from a centralized catalog accessible via the Chat View.

## Overview

This plan creates two interconnected components:

1. **Catalog Repository** (`vault-copilot-extensions`): A GitHub-hosted extension catalog with GitHub Pages for detail pages, automated build process, and contributor workflows
2. **Plugin Integration**: Extension browser UI in Vault Copilot to search, install, update, and uninstall extensions

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Catalog hosting | GitHub repo + Pages | Free, version-controlled, contributor-friendly |
| Detail pages | Jekyll from README.md | Contributors write once, auto-rendered |
| Downloads | Raw GitHub URLs | Simple, no CDN needed initially |
| Install location | `Reference/` folder | Visible, editable, syncs across devices |
| Tracking file | `.obsidian/vault-copilot-extensions.json` | Hidden, doesn't clutter vault |
| Plugin type | Deferred | Requires security review for code execution |
| Categories | 9 productivity-focused | Matches Obsidian use cases |
| Comments | giscus (GitHub Discussions) | Zero backend, leverages GitHub accounts |
| Ratings | GitHub reactions → future API | Start simple, enhance later if needed |

---

## Part 1: Catalog Repository (`vault-copilot-extensions`)

### Repository Description

> Official extension catalog for Vault Copilot — discover and install agents, prompts, skills, voice agents, and MCP servers to supercharge your Obsidian vault.

### Repository Structure

```
vault-copilot-extensions/
├── .github/
│   ├── workflows/
│   │   ├── build-and-deploy.yml   # Builds catalog.json + deploys Pages
│   │   └── validate-pr.yml        # PR validation for submissions
│   ├── ISSUE_TEMPLATE/
│   │   └── new-extension.yml
│   └── PULL_REQUEST_TEMPLATE.md
│
├── _config.yml                     # Jekyll config for GitHub Pages
├── _layouts/
│   ├── default.html
│   └── extension.html             # Extension detail page layout
├── _includes/
│   ├── header.html
│   ├── footer.html
│   ├── extension-card.html
│   └── metadata-sidebar.html
│
├── assets/
│   ├── css/
│   │   └── extensions.css
│   └── images/
│       └── placeholder.png
│
├── catalog/
│   └── catalog.json               # Built during deploy process
│
├── extensions/
│   ├── agents/
│   │   └── {extension-name}/
│   │       ├── manifest.json
│   │       ├── README.md
│   │       ├── {name}.agent.md
│   │       └── preview.png
│   ├── voice-agents/
│   ├── prompts/
│   ├── skills/
│   └── mcp-servers/
│
├── schema/
│   ├── manifest.schema.json
│   └── examples/
│
├── scripts/
│   ├── build-catalog.js           # Aggregates manifests into catalog.json
│   └── validate-extension.js      # Validates manifest and files
│
├── CONTRIBUTING.md
└── README.md
```

---

## Part 2: Catalog Build Process

The `catalog.json` file is **automatically generated** during the GitHub Pages build/deploy process. This ensures the catalog is always in sync with the extensions in the repository.

### Build Workflow

**`.github/workflows/build-and-deploy.yml`**:

```yaml
name: Build Catalog and Deploy Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build-catalog:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build catalog.json
        run: node scripts/build-catalog.js
      
      - name: Commit catalog.json
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add catalog/catalog.json
          git diff --staged --quiet || git commit -m "chore: rebuild catalog.json"
          git push

  deploy-pages:
    needs: build-catalog
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: main  # Get the updated catalog.json
      
      - name: Setup Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.2'
          bundler-cache: true
      
      - name: Build Jekyll site
        run: bundle exec jekyll build
      
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Build Script

**`scripts/build-catalog.js`**:

```javascript
#!/usr/bin/env node
/**
 * Build script that aggregates all extension manifests into catalog.json
 * Run during the GitHub Pages build process
 */

const fs = require('fs');
const path = require('path');

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');
const CATALOG_PATH = path.join(__dirname, '..', 'catalog', 'catalog.json');
const BASE_URL = 'https://danielshue.github.io/vault-copilot-extensions';
const RAW_BASE = 'https://raw.githubusercontent.com/danielshue/vault-copilot-extensions/main';

const EXTENSION_TYPES = ['agents', 'voice-agents', 'prompts', 'skills', 'mcp-servers'];

const CATEGORIES = [
  'Productivity',
  'Journaling', 
  'Research',
  'Writing',
  'Task Management',
  'Voice',
  'Integration',
  'MCP',
  'Utility'
];

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return 'Unknown';
  }
}

function getFileModifiedDate(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function scanExtensions() {
  const extensions = [];
  const featured = [];

  for (const type of EXTENSION_TYPES) {
    const typeDir = path.join(EXTENSIONS_DIR, type);
    if (!fs.existsSync(typeDir)) continue;

    const extensionDirs = fs.readdirSync(typeDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const extName of extensionDirs) {
      const extDir = path.join(typeDir, extName);
      const manifestPath = path.join(extDir, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        console.warn(`Warning: No manifest.json in ${extDir}`);
        continue;
      }

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        // Calculate total size of extension files
        let totalSize = 0;
        const files = manifest.files?.map(f => {
          const filePath = path.join(extDir, f.source);
          const fileStats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
          totalSize += fileStats?.size || 0;
          
          return {
            source: f.source,
            downloadUrl: `${RAW_BASE}/extensions/${type}/${extName}/${f.source}`,
            installPath: f.installPath
          };
        }) || [];

        // Build catalog entry
        const entry = {
          id: manifest.id,
          name: manifest.name,
          type: manifest.type,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          categories: manifest.categories || [],
          tags: manifest.tags || [],
          downloads: 0, // Could integrate with analytics later
          rating: null,
          publishedAt: manifest.publishedAt || getFileModifiedDate(manifestPath),
          updatedAt: getFileModifiedDate(manifestPath),
          size: getFileSize(manifestPath).replace(/\d+\.?\d*/, 
            () => (totalSize / 1024).toFixed(1)) + ' KB',
          minVaultCopilotVersion: manifest.minVaultCopilotVersion || '0.1.0',
          repository: manifest.repository,
          detailPageUrl: `${BASE_URL}/extensions/${type}/${extName}/`,
          files,
          tools: manifest.tools || [],
          dependencies: manifest.dependencies || [],
          preview: manifest.preview ? 
            `${RAW_BASE}/extensions/${type}/${extName}/${manifest.preview}` : null
        };

        extensions.push(entry);

        // Track featured extensions (could be based on a featured flag in manifest)
        if (manifest.featured) {
          featured.push(manifest.id);
        }

      } catch (err) {
        console.error(`Error processing ${manifestPath}:`, err.message);
      }
    }
  }

  return { extensions, featured };
}

function buildCatalog() {
  console.log('Building catalog.json...');
  
  const { extensions, featured } = scanExtensions();
  
  const catalog = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    extensions: extensions.sort((a, b) => a.name.localeCompare(b.name)),
    categories: CATEGORIES,
    featured: featured.length > 0 ? featured : extensions.slice(0, 5).map(e => e.id)
  };

  // Ensure catalog directory exists
  const catalogDir = path.dirname(CATALOG_PATH);
  if (!fs.existsSync(catalogDir)) {
    fs.mkdirSync(catalogDir, { recursive: true });
  }

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  
  console.log(`Built catalog with ${extensions.length} extensions`);
  console.log(`Categories: ${CATEGORIES.join(', ')}`);
  console.log(`Featured: ${catalog.featured.join(', ')}`);
  console.log(`Output: ${CATALOG_PATH}`);
}

buildCatalog();
```

### When Catalog Updates

The `catalog.json` is rebuilt automatically when:

1. **PR is merged** to `main` that modifies `extensions/**`
2. **Manual trigger** via "Run workflow" in GitHub Actions
3. **Any push** to `main` branch (catches direct commits)

The build process:
1. Scans all `extensions/{type}/{name}/manifest.json` files
2. Aggregates metadata into a single `catalog.json`
3. Calculates file sizes and generates download URLs
4. Commits the updated catalog to the repo
5. Jekyll builds the static site (including detail pages)
6. Deploys to GitHub Pages

---

## Part 3: Catalog JSON Schema

### Master Catalog (`catalog/catalog.json`)

```json
{
  "version": "1.0.0",
  "generated": "2026-02-05T12:00:00Z",
  "extensions": [
    {
      "id": "daily-journal-agent",
      "name": "Daily Journal Agent",
      "type": "agent",
      "version": "1.2.0",
      "description": "Creates structured daily journal entries with prompts",
      "author": { "name": "Jane Dev", "url": "https://github.com/janedev" },
      "categories": ["Productivity", "Journaling"],
      "tags": ["daily", "reflection"],
      "downloads": 1234,
      "rating": 4.5,
      "publishedAt": "2026-01-15T00:00:00Z",
      "updatedAt": "2026-02-01T00:00:00Z",
      "size": "2.3 KB",
      "minVaultCopilotVersion": "0.1.0",
      "repository": "https://github.com/janedev/daily-journal-agent",
      "detailPageUrl": "https://danielshue.github.io/vault-copilot-extensions/extensions/agents/daily-journal/",
      "files": [
        {
          "source": "daily-journal.agent.md",
          "downloadUrl": "https://raw.githubusercontent.com/danielshue/vault-copilot-extensions/main/extensions/agents/daily-journal/daily-journal.agent.md",
          "installPath": "Reference/Agents/"
        }
      ],
      "tools": ["create_note", "read_note"],
      "dependencies": []
    }
  ],
  "categories": [
    "Productivity", "Journaling", "Research", "Writing", 
    "Task Management", "Voice", "Integration", "MCP", "Utility"
  ],
  "featured": ["daily-journal-agent", "meeting-notes-agent"]
}
```

### Extension Manifest Schema

**`schema/manifest.schema.json`**:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Vault Copilot Extension Manifest",
  "type": "object",
  "required": ["id", "name", "version", "type", "description", "author", "files"],
  "properties": {
    "id": { 
      "type": "string", 
      "pattern": "^[a-z0-9-]+$",
      "description": "Unique identifier (lowercase, hyphens only)"
    },
    "name": { 
      "type": "string", 
      "maxLength": 50,
      "description": "Display name"
    },
    "version": { 
      "type": "string", 
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "Semantic version (x.y.z)"
    },
    "type": { 
      "enum": ["agent", "voice-agent", "prompt", "skill", "mcp-server"],
      "description": "Extension type"
    },
    "description": { 
      "type": "string", 
      "maxLength": 200,
      "description": "Short description"
    },
    "author": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": { "type": "string" },
        "url": { "type": "string", "format": "uri" },
        "email": { "type": "string", "format": "email" }
      }
    },
    "repository": { "type": "string", "format": "uri" },
    "license": { "type": "string", "default": "MIT" },
    "minVaultCopilotVersion": { "type": "string" },
    "categories": { 
      "type": "array", 
      "items": { "type": "string" },
      "description": "Must match catalog categories"
    },
    "tags": { 
      "type": "array", 
      "items": { "type": "string" },
      "description": "Free-form tags for search"
    },
    "files": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["source", "installPath"],
        "properties": {
          "source": { "type": "string", "description": "Filename in extension folder" },
          "installPath": { "type": "string", "description": "Target folder in vault" }
        }
      }
    },
    "tools": { 
      "type": "array", 
      "items": { "type": "string" },
      "description": "Vault Copilot tools used"
    },
    "dependencies": { 
      "type": "array", 
      "items": { "type": "string" },
      "description": "Other extension IDs required"
    },
    "permissions": { 
      "type": "array", 
      "items": { "type": "string" },
      "description": "Special permissions needed"
    },
    "preview": { "type": "string", "description": "Preview image filename" },
    "changelog": { "type": "string", "description": "Changelog filename" },
    "featured": { "type": "boolean", "description": "Mark as featured" },
    "publishedAt": { "type": "string", "format": "date-time" }
  }
}
```

---

## Part 4: Contributor Workflow

### Submission Process

1. **Fork** the `vault-copilot-extensions` repository
2. **Create folder**: `extensions/{type}/{extension-name}/`
3. **Add files**: `manifest.json`, `README.md`, extension file(s), optional `preview.png`
4. **Submit PR** using template
5. **Automated validation** runs (schema, security, uniqueness)
6. **Maintainer review** (quality, security, usefulness)
7. **Merge** → catalog rebuilds automatically → available in Vault Copilot

### Required Files per Type

| Type | Folder | Extension File | Install Path |
|------|--------|----------------|--------------|
| Agent | `extensions/agents/` | `*.agent.md` | `Reference/Agents/` |
| Voice Agent | `extensions/voice-agents/` | `*.voice-agent.md` | `Reference/Agents/` |
| Prompt | `extensions/prompts/` | `*.prompt.md` | `Reference/Prompts/` |
| Skill | `extensions/skills/` | `skill.md` | `Reference/Skills/{name}/` |
| MCP Server | `extensions/mcp-servers/` | `mcp-config.json` | `.obsidian/mcp-servers.json` |

### Extension Folder Structure

Each contributor creates a folder with this structure:

```
extensions/agents/my-cool-agent/
├── manifest.json          # Required: metadata (see schema)
├── README.md              # Required: documentation (becomes detail page)
├── my-cool-agent.agent.md # Required: the extension file
├── preview.png            # Optional: screenshot (recommended, 1280x720)
├── CHANGELOG.md           # Optional: version history
└── LICENSE                # Optional: defaults to MIT
```

### Example manifest.json

```json
{
  "$schema": "../../schema/manifest.schema.json",
  "id": "my-cool-agent",
  "name": "My Cool Agent",
  "version": "1.0.0",
  "type": "agent",
  "description": "A brief description of what your agent does (max 200 chars).",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/yourusername"
  },
  "repository": "https://github.com/yourusername/my-cool-agent",
  "license": "MIT",
  "minVaultCopilotVersion": "0.1.0",
  "categories": ["Productivity"],
  "tags": ["automation", "notes"],
  "files": [
    {
      "source": "my-cool-agent.agent.md",
      "installPath": "Reference/Agents/"
    }
  ],
  "tools": ["create_note", "read_note"],
  "dependencies": []
}
```

### README Template

Contributors write README.md with Jekyll frontmatter:

```markdown
---
layout: extension
title: My Cool Agent
---

# My Cool Agent

![Preview](preview.png)

Brief description of what your extension does.

## Features

- ✨ Feature one
- 🚀 Feature two
- 📝 Feature three

## Installation

Install via the Extension Browser in Vault Copilot, or manually copy 
`my-cool-agent.agent.md` to your `Reference/Agents/` folder.

## Usage

Explain how to use your extension with examples.

## Configuration

Document any customizable settings in the frontmatter.

## Tools Used

| Tool | Purpose |
|------|---------|
| `create_note` | Why you use it |
| `read_note` | Why you use it |

## Changelog

### v1.0.0 (2026-02-05)
- Initial release

## License

MIT
```

### PR Validation Workflow

**`.github/workflows/validate-pr.yml`**:

```yaml
name: Validate Extension PR

on:
  pull_request:
    paths:
      - 'extensions/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Validate extensions
        run: node scripts/validate-extension.js
      
      - name: Comment on PR
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ Extension validation failed. Please check the workflow logs for details.'
            })
```

### Validation Checks

The validation script checks:

- ✅ `manifest.json` matches JSON Schema
- ✅ Required files present (`manifest.json`, `README.md`, extension file)
- ✅ Unique extension ID (not already in catalog)
- ✅ Version follows semver
- ✅ No duplicate files across extensions
- ✅ No suspicious patterns (API keys, eval, etc.)
- ✅ Categories are valid

---

## Part 5: GitHub Pages Configuration

### Jekyll Configuration

**`_config.yml`**:

```yaml
title: Vault Copilot Extensions
description: Discover and install extensions for Vault Copilot
baseurl: "/vault-copilot-extensions"
url: "https://danielshue.github.io"

# Serve catalog.json as-is
include:
  - catalog

# Extension pages from README.md files
collections:
  extensions:
    output: true
    permalink: /extensions/:path/

defaults:
  - scope:
      path: "extensions"
    values:
      layout: "extension"

plugins:
  - jekyll-seo-tag
  - jekyll-sitemap

# Markdown settings
markdown: kramdown
kramdown:
  input: GFM
  hard_wrap: false
```

### Extension Detail Layout

**`_layouts/extension.html`**:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ page.title }} - Vault Copilot Extensions</title>
  <link rel="stylesheet" href="{{ '/assets/css/extensions.css' | relative_url }}">
  {% seo %}
</head>
<body>
  {% include header.html %}
  
  <div class="extension-detail">
    <main class="extension-content">
      {{ content }}
    </main>
    
    <aside class="extension-sidebar">
      {% include metadata-sidebar.html %}
    </aside>
  </div>
  
  {% include footer.html %}
</body>
</html>
```

### URL Structure

| Resource | URL |
|----------|-----|
| Catalog JSON | `https://danielshue.github.io/vault-copilot-extensions/catalog/catalog.json` |
| Extension Detail | `https://danielshue.github.io/vault-copilot-extensions/extensions/agents/daily-journal/` |
| Raw Download | `https://raw.githubusercontent.com/danielshue/vault-copilot-extensions/main/extensions/agents/daily-journal/daily-journal.agent.md` |

---

## Part 6: Plugin Integration

### New Files to Create

| File | Purpose |
|------|---------|
| `src/extensions/types.ts` | TypeScript interfaces for extensions |
| `src/extensions/ExtensionCatalogService.ts` | Fetch and cache catalog |
| `src/extensions/ExtensionManager.ts` | Install/uninstall/update extensions |
| `src/extensions/index.ts` | Module exports |
| `src/ui/extensions/ExtensionBrowserView.ts` | Pop-out browser view |
| `src/ui/extensions/ExtensionDetailModal.ts` | Detail page modal with iframe |
| `src/ui/extensions/ExtensionCard.ts` | Reusable card component |
| `src/ui/extensions/index.ts` | UI exports |
| `src/tests/extensions/` | Unit tests |

### Files to Modify

| File | Changes |
|------|---------|
| `src/main.ts` | Register ExtensionBrowserView, init ExtensionManager, add command |
| `src/ui/ChatView/CopilotChatView.ts` | Add "Extensions" to gear menu |
| `src/ui/settings/CopilotSettingTab.ts` | Add Extensions settings section |
| `styles.css` | Add `.vc-extension-*` styles |

### Type Definitions

**`src/extensions/types.ts`**:

```typescript
export type ExtensionType = "agent" | "voice-agent" | "prompt" | "skill" | "mcp-server";

export interface ExtensionAuthor {
  name: string;
  url?: string;
  email?: string;
}

export interface ExtensionFile {
  source: string;
  downloadUrl: string;
  installPath: string;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  type: ExtensionType;
  version: string;
  description: string;
  author: ExtensionAuthor;
  categories: string[];
  tags: string[];
  downloads?: number;
  rating?: number;
  publishedAt: string;
  updatedAt: string;
  size: string;
  minVaultCopilotVersion: string;
  repository?: string;
  detailPageUrl: string;
  files: ExtensionFile[];
  tools: string[];
  dependencies: string[];
  preview?: string;
}

export interface CatalogResponse {
  version: string;
  generated: string;
  extensions: ExtensionManifest[];
  categories: string[];
  featured: string[];
}

export interface InstalledExtension {
  id: string;
  version: string;
  installedAt: string;
  files: string[]; // Vault paths of installed files
}

export interface ExtensionFilter {
  query?: string;
  type?: ExtensionType;
  categories?: string[];
  installed?: boolean;
}

export interface ExtensionInstallResult {
  success: boolean;
  extensionId: string;
  installedFiles: string[];
  error?: string;
}
```

### ExtensionCatalogService

**`src/extensions/ExtensionCatalogService.ts`**:

Features:
- `fetchCatalog()`: Download catalog.json, cache with 5-min TTL
- `searchExtensions(filter)`: Filter/search cached catalog
- `getExtension(id)`: Get single extension by ID
- `getFeatured()`: Get featured extensions
- `getCategories()`: Get category list
- Handle offline mode with last-cached data
- Use Obsidian's `requestUrl` for cross-platform HTTP

### ExtensionManager

**`src/extensions/ExtensionManager.ts`**:

Features:
- `getInstalledExtensions()`: Read from `.obsidian/vault-copilot-extensions.json`
- `isInstalled(id)`: Check if extension is installed
- `getInstalledVersion(id)`: Get installed version
- `installExtension(manifest)`: Download files to vault, update tracking
- `uninstallExtension(id)`: Remove files, update tracking
- `updateExtension(id)`: Uninstall old, install new version
- `checkForUpdates()`: Compare installed vs catalog versions
- Handle MCP server installs (merge into mcp-servers.json)

**Install tracking file** (`.obsidian/vault-copilot-extensions.json`):

```json
{
  "installed": {
    "daily-journal-agent": {
      "version": "1.2.0",
      "installedAt": "2026-02-05T10:00:00Z",
      "files": ["Reference/Agents/daily-journal.agent.md"]
    }
  }
}
```

### ExtensionBrowserView

UI layout:

```
┌─────────────────────────────────────────────────────────┐
│ Extensions                              [↻ Refresh] [✕] │
├─────────────────────────────────────────────────────────┤
│ 🔍 [Search extensions...]  [Type ▼] [Category ▼]        │
├─────────────────────────────────────────────────────────┤
│ ▼ INSTALLED (3)                                         │
│   ┌───────────────────────────────────────────────────┐ │
│   │ 🤖 Daily Journal Agent                    v1.2.0  │ │
│   │ Creates structured daily journal entries          │ │
│   │ Productivity · Journaling        [Update] [Remove]│ │
│   └───────────────────────────────────────────────────┘ │
│                                                         │
│ ▼ FEATURED (5)                                          │
│   ┌───────────────────────────────────────────────────┐ │
│   │ 🎙️ Meeting Notes Agent                    v2.0.1  │ │
│   │ Transcribe and summarize meetings                 │ │
│   │ Productivity · Voice  ★★★★☆ (89)        [Install] │ │
│   └───────────────────────────────────────────────────┘ │
│                                                         │
│ ▼ ALL EXTENSIONS (42)                                   │
│   (filtered/searchable list)                            │
└─────────────────────────────────────────────────────────┘
```

Features:
- Extends `ItemView` for pop-out support (desktop) or modal fallback (mobile)
- Real-time search filtering
- Type and category dropdowns
- Collapsible sections
- Click card → opens ExtensionDetailModal

### ExtensionDetailModal

Layout:

```
┌─────────────────────────────────────────────────────────┐
│ Daily Journal Agent                               [✕]  │
├────────────────────────────────────┬────────────────────┤
│                                    │ [Install]          │
│  (iframe: detail page HTML)        │                    │
│                                    │ Identifier         │
│  # Daily Journal Agent             │ daily-journal-agent│
│                                    │                    │
│  Creates structured daily...       │ Version            │
│                                    │ 1.2.0              │
│  ## Features                       │                    │
│  - Feature one                     │ Last Updated       │
│  - Feature two                     │ Feb 1, 2026        │
│                                    │                    │
│  ## Usage                          │ Size               │
│  ...                               │ 2.3 KB             │
│                                    │                    │
│                                    │ Categories         │
│                                    │ Productivity       │
│                                    │ Journaling         │
│                                    │                    │
│                                    │ Tools Used         │
│                                    │ create_note        │
│                                    │ read_note          │
│                                    │                    │
│                                    │ Resources          │
│                                    │ Repository ↗       │
│                                    │ Author ↗           │
└────────────────────────────────────┴────────────────────┘
```

Features:
- Sandboxed iframe renders GitHub Pages detail page
- Use `McpAppContainer` pattern for secure rendering
- Sidebar shows metadata from manifest
- Install/Update/Remove button based on state

### Gear Menu Integration

Add to `showSettingsMenu()` in `CopilotChatView.ts`:

```typescript
menu.addItem((item) => {
  item.setTitle("Extensions")
    .setIcon("package")
    .onClick(() => {
      openExtensionBrowser(this.app);
    });
});
menu.addSeparator();
```

### Settings Section

Add to `CopilotSettingTab.ts`:

```
Extensions
├── Catalog URL: [https://danielshue.github.io/.../catalog.json]
├── Check for updates on startup: [toggle]
├── Auto-update extensions: [toggle]
└── [Manage Extensions] → opens ExtensionBrowserView
```

### CSS Styles

Add to `styles.css`:

```css
/* Extension Browser */
.vc-extension-browser { }
.vc-extension-search-bar { }
.vc-extension-filters { }
.vc-extension-section { }
.vc-extension-section-header { }

/* Extension Card */
.vc-extension-card { }
.vc-extension-card-icon { }
.vc-extension-card-title { }
.vc-extension-card-description { }
.vc-extension-card-meta { }
.vc-extension-card-actions { }

/* Extension Detail */
.vc-extension-detail { }
.vc-extension-detail-iframe { }
.vc-extension-detail-sidebar { }
.vc-extension-badge { }
```

### Commands

Register in `src/main.ts`:

```typescript
this.addCommand({
  id: "open-vault-copilot-extension-browser",
  name: "Open Extension Browser",
  callback: () => openExtensionBrowser(this.app),
});
```

### Tests

**`src/tests/extensions/`**:

| Test File | Coverage |
|-----------|----------|
| `types.test.ts` | Type validation, guards |
| `ExtensionCatalogService.test.ts` | Fetch, cache, search, filter |
| `ExtensionManager.test.ts` | Install, uninstall, update, tracking |

---

## Part 7: Implementation Phases

### Phase 1: Catalog Repository Setup

1. Create `vault-copilot-extensions` repository
2. Add folder structure and schema files
3. Create build script (`scripts/build-catalog.js`)
4. Configure Jekyll and GitHub Pages
5. Create GitHub Actions workflows
6. Add CONTRIBUTING.md and README.md
7. Seed with 5-10 example extensions from test-vault
8. Enable GitHub Discussions and configure giscus for comments

### Phase 2: Plugin Core Services

1. Create `src/extensions/types.ts`
2. Implement `ExtensionCatalogService`
3. Implement `ExtensionManager`
4. Add unit tests

### Phase 3: Plugin UI

1. Create `ExtensionBrowserView`
2. Create `ExtensionDetailModal`
3. Create `ExtensionCard` component
4. Add gear menu integration
5. Add settings section
6. Add CSS styles

### Phase 4: Polish & Launch

1. Manual testing across platforms
2. Mobile testing (modal fallback)
3. Offline mode testing
4. Update documentation
5. Announce to users

### Phase 5: Enhanced Ratings (Future)

1. Design ratings API specification
2. Implement serverless API (Azure Functions or Cloudflare Workers)
3. Add GitHub OAuth for authentication
4. Integrate ratings into build script
5. Update plugin UI to submit ratings

---

## Part 8: Verification

### Unit Tests

```bash
npm test
```

### Manual Testing Checklist

- [ ] Gear icon → Extensions opens browser
- [ ] Catalog loads and displays extensions
- [ ] Search filters results in real-time
- [ ] Type/category dropdowns work
- [ ] Click extension → detail modal opens
- [ ] Detail page renders in iframe
- [ ] Install button downloads to correct folder
- [ ] Installed extensions appear in Installed section
- [ ] Uninstall removes files from vault
- [ ] Update replaces with new version
- [ ] Works offline with cached catalog
- [ ] Mobile: modal fallback works
- [ ] Extension detail page shows giscus comments
- [ ] Ratings display correctly on extension cards

### Cross-Platform Testing

- [ ] Windows desktop
- [ ] macOS desktop
- [ ] iOS mobile
- [ ] Android mobile

---

## Part 9: Comments & Ratings

User feedback is essential for a healthy extension ecosystem. This section describes how users can comment on and rate extensions.

### Phase 1: GitHub-Based (Launch)

#### Comments via giscus

[giscus](https://giscus.app/) embeds GitHub Discussions as a comment system on each extension detail page. Users authenticate with their GitHub account to leave feedback.

**Benefits:**
- Zero backend cost
- Leverages existing GitHub accounts
- Comments are searchable and persistent
- Maintainers can moderate via GitHub Discussions

**Setup:**

1. Enable GitHub Discussions in the `vault-copilot-extensions` repository
2. Create a "Extension Feedback" discussion category
3. Configure giscus and add to the extension layout

**`_layouts/extension.html`** (add before closing `</body>`):

```html
<!-- Comments via giscus -->
<section class="extension-comments">
  <h2>Community Feedback</h2>
  <script src="https://giscus.app/client.js"
    data-repo="danielshue/vault-copilot-extensions"
    data-repo-id="[REPO_ID]"
    data-category="Extension Feedback"
    data-category-id="[CATEGORY_ID]"
    data-mapping="pathname"
    data-strict="0"
    data-reactions-enabled="1"
    data-emit-metadata="0"
    data-input-position="top"
    data-theme="preferred_color_scheme"
    data-lang="en"
    data-loading="lazy"
    crossorigin="anonymous"
    async>
  </script>
</section>
```

#### Ratings via GitHub Reactions

Users can react to the Discussion thread with 👍, ❤️, 🚀, etc. The build script counts reactions and calculates a popularity score.

**Build script enhancement** (`scripts/build-catalog.js`):

```javascript
// Fetch reaction counts from GitHub API (requires GITHUB_TOKEN)
async function fetchReactionCounts(extensionId) {
  // Query GitHub Discussions API for reactions
  // Map pathname to discussion
  // Count positive reactions (👍, ❤️, 🚀, 🎉)
  // Return as rating score
}
```

**Catalog entry with ratings:**

```json
{
  "id": "daily-journal-agent",
  "rating": 4.2,
  "ratingCount": 47,
  "reactions": {
    "thumbsUp": 35,
    "heart": 8,
    "rocket": 4
  }
}
```

### Phase 2: Enhanced Ratings (Future)

For true 1-5 star ratings, add a lightweight backend:

| Component | Service | Cost |
|-----------|---------|------|
| Ratings API | Azure Functions / Cloudflare Workers | Free tier |
| Database | Azure Cosmos DB / Cloudflare KV | Free tier |
| Auth | GitHub OAuth | Free |

**Flow:**

1. User clicks ★★★★☆ in extension detail (in Vault Copilot plugin)
2. Plugin calls rating API with GitHub OAuth token
3. API stores rating, returns aggregate score
4. Build script fetches ratings periodically and updates catalog

**API Endpoints:**

```
POST /api/ratings
  { extensionId, rating: 1-5, userId }
  
GET /api/ratings/{extensionId}
  → { average: 4.2, count: 47, distribution: [2, 3, 5, 15, 22] }
```

### Display in Extension Browser

Extension cards show rating when available:

```
┌───────────────────────────────────────────────────┐
│ 🤖 Daily Journal Agent                    v1.2.0  │
│ Creates structured daily journal entries          │
│ Productivity · Journaling  ★★★★☆ (47)   [Install] │
└───────────────────────────────────────────────────┘
```

Extension detail modal shows:
- Star rating with count
- Link to view/add comments (opens GitHub Discussion)
- Recent community feedback preview

---

## Part 10: Repository Documentation

The `vault-copilot-extensions` repository requires comprehensive documentation to guide contributors, users, and maintainers.

### README.md

The main repository README serves as the landing page and catalog browser for GitHub visitors.

**`README.md`**:

```markdown
# Vault Copilot Extensions

<p align="center">
  <img src="assets/images/logo.png" alt="Vault Copilot Extensions" width="200"/>
</p>

<p align="center">
  <strong>Official extension catalog for Vault Copilot</strong><br>
  Discover and install agents, prompts, skills, voice agents, and MCP servers to supercharge your Obsidian vault.
</p>

<p align="center">
  <a href="https://danielshue.github.io/vault-copilot-extensions">📚 Browse Extensions</a> ·
  <a href="CONTRIBUTING.md">🤝 Contribute</a> ·
  <a href="#authoring-guide">✍️ Create an Extension</a>
</p>

---

## 🚀 Quick Start

### Install via Vault Copilot Plugin

1. Open your Obsidian vault with Vault Copilot installed
2. Click the gear icon (⚙️) in Chat View
3. Select **Extensions**
4. Browse, search, and install extensions with one click

### Manual Installation

1. Browse the [catalog website](https://danielshue.github.io/vault-copilot-extensions)
2. Find an extension you like
3. Download the extension file(s) from the detail page
4. Copy to the appropriate folder in your vault (see [Installation Paths](#installation-paths))

---

## 📦 Extension Types

| Type | Description | Install Path |
|------|-------------|-------------|
| 🤖 **Agent** | AI assistants with specific goals | `Reference/Agents/` |
| 🎙️ **Voice Agent** | Voice-activated AI assistants | `Reference/Agents/` |
| 📝 **Prompt** | Reusable prompt templates | `Reference/Prompts/` |
| ⚡ **Skill** | Agent capabilities and tools | `Reference/Skills/{name}/` |
| 🔌 **MCP Server** | Model Context Protocol integrations | `.obsidian/mcp-servers.json` |

---

## 🌟 Featured Extensions

<!-- Auto-generated by build script -->

### Daily Journal Agent
**Productivity · Journaling** · v1.2.0 · ★★★★☆ (47)

Creates structured daily journal entries with reflection prompts and habit tracking.

[View Details](https://danielshue.github.io/vault-copilot-extensions/extensions/agents/daily-journal/) · [Install](extensions/agents/daily-journal/)

<!-- More featured extensions... -->

---

## 📂 Browse by Category

- [Productivity](https://danielshue.github.io/vault-copilot-extensions?category=productivity) — Task management, workflows
- [Journaling](https://danielshue.github.io/vault-copilot-extensions?category=journaling) — Daily notes, reflection
- [Research](https://danielshue.github.io/vault-copilot-extensions?category=research) — Academic, citations
- [Writing](https://danielshue.github.io/vault-copilot-extensions?category=writing) — Drafting, editing
- [Task Management](https://danielshue.github.io/vault-copilot-extensions?category=task-management) — To-dos, projects
- [Voice](https://danielshue.github.io/vault-copilot-extensions?category=voice) — Voice agents
- [Integration](https://danielshue.github.io/vault-copilot-extensions?category=integration) — External services
- [MCP](https://danielshue.github.io/vault-copilot-extensions?category=mcp) — Protocol servers
- [Utility](https://danielshue.github.io/vault-copilot-extensions?category=utility) — Helper tools

---

## ✍️ Contributing an Extension

We welcome community contributions! See **[CONTRIBUTING.md](CONTRIBUTING.md)** for detailed guidelines.

### Quick Submission Steps

1. **Fork** this repository
2. **Create** `extensions/{type}/{your-extension-name}/`
3. **Add** required files:
   - `manifest.json` — Extension metadata (see [schema](schema/manifest.schema.json))
   - `README.md` — Documentation (becomes the detail page)
   - Extension file(s) — `.agent.md`, `.prompt.md`, etc.
   - `preview.png` — Screenshot (optional but recommended)
4. **Submit PR** using the [submission template](.github/PULL_REQUEST_TEMPLATE.md)
5. **Automated checks** validate your submission
6. **Maintainer review** — we'll provide feedback if needed
7. **Merge** — your extension appears in the catalog automatically!

### Extension Authoring Resources

- 📖 [Extension Authoring Guide](docs/AUTHORING.md) — Step-by-step tutorial
- 📝 [Manifest Schema](schema/manifest.schema.json) — Required metadata
- 🎨 [Example Extensions](extensions/) — Learn from existing submissions
- 💬 [Discussions](https://github.com/danielshue/vault-copilot-extensions/discussions) — Ask questions

---

## 🔒 Security

Security is a top priority. See **[SECURITY.md](SECURITY.md)** for:

- Reporting vulnerabilities
- Extension review process
- Content validation policies
- Malicious content handling

**All extensions are reviewed before merging.** We validate:
- ✅ No malicious code patterns
- ✅ No hardcoded credentials
- ✅ No suspicious network requests
- ✅ Compliance with content policies

---

## 🛠️ Development

### Build Catalog Locally

```bash
# Install dependencies
npm install

# Build catalog.json
node scripts/build-catalog.js

# Validate an extension
node scripts/validate-extension.js extensions/agents/my-extension
```

### Test Jekyll Site Locally

```bash
# Install Jekyll (requires Ruby)
gem install bundler jekyll
bundle install

# Serve locally
bundle exec jekyll serve

# Visit http://localhost:4000/vault-copilot-extensions
```

---

## 📊 Statistics

<!-- Auto-updated by build script -->

- **Total Extensions:** 42
- **Contributors:** 18
- **Total Downloads:** 1,247
- **Last Updated:** 2026-02-05

---

## 📄 License

This repository is licensed under [MIT License](LICENSE).

Individual extensions may have different licenses — see each extension's folder.

---

## 🙏 Acknowledgments

Built with:
- [Jekyll](https://jekyllrb.com/) — Static site generation
- [giscus](https://giscus.app/) — Comment system
- [GitHub Actions](https://github.com/features/actions) — Automation
- [Obsidian](https://obsidian.md/) — The best note-taking app

Maintained by [@danielshue](https://github.com/danielshue) and [contributors](https://github.com/danielshue/vault-copilot-extensions/graphs/contributors).
```

### CONTRIBUTING.md

**`CONTRIBUTING.md`**:

```markdown
# Contributing to Vault Copilot Extensions

Thank you for contributing! This guide will help you submit high-quality extensions.

## 🎯 Contribution Types

### 1. Submit a New Extension

Create a new extension (agent, prompt, skill, voice agent, or MCP server) for the community.

**Requirements:**
- ✅ Original work or properly attributed
- ✅ Solves a real use case
- ✅ Well-documented with examples
- ✅ Follows naming conventions
- ✅ Passes automated validation
- ✅ No malicious code or API key leaks

### 2. Update an Existing Extension

Fix bugs, add features, or improve documentation for an extension you authored.

**Process:**
- Update version in `manifest.json` (follow [semver](https://semver.org/))
- Document changes in `CHANGELOG.md`
- Submit PR with clear description

### 3. Report Issues

Found a bug or have a feature request?

- Check [existing issues](https://github.com/danielshue/vault-copilot-extensions/issues)
- Use the [appropriate template](.github/ISSUE_TEMPLATE/)
- Provide clear reproduction steps

### 4. Improve Documentation

Fix typos, clarify instructions, or add examples.

---

## 📝 Extension Submission Process

### Step 1: Fork and Clone

```bash
# Fork via GitHub UI, then:
git clone https://github.com/YOUR_USERNAME/vault-copilot-extensions.git
cd vault-copilot-extensions
```

### Step 2: Create Extension Folder

```bash
# Choose the right folder for your extension type
mkdir -p extensions/agents/my-cool-agent
cd extensions/agents/my-cool-agent
```

**Naming conventions:**
- Use lowercase with hyphens: `my-cool-agent`
- Max 50 characters
- Descriptive and unique
- No version numbers in name

### Step 3: Add Required Files

#### `manifest.json` (Required)

Defines extension metadata. Must validate against [manifest.schema.json](schema/manifest.schema.json).

```json
{
  "$schema": "../../schema/manifest.schema.json",
  "id": "my-cool-agent",
  "name": "My Cool Agent",
  "version": "1.0.0",
  "type": "agent",
  "description": "Brief description (max 200 chars)",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/yourusername"
  },
  "repository": "https://github.com/yourusername/my-cool-agent",
  "license": "MIT",
  "minVaultCopilotVersion": "0.1.0",
  "categories": ["Productivity"],
  "tags": ["automation", "notes"],
  "files": [
    {
      "source": "my-cool-agent.agent.md",
      "installPath": "Reference/Agents/my-cool-agent.agent.md"
    }
  ],
  "tools": ["create_note", "read_note"],
  "dependencies": []
}
```

**Field guidelines:**
- `id`: Unique, lowercase-hyphenated, matches folder name
- `version`: Semantic versioning (x.y.z)
- `type`: One of: `agent`, `voice-agent`, `prompt`, `skill`, `mcp-server`
- `categories`: Pick from [approved list](#categories)
- `tools`: List Vault Copilot tools used (see [tool catalog](docs/TOOLS.md))
- `dependencies`: Extension IDs this extension requires

#### `README.md` (Required)

Becomes the extension detail page on the website.

```markdown
---
layout: extension
title: My Cool Agent
---

# My Cool Agent

![Preview](preview.png)

One-paragraph description of what your extension does and why it's useful.

## Features

- ✨ Feature one with specific benefit
- 🚀 Feature two with specific benefit
- 📝 Feature three with specific benefit

## Installation

Install via the Extension Browser in Vault Copilot:

1. Open Chat View → Gear Icon → Extensions
2. Search for "My Cool Agent"
3. Click **Install**

**Manual installation:**
1. Download `my-cool-agent.agent.md`
2. Copy to `Reference/Agents/` in your vault

## Usage

### Basic Example

```markdown
Invoke the agent by typing:
@my-cool-agent Please help me with...
```

### Advanced Configuration

Customize behavior by editing the frontmatter:

```yaml
---
title: My Cool Agent
setting1: value1
setting2: value2
---
```

## Tools Used

This extension uses the following Vault Copilot tools:

| Tool | Purpose |
|------|----------|
| `create_note` | Creates new notes with templates |
| `read_note` | Reads vault content for context |
| `update_task` | Manages task status |

## Examples

### Example 1: Daily Planning

**Input:**
```
@my-cool-agent Create my daily plan
```

**Output:**
```
Created Reference/Daily Notes/2026-02-05.md with tasks...
```

## Troubleshooting

### Issue: Agent not responding

**Solution:** Ensure the agent file is in `Reference/Agents/` and Vault Copilot is reloaded.

## Changelog

### v1.0.0 (2026-02-05)
- Initial release
- Basic functionality for X, Y, Z

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

Inspired by [related project](https://example.com).
```

#### Extension File (Required)

The actual extension content. Format depends on type:

| Type | Filename Pattern | Format |
|------|------------------|--------|
| Agent | `{name}.agent.md` | Markdown with frontmatter |
| Voice Agent | `{name}.voice-agent.md` | Markdown with frontmatter |
| Prompt | `{name}.prompt.md` | Markdown with frontmatter |
| Skill | `skill.md` | Markdown with frontmatter |
| MCP Server | `mcp-config.json` | JSON config |

**Agent example** (`my-cool-agent.agent.md`):

```markdown
---
title: My Cool Agent
description: Brief description
tools:
  - create_note
  - read_note
---

# Instructions

You are a helpful assistant that helps users with daily planning.

Your goals:
1. Understand the user's schedule and priorities
2. Create structured daily plans
3. Track progress and adjust as needed

# Personality

- Professional but friendly
- Proactive in suggesting improvements
- Concise and action-oriented

# Examples

## Example 1: Morning routine

User: "Help me plan my morning"

Assistant: "I'll create a morning routine note. What time do you typically wake up?"

[...continue with full conversation example...]

# Tools

- Use `create_note` to generate daily planning notes
- Use `read_note` to check existing schedules
- Use `update_task` to mark items complete
```

#### `preview.png` (Recommended)

Screenshot showing your extension in action.

**Requirements:**
- PNG format
- 1280x720 resolution (16:9)
- Shows actual usage or results
- No sensitive information
- File size < 500 KB

#### `CHANGELOG.md` (Optional)

Version history.

```markdown
# Changelog

All notable changes to this extension will be documented in this file.

## [1.1.0] - 2026-02-10
### Added
- New feature X
- Support for Y

### Fixed
- Bug with Z

## [1.0.0] - 2026-02-05
- Initial release
```

#### `LICENSE` (Optional)

Defaults to MIT if not provided.

### Step 4: Validate Locally

```bash
# From repository root
node scripts/validate-extension.js extensions/agents/my-cool-agent

# Output:
# ✅ manifest.json is valid
# ✅ Required files present
# ✅ No security issues detected
# ✅ Extension is ready for submission
```

### Step 5: Submit Pull Request

```bash
git checkout -b add-my-cool-agent
git add extensions/agents/my-cool-agent
git commit -m "feat: add My Cool Agent for daily planning"
git push origin add-my-cool-agent
```

Create PR on GitHub using the template. The PR will:
1. ✅ Run automated validation
2. ✅ Check for duplicates
3. ✅ Security scan
4. ✅ Maintainer review

**PR title format:**
```
feat: add [Extension Name] - [brief description]
```

Examples:
- `feat: add Daily Journal Agent - structured journaling assistant`
- `fix: update Task Manager Agent - resolve date parsing bug`

### Step 6: Address Feedback

Maintainers may request changes:

- Improve documentation
- Fix security issues
- Adjust metadata
- Add examples

Make changes in your fork and push to the same branch.

### Step 7: Merge & Celebrate!

Once approved:
1. PR is merged to `main`
2. Catalog rebuilds automatically
3. Extension appears on website within 5 minutes
4. Users can install via Vault Copilot

---

## 📋 Categories

Choose categories that best describe your extension:

| Category | Use For |
|----------|----------|
| Productivity | Task management, workflows, automation |
| Journaling | Daily notes, reflection, gratitude |
| Research | Academic work, citations, literature review |
| Writing | Drafting, editing, creative writing |
| Task Management | To-dos, projects, deadlines |
| Voice | Voice-activated features, transcription |
| Integration | External APIs, services |
| MCP | Model Context Protocol servers |
| Utility | General helpers, tools |

---

## 🔒 Security Guidelines

### ❌ Prohibited Content

- Hardcoded API keys or credentials
- Malicious code (eval, exec, arbitrary code execution)
- Unauthorized data collection
- Obfuscated code
- External script loading
- Cryptocurrency miners

### ✅ Best Practices

- Store credentials in Obsidian's SecretStorage (document in README)
- Use only documented Vault Copilot APIs
- Minimize network requests
- Disclose all external services used
- Validate user input
- Handle errors gracefully

### 🔍 Automated Security Checks

All PRs are scanned for:

```javascript
// Forbidden patterns:
- /eval\(/
- /Function\(/
- /require\(/
- /__import__/
- /(api[_-]?key|password|secret)\s*=\s*['"][^'"]+/i
- /\b(?:access|secret)_?token\b/i
```

---

## 🧪 Testing Your Extension

### Manual Testing

1. Copy extension file to your test vault
2. Reload Vault Copilot
3. Test all documented features
4. Verify tools work as expected
5. Check error handling

### Test Checklist

- [ ] Extension loads without errors
- [ ] All features work as documented
- [ ] Error messages are helpful
- [ ] No console errors
- [ ] Works on desktop and mobile (if applicable)
- [ ] Preview image displays correctly
- [ ] README is clear and accurate

---

## 💬 Getting Help

- 📖 [Extension Authoring Guide](docs/AUTHORING.md) — Detailed tutorial
- 💬 [Discussions](https://github.com/danielshue/vault-copilot-extensions/discussions) — Ask questions
- 🐛 [Issues](https://github.com/danielshue/vault-copilot-extensions/issues) — Report bugs
- 📧 Email: [extensions@vaultcopilot.com](mailto:extensions@vaultcopilot.com)

---

## 📜 Code of Conduct

Be respectful, inclusive, and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.
```

### Pull Request Template

**`.github/PULL_REQUEST_TEMPLATE.md`**:

```markdown
# Extension Submission

## Extension Details

**Extension Name:** 
**Extension ID:** 
**Type:** <!-- agent | voice-agent | prompt | skill | mcp-server -->
**Version:** 

## Description

<!-- Brief description of what your extension does -->

## Checklist

### Required Files

- [ ] `manifest.json` (validates against schema)
- [ ] `README.md` (with Jekyll frontmatter)
- [ ] Extension file(s) (`.agent.md`, `.prompt.md`, etc.)
- [ ] `preview.png` (recommended, 1280x720)

### Metadata

- [ ] Unique extension ID (not already in catalog)
- [ ] Version follows semver (x.y.z)
- [ ] Categories are from approved list
- [ ] Description is clear and concise (< 200 chars)
- [ ] Tools list matches actual usage
- [ ] Dependencies are declared (if any)

### Documentation

- [ ] README includes installation instructions
- [ ] README includes usage examples
- [ ] README documents all features
- [ ] README includes troubleshooting section
- [ ] README includes changelog

### Quality

- [ ] Extension solves a real use case
- [ ] No hardcoded credentials
- [ ] No malicious code patterns
- [ ] Tested in Obsidian vault
- [ ] Works as documented
- [ ] Error handling is graceful

### Legal

- [ ] Original work or properly attributed
- [ ] License is specified (defaults to MIT)
- [ ] No copyright violations

## Testing Notes

<!-- Describe how you tested this extension -->

**Test environment:**
- Vault Copilot version: 
- Obsidian version: 
- Platform: <!-- Windows | macOS | Linux | iOS | Android -->

**Test scenarios:**
1. 
2. 
3. 

## Screenshots

<!-- Add screenshots showing your extension in action -->

## Additional Context

<!-- Any other information reviewers should know -->

## Related Issues

<!-- Link related issues or feature requests -->
Closes # 
```

### Issue Template

**`.github/ISSUE_TEMPLATE/new-extension.yml`**:

```yaml
name: Extension Submission Request
description: Request to add a new extension to the catalog
title: "[Extension]: "
labels: ["new-extension", "triage"]
assignees: []

body:
  - type: markdown
    attributes:
      value: |
        Thanks for contributing an extension! Please fill out this form to help us understand your submission.
        
        **Note:** Most extensions should be submitted as Pull Requests. Use this issue only if you need help getting started.

  - type: input
    id: extension-name
    attributes:
      label: Extension Name
      description: What is the name of your extension?
      placeholder: "Daily Journal Agent"
    validations:
      required: true

  - type: dropdown
    id: extension-type
    attributes:
      label: Extension Type
      description: What type of extension is this?
      options:
        - Agent
        - Voice Agent
        - Prompt
        - Skill
        - MCP Server
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Description
      description: Briefly describe what your extension does
      placeholder: "Creates structured daily journal entries with reflection prompts and habit tracking"
    validations:
      required: true

  - type: checkboxes
    id: categories
    attributes:
      label: Categories
      description: Which categories apply? (select all that fit)
      options:
        - label: Productivity
        - label: Journaling
        - label: Research
        - label: Writing
        - label: Task Management
        - label: Voice
        - label: Integration
        - label: MCP
        - label: Utility

  - type: textarea
    id: use-cases
    attributes:
      label: Use Cases
      description: What problems does this extension solve?
      placeholder: |
        1. Users want consistent daily journaling habits
        2. Users need reflection prompts
        3. Users want to track habits over time

  - type: textarea
    id: tools
    attributes:
      label: Vault Copilot Tools Used
      description: Which tools does your extension use?
      placeholder: "create_note, read_note, update_task"

  - type: input
    id: repository
    attributes:
      label: Repository URL
      description: Link to your extension repository (if exists)
      placeholder: "https://github.com/yourusername/daily-journal-agent"

  - type: checkboxes
    id: checklist
    attributes:
      label: Checklist
      options:
        - label: I have read the [Contributing Guidelines](../CONTRIBUTING.md)
          required: true
        - label: This is original work or properly attributed
          required: true
        - label: No hardcoded credentials or API keys
          required: true
        - label: I have tested this extension in my vault
          required: true

  - type: dropdown
    id: help-needed
    attributes:
      label: Do you need help?
      description: Are you ready to submit a PR, or do you need guidance?
      options:
        - Ready to submit PR
        - Need help with manifest.json
        - Need help with documentation
        - Need help with testing
        - Just sharing an idea
    validations:
      required: true
```

### Extension Authoring Guide

**`docs/AUTHORING.md`**:

```markdown
# Extension Authoring Guide

A step-by-step tutorial for creating high-quality Vault Copilot extensions.

## Table of Contents

1. [Before You Start](#before-you-start)
2. [Plan Your Extension](#plan-your-extension)
3. [Set Up Your Environment](#set-up-your-environment)
4. [Create the Extension](#create-the-extension)
5. [Test Thoroughly](#test-thoroughly)
6. [Document Everything](#document-everything)
7. [Submit for Review](#submit-for-review)
8. [Maintain Your Extension](#maintain-your-extension)

---

## Before You Start

### Prerequisites

- ✅ Obsidian installed with a test vault
- ✅ Vault Copilot plugin installed and configured
- ✅ Basic Markdown knowledge
- ✅ GitHub account
- ✅ Familiarity with Vault Copilot tools

### Choose Your Extension Type

| Type | Best For | Complexity |
|------|----------|------------|
| **Prompt** | Reusable templates, single-use instructions | ⭐ Easy |
| **Agent** | Multi-turn conversations, complex workflows | ⭐⭐ Medium |
| **Voice Agent** | Voice-activated assistants | ⭐⭐⭐ Advanced |
| **Skill** | Agent capabilities, tool definitions | ⭐⭐⭐ Advanced |
| **MCP Server** | External service integrations | ⭐⭐⭐⭐ Expert |

**Start with a Prompt or Agent** if this is your first extension.

---

## Plan Your Extension

### 1. Define the Problem

What specific problem does your extension solve?

**Good:** "Users struggle to create consistent weekly review notes with the right prompts"

**Too vague:** "Help with notes"

### 2. Identify Your Audience

- Researchers?
- Writers?
- Project managers?
- Students?
- Daily journalers?

Be specific — this shapes your documentation and examples.

### 3. List Required Tools

Which Vault Copilot tools will you use?

```markdown
## Available Tools

### Vault Operations
- `create_note` — Create new notes
- `read_note` — Read note content
- `update_note` — Modify existing notes
- `delete_note` — Remove notes
- `search_vault` — Search across vault
- `list_notes` — List notes by folder

### Task Operations
- `create_task` — Add tasks
- `update_task` — Modify tasks
- `complete_task` — Mark done
- `list_tasks` — Query tasks

### Calendar Operations
- `get_daily_note` — Get daily note
- `create_daily_note` — Create daily note
```

See [Tool Catalog](TOOLS.md) for full list.

### 4. Sketch Examples

Write 2-3 example conversations showing how users will interact with your extension.

**Example:**

```
User: @weekly-review Create my weekly review for this week

Agent: I'll create your weekly review note. I see you completed 12 tasks this week. 
       Let me gather your key accomplishments...
       
       Created: Reference/Weekly Reviews/2026-W06.md
       
       Sections included:
       - Accomplishments (12 completed tasks)
       - Challenges & Learnings
       - Next Week's Priorities
       - Reflection Questions
       
User: Add a section for grateful moments

Agent: Added "Grateful Moments" section to 2026-W06.md. I've included 3 prompts
       to help you reflect on positive experiences this week.
```

---

## Set Up Your Environment

### 1. Fork the Repository

```bash
# Fork via GitHub UI, then:
git clone https://github.com/YOUR_USERNAME/vault-copilot-extensions.git
cd vault-copilot-extensions
```

### 2. Create Your Extension Folder

```bash
# For an agent:
mkdir -p extensions/agents/weekly-review-agent
cd extensions/agents/weekly-review-agent

# Create files:
touch manifest.json
touch README.md
touch weekly-review-agent.agent.md
```

### 3. Install Validation Tools

```bash
# From repository root
npm install
```

---

## Create the Extension

### Step 1: Write manifest.json

Start with the template:

```json
{
  "$schema": "../../schema/manifest.schema.json",
  "id": "weekly-review-agent",
  "name": "Weekly Review Agent",
  "version": "1.0.0",
  "type": "agent",
  "description": "Creates structured weekly review notes with accomplishments, learnings, and priorities.",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/yourusername"
  },
  "repository": "https://github.com/yourusername/weekly-review-agent",
  "license": "MIT",
  "minVaultCopilotVersion": "0.1.0",
  "categories": ["Productivity", "Journaling"],
  "tags": ["weekly-review", "reflection", "gtd"],
  "files": [
    {
      "source": "weekly-review-agent.agent.md",
      "installPath": "Reference/Agents/weekly-review-agent.agent.md"
    }
  ],
  "tools": [
    "create_note",
    "read_note",
    "list_tasks",
    "get_daily_note"
  ],
  "dependencies": []
}
```

**Validate:**

```bash
node scripts/validate-extension.js extensions/agents/weekly-review-agent
```

### Step 2: Write the Extension File

**Agent format** (`weekly-review-agent.agent.md`):

```markdown
---
title: Weekly Review Agent
description: Creates structured weekly review notes
tools:
  - create_note
  - read_note
  - list_tasks
  - get_daily_note
settings:
  reviewDay: Friday
  includeGratitude: true
---

# Role

You are a productivity coach helping users conduct meaningful weekly reviews.

Your purpose:
- Guide users through reflection on the past week
- Capture accomplishments and learnings
- Set priorities for the upcoming week
- Maintain consistency in weekly review format

# Personality

- Encouraging and positive
- Detailed but not overwhelming
- Proactive in suggesting reflection areas
- Patient with users who are learning the habit

# Process

## 1. Gather Data

- Check completed tasks from the past 7 days using `list_tasks`
- Review daily notes using `get_daily_note` for key events
- Identify patterns and trends

## 2. Create Review Note

Use `create_note` with this template:

```markdown
# Weekly Review — Week {week_number}

**Date Range:** {start_date} to {end_date}

## 🎯 Accomplishments

{list completed tasks and achievements}

## 📚 Learnings & Insights

{what did you learn this week?}

## 🚧 Challenges

{what didn't go as planned?}

## 🙏 Grateful For

{3 things you're grateful for}

## ⏭️ Next Week's Priorities

{top 3-5 priorities}

## 📝 Notes

{additional reflections}
```

## 3. Guide Reflection

Ask thoughtful questions:
- "What was your biggest win this week?"
- "What challenge taught you the most?"
- "What would you do differently next week?"
- "What are you most grateful for?"

# Examples

## Example 1: First-time weekly review

User: `@weekly-review Create my weekly review`

Assistant: "I'd love to help you with your first weekly review! I see you completed 
12 tasks this week. Let me create a review note for Week 06 (Jan 29 - Feb 4).

Before I create it, let me ask: What was your biggest accomplishment this week?"

User: "I finished the project proposal and got it approved"

Assistant: "That's excellent! Congratulations on the approval. I'll highlight that. 
Now, what challenge did you face this week?"

[conversation continues...]

Assistant: "I've created your weekly review at Reference/Weekly Reviews/2026-W06.md. 
I've included:
- 12 completed tasks under Accomplishments
- Your project proposal approval highlighted  
- Reflection on time management challenges
- 3 grateful moments
- 5 priorities for next week

Would you like me to add anything else?"

## Example 2: Regular weekly review

User: `@weekly-review Time for my weekly review`

Assistant: "Welcome back! You've been doing weekly reviews for 4 weeks now — 
that's a great habit! 🎉

This week you completed 15 tasks (up from 12 last week). Let me create your 
Week 10 review...

[creates note]

I noticed you mentioned 'need better focus' in last week's review. How did 
that go this week?"

# Error Handling

- If no tasks completed: "I don't see any completed tasks this week. That's okay! 
  Weekly reviews are still valuable for reflection. Shall we focus on learnings 
  and next week's goals?"
  
- If template note exists: "You already have a review for Week {N}. Would you 
  like me to update it or create a new draft?"

# Tool Usage Guidelines

- `list_tasks`: Use with filter `completed:true last:7days`
- `get_daily_note`: Scan last 7 days for key events
- `create_note`: Always create in `Reference/Weekly Reviews/` folder
- `read_note`: Check if review already exists before creating
```

### Step 3: Create Preview Image

Screenshot your extension in action:

1. Use your extension in Obsidian
2. Capture the result (CMD/CTRL + Shift + 4)
3. Resize to 1280x720
4. Save as `preview.png`

**Tools:**
- [Shottr](https://shottr.cc/) (macOS)
- [ShareX](https://getsharex.com/) (Windows)
- [Flameshot](https://flameshot.org/) (Linux)

---

## Test Thoroughly

### Test Checklist

#### Functionality

- [ ] Extension loads without errors
- [ ] All documented features work
- [ ] Tools are called correctly
- [ ] Error handling is graceful
- [ ] Edge cases are handled

#### Documentation

- [ ] Installation instructions are clear
- [ ] Usage examples are accurate
- [ ] All features are documented
- [ ] Troubleshooting section is helpful

#### Cross-Platform (if applicable)

- [ ] Works on desktop (Windows/macOS/Linux)
- [ ] Works on mobile (iOS/Android) or clearly marked desktop-only
- [ ] No platform-specific assumptions

### Test Scenarios

Write specific test cases:

```markdown
## Test Cases

### TC1: Create first weekly review
- Input: "@weekly-review Create my weekly review"
- Expected: Creates note in Reference/Weekly Reviews/ with current week data
- Actual: ✅ Passed

### TC2: Review already exists
- Setup: Week 06 review exists
- Input: "@weekly-review Create review"
- Expected: Asks whether to update or create new draft
- Actual: ✅ Passed

### TC3: No tasks completed
- Setup: No tasks marked complete this week
- Input: "@weekly-review Create review"
- Expected: Still creates review, focuses on reflection
- Actual: ✅ Passed
```

---

## Document Everything

### README.md Template

Use the structure from [CONTRIBUTING.md](../CONTRIBUTING.md#readmemd-required).

**Key sections:**

1. **Hero** — Name, preview image, one-line pitch
2. **Features** — Bullet points with benefits
3. **Installation** — Via extension browser + manual
4. **Usage** — Examples with inputs/outputs
5. **Configuration** — Customization options
6. **Tools** — Table of tools used
7. **Troubleshooting** — Common issues and solutions
8. **Changelog** — Version history
9. **License** — Legal info

### Write for Your Audience

**Bad:** "This agent uses create_note to make files"

**Good:** "Creates a structured weekly review in your vault's Weekly Reviews folder, 
automatically including your completed tasks and prompts for reflection"

### Include Visuals

- Screenshots
- GIFs (< 5 MB)
- Code examples
- Sample outputs

---

## Submit for Review

### Pre-Submission Checklist

- [ ] Validated locally (`node scripts/validate-extension.js ...`)
- [ ] All required files present
- [ ] README frontmatter correct
- [ ] No hardcoded credentials
- [ ] Tested in clean vault
- [ ] Preview image looks good
- [ ] CHANGELOG.md created

### Create Pull Request

```bash
git checkout -b add-weekly-review-agent
git add extensions/agents/weekly-review-agent
git commit -m "feat: add Weekly Review Agent for productivity workflows"
git push origin add-weekly-review-agent
```

Use the PR template on GitHub.

### What Happens Next

1. **Automated Checks** (~2 min)
   - Schema validation
   - Security scan
   - Duplicate detection

2. **Maintainer Review** (~1-3 days)
   - Quality check
   - Documentation review
   - Test in vault

3. **Feedback** (if needed)
   - Address requested changes
   - Push to same branch

4. **Merge**
   - Catalog rebuilds automatically
   - Extension live within 5 minutes

---

## Maintain Your Extension

### Responding to Issues

Users may report bugs or request features:

- Respond within 48 hours (even if just to acknowledge)
- Ask for reproduction steps
- Test thoroughly before releasing fixes

### Releasing Updates

1. Update version in `manifest.json` (follow semver)
2. Document changes in `CHANGELOG.md`
3. Test thoroughly
4. Submit PR with title: `fix: update Weekly Review Agent v1.1.0`

**Semver guidelines:**

- `1.0.0 → 1.0.1` — Bug fix
- `1.0.0 → 1.1.0` — New feature (backward compatible)
- `1.0.0 → 2.0.0` — Breaking change

### Deprecating an Extension

If you can no longer maintain your extension:

1. Mark as deprecated in README
2. Suggest alternatives
3. Submit PR with `DEPRECATED` in title
4. Optional: Find a new maintainer

---

## Tips for Success

### Start Small

- Don't try to solve everything at once
- Focus on one clear use case
- Add features based on user feedback

### Get Feedback Early

- Share drafts in [Discussions](https://github.com/danielshue/vault-copilot-extensions/discussions)
- Ask for testing volunteers
- Iterate based on feedback

### Learn from Others

- Browse [existing extensions](../extensions/)
- See what works well
- Study popular extensions

### Write Great Examples

- Show realistic conversations
- Include edge cases
- Use actual data (but anonymized)

### Be Responsive

- Answer questions promptly
- Fix bugs quickly
- Thank contributors

---

## Resources

- 📖 [Schema Reference](../schema/manifest.schema.json)
- 🛠️ [Tool Catalog](TOOLS.md)
- 💬 [Community Discussions](https://github.com/danielshue/vault-copilot-extensions/discussions)
- 📧 [Email Support](mailto:extensions@vaultcopilot.com)

---

**Happy building! 🚀**
```

### Security Policy

**`SECURITY.md`**:

```markdown
# Security Policy

## Reporting a Vulnerability

**Please DO NOT open public issues for security vulnerabilities.**

Instead, report them privately:

📧 **Email:** security@vaultcopilot.com  
🔒 **Subject:** `[Security] Vulnerability in [extension-name]`

### What to Include

1. **Extension details**
   - Extension ID and version
   - File(s) affected

2. **Vulnerability description**
   - Type (XSS, code injection, credential leak, etc.)
   - Impact and severity
   - Attack scenario

3. **Reproduction steps**
   - Minimal example
   - Expected vs actual behavior

4. **Suggested fix** (if known)

### Response Timeline

- **24 hours:** Initial acknowledgment
- **72 hours:** Severity assessment
- **7 days:** Fix developed and tested
- **14 days:** Patch released and disclosed

---

## Supported Versions

| Component | Version | Supported |
|-----------|---------|:---------:|
| Catalog | Latest | ✅ |
| Extensions | Latest version | ✅ |
| Extensions | Older versions | ⚠️ Upgrade recommended |

---

## Security Review Process

All extension submissions undergo security review before merging.

### Automated Checks

✅ **Pattern scanning** for:
- Hardcoded credentials (API keys, passwords, tokens)
- Code execution functions (`eval`, `exec`, `Function()`)
- External script loading
- Obfuscated code
- Suspicious network requests

✅ **Schema validation:**
- Manifest structure
- Required fields
- Version format

✅ **File validation:**
- File size limits (< 5 MB per file)
- Allowed file types
- Path traversal attempts

### Manual Review

👤 **Maintainer checks:**
- Code logic and intent
- Documentation accuracy
- External dependencies
- Data handling practices

---

## Security Best Practices for Authors

### ❌ Never Include

- Hardcoded API keys or credentials
- User data collection without consent
- External analytics or tracking
- Cryptocurrency miners
- Obfuscated or minified code
- Auto-update mechanisms outside catalog

### ✅ Always Do

- Store credentials in Obsidian's SecretStorage
- Validate all user input
- Handle errors gracefully
- Disclose external network requests
- Use HTTPS for all external calls
- Document security implications

### 🔐 Credential Management

If your extension requires API keys:

**Good:**

```markdown
## Configuration

This extension requires an OpenAI API key.

1. Go to Settings → Vault Copilot → Secrets
2. Add secret: `OPENAI_API_KEY`
3. Enter your API key
4. Extension will access via SecretStorage
```

**Bad:**

```yaml
---
apiKey: sk-1234567890abcdef  # ❌ Never do this!
---
```

### 🌐 Network Requests

Disclose all external services:

```markdown
## Network Usage

This extension makes network requests to:

- **OpenAI API** (`https://api.openai.com`) — For text generation
- **GitHub API** (`https://api.github.com`) — To fetch repository data

All requests use HTTPS. No data is sent to other third parties.
```

### 📝 Content Security

For extensions that generate content:

- Sanitize user input before creating notes
- Avoid injecting untrusted HTML
- Validate file paths to prevent directory traversal

---

## Vulnerability Categories

### Critical (Fix within 24 hours)

- Remote code execution
- Arbitrary file system access
- Credential theft
- Data exfiltration

### High (Fix within 72 hours)

- XSS in user-facing content
- Path traversal
- Unsafe eval usage
- Credential exposure in logs

### Medium (Fix within 7 days)

- Incomplete input validation
- Missing error handling
- Information disclosure

### Low (Fix within 30 days)

- Documentation gaps
- Minor security improvements
- Hardening opportunities

---

## Content Security Policy

Extension detail pages (served via GitHub Pages) use CSP:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://giscus.app;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  frame-src https://giscus.app;
  connect-src 'self' https://api.github.com;
```

This prevents:
- Inline script execution
- Loading external resources
- Clickjacking
- Data injection

---

## Incident Response

If a vulnerability is discovered in a published extension:

### 1. Containment (Immediate)

- Extension marked as **CRITICAL SECURITY ISSUE** in catalog
- Install disabled until patched
- GitHub Security Advisory published

### 2. Notification (Within 24 hours)

- Extension author notified privately
- Users who installed are notified via:
  - Extension browser alert
  - Obsidian notice
  - GitHub Security Advisory subscription

### 3. Remediation (Within 7 days)

- Author submits patched version, OR
- Maintainers submit patch, OR
- Extension is removed from catalog

### 4. Disclosure (After patch)

- CVE assigned (if applicable)
- Public disclosure with:
  - Vulnerability description
  - Affected versions
  - Patch details
  - Mitigation steps

---

## Security Champions

Interested in helping with security reviews?

- Review extension PRs for security issues
- Help authors fix vulnerabilities
- Contribute to validation scripts

Contact: security@vaultcopilot.com

---

## Acknowledgments

We appreciate responsible disclosure. Security researchers who report
vulnerabilities will be credited in:

- Security advisories
- Changelog entries
- Hall of Fame (if desired)

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Obsidian Security Best Practices](https://docs.obsidian.md/security)
```

---

## Part 11: Error Handling & Resilience

Robust error handling ensures a smooth user experience even when things go wrong.

### Catalog Fetch Failures

**Scenario:** Network unavailable or GitHub Pages down.

**ExtensionCatalogService implementation:**

```typescript
export class ExtensionCatalogService {
  private readonly CATALOG_URL = "https://danielshue.github.io/vault-copilot-extensions/catalog/catalog.json";
  private readonly CACHE_KEY = "vault-copilot-extensions-catalog";
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly REQUEST_TIMEOUT = 10000; // 10 seconds
  
  async fetchCatalog(): Promise<CatalogResponse> {
    try {
      // Check cache first
      const cached = await this.getCachedCatalog();
      if (cached && !this.isCacheExpired(cached.timestamp)) {
        return cached.data;
      }
      
      // Fetch fresh catalog
      const response = await requestUrl({
        url: this.CATALOG_URL,
        method: "GET",
        timeout: this.REQUEST_TIMEOUT,
      });
      
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.text}`);
      }
      
      const catalog = response.json as CatalogResponse;
      
      // Validate catalog structure
      if (!this.isValidCatalog(catalog)) {
        throw new Error("Invalid catalog structure");
      }
      
      // Cache successful response
      await this.cacheCatalog(catalog);
      
      return catalog;
      
    } catch (error) {
      console.error("Failed to fetch catalog:", error);
      
      // Fall back to cached data (even if expired)
      const cached = await this.getCachedCatalog();
      if (cached) {
        console.log("Using stale cached catalog");
        new Notice("Using offline catalog (network unavailable)");
        return cached.data;
      }
      
      // No cache available
      new Notice("Cannot load extension catalog. Check your internet connection.", 5000);
      throw new Error("Catalog unavailable and no cached data");
    }
  }
  
  private isValidCatalog(data: unknown): data is CatalogResponse {
    return (
      typeof data === "object" &&
      data !== null &&
      "version" in data &&
      "extensions" in data &&
      Array.isArray((data as CatalogResponse).extensions)
    );
  }
}
```

**User experience:**

- ✅ **Network down:** Uses cached catalog, shows notice
- ✅ **Never connected:** Shows error, offers manual install instructions
- ✅ **Partial response:** Validates structure, falls back to cache

### Download Failures (Mid-Install)

**Scenario:** User installs extension with 3 files, download fails on file 2.

**ExtensionManager implementation:**

```typescript
export class ExtensionManager {
  async installExtension(manifest: ExtensionManifest): Promise<ExtensionInstallResult> {
    const installedFiles: string[] = [];
    
    try {
      // Create temp directory first
      const tempDir = `.obsidian/vault-copilot-temp-${manifest.id}`;
      await this.vault.adapter.mkdir(tempDir);
      
      // Download all files to temp location
      for (const file of manifest.files) {
        const content = await this.downloadFile(file.downloadUrl);
        const tempPath = `${tempDir}/${file.source}`;
        await this.vault.adapter.write(tempPath, content);
      }
      
      // Validate all downloaded files
      for (const file of manifest.files) {
        const tempPath = `${tempDir}/${file.source}`;
        const content = await this.vault.adapter.read(tempPath);
        this.validateFileContent(content, file.source);
      }
      
      // Move files to final location (atomic operation)
      for (const file of manifest.files) {
        const tempPath = `${tempDir}/${file.source}`;
        const finalPath = file.installPath;
        
        // Ensure target directory exists
        const dir = finalPath.substring(0, finalPath.lastIndexOf("/"));
        await this.vault.adapter.mkdir(dir);
        
        // Move file
        const content = await this.vault.adapter.read(tempPath);
        await this.vault.adapter.write(finalPath, content);
        installedFiles.push(finalPath);
      }
      
      // Clean up temp directory
      await this.vault.adapter.rmdir(tempDir, true);
      
      // Update tracking file
      await this.trackInstallation(manifest, installedFiles);
      
      new Notice(`✅ Installed ${manifest.name} v${manifest.version}`);
      
      return {
        success: true,
        extensionId: manifest.id,
        installedFiles,
      };
      
    } catch (error) {
      console.error(`Installation failed for ${manifest.id}:`, error);
      
      // Rollback: delete any files we wrote
      for (const path of installedFiles) {
        try {
          await this.vault.adapter.remove(path);
        } catch (e) {
          console.error(`Failed to rollback ${path}:`, e);
        }
      }
      
      // Clean up temp directory
      try {
        const tempDir = `.obsidian/vault-copilot-temp-${manifest.id}`;
        await this.vault.adapter.rmdir(tempDir, true);
      } catch (e) {
        // Temp cleanup failure is non-critical
      }
      
      new Notice(`❌ Failed to install ${manifest.name}: ${error.message}`, 7000);
      
      return {
        success: false,
        extensionId: manifest.id,
        installedFiles: [],
        error: error.message,
      };
    }
  }
  
  private async downloadFile(url: string): Promise<string> {
    const response = await requestUrl({
      url,
      method: "GET",
      timeout: 30000, // 30 seconds for large files
    });
    
    if (response.status !== 200) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    
    return response.text;
  }
  
  private validateFileContent(content: string, filename: string): void {
    // Security checks
    const forbidden = [
      /eval\(/gi,
      /Function\(/gi,
      /<script>/gi,
      /api[_-]?key\s*[=:]/gi,
      /password\s*[=:]/gi,
    ];
    
    for (const pattern of forbidden) {
      if (pattern.test(content)) {
        throw new Error(`Security check failed for ${filename}: forbidden pattern detected`);
      }
    }
    
    // Size check
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    if (content.length > MAX_FILE_SIZE) {
      throw new Error(`File ${filename} exceeds size limit (5 MB)`);
    }
  }
}
```

**Rollback strategy:**

1. Download all files to temp directory first
2. Validate all files before moving
3. Move to final location (fast, reduced failure window)
4. If any step fails, delete all written files
5. User sees error notice with specific failure reason

### Version Conflicts

**Scenario:** User has v1.0.0 installed, tries to install v0.9.0.

```typescript
async installExtension(manifest: ExtensionManifest): Promise<ExtensionInstallResult> {
  const installed = await this.getInstalledExtensions();
  const existing = installed[manifest.id];
  
  if (existing) {
    const installedVersion = existing.version;
    const newVersion = manifest.version;
    
    // Compare versions
    if (this.isOlderVersion(newVersion, installedVersion)) {
      // Warn about downgrade
      const confirmed = await this.confirmDowngrade(
        manifest.name,
        installedVersion,
        newVersion
      );
      
      if (!confirmed) {
        return {
          success: false,
          extensionId: manifest.id,
          installedFiles: [],
          error: "User cancelled downgrade",
        };
      }
    }
    
    // Uninstall old version first
    await this.uninstallExtension(manifest.id);
  }
  
  // Proceed with installation...
}

private async confirmDowngrade(
  name: string,
  currentVersion: string,
  newVersion: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new ConfirmationModal(
      this.app,
      "Downgrade Extension?",
      `You have ${name} v${currentVersion} installed.\n\n` +
      `Installing v${newVersion} will downgrade to an older version.\n\n` +
      `This may cause compatibility issues. Continue?`,
      () => resolve(true),
      () => resolve(false)
    );
    modal.open();
  });
}
```

### Network Timeout Handling

**Request wrapper with retry logic:**

```typescript
private async fetchWithRetry(
  url: string,
  maxRetries = 3,
  timeout = 10000
): Promise<RequestUrlResponse> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestUrl({
        url,
        method: "GET",
        timeout,
      });
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await this.sleep(delay);
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Part 12: Security Considerations

### Content Security Policy for Detail Pages

**Jekyll configuration** (`_config.yml`):

```yaml
webrick:
  headers:
    Content-Security-Policy: >
      default-src 'self';
      script-src 'self' https://giscus.app;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self';
      frame-src https://giscus.app;
      connect-src 'self' https://api.github.com;
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
```

**GitHub Pages CSP headers** (via `_includes/head.html`):

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://giscus.app;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  frame-src https://giscus.app;
  connect-src 'self' https://api.github.com;
  object-src 'none';
">
```

### File Validation Before Writing

**ExtensionManager validation:**

```typescript
private validateFileContent(content: string, filename: string): void {
  // 1. Size check
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  if (content.length > MAX_FILE_SIZE) {
    throw new Error(`File ${filename} exceeds 5 MB limit`);
  }
  
  // 2. Security pattern detection
  const securityChecks = [
    { pattern: /eval\s*\(/gi, description: "eval() usage" },
    { pattern: /Function\s*\(/gi, description: "Function() constructor" },
    { pattern: /<script[^>]*>/gi, description: "Script tags" },
    { pattern: /on\w+\s*=\s*["']/gi, description: "Inline event handlers" },
    { pattern: /javascript:/gi, description: "JavaScript protocol" },
    { pattern: /api[_-]?key\s*[=:]\s*["'][^"']{20,}/gi, description: "Hardcoded API key" },
    { pattern: /password\s*[=:]\s*["'][^"']+/gi, description: "Hardcoded password" },
    { pattern: /secret[_-]?token\s*[=:]\s*["'][^"']+/gi, description: "Hardcoded token" },
    { pattern: /\\x[0-9a-f]{2}/gi, description: "Hex-encoded strings (possible obfuscation)" },
  ];
  
  for (const check of securityChecks) {
    if (check.pattern.test(content)) {
      throw new Error(
        `Security check failed for ${filename}: ${check.description} detected`
      );
    }
  }
  
  // 3. File type-specific validation
  if (filename.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (e) {
      throw new Error(`Invalid JSON in ${filename}: ${e.message}`);
    }
  }
  
  if (filename.endsWith(".md")) {
    // Check for valid frontmatter structure
    const frontmatterRegex = /^---\n[\s\S]*?\n---/;
    if (!frontmatterRegex.test(content)) {
      console.warn(`${filename} missing frontmatter (may be intentional)`);
    }
  }
  
  // 4. Path traversal check in installPath
  if (filename.includes("..") || filename.includes("~")) {
    throw new Error(`Invalid filename: path traversal detected in ${filename}`);
  }
}
```

### Rate Limiting for Catalog Fetches

**ExtensionCatalogService rate limiter:**

```typescript
export class ExtensionCatalogService {
  private lastFetchTime = 0;
  private readonly MIN_FETCH_INTERVAL = 60 * 1000; // 1 minute
  
  async fetchCatalog(force = false): Promise<CatalogResponse> {
    const now = Date.now();
    
    // Rate limit (unless forced)
    if (!force && (now - this.lastFetchTime) < this.MIN_FETCH_INTERVAL) {
      console.log("Rate limit: using cached catalog");
      const cached = await this.getCachedCatalog();
      if (cached) {
        return cached.data;
      }
    }
    
    this.lastFetchTime = now;
    
    // ... proceed with fetch
  }
}
```

### Handling Malicious Extension Content

**Build script validation** (`scripts/validate-extension.js`):

```javascript
function validateExtensionSecurity(extensionDir) {
  const errors = [];
  const warnings = [];
  
  // Read all files in extension directory
  const files = getAllFiles(extensionDir);
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      { regex: /eval\(/g, severity: 'error', message: 'eval() usage' },
      { regex: /Function\(/g, severity: 'error', message: 'Function() constructor' },
      { regex: /require\(/g, severity: 'warning', message: 'require() - extensions cannot load modules' },
      { regex: /__import__/g, severity: 'error', message: 'Python import detected' },
      { regex: /fetch\(/g, severity: 'warning', message: 'fetch() - must be disclosed' },
      { regex: /XMLHttpRequest/g, severity: 'warning', message: 'XHR - must be disclosed' },
      { regex: /api[_-]?key\s*[=:]\s*["'][^"']{20,}/gi, severity: 'error', message: 'Hardcoded API key' },
      { regex: /sk-[a-zA-Z0-9]{32,}/g, severity: 'error', message: 'OpenAI API key pattern' },
      { regex: /ghp_[a-zA-Z0-9]{36}/g, severity: 'error', message: 'GitHub personal access token' },
    ];
    
    for (const check of suspiciousPatterns) {
      const matches = content.match(check.regex);
      if (matches) {
        const item = {
          file,
          pattern: check.message,
          count: matches.length,
          preview: matches[0].substring(0, 100),
        };
        
        if (check.severity === 'error') {
          errors.push(item);
        } else {
          warnings.push(item);
        }
      }
    }
  }
  
  return { errors, warnings };
}

function getAllFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  
  return files;
}
```

**GitHub Actions PR validation:**

```yaml
- name: Security Scan
  run: |
    node scripts/validate-extension.js "${{ github.event.pull_request.head.ref }}"
    if [ $? -eq 1 ]; then
      echo "::error::Security validation failed"
      exit 1
    fi
```

---

## Part 13: Mobile-Specific Implementation

Vault Copilot supports both desktop and mobile platforms. The extension marketplace must work seamlessly on iOS and Android.

### Detail Page Iframe on Mobile

**Challenge:** Obsidian mobile uses platform-specific webviews with constraints.

**Solution:** Platform-aware iframe rendering.

**ExtensionDetailModal implementation:**

```typescript
export class ExtensionDetailModal extends Modal {
  constructor(
    app: App,
    private manifest: ExtensionManifest
  ) {
    super(app);
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("vc-extension-detail-modal");
    
    // Header
    const header = contentEl.createDiv("vc-extension-detail-header");
    header.createEl("h2", { text: this.manifest.name });
    
    // Main content area
    const main = contentEl.createDiv("vc-extension-detail-main");
    
    // Left: iframe (desktop) or webview (mobile)
    const contentPanel = main.createDiv("vc-extension-detail-content");
    
    if (Platform.isDesktopApp) {
      // Desktop: sandboxed iframe
      this.renderIframe(contentPanel);
    } else {
      // Mobile: use Obsidian's MarkdownRenderer or fetch HTML
      this.renderMobileContent(contentPanel);
    }
    
    // Right: metadata sidebar
    const sidebar = main.createDiv("vc-extension-detail-sidebar");
    this.renderMetadata(sidebar);
  }
  
  private renderIframe(container: HTMLElement) {
    const iframe = container.createEl("iframe", {
      attr: {
        src: this.manifest.detailPageUrl,
        sandbox: "allow-same-origin allow-scripts allow-popups",
        loading: "lazy",
      },
    });
    iframe.addClass("vc-extension-detail-iframe");
  }
  
  private async renderMobileContent(container: HTMLElement) {
    try {
      // Fetch the detail page HTML
      const response = await requestUrl({
        url: this.manifest.detailPageUrl,
        method: "GET",
      });
      
      // Extract content (strip HTML wrapper, keep inner content)
      const parser = new DOMParser();
      const doc = parser.parseFromString(response.text, "text/html");
      const mainContent = doc.querySelector(".extension-content");
      
      if (mainContent) {
        container.innerHTML = mainContent.innerHTML;
      } else {
        // Fallback: show README as markdown
        await this.renderMarkdownFallback(container);
      }
    } catch (error) {
      console.error("Failed to load detail page:", error);
      new Notice("Failed to load extension details");
      container.createEl("p", { 
        text: "Could not load extension details. Please check your connection." 
      });
    }
  }
  
  private async renderMarkdownFallback(container: HTMLElement) {
    // Fetch README.md and render as markdown
    const readmeUrl = `https://raw.githubusercontent.com/danielshue/vault-copilot-extensions/main/extensions/${this.manifest.type}s/${this.manifest.id}/README.md`;
    
    try {
      const response = await requestUrl({ url: readmeUrl });
      await MarkdownRenderer.renderMarkdown(
        response.text,
        container,
        "",
        null as any
      );
    } catch (error) {
      console.error("Fallback README fetch failed:", error);
    }
  }
}\n```

### File Download on iOS/Android

**Challenge:** Mobile file system access is sandboxed.

**Solution:** Use Obsidian's Vault API (works across platforms).

**ExtensionManager download method:**

```typescript
private async downloadFile(url: string): Promise<string> {
  // Use Obsidian's requestUrl (works on all platforms)
  const response = await requestUrl({
    url,
    method: "GET",
    timeout: 30000,
  });
  
  if (response.status !== 200) {
    throw new Error(`Download failed: HTTP ${response.status}`);\n  }\n  \n  return response.text;\n}\n\nprivate async writeFile(path: string, content: string): Promise<void> {\n  // Ensure directory exists
  const dir = path.substring(0, path.lastIndexOf(\"/\"));
  if (dir) {
    try {
      await this.vault.adapter.mkdir(dir);
    } catch (e) {
      // Directory might already exist
    }
  }
  
  // Write file using Vault API (platform-agnostic)
  await this.vault.adapter.write(path, content);
}
```

**Key differences:**

| Platform | Mechanism | Notes |
|----------|-----------|-------|
| **Desktop** | Direct file system access | Fast, can use Node.js APIs |
| **Mobile** | Obsidian Vault API only | Sandboxed, slower |

### Platform Detection

**Use Obsidian's Platform API:**

```typescript
import { Platform } from "obsidian";

export class ExtensionBrowserView extends ItemView {
  onOpen() {
    if (Platform.isMobile) {
      // Mobile-optimized UI
      this.renderMobileLayout();
    } else {
      // Desktop UI with pop-out support
      this.renderDesktopLayout();
    }
  }
  
  private renderMobileLayout() {
    // Simpler layout, larger touch targets
    // No hover states
    // Bottom sheet for actions
  }
  
  private renderDesktopLayout() {
    // Multi-column layout
    // Hover previews
    // Context menus
  }
}
```

### Mobile UI Optimizations

**Touch-friendly cards:**

```css
/* Mobile-specific styles */
@media (max-width: 768px) {
  .vc-extension-card {
    padding: 16px;
    margin-bottom: 12px;
  }
  
  .vc-extension-card-actions button {
    min-height: 44px; /* iOS touch target minimum */
    font-size: 16px;
  }
  
  .vc-extension-search-bar input {
    font-size: 16px; /* Prevents iOS zoom on focus */
  }
}
```

### Desktop-Only Extension Warnings

For MCP servers and other desktop-only extensions:

```typescript
async installExtension(manifest: ExtensionManifest): Promise<ExtensionInstallResult> {
  // Check platform compatibility
  if (manifest.type === "mcp-server" && Platform.isMobile) {
    new Notice(
      `${manifest.name} is only compatible with desktop versions of Obsidian. ` +
      `MCP servers require local process spawning.`,
      8000
    );
    
    return {
      success: false,
      extensionId: manifest.id,
      installedFiles: [],
      error: "Extension is desktop-only",
    };
  }
  
  // ... proceed with installation
}
```

**Catalog filtering:**

```typescript
searchExtensions(filter: ExtensionFilter): ExtensionManifest[] {
  let results = this.cachedCatalog.extensions;
  
  // Filter out incompatible extensions on mobile
  if (Platform.isMobile) {
    results = results.filter(ext => {
      // Desktop-only types
      if (ext.type === "mcp-server") return false;
      
      // Check if extension declares platform requirement
      if (ext.platformRequirement === "desktop") return false;
      
      return true;
    });
  }
  
  // ... apply user filters
  
  return results;
}
```

---

## Part 14: Offline Experience

Users should be able to browse and manage installed extensions without an internet connection.

### Cache Duration Strategy

**ExtensionCatalogService caching:**

```typescript
export class ExtensionCatalogService {
  private readonly CACHE_DURATIONS = {
    // Fresh data: 5 minutes (user actively browsing)
    FRESH: 5 * 60 * 1000,
    
    // Stale data: 24 hours (offline fallback)
    STALE: 24 * 60 * 60 * 1000,
    
    // Max age: 7 days (force refetch after)
    MAX: 7 * 24 * 60 * 60 * 1000,
  };
  
  async fetchCatalog(force = false): Promise<CatalogResponse> {
    const cached = await this.getCachedCatalog();
    const now = Date.now();
    
    if (cached) {
      const age = now - cached.timestamp;
      
      // Use cached if fresh
      if (!force && age < this.CACHE_DURATIONS.FRESH) {
        return cached.data;
      }
      
      // Try to fetch fresh, but fall back to stale cache if offline
      try {
        return await this.fetchFreshCatalog();
      } catch (error) {
        if (age < this.CACHE_DURATIONS.MAX) {
          console.log(`Using stale cache (${Math.floor(age / 3600000)}h old)`);
          return cached.data;
        }
        throw error; // Cache too old
      }
    }
    
    // No cache: must fetch
    return await this.fetchFreshCatalog();
  }
  
  private async cacheCatalog(data: CatalogResponse): Promise<void> {
    const cache = {
      timestamp: Date.now(),
      data,
    };
    
    await this.plugin.saveData({\n      ...this.plugin.settings,\n      catalogCache: cache,\n    });\n  }\n}\n```

### Offline Browsing

**ExtensionBrowserView offline state:**

```typescript
export class ExtensionBrowserView extends ItemView {
  private isOffline = false;
  
  async onOpen() {
    await this.loadCatalog();
    this.render();
  }
  
  private async loadCatalog() {
    try {
      this.catalog = await this.catalogService.fetchCatalog();
      this.isOffline = false;
    } catch (error) {
      console.error("Failed to load catalog:", error);
      this.isOffline = true;
      
      // Try to load installed extensions only
      this.catalog = await this.getOfflineCatalog();
    }
  }
  
  private async getOfflineCatalog(): Promise<CatalogResponse> {
    const installed = await this.extensionManager.getInstalledExtensions();
    
    // Create a minimal catalog with only installed extensions
    return {
      version: "offline",
      generated: new Date().toISOString(),
      extensions: Object.values(installed).map(ext => ({
        id: ext.id,
        version: ext.version,
        // ... minimal metadata from tracking file
      })),
      categories: [],
      featured: [],
    };
  }
  
  private render() {
    const { containerEl } = this;
    containerEl.empty();
    
    // Show offline banner if applicable
    if (this.isOffline) {
      this.renderOfflineBanner();
    }
    
    // Render installed extensions (always available)
    this.renderInstalledSection();
    
    // Render browse sections (only if online)
    if (!this.isOffline) {
      this.renderFeaturedSection();
      this.renderAllExtensionsSection();
    }
  }
  
  private renderOfflineBanner() {
    const banner = this.containerEl.createDiv("vc-offline-banner");
    banner.innerHTML = `
      <div class="vc-offline-icon">\u26a0\ufe0f</div>
      <div class="vc-offline-text">
        <strong>Offline Mode</strong>
        <p>You can manage installed extensions, but browsing new extensions 
           requires an internet connection.</p>
      </div>
      <button class="vc-offline-retry">Retry</button>
    `;
    
    banner.querySelector(".vc-offline-retry")?.addEventListener("click", () => {
      this.loadCatalog();
      this.render();
    });
  }
}\n```

### Offline UI States

**CSS for offline indicators:**

```css
/* Offline banner */
.vc-offline-banner {
  background: var(--background-modifier-warning);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.vc-offline-icon {
  font-size: 24px;
}

.vc-offline-text {
  flex: 1;
}

.vc-offline-text strong {
  display: block;
  margin-bottom: 4px;
}

.vc-offline-text p {
  margin: 0;
  opacity: 0.8;
  font-size: 14px;
}

.vc-offline-retry {
  padding: 8px 16px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* Disabled state for unavailable actions */
.vc-extension-card-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vc-extension-card.offline {
  opacity: 0.7;
}
```

### Installed Extensions Always Available

**Even offline, users can:**

- \u2705 View installed extensions
- \u2705 Read extension documentation (stored locally)
- \u2705 Uninstall extensions
- \u2705 Use installed extensions

**Not available offline:**

- \u274c Browse new extensions
- \u274c Install new extensions
- \u274c Check for updates
- \u274c View ratings/comments

---

## Part 15: Update Notifications

Users need to know when extension updates are available.

### Update Detection

**ExtensionManager update checker:**

```typescript
export class ExtensionManager {
  async checkForUpdates(): Promise<ExtensionUpdate[]> {
    const updates: ExtensionUpdate[] = [];
    
    try {
      const catalog = await this.catalogService.fetchCatalog();
      const installed = await this.getInstalledExtensions();
      
      for (const [id, installedExt] of Object.entries(installed)) {
        const catalogExt = catalog.extensions.find(e => e.id === id);
        
        if (!catalogExt) {
          // Extension removed from catalog
          continue;
        }
        
        if (this.isNewerVersion(catalogExt.version, installedExt.version)) {
          updates.push({
            extensionId: id,
            extensionName: catalogExt.name,
            currentVersion: installedExt.version,\n            availableVersion: catalogExt.version,
            manifest: catalogExt,
          });
        }
      }
      
      return updates;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      return [];
    }
  }
  
  private isNewerVersion(available: string, current: string): boolean {
    const aParts = available.split(".").map(Number);
    const cParts = current.split(".").map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (aParts[i] > cParts[i]) return true;
      if (aParts[i] < cParts[i]) return false;
    }
    
    return false;
  }
}\n\ninterface ExtensionUpdate {
  extensionId: string;
  extensionName: string;
  currentVersion: string;
  availableVersion: string;
  manifest: ExtensionManifest;
}
```

### Update Check Timing

**Check for updates on:**

1. **Plugin startup** (if setting enabled)
2. **User clicks "Check for Updates"** in Extension Browser
3. **Background interval** (every 24 hours if vault is open)

```typescript
export default class VaultCopilotPlugin extends Plugin {
  async onload() {
    // ... other initialization
    
    // Check for updates on startup (if enabled)
    if (this.settings.checkUpdatesOnStartup) {
      setTimeout(() => this.checkExtensionUpdates(), 5000); // Delay to not slow startup
    }
    
    // Background update check (every 24 hours)
    this.registerInterval(
      window.setInterval(() => {
        this.checkExtensionUpdates();
      }, 24 * 60 * 60 * 1000)
    );
  }
  
  private async checkExtensionUpdates() {
    const updates = await this.extensionManager.checkForUpdates();
    
    if (updates.length > 0) {
      this.notifyUpdatesAvailable(updates);
    }
  }
  
  private notifyUpdatesAvailable(updates: ExtensionUpdate[]) {
    const count = updates.length;
    const message = count === 1
      ? `Update available for ${updates[0].extensionName}`
      : `${count} extension updates available`;
    
    new Notice(message, 7000);
    
    // Store updates for badge display
    this.availableUpdates = updates;
    
    // Trigger UI update (badge on gear icon)
    this.app.workspace.trigger("vault-copilot:updates-available");
  }
}
```

### UI Indicators

**Badge on Gear Icon:**

```typescript
export class CopilotChatView extends ItemView {
  private updateBadge: HTMLElement | null = null;
  
  onload() {
    super.onload();
    
    // Listen for update notifications
    this.registerEvent(
      this.app.workspace.on("vault-copilot:updates-available", () => {
        this.showUpdateBadge();
      })
    );
  }
  
  private renderToolbar() {
    // ... existing toolbar code
    
    const settingsBtn = toolbar.createEl("button", {
      cls: "vc-toolbar-btn vc-settings-btn",
      attr: { "aria-label": "Settings" },
    });
    settingsBtn.innerHTML = GEAR_ICON_SVG;
    settingsBtn.addEventListener("click", (e) => this.showSettingsMenu(e));
    
    // Add update badge container
    this.updateBadge = settingsBtn.createDiv("vc-update-badge");
    this.updateBadge.style.display = "none";
  }
  
  private showUpdateBadge() {
    if (this.updateBadge) {
      const count = this.plugin.availableUpdates?.length || 0;
      this.updateBadge.setText(count.toString());
      this.updateBadge.style.display = "flex";
    }
  }
  
  private hideUpdateBadge() {
    if (this.updateBadge) {
      this.updateBadge.style.display = "none";
    }
  }
}
```

**CSS for badge:**

```css
.vc-update-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
}
```

**Toast notification:**

```typescript
private notifyUpdatesAvailable(updates: ExtensionUpdate[]) {
  const fragment = document.createDocumentFragment();
  
  const text = document.createElement("span");
  text.textContent = updates.length === 1
    ? `Update available: ${updates[0].extensionName} v${updates[0].availableVersion}`
    : `${updates.length} extension updates available`;
  fragment.appendChild(text);
  
  const link = document.createElement("a");
  link.textContent = "View Updates";
  link.href = "#";
  link.style.marginLeft = "8px";
  link.style.textDecoration = "underline";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    this.openExtensionBrowser({ showUpdates: true });
  });
  fragment.appendChild(link);
  
  new Notice(fragment, 10000);
}
```

### Update All vs Individual Update

**ExtensionBrowserView update actions:**

```typescript
private renderInstalledSection() {
  const section = this.containerEl.createDiv("vc-extension-section");
  
  const header = section.createDiv("vc-extension-section-header");
  header.createEl("h3", { text: `Installed (${installedCount})` });
  
  // Show "Update All" button if updates available
  if (this.availableUpdates.length > 0) {
    const updateAllBtn = header.createEl("button", {
      cls: "vc-update-all-btn",
      text: `Update All (${this.availableUpdates.length})`,
    });
    updateAllBtn.addEventListener("click", () => this.updateAllExtensions());
  }
  
  // ... render cards
}

private async updateAllExtensions() {
  const updates = this.availableUpdates;
  
  new Notice(`Updating ${updates.length} extensions...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const update of updates) {
    try {
      await this.extensionManager.updateExtension(update.extensionId);
      successCount++;
    } catch (error) {
      console.error(`Failed to update ${update.extensionName}:`, error);
      failCount++;
    }
  }
  
  new Notice(
    `Updated ${successCount} extension(s). ` +
    (failCount > 0 ? `${failCount} failed.` : ""),
    5000
  );
  
  // Refresh UI
  await this.loadCatalog();
  this.render();
}

private async updateExtension(extensionId: string) {
  const update = this.availableUpdates.find(u => u.extensionId === extensionId);
  if (!update) return;
  
  try {
    await this.extensionManager.updateExtension(extensionId);
    new Notice(`\u2705 Updated ${update.extensionName} to v${update.availableVersion}`);
    
    // Remove from updates list
    this.availableUpdates = this.availableUpdates.filter(u => u.extensionId !== extensionId);
    
    // Refresh UI
    this.render();
  } catch (error) {
    new Notice(`\u274c Failed to update ${update.extensionName}: ${error.message}`);
  }
}
```

---

## Part 16: Dependency Resolution

Extensions may depend on other extensions (e.g., a voice agent that requires a specific skill).

### Declaring Dependencies

**In manifest.json:**

```json
{
  \"id\": \"advanced-task-agent\",
  \"dependencies\": [
    \"task-parser-skill\",
    \"calendar-integration-skill\"
  ]
}
```

### Dependency Installation

**ExtensionManager handles dependencies:**

```typescript
async installExtension(manifest: ExtensionManifest): Promise<ExtensionInstallResult> {
  // Check dependencies first
  if (manifest.dependencies && manifest.dependencies.length > 0) {
    const missingDeps = await this.checkDependencies(manifest.dependencies);
    
    if (missingDeps.length > 0) {
      const installDeps = await this.confirmDependencyInstall(
        manifest.name,
        missingDeps
      );
      
      if (!installDeps) {
        return {
          success: false,
          extensionId: manifest.id,
          installedFiles: [],
          error: \"User cancelled: missing dependencies\",
        };
      }
      
      // Install dependencies first
      await this.installDependencies(missingDeps);
    }
  }
  
  // Proceed with main extension installation
  return await this.installExtensionFiles(manifest);
}

private async checkDependencies(depIds: string[]): Promise<ExtensionManifest[]> {
  const missing: ExtensionManifest[] = [];
  const installed = await this.getInstalledExtensions();
  const catalog = await this.catalogService.fetchCatalog();
  
  for (const depId of depIds) {
    if (!installed[depId]) {
      // Dependency not installed, find in catalog
      const depManifest = catalog.extensions.find(e => e.id === depId);
      
      if (!depManifest) {
        throw new Error(`Dependency not found in catalog: ${depId}`);
      }
      
      missing.push(depManifest);
    }
  }
  
  return missing;
}

private async confirmDependencyInstall(
  extensionName: string,
  dependencies: ExtensionManifest[]
): Promise<boolean> {
  const depList = dependencies.map(d => `  \u2022 ${d.name} v${d.version}`).join(\"\\n\");
  
  return new Promise((resolve) => {
    const modal = new ConfirmationModal(
      this.app,
      \"Install Dependencies?\",
      `${extensionName} requires the following extensions:\\n\\n${depList}\\n\\n` +
      `Install dependencies automatically?`,
      () => resolve(true),
      () => resolve(false)
    );
    modal.open();
  });
}

private async installDependencies(dependencies: ExtensionManifest[]): Promise<void> {
  for (const dep of dependencies) {
    new Notice(`Installing dependency: ${dep.name}...`);
    const result = await this.installExtension(dep);
    
    if (!result.success) {
      throw new Error(`Failed to install dependency ${dep.name}: ${result.error}`);
    }
  }
}
```

### Install Order

**Topological sort for dependency order:**

```typescript
private async getInstallOrder(manifest: ExtensionManifest): Promise<ExtensionManifest[]> {
  const order: ExtensionManifest[] = [];
  const visited = new Set<string>();
  const catalog = await this.catalogService.fetchCatalog();
  
  const visit = async (ext: ExtensionManifest) => {
    if (visited.has(ext.id)) return;
    visited.add(ext.id);
    
    // Visit dependencies first
    if (ext.dependencies && ext.dependencies.length > 0) {
      for (const depId of ext.dependencies) {
        const depManifest = catalog.extensions.find(e => e.id === depId);
        if (!depManifest) {
          throw new Error(`Dependency not found: ${depId}`);
        }
        await visit(depManifest);
      }
    }
    
    order.push(ext);
  };
  
  await visit(manifest);
  return order;
}
```

### Circular Dependency Detection

**Detect cycles before installation:**

```typescript
private detectCircularDependencies(\n  extensionId: string,\n  path: string[] = []\n): string[] | null {\n  if (path.includes(extensionId)) {\n    // Circular dependency found\n    return [...path, extensionId];\n  }\n  \n  const manifest = this.catalog.extensions.find(e => e.id === extensionId);\n  if (!manifest || !manifest.dependencies) {\n    return null;\n  }\n  \n  const newPath = [...path, extensionId];\n  \n  for (const depId of manifest.dependencies) {\n    const cycle = this.detectCircularDependencies(depId, newPath);\n    if (cycle) {\n      return cycle;\n    }\n  }\n  \n  return null;\n}\n\nasync installExtension(manifest: ExtensionManifest): Promise<ExtensionInstallResult> {\n  // Check for circular dependencies\n  const cycle = this.detectCircularDependencies(manifest.id);\n  if (cycle) {\n    const cycleStr = cycle.join(\" \u2192 \");\n    new Notice(\n      `Cannot install ${manifest.name}: circular dependency detected (${cycleStr})`,\n      8000\n    );\n    \n    return {\n      success: false,\n      extensionId: manifest.id,\n      installedFiles: [],\n      error: `Circular dependency: ${cycleStr}`,\n    };\n  }\n  \n  // ... proceed with installation\n}\n```\n\n### Dependency Uninstall Protection\n\n**Warn when uninstalling extensions that others depend on:**\n\n```typescript\nasync uninstallExtension(extensionId: string): Promise<boolean> {\n  // Check if other installed extensions depend on this one\n  const dependents = await this.findDependents(extensionId);\n  \n  if (dependents.length > 0) {\n    const depList = dependents.map(d => `  \u2022 ${d.name}`).join(\"\\n\");\n    const confirmed = await this.confirmUninstallWithDependents(\n      extensionId,\n      depList\n    );\n    \n    if (!confirmed) {\n      return false;\n    }\n  }\n  \n  // Proceed with uninstall\n  // ...\n}\n\nprivate async findDependents(extensionId: string): Promise<ExtensionManifest[]> {\n  const dependents: ExtensionManifest[] = [];\n  const installed = await this.getInstalledExtensions();\n  const catalog = await this.catalogService.fetchCatalog();\n  \n  for (const installedId of Object.keys(installed)) {\n    const manifest = catalog.extensions.find(e => e.id === installedId);\n    if (manifest?.dependencies?.includes(extensionId)) {\n      dependents.push(manifest);\n    }\n  }\n  \n  return dependents;\n}\n\nprivate async confirmUninstallWithDependents(\n  extensionId: string,\n  dependentList: string\n): Promise<boolean> {\n  return new Promise((resolve) => {\n    const modal = new ConfirmationModal(\n      this.app,\n      \"Uninstall Dependency?\",\n      `The following extensions depend on this one:\\n\\n${dependentList}\\n\\n` +\n      `Uninstalling may break these extensions. Continue?`,\n      () => resolve(true),\n      () => resolve(false)\n    );\n    modal.open();\n  });\n}\n```\n\n---\n\n## Part 17: MCP Server Management\n\nMCP (Model Context Protocol) servers require special handling due to their configuration format.\n\n### MCP Configuration Structure\n\nMCP servers are configured in `.obsidian/mcp-servers.json`:\n\n```json\n{\n  \"mcpServers\": {\n    \"filesystem\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@modelcontextprotocol/server-filesystem\", \"Z:/vaults/my-vault\"]\n    },\n    \"weather\": {\n      \"command\": \"node\",\n      \"args\": [\"Z:/mcp-servers/weather/server.js\"],\n      \"env\": {\n        \"WEATHER_API_KEY\": \"${WEATHER_API_KEY}\"\n      }\n    }\n  }\n}\n```\n\n### Merging MCP Server Config\n\n**ExtensionManager MCP handling:**\n\n```typescript\nprivate async installMcpServer(manifest: ExtensionManifest): Promise<string[]> {\n  const mcpConfigFile = manifest.files.find(f => f.source === \"mcp-config.json\");\n  if (!mcpConfigFile) {\n    throw new Error(\"MCP server manifest missing mcp-config.json\");\n  }\n  \n  // Download MCP config\n  const configContent = await this.downloadFile(mcpConfigFile.downloadUrl);\n  const mcpConfig = JSON.parse(configContent);\n  \n  // Read existing MCP servers config\n  const mcpServersPath = \".obsidian/mcp-servers.json\";\n  let existingConfig: McpServersConfig;\n  \n  try {\n    const existing = await this.vault.adapter.read(mcpServersPath);\n    existingConfig = JSON.parse(existing);\n  } catch (e) {\n    // File doesn't exist, create new\n    existingConfig = { mcpServers: {} };\n  }\n  \n  // Check for conflicts\n  const serverName = Object.keys(mcpConfig.mcpServers)[0];\n  if (existingConfig.mcpServers[serverName]) {\n    const overwrite = await this.confirmMcpOverwrite(serverName);\n    if (!overwrite) {\n      throw new Error(\"User cancelled: MCP server already exists\");\n    }\n    \n    // Backup existing config\n    await this.backupMcpConfig(serverName, existingConfig.mcpServers[serverName]);\n  }\n  \n  // Merge configs\n  existingConfig.mcpServers = {\n    ...existingConfig.mcpServers,\n    ...mcpConfig.mcpServers,\n  };\n  \n  // Write updated config\n  await this.vault.adapter.write(\n    mcpServersPath,\n    JSON.stringify(existingConfig, null, 2)\n  );\n  \n  new Notice(`MCP server \"${serverName}\" installed. Restart Vault Copilot to activate.`);\n  \n  return [mcpServersPath];\n}\n\nprivate async confirmMcpOverwrite(serverName: string): Promise<boolean> {\n  return new Promise((resolve) => {\n    const modal = new ConfirmationModal(\n      this.app,\n      \"MCP Server Already Exists\",\n      `An MCP server named \"${serverName}\" is already configured.\\n\\n` +\n      `Your existing configuration will be backed up to:\\n` +\n      `.obsidian/mcp-servers-backup.json\\n\\n` +\n      `Replace the existing server?`,\n      () => resolve(true),\n      () => resolve(false)\n    );\n    modal.open();\n  });\n}\n\nprivate async backupMcpConfig(serverName: string, config: any): Promise<void> {\n  const backupPath = \".obsidian/mcp-servers-backup.json\";\n  let backup: Record<string, any> = {};\n  \n  try {\n    const existing = await this.vault.adapter.read(backupPath);\n    backup = JSON.parse(existing);\n  } catch (e) {\n    // Backup file doesn't exist\n  }\n  \n  backup[`${serverName}-${Date.now()}`] = config;\n  \n  await this.vault.adapter.write(\n    backupPath,\n    JSON.stringify(backup, null, 2)\n  );\n}\n```\n\n### Clean MCP Server Uninstall\n\n**Remove MCP server from config without breaking others:**\n\n```typescript\nprivate async uninstallMcpServer(extensionId: string): Promise<void> {\n  const tracking = await this.getInstalledExtensions();\n  const extension = tracking[extensionId];\n  \n  if (!extension) {\n    throw new Error(\"Extension not found in tracking file\");\n  }\n  \n  // Determine server name from extension ID\n  // (stored in tracking file during install)\n  const serverName = extension.mcpServerName;\n  if (!serverName) {\n    throw new Error(\"MCP server name not found in tracking data\");\n  }\n  \n  // Read MCP config\n  const mcpServersPath = \".obsidian/mcp-servers.json\";\n  const configContent = await this.vault.adapter.read(mcpServersPath);\n  const config: McpServersConfig = JSON.parse(configContent);\n  \n  // Remove server\n  if (!config.mcpServers[serverName]) {\n    console.warn(`MCP server \"${serverName}\" not found in config`);\n  } else {\n    delete config.mcpServers[serverName];\n    \n    // Write updated config\n    await this.vault.adapter.write(\n      mcpServersPath,\n      JSON.stringify(config, null, 2)\n    );\n  }\n  \n  new Notice(`MCP server \"${serverName}\" removed. Restart Vault Copilot to apply.`);\n}\n```\n\n### Desktop-Only Warning for MCP Extensions\n\n**Show clear warning before attempting install:**\n\n```typescript\nasync installExtension(manifest: ExtensionManifest): Promise<ExtensionInstallResult> {\n  // Desktop-only check for MCP servers\n  if (manifest.type === \"mcp-server\") {\n    if (Platform.isMobile) {\n      new Notice(\n        `${manifest.name} is a Model Context Protocol (MCP) server.\\n\\n` +\n        `MCP servers require local process spawning and are only compatible ` +\n        `with desktop versions of Obsidian (Windows, macOS, Linux).\\n\\n` +\n        `This feature is not available on mobile devices.`,\n        10000\n      );\n      \n      return {\n        success: false,\n        extensionId: manifest.id,\n        installedFiles: [],\n        error: \"MCP servers are desktop-only\",\n      };\n    }\n    \n    // Additional warning even on desktop\n    const confirmed = await this.confirmMcpInstall(manifest);\n    if (!confirmed) {\n      return {\n        success: false,\n        extensionId: manifest.id,\n        installedFiles: [],\n        error: \"User cancelled MCP installation\",\n      };\n    }\n  }\n  \n  // ... proceed with installation\n}\n\nprivate async confirmMcpInstall(manifest: ExtensionManifest): Promise<boolean> {\n  return new Promise((resolve) => {\n    const modal = new ConfirmationModal(\n      this.app,\n      \"Install MCP Server?\",\n      `${manifest.name} is a Model Context Protocol server that will:\\n\\n` +\n      `\u2022 Spawn a local process on your system\\n` +\n      `\u2022 Modify .obsidian/mcp-servers.json\\n` +\n      `\u2022 Require a Vault Copilot restart to activate\\n\\n` +\n      `Only install MCP servers from trusted sources.\\n\\n` +\n      `Continue?`,\n      () => resolve(true),\n      () => resolve(false)\n    );\n    modal.open();\n  });\n}\n```\n\n**Badge on extension cards:**\n\n```typescript\nprivate renderExtensionCard(manifest: ExtensionManifest): HTMLElement {\n  const card = createDiv(\"vc-extension-card\");\n  \n  // ... card content\n  \n  // Add desktop-only badge for MCP servers\n  if (manifest.type === \"mcp-server\") {\n    const badge = card.createDiv(\"vc-extension-badge vc-desktop-only\");\n    badge.innerHTML = `\ud83d\udda5\ufe0f Desktop Only`;\n  }\n  \n  return card;\n}\n```\n\n**CSS:**\n\n```css\n.vc-desktop-only {\n  background: var(--background-modifier-warning);\n  color: var(--text-normal);\n  padding: 4px 8px;\n  border-radius: 4px;\n  font-size: 12px;\n  font-weight: 500;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n}\n```\n\n---\n\n## Appendix: Categories\n\n| Category | Description |\n|----------|-------------|\n| Productivity | Task management, time tracking, workflows |\n| Journaling | Daily notes, reflection, gratitude |\n| Research | Academic, note-taking, citations |\n| Writing | Drafting, editing, content creation |\n| Task Management | To-dos, projects, deadlines |\n| Voice | Voice agents, transcription |\n| Integration | External services, APIs |\n| MCP | Model Context Protocol servers |\n| Utility | Helper tools, automation |
