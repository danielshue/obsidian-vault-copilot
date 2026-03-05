/**
 * @module ToolCatalog (Basic)
 * @description Tool discovery and selection management for Basic Vault Copilot.
 *
 * This is a standalone version with the 7 Basic tools plus dynamic MCP server
 * tools discovered from the Copilot CLI configuration at startup.
 *
 * Built-in tools:
 * - get_active_note
 * - open_note
 * - batch_read_notes
 * - create_note
 * - update_note
 * - fetch_web_page
 * - web_search
 *
 * MCP tools: loaded asynchronously from `~/.copilot/` CLI config via
 * {@link loadCliMcpTools}. Pro extends with Skills and 35+ additional builtins.
 *
 * @since 0.1.0
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CopilotPluginSettings, CopilotSession } from "../../ui/settings";
import { TOOL_DESCRIPTIONS, TOOL_NAMES, type ToolName } from "./ToolDefinitions";

/**
 * Tool metadata used for UI display and enablement logic.
 */
export interface ToolInfo {
	/** Unique identifier for the tool */
	id: string;
	/** Human-friendly display name */
	displayName: string;
	/** Description shown in UI */
	description: string;
	/** Source of the tool (builtin/plugin/mcp) */
	source: "builtin" | "plugin" | "mcp";
	/** Whether the tool is enabled by default */
	enabledByDefault: boolean;
	/** MCP server ID for MCP tools */
	serverId?: string;
	/** MCP server name for MCP tools */
	serverName?: string;
}

/**
 * Interface for a tool catalog — shared contract between Basic and Pro ToolCatalog classes.
 *
 * Using this interface instead of the concrete class avoids structural compatibility issues
 * caused by TypeScript's nominal private-field checking when classes are declared in
 * different modules.
 */
export interface IToolCatalog {
	/** Discover and load MCP server entries from CLI config; returns count added. */
	loadCliMcpTools(): number;
	/** Return all available tools (builtins + MCP). */
	getAllTools(): ToolInfo[];
	/** Return tools grouped by source key (e.g. `"builtin"`, `"mcp:workiq"`). */
	getToolsBySource(): Record<string, ToolInfo[]>;
	/** Return enabled tool IDs for the current settings/session. */
	getEnabledTools(settings: CopilotPluginSettings, session?: CopilotSession): string[];
	/** Check whether a single tool is enabled. */
	isToolEnabled(toolId: string, settings: CopilotPluginSettings, session?: CopilotSession): boolean;
	/** Return a summary of enabled vs. total counts by source. */
	getToolsSummary(settings: CopilotPluginSettings, session?: CopilotSession): {
		enabled: number; total: number; builtin: number; plugin: number; mcp: number;
	};
	/** Return a raw count of available tools per source. */
	getToolCountsBySource(): Record<string, number>;
}

/**
 * Create a built-in tool entry with consistent descriptions.
 */
function createBuiltinTool(id: ToolName, displayName: string): ToolInfo {
	return {
		id,
		displayName,
		description: TOOL_DESCRIPTIONS[id],
		source: "builtin",
		enabledByDefault: true,
	};
}

/**
 * Built-in tool catalog for Basic (7 tools).
 */
const BASIC_TOOLS: ToolInfo[] = [
	createBuiltinTool(TOOL_NAMES.GET_ACTIVE_NOTE, "Get Active Note"),
	createBuiltinTool(TOOL_NAMES.OPEN_NOTE, "Open Note"),
	createBuiltinTool(TOOL_NAMES.BATCH_READ_NOTES, "Batch Read Notes"),
	createBuiltinTool(TOOL_NAMES.CREATE_NOTE, "Create Note"),
	createBuiltinTool(TOOL_NAMES.UPDATE_NOTE, "Update Note"),
	createBuiltinTool(TOOL_NAMES.FETCH_WEB_PAGE, "Fetch Web Page"),
	createBuiltinTool(TOOL_NAMES.WEB_SEARCH, "Web Search"),
];

