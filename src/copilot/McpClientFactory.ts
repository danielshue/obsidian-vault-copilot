/**
 * MCP Client Factory
 * Creates appropriate MCP client instances based on transport type and platform
 */

import { Platform } from "obsidian";
import { McpServerConfig, McpConnectionStatus, McpTool, isStdioConfig, isHttpConfig } from "./McpTypes";
import { HttpMcpClient } from "./HttpMcpClient";

/**
 * Common interface for all MCP clients
 */
export interface McpClient {
	start(): Promise<void>;
	stop(): Promise<void>;
	callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
	getTools(): McpTool[];
	getStatus(): McpConnectionStatus;
	getError?(): string | undefined;
}

/**
 * Create an MCP client instance based on server config
 * Throws if transport type is not supported on current platform
 */
export async function createMcpClient(config: McpServerConfig): Promise<McpClient> {
	if (isHttpConfig(config)) {
		// HTTP transport works on all platforms
		return new HttpMcpClient(config);
	}

	if (isStdioConfig(config)) {
		if (Platform.isMobile) {
			throw new Error(
				`Stdio MCP server "${config.name}" cannot run on mobile. ` +
				`Only HTTP-based MCP servers are supported on mobile platforms.`
			);
		}
		
		// Dynamic import to avoid loading child_process on mobile
		const { StdioMcpClient } = await import("./StdioMcpClient");
		return new StdioMcpClient(config);
	}

	throw new Error(`Unknown MCP transport: ${(config as any).transport}`);
}
