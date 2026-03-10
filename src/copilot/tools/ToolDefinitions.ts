/**
 * @module ToolDefinitions
 * @description Basic Tool Definitions Registry for Vault Copilot.
 *
 * This module contains ONLY the 8 Basic-tier tool definitions:
 *
 * - `get_active_note` — returns metadata + content of the open note
 * - `open_note` — navigate the editor to a note by path
 * - `batch_read_notes` — read multiple notes in one call
 * - `list_notes` — list notes in a folder with optional recursive/pattern filtering
 * - `create_note` — create a new note in the vault
 * - `update_note` — update/replace the content of an existing note
 * - `fetch_web_page` — fetch and extract text from a URL
 * - `web_search` — search the web
 *
 * Pro-only tools (tasks, periodic notes, introspection, mermaid, etc.)
 * are defined in the Pro `src/copilot/tools/ToolDefinitions.ts` which
 * imports and extends everything exported here.
 *
 * ## Architecture
 *
 * ```
 * vault-copilot/ToolDefinitions.ts (this file — Basic)
 *        │
 *        ├── TOOL_NAMES ─────────► 8 Basic tool identifiers
 *        ├── TOOL_DESCRIPTIONS ──► Descriptions for Basic tools
 *        ├── TOOL_JSON_SCHEMAS ──► JSON Schemas for Basic tools
 *        ├── Parameter Interfaces ► TypeScript types for Basic handlers
 *        ├── Shared Types ───────► JsonSchemaObject, etc. (used by Pro too)
 *        └── TOOL_CATEGORIES ────► Basic UI organization
 *
 * src/copilot/tools/ToolDefinitions.ts (Pro)
 *        │
 *        └── Imports & extends everything above with 35+ Pro-only tools
 * ```
 *
 * @example Using with BasicToolFactory (JSON Schema)
 * ```typescript
 * import { TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_JSON_SCHEMAS } from './ToolDefinitions';
 * import { defineTool } from '@github/copilot-sdk';
 *
 * defineTool(TOOL_NAMES.CREATE_NOTE, {
 *   description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_NOTE],
 *   parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.CREATE_NOTE],
 *   handler: async (args: CreateNoteParams) => {
 *     return await createNote(app, args.path, args.content);
 *   }
 * });
 * ```
 *
 * @see {@link TOOL_NAMES} for Basic tool identifiers
 * @see {@link TOOL_CATEGORIES} for UI organization
 * @since 0.0.14
 */

// ============================================================================
// Tool Names - Basic tier only (7 tools)
// ============================================================================

