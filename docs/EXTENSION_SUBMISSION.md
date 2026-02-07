# Extension Submission Automation

This document describes the automated extension submission workflow that helps extension authors submit their work to the Vault Copilot Extensions catalog directly from within Obsidian.

## Overview

The extension submission automation provides a user-friendly, step-by-step process for:
1. Selecting your extension (file or folder)
2. AI-powered content generation (optional)
3. Collecting author information with smart defaults
4. Reviewing and submitting with automated GitHub workflow

## User Interface

### Multi-Step Modal

The submission process is guided through a 3-step modal interface:

#### Step 1: Select Extension

- Choose your extension type (Agent, Voice Agent, Prompt, Skill, or MCP Server)
- Provide the path to your extension file or folder
- Optional: Enable/disable automatic AI content generation (checkbox, enabled by default)
- System auto-detects if path is file or folder

**Input Options:**
- **File path**: `my-agent.agent.md` - System derives ID/name and generates manifest
- **Folder with manifest**: `extensions/agents/my-agent/` - System uses existing manifest.json
- **Folder without manifest**: `extensions/agents/my-agent/` - System derives from markdown and generates manifest

#### Progressive Loading Screen (if AI generation enabled)

Shows real-time progress for automated tasks:
1. ✅ **Generating Description** - AI analyzes extension and creates concise description
2. ◐ **Generating Image** - AI creates icon and preview image automatically
3. ○ **Validating ID doesn't exist** - Checks catalog to prevent duplicate submissions

Visual indicators show task status with color coding and animations.

#### Step 2: Extension Details

- **Author information**: Pre-populated from git config (editable)
  - Author Name (from `git config user.name`)
  - Author URL (auto-generated as `https://github.com/{username}`)
- **Extension description**: AI-generated and editable, with "Generate with AI" button for regeneration
- **Extension image**: AI-generated automatically, with buttons to regenerate or manually upload
- **README content**: AI-generated comprehensive documentation, editable with regeneration button

All AI-generated content is fully editable. Manual regeneration buttons allow refining individual fields.

#### Step 3: Preview & Confirm

- Review all extension details (type, ID, name, version)
- View author information
- **Scrollable Description box** (150px max height) for comfortable review
- **Scrollable README box** (400px max height) for comprehensive documentation review
- View attached assets (icon, preview image)
- See explanation of automated workflow steps
- Confirm and submit

**Note:** GitHub details (username, fork, branch) are auto-generated behind the scenes and not shown to the user.

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
