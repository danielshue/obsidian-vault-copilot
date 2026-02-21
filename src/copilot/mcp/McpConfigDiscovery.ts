/**
 * MCP Config Discovery Service
 * 
 * Discovers MCP server configurations from external tools:
 * - Claude Desktop
 * - VS Code / VS Code Insiders
 * - Cursor
 * - GitHub Copilot CLI
 */

import { Platform } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import {
	McpServerConfig,
	McpServerSource,
	RawMcpServerEntry,
	StdioMcpServerConfig,
	HttpMcpServerConfig,
} from "./McpTypes";

/**
 * Well-known MCP servers that the Copilot CLI injects at runtime via
 * `CliMcpHost.injectDefaultServers()`. These are NOT stored in any
 * user-facing config file — they are baked into the CLI binary and
 * injected when the CLI starts its interactive MCP host.
 *
 * We surface them in the plugin's discovery UI so users can see the
 * same list that `copilot /mcp show` reports. The plugin does NOT
 * manage their lifecycle — the CLI process handles that.
 *
 * @see https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli
 * @internal
 */
const COPILOT_CLI_BUILTIN_SERVERS: Array<{
	name: string;
	transport: "http" | "sse" | "stdio";
	url?: string;
	description?: string;
	/** Only include this server when the given platform test returns true */
	platformGuard?: () => boolean;
}> = [
	{
		name: "github-mcp-server",
		transport: "http",
		url: "https://api.githubcopilot.com/mcp/",
		description: "GitHub MCP server (readonly) — managed by Copilot CLI",
	},
	// Windows MCP servers are now discovered dynamically via odr.exe
	// @see discoverWindowsMcpRegistry()
];

/**
 * Discovery result for a single source
 */
export interface DiscoveryResult {
	source: McpServerSource;
	sourcePath: string;
	servers: McpServerConfig[];
	error?: string;
}

/**
 * Get the config file path for Claude Desktop
 */
function getClaudeDesktopConfigPath(): string {
	if (Platform.isWin) {
		return path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json");
	} else if (Platform.isMacOS) {
		return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
	} else {
		// Linux - try XDG config or fallback
		const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
		return path.join(xdgConfig, "Claude", "claude_desktop_config.json");
	}
}

/**
 * Get the VS Code settings path
 */
function getVSCodeSettingsPath(insiders: boolean = false): string {
	const folder = insiders ? "Code - Insiders" : "Code";
	
	if (Platform.isWin) {
		return path.join(process.env.APPDATA || "", folder, "User", "settings.json");
	} else if (Platform.isMacOS) {
		return path.join(os.homedir(), "Library", "Application Support", folder, "User", "settings.json");
	} else {
		const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
		return path.join(xdgConfig, folder, "User", "settings.json");
	}
}

/**
 * Get the Cursor config paths
 */
function getCursorConfigPaths(): string[] {
	const paths: string[] = [];
	
	if (Platform.isWin) {
		// Main settings
		paths.push(path.join(process.env.APPDATA || "", "Cursor", "User", "settings.json"));
		// MCP-specific config
		paths.push(path.join(process.env.APPDATA || "", "Cursor", "User", "globalStorage", "cursor.mcp", "mcp.json"));
	} else if (Platform.isMacOS) {
		paths.push(path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "settings.json"));
		paths.push(path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "cursor.mcp", "mcp.json"));
	} else {
		const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
		paths.push(path.join(xdgConfig, "Cursor", "User", "settings.json"));
	}
	
	// Also check ~/.cursor for possible config
	paths.push(path.join(os.homedir(), ".cursor", "mcp.json"));
	
	return paths;
}

/**
 * Get the GitHub Copilot CLI base path
 */
function getCopilotCliBasePath(): string {
	return path.join(os.homedir(), ".copilot");
}

/**
 * Get the GitHub Copilot CLI installed plugins path
 */
function getCopilotCliPluginsPath(): string {
	return path.join(getCopilotCliBasePath(), "installed-plugins");
}