export const TOOL_NAMES = {
	// Vault read operations
	GET_ACTIVE_NOTE: "get_active_note",
	BATCH_READ_NOTES: "batch_read_notes",
	LIST_NOTES: "list_notes",

	// Vault write operations
	CREATE_NOTE: "create_note",
	UPDATE_NOTE: "update_note",

	// Navigation
	OPEN_NOTE: "open_note",

	// Web operations
	FETCH_WEB_PAGE: "fetch_web_page",
	WEB_SEARCH: "web_search",
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

// ============================================================================
// Tool Descriptions - Basic tier only
// ============================================================================

export const TOOL_DESCRIPTIONS = {
	[TOOL_NAMES.GET_ACTIVE_NOTE]: "Get information about the currently active note in Obsidian",
	[TOOL_NAMES.BATCH_READ_NOTES]: "Read multiple notes at once. Use aiSummarize=true for many files (10+) to get AI-generated summaries.",
	[TOOL_NAMES.LIST_NOTES]: "List notes in a vault folder. Supports recursive traversal and optional filename filtering. Useful for discovering contacts, roster entries, or any structured set of notes.",
	[TOOL_NAMES.CREATE_NOTE]: "Create a new note in the Obsidian vault",
	[TOOL_NAMES.UPDATE_NOTE]: "Update/replace the entire content of an existing note",
	[TOOL_NAMES.OPEN_NOTE]: "Open a note in the editor by its path. Use this when the user wants to navigate to or view a specific note.",
	[TOOL_NAMES.FETCH_WEB_PAGE]: "Fetch and extract content from a web page URL",
	[TOOL_NAMES.WEB_SEARCH]: "Search the web for information",
} as const;

// ============================================================================
// Parameter Types - TypeScript interfaces for Basic tool parameters
// ============================================================================

/** Parameters for batch_read_notes */
export interface BatchReadNotesParams {
	/** Array of note paths to read */
	paths: string[];
	/** If true, use AI to generate intelligent summaries of each file */
	aiSummarize?: boolean;
	/** Optional custom prompt for AI summarization */
	summaryPrompt?: string;
}

/** Parameters for list_notes */
export interface ListNotesParams {
	/** Vault-relative folder path to list (defaults to root) */
	folder?: string;
	/** When true, descend into subfolders (default: false) */
	recursive?: boolean;
	/** Optional case-insensitive substring filter applied to filenames */
	pattern?: string;
}

/** Parameters for create_note */
export interface CreateNoteParams {
	/** The path for the new note (e.g., 'folder/note.md') */
	path: string;
	/** The content of the note in Markdown format */
	content: string;
}

/** Parameters for update_note */
export interface UpdateNoteParams {
	/** The path to the note file */
	path: string;
	/** The new content to replace the existing content */
	content: string;
}

/** Parameters for fetch_web_page */
export interface FetchWebPageParams {
	/** The URL of the web page to fetch */
	url: string;
}

/** Parameters for web_search */
export interface WebSearchParams {
	/** The search query */
	query: string;
	/** Maximum number of results (default: 5) */
	limit?: number;
}

// ============================================================================
// JSON Schema Types - Shared infrastructure used by both Basic and Pro
// ============================================================================

export interface JsonSchemaProperty {
	type: string;
	description?: string;
	enum?: string[];
	items?: { type: string; [key: string]: unknown };
	[key: string]: unknown;  // Allow additional properties for SDK compatibility
}

export interface JsonSchemaObject {
	type: "object";
	properties: Record<string, JsonSchemaProperty>;
	required: string[];
	[key: string]: unknown;  // Allow additional properties for Record<string, unknown> compatibility
}

// ============================================================================
// JSON Schema Definitions - Basic tier only
// ============================================================================

/** JSON Schema definitions for Basic tools - ready to use with defineTool */
export const TOOL_JSON_SCHEMAS: Record<string, JsonSchemaObject> = {
	[TOOL_NAMES.GET_ACTIVE_NOTE]: {
		type: "object",
		properties: {},
		required: []
	},

	[TOOL_NAMES.BATCH_READ_NOTES]: {
		type: "object",
		properties: {
			paths: {
				type: "array",
				items: { type: "string" },
				description: "Array of note paths to read"
			},
			aiSummarize: {
				type: "boolean",
				description: "If true, use AI to generate intelligent summaries of each file"
			},
			summaryPrompt: {
				type: "string",
				description: "Optional custom prompt for AI summarization"
			}
		},
		required: ["paths"]
	},

	[TOOL_NAMES.LIST_NOTES]: {
		type: "object",
		properties: {
			folder: {
				type: "string",
				description: "Vault-relative folder path to list (e.g. 'contacts' or 'roster'). Defaults to vault root."
			},
			recursive: {
				type: "boolean",
				description: "When true, descend into subfolders (default: false)"
			},
			pattern: {
				type: "string",
				description: "Optional case-insensitive substring filter applied to note filenames"
			}
		},
		required: []
	},

	[TOOL_NAMES.CREATE_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path for the new note (e.g., 'folder/note.md')" },
			content: { type: "string", description: "The content of the note in Markdown format" }
		},
		required: ["path", "content"]
	},

	[TOOL_NAMES.UPDATE_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path to the note file" },
			content: { type: "string", description: "The new content to replace the existing content" }
		},
		required: ["path", "content"]
	},

	[TOOL_NAMES.OPEN_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path to the note file to open" }
		},
		required: ["path"]
	},

	[TOOL_NAMES.FETCH_WEB_PAGE]: {
		type: "object",
		properties: {
			url: { type: "string", description: "The URL of the web page to fetch" }
		},
		required: ["url"]
	},

	[TOOL_NAMES.WEB_SEARCH]: {
		type: "object",
		properties: {
			query: { type: "string", description: "The search query" },
			limit: { type: "number", description: "Maximum number of results (default: 5)" }
		},
		required: ["query"]
	},
};

