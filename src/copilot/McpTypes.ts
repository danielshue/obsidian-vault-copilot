/**
 * MCP Server Types and Configuration
 * 
 * Supports both stdio-based and HTTP-based MCP servers with config discovery
 * from Claude Desktop, VS Code, Cursor, and GitHub Copilot CLI.
 */

/**
 * Transport type for MCP communication
 */
export type McpTransport = "stdio" | "http";

/**
 * Source where the MCP config was discovered
 */
export type McpServerSource = 
	| "claude-desktop"
	| "vscode"
	| "vscode-insiders"
	| "cursor"
	| "copilot-cli"
	| "docker"
	| "vault"
	| "manual";

/**
 * Connection status of an MCP server
 */
export type McpConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * Base configuration shared by all MCP server types
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
 * Configuration for HTTP-based MCP servers
 */
export interface HttpMcpServerConfig extends McpServerConfigBase {
	transport: "http";
	/** Server URL */
	url: string;
	/** Optional API key for authentication */
	apiKey?: string;
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
	/** Vault-specific custom servers */
	servers: McpServerConfig[];
	/** Auto-discovery settings */
	autoDiscovery: {
		claudeDesktop: boolean;
		vscode: boolean;
		cursor: boolean;
		copilotCli: boolean;
		docker: boolean;
	};
}

/**
 * Default vault MCP configuration
 */
export const DEFAULT_VAULT_MCP_CONFIG: VaultMcpConfig = {
	version: 1,
	enabled: {},
	servers: [],
	autoDiscovery: {
		claudeDesktop: true,
		vscode: true,
		cursor: true,
		copilotCli: true,
		docker: true,
	},
};

/**
 * Raw MCP server entry from external config files (Claude, VS Code, etc.)
 */
export interface RawMcpServerEntry {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	apiKey?: string;
}

/**
 * Type guard to check if a config is stdio-based
 */
export function isStdioConfig(config: McpServerConfig): config is StdioMcpServerConfig {
	return config.transport === "stdio";
}

/**
 * Type guard to check if a config is HTTP-based
 */
export function isHttpConfig(config: McpServerConfig): config is HttpMcpServerConfig {
	return config.transport === "http";
}
