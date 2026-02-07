# Extension Submission Automation

This document describes the automated extension submission workflow that helps extension authors submit their work to the Vault Copilot Extensions catalog directly from within Obsidian.

## Overview

The extension submission automation provides a user-friendly, step-by-step process for:
1. Validating your extension
2. Collecting GitHub repository details
3. Gathering author information  
4. Automating the fork, commit, and pull request workflow

## User Interface

### Multi-Step Modal

The submission process is guided through a 4-step modal interface:

#### Step 1: Select Extension
![Extension Selection](https://github.com/user-attachments/assets/ae5fee80-f7fe-4e07-a0a8-4c7e557d3891)

- Choose your extension type (Agent, Voice Agent, Prompt, Skill, or MCP Server)
- Provide the path to your extension folder
- Receive validation feedback before proceeding

#### Step 2: GitHub Details

- Enter your GitHub username
- Specify your fork repository name (usually `obsidian-vault-copilot`)
- Set a branch name for your submission (auto-generated based on extension ID)
- Receive reminders about prerequisites (fork, GitHub CLI authentication)

#### Step 3: Author Information

- Provide your full name or display name
- Enter your GitHub profile or personal website URL

#### Step 4: Preview & Confirm
![Preview and Confirm](https://github.com/user-attachments/assets/fe71d4b9-74e7-4e45-a41f-cd2dc579af62)

- Review all submission details
- See exactly what will happen next
- Confirm and submit

## Using the Submission Workflow

### From Within Obsidian

1. Open the command palette (`Ctrl/Cmd + P`)
2. Search for "Submit Extension" (when command is registered)
3. Follow the modal steps
4. Click "Submit Extension" to complete the process

### Using the Prompt

You can also use the prompt-based workflow:

1. Navigate to `Reference/Prompts/Submit Extension.prompt.md` in your vault
2. Trigger the prompt through the Vault Copilot interface
3. Provide your extension path and GitHub username
4. The AI agent will guide you through validation, GitHub setup, and PR creation

## Prerequisites

Before submitting an extension, ensure you have:

- [ ] Forked the [obsidian-vault-copilot](https://github.com/danielshue/obsidian-vault-copilot) repository
- [ ] Installed and authenticated with GitHub CLI (`gh`)
- [ ] Created a complete extension with all required files:
  - `manifest.json` with all required fields
  - Main extension file (`.agent.md`, `.prompt.md`, etc.)
  - `README.md` with usage documentation
  - `preview.png` or `preview.svg` (1280x720, < 500 KB)
  - `icon.svg` (optional)
- [ ] Tested your extension locally in Obsidian

## What Happens After Submission

1. **Validation**: Your extension is validated against the schema
2. **Branch Creation**: A new branch is created in your fork
3. **File Commit**: Extension files are committed to the branch
4. **Pull Request**: A PR is created to the main repository
5. **Review**: Maintainers review your submission
6. **Merge**: Once approved, your extension is merged
7. **Catalog Update**: The catalog rebuilds automatically
8. **Installation**: Users can now install your extension!

## Submission Data Structure

The modal collects the following information:

```typescript
interface ExtensionSubmissionData {
  extensionType: "agent" | "voice-agent" | "prompt" | "skill" | "mcp-server";
  extensionPath: string;
  extensionId: string;
  extensionName: string;
  version: string;
  githubUsername: string;
  forkRepoName: string;
  branchName: string;
  prTitle: string;
  prDescription: string;
  authorName: string;
  authorUrl: string;
}
```

## Technical Details

### TypeScript Types

Extension submission types are defined in `src/types/extension-submission.ts`:
- `ExtensionSubmissionData` - Form data structure
- `ExtensionManifest` - Extension manifest schema
- `ValidationResult` - Validation feedback
- `SubmissionWorkflowState` - Workflow state tracking

### UI Components

The modal is implemented in `src/ui/extensions/ExtensionSubmissionModal.ts`:
- Multi-step form with progress indicator
- Input validation at each step
- Preview summary before submission
- Consistent styling with Obsidian theme

### Styling

Custom CSS classes in `styles.css`:
- `.extension-submission-modal` - Modal container
- `.submission-progress` - Progress indicator
- `.validation-info` - Validation feedback box
- `.summary-item` - Preview summary items
- `.navigation-buttons` - Step navigation controls

## Prompts

Two prompts are available for guiding the submission process:

1. **`.github/prompts/submit-extension.prompt.md`** - Comprehensive AI-powered submission guide
2. **`test-vault/Reference/Prompts/Submit Extension.prompt.md`** - User-facing prompt template

## Future Enhancements

Potential improvements for future versions:

- [ ] Real-time manifest validation as user types
- [ ] Automatic fork creation if not exists
- [ ] File upload for preview images
- [ ] Extension testing integration
- [ ] Draft PR support for incremental submissions
- [ ] Submission status tracking
- [ ] In-app PR review notifications

## Troubleshooting

### Common Issues

**"GitHub CLI not found"**
- Install GitHub CLI: `brew install gh` (macOS) or visit [cli.github.com](https://cli.github.com)
- Authenticate: `gh auth login`

**"Repository not forked"**
- Fork the repository: `gh repo fork danielshue/obsidian-vault-copilot`

**"Extension validation failed"**
- Check `manifest.json` has all required fields
- Verify extension files are in the correct location
- Ensure version follows semantic versioning (X.Y.Z)

**"Branch already exists"**
- Use a different branch name
- Or delete the existing branch: `git branch -D branch-name`

## Related Documentation

- [Extension Authoring Guide](./AUTHORING.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Manifest Schema](../schema/manifest.schema.json)
