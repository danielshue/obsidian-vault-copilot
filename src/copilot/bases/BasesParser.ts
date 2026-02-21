/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BasesParser
 * @description Parsing and validation helpers for Obsidian `.base` YAML files.
 *
 * A `.base` file is YAML view configuration (not markdown frontmatter data).
 * It contains filters/properties/views but not record values.
 *
 * @see {@link parseBaseFile}
 * @see {@link validateBaseSchema}
 * @since 0.0.28
 */

import { parseYaml } from "obsidian";
import type { BaseFilterGroup, BaseSchema } from "./types";

/**
 * Count the number of leaf filter expressions in a filter group.
 *
 * @param group - Filter group
 * @returns Leaf filter count
 * @internal
 */
function countFilters(group: BaseFilterGroup): number {
	let count = 0;
	if (group.and) {
		for (const item of group.and) {
			count += typeof item === "string" ? 1 : countFilters(item);
		}
	}
	if (group.or) {
		for (const item of group.or) {
			count += typeof item === "string" ? 1 : countFilters(item);
		}
	}
	if (group.not) {
		count += typeof group.not === "string" ? 1 : countFilters(group.not);
	}
	return count;
}

/**
 * Parse a .base file's content into a typed BaseSchema object.
 *
 * Obsidian .base files are raw YAML (no frontmatter delimiters).
 * This parser also handles legacy files wrapped in --- delimiters for compatibility.
 *
 * @param content - The raw content of the .base file
 * @returns Parsed BaseSchema or null if parsing fails
 *
 * @example
 * ```typescript
 * const schema = parseBaseFile(content);
 * ```
 */
export function parseBaseFile(content: string): BaseSchema | null {
	try {
		let yamlContent = content;

		// If content is wrapped in --- frontmatter delimiters, extract the inner YAML
		const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*$/);
		if (frontmatterMatch && frontmatterMatch[1]) {
			yamlContent = frontmatterMatch[1];
		}

		// Empty .base files are valid — they mean "show all notes"
		if (!yamlContent.trim()) {
			return {};
		}

		// Parse YAML using Obsidian's built-in parser
		const parsed = parseYaml(yamlContent) as BaseSchema;
		
		if (!parsed || typeof parsed !== "object") {
			// parseYaml can return null for empty/whitespace content
			return {};
		}

		return parsed;
	} catch (error) {
		console.error("BasesParser: Error parsing .base file:", error);
		return null;
	}
}

/**
 * Validate that a BaseSchema has expected structural sections.
 *
 * @param schema - The schema to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = validateBaseSchema(schema);
 * ```
 */
export function validateBaseSchema(schema: BaseSchema): boolean {
	if (!schema || typeof schema !== "object") {
		return false;
	}

	// At minimum, a Base should have properties or filters or views
	const hasProperties = schema.properties && Object.keys(schema.properties).length > 0;
	const hasFilters = schema.filters && typeof schema.filters === "object" && (schema.filters.and || schema.filters.or || schema.filters.not);
	const hasViews = schema.views && Array.isArray(schema.views) && schema.views.length > 0;
	const hasFormulas = schema.formulas && Object.keys(schema.formulas).length > 0;
	const hasSummaries = schema.summaries && Object.keys(schema.summaries).length > 0;

	return !!(hasProperties || hasFilters || hasViews || hasFormulas || hasSummaries);
}

/**
 * Get a human-readable summary of a BaseSchema.
 *
 * @param schema - The schema to summarize
 * @returns A text summary of the Base's structure
 *
 * @example
 * ```typescript
 * const summary = summarizeBaseSchema(schema);
 * ```
 */
export function summarizeBaseSchema(schema: BaseSchema): string {
	const parts: string[] = [];

	if (schema.filters) {
		const filterCount = countFilters(schema.filters);
		if (filterCount > 0) {
			parts.push(`${filterCount} filter(s)`);
		}
	}

	if (schema.properties) {
		const propCount = Object.keys(schema.properties).length;
		parts.push(`${propCount} property column(s)`);
	}

	if (schema.formulas) {
		const formulaCount = Object.keys(schema.formulas).length;
		parts.push(`${formulaCount} formula(s)`);
	}

	if (schema.views && schema.views.length > 0) {
		parts.push(`${schema.views.length} view(s)`);
	}

	if (schema.summaries) {
		const summaryCount = Object.keys(schema.summaries).length;
		parts.push(`${summaryCount} summary aggregation(s)`);
	}

	return parts.length > 0 ? parts.join(", ") : "Empty Base schema";
}