// ============================================================================
// Parameter Descriptions - Basic subset
// ============================================================================

/**
 * Centralized parameter descriptions for Basic tool parameters.
 *
 * Pro extends this with additional parameter descriptions for tasks,
 * periodic notes, patches, introspection, etc.
 *
 * @example
 * ```typescript
 * z.string().describe(PARAM_DESCRIPTIONS.path)
 * ```
 */
export const PARAM_DESCRIPTIONS = {
	/** Note path parameter - used by most vault operations */
	path: "The path to the note file (e.g., 'folder/note.md' or 'note.md')",
	/** Path for creating a note - includes example */
	pathCreate: "The path for the new note (e.g., 'folder/note.md'). Include .md extension.",
	/** Content parameter for notes */
	content: "The content in Markdown format",
	/** Limit for result counts */
	limit: "Maximum number of results to return",
	/** Query for search operations */
	query: "The search query",
	/** URL for web operations */
	url: "The URL of the web page to fetch",
	/** AI summarize flag */
	aiSummarize: "If true, use AI to generate intelligent summaries of each file",
	/** Custom summary prompt */
	summaryPrompt: "Optional custom prompt for AI summarization",
} as const;

/** Type for parameter description keys */
export type ParamDescriptionKey = keyof typeof PARAM_DESCRIPTIONS;

/**
 * Get a parameter description by key.
 *
 * @param key - The parameter description key
 * @returns The parameter description string
 *
 * @example
 * ```typescript
 * z.string().describe(getParamDescription('path'))
 * ```
 */
export function getParamDescription(key: ParamDescriptionKey): string {
	return PARAM_DESCRIPTIONS[key];
}

// ============================================================================
// Tool Categories - Basic tier organization
// ============================================================================

export const TOOL_CATEGORIES = {
	READ: [
		TOOL_NAMES.GET_ACTIVE_NOTE,
		TOOL_NAMES.BATCH_READ_NOTES,
		TOOL_NAMES.LIST_NOTES,
	],
	WRITE: [
		TOOL_NAMES.CREATE_NOTE,
		TOOL_NAMES.UPDATE_NOTE,
	],
	NAVIGATION: [
		TOOL_NAMES.OPEN_NOTE,
	],
	WEB: [
		TOOL_NAMES.FETCH_WEB_PAGE,
		TOOL_NAMES.WEB_SEARCH,
	],
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the description for a tool by name.
 *
 * @param name - The tool name to look up
 * @returns The tool description, or a generic fallback for unknown tools
 *
 * @example
 * ```typescript
 * getToolDescription('create_note');   // 'Create a new note in the Obsidian vault'
 * getToolDescription('unknown_tool');  // 'Tool: unknown_tool'
 * ```
 */
export function getToolDescription(name: string): string {
	return TOOL_DESCRIPTIONS[name as ToolName] ?? `Tool: ${name}`;
}

/**
 * Get the JSON schema for a tool by name.
 *
 * @param name - The tool name to look up
 * @returns The JSON Schema object, or undefined for unknown tools
 *
 * @example
 * ```typescript
 * const schema = getToolJsonSchema('create_note');
 * if (schema) {
 *   console.log(schema.required); // ['path', 'content']
 * }
 * ```
 */
export function getToolJsonSchema(name: string): JsonSchemaObject | undefined {
	return TOOL_JSON_SCHEMAS[name];
}

/**
 * Check if a tool name is valid (Basic tier).
 *
 * @param name - The string to check
 * @returns True if the name is a valid Basic tool name
 *
 * @example
 * ```typescript
 * isValidToolName('create_note');  // true
 * isValidToolName('get_tasks');    // false (Pro-only)
 * ```
 */
export function isValidToolName(name: string): name is ToolName {
	return Object.values(TOOL_NAMES).includes(name as ToolName);
}
