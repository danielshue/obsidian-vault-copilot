# Obsidian community plugin

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

> Use PowerShell (`pwsh`) for all terminal commands.

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- To use eslint install eslint from terminal: `npm install -g eslint`
- To use eslint to analyze this project use this command: `eslint main.ts`
- eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder: `eslint ./src/`

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Example file structure**:
  ```
  src/
    main.ts           # Plugin entry point, lifecycle management
    settings.ts       # Settings interface and defaults
    commands/         # Command implementations
      command1.ts
      command2.ts
    ui/              # UI components, modals, views
      modal.ts
      view.ts
    utils/           # Utility functions, helpers
      helpers.ts
      constants.ts
    types.ts         # TypeScript interfaces and types
  ```
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):  
  - `id` (plugin ID; for local dev it should match the folder name)  
  - `name`  
  - `version` (Semantic Versioning `x.y.z`)  
  - `minAppVersion`  
  - `description`  
  - `isDesktopOnly` (boolean)  
  - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

- Manual install for testing: copy `main.js`, `manifest.json`, `styles.css` (if any) to:
  ```
  <Vault>/.obsidian/plugins/<plugin-id>/
  ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## AI Providers

Vault Copilot supports multiple AI providers for chat functionality:

### GitHub Copilot (Primary)
- **Provider Type**: `copilot`
- **Requirements**: GitHub Copilot subscription and CLI installed
- **Features**: 
  - Full GitHub Copilot CLI SDK integration
  - Agent Skills support
  - MCP (Model Context Protocol) via StdioMcpClient
  - Multiple models (GPT-4.1, GPT-5-mini, Claude, Gemini, etc.)
  - Context-aware vault operations
- **Model Selection**: Available in Settings → Chat Preferences
- **Configuration**: Settings → Connection Status

### OpenAI
- **Provider Type**: `openai`
- **Requirements**: OpenAI API key
- **Features**:
  - Direct OpenAI API access
  - Chat completions with streaming
  - Tool/function calling support
  - MCP tool integration (via McpManager)
  - Custom model selection
- **Models**: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo, o1, o1-mini, o1-preview, o3-mini
- **Configuration**: Create an AI Provider Profile in Settings → AI Provider Profiles
  - Profile Name: Descriptive name
  - Provider Type: OpenAI
  - API Key: Your OpenAI API key (or set OPENAI_API_KEY env var)
  - Base URL (optional): Custom API endpoint
  - Chat Model (optional): Specific model for chat (e.g., gpt-4o)
  - Whisper Model (optional): Model for voice transcription

### Azure OpenAI
- **Provider Type**: `azure-openai`
- **Requirements**: Azure OpenAI resource and API key
- **Features**:
  - Azure OpenAI API access
  - Chat completions with streaming
  - Tool/function calling support
  - MCP tool integration (via McpManager)
  - Deployment-based model selection
- **Configuration**: Create an AI Provider Profile in Settings → AI Provider Profiles
  - Profile Name: Descriptive name
  - Provider Type: Azure OpenAI
  - API Key: Your Azure OpenAI API key (or set AZURE_OPENAI_KEY env var)
  - Endpoint: Your Azure OpenAI endpoint (e.g., https://your-resource.openai.azure.com)
  - Chat Deployment Name (optional): Deployment for chat model (e.g., gpt-4o)
  - Whisper Deployment Name (optional): Deployment for voice transcription
  - API Version (optional): Defaults to 2024-06-01

### Provider Selection
- **Location**: Settings → Chat Preferences → Chat Provider dropdown
- **Options**:
  - GitHub Copilot (default)
  - Any configured OpenAI or Azure OpenAI profile
- **Switching Providers**: Auto-reconnects when changed

### Model Context Protocol (MCP)
- **Stdio MCP (Desktop Only)**: Via `StdioMcpClient` (src/copilot/StdioMcpClient.ts)
  - Spawns local MCP server processes
  - Configured in `.github/copilot-mcp-servers.json`
  - Requires Node.js child_process (desktop only)
- **HTTP MCP (Cross-Platform)**: Via `HttpMcpClient` (src/copilot/HttpMcpClient.ts)
  - Connects to remote MCP servers over HTTP/HTTPS
  - Uses JSON-RPC 2.0 protocol
  - Works on both desktop and mobile
  - Uses Obsidian's `requestUrl` for cross-platform HTTP
- **MCP Manager**: Coordinates both transport types
  - Managed by `McpManager` (src/copilot/McpManager.ts)
  - Exposes tools as function/tool calls to AI providers
  - Same tools available across all providers for consistency

### Provider Architecture
- **Base Abstraction**: `AIProvider` abstract class (src/copilot/AIProvider.ts)
  - Common interface for all providers
  - Methods: initialize(), sendMessage(), sendMessageStreaming(), abort(), isReady(), destroy()
  - Tools management: setTools(), convertMcpToolsToToolDefinitions()
  - History management: getMessageHistory(), clearHistory()
- **Implementation Classes**:
  - `GitHubCopilotCliService`: GitHub Copilot CLI SDK integration (src/copilot/GitHubCopilotCliService.ts)
  - `OpenAIService`: OpenAI API integration (src/copilot/OpenAIService.ts)
  - `AzureOpenAIService`: Azure OpenAI API integration (src/copilot/AzureOpenAIService.ts)
- **Provider Initialization**: main.ts handles provider selection and initialization based on user configuration

## Utilities

### Platform Detection (src/utils/platform.ts)
- `isMobile` / `isDesktop`: Platform detection constants
- `getAvailableProviders()`: Returns AI providers available on current platform
- `getMcpTransports()`: Returns MCP transport types available on current platform
- `supportsLocalProcesses()`: Check if platform can spawn local processes

### SecretStorage (src/utils/secrets.ts)
- `getSecretValue(app, secretId)`: Safely read secrets from Obsidian's SecretStorage
- Used for secure API key storage
- Returns undefined if secret not set or unavailable

### HTTP Utilities (src/utils/http.ts)
- `httpRequest()`: Cross-platform HTTP requests using Obsidian's `requestUrl`
- Works on both desktop and mobile
- Used by `HttpMcpClient` for MCP over HTTP

## Diagnostics & Tracing

### TracingService (src/copilot/TracingService.ts)
- Captures SDK logs, prompts, responses, and events
- Singleton pattern via `getTracingService()`
- Supports trace spans and events for debugging

### Pop-out Windows
- `openTracingPopout(app)`: Open diagnostics in a pop-out window (desktop) or modal (mobile)
- `openVoiceHistoryPopout(app)`: Open voice conversation history in a pop-out window
- Located in src/ui/ChatView/TracingModal.ts and ConversationHistoryModal.ts

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Documentation standards

** All source code files should have a standardized header comment **
// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

**All code must include comprehensive JSDoc documentation.** When touching any file, examine it and add/update documentation as needed.

### Required JSDoc tags

| Tag | When to use | Example |
|-----|-------------|---------|
| `@module` | Top of every file | `@module TaskOperations` |
| `@description` | File-level and complex functions | Overview of purpose |
| `@param` | Every function parameter | `@param path - The note file path` |
| `@returns` | Every function with return value | `@returns Parsed task or null` |
| `@example` | All public functions | Runnable code snippet |
| `@throws` | Functions that throw errors | `@throws {Error} If file not found` |
| `@see` | Cross-references | `@see {@link parseTaskLine}` |
| `@since` | New APIs | `@since 0.0.14` |
| `@deprecated` | Deprecated APIs | `@deprecated Use newMethod instead` |
| `@internal` | Private helpers | Mark non-exported functions |

### File-level documentation template

```typescript
/**
 * @module ModuleName
 * @description Brief description of what this module provides.
 * 
 * Detailed explanation of:
 * - Key features
 * - Architecture decisions
 * - Usage patterns
 * 
 * @example
 * ```typescript
 * import { mainFunction } from './ModuleName';
 * const result = mainFunction(args);
 * ```
 * 
 * @see {@link RelatedModule} for related functionality
 * @since 0.0.14
 */
