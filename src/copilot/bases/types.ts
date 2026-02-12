/**
 * Type definitions for Obsidian Bases
 * 
 * Bases are markdown files (.base) that define views over vault notes.
 * They contain view definitions (filters, properties, formulas, summaries, views)
 * but do NOT contain data. The actual data comes from vault notes with frontmatter.
 */

/**
 * Filter operator types supported in Bases
 */
export type FilterOperator =
	| "is"
	| "is not"
	| "contains"
	| "does not contain"
	| "starts with"
	| "ends with"
	| "is empty"
	| "is not empty"
	| "before"
	| "after"
	| "greater than"
	| "less than";

/**
 * A single filter condition in a Base
 */
export interface BaseFilter {
	property: string;
	operator: FilterOperator;
	value?: string | number | boolean;
}

/**
 * Property column configuration in a Base
 */
export interface BaseProperty {
	width?: number;
	position?: number;
	type?: "text" | "number" | "date" | "checkbox" | "list" | "tags";
}

/**
 * Formula definition for computed columns
 */
export interface BaseFormula {
	[formulaName: string]: string;
}

/**
 * Summary/aggregation configuration
 */
export interface BaseSummary {
	type: "count" | "sum" | "average" | "min" | "max";
	property?: string;
}

/**
 * Sort configuration for views
 */
export interface BaseSort {
	property: string;
	order: "asc" | "desc";
}

/**
 * View configuration (table, card, list, etc.)
 */
export interface BaseView {
	name: string;
	type: "table" | "card" | "list" | "map";
	sort?: BaseSort[];
	filters?: BaseFilter[];
}

/**
 * Complete Base schema parsed from a .base file
 */
export interface BaseSchema {
	filters?: BaseFilter[];
	properties?: Record<string, BaseProperty>;
	formulas?: BaseFormula;
	summaries?: Record<string, BaseSummary[]>;
	views?: BaseView[];
}

/**
 * Specification for creating a new Base
 */
export interface BaseSpec {
	name: string;
	description?: string;
	properties: Array<{
		name: string;
		type: "text" | "number" | "date" | "checkbox" | "list" | "tags";
		width?: number;
	}>;
	filters?: BaseFilter[];
	views?: BaseView[];
}

/**
 * Result of querying a Base - represents a note that matches the Base's filters
 */
export interface QueryResult {
	path: string;
	basename: string;
	properties: Record<string, any>;
}

/**
 * Information about a Base file in the vault
 */
export interface BaseInfo {
	name: string;
	path: string;
	schema?: BaseSchema;
}
