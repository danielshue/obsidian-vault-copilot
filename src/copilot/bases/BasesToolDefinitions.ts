/**
 * BasesToolDefinitions - Tool schemas for Bases AI operations
 * 
 * Defines the complete set of tools for working with Obsidian Bases (.base files):
 * - create_base: Create new Base from natural language
 * - read_base: Read Base schema or list all Bases
 * - query_base: Query notes matching a Base's filters
 * - add_base_records: Create notes matching a Base's schema
 * - update_base_records: Update frontmatter on notes matching filters
 * - evolve_base_schema: Modify Base schema and optionally backfill
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
		"Create a new Obsidian Base (.base file) from a natural language description. Generates a valid Base with filters, properties, and views. Optionally creates sample notes to populate the Base.",
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
				description: "File path for the new .base file (e.g., 'projects.base' or 'CRM/contacts.base')",
			},
			name: {
				type: "string",
				description: "Display name for the Base",
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
				description: "Optional filters to scope which notes appear in the Base",
				items: {
					type: "object",
					properties: {
						property: { type: "string" },
						operator: { type: "string" },
						value: { type: "string" },
					},
					required: ["property", "operator"],
				},
			},
			create_sample_notes: {
				type: "boolean",
				description: "Whether to create 2-3 sample notes with the Base schema (default: false)",
			},
		},
		required: ["path", "properties"],
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
	path: string;
	name?: string;
	description?: string;
	properties: Array<{
		name: string;
		type?: "text" | "number" | "date" | "checkbox" | "list" | "tags";
		width?: number;
	}>;
	filters?: Array<{
		property: string;
		operator: string;
		value?: string;
	}>;
	create_sample_notes?: boolean;
}

export interface ReadBaseParams {
	base_path?: string;
	include_schema_details?: boolean;
}

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

export interface UpdateBaseRecordsParams {
	base_path: string;
	property_updates: Record<string, any>;
	preview_only?: boolean;
}

export interface EvolveBaseSchemaParams {
	base_path: string;
	operation: "add_property" | "remove_property" | "rename_property";
	property_name: string;
	new_property_name?: string;
	property_type?: "text" | "number" | "date" | "checkbox" | "list" | "tags";
	backfill_value?: string;
	preview_only?: boolean;
}
