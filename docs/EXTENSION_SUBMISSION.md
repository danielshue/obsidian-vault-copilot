---
layout: docs
title: Extension submission
permalink: /docs/extension-submission/
---

# Extension Submission Guide

This guide explains how to submit extensions to the Vault Copilot marketplace.

## Overview

Vault Copilot includes an in-app submission wizard (desktop only) that automates creating a pull request to the official [obsidian-vault-copilot](https://github.com/danielshue/obsidian-vault-copilot) repository.

Under the hood, the submission workflow is implemented by `GitHubSubmissionService`, which shells out to the GitHub CLI (`gh`) and `git` to:

- Validate your extension folder
- Create or reuse your fork
- Create a branch
- Copy your extension files into the repo under `extensions/...`
- Commit, push, and open a pull request

## Prerequisites

1. **GitHub CLI (`gh`)**: Must be installed and authenticated
   ```bash
   gh auth login
   ```

2. **Git**: Must be installed and available on your PATH.

3. **Desktop + local vault**: The in-app submission wizard requires a local vault on desktop (it needs filesystem access and runs `gh`/`git`).

4. **Extension files**:
  - The type-specific extension file is required (examples: `my-agent.agent.md`, `my-prompt.prompt.md`, `skill.md`, `mcp-config.json`).
  - `manifest.json` and `README.md` are required for validation.
    - If you use the in-app wizard, it can generate `manifest.json` and `README.md` in a temporary workspace if they’re missing.

5. **Submitter tracking (recommended)**: Add `submittedBy` to your `manifest.json` to lock down who can publish future updates.
  - If you want this field set, create your own `manifest.json` in the extension folder before submitting (the wizard won’t overwrite an existing manifest).
  - See: [Extension update validation]({{ '/docs/extension-update-validation/' | relative_url }})

## In-app submission (recommended)

In Obsidian (desktop), run the command:

- **Submit Extension to Catalog**

The wizard guides you through selecting an extension folder, optionally generating/cleaning up content, and then opening a PR.

### What the wizard does

1. Prepares a temporary working folder (so your vault isn’t mutated during submission)
2. Ensures `manifest.json`, `README.md`, and preview assets exist in the working folder
3. Runs the GitHub workflow:
  - Fork (if needed)
  - Create a branch
  - Copy your extension under `extensions/<type-folder>/<id>/`
  - Commit + push
  - Create the PR

Notes:

- The wizard is **desktop-only**.
- It runs `gh`/`git` locally and uses a temporary folder under your OS temp directory.

## Programmatic / headless usage (advanced)

If you’re automating submissions outside Obsidian, you can call `GitHubSubmissionService` directly.

## Workflow Steps

The submission service executes the following workflow:

1. **Validation** - Validates extension files and manifest
2. **GitHub Setup** - Checks CLI authentication and fork existence
3. **Branch Creation** - Creates a new branch in your fork
4. **File Copy** - Copies extension files to the appropriate directory
5. **Commit & Push** - Commits and pushes changes to your fork
6. **Pull Request** - Creates a PR to the upstream repository

## Usage Example

### Basic Submission

```typescript
import { GitHubSubmissionService } from "../src/extensions/GitHubSubmissionService";

// Initialize the service
const service = new GitHubSubmissionService({
  upstreamOwner: "danielshue",
  upstreamRepo: "vault-copilot-extensions",
  targetBranch: "main"
});

await service.initialize();

// Submit your extension
const result = await service.submitExtension({
  extensionPath: "/path/to/my-agent",
  extensionId: "my-agent",
  extensionType: "agent",
  version: "1.0.0",
  branchName: "add-my-agent-v1.0.0"
});

// Check the result
if (result.success) {
  console.log(`✅ PR created: ${result.pullRequestUrl}`);
  console.log(`PR #${result.pullRequestNumber}`);
} else {
  console.error("❌ Submission failed:", result.error);
  console.error("Validation errors:", result.validationErrors);
}

// Clean up
await service.cleanup();
```

### With Custom Messages

```typescript
const result = await service.submitExtension({
  extensionPath: "/vault/Reference/Agents/daily-journal",
  extensionId: "daily-journal",
  extensionType: "agent",
  version: "2.0.0",
  branchName: "update-daily-journal-2.0.0",
  
  // Custom commit message
  commitMessage: "Update Daily Journal Agent to v2.0.0 with new features",
  
  // Custom PR title
  prTitle: "[Agent] Daily Journal v2.0.0 - Enhanced journaling features",
  
  // Custom PR description
  prDescription: `
## Extension Update

**Extension:** Daily Journal Agent
**Version:** 2.0.0
**Type:** agent

### Changes
- Added mood tracking
- Improved template generation
- Enhanced date handling

### Testing
Tested on Obsidian 1.5.0 with Vault Copilot 0.0.18

### Checklist
- [x] All files validated
- [x] No breaking changes
- [x] Documentation updated
`
});
```

### Validation Only

You can validate your extension without submitting:

```typescript
const validation = await service.validateExtension({
  extensionPath: "/path/to/my-extension",
  extensionId: "my-extension",
  extensionType: "agent",
  version: "1.0.0",
  branchName: "test-branch"
});

if (!validation.valid) {
  console.error("Validation errors:");
  validation.errors.forEach(error => console.error(`  - ${error}`));
}

