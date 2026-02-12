/**
 * BasesQueryEngine - Query vault notes matching Base filters
 * 
 * This module scans vault notes and evaluates their frontmatter properties
 * against a Base's filter definitions. Since .base files contain no data,
 * this engine finds the actual "records" (vault notes) that would appear
 * in the rendered Base view.
 */

import type { App, TFile } from "obsidian";
import type { BaseFilter, BaseSchema, QueryResult } from "./types";

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): Record<string, any> | null {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!match) return null;

	try {
		// Simple YAML parser for frontmatter
		const yaml = match[1];
		const lines = yaml.split("\n");
		const result: Record<string, any> = {};
		let currentKey = "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			if (trimmed.includes(":")) {
				const parts = trimmed.split(":");
				const key = parts[0].trim();
				const value = parts.slice(1).join(":").trim();
				currentKey = key;

				if (value) {
					result[key] = parseValue(value);
				}
			}
		}

		return result;
	} catch (error) {
		console.error("Error parsing frontmatter:", error);
		return null;
	}
}

function parseValue(value: string): any {
	if (!value) return null;

	const trimmed = value.trim();

	// Boolean
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;

	// Null
	if (trimmed === "null" || trimmed === "~") return null;

	// Number
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		return Number(trimmed);
	}

	// String (remove quotes if present)
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

/**
 * Evaluate a single filter against a note's properties
 */
function evaluateFilter(filter: BaseFilter, properties: Record<string, any>): boolean {
	const value = properties[filter.property];

	switch (filter.operator) {
		case "is":
			return value === filter.value;

		case "is not":
			return value !== filter.value;

		case "contains":
			if (typeof value === "string") {
				return value.includes(String(filter.value));
			}
			if (Array.isArray(value)) {
				return value.includes(filter.value);
			}
			return false;

		case "does not contain":
			if (typeof value === "string") {
				return !value.includes(String(filter.value));
			}
			if (Array.isArray(value)) {
				return !value.includes(filter.value);
			}
			return true;

		case "starts with":
			return typeof value === "string" && value.startsWith(String(filter.value));

		case "ends with":
			return typeof value === "string" && value.endsWith(String(filter.value));

		case "is empty":
			return value === null || value === undefined || value === "";

		case "is not empty":
			return value !== null && value !== undefined && value !== "";

		case "greater than":
			return typeof value === "number" && value > Number(filter.value);

		case "less than":
			return typeof value === "number" && value < Number(filter.value);

		case "before":
		case "after":
			// Date comparison would require date parsing
			// For POC, basic string comparison
			return true;

		default:
			console.warn(`Unknown filter operator: ${filter.operator}`);
			return true;
	}
}

/**
 * Check if a note's folder matches a filter
 */
function matchesFolderFilter(notePath: string, folderValue: string): boolean {
	const noteFolder = notePath.substring(0, notePath.lastIndexOf("/"));
	return noteFolder === folderValue || noteFolder.startsWith(folderValue + "/");
}

/**
 * Query vault notes matching a Base's filters
 * 
 * @param app - Obsidian App instance
 * @param schema - Parsed Base schema with filters
 * @param limit - Maximum number of results to return (default: 50)
 * @returns Array of matching notes with their properties
 */
export async function queryBase(
	app: App,
	schema: BaseSchema,
	limit: number = 50
): Promise<QueryResult[]> {
	const results: QueryResult[] = [];
	const files = app.vault.getMarkdownFiles();

	for (const file of files) {
		// Check if we've hit the limit
		if (results.length >= limit) {
			break;
		}

		// Read file content
		const content = await app.vault.read(file);
		const frontmatter = parseFrontmatter(content);

		if (!frontmatter) {
			continue;
		}

		// Add file.folder as a special property
		const properties = {
			...frontmatter,
			"file.folder": file.parent?.path || "",
			"file.name": file.basename,
			"file.path": file.path,
		};

		// Evaluate all filters (AND logic)
		let matches = true;
		if (schema.filters && schema.filters.length > 0) {
			for (const filter of schema.filters) {
				// Handle special file.* properties
				if (filter.property === "file.folder") {
					if (!matchesFolderFilter(file.path, String(filter.value))) {
						matches = false;
						break;
					}
				} else if (!evaluateFilter(filter, properties)) {
					matches = false;
					break;
				}
			}
		}

		if (matches) {
			// Extract only the properties defined in the Base schema
			const resultProperties: Record<string, any> = {};

			if (schema.properties) {
				for (const propName of Object.keys(schema.properties)) {
					resultProperties[propName] = properties[propName];
				}
			} else {
				// If no properties defined, return all frontmatter
				Object.assign(resultProperties, frontmatter);
			}

			results.push({
				path: file.path,
				basename: file.basename,
				properties: resultProperties,
			});
		}
	}

	return results;
}

/**
 * Format query results as a markdown table
 */
export function formatQueryResults(results: QueryResult[], schema: BaseSchema): string {
	if (results.length === 0) {
		return "No matching records found.";
	}

	// Get column names from schema properties or from first result
	const columns: string[] = [];
	if (schema.properties) {
		// Sort by position if available
		const sortedProps = Object.entries(schema.properties)
			.sort(([, a], [, b]) => (a.position || 0) - (b.position || 0));
		columns.push(...sortedProps.map(([name]) => name));
	} else if (results.length > 0) {
		columns.push(...Object.keys(results[0].properties));
	}

	// Add "Note" column for the file name
	const allColumns = ["Note", ...columns];

	// Build markdown table
	const lines: string[] = [];

	// Header row
	lines.push("| " + allColumns.join(" | ") + " |");

	// Separator row
	lines.push("| " + allColumns.map(() => "---").join(" | ") + " |");

	// Data rows
	for (const result of results) {
		const cells = [result.basename];

		for (const col of columns) {
			const value = result.properties[col];
			cells.push(value !== undefined && value !== null ? String(value) : "");
		}

		lines.push("| " + cells.join(" | ") + " |");
	}

	return lines.join("\n");
}