```

### Function documentation template

```typescript
/**
 * Brief one-line description of what the function does.
 * 
 * Longer explanation if needed, including:
 * - Edge cases
 * - Side effects
 * - Performance considerations
 * 
 * @param paramName - Description of the parameter
 * @param optionalParam - Description (defaults to X)
 * @returns Description of return value
 * 
 * @example
 * ```typescript
 * const result = myFunction('input');
 * console.log(result); // expected output
 * ```
 * 
 * @throws {ErrorType} When this error occurs
 * @see {@link relatedFunction} for similar functionality
 */
```

### Documentation checklist (apply when touching any file)

- [ ] File has `@module` tag with description
- [ ] All exported functions have JSDoc with `@param`, `@returns`, `@example`
- [ ] All exported interfaces/types have doc comments
- [ ] Complex logic has inline comments explaining "why"
- [ ] Private helpers marked with `@internal`
- [ ] Cross-references added with `@see` where helpful
- [ ] Examples are runnable and accurate

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

### Platform Detection
Use the platform utilities (src/utils/platform.ts) for cross-platform compatibility:
```ts
import { isMobile, isDesktop, getAvailableProviders, getMcpTransports, supportsLocalProcesses } from "./utils/platform";

// Check platform
if (isMobile) {
  // Mobile-specific behavior
}

// Get available AI providers for current platform
const providers = getAvailableProviders();
// Desktop: ["copilot", "openai", "azure-openai"]
// Mobile: ["openai", "azure-openai"] (no CLI-based Copilot)

// Get available MCP transports
const transports = getMcpTransports();
// Desktop: ["stdio", "http"]
// Mobile: ["http"] (no local process spawning)
```

### Mobile Limitations
- **GitHub Copilot CLI**: Not available on mobile (requires local process spawning)
- **Stdio MCP servers**: Not available on mobile (use HTTP MCP instead)
- **Voice input**: May have platform-specific limitations

## Agent do/don't

**Do**
- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.

**Don't**
- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):
```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
  settings: MySettings;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    registerCommands(this);
  }
}
```

**settings.ts**:
```ts
export interface MySettings {
  enabled: boolean;
  apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
  enabled: true,
  apiKey: "",
};
```

**commands/index.ts**:
```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
  plugin.addCommand({
    id: "do-something",
    name: "Do something",
    callback: () => doSomething(plugin),
  });
}
```

### Add a command

```ts
this.addCommand({
  id: "your-command-id",
  name: "Do the thing",
  callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(this.app.workspace.on("file-open", f => { /* ... */ }));
this.registerDomEvent(window, "resize", () => { /* ... */ });
this.registerInterval(window.setInterval(() => { /* ... */ }, 1000));
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`. 
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
- GitHub Copilot CLI SDK: https://github.com/github/copilot-sdk/blob/main/nodejs/README.md
