/**
 * ToolCatalog - centralizes tool discovery and selection management
 * 
 * Aggregates tools from:
 * - Built-in Obsidian tools (note operations)
 * - Plugin-registered skills (SkillRegistry)
 * - MCP server tools (McpManager)
 */

import { SkillRegistry } from "./SkillRegistry";
import { McpManager } from "./McpManager";
import { CopilotPluginSettings, CopilotSession } from "../settings";

/**
 * Information about a tool for display in the picker
 */
export interface ToolInfo {
	/** Unique tool identifier (used for filtering) */
	id: string;
	/** Human-readable display name */
	displayName: string;
	/** Tool description */
	description: string;
	/** Source of the tool */
	source: "builtin" | "mcp" | "plugin";
	/** For MCP tools: the server ID */
	serverId?: string;
	/** For MCP tools: the server display name */
	serverName?: string;
	/** Whether this tool is enabled by default */
	enabledByDefault: boolean;
}

/**
 * Built-in Obsidian tools (note operations)
 */
const BUILTIN_TOOLS: ToolInfo[] = [
	{
		id: "read_note",
		displayName: "Read Note",
		description: "Read the content of a note from the vault",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "search_notes",
		displayName: "Search Notes",
		description: "Search for notes by content or title",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "create_note",
		displayName: "Create Note",
		description: "Create a new note in the vault",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "get_active_note",
		displayName: "Get Active Note",
		description: "Get the currently open note",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "list_notes",
		displayName: "List Notes",
		description: "List all notes in the vault or folder",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "append_to_note",
		displayName: "Append to Note",
		description: "Append content to an existing note",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "batch_read_notes",
		displayName: "Batch Read Notes",
		description: "Read multiple notes at once",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "update_note",
		displayName: "Update Note",
		description: "Replace the entire content of a note",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "delete_note",
		displayName: "Delete Note",
		description: "Delete a note (moves to trash)",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "get_recent_changes",
		displayName: "Get Recent Changes",
		description: "Get recently modified files",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "patch_note",
		displayName: "Patch Note",
		description: "Insert content at a specific location in a note",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "get_daily_note",
		displayName: "Get Daily Note",
		description: "Get today's or a specific date's daily note",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "rename_note",
		displayName: "Rename Note",
		description: "Rename or move a note",
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: "fetch_web_page",
		displayName: "Fetch Web Page",
		description: "Fetch and extract content from a web page URL",
		source: "builtin",
		enabledByDefault: true,
	},
];

/**
 * ToolCatalog class for managing tool discovery and selection
 */
export class ToolCatalog {
	private skillRegistry: SkillRegistry | null = null;
	private mcpManager: McpManager | null = null;

	constructor(skillRegistry?: SkillRegistry, mcpManager?: McpManager) {
		this.skillRegistry = skillRegistry || null;
		this.mcpManager = mcpManager || null;
	}

