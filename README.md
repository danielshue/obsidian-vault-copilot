# GitHub Copilot for Obsidian

Integrate GitHub Copilot AI assistant into Obsidian for chat-based interactions with your notes.

## Features

- **AI-Powered Chat**: Have conversations with GitHub Copilot directly in Obsidian
- **Note Context**: Attach notes to your conversations for context-aware responses
- **Vault Integration**: Copilot can read, search, and create notes in your vault
- **Multiple Models**: Choose from various AI models (GPT-4.1, GPT-4o, Claude, etc.)
- **Streaming Responses**: See responses as they're generated in real-time
- **Session Management**: Save and resume previous conversations

## Requirements

- **GitHub Copilot subscription** (Individual, Business, or Enterprise)
- **GitHub Copilot CLI** installed and authenticated
- **Desktop only** (not compatible with Obsidian Mobile)

## Installation

### Using BRAT (Recommended for Beta Testing)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewer's Auto-update Tool) makes it easy to install and update beta plugins.

1. Install BRAT from Obsidian's Community Plugins
2. Open BRAT settings
3. Click "Add Beta plugin"
4. Enter the repository: `danshue/obsidian-ghcp`
5. Click "Add Plugin"

BRAT will automatically install and keep the plugin updated.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/danshue/obsidian-ghcp/releases)
2. Create a folder: `<vault>/.obsidian/plugins/obsidian-ghcp/`
3. Copy the downloaded files into that folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community plugins

## Setup

### 1. Install GitHub Copilot CLI

The plugin requires the GitHub Copilot CLI to be installed:

**Windows (WinGet):**
```bash
winget install GitHub.Copilot
```

**macOS (Homebrew):**
```bash
brew install copilot-cli
```

**npm (all platforms):**
```bash
npm install -g @github/copilot
```

### 2. Authenticate

Open the plugin settings and click "Authenticate" to sign in with your GitHub account.

### 3. Initialize Vault

Click "Initialize Vault" in settings to register your vault with Copilot:
```bash
copilot --add-dir "<vault_path>"
```

## Usage

### Open Chat
- Click the Copilot icon in the sidebar, or
- Use the command palette: "GitHub Copilot: Open Chat"

### Attach Notes
Click the paperclip icon to attach notes to your message for context.

### Keyboard Shortcuts
- `Enter` - Send message
- `Shift+Enter` - New line

## Commands

- **Open Chat** - Open the Copilot chat panel
- **Connect** - Connect to the Copilot service
- **Clear Chat** - Clear current conversation
- **Open Settings** - Open plugin settings

## Development

```bash
# Install dependencies
npm install

# Build for development (watch mode)
npm run dev

# Build for production
npm run build

# Build and deploy to test vault
npm run build:deploy

# Lint
npm run lint
```

## Creating a Release

1. Update version in `manifest.json`
2. Run `npm version patch|minor|major` to update `package.json` and `versions.json`
3. Commit changes
4. Create and push a tag matching the version:
   ```bash
   git tag 1.0.1
   git push origin 1.0.1
   ```
5. GitHub Actions will automatically build and create the release

For beta releases, use semver pre-release tags:
```bash
git tag 1.0.1-beta.1
git push origin 1.0.1-beta.1
```

## License

[MIT](LICENSE)

## Author

Dan Shue - [GitHub](https://github.com/danshue)
