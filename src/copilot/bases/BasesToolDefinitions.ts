/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BasesToolDefinitions
 * @description Tool names, descriptions, JSON schemas, and typed parameter contracts
 * for Bases operations.
 *
 * Defines the complete set of tools for working with Obsidian Bases (`.base` files):
 * - create_base
 * - read_base
 * - query_base
 * - add_base_records
 * - update_base_records
 * - evolve_base_schema
 *
 * @see {@link handleCreateBase}
 * @see {@link BASES_TOOL_JSON_SCHEMAS}
 * @since 0.0.28
 */

import type { JsonSchemaObject } from "../tools/ToolDefinitions";

/**
 * Tool names for Bases operations
 */
export const BASES_TOOL_NAMES = {
	CREATE_BASE: "create_base",
	READ_BASE: "read_base",
	QUERY_BASE: "query_base",
	ADD_BASE_RECORDS: "add_base_records",
	UPDATE_BASE_RECORDS: "update_base_records",
	EVOLVE_BASE_SCHEMA: "evolve_base_schema",
} as const;

/**
 * Tool descriptions
 */
export const BASES_TOOL_DESCRIPTIONS = {
	[BASES_TOOL_NAMES.CREATE_BASE]:
		`Create a new Obsidian Base (.base file). When called, the tool automatically scans vault notes near the target path, discovers frontmatter properties, and presents an interactive question to the user asking which properties to include as columns and what view type to use. After the user answers, the Base is created with their selections.

You only need to call this tool once — just provide the path (and optionally name/description/filters). The tool handles user confirmation internally via inline questions. Do NOT pass a properties array unless the user has already explicitly told you the exact property names they want. If you pass properties, the interactive discovery is skipped.

FILTER SYNTAX RULES for Obsidian Bases:
- Frontmatter property filters: property name directly, e.g. 'status != "archived"'
- Folder filters: file.inFolder("FolderPath")
- Tag filters: file.hasTag("tagname")
- Valid operators: ==, !=, >, <, >=, <=
- String values MUST be in double quotes`,
	[BASES_TOOL_NAMES.READ_BASE]:
		"Read an Obsidian Base's view definition (filters, properties, formulas, views) or list all Bases in the vault. Returns the Base schema, NOT data - the Base file only contains the view definition.",
	[BASES_TOOL_NAMES.QUERY_BASE]:
		"Query vault notes that match an Obsidian Base's filters. Returns notes with their frontmatter properties formatted as a table. The Base file defines which notes to include via filters - this tool finds those notes.",
	[BASES_TOOL_NAMES.ADD_BASE_RECORDS]:
		"Create new vault notes that will appear as records in an Obsidian Base. Each note is created with frontmatter properties matching the Base's schema. Use this to add entries to a Base.",
	[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS]:
		"Update frontmatter properties on vault notes that match a Base's filters. Supports bulk operations with dry-run preview and user confirmation before applying changes.",
	[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA]:
		"Modify a Base's view definition by adding, removing, or renaming properties. Optionally backfill values across matching notes' frontmatter. Includes dry-run preview.",
};

/**
 * JSON Schemas for tool parameters
 */
