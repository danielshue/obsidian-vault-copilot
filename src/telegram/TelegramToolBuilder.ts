/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module TelegramToolBuilder
 * @description Builds ToolDefinition[] with handlers for Telegram AI calls.
 *
 * Creates tool definitions that map vault operations, task management, web operations,
 * and introspection tools to the AIProvider ToolDefinition interface. These tools
 * are set on a dedicated AI service instance for Telegram message processing.
 *
 * ## Tool Categories
 *
 * - **Vault Read**: read_note, search_notes, list_notes, batch_read_notes, etc.
 * - **Vault Write**: create_note, append_to_note, update_note, delete_note, etc.
 * - **Tasks**: get_tasks, create_task, mark_tasks, list_tasks
 * - **Web**: fetch_web_page, web_search
 * - **Introspection**: list_available_tools, list_available_agents, etc.
 *
 * UI-only tools (open_note, show_markdown, speak, send_to_chat, ask_question)
 * are excluded since they require the Obsidian desktop UI.
 *
 * @see {@link TelegramMessageHandler} for where these tools are used
 * @see {@link ToolDefinitions} for tool schemas and descriptions
 * @see {@link VaultOperations} for underlying implementations
 * @since 0.1.0
 */

import type { App } from "obsidian";
import type CopilotPlugin from "../main";
import type { ToolDefinition } from "../copilot/providers/AIProvider";
import {
	TOOL_NAMES,
	TOOL_DESCRIPTIONS,
	TOOL_JSON_SCHEMAS,
	type PatchOperation,
	type PatchTargetType,
} from "../copilot/tools/ToolDefinitions";
import type { TaskPriority } from "../copilot/tools/TaskOperations";
import * as VaultOps from "../copilot/tools/VaultOperations";
import { ToolCatalog } from "../copilot/tools/ToolCatalog";

/**
 * Build the complete set of ToolDefinition[] for Telegram AI calls.
 *
 * Includes vault read/write operations, task management, web operations,
 * and introspection tools. Excludes UI-only tools that require the
 * Obsidian desktop interface.
 *
 * @param app - Obsidian App instance
 * @param plugin - Plugin instance for accessing caches and managers
 * @returns Array of tool definitions with handlers
 *
 * @example
 * ```typescript
 * const tools = buildTelegramToolDefinitions(app, plugin);
 * service.setTools(tools);
 * ```
 */
