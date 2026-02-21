/**
 * @module McpTypes
 * @description Type definitions for Model Context Protocol (MCP) server configuration and status.
 *
 * This module defines all the TypeScript types used for MCP server management,
 * including configuration schemas, connection status, and tool definitions.
 *
 * ## Transport Types
 *
 * MCP supports two transport mechanisms:
 * - **stdio**: Spawns a local process and communicates via stdin/stdout (desktop only)
 * - **http**: Connects to a remote HTTP server (cross-platform)
 *
 * ## Config Sources
 *
 * MCP configs can be discovered from multiple sources:
 * - `claude-desktop`: Claude Desktop app config
 * - `vscode` / `vscode-insiders`: VS Code MCP settings
 * - `cursor`: Cursor editor settings
 * - `copilot-cli`: GitHub Copilot CLI config files
 * - `vault`: Per-vault `.obsidian/mcp.json`
 * - `manual`: User-configured in settings
 *
 * ## Usage
 *
 * ```typescript
 * import { McpServerConfig, isStdioConfig, McpConnectionStatus } from './McpTypes';
 *
 * const config: McpServerConfig = {
 *   id: 'my-server',
 *   name: 'My MCP Server',
 *   transport: 'http',
 *   url: 'http://localhost:3000',
 *   enabled: true,
 *   source: 'manual',
 * };
 *
 * if (isStdioConfig(config)) {
 *   console.log('Command:', config.command);
 * }
 * ```
 *
 * @see {@link McpManager} for server management
 * @see {@link McpClientFactory} for client creation
 * @since 0.0.1
 */

/**
 * Transport type for MCP communication.
 * - `stdio`: Local process via stdin/stdout (desktop only)
 * - `http`: Remote HTTP server using JSON-RPC over HTTP (cross-platform)
 * - `sse`: Remote server using Server-Sent Events transport (cross-platform)
 */
export type McpTransport = "stdio" | "http" | "sse";

/**
 * Source where the MCP config was discovered.
 */
export type McpServerSource = 
	| "claude-desktop"
	| "vscode"
	| "vscode-insiders"
	| "cursor"
	| "copilot-cli"
	| "copilot-cli-builtin"
	| "windows-mcp-registry"
	| "docker"
	| "vault"
	| "manual";

/**
 * Connection status of an MCP server.
 */
export type McpConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * Base configuration shared by all MCP server types.
 */
export interface McpServerConfigBase {
	/** Unique identifier for the server */
	id: string;
	/** Human-readable name */
	name: string;
	/** Whether the server is enabled */
	enabled: boolean;
	/** Source where this config was discovered */
	source: McpServerSource;
	/** Source file path where config was found */
	sourcePath?: string;
	/**
	 * Tool allowlist from the MCP server configuration.
	 * - `["*"]` enables all tools (default when omitted)
	 * - `["tool_a", "tool_b"]` enables only the named tools
	 * @see https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp
	 */
	allowedTools?: string[];
	/**
	 * Whether this server is a default/built-in server managed by the CLI runtime.
	 * Built-in servers cannot be started/stopped independently — the CLI process manages them.
	 * @internal
	 */
	isCliManaged?: boolean;
}

/**
 * Configuration for stdio-based MCP servers
 */
export interface StdioMcpServerConfig extends McpServerConfigBase {
	transport: "stdio";
	/** Command to execute */
	command: string;
	/** Arguments to pass to the command */
	args?: string[];
	/** Environment variables */
	env?: Record<string, string>;
	/** Working directory */
	cwd?: string;
}

/**
 * Configuration for HTTP-based MCP servers (includes SSE transport)
 */
export interface HttpMcpServerConfig extends McpServerConfigBase {
	transport: "http" | "sse";
	/** Server URL */
	url: string;
	/** Optional API key for authentication */
	apiKey?: string;
	/** Optional custom headers sent with every request */
	headers?: Record<string, string>;
}

/**
 * Union type for all MCP server configurations
 */
export type McpServerConfig = StdioMcpServerConfig | HttpMcpServerConfig;

/**
 * Runtime status of an MCP server
 */
export interface McpServerStatus {
	/** Server ID */
	id: string;
	/** Current connection status */
	status: McpConnectionStatus;
	/** Error message if status is "error" */
	error?: string;
	/** Available tools from this server */
	tools?: McpTool[];
	/** Process ID if running as stdio */
	pid?: number;
	/** Last connected timestamp */
	connectedAt?: number;
}

/**
 * MCP Tool definition
 */
export interface McpTool {
	/** Tool name */
	name: string;
	/** Tool description */
	description?: string;
	/** JSON Schema for input parameters */
	inputSchema?: Record<string, unknown>;
}

/**
 * Discovered MCP server (config + status)
 */
export interface DiscoveredMcpServer {
	config: McpServerConfig;
	status: McpServerStatus;
}

/**
 * Vault-specific MCP configuration stored in .obsidian/mcp-servers.json
 */
export interface VaultMcpConfig {
	/** Version for future migrations */
	version: 1;
	/** Override enabled state per server ID */
	enabled: Record<string, boolean>;
	/** Auto-start state per server ID */
	autoStart: Record<string, boolean>;
	/** Vault-specific custom servers */
	servers: McpServerConfig[];
	/** Auto-discovery settings */
	autoDiscovery: {
		claudeDesktop: boolean;
		vscode: boolean;
		cursor: boolean;
		copilotCli: boolean;
		docker: boolean;
		/** Discover MCP servers from Windows MCP registry via odr.exe (Win 26220.7262+) */
		windowsMcpRegistry: boolean;
	};
}

/**
 * Default vault MCP configuration
 */
export const DEFAULT_VAULT_MCP_CONFIG: VaultMcpConfig = {
	version: 1,
	enabled: {},
	autoStart: {},
	servers: [],
	autoDiscovery: {
		claudeDesktop: true,
		vscode: true,
		cursor: true,
		copilotCli: true,
		docker: true,
		windowsMcpRegistry: true,
	},
};

/**
 * Raw MCP server entry from external config files.
 *
 * Follows the standard GitHub Copilot MCP configuration format:
 * @see https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp
 */
export interface RawMcpServerEntry {
	/**
	 * Server type. Determines transport mechanism.
	 * - `"local"` or `"stdio"`: Spawns a local process (desktop only)
	 * - `"http"` or `"sse"`: Connects to a remote server (cross-platform)
	 *
	 * When omitted, the type is inferred from the presence of `command` (stdio) or `url` (http).
	 */
	type?: "local" | "stdio" | "http" | "sse";
	/** Command to execute (local/stdio servers) */
	command?: string;
	/** Arguments for the command */
	args?: string[];
	/** Environment variables for the server process */
	env?: Record<string, string>;
	/** Server URL (http/sse servers) */
	url?: string;
	/** Optional API key for authentication */
	apiKey?: string;
	/** Custom headers sent with every request (http/sse servers) */
	headers?: Record<string, string>;
	/**
	 * Tool allowlist. Controls which tools from this server are exposed.
	 * - `["*"]` enables all tools
	 * - `["tool_a", "tool_b"]` enables only the named tools
	 */
	tools?: string[];
}

/**
 * Type guard to check if a config is stdio-based
 */
export function isStdioConfig(config: McpServerConfig): config is StdioMcpServerConfig {
	return config.transport === "stdio";
}

/**
 * Type guard to check if a config is HTTP-based (includes SSE transport)
 */
export function isHttpConfig(config: McpServerConfig): config is HttpMcpServerConfig {
	return config.transport === "http" || config.transport === "sse";
}
