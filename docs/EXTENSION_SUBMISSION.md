# Extension Submission Guide

This guide explains how to submit extensions to the Vault Copilot marketplace using the `GitHubSubmissionService`.

## Overview

The `GitHubSubmissionService` provides an automated workflow for submitting extensions to the official [vault-copilot-extensions](https://github.com/danielshue/vault-copilot-extensions) repository. It handles validation, GitHub operations, and pull request creation using the GitHub Copilot CLI SDK.

## Prerequisites

1. **GitHub Copilot CLI**: Must be installed and authenticated
   ```bash
   gh auth login
   ```

2. **Extension Files**: Your extension must include:
   - `manifest.json` - Extension metadata
   - `README.md` - Documentation
   - Extension file(s) - Based on type (e.g., `my-agent.agent.md`)

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
import { GitHubSubmissionService } from "./extensions/GitHubSubmissionService";

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
  "description": "A helpful agent for task automation",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/yourusername"
  },
  "categories": ["Productivity", "Utility"],
  "tags": ["automation", "tasks"],
  "minVaultCopilotVersion": "0.0.18",
  "files": [
    {
      "source": "my-agent.agent.md",
      "installPath": "Reference/Agents/my-agent.agent.md"
    }
  ]
}
```

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

## GitHub Operations

The service uses custom GitHub Copilot CLI SDK tools for:

- **check_github_auth** - Verify CLI authentication
- **check_fork_exists** - Check if fork exists
- **create_fork** - Create a repository fork
- **create_branch** - Create a new branch
- **copy_files** - Copy files to repository
- **commit_changes** - Commit changes
- **push_branch** - Push branch to remote
- **create_pull_request** - Create a pull request

These tools are powered by the GitHub Copilot CLI SDK and execute actual GitHub operations.

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
npm test -- src/tests/extensions/GitHubSubmissionService.test.ts
```

## Troubleshooting

### "GitHub Copilot CLI not authenticated"

Solution: Run `gh auth login` and authenticate with GitHub

### "Validation failed: manifest.json is not valid JSON"

Solution: Validate your JSON using a linter or `jsonlint`

### "Extension file not found"

Solution: Ensure the extension file matches the expected pattern for your type

### "Total extension size exceeds 2MB limit"

Solution: Reduce file sizes or split into multiple extensions

## Related Documentation

- [Extension Authoring Guide](./AUTHORING.md)
- [Marketplace Technical Design](./marketplace/marketplace-technical-design.md)
- [GitHub Copilot CLI SDK Guide](../.github/instructions/copilot-sdk-nodejs.instructions.md)

## API Reference

See the [GitHubSubmissionService API documentation](../src/extensions/GitHubSubmissionService.ts) for complete type definitions and method signatures.