export const BASES_TOOL_JSON_SCHEMAS: Record<string, JsonSchemaObject> = {
	[BASES_TOOL_NAMES.CREATE_BASE]: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "File path for the new .base file (e.g., 'projects.base' or 'CRM/contacts.base'). Optional — if omitted, a filename is auto-generated from the name or description.",
			},
			name: {
				type: "string",
				description: "Display name for the Base. Also used to generate the filename if path is not provided.",
			},
			description: {
				type: "string",
				description: "Natural language description of what this Base tracks",
			},
			properties: {
				type: "array",
				description: "Property columns for the Base",
				items: {
					type: "object",
					properties: {
						name: { type: "string", description: "Property name" },
						type: {
							type: "string",
							enum: ["text", "number", "date", "checkbox", "list", "tags"],
							description: "Property type",
						},
						width: { type: "number", description: "Column width in pixels" },
					},
					required: ["name"],
				},
			},
			filters: {
				type: "array",
				description: "Filters to scope which notes appear in the Base. Each filter becomes an expression string in the .base YAML. For frontmatter properties use property name directly (e.g., property='status', operator='!=', value='archived'). For folder scoping use property='file.inFolder', value='FolderPath' (operator is ignored). For tag filtering use property='file.hasTag', value='tagname' (operator is ignored). IMPORTANT: Inspect actual vault notes before choosing filter properties.",
				items: {
					type: "object",
					properties: {
						property: {
							type: "string",
							description: "Property name from note frontmatter (e.g., 'status', 'type', 'priority'), or a special function: 'file.inFolder' to filter by folder, 'file.hasTag' to filter by tag",
						},
						operator: {
							type: "string",
							enum: ["==", "!=", ">", "<", ">=", "<="],
							description: "Comparison operator. Use == for equals, != for not-equals. Ignored for file.inFolder and file.hasTag.",
						},
						value: { type: "string", description: "Value to compare against, or folder path for file.inFolder, or tag name for file.hasTag" },
					},
					required: ["property"],
				},
			},
			create_sample_notes: {
				type: "boolean",
				description: "DEPRECATED - Do not use. Always false. Only create the Base file itself, never sample notes.",
			},
			confirmed: {
				type: "boolean",
				description: "Ignored when the interactive question UI is available. Only used as a fallback for non-interactive providers. Do not set this — the tool decides automatically based on whether properties were provided.",
			},
		},
		required: [],
	},
	[BASES_TOOL_NAMES.READ_BASE]: {
		type: "object",
		properties: {
			base_path: {
				type: "string",
				description:
					"Path to the .base file to read. If not provided, lists all Bases in the vault.",
			},
			include_schema_details: {
				type: "boolean",
				description: "Include full schema details (filters, properties, views) in the response",
			},
		},
		required: [],
	},
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
	[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS]: {
		type: "object",
		properties: {
			base_path: {
				type: "string",
				description: "Path to the .base file that defines which notes to update",
			},
			property_updates: {
				type: "object",
				description:
					"Object mapping property names to new values. All notes matching the Base's filters will have these properties updated.",
				additionalProperties: true,
			},
			preview_only: {
				type: "boolean",
				description:
					"If true, only show a preview of what would be changed without applying updates (default: true for safety)",
			},
		},
		required: ["base_path", "property_updates"],
	},
	[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA]: {
		type: "object",
		properties: {
			base_path: {
				type: "string",
				description: "Path to the .base file to modify",
			},
			operation: {
				type: "string",
				enum: ["add_property", "remove_property", "rename_property"],
				description: "Type of schema evolution operation",
			},
			property_name: {
				type: "string",
				description: "Name of the property to add, remove, or rename (old name for rename)",
			},
			new_property_name: {
				type: "string",
				description: "New name for rename operation",
			},
			property_type: {
				type: "string",
				enum: ["text", "number", "date", "checkbox", "list", "tags"],
				description: "Type of property for add operation",
			},
			backfill_value: {
				type: "string",
				description: "Optional value to set on all matching notes for add/rename operations",
			},
			preview_only: {
				type: "boolean",
				description: "If true, only preview changes without applying (default: true)",
			},
		},
		required: ["base_path", "operation", "property_name"],
	},
};

/**
 * Parameter types for type-safe handlers
 */

export interface CreateBaseParams {
	/** Optional path for new `.base` file. */
	path?: string;
	/** Optional Base display name. */
	name?: string;
	/** Optional natural-language Base description. */
	description?: string;
	/** Optional explicit properties; when omitted, discovery flow can populate them. */
	properties?: Array<{
		/** Property name. */
		name: string;
		/** Optional property type. */
		type?: "text" | "number" | "date" | "checkbox" | "list" | "tags";
		/** Optional column width. */
		width?: number;
	}>;
	/** Optional structured filters converted to expression syntax by handlers. */
	filters?: Array<{
		/** Property name or function key (`file.inFolder`, `file.hasTag`). */
		property: string;
		/** Optional comparison operator. */
		operator?: string;
		/** Optional comparison value. */
		value?: string;
	}>;
	/** Deprecated legacy flag (ignored by current flow). */
	create_sample_notes?: boolean;
	/** Optional explicit confirmation flag for non-interactive flow. */
	confirmed?: boolean;
}

/** Parameters for reading a single Base or listing all Bases. */
export interface ReadBaseParams {
	/** Optional Base path; when omitted, handler lists all Bases. */
	base_path?: string;
	/** Include expanded schema details in output. */
	include_schema_details?: boolean;
}

/** Parameters for querying records from a Base. */
export interface QueryBaseParams {
	/** Base file path to query. */
	base_path: string;
	/** Optional query result limit. */
	limit?: number;
}

/** Parameters for adding records (notes) to a Base-defined dataset. */
export interface AddBaseRecordsParams {
	/** Base file path whose schema guides note creation. */
	base_path: string;
	/** Records to create as notes. */
	records: Array<{
		/** Note title / target file name stem. */
		title: string;
		/** Frontmatter key-value properties for the note. */
		properties: Record<string, any>;
		/** Optional markdown body content. */
		content?: string;
	}>;
	/** Optional output folder override. */
	folder?: string;
}

/** Parameters for bulk record property updates. */
export interface UpdateBaseRecordsParams {
	/** Base path whose filters select target notes. */
	base_path: string;
	/** Property update map to apply to matching notes. */
	property_updates: Record<string, any>;
	/** Preview-only mode flag (defaults true in handlers for safety). */
	preview_only?: boolean;
}

/** Parameters for schema evolution operations. */
export interface EvolveBaseSchemaParams {
	/** Base path to evolve. */
	base_path: string;
	/** Evolution operation kind. */
	operation: "add_property" | "remove_property" | "rename_property";
	/** Primary property name (or old name for rename). */
	property_name: string;
	/** New property name for rename operations. */
	new_property_name?: string;
	/** Property type for add operation. */
	property_type?: "text" | "number" | "date" | "checkbox" | "list" | "tags";
	/** Optional value to backfill into matching notes. */
	backfill_value?: string;
	/** Preview-only mode flag (defaults true in handlers for safety). */
	preview_only?: boolean;
}