export function buildTelegramToolDefinitions(
	app: App,
	plugin: CopilotPlugin
): ToolDefinition[] {
	const tools: ToolDefinition[] = [];

	// ========================================================================
	// Vault Read Operations
	// ========================================================================

	tools.push({
		name: TOOL_NAMES.READ_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.READ_NOTE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.readNote(app, args.path as string);
		},
	});

	tools.push({
		name: TOOL_NAMES.SEARCH_NOTES,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.SEARCH_NOTES],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.SEARCH_NOTES] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.searchNotes(app, args.query as string, (args.limit as number) ?? 10);
		},
	});

	tools.push({
		name: TOOL_NAMES.GET_ACTIVE_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_ACTIVE_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_ACTIVE_NOTE] as Record<string, unknown>,
		handler: async () => {
			return await VaultOps.getActiveNote(app);
		},
	});

	tools.push({
		name: TOOL_NAMES.LIST_NOTES,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.listNotes(app, args.folder as string | undefined);
		},
	});

	tools.push({
		name: TOOL_NAMES.LIST_NOTES_RECURSIVELY,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES_RECURSIVELY],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES_RECURSIVELY] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.listNotesRecursively(app, args.folder as string | undefined, args.limit as number | undefined);
		},
	});

	tools.push({
		name: TOOL_NAMES.BATCH_READ_NOTES,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.BATCH_READ_NOTES],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.BATCH_READ_NOTES] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.readNote(app, (args.paths as string[])[0] ?? "");
			// Note: batch_read_notes without AI summarization just reads sequentially
		},
	});

	tools.push({
		name: TOOL_NAMES.GET_RECENT_CHANGES,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_RECENT_CHANGES],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_RECENT_CHANGES] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.getRecentChanges(app, (args.limit as number) ?? 10);
		},
	});

	tools.push({
		name: TOOL_NAMES.GET_DAILY_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_DAILY_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_DAILY_NOTE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.getDailyNote(app, args.date as string | undefined);
		},
	});

	// ========================================================================
	// Vault Write Operations
	// ========================================================================

	tools.push({
		name: TOOL_NAMES.CREATE_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.CREATE_NOTE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.createNote(app, args.path as string, args.content as string);
		},
	});

	tools.push({
		name: TOOL_NAMES.APPEND_TO_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.APPEND_TO_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.APPEND_TO_NOTE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.appendToNote(app, args.path as string, args.content as string);
		},
	});

	tools.push({
		name: TOOL_NAMES.UPDATE_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.UPDATE_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.UPDATE_NOTE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.updateNote(app, args.path as string, args.content as string);
		},
	});

	tools.push({
		name: TOOL_NAMES.DELETE_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.DELETE_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.DELETE_NOTE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.deleteNote(app, args.path as string);
		},
	});

	tools.push({
		name: TOOL_NAMES.RENAME_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.RENAME_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.RENAME_NOTE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.renameNote(app, args.oldPath as string, args.newPath as string);
		},
	});

	tools.push({
		name: TOOL_NAMES.PATCH_NOTE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.PATCH_NOTE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.PATCH_NOTE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.patchNote(
				app,
				args.path as string,
				args.operation as PatchOperation,
				args.target_type as PatchTargetType,
				args.target as string | undefined,
				args.content as string
			);
		},
	});

	tools.push({
		name: TOOL_NAMES.FIND_AND_REPLACE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.FIND_AND_REPLACE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.FIND_AND_REPLACE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.findAndReplaceInNote(
				app,
				args.path as string,
				args.find as string,
				args.replace as string
			);
		},
	});

	// ========================================================================
	// Task Operations
	// ========================================================================

	tools.push({
		name: TOOL_NAMES.GET_TASKS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_TASKS],
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Path to a note to get tasks from" },
			},
			required: [],
		},
		handler: async (args) => {
			return await VaultOps.getTasksFromNote(app, args.path as string | undefined);
		},
	});

	tools.push({
		name: TOOL_NAMES.CREATE_TASK,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_TASK],
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Path to the note where the task should be created" },
				description: { type: "string", description: "The task description text" },
				priority: { type: "string", description: "Priority (highest, high, medium, low, lowest)" },
				dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" },
				tags: { type: "array", items: { type: "string" }, description: "Tags to add (without # prefix)" },
			},
			required: ["path", "description"],
		},
		handler: async (args) => {
			return await VaultOps.createTask(app, {
				path: args.path as string,
				description: args.description as string,
				priority: args.priority as TaskPriority | undefined,
				dueDate: args.dueDate as string | undefined,
				tags: args.tags as string[] | undefined,
			});
		},
	});

	tools.push({
		name: TOOL_NAMES.MARK_TASKS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.MARK_TASKS],
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Path to the note containing the tasks" },
				tasks: { type: "array", items: { type: "string" }, description: "Task description text strings to modify" },
				complete: { type: "boolean", description: "true to mark complete, false for incomplete (default: true)" },
			},
			required: ["tasks"],
		},
		handler: async (args) => {
			return await VaultOps.updateTaskStatus(
				app,
				args.tasks as string[],
				(args.complete as boolean) ?? true,
				[],
				args.path as string | undefined
			);
		},
	});

	tools.push({
		name: TOOL_NAMES.LIST_TASKS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_TASKS],
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Path to a specific note to list tasks from" },
				completed: { type: "boolean", description: "Filter by completion status" },
				priority: { type: "string", description: "Filter by priority (highest, high, medium, low, lowest)" },
				tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
				dueBefore: { type: "string", description: "Filter tasks due before this date (YYYY-MM-DD)" },
				dueAfter: { type: "string", description: "Filter tasks due after this date (YYYY-MM-DD)" },
				limit: { type: "number", description: "Maximum number of tasks to return (default: 50)" },
			},
			required: [],
		},
		handler: async (args) => {
			return await VaultOps.listTasks(app, {
				path: args.path as string | undefined,
				completed: args.completed as boolean | undefined,
				priority: args.priority as TaskPriority | TaskPriority[] | undefined,
				tags: args.tags as string[] | undefined,
				dueBefore: args.dueBefore as string | undefined,
				dueAfter: args.dueAfter as string | undefined,
				limit: (args.limit as number) ?? 50,
			});
		},
	});

	// ========================================================================
	// Web Operations
	// ========================================================================

	tools.push({
		name: TOOL_NAMES.FETCH_WEB_PAGE,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.FETCH_WEB_PAGE],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.FETCH_WEB_PAGE] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.fetchWebPage(args.url as string);
		},
	});

	tools.push({
		name: TOOL_NAMES.WEB_SEARCH,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.WEB_SEARCH],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.WEB_SEARCH] as Record<string, unknown>,
		handler: async (args) => {
			return await VaultOps.webSearch(args.query as string, (args.limit as number) ?? 5);
		},
	});

	// ========================================================================
	// Introspection Operations
	// ========================================================================

	tools.push({
		name: TOOL_NAMES.LIST_AVAILABLE_TOOLS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_TOOLS],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_TOOLS] as Record<string, unknown>,
		handler: async (args) => {
			const source = (args.source as string) || "all";
			const catalog = new ToolCatalog(plugin.skillRegistry, plugin.mcpManager);
			const allTools = catalog.getAllTools();
			const filtered = source === "all"
				? allTools
				: allTools.filter(t => t.source === source);
			return {
				count: filtered.length,
				source,
				tools: filtered.map(t => ({
					id: t.id,
					displayName: t.displayName,
					description: t.description,
					source: t.source,
					...(t.serverName ? { serverName: t.serverName } : {}),
				})),
			};
		},
	});

	tools.push({
		name: TOOL_NAMES.LIST_AVAILABLE_AGENTS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_AGENTS],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_AGENTS] as Record<string, unknown>,
		handler: async (args) => {
			const nameFilter = args.name as string | undefined;
			const agents = plugin.agentCache.getAgents();
			const filtered = nameFilter
				? agents.filter(a => a.name.toLowerCase().includes(nameFilter.toLowerCase()))
				: agents;
			return {
				count: filtered.length,
				agents: filtered.map(a => ({
					name: a.name,
					description: a.description,
					tools: a.tools,
					path: a.path,
				})),
			};
		},
	});

	tools.push({
		name: TOOL_NAMES.LIST_AVAILABLE_PROMPTS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_PROMPTS],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_PROMPTS] as Record<string, unknown>,
		handler: async (args) => {
			const nameFilter = args.name as string | undefined;
			const prompts = plugin.promptCache.getPrompts();
			const filtered = nameFilter
				? prompts.filter(p => p.name.toLowerCase().includes(nameFilter.toLowerCase()))
				: prompts;
			return {
				count: filtered.length,
				prompts: filtered.map(p => ({
					name: p.name,
					description: p.description,
					tools: p.tools,
					model: p.model,
					agent: p.agent,
					path: p.path,
				})),
			};
		},
	});

	tools.push({
		name: TOOL_NAMES.LIST_AVAILABLE_SKILLS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_SKILLS],
		parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_SKILLS] as Record<string, unknown>,
		handler: async (args) => {
			const source = (args.source as string) || "all";
			const skills: Array<{ name: string; description: string; source: string; path?: string }> = [];

			// File-based skills from SkillCache
			if (source === "all" || source === "file") {
				for (const s of plugin.skillCache.getSkills()) {
					skills.push({
						name: s.name,
						description: s.description,
						source: "file",
						path: s.path,
					});
				}
			}

			// Runtime-registered skills from SkillRegistry
			if (source === "all" || source === "runtime") {
				for (const s of plugin.skillRegistry.listSkills()) {
					skills.push({
						name: s.name,
						description: s.description,
						source: "runtime",
					});
				}
			}

			return { count: skills.length, source, skills };
		},
	});

	return tools;
}
