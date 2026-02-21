/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CopilotToolFactory
 * @description Factory functions for creating SDK tool definitions.
 *
 * Extracted from GitHubCopilotCliService to isolate the large tool-building
 * logic (~500 lines) from the core session management code. All functions
 * are stateless — they receive their dependencies as parameters.
 *
 * ## Responsibilities
 *
 * - {@link createObsidianTools} — Built-in vault operation tools + Bases + introspection
 * - {@link convertRegisteredSkillsToTools} — SkillRegistry → SDK tools
 * - {@link convertMcpToolsToSdkTools} — MCP server tools → SDK tools
 * - {@link buildCustomAgentsConfig} — Agent directory configuration
 *
 * ## Architecture
 *
 * ```
 * createObsidianTools()
 *   ├── VaultOperations tools
 *   ├── Bases tools
 *   ├── Introspection tools
 *   └── ask_question (optional, callback-driven)
 *
 * convertRegisteredSkillsToTools()
 *   └── SkillRegistry skills with runtime handlers
 *
 * convertMcpToolsToSdkTools()
 *   └── McpManager tool wrappers (server-prefixed names)
 * ```
 *
 * @example
 * ```typescript
 * const tools = [
 *   ...createObsidianTools({ app, config, customizationLoader, questionCallback, batchReadNotes }),
 *   ...convertRegisteredSkillsToTools(config.skillRegistry),
 *   ...convertMcpToolsToSdkTools(config.mcpManager),
 * ];
 * ```
 *
 * @see {@link GitHubCopilotCliService} for session creation that consumes these tools
 * @see {@link TOOL_NAMES} and {@link TOOL_JSON_SCHEMAS} for built-in tool metadata
 * @see {@link BASES_TOOL_NAMES} for Bases tool registration
 * @since 0.0.35
 */

import { defineTool } from "@github/copilot-sdk";
import type { App } from "obsidian";
import type { SkillRegistry, VaultCopilotSkill } from "../customization/SkillRegistry";
import type { CustomizationLoader } from "../customization/CustomizationLoader";
import type { McpManager } from "../mcp/McpManager";
import * as VaultOps from "../tools/VaultOperations";
import { TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_JSON_SCHEMAS } from "../tools/ToolDefinitions";
import type { QuestionRequest, QuestionResponse } from "../../types/questions";
import {
	BASES_TOOL_NAMES,
	BASES_TOOL_DESCRIPTIONS,
	BASES_TOOL_JSON_SCHEMAS,
	type QueryBaseParams,
	type AddBaseRecordsParams,
	type CreateBaseParams,
	type ReadBaseParams,
	type UpdateBaseRecordsParams,
	type EvolveBaseSchemaParams,
} from "../bases/BasesToolDefinitions";
import {
	handleQueryBase,
	handleAddBaseRecords,
	handleCreateBase,
	handleReadBase,
	handleUpdateBaseRecords,
	handleEvolveBaseSchema,
} from "../bases/BasesToolHandlers";
import type { GitHubCopilotCliConfig } from "./types";

// ── Public Types ───────────────────────────────────────────────────────────

/**
 * Dependencies required by {@link createObsidianTools}.
 *
 * Passed as a single options object so the factory remains decoupled from
 * the service class.
 *
 * @see {@link GitHubCopilotCliConfig} for provider-level settings used by tool handlers
 */
export interface ObsidianToolDeps {
	/** The Obsidian application instance */
	app: App;
	/** Service configuration (for skill/agent/prompt directories, MCP manager, etc.) */
	config: GitHubCopilotCliConfig;
	/** Loader for custom skills, agents, prompts, and instructions */
	customizationLoader: CustomizationLoader;
	/** Optional callback to show a QuestionModal to the user */
	questionCallback: ((question: QuestionRequest) => Promise<QuestionResponse | null>) | null;
	/** Bound batch-read implementation (delegates to the service's batchReadNotes) */
	batchReadNotes: (paths: string[], aiSummarize?: boolean, summaryPrompt?: string) => Promise<{ results: Array<{ path: string; success: boolean; content?: string; summary?: string; error?: string }> }>;
}

// ── Factory Functions ──────────────────────────────────────────────────────

/**
 * Create the array of SDK tool definitions for Obsidian vault operations.
 *
 * Registers built-in tools (read, write, search, batch, Bases, introspection)
 * and conditionally adds the `ask_question` tool when a question callback is set.
 *
 * @param deps - All external dependencies needed to build tools
 * @returns Array of SDK `defineTool()` results ready to pass to `createSession()`
 *
 * @example
 * ```typescript
 * const tools = createObsidianTools({
 *   app, config, customizationLoader,
 *   questionCallback: null,
 *   batchReadNotes: service.batchReadNotes.bind(service),
 * });
 * ```
 *
 * @see {@link convertRegisteredSkillsToTools} to add runtime skills
 * @see {@link convertMcpToolsToSdkTools} to add MCP server tools
 * @since 0.0.35
 */