	/**
	 * Get all available tools from all sources
	 */
	getAllTools(): ToolInfo[] {
		const tools: ToolInfo[] = [];

		// Add built-in tools
		tools.push(...BUILTIN_TOOLS);

		// Add plugin-registered skills
		if (this.skillRegistry) {
			for (const skill of this.skillRegistry.listSkills()) {
				tools.push({
					id: skill.name,
					displayName: skill.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
					description: skill.description,
					source: "plugin",
					enabledByDefault: true, // Plugin skills enabled by default
				});
			}
		}

		// Add MCP server tools
		if (this.mcpManager) {
			const mcpTools = this.mcpManager.getAllTools();
			for (const { serverId, serverName, tool } of mcpTools) {
				// MCP tool names are prefixed as: mcp_<serverName>_<toolName>
				const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9_]/g, "_");
				const toolId = `mcp_${sanitizedServerName}_${tool.name}`;

				tools.push({
					id: toolId,
					displayName: tool.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
					description: tool.description || tool.name,
					source: "mcp",
					serverId,
					serverName,
					enabledByDefault: false, // MCP tools disabled by default per user preference
				});
			}
		}

		return tools;
	}

	/**
	 * Get tools grouped by source for UI display
	 */
	getToolsBySource(): Record<string, ToolInfo[]> {
		const tools = this.getAllTools();
		const grouped: Record<string, ToolInfo[]> = {
			builtin: [],
			plugin: [],
		};

		// Group MCP tools by server name
		const mcpByServer = new Map<string, ToolInfo[]>();

		for (const tool of tools) {
			if (tool.source === "builtin") {
				grouped.builtin!.push(tool);
			} else if (tool.source === "plugin") {
				grouped.plugin!.push(tool);
			} else if (tool.source === "mcp" && tool.serverName) {
				if (!mcpByServer.has(tool.serverName)) {
					mcpByServer.set(tool.serverName, []);
				}
				mcpByServer.get(tool.serverName)!.push(tool);
			}
		}

		// Add MCP server groups
		for (const [serverName, serverTools] of mcpByServer) {
			grouped[`mcp:${serverName}`] = serverTools;
		}

		return grouped;
	}

	/**
	 * Get enabled tools for a session, considering global defaults and session overrides
	 */
	getEnabledTools(settings: CopilotPluginSettings, session?: CopilotSession): string[] {
		const allTools = this.getAllTools();
		const allToolIds = new Set(allTools.map(t => t.id));
		const enabledSet = new Set<string>();

		// Start with default enabled tools
		if (settings.defaultEnabledTools && settings.defaultEnabledTools.length > 0) {
			// Explicit list provided
			for (const toolId of settings.defaultEnabledTools) {
				enabledSet.add(toolId);
			}
		} else {
			// Use tool defaults (builtin and plugin enabled, MCP disabled)
			for (const tool of allTools) {
				if (tool.enabledByDefault) {
					enabledSet.add(tool.id);
				}
			}
		}

		// Remove default disabled tools
		if (settings.defaultDisabledTools) {
			for (const toolId of settings.defaultDisabledTools) {
				enabledSet.delete(toolId);
			}
		}

		// Apply session-specific overrides
		if (session?.toolOverrides) {
			if (session.toolOverrides.enabled) {
				// If session specifies enabled list, use it exclusively
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

		// Filter to only include tools that currently exist in the catalog
		// This handles cases where MCP servers disconnect or tools are removed
		return Array.from(enabledSet).filter(id => allToolIds.has(id));
	}

	/**
	 * Check if a specific tool is enabled
	 */
	isToolEnabled(toolId: string, settings: CopilotPluginSettings, session?: CopilotSession): boolean {
		const enabledTools = this.getEnabledTools(settings, session);
		return enabledTools.includes(toolId);
	}

	/**
	 * Get a summary of enabled tools (for display in UI)
	 */
	getToolsSummary(settings: CopilotPluginSettings, session?: CopilotSession): { 
		enabled: number; 
		total: number; 
		builtin: number; 
		plugin: number; 
		mcp: number 
	} {
		const allTools = this.getAllTools();
		const enabledTools = this.getEnabledTools(settings, session);
		
		// Count by source
		let builtin = 0;
		let plugin = 0;
		let mcp = 0;
		for (const tool of allTools) {
			if (tool.source === "builtin") builtin++;
			else if (tool.source === "plugin") plugin++;
			else if (tool.source === "mcp") mcp++;
		}
		
		return {
			enabled: enabledTools.length,
			total: allTools.length,
			builtin,
			plugin,
			mcp,
		};
	}

	/**
	 * Get the count of available tools by source
	 */
	getToolCountsBySource(): Record<string, number> {
		const grouped = this.getToolsBySource();
		const counts: Record<string, number> = {};
		for (const [source, tools] of Object.entries(grouped)) {
			counts[source] = tools.length;
		}
		return counts;
	}
}
