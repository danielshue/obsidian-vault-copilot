# Extension Management Scripts

This directory contains scripts for managing extensions in the Vault Copilot catalog.

## Table of Contents

- [Adding Extensions](#adding-extensions)
- [Removing Extensions](#removing-extensions)
- [Building the Catalog](#building-the-catalog)
- [Validating Extensions](#validating-extensions)

## Adding Extensions

Extensions are typically added through the plugin's submission workflow or via pull requests. See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

## Removing Extensions

Use the `remove-extension.cjs` script to remove an extension from the catalog and website.

> **💡 Quick Start with GitHub Copilot:** Use the `.github/prompts/remove-extension.prompt.md` prompt in VS Code. Just tell Copilot "Remove the [extension-name] extension" and it will guide you through the process safely.

### Usage

```bash
node scripts/remove-extension.cjs [options] <type> <id>
```

### Arguments

- **type**: Extension type (`agent`, `prompt`, `voice-agent`, `skill`, or `mcp-server`)
- **id**: Extension ID (e.g., `daily-journal`, `task-management-prompt`)

### Options

- `--dry-run`: Preview what would be removed without actually doing it
- `--yes`, `-y`: Skip confirmation prompt
- `--no-commit`: Don't automatically commit changes
- `--help`, `-h`: Show help message

### Examples

**Preview removal (safe - no changes made):**
```bash
node scripts/remove-extension.cjs --dry-run agent daily-journal
```

**Remove an agent:**
```bash
node scripts/remove-extension.cjs agent daily-journal
```

**Remove without confirmation:**
```bash
node scripts/remove-extension.cjs --yes prompt task-management
```

**Remove but don't auto-commit (for manual review):**
```bash
node scripts/remove-extension.cjs --no-commit agent tutor
```

### What it does

1. ✅ Validates the extension type and ID
2. 📋 Lists all files that will be removed
3. ❓ Asks for confirmation (unless `--yes` flag is used)
4. 🗑️ Removes the extension directory
5. 🔄 Rebuilds `catalog/catalog.json`
6. 💾 Commits the changes (unless `--no-commit` flag is used)

After running, push to master to trigger automatic redeployment:
```bash
git push
```

The GitHub Actions workflow will automatically:
- Regenerate the catalog
- Remove the extension pages from the website
- Redeploy to GitHub Pages

## Building the Catalog

### Rebuild catalog.json

```bash
node scripts/build-catalog.cjs
```

Scans all extension directories and generates `catalog/catalog.json` with:
- Extension metadata from manifests
- Download URLs
- File sizes
- Statistics and featured extensions

### Generate extension pages

```bash
node scripts/generate-extension-pages.cjs
```

Creates Jekyll-compatible `index.md` files for each extension with proper front matter.

### Full rebuild (catalog + pages)

```bash
node scripts/build-catalog.cjs && node scripts/generate-extension-pages.cjs
```

## Validating Extensions

### Validate a specific extension

```bash
node scripts/validate-extension.cjs extensions/agents/daily-journal-agent
```

### Validate in PR mode (for GitHub Actions)

```bash
node scripts/validate-extension.cjs --pr
```

Checks:
- ✅ Required files (manifest.json, README.md, main extension file)
- ✅ Manifest schema compliance
- ✅ File size limits
- ✅ ID uniqueness in catalog
- ⚠️ Warnings for missing optional fields

## Automation

All scripts are integrated into the GitHub Actions workflows:

- **[validate-pr.yml](../.github/workflows/validate-pr.yml)**: Validates extensions on PRs
- **[build-and-deploy.yml](../.github/workflows/build-and-deploy.yml)**: Rebuilds catalog and deploys on merge to master

### Workflow triggers

- **On PR**: Extension validation runs automatically
- **On merge**: Catalog rebuilds and site redeploys automatically
- **Manual**: Can trigger workflows via GitHub Actions UI

## Troubleshooting

### Extension not showing on site after removal

1. Check that changes were pushed: `git log --oneline -5`
2. Verify workflow ran successfully: `gh run list --workflow=build-and-deploy.yml --limit 3`
3. Hard refresh the catalog page (Ctrl+Shift+R)

### Catalog build errors

Run with debug logging:
```bash
DEBUG=1 node scripts/build-catalog.cjs
```

### Permission errors

Ensure you have write access to the repository and the extension directory exists.

## Development

All scripts are written in CommonJS (`.cjs`) for Node.js compatibility and include:
- Input validation
- Error handling
- Dry-run modes (where applicable)
- Detailed logging

See individual script files for implementation details.