export function createObsidianTools(deps: ObsidianToolDeps) {
	const { app, config, customizationLoader, questionCallback, batchReadNotes } = deps;

	const tools = [
		defineTool(TOOL_NAMES.READ_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.READ_NOTE],
			handler: async (args: { path: string }) => {
				return await VaultOps.readNote(app, args.path);
			},
		}),

		defineTool(TOOL_NAMES.SEARCH_NOTES, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.SEARCH_NOTES],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.SEARCH_NOTES],
			handler: async (args: { query: string; limit?: number }) => {
				return await VaultOps.searchNotes(app, args.query, args.limit ?? 10);
			},
		}),

		defineTool(TOOL_NAMES.CREATE_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.CREATE_NOTE],
			handler: async (args: { path: string; content: string }) => {
				return await VaultOps.createNote(app, args.path, args.content);
			},
		}),

		defineTool(TOOL_NAMES.GET_ACTIVE_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_ACTIVE_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_ACTIVE_NOTE],
			handler: async () => {
				return await VaultOps.getActiveNote(app);
			},
		}),

		defineTool(TOOL_NAMES.LIST_NOTES, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES],
			handler: async (args: { folder?: string }) => {
				return await VaultOps.listNotes(app, args.folder);
			},
		}),

		defineTool(TOOL_NAMES.LIST_NOTES_RECURSIVELY, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES_RECURSIVELY],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES_RECURSIVELY],
			handler: async (args: { folder?: string; limit?: number }) => {
				return await VaultOps.listNotesRecursively(app, args.folder, args.limit);
			},
		}),

		defineTool(TOOL_NAMES.APPEND_TO_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.APPEND_TO_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.APPEND_TO_NOTE],
			handler: async (args: { path: string; content: string }) => {
				return await VaultOps.appendToNote(app, args.path, args.content);
			},
		}),

		defineTool(TOOL_NAMES.BATCH_READ_NOTES, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.BATCH_READ_NOTES],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.BATCH_READ_NOTES],
			handler: async (args: { paths: string[]; aiSummarize?: boolean; summaryPrompt?: string }) => {
				return await batchReadNotes(args.paths, args.aiSummarize, args.summaryPrompt);
			},
		}),

		defineTool(TOOL_NAMES.UPDATE_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.UPDATE_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.UPDATE_NOTE],
			handler: async (args: { path: string; content: string }) => {
				return await VaultOps.updateNote(app, args.path, args.content);
			},
		}),

		defineTool(TOOL_NAMES.DELETE_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.DELETE_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.DELETE_NOTE],
			handler: async (args: { path: string }) => {
				return await VaultOps.deleteNote(app, args.path);
			},
		}),

		defineTool(TOOL_NAMES.GET_RECENT_CHANGES, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_RECENT_CHANGES],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_RECENT_CHANGES],
			handler: async (args: { limit?: number }) => {
				return await VaultOps.getRecentChanges(app, args.limit ?? 10);
			},
		}),

		defineTool(TOOL_NAMES.PATCH_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.PATCH_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.PATCH_NOTE],
			handler: async (args: { path: string; operation: string; target_type: string; target?: string; content: string }) => {
				return await VaultOps.patchNote(app, args.path, args.operation as VaultOps.PatchOperation, args.target_type as VaultOps.PatchTargetType, args.target, args.content);
			},
		}),

		defineTool(TOOL_NAMES.GET_DAILY_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_DAILY_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_DAILY_NOTE],
			handler: async (args: { date?: string }) => {
				return await VaultOps.getDailyNote(app, args.date);
			},
		}),

		defineTool(TOOL_NAMES.RENAME_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.RENAME_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.RENAME_NOTE],
			handler: async (args: { oldPath: string; newPath: string }) => {
				return await VaultOps.renameNote(app, args.oldPath, args.newPath);
			},
		}),

		defineTool(TOOL_NAMES.FETCH_WEB_PAGE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.FETCH_WEB_PAGE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.FETCH_WEB_PAGE],
			handler: async (args: { url: string }) => {
				return await VaultOps.fetchWebPage(args.url);
			},
		}),

		// Bases AI tools
		defineTool(BASES_TOOL_NAMES.CREATE_BASE, {
			description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.CREATE_BASE],
			parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.CREATE_BASE],
			handler: async (args: CreateBaseParams) => {
				return await handleCreateBase(app, args, questionCallback);
			},
		}),

		defineTool(BASES_TOOL_NAMES.READ_BASE, {
			description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.READ_BASE],
			parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.READ_BASE],
			handler: async (args: ReadBaseParams) => {
				return await handleReadBase(app, args);
			},
		}),

		defineTool(BASES_TOOL_NAMES.QUERY_BASE, {
			description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.QUERY_BASE],
			parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.QUERY_BASE],
			handler: async (args: QueryBaseParams) => {
				return await handleQueryBase(app, args);
			},
		}),

		defineTool(BASES_TOOL_NAMES.ADD_BASE_RECORDS, {
			description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.ADD_BASE_RECORDS],
			parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.ADD_BASE_RECORDS],
			handler: async (args: AddBaseRecordsParams) => {
				return await handleAddBaseRecords(app, args);
			},
		}),

		defineTool(BASES_TOOL_NAMES.UPDATE_BASE_RECORDS, {
			description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS],
			parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS],
			handler: async (args: UpdateBaseRecordsParams) => {
				return await handleUpdateBaseRecords(app, args);
			},
		}),

		defineTool(BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA, {
			description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA],
			parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA],
			handler: async (args: EvolveBaseSchemaParams) => {
				return await handleEvolveBaseSchema(app, args);
			},
		}),

		// Introspection tools
		defineTool(TOOL_NAMES.LIST_AVAILABLE_TOOLS, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_TOOLS],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_TOOLS],
			handler: async (args: { source?: string }) => {
				const source = args.source || "all";
				const catalog = new (await import("../tools/ToolCatalog")).ToolCatalog(
					config.skillRegistry,
					config.mcpManager,
				);
				const allTools = catalog.getAllTools();
				const filtered = source === "all" ? allTools : allTools.filter((t) => t.source === source);
				return {
					count: filtered.length,
					source,
					tools: filtered.map((t) => ({
						id: t.id,
						displayName: t.displayName,
						description: t.description,
						source: t.source,
						...(t.serverName ? { serverName: t.serverName } : {}),
					})),
				};
			},
		}),

		defineTool(TOOL_NAMES.LIST_AVAILABLE_SKILLS, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_SKILLS],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_SKILLS],
			handler: async (args: { source?: string }) => {
				const source = args.source || "all";
				const results: Array<{
					name: string;
					description: string;
					source: string;
					path?: string;
					resources?: Array<{ name: string; path: string; type: string }>;
				}> = [];

				// File-based skills from CustomizationLoader
				if (source === "all" || source === "file") {
					const dirs = config.skillDirectories ?? [];
					const fileSkills = await customizationLoader.loadSkills(dirs);
					for (const skill of fileSkills) {
						// Enforce disableModelInvocation: skip skills that opt out of AI auto-discovery
						if (skill.disableModelInvocation === true) continue;

						results.push({
							name: skill.name,
							description: skill.description,
							source: "file",
							path: skill.path,
							resources: skill.resources?.map((r) => ({
								name: r.name,
								path: r.relativePath,
								type: r.type,
							})),
						});
					}
				}

				// Runtime skills from SkillRegistry
				if (source === "all" || source === "runtime") {
					if (config.skillRegistry) {
						for (const skill of config.skillRegistry.listSkills()) {
							results.push({
								name: skill.name,
								description: skill.description,
								source: "runtime",
							});
						}
					}
				}

				return { count: results.length, source, skills: results };
			},
		}),

		defineTool(TOOL_NAMES.READ_SKILL_RESOURCE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_SKILL_RESOURCE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.READ_SKILL_RESOURCE],
			handler: async (args: { skillName: string; resourcePath: string }) => {
				// Find the skill to get its path
				const dirs = config.skillDirectories ?? [];
				const fileSkills = await customizationLoader.loadSkills(dirs);
				const skill = fileSkills.find((s) => s.name.toLowerCase() === args.skillName.toLowerCase());
				if (!skill) {
					return { error: `Skill '${args.skillName}' not found. Use list_available_skills to see available skills.` };
				}

				try {
					const content = await customizationLoader.readSkillResource(skill.path, args.resourcePath);
					if (content === null) {
						return { error: `Resource '${args.resourcePath}' not found in skill '${args.skillName}'.` };
					}
					return {
						skillName: args.skillName,
						resourcePath: args.resourcePath,
						content,
						size: content.length,
					};
				} catch (err) {
					return { error: `Failed to read resource: ${err instanceof Error ? err.message : String(err)}` };
				}
			},
		}),

		defineTool(TOOL_NAMES.LIST_AVAILABLE_AGENTS, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_AGENTS],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_AGENTS],
			handler: async (args: { name?: string }) => {
				const dirs = config.agentDirectories ?? [];
				const agents = await customizationLoader.loadAgents(dirs);
				const filtered = args.name ? agents.filter((a) => a.name.toLowerCase().includes(args.name!.toLowerCase())) : agents;
				return {
					count: filtered.length,
					agents: filtered.map((a) => ({
						name: a.name,
						description: a.description,
						tools: a.tools ?? [],
						path: a.path,
					})),
				};
			},
		}),

		defineTool(TOOL_NAMES.LIST_AVAILABLE_PROMPTS, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_PROMPTS],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_PROMPTS],
			handler: async (args: { name?: string }) => {
				const dirs = config.promptDirectories ?? [];
				const prompts = await customizationLoader.loadPrompts(dirs);
				const filtered = args.name ? prompts.filter((p) => p.name.toLowerCase().includes(args.name!.toLowerCase())) : prompts;
				return {
					count: filtered.length,
					prompts: filtered.map((p) => ({
						name: p.name,
						description: p.description,
						tools: p.tools ?? [],
						model: p.model,
						agent: p.agent,
						path: p.path,
					})),
				};
			},
		}),

		defineTool(TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS],
			handler: async (args: { applyTo?: string }) => {
				const dirs = config.instructionDirectories ?? [];
				const instructions = await customizationLoader.loadInstructions(dirs);
				const filtered = args.applyTo
					? instructions.filter((i) => i.applyTo?.toLowerCase().includes(args.applyTo!.toLowerCase()))
					: instructions;
				return {
					count: filtered.length,
					instructions: filtered.map((i) => ({
						name: i.name,
						applyTo: i.applyTo,
						path: i.path,
					})),
				};
			},
		}),
	];

	// Add ask_question tool if question callback is available
	if (questionCallback) {
		const callback = questionCallback;
		// Cast needed: defineTool returns Tool<T> with varying T per handler signature
		tools.push(
			defineTool(TOOL_NAMES.ASK_QUESTION, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.ASK_QUESTION],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.ASK_QUESTION],
				handler: async (args: {
					type: string;
					question: string;
					context?: string;
					options?: string[];
					allowMultiple?: boolean;
					placeholder?: string;
					textLabel?: string;
					defaultValue?: string;
					defaultSelected?: string[];
					multiline?: boolean;
					required?: boolean;
				}) => {
					const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

					// Build question request based on type
					const questionRequest: QuestionRequest = {
						id,
						type: args.type,
						question: args.question,
						context: args.context,
						required: args.required !== false,
					} as QuestionRequest;

					// Add type-specific properties
					if (args.type === "text") {
						(questionRequest as any).placeholder = args.placeholder;
						(questionRequest as any).defaultValue = args.defaultValue;
						(questionRequest as any).multiline = args.multiline || false;
					} else if (args.type === "multipleChoice") {
						if (!args.options || args.options.length === 0) {
							return { success: false, error: "multipleChoice type requires options array" };
						}
						(questionRequest as any).options = args.options;
						(questionRequest as any).allowMultiple = args.allowMultiple || false;
						(questionRequest as any).defaultSelected = args.defaultSelected;
					} else if (args.type === "radio") {
						if (!args.options || args.options.length === 0) {
							return { success: false, error: "radio type requires options array" };
						}
						(questionRequest as any).options = args.options;
						(questionRequest as any).defaultSelected = args.defaultSelected?.[0];
					} else if (args.type === "mixed") {
						if (!args.options || args.options.length === 0) {
							return { success: false, error: "mixed type requires options array" };
						}
						(questionRequest as any).options = args.options;
						(questionRequest as any).allowMultiple = args.allowMultiple || false;
						(questionRequest as any).defaultSelected = args.defaultSelected;
						(questionRequest as any).textPlaceholder = args.placeholder;
						(questionRequest as any).textLabel = args.textLabel;
					}

					try {
						const response = await callback(questionRequest);

						if (!response) {
							return { success: false, cancelled: true, message: "User cancelled the question" };
						}

						// Format response
						let formattedResponse: string;
						if (response.type === "text") {
							formattedResponse = response.text;
						} else if (response.type === "multipleChoice" || response.type === "radio") {
							formattedResponse = response.selected.join(", ");
						} else if (response.type === "mixed") {
							const parts = [];
							if (response.selected.length > 0) {
								parts.push(`Selected: ${response.selected.join(", ")}`);
							}
							if (response.text) {
								parts.push(`Additional input: ${response.text}`);
							}
							formattedResponse = parts.join("; ");
						} else {
							formattedResponse = JSON.stringify(response);
						}

						return {
							success: true,
							question: args.question,
							response: formattedResponse,
							responseData: response,
						};
					} catch (error) {
						return {
							success: false,
							error: error instanceof Error ? error.message : String(error),
						};
					}
				},
			}) as any,
		);
	}

	return tools;
}

