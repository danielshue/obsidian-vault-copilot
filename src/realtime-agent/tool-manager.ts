/**
 * Tool enablement utilities for the Realtime Agent
 */

import type { App } from "obsidian";
import type { tool } from "@openai/agents/realtime";
import type { McpManager } from "../copilot/McpManager";
import {
	RealtimeToolConfig,
	RealtimeToolName,
	ToolExecutionCallback,
	VAULT_READ_TOOLS,
	VAULT_WRITE_TOOLS,
	WEB_TOOLS,
	logger,
} from "./types";
import { createVaultTools } from "./vault-tools";
import { createWebTools } from "./web-tools";
import { createMcpTools } from "./mcp-tools";

/**
 * Check if a specific tool is enabled based on configuration
 */
export function isToolEnabled(
	toolName: RealtimeToolName,
	config: RealtimeToolConfig
): boolean {
	// Check explicit enable/disable first
	if (config.enabled?.[toolName] !== undefined) {
		return config.enabled[toolName]!;
	}

	// Check category-level settings
	if (VAULT_READ_TOOLS.includes(toolName) && config.vaultRead !== undefined) {
		return config.vaultRead;
	}
	if (
		VAULT_WRITE_TOOLS.includes(toolName) &&
		config.vaultWrite !== undefined
	) {
		return config.vaultWrite;
	}
	if (WEB_TOOLS.includes(toolName) && config.webAccess !== undefined) {
		return config.webAccess;
	}

	// Default to enabled
	return true;
}

/**
 * Create all tools for the realtime agent based on configuration
 */
export function createAllTools(
	app: App,
	toolConfig: RealtimeToolConfig,
	mcpManager: McpManager | undefined,
	onToolExecution: ToolExecutionCallback | null
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];

	// Add MCP tools if McpManager is available and mcpTools is enabled
	if (toolConfig.mcpTools !== false && mcpManager?.hasConnectedServers()) {
		const mcpTools = createMcpTools(mcpManager, onToolExecution);
		if (mcpTools.length > 0) {
			logger.info(
				`Added ${mcpTools.length} MCP tools to voice agent`
			);
			tools.push(...mcpTools);
		}
	}

	// Create all vault and web tools
	const vaultTools = createVaultTools(app, onToolExecution);
	const webTools = createWebTools(onToolExecution);

	// Build a map of tool name to tool for filtering
	const toolMap: Array<{
		name: RealtimeToolName;
		tool: ReturnType<typeof tool>;
	}> = [];

	// Map vault tools
	for (const t of vaultTools) {
		toolMap.push({ name: t.name as RealtimeToolName, tool: t });
	}

	// Map web tools
	for (const t of webTools) {
		toolMap.push({ name: t.name as RealtimeToolName, tool: t });
	}

	// Filter tools based on configuration
	for (const { name, tool: t } of toolMap) {
		if (isToolEnabled(name, toolConfig)) {
			tools.push(t);
		}
	}

	logger.info(`Enabled ${tools.length} built-in tools`);

	return tools;
}

/**
 * Get tool names from a list of tools
 */
export function getToolNames(tools: ReturnType<typeof tool>[]): string[] {
	return tools.map((t) => t.name);
}
