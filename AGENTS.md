# Vault Copilot

## Project overview

Vault Copilot is the core Obsidian plugin that provides GitHub Copilot CLI integration, a chat UI, session management, and the Extension API. It ships as a community plugin loaded inside Obsidian.

Pro features (expanded tools, MCP servers, voice, rendering, automations, Bases) register at runtime via the Extension API — they are **not** part of this codebase.

---

## Environment & tooling

- **Node.js**: LTS (Node 18+)
- **Package manager**: npm
- **Bundler**: esbuild (`esbuild.config.mjs`)
- **Types**: `obsidian` type definitions
- **Testing**: Vitest (`vitest.config.ts`)

---

## Install

```bash
npm install
```

## Dev (watch)

```bash
npm run dev
```

## Production build

```bash
npm run build
```

## Tests

```bash
npm run test           # single run
npm run test:watch     # watch mode
npm run test:coverage  # with coverage
```

## Linting

```bash
npm run lint           # tsc --noEmit
```

---

## Directory structure

```
vault-copilot/
├── esbuild.config.mjs          # Build configuration
├── manifest.json                # Obsidian plugin manifest (id: obsidian-vault-copilot)
├── package.json                 # Scripts + dependencies
├── tsconfig.json                # TypeScript config
├── vitest.config.ts             # Test runner config
├── src/
│   ├── main.ts                  # Plugin entry point (BasicCopilotPlugin)
│   ├── BasicSettingTab.ts       # Settings UI
│   ├── index.ts                 # Re-exports
│   │
│   ├── api/                     # Extension API surface
│   │   ├── VaultCopilotExtensionAPI.ts  # API implementation + delegate
│   │   ├── types.ts             # API type contracts
│   │   └── registries/          # Tool, provider, UI registries
│   │
│   ├── copilot/                 # AI integration layer
│   │   ├── providers/
│   │   │   ├── AIProvider.ts              # Base abstraction for all providers
│   │   │   ├── GitHubCopilotCliService.ts # Copilot CLI SDK integration
│   │   │   ├── GitHubCopilotCliManager.ts # CLI lifecycle management
│   │   │   ├── BasicToolFactory.ts        # Registers the 7 built-in tools
│   │   │   ├── BasicSystemPromptBuilder.ts # System prompt construction
│   │   │   ├── ConsoleInterceptor.ts      # Console capture for tracing
│   │   │   ├── SessionEventTracer.ts      # Session event tracing
│   │   │   └── types.ts                   # Provider type definitions
│   │   ├── tools/
│   │   │   ├── ToolDefinitions.ts   # Tool names, descriptions, JSON schemas
│   │   │   ├── ToolCatalog.ts       # Tool discovery and enablement
│   │   │   └── VaultOperations.ts   # Vault read/write implementations
│   │   ├── customization/
│   │   │   └── ContextProviderRegistry.ts # Context provider management
│   │   ├── logging/
│   │   │   └── LogTaxonomy.ts       # Canonical log sources
│   │   └── TracingService.ts        # SDK log capture
│   │
│   ├── ui/
│   │   ├── ChatView/               # Chat panel UI
│   │   └── settings/               # Settings types and defaults
│   │
│   ├── utils/
│   │   ├── AppLogger.ts            # File logger
│   │   ├── dateTime.ts             # Date/time utilities
│   │   ├── pathUtils.ts            # Path helpers
│   │   ├── platform.ts             # Platform detection (desktop/mobile)
│   │   └── providerAvailability.ts # Provider availability checks
│   │
│   ├── styles/                     # CSS component files
│   └── docs/                       # Documentation assets
│
└── tests/                          # Vitest test files
    ├── BasicPlugin.test.ts
    ├── setup.ts
    ├── api/
    └── copilot/
```

---

## Built-in tools (7)

| Tool | Description |
|------|-------------|
| `get_active_note` | Get info about the currently open note |
| `open_note` | Open a note in the editor |
| `batch_read_notes` | Read multiple notes at once |
| `create_note` | Create a new note in the vault |
| `update_note` | Update/replace the content of an existing note |
| `fetch_web_page` | Fetch and extract content from a web page |
| `web_search` | Search the web for information |

Pro adds 35+ additional built-in tools via the Extension API.

---

## MCP tool discovery

Vault Copilot discovers MCP servers from the GitHub Copilot CLI configuration at startup. Two paths are scanned:

1. **`~/.copilot/mcp-config.json`** — user-added servers via `copilot /mcp add`
2. **`~/.copilot/installed-plugins/<marketplace>/<plugin>/.mcp.json`** — plugin MCP configs

> **Work IQ**: The Microsoft 365 integration (Work IQ) is delivered as a Copilot CLI plugin that exposes an MCP server. When installed via `copilot /extension install @anthropic/workiq` (or similar), its `.mcp.json` is discovered automatically at `~/.copilot/installed-plugins/`. Vault Copilot does **not** bundle or configure Work IQ — it relies entirely on the CLI plugin's `.mcp.json` for server discovery. No additional Vault Copilot configuration is required; if the CLI plugin is installed and its MCP config is present, the tools appear automatically in the tool picker.

Discovered MCP servers appear as toggleable entries in the Tool Picker and are counted in the toolbar badge.

---

## Extension API

Basic exposes a runtime Extension API (`VaultCopilotExtensionAPI`) that Pro and third-party plugins use to register:

- Additional tools
- AI providers
- UI components
- Context providers

The API is accessed via `app.plugins.getPlugin("obsidian-vault-copilot")?.api`.

---

## Coding conventions

- TypeScript with `"strict": true`
- Keep `main.ts` minimal — lifecycle only
- Split large files at ~200–300 lines
- Bundle everything into `main.js` (no unbundled runtime deps)
- Use `async/await` over promise chains
- Use `AppLogger.debug/info/warn/error(tag, msg, ...args)` instead of raw `console.log`
- Use `LOG_SOURCES` from `LogTaxonomy.ts` for logging — avoid raw string literals
- All source files must include the copyright header comment
- All exported functions require JSDoc with `@param`, `@returns`, `@example`

---

## Manifest rules

- `id`: `obsidian-vault-copilot` — never change after release
- `version`: Semantic Versioning `x.y.z`
- Keep `minAppVersion` accurate when using newer Obsidian APIs

---

## Security

- Default to local/offline operation
- No hidden telemetry
- Never execute remote code or auto-update outside normal releases
- Read/write only within the vault
- Register and clean up all listeners using `register*` helpers