/**
 * Convert registered skills from SkillRegistry to SDK-compatible tools.
 *
 * @param skillRegistry - The SkillRegistry instance (may be undefined)
 * @returns Array of SDK tool definitions
 *
 * @example
 * ```typescript
 * const tools = convertRegisteredSkillsToTools(config.skillRegistry);
 * ```
 *
 * @see {@link SkillRegistry} for runtime skill registration
 * @see {@link createObsidianTools} for built-in tool definitions
 * @since 0.0.35
 */
export function convertRegisteredSkillsToTools(skillRegistry?: SkillRegistry): ReturnType<typeof defineTool>[] {
	if (!skillRegistry) {
		return [];
	}

	const tools: ReturnType<typeof defineTool>[] = [];

	// Get all skills that have handlers
	for (const skillInfo of skillRegistry.listSkills()) {
		const skill = skillRegistry.getSkill(skillInfo.name);
		if (!skill) continue;

		// Convert VaultCopilotSkill to SDK tool using defineTool
		const tool = defineTool(skill.name, {
			description: skill.description,
			parameters: skill.parameters as any,
			handler: async (args: Record<string, unknown>) => {
				const result = await skill.handler(args);
				// Convert SkillResult to tool result format
				if (result.success) {
					return result.data ?? { success: true, message: "Skill executed successfully" };
				} else {
					return { success: false, error: result.error ?? "Skill execution failed" };
				}
			},
		});

		// Cast needed: defineTool returns Tool<T> with varying T per handler signature
		tools.push(tool as any);
	}

	return tools;
}