/**
 * ToolCatalog class for managing tool discovery and selection.
 *
 * Basic version supports the 7 builtin tools plus MCP tools discovered from the
 * Copilot CLI configuration. Call {@link loadCliMcpTools} asynchronously at startup
 * to populate MCP entries. Pro adds SkillRegistry and 35+ additional builtins.
 */
export class ToolCatalog {
	/** Dynamically added MCP tool entries (loaded from CLI config at startup). */
	private mcpTools: ToolInfo[] = [];

	/**
	 * Create a new tool catalog.
	 * Basic version ignores constructor arguments (no MCP/Skills).
	 */
	constructor() {
		// Basic has no MCP or SkillRegistry
	}

	/**
	 * Discover and load tools from CLI-registered MCP servers.
	 *
	 * Scans:
	 * 1. `~/.copilot/mcp-config.json` — user-added servers via `copilot /mcp add`
	 * 2. `~/.copilot/installed-plugins/<marketplace>/<plugin>/.mcp.json` — plugin configs (e.g. WorkIQ)
	 *
	 * Each discovered server is added as a `ToolInfo` entry with `source: "mcp:{serverName}"`.
	 * Entries can then be toggled in the Tool Picker and are counted in the toolbar badge.
	 *
	 * @returns Number of MCP server entries added
	 *
	 * @example
	 * ```typescript
	 * const catalog = new ToolCatalog();
	 * await catalog.loadCliMcpTools();
	 * console.log(catalog.getAllTools().length); // 7 + mcp servers
	 * ```
	 */
	loadCliMcpTools(): number {
		const newTools: ToolInfo[] = [];
		try {
			const basePath = join(homedir(), ".copilot");
			type RawEntry = { type?: string; url?: string; command?: string; args?: string[]; tools?: string[] };

			const addServer = (name: string, entry: RawEntry) => {
				const isHttp = entry.url || entry.type === "http" || entry.type === "sse";
				newTools.push({
					id: `mcp:server:${name}`,
					displayName: name,
					description: isHttp
						? `MCP tools from ${name} (HTTP)`
						: `MCP tools from ${name}`,
					source: "mcp",
					enabledByDefault: true,
					serverName: name,
				});
			};

			// 1. User-added servers (`copilot /mcp add`)
			const mcpConfigPath = join(basePath, "mcp-config.json");
			if (existsSync(mcpConfigPath)) {
				const parsed = JSON.parse(readFileSync(mcpConfigPath, "utf-8")) as
					{ mcpServers?: Record<string, RawEntry> };
				for (const [name, entry] of Object.entries(parsed?.mcpServers ?? {})) {
					addServer(name, entry);
				}
			}

			// 2. Installed CLI plugin MCP configs (WorkIQ, etc.)
			const pluginsPath = join(basePath, "installed-plugins");
			if (existsSync(pluginsPath)) {
				let enabledSet: Set<string> | null = null;
				const configPath = join(basePath, "config.json");
				if (existsSync(configPath)) {
					const cfg = JSON.parse(readFileSync(configPath, "utf-8")) as {
						installed_plugins?: Array<{ name: string; marketplace: string; enabled?: boolean }>;
					};
					if (cfg?.installed_plugins) {
						enabledSet = new Set(
							cfg.installed_plugins
								.filter(p => p.enabled !== false)
								.map(p => `${p.marketplace}/${p.name}`)
						);
					}
				}
				for (const marketplace of readdirSync(pluginsPath)) {
					const mktPath = join(pluginsPath, marketplace);
					if (!statSync(mktPath).isDirectory()) continue;
					for (const pluginName of readdirSync(mktPath)) {
						const pluginPath = join(mktPath, pluginName);
						if (!statSync(pluginPath).isDirectory()) continue;
						if (enabledSet && !enabledSet.has(`${marketplace}/${pluginName}`)) continue;
						const mcpJsonPath = join(pluginPath, ".mcp.json");
						if (!existsSync(mcpJsonPath)) continue;
						const parsed = JSON.parse(readFileSync(mcpJsonPath, "utf-8")) as
							{ mcpServers?: Record<string, RawEntry> };
						for (const [name, entry] of Object.entries(parsed?.mcpServers ?? {})) {
							// Avoid duplicates from mcp-config.json
							if (!newTools.some(t => t.serverName === name)) {
								addServer(name, entry);
							}
						}
					}
				}
			}
		} catch (error) {
			console.warn("[ToolCatalog] Failed to load CLI MCP tools:", error);
		}
		this.mcpTools = newTools;
		return newTools.length;
	}

