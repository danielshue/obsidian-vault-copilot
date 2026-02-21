/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BasesTypes
 * @description Shared type contracts for Obsidian Bases parsing, querying, and mutation tools.
 *
 * Bases are `.base` YAML view definitions over vault notes; they contain schema
 * metadata (filters/properties/views), while records come from note frontmatter.
 *
 * @see {@link BaseSchema}
 * @see {@link QueryResult}
 * @since 0.0.28
 */

/**
 * Filter operator types supported in Bases expressions
 */
export type FilterOperator =
	| "=="
	| "!="
	| ">"
	| "<"
	| ">="
	| "<=";

/**
 * A single filter condition in a Base, parsed from an expression string.
 * Used internally by the query engine after parsing expressions like:
 *   'status != "archived"'  →  { property: "status", operator: "!=", value: "archived" }
 *   file.inFolder("Projects")  →  { fn: "inFolder", args: ["Projects"] }
 */
export interface ParsedFilterCondition {
	/** Property name being compared. */
	property: string;
	/** Comparison operator. */
	operator: FilterOperator;
	/** Right-hand comparison value. */
	value: string | number | boolean;
}

/**
 * A parsed function-style filter like file.inFolder("X") or file.hasTag("Y")
 */
export interface ParsedFilterFunction {
	/** Function name (for example, `inFolder`, `hasTag`). */
	fn: string;
	/** Function argument list. */
	args: string[];
}

/**
 * Boolean filter group used by Obsidian Bases.
 * Filters must be wrapped in an "and", "or", or "not" key.
 * Items are expression strings or nested filter groups.
 */
export interface BaseFilterGroup {
	/** All conditions/groups must match. */
	and?: (string | BaseFilterGroup)[];
	/** At least one condition/group must match. */
	or?: (string | BaseFilterGroup)[];
	/** Inverts the nested condition/group. */
	not?: string | BaseFilterGroup;
}

/**
 * Property column configuration in a Base
 */
export interface BaseProperty {
	/** Optional column width in pixels. */
	width?: number;
	/** Optional explicit column position. */
	position?: number;
	/** Optional property type. */
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
	/** Aggregation type. */
	type: "count" | "sum" | "average" | "min" | "max";
	/** Target property for aggregations that require one. */
	property?: string;
}

/**
 * Sort configuration for views
 */
export interface BaseSort {
	/** Property to sort by. */
	property: string;
	/** Sort direction. */
	order: "asc" | "desc";
}

/**
 * View configuration (table, card, list, etc.)
 */
export interface BaseView {
	/** View display name. */
	name: string;
	/** View type. */
	type: "table" | "card" | "list" | "map";
	/** Optional column order. */
	order?: string[];
	/** Optional sort definitions. */
	sort?: BaseSort[];
	/** Optional view-scoped filters. */
	filters?: BaseFilterGroup;
}

/**
 * Complete Base schema parsed from a .base file
 */
export interface BaseSchema {
	/** Optional top-level filter group. */
	filters?: BaseFilterGroup;
	/** Property column definitions. */
	properties?: Record<string, BaseProperty>;
	/** Formula definitions keyed by name. */
	formulas?: BaseFormula;
	/** Summary/aggregation definitions keyed by name. */
	summaries?: Record<string, BaseSummary[]>;
	/** Optional view definitions. */
	views?: BaseView[];
}

/**
 * Specification for creating a new Base
 */
export interface BaseSpec {
	/** Base display name. */
	name: string;
	/** Optional description. */
	description?: string;
	/** Property definitions for generated schema. */
	properties: Array<{
		/** Property name. */
		name: string;
		/** Property type. */
		type: "text" | "number" | "date" | "checkbox" | "list" | "tags";
		/** Optional property width. */
		width?: number;
	}>;
	/** Optional top-level filters. */
	filters?: BaseFilterGroup;
	/** Optional views. */
	views?: BaseView[];
}

/**
 * Result of querying a Base - represents a note that matches the Base's filters
 */
export interface QueryResult {
	/** Note path. */
	path: string;
	/** Note basename. */
	basename: string;
	/** Selected note properties. */
	properties: Record<string, any>;
}

/**
 * Information about a Base file in the vault
 */
export interface BaseInfo {
	/** Base display name. */
	name: string;
	/** Base file path. */
	path: string;
	/** Optional parsed schema. */
	schema?: BaseSchema;
}

/**
 * Extract all filter expression strings from a BaseFilterGroup recursively.
 *
 * @param group - The filter group to extract from
 * @returns Flat array of expression strings
 *
 * @example
 * ```typescript
 * const expressions = getFilterExpressions(schema.filters!);
 * ```
 */
export function getFilterExpressions(group: BaseFilterGroup): string[] {
	const expressions: string[] = [];
	if (group.and) {
		for (const item of group.and) {
			if (typeof item === "string") expressions.push(item);
			else expressions.push(...getFilterExpressions(item));
		}
	}
	if (group.or) {
		for (const item of group.or) {
			if (typeof item === "string") expressions.push(item);
			else expressions.push(...getFilterExpressions(item));
		}
	}
	if (group.not) {
		if (typeof group.not === "string") expressions.push(group.not);
		else expressions.push(...getFilterExpressions(group.not));
	}
	return expressions;
}