/**
 * Parse raw MCP server entries into typed configs.
 *
 * Supports the standard GitHub Copilot MCP configuration format where each entry
 * may include a `type` field (`"local"`, `"stdio"`, `"http"`, `"sse"`) and a
 * `tools` allowlist. When `type` is omitted, the transport is inferred from the
 * presence of `command` (stdio) vs `url` (http).
 *
 * @param raw - Raw server entries keyed by server name
 * @param source - The discovery source label
 * @param sourcePath - File path where the config was found
 * @returns Parsed MCP server configs
 * @see https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp
 */
function parseRawServers(
	raw: Record<string, RawMcpServerEntry>,
	source: McpServerSource,
	sourcePath: string
): McpServerConfig[] {
	const configs: McpServerConfig[] = [];
	
	for (const [id, entry] of Object.entries(raw)) {
		// Determine transport from explicit type or infer from fields
		const explicitType = entry.type;
		const isStdio = explicitType === "local" || explicitType === "stdio" || (!explicitType && entry.command);
		const isHttp = explicitType === "http" || explicitType === "sse" || (!explicitType && entry.url);

		if (isStdio && entry.command) {
			// stdio-based server (type: "local" or "stdio")
			const config: StdioMcpServerConfig = {
				id: `${source}:${id}`,
				name: id,
				enabled: true,
				source,
				sourcePath,
				transport: "stdio",
				command: entry.command,
				args: entry.args,
				env: entry.env,
			};
			if (entry.tools && entry.tools.length > 0) {
				config.allowedTools = entry.tools;
			}
			configs.push(config);
		} else if (isHttp && entry.url) {
			// HTTP/SSE-based server
			const transport = explicitType === "sse" ? "sse" : "http";
			const config: HttpMcpServerConfig = {
				id: `${source}:${id}`,
				name: id,
				enabled: true,
				source,
				sourcePath,
				transport,
				url: entry.url,
				apiKey: entry.apiKey,
				headers: entry.headers,
			};
			if (entry.tools && entry.tools.length > 0) {
				config.allowedTools = entry.tools;
			}
			configs.push(config);
		}
	}
	
	return configs;
}

/**
/**
 * Strip JSONC (JSON with Comments) features to make it valid JSON
 * Removes single-line comments, multi-line comments, and trailing commas
 */
function stripJsonc(content: string): string {
	// Remove multi-line comments
	let result = content.replace(/\/\*[\s\S]*?\*\//g, "");
	
	// Remove single-line comments (but preserve URLs like https://)
	result = result.replace(/(?<!:)\/\/.*$/gm, "");
	
	// Remove trailing commas before closing brackets/braces
	result = result.replace(/,(\s*[}\]])/g, "$1");
	
	return result;
}

/**
 * Safely read and parse a JSON file (supports JSONC for VS Code/Cursor configs)
 */
function readJsonFile(filePath: string): unknown | null {
	try {
		if (!fs.existsSync(filePath)) {
			return null;
		}
		const content = fs.readFileSync(filePath, "utf-8");
		
		// Strip JSONC features (comments, trailing commas) if this is a settings file
		const isSettingsFile = filePath.includes("settings.json") || filePath.includes(".cursor");
		const jsonContent = isSettingsFile ? stripJsonc(content) : content;
		
		return JSON.parse(jsonContent);
	} catch (error) {
		console.warn(`[McpDiscovery] Failed to read ${filePath}:`, error);
		return null;
	}
}

/**
 * Discover MCP servers from Claude Desktop
 */