/**
 * Convert MCP tools from connected servers to SDK-compatible tools.
 *
 * @param mcpManager - The McpManager instance (may be undefined)
 * @returns Array of SDK tool definitions
 *
 * @example
 * ```typescript
 * const tools = convertMcpToolsToSdkTools(config.mcpManager);
 * ```
 *
 * @see {@link McpManager.getAllTools} for source tool metadata
 * @see {@link createObsidianTools} for built-in tool definitions
 * @since 0.0.35
 */
export function convertMcpToolsToSdkTools(mcpManager?: McpManager): ReturnType<typeof defineTool>[] {
	if (!mcpManager) {
		return [];
	}

	const tools: ReturnType<typeof defineTool>[] = [];
	const mcpTools = mcpManager.getAllTools();

	for (const { serverId, serverName, tool } of mcpTools) {
		// Create a unique tool name that includes the server name to avoid collisions
		// Format: mcp_<serverName>_<toolName>
		const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9_]/g, "_");
		const toolName = `mcp_${sanitizedServerName}_${tool.name}`;

		const sdkTool = defineTool(toolName, {
			description: `[MCP: ${serverName}] ${tool.description || tool.name}`,
			parameters: (tool.inputSchema || { type: "object", properties: {} }) as any,
			handler: async (args: Record<string, unknown>) => {
				try {
					const result = await mcpManager.callTool(serverId, tool.name, args);
					return result;
				} catch (error) {
					return {
						success: false,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			},
		});

		// Cast needed: defineTool returns Tool<T> with varying T per handler signature
		tools.push(sdkTool as any);
	}

	return tools;
}

/**
 * Build custom agents configuration from agent directories.
 *
 * Currently returns an empty array — the SDK discovers agents from the
 * configured directories at session creation time.
 *
 * @returns Array of agent configurations for the SDK
 *
 * @example
 * ```typescript
 * const customAgents = buildCustomAgentsConfig();
 * // currently [] — CLI discovers agents from configured directories
 * ```
 *
 * @see {@link GitHubCopilotCliConfig.agentDirectories} for where agent paths are configured
 * @internal
 * @since 0.0.35
 */
export function buildCustomAgentsConfig(): Array<{ name: string; slug: string; instructions: string }> {
	// For now, return empty array - agents will be loaded from directories by the SDK
	// The SDK's customAgents expects an array of agent configurations
	// When agentDirectories is set, the CLI will discover agents from those paths
	return [];
}
