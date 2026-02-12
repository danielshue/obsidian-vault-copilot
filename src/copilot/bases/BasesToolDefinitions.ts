/**
 * BasesToolDefinitions - Tool schemas for Bases AI operations
 * 
 * Defines the tools for working with Obsidian Bases (.base files):
 * - query_base: Query notes matching a Base's filters
 * - add_base_records: Create notes matching a Base's schema
 */

import type { JsonSchemaObject } from "../tools/ToolDefinitions";

/**
 * Tool names for Bases operations
 */
export const BASES_TOOL_NAMES = {
	QUERY_BASE: "query_base",
	ADD_BASE_RECORDS: "add_base_records",
} as const;

/**
 * Tool descriptions
 */
export const BASES_TOOL_DESCRIPTIONS = {
	[BASES_TOOL_NAMES.QUERY_BASE]:
		"Query vault notes that match an Obsidian Base's filters. Returns notes with their frontmatter properties formatted as a table. The Base file defines which notes to include via filters - this tool finds those notes.",
	[BASES_TOOL_NAMES.ADD_BASE_RECORDS]:
		"Create new vault notes that will appear as records in an Obsidian Base. Each note is created with frontmatter properties matching the Base's schema. Use this to add entries to a Base.",
};

/**
 * JSON Schemas for tool parameters
 */
export const BASES_TOOL_JSON_SCHEMAS: Record<string, JsonSchemaObject> = {
	[BASES_TOOL_NAMES.QUERY_BASE]: {
		type: "object",
		properties: {
			base_path: {
				type: "string",
				description: "Path to the .base file to query (e.g., 'projects.base' or 'CRM/contacts.base')",
			},
			limit: {
				type: "number",
				description: "Maximum number of results to return (default: 50)",
			},
		},
		required: ["base_path"],
	},
	[BASES_TOOL_NAMES.ADD_BASE_RECORDS]: {
		type: "object",
		properties: {
			base_path: {
				type: "string",
				description: "Path to the .base file that defines the schema",
			},
			records: {
				type: "array",
				description: "Array of records to create. Each record becomes a note. Each item is an object with title (string, required), properties (object with frontmatter key-values, required), and content (optional string for body).",
				items: {
					type: "object",
				},
			},
			folder: {
				type: "string",
				description:
					"Optional folder path where notes should be created. If not specified, uses the folder from the Base's file.folder filter or vault root.",
			},
		},
		required: ["base_path", "records"],
	},
};

/**
 * Parameter types for type-safe handlers
 */

export interface QueryBaseParams {
	base_path: string;
	limit?: number;
}

export interface AddBaseRecordsParams {
	base_path: string;
	records: Array<{
		title: string;
		properties: Record<string, any>;
		content?: string;
	}>;
	folder?: string;
}
