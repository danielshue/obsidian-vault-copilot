/**
 * BasesParser - Parse .base files into structured BaseSchema objects
 * 
 * A .base file is a markdown file with YAML frontmatter that defines a view.
 * It contains NO data - only the view definition (filters, properties, formulas, etc.)
 */

import { parseYaml } from "obsidian";
import type { BaseSchema } from "./types";

/**
 * Parse a .base file's content into a typed BaseSchema object
 * 
 * @param content - The raw markdown content of the .base file
 * @returns Parsed BaseSchema or null if parsing fails
 */
export function parseBaseFile(content: string): BaseSchema | null {
	try {
		// Extract YAML frontmatter from markdown
		const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
		
		if (!frontmatterMatch) {
			console.error("BasesParser: No YAML frontmatter found in .base file");
			return null;
		}

		const yamlContent = frontmatterMatch[1];
		
		// Parse YAML using Obsidian's built-in parser
		const parsed = parseYaml(yamlContent) as BaseSchema;
		
		if (!parsed || typeof parsed !== "object") {
			console.error("BasesParser: Invalid YAML structure");
			return null;
		}

		return parsed;
	} catch (error) {
		console.error("BasesParser: Error parsing .base file:", error);
		return null;
	}
}

/**
 * Validate that a BaseSchema has the expected structure
 * 
 * @param schema - The schema to validate
 * @returns true if valid, false otherwise
 */
export function validateBaseSchema(schema: BaseSchema): boolean {
	if (!schema || typeof schema !== "object") {
		return false;
	}

	// At minimum, a Base should have properties or filters or views
	const hasProperties = schema.properties && Object.keys(schema.properties).length > 0;
	const hasFilters = schema.filters && Array.isArray(schema.filters) && schema.filters.length > 0;
	const hasViews = schema.views && Array.isArray(schema.views) && schema.views.length > 0;
	const hasFormulas = schema.formulas && Object.keys(schema.formulas).length > 0;
	const hasSummaries = schema.summaries && Object.keys(schema.summaries).length > 0;

	return !!(hasProperties || hasFilters || hasViews || hasFormulas || hasSummaries);
}

/**
 * Get a human-readable summary of a BaseSchema
 * 
 * @param schema - The schema to summarize
 * @returns A text summary of the Base's structure
 */
export function summarizeBaseSchema(schema: BaseSchema): string {
	const parts: string[] = [];

	if (schema.filters && schema.filters.length > 0) {
		parts.push(`${schema.filters.length} filter(s)`);
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
