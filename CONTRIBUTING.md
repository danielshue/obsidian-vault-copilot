---
layout: default
title: Contributing
---

# Contributing to Vault Copilot Extensions

Thank you for your interest in contributing to the Vault Copilot Extensions catalog! This guide will help you submit high-quality extensions that benefit the community.

---

## Table of Contents

- [Contribution Types](#contribution-types)
- [Extension Submission Process](#extension-submission-process)
- [Categories](#categories)
- [Security Guidelines](#security-guidelines)
- [Testing Your Extension](#testing-your-extension)
- [Getting Help](#getting-help)
- [Code of Conduct](#code-of-conduct)
- [License](#license)

---

## Contribution Types

### 1. Submit a New Extension

Create a new extension (agent, voice agent, prompt, skill, or MCP server) for the community.

**Requirements:**
- [ ] Original work or properly attributed
- [ ] Solves a real use case
- [ ] Well-documented with examples
- [ ] Follows naming conventions
- [ ] Passes automated validation
- [ ] No malicious code or API key leaks

### 2. Update an Existing Extension

Fix bugs, add features, or improve documentation for an extension you authored.

**Process:**
- Update version in `manifest.json` (follow [semver](https://semver.org/))
- Document changes in `CHANGELOG.md`
- Submit PR with clear description of changes

### 3. Report Issues

Found a bug or have a feature request?

- Check [existing issues](https://github.com/danielshue/obsidian-vault-copilot/issues) first
- Use the appropriate issue template
- Provide clear reproduction steps
- Include relevant logs or screenshots

### 4. Improve Documentation

Help improve our documentation:

- Fix typos or unclear instructions
- Add examples or tutorials
- Translate content
- Update outdated information

---

## Extension Submission Process

Follow these seven steps to submit your extension:

### Step 1: Fork and Clone

Fork the repository and clone it locally:

```bash
# Fork via GitHub UI first, then:
git clone https://github.com/YOUR_USERNAME/obsidian-vault-copilot.git
cd obsidian-vault-copilot
npm install
```

### Step 2: Create Extension Folder

Create a folder for your extension in the appropriate type directory:

```bash
# Choose the right folder for your extension type
mkdir -p extensions/agents/my-extension-name
cd extensions/agents/my-extension-name
```

**Folder Structure:**

```
extensions/
├── agents/
│   └── my-extension-name/
│       ├── manifest.json          # Required
│       ├── README.md              # Required
│       ├── my-extension.agent.md  # Required (extension file)
│       ├── preview.png            # Recommended
│       ├── CHANGELOG.md           # Optional
│       └── LICENSE                # Optional
├── voice-agents/
├── prompts/
├── skills/
└── mcp-servers/
```

**Naming Conventions:**

| Rule | Example |
|------|---------|
| Use lowercase with hyphens | `my-cool-agent` ✅ |
| Maximum 50 characters | `productivity-assistant` ✅ |
| Descriptive and unique | `daily-journal-helper` ✅ |
| No version numbers | `my-agent-v2` ❌ |
| No special characters | `my_agent!` ❌ |

### Step 3: Add Required Files

#### `manifest.json` (Required)

The manifest defines your extension's metadata and configuration:

```json
{
  "$schema": "../../../schema/manifest.schema.json",
  "id": "my-extension-name",
  "name": "My Extension Name",
  "version": "1.0.0",
  "type": "agent",
  "description": "A brief description of what your extension does (max 200 characters).",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/yourusername",
    "email": "your.email@example.com"
  },
  "repository": "https://github.com/yourusername/my-extension-name",
  "license": "MIT",
  "minVaultCopilotVersion": "0.1.0",
  "categories": ["Productivity"],
  "tags": ["automation", "notes", "workflow"],
  "files": [
    {
      "source": "my-extension.agent.md",
      "installPath": "Reference/Agents/"
    }
  ],
  "tools": ["create_note", "read_note", "update_note"],
  "dependencies": [],
  "permissions": [],
  "preview": "preview.png",
  "changelog": "CHANGELOG.md",
  "featured": false
}
```

**Manifest Field Reference:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (lowercase, hyphens only) |
| `name` | Yes | Display name (max 50 characters) |
| `version` | Yes | Semantic version (x.y.z) |
| `type` | Yes | `agent`, `voice-agent`, `prompt`, `skill`, or `mcp-server` |
| `description` | Yes | Short description (max 200 characters) |
| `author` | Yes | Author info with at least `name` |
| `files` | Yes | Array of files with `source` and `installPath` |
| `categories` | No | Array of category names |
| `tags` | No | Free-form tags for search |
| `tools` | No | Vault Copilot tools used |
| `preview` | No | Preview image filename |

**Bundling Related Files:**

Extensions can include multiple related files that are installed together. This is useful for agents with companion prompts, templates, or configuration files:

```json
{
  "files": [
    {
      "source": "my-agent.agent.md",
      "installPath": "Reference/Agents/"
    },
    {
      "source": "quick-start.prompt.md",
      "installPath": "Reference/Prompts/"
    },
    {
      "source": "template.md",
      "installPath": "Templates/"
    }
  ]
}
```

When users install the extension, all three files are automatically installed to their respective locations, ensuring related files are never missing.

#### `README.md` (Required)

Create a README with Jekyll frontmatter that becomes the extension detail page:

```markdown
---
layout: extension
title: My Extension Name
---

# My Extension Name

![Preview](preview.png)

Brief description of what your extension does and why it's useful.

## Features

- ✨ Feature one - describe what it does
- 🚀 Feature two - explain the benefit
- 📝 Feature three - highlight unique capabilities

## Installation

Install via the Extension Browser in Vault Copilot:

1. Open Chat View → Gear Icon → Extensions
2. Search for "My Extension Name"
3. Click **Install**

## Usage

Explain how to use your extension with practical examples.

### Example 1: Basic Usage

```
@my-extension Help me with [task]
```

### Example 2: Advanced Usage

Describe more complex scenarios.

## Configuration

Document any customizable settings or options.

| Setting | Default | Description |
|---------|---------|-------------|
| `option1` | `true` | What this option controls |

## Requirements

- Vault Copilot v0.1.0 or higher
- Any other dependencies

## License

MIT
```

#### Extension File (Required)

Create the actual extension content file based on your extension type:

| Type | Filename Pattern | Example |
|------|------------------|---------|
| Agent | `*.agent.md` | `my-extension.agent.md` |
| Voice Agent | `*.voice-agent.md` | `my-extension.voice-agent.md` |
| Prompt | `*.prompt.md` | `my-extension.prompt.md` |
| Skill | `skill.md` | `skill.md` |
| MCP Server | `mcp-config.json` | `mcp-config.json` |

#### `preview.png` (Recommended)

Add a preview image showing your extension in action:

| Specification | Requirement |
|---------------|-------------|
| Format | PNG |
| Dimensions | 1280 × 720 pixels (16:9 aspect ratio) |
| File Size | < 500 KB |
| Content | Show extension in use, highlight key features |

**Tips for great preview images:**
- Use a clean, uncluttered Obsidian theme
- Show the extension actively working
- Include visible results or output
- Avoid personal or sensitive information

#### `CHANGELOG.md` (Optional)

Track changes across versions:

```markdown
# Changelog

All notable changes to this extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-05

### Added
- New feature description

### Changed
- Updated behavior description

### Fixed
- Bug fix description

## [1.0.0] - 2026-01-15

### Added
- Initial release
- Core functionality
```

#### `LICENSE` (Optional)

If not provided, the extension defaults to MIT License. Include a LICENSE file if you want to use a different license.

### Step 4: Validate Locally

Run the validation script to check your extension before submitting:

```bash
node scripts/validate-extension.js extensions/agents/my-extension-name
```

**The validator checks:**
- [ ] `manifest.json` schema compliance
- [ ] Required fields are present
- [ ] ID format (lowercase, hyphens only)
- [ ] Version format (semver x.y.z)
- [ ] Description length (max 200 characters)
- [ ] Valid extension type
- [ ] Valid categories
- [ ] All declared files exist
- [ ] No security violations

**Fix all errors before submitting.** Warnings should be addressed if possible.

### Step 5: Submit Pull Request

Create a branch and submit your extension:

```bash
# Create a feature branch
git checkout -b add-my-extension-name

# Stage your extension files
git add extensions/agents/my-extension-name

# Commit with a descriptive message
git commit -m "feat: add My Extension Name"

# Push to your fork
git push origin add-my-extension-name
```

**Then on GitHub:**
1. Navigate to your fork
2. Click **Compare & pull request**
3. Fill out the PR template completely
4. Submit the pull request

**PR Title Format:**
```
feat: add [Extension Name]
fix: update [Extension Name] - [brief description]
docs: improve [Extension Name] documentation
```

### Step 6: Address Feedback

After submitting:

1. **Automated checks run** - CI validates your submission
2. **Maintainers review** - May take 1-3 business days
3. **Respond to feedback** - Make requested changes promptly
4. **Push updates** - Changes automatically update the PR

**Common feedback items:**
- Improve documentation clarity
- Add more usage examples
- Fix validation errors
- Enhance preview image
- Address security concerns

### Step 7: Merge & Celebrate! 🎉

Once approved:

1. Your PR is merged to `main`
2. The catalog automatically rebuilds
3. Your extension appears in the catalog
4. Users can install your extension!

---

## Categories

Choose the most appropriate category for your extension:

| Category | Use For |
|----------|---------|
| **Productivity** | Task management, workflows, automation, efficiency tools |
| **Journaling** | Daily notes, reflection prompts, gratitude logs, morning pages |
| **Research** | Academic work, citations, literature review, note synthesis |
| **Writing** | Drafting, editing, creative writing, content generation |
| **Task Management** | To-dos, projects, deadlines, kanban, GTD workflows |
| **Voice** | Voice-activated features, transcription, dictation |
| **Integration** | External APIs, third-party services, data sync |
| **MCP** | Model Context Protocol servers, external tool providers |
| **Utility** | General helpers, formatters, converters, maintenance tools |

---

## Security Guidelines

All extensions are scanned for security issues. Please follow these guidelines to ensure your submission passes review.

### ❌ Prohibited Content

The following are **strictly forbidden** and will cause automatic rejection:

| Violation | Description |
|-----------|-------------|
| **API Keys/Secrets** | Hardcoded API keys, passwords, tokens, or credentials |
| **Malicious Code** | Code designed to harm, steal data, or exploit users |
| **Dangerous Functions** | Use of `eval()`, `Function()`, `exec()`, `child_process` |
| **Obfuscated Code** | Intentionally obscured or minified code that hides functionality |
| **Data Exfiltration** | Unauthorized collection or transmission of user data |

### ✅ Best Practices

Follow these security best practices:

- **Use SecretStorage** - Store credentials using VS Code's SecretStorage API
- **Validate Input** - Sanitize and validate all user input
- **Handle Errors Gracefully** - Catch exceptions and provide helpful error messages
- **Minimize Permissions** - Request only necessary permissions
- **Document External Services** - Clearly disclose any external API calls
- **Use HTTPS** - All network requests must use secure connections

### 🔍 Automated Security Checks

The validation script scans for these forbidden patterns:

```javascript
// Patterns that will trigger security warnings:
/eval\s*\(/                          // eval() calls
/Function\s*\(/                      // Function constructor
/new\s+Function/                     // new Function()
/(api[_-]?key|password|secret)\s*[=:]\s*['"][^'"]+/  // Hardcoded secrets
/\b(access|secret)_?token\b/         // Token patterns
/exec\s*\(/                          // exec() calls
/child_process/                      // child_process module
```

---

## Testing Your Extension

Thoroughly test your extension before submitting.

### Manual Testing Steps

1. **Install in Test Vault**
   - Copy your extension file to a test Obsidian vault
   - Reload Vault Copilot (`Ctrl/Cmd + Shift + P` → "Reload Window")
   - Verify the extension loads without errors

2. **Test Core Functionality**
   - Try all documented features
   - Test edge cases and error conditions
   - Verify tools work as expected

3. **Check User Experience**
   - Ensure instructions are clear
   - Verify examples work correctly
   - Test with different vault configurations

4. **Review Output Quality**
   - Generated content meets expectations
   - Formatting is correct
   - No unexpected behavior

### Test Checklist

Before submitting, verify:

- [ ] Extension loads without errors
- [ ] All documented features work correctly
- [ ] Error messages are helpful and informative
- [ ] No console errors or warnings
- [ ] Preview image displays correctly
- [ ] README accurately describes functionality
- [ ] Examples in documentation actually work
- [ ] Extension works with current Vault Copilot version
- [ ] No personal or sensitive data exposed
- [ ] Validation script passes with no errors

---

## Getting Help

Stuck or have questions? Here's how to get support:

| Resource | Description |
|----------|-------------|
| 📖 [Extension Authoring Guide](docs/AUTHORING.md) | Step-by-step tutorial for creating extensions |
| 💬 [GitHub Discussions](https://github.com/danielshue/obsidian-vault-copilot/discussions) | Ask questions, share ideas, get community help |
| 🐛 [GitHub Issues](https://github.com/danielshue/obsidian-vault-copilot/issues) | Report bugs or request features |
| 📧 [Email](mailto:extensions@vaultcopilot.dev) | Contact maintainers directly |

---

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

**Key principles:**
- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

Report unacceptable behavior to the project maintainers.

---

## License

By contributing to this repository, you agree that your contributions will be licensed under the **MIT License**.

This means:
- Your code can be freely used, modified, and distributed
- Attribution is required
- No warranty is provided

If you want to use a different license for your extension, include a `LICENSE` file in your extension folder and specify the license in your `manifest.json`.

---

Thank you for contributing to Vault Copilot Extensions! Your extensions help the entire community work smarter with AI-powered note-taking. 🚀