	/**
	 * Get all available tools including dynamically loaded MCP server entries.
	 * @returns The 5 Basic builtin tools plus any loaded MCP server entries
	 */
	getAllTools(): ToolInfo[] {
		return [...BASIC_TOOLS, ...this.mcpTools];
	}

	/**
	 * Get tools grouped by source key for UI display.
	 *
	 * MCP tools are grouped under `"mcp:{serverName}"` keys so that
	 * `ToolPickerModal` renders each server as its own collapsible group.
	 */
	getToolsBySource(): Record<string, ToolInfo[]> {
		const result: Record<string, ToolInfo[]> = {
			builtin: [...BASIC_TOOLS],
			plugin: [],
		};
		for (const tool of this.mcpTools) {
			const key = `mcp:${tool.serverName ?? "unknown"}`;
			if (!result[key]) result[key] = [];
			result[key].push(tool);
		}
		return result;
	}

	/**
	 * Get enabled tool IDs, honoring defaults and session overrides.
	 */
	getEnabledTools(settings: CopilotPluginSettings, session?: CopilotSession): string[] {
		const allTools = this.getAllTools();
		const allToolIds = new Set(allTools.map(t => t.id));
		const enabledSet = new Set<string>();

		if (settings.defaultEnabledTools && settings.defaultEnabledTools.length > 0) {
			for (const toolId of settings.defaultEnabledTools) {
				enabledSet.add(toolId);
			}
		} else {
			for (const tool of allTools) {
				if (tool.enabledByDefault) {
					enabledSet.add(tool.id);
				}
			}
		}

		if (settings.defaultDisabledTools) {
			for (const toolId of settings.defaultDisabledTools) {
				enabledSet.delete(toolId);
			}
		}

		if (session?.toolOverrides) {
			if (session.toolOverrides.enabled) {
				enabledSet.clear();
				for (const toolId of session.toolOverrides.enabled) {
					enabledSet.add(toolId);
				}
			}
			if (session.toolOverrides.disabled) {
				for (const toolId of session.toolOverrides.disabled) {
					enabledSet.delete(toolId);
				}
			}
		}

		return Array.from(enabledSet).filter(id => allToolIds.has(id));
	}

	/**
	 * Check if a specific tool is enabled.
	 */
	isToolEnabled(toolId: string, settings: CopilotPluginSettings, session?: CopilotSession): boolean {
		const enabledTools = this.getEnabledTools(settings, session);
		return enabledTools.includes(toolId);
	}

	/**
	 * Get a summary of enabled tools for display.
	 */
	getToolsSummary(
		settings: CopilotPluginSettings,
		session?: CopilotSession
	): { enabled: number; total: number; builtin: number; plugin: number; mcp: number } {
		const allTools = this.getAllTools();
		const enabledTools = this.getEnabledTools(settings, session);

		return {
			enabled: enabledTools.length,
			total: allTools.length,
			builtin: BASIC_TOOLS.length,
			plugin: 0,
			mcp: this.mcpTools.length,
		};
	}

	/**
	 * Get a count of available tools grouped by source.
	 */
	getToolCountsBySource(): Record<string, number> {
		return {
			builtin: BASIC_TOOLS.length,
			plugin: 0,
			mcp: this.mcpTools.length,
		};
	}
}