if (validation.warnings.length > 0) {
  console.warn("Validation warnings:");
  validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
}
```

## Extension Structure

### Directory Layout

Your extension directory should follow this structure:

```
my-agent/
├── manifest.json          # Required
├── README.md              # Required
├── my-agent.agent.md      # Extension file (type-specific)
└── preview.png            # Optional (recommended)
```

### manifest.json Example

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "version": "1.0.0",
  "type": "agent",
  "submittedBy": "github-username",
  "description": "A helpful agent for task automation",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/yourusername"
  },
  "minVaultCopilotVersion": "0.0.1",
  "categories": ["Productivity", "Utility"],
  "tags": ["automation", "tasks"],
  "files": [
    {
      "source": "my-agent.agent.md",
      "installPath": "extensions/agents/my-agent/my-agent.agent.md"
    }
  ],
  "repository": "https://github.com/yourusername/my-extension-repo",
  "tools": ["create_note", "read_note", "search_vault"]
}
```

## Validate Locally

Validate before submitting a PR:

```bash
npm install

# Validate a specific extension folder
npm run validate:extension -- extensions/agents/my-agent

# Or run the validator directly
node scripts/validate-extension.cjs extensions/agents/my-agent
```

Tip: The validator is primarily designed to run from a clone of this repository (so it can check for duplicates and apply catalog rules).

## Preview the Docs Site Locally

If you update docs (including your extension `README.md`), you can preview the Jekyll site before publishing:

```bash
bundle install
bundle exec jekyll serve --livereload --incremental
```

Then open:

- `http://127.0.0.1:4000/obsidian-vault-copilot/`

Note: The site uses Highlight.js for client-side code syntax highlighting.

## Validation Rules

The service validates:

1. **Required Files**
   - `manifest.json` must exist and be valid JSON
   - `README.md` must exist
   - Extension file must match the expected pattern for the type

2. **Manifest Fields**
   - `id` must match the directory name
   - `name` is required
   - `version` must follow semantic versioning (x.y.z)
   - `type` must match the submission type
  - `description` should be 200 characters or fewer (warnings/errors may be raised by tooling)

3. **File Sizes**
   - Individual files should be under 500KB
   - Total extension size must be under 2MB
   - Warning if files exceed 100KB

4. **Extension Types**
   - **agent**: Expects `{id}.agent.md`
   - **voice-agent**: Expects `{id}.voice-agent.md`
   - **prompt**: Expects `{id}.prompt.md`
   - **skill**: Expects `skill.md`
   - **mcp-server**: Expects `mcp-config.json`

## Error Handling

The service provides detailed error information:

```typescript
const result = await service.submitExtension(params);

if (!result.success) {
  if (result.validationErrors.length > 0) {
    // Validation failed
    console.error("Fix these validation errors:");
    result.validationErrors.forEach(err => console.error(err));
  } else if (result.error) {
    // Submission error
    console.error("Submission error:", result.error);
    
    // Additional details available
    if (result.details) {
      console.error("Details:", result.details);
    }
  }
}
```

## GitHub Operations (what runs on your machine)

The submission flow uses the real GitHub CLI (`gh`) and `git`.

At a high level, it performs operations equivalent to:

- `gh auth status` to verify authentication
- `gh repo fork` (only if you’re not the upstream owner and don’t already have a fork)
- `git init` + `git fetch` + sparse checkout to retrieve only `extensions/`
- `git checkout -b <branch>`
- `git add .` / `git commit`
- `git push -u origin <branch>`
- `gh pr create` against `danielshue/obsidian-vault-copilot`

## Best Practices

1. **Always validate first**
   ```typescript
   const validation = await service.validateExtension(params);
   if (!validation.valid) return;
   ```

2. **Use descriptive branch names**
   ```typescript
   branchName: `add-${extensionId}-v${version}`
   ```

3. **Clean up after use**
   ```typescript
   try {
     await service.initialize();
     const result = await service.submitExtension(params);
   } finally {
     await service.cleanup();
   }
   ```

4. **Handle errors gracefully**
   ```typescript
   if (!result.success) {
     // Show user-friendly error message
     // Log details for debugging
   }
   ```

## Testing

Run the test suite:

```bash
npm test

# Once dedicated tests are added for GitHubSubmissionService, you can run:
# npm test -- src/tests/extensions/GitHubSubmissionService.test.ts
```

## Troubleshooting

### "GitHub CLI not authenticated"

Solution: Run `gh auth login` and authenticate with GitHub

### "Validation failed: manifest.json is not valid JSON"

Solution: Validate your JSON using a linter or `jsonlint`

### "Extension file not found"

Solution: Ensure the extension file matches the expected pattern for your type

### "Total extension size exceeds 2MB limit"

Solution: Reduce file sizes or split into multiple extensions

## Related Documentation

- [Developers]({{ '/docs/developers/' | relative_url }})
- [Extension authoring guide]({{ '/docs/authoring/' | relative_url }})
- [Extension update validation]({{ '/docs/extension-update-validation/' | relative_url }})
- [Marketplace technical design](./marketplace/marketplace-technical-design.md)
- [GitHub CLI documentation](https://cli.github.com/manual/)

## API Reference

See the [GitHubSubmissionService API documentation](../src/extensions/GitHubSubmissionService.ts) for complete type definitions and method signatures.
