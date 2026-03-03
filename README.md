# Vault Copilot Basic

AI-powered assistant for Obsidian using GitHub Copilot CLI.

**Vault Copilot Basic** is the core plugin providing:
- GitHub Copilot CLI integration
- Chat UI with streaming responses
- Session management
- Extension API for Pro and third-party plugins

## Features

### Basic Tools (5)
- `get_active_note` — Get content and metadata of the currently open note
- `open_note` — Navigate to a note by path
- `batch_read_notes` — Read multiple notes in one call
- `fetch_web_page` — Fetch and extract text from URLs
- `web_search` — Search the web via DuckDuckGo

### Extension API
Basic exposes an Extension API that allows Pro and third-party plugins to:
- Register additional tools
- Add commands and views
- Extend settings

## Installation

### Prerequisites
- [GitHub Copilot CLI](https://github.com/github/copilot-cli) installed and authenticated
- Node.js 18+ (for building from source)

### From Obsidian Community Plugins
1. Open Settings → Community Plugins
2. Search for "Vault Copilot"
3. Install and enable

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder `.obsidian/plugins/obsidian-vault-copilot/` in your vault
3. Copy the downloaded files into this folder
4. Restart Obsidian and enable the plugin

## Building from Source

```bash
npm install
npm run build
```

## Development

```bash
npm run dev    # Watch mode
npm test       # Run tests
```

## License

MIT License - see [LICENSE](LICENSE)

## Related

- [Vault Copilot Pro](https://github.com/danielshue/obsidian-vault-copilot-pro) — Full-featured version with 40+ tools, MCP, voice, and more
- [Vault Copilot Extensions](https://github.com/danielshue/vault-copilot-extensions) — Extension marketplace