export function discoverClaudeDesktop(): DiscoveryResult {
	const sourcePath = getClaudeDesktopConfigPath();
	const result: DiscoveryResult = {
		source: "claude-desktop",
		sourcePath,
		servers: [],
	};
	
	try {
		const config = readJsonFile(sourcePath) as { mcpServers?: Record<string, RawMcpServerEntry> } | null;
		if (config?.mcpServers) {
			result.servers = parseRawServers(config.mcpServers, "claude-desktop", sourcePath);
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	
	return result;
}

/**
 * Discover MCP servers from VS Code settings
 */
export function discoverVSCode(insiders: boolean = false): DiscoveryResult {
	const source: McpServerSource = insiders ? "vscode-insiders" : "vscode";
	const sourcePath = getVSCodeSettingsPath(insiders);
	const result: DiscoveryResult = {
		source,
		sourcePath,
		servers: [],
	};
	
	try {
		const settings = readJsonFile(sourcePath) as { 
			mcp?: { servers?: Record<string, RawMcpServerEntry> };
			"mcp.servers"?: Record<string, RawMcpServerEntry>;
		} | null;
		
		// Try different VS Code MCP settings formats
		const mcpServers = settings?.mcp?.servers || settings?.["mcp.servers"];
		if (mcpServers) {
			result.servers = parseRawServers(mcpServers, source, sourcePath);
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	
	return result;
}

/**
 * Discover MCP servers from Cursor
 */
export function discoverCursor(): DiscoveryResult {
	const result: DiscoveryResult = {
		source: "cursor",
		sourcePath: "",
		servers: [],
	};
	
	const paths = getCursorConfigPaths();
	
	for (const configPath of paths) {
		try {
			const config = readJsonFile(configPath);
			if (!config) continue;
			
			result.sourcePath = configPath;
			
			// Handle different Cursor config formats
			if (typeof config === "object" && config !== null) {
				const configObj = config as Record<string, unknown>;
				
				// Direct mcpServers object
				if (configObj.mcpServers && typeof configObj.mcpServers === "object") {
					const servers = parseRawServers(
						configObj.mcpServers as Record<string, RawMcpServerEntry>,
						"cursor",
						configPath
					);
					result.servers.push(...servers);
				}
				
				// VS Code-style mcp.servers
				const mcpSection = configObj.mcp as { servers?: Record<string, RawMcpServerEntry> } | undefined;
				if (mcpSection?.servers) {
					const servers = parseRawServers(mcpSection.servers, "cursor", configPath);
					result.servers.push(...servers);
				}
			}
		} catch (error) {
			if (!result.error) {
				result.error = error instanceof Error ? error.message : String(error);
			}
		}
	}
	
	return result;
}

/**
 * Discover MCP servers from GitHub Copilot CLI configuration.
 * 
 * Copilot CLI stores MCP configs in multiple locations:
 * 1. **User-added servers**: `~/.copilot/mcp-config.json` — servers added via `/mcp add`
 * 2. **Installed plugins**: `~/.copilot/installed-plugins/<marketplace>/<plugin>/.mcp.json`
 * 
 * Note: The built-in GitHub MCP server (`https://api.githubcopilot.com/mcp/`) is
 * baked into the CLI itself and does not appear in config files. It is automatically
 * available in SDK sessions when using the Copilot CLI provider.
 * 
 * @returns Discovery result with all CLI-configured MCP servers
 * @see https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli
 */
export function discoverCopilotCli(): DiscoveryResult {
	const basePath = getCopilotCliBasePath();
	const pluginsPath = getCopilotCliPluginsPath();
	const result: DiscoveryResult = {
		source: "copilot-cli",
		sourcePath: basePath,
		servers: [],
	};
	
	try {
		// 1. Read user-added MCP servers from mcp-config.json
		// This file is created by the CLI when users run `/mcp add`
		const mcpConfigPath = path.join(basePath, "mcp-config.json");
		const mcpConfigData = readJsonFile(mcpConfigPath) as {
			mcpServers?: Record<string, RawMcpServerEntry>;
		} | null;
		
		if (mcpConfigData?.mcpServers) {
			const servers = parseRawServers(mcpConfigData.mcpServers, "copilot-cli", mcpConfigPath);
			result.servers.push(...servers);
		}
		
		// 2. Read installed plugins MCP configs
		if (fs.existsSync(pluginsPath)) {
			// Read the main config to get list of installed plugins
			const configPath = path.join(basePath, "config.json");
			const config = readJsonFile(configPath) as {
				installed_plugins?: Array<{
					name: string;
					marketplace: string;
					enabled?: boolean;
				}>;
			} | null;
			
			// Scan marketplace directories
			const marketplaces = fs.readdirSync(pluginsPath, { withFileTypes: true })
				.filter(entry => entry.isDirectory())
				.map(entry => entry.name);
			
			for (const marketplace of marketplaces) {
				const marketplacePath = path.join(pluginsPath, marketplace);
				
				// Scan plugin directories within each marketplace
				const plugins = fs.readdirSync(marketplacePath, { withFileTypes: true })
					.filter(entry => entry.isDirectory())
					.map(entry => entry.name);
				
				for (const pluginName of plugins) {
					const pluginPath = path.join(marketplacePath, pluginName);
					const pluginMcpPath = path.join(pluginPath, ".mcp.json");
					
					// Check if plugin is enabled in main config
					const pluginConfig = config?.installed_plugins?.find(
						p => p.name === pluginName && p.marketplace === marketplace
					);
					const isEnabled = pluginConfig?.enabled !== false; // Default to true if not specified
					
					// Read .mcp.json if it exists
					const mcpConfig = readJsonFile(pluginMcpPath) as {
						mcpServers?: Record<string, RawMcpServerEntry>;
					} | null;
					
					if (mcpConfig?.mcpServers) {
						const servers = parseRawServers(mcpConfig.mcpServers, "copilot-cli", pluginMcpPath);
						// Apply enabled state from main config
						for (const server of servers) {
							server.enabled = isEnabled;
						}
						result.servers.push(...servers);
					}
				}
			}
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	
	return result;
}

/**
 * Discover well-known Copilot CLI built-in MCP servers.
 *
 * These servers are injected by the CLI runtime (`CliMcpHost.injectDefaultServers`)
 * and do NOT appear in any config file. We surface them so the plugin UI matches
 * what `copilot /mcp show` reports under "Built-in".
 *
 * The plugin does not manage their lifecycle — the Copilot CLI process handles
 * starting, authenticating, and stopping them.
 *
 * @returns Discovery result containing known CLI built-in servers
 * @see {@link COPILOT_CLI_BUILTIN_SERVERS} for the list of known servers
 */
export function discoverCopilotCliBuiltinServers(): DiscoveryResult {
	const result: DiscoveryResult = {
		source: "copilot-cli-builtin",
		sourcePath: "(CLI runtime)",
		servers: [],
	};

	for (const entry of COPILOT_CLI_BUILTIN_SERVERS) {
		// Skip servers that don't belong on this platform
		if (entry.platformGuard && !entry.platformGuard()) {
			continue;
		}

		const id = `copilot-cli-builtin:${entry.name}`;

		if (entry.transport === "http" || entry.transport === "sse") {
			const config: HttpMcpServerConfig = {
				id,
				name: entry.name,
				enabled: true,
				source: "copilot-cli-builtin",
				sourcePath: "(CLI runtime)",
				transport: entry.transport,
				url: entry.url ?? "",
				isCliManaged: true,
			};
			result.servers.push(config);
		} else {
			// stdio — we don't know the actual process command; the CLI manages it
			const config: StdioMcpServerConfig = {
				id,
				name: entry.name,
				enabled: true,
				source: "copilot-cli-builtin",
				sourcePath: "(CLI runtime)",
				transport: "stdio",
				command: "(managed by Copilot CLI)",
				isCliManaged: true,
			};
			result.servers.push(config);
		}
	}

	return result;
}

/**
 * Shape of a single server entry returned by `odr.exe list`.
 *
 * Only the fields we actually read are typed; the full payload contains
 * additional metadata (tools, static_responses, localization, etc.) that
 * we intentionally ignore during discovery.
 *
 * @internal
 */
interface OdrServerEntry {
	name: string;
	description?: string;
	version?: string;
	packages?: Array<{
		identifier: string;
		transport?: { type?: string };
		runtimeHint?: string;
	}>;
	_meta?: {
		"io.modelcontextprotocol.registry/publisher-provided"?: {
			"com.microsoft.windows"?: {
				manifest?: {
					display_name?: string;
					server?: {
						mcp_config?: {
							command?: string;
							args?: string[];
						};
					};
				};
			};
		};
	};
}

/**
 * Discover MCP servers registered in the Windows MCP registry via `odr.exe list`.
 *
 * Available on Windows build 26220.7262 or higher.  `odr.exe` (On-Device Runtime)
 * is part of the Windows App SDK and acts as both the MCP server registry *and*
 * the stdio proxy that launches app-packaged MCP servers on demand.
 *
 * Each discovered server can be launched with:
 *   `odr.exe mcp --proxy <package_identifier>`
 *
 * @returns Discovery result containing all registered Windows MCP servers
 * @see https://learn.microsoft.com/en-us/windows/ai/
 */
export function discoverWindowsMcpRegistry(): DiscoveryResult {
	const result: DiscoveryResult = {
		source: "windows-mcp-registry",
		sourcePath: "odr.exe list",
		servers: [],
	};

	// Only available on Windows
	if (!Platform.isWin) {
		return result;
	}

	try {
		const raw = execSync("odr.exe list", {
			timeout: 10_000,
			encoding: "utf-8",
			windowsHide: true,
			stdio: ["ignore", "pipe", "ignore"],
		});

		const parsed = JSON.parse(raw) as { servers?: OdrServerEntry[] };
		if (!Array.isArray(parsed.servers)) {
			return result;
		}

		for (const entry of parsed.servers) {
			if (!entry.name || !entry.packages?.[0]) {
				continue;
			}

			const pkg = entry.packages[0];
			const identifier = pkg.identifier;
			const meta = entry._meta
				?.["io.modelcontextprotocol.registry/publisher-provided"]
				?.["com.microsoft.windows"];
			const manifest = meta?.manifest;
			const displayName = manifest?.display_name ?? entry.name;
			const mcpConfig = manifest?.server?.mcp_config;

			// Build the command/args — prefer manifest's mcp_config, fall back to convention
			const command = mcpConfig?.command ?? pkg.runtimeHint ?? "odr.exe";
			const args = mcpConfig?.args ?? ["mcp", "--proxy", identifier];

			const id = `windows-mcp-registry:${entry.name}`;
			const config: StdioMcpServerConfig = {
				id,
				name: displayName,
				enabled: true,
				source: "windows-mcp-registry",
				sourcePath: "odr.exe list",
				transport: "stdio",
				command,
				args,
			};
			result.servers.push(config);
		}
	} catch {
		// odr.exe not available or failed — silently skip
		// This is expected on older Windows builds or non-Windows platforms
	}

	return result;
}

/**
 * Get Docker Desktop MCP config path
 */
function getDockerMcpPath(): string {
	return path.join(os.homedir(), ".docker", "mcp");
}

/**
 * Discover MCP servers from Docker Desktop
 * 
 * Docker stores MCP configs in ~/.docker/mcp/
 * - registry.yaml: enabled servers from the catalog
 * - config.yaml: custom server definitions
 */
export function discoverDocker(): DiscoveryResult {
	const mcpPath = getDockerMcpPath();
	const result: DiscoveryResult = {
		source: "docker",
		sourcePath: mcpPath,
		servers: [],
	};
	
	try {
		// Check if Docker MCP directory exists
		if (!fs.existsSync(mcpPath)) {
			return result;
		}
		
		// Read registry.yaml for enabled servers
		const registryPath = path.join(mcpPath, "registry.yaml");
		if (fs.existsSync(registryPath)) {
			const content = fs.readFileSync(registryPath, "utf-8");
			// Parse simple YAML format - Docker uses "registry:" with server entries
			// Format: registry:\n  servername:\n    command: ...\n    args: [...]
			const lines = content.split("\n");
			let currentServer: string | null = null;
			let serverData: RawMcpServerEntry = {};
			
			for (const line of lines) {
				const trimmed = line.trim();
				
				// Skip registry: header and empty lines
				if (trimmed === "registry:" || trimmed === "registry: {}" || trimmed === "") {
					continue;
				}
				
				// Check for server name (2 space indent)
				if (line.startsWith("  ") && !line.startsWith("    ") && trimmed.endsWith(":")) {
					// Save previous server if exists
					if (currentServer && serverData.command) {
						const servers = parseRawServers(
							{ [currentServer]: serverData },
							"docker",
							registryPath
						);
						result.servers.push(...servers);
					}
					currentServer = trimmed.slice(0, -1);
					serverData = {};
				}
				
				// Parse server properties (4 space indent)
				if (line.startsWith("    ") && currentServer) {
					const match = trimmed.match(/^(\w+):\s*(.*)$/);
					if (match) {
						const [, key, value] = match;
						if (key === "command" && value) {
							serverData.command = value;
						} else if (key === "args" && value) {
							// Parse YAML array format [item1, item2]
							try {
								serverData.args = JSON.parse(value.replace(/'/g, '"'));
							} catch {
								serverData.args = [];
							}
						}
					}
				}
			}
			
			// Don't forget the last server
			if (currentServer && serverData.command) {
				const servers = parseRawServers(
					{ [currentServer]: serverData },
					"docker",
					registryPath
				);
				result.servers.push(...servers);
			}
		}
		
		// Also check config.yaml for custom servers
		const configPath = path.join(mcpPath, "config.yaml");
		if (fs.existsSync(configPath)) {
			const content = fs.readFileSync(configPath, "utf-8");
			// Similar YAML parsing for custom server definitions
			if (content.trim()) {
				// Parse servers section if present
				const lines = content.split("\n");
				let inServers = false;
				let currentServer: string | null = null;
				let serverData: RawMcpServerEntry = {};
				
				for (const line of lines) {
					const trimmed = line.trim();
					
					if (trimmed === "servers:" || trimmed === "mcpServers:") {
						inServers = true;
						continue;
					}
					
					if (!inServers) continue;
					
					// Check for server name
					if (line.startsWith("  ") && !line.startsWith("    ") && trimmed.endsWith(":")) {
						if (currentServer && serverData.command) {
							const servers = parseRawServers(
								{ [currentServer]: serverData },
								"docker",
								configPath
							);
							result.servers.push(...servers);
						}
						currentServer = trimmed.slice(0, -1);
						serverData = {};
					}
					
					// Parse server properties
					if (line.startsWith("    ") && currentServer) {
						const match = trimmed.match(/^(\w+):\s*(.*)$/);
						if (match) {
							const [, key, value] = match;
							if (key === "command" && value) {
								serverData.command = value;
							} else if (key === "args" && value) {
								try {
									serverData.args = JSON.parse(value.replace(/'/g, '"'));
								} catch {
									serverData.args = [];
								}
							}
						}
					}
				}
				
				if (currentServer && serverData.command) {
					const servers = parseRawServers(
						{ [currentServer]: serverData },
						"docker",
						configPath
					);
					result.servers.push(...servers);
				}
			}
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	
	return result;
}

/**
 * Discover all MCP servers from all sources
 */
export function discoverAllMcpServers(): DiscoveryResult[] {
	const results: DiscoveryResult[] = [];
	
	// Claude Desktop
	results.push(discoverClaudeDesktop());
	
	// VS Code (regular and Insiders)
	results.push(discoverVSCode(false));
	results.push(discoverVSCode(true));
	
	// Cursor
	results.push(discoverCursor());
	
	// Copilot CLI (user-configured servers)
	results.push(discoverCopilotCli());

	// Copilot CLI (well-known built-in servers)
	results.push(discoverCopilotCliBuiltinServers());

	// Windows MCP Registry (odr.exe — Win 26220.7262+)
	results.push(discoverWindowsMcpRegistry());
	
	// Docker Desktop
	results.push(discoverDocker());
	
	return results;
}

/**
 * Get a human-readable label for the source
 */
export function getSourceLabel(source: McpServerSource): string {
	switch (source) {
		case "claude-desktop":
			return "Claude Desktop";
		case "vscode":
			return "VS Code";
		case "vscode-insiders":
			return "VS Code Insiders";
		case "cursor":
			return "Cursor";
		case "copilot-cli":
			return "Copilot CLI";
		case "copilot-cli-builtin":
			return "Copilot CLI (Built-in)";
		case "windows-mcp-registry":
			return "Windows MCP";
		case "docker":
			return "Docker Desktop";
		case "vault":
			return "Vault Config";
		case "manual":
			return "Manual";
		default:
			return source;
	}
}

/**
 * Get an icon for the source
 */
export function getSourceIcon(source: McpServerSource): string {
	switch (source) {
		case "claude-desktop":
			return "🤖";
		case "vscode":
		case "vscode-insiders":
			return "💻";
		case "cursor":
			return "📝";
		case "copilot-cli":
			return "🐙";
		case "copilot-cli-builtin":
			return "🐙";
		case "windows-mcp-registry":
			return "🪟";
		case "docker":
			return "🐳";
		case "vault":
			return "📁";
		case "manual":
			return "⚙️";
		default:
			return "❓";
	}
}
