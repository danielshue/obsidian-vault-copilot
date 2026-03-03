/**
 * @module ToolCatalog (Basic)
 * @description Tool discovery and selection management for Basic Vault Copilot.
 *
 * This is a standalone version with only the 5 Basic tools:
 * - get_active_note
 * - open_note
 * - batch_read_notes
 * - fetch_web_page
 * - web_search
 *
 * Pro extends this with MCP tools, Skills, and 35+ additional builtin tools.
 *
 * @since 0.1.0
 */

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
 * Built-in tool catalog for Basic (only 5 tools).
 */
const BASIC_TOOLS: ToolInfo[] = [
	createBuiltinTool(TOOL_NAMES.GET_ACTIVE_NOTE, "Get Active Note"),
	createBuiltinTool(TOOL_NAMES.OPEN_NOTE, "Open Note"),
	createBuiltinTool(TOOL_NAMES.BATCH_READ_NOTES, "Batch Read Notes"),
	createBuiltinTool(TOOL_NAMES.FETCH_WEB_PAGE, "Fetch Web Page"),
	createBuiltinTool(TOOL_NAMES.WEB_SEARCH, "Web Search"),
];

/**
 * ToolCatalog class for managing tool discovery and selection.
 *
 * Basic version has no MCP or SkillRegistry support - it only provides
 * the 5 builtin tools.
 */
export class ToolCatalog {
	/**
	 * Create a new tool catalog.
	 * Basic version ignores constructor arguments (no MCP/Skills).
	 */
	constructor() {
		// Basic has no MCP or SkillRegistry
	}

	/**
	 * Get all available tools.
	 * @returns The 5 Basic builtin tools
	 */
	getAllTools(): ToolInfo[] {
		return [...BASIC_TOOLS];
	}

	/**
	 * Get tools grouped by source for UI display.
	 */
	getToolsBySource(): Record<string, ToolInfo[]> {
		return {
			builtin: [...BASIC_TOOLS],
			plugin: [],
		};
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
			builtin: allTools.length,
			plugin: 0,
			mcp: 0,
		};
	}

	/**
	 * Get a count of available tools grouped by source.
	 */
	getToolCountsBySource(): Record<string, number> {
		return {
			builtin: BASIC_TOOLS.length,
			plugin: 0,
		};
	}
}
