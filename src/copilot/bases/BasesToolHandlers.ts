/**
 * BasesToolHandlers - Implementation of Bases AI tool handlers
 * 
 * Provides the handler functions for Bases tools that are registered
 * with AI providers. Handlers receive parsed arguments and delegate
 * to the appropriate Bases service modules.
 */

import type { App } from "obsidian";
import { parseBaseFile } from "./BasesParser";
import { queryBase, formatQueryResults } from "./BasesQueryEngine";
import type { QueryBaseParams, AddBaseRecordsParams } from "./BasesToolDefinitions";

/**
 * Normalize a Base file path (similar to normalizeVaultPath but for .base files)
 */
function normalizeBasePath(path: string): string {
	// Replace backslashes with forward slashes
	let normalized = path.replace(/\\/g, "/");
	// Remove leading slashes
	normalized = normalized.replace(/^\/+/, "");
	// Ensure .base extension if not present
	if (!normalized.endsWith(".base")) {
		normalized += ".base";
	}
	return normalized;
}

/**
 * Handler for query_base tool
 * 
 * Queries vault notes matching a Base's filters and returns formatted results
 */
export async function handleQueryBase(
	app: App,
	params: QueryBaseParams
): Promise<string> {
	try {
		// Normalize and validate base path
		const basePath = normalizeBasePath(params.base_path);
		if (!basePath.endsWith(".base")) {
			return `Error: Invalid Base file path. Must end with .base (got: ${params.base_path})`;
		}

		// Read the Base file
		const baseFile = app.vault.getAbstractFileByPath(basePath);
		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Query matching notes
		const limit = params.limit || 50;
		const results = await queryBase(app, schema, limit);

		// Format results
		if (results.length === 0) {
			return `No records found matching the filters in ${basePath}.\n\nThe Base filters are:\n${JSON.stringify(
				schema.filters,
				null,
				2
			)}`;
		}

		const table = formatQueryResults(results, schema);
		const summary = `Found ${results.length} record(s) in ${basePath}:\n\n${table}`;

		if (results.length >= limit) {
			return `${summary}\n\n(Showing first ${limit} results. Use limit parameter to see more.)`;
		}

		return summary;
	} catch (error) {
		console.error("Error in handleQueryBase:", error);
		return `Error querying Base: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handler for add_base_records tool
 * 
 * Creates new vault notes with frontmatter matching a Base's schema
 */
export async function handleAddBaseRecords(
	app: App,
	params: AddBaseRecordsParams
): Promise<string> {
	try {
		// Normalize and validate base path
		const basePath = normalizeBasePath(params.base_path);
		if (!basePath.endsWith(".base")) {
			return `Error: Invalid Base file path. Must end with .base (got: ${params.base_path})`;
		}

		// Read the Base file to get schema
		const baseFile = app.vault.getAbstractFileByPath(basePath);
		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Determine folder for new notes
		let targetFolder = params.folder;
		if (!targetFolder && schema.filters) {
			// Try to infer folder from file.folder filter
			const folderFilter = schema.filters.find((f) => f.property === "file.folder");
			if (folderFilter && typeof folderFilter.value === "string") {
				targetFolder = folderFilter.value;
			}
		}
		if (!targetFolder) {
			targetFolder = "";
		}

		// Create notes
		const createdNotes: string[] = [];
		const errors: string[] = [];

		for (const record of params.records) {
			try {
				// Build note path
				const noteName = record.title.endsWith(".md") ? record.title : `${record.title}.md`;
				const notePath = targetFolder ? `${targetFolder}/${noteName}` : noteName;

				// Build frontmatter YAML
				const frontmatterLines = ["---"];
				for (const [key, value] of Object.entries(record.properties)) {
					if (typeof value === "string") {
						frontmatterLines.push(`${key}: ${value}`);
					} else if (typeof value === "number" || typeof value === "boolean") {
						frontmatterLines.push(`${key}: ${value}`);
					} else if (value === null) {
						frontmatterLines.push(`${key}: null`);
					} else if (Array.isArray(value)) {
						frontmatterLines.push(`${key}:`);
						for (const item of value) {
							frontmatterLines.push(`  - ${item}`);
						}
					} else {
						frontmatterLines.push(`${key}: ${JSON.stringify(value)}`);
					}
				}
				frontmatterLines.push("---");
				frontmatterLines.push("");

				// Build full content
				const fullContent = frontmatterLines.join("\n") + (record.content || "");

				// Ensure parent folder exists
				if (targetFolder) {
					const folderPath = targetFolder.split("/")[0];
					let folder = app.vault.getAbstractFileByPath(folderPath);
					if (!folder) {
						await app.vault.createFolder(targetFolder);
					}
				}

				// Create the note
				await app.vault.create(notePath, fullContent);
				createdNotes.push(notePath);
			} catch (error) {
				errors.push(
					`Failed to create "${record.title}": ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		// Build response
		const parts: string[] = [];
		if (createdNotes.length > 0) {
			parts.push(`Successfully created ${createdNotes.length} record(s):`);
			for (const path of createdNotes) {
				parts.push(`- ${path}`);
			}
		}
		if (errors.length > 0) {
			parts.push(`\nErrors (${errors.length}):`);
			for (const error of errors) {
				parts.push(`- ${error}`);
			}
		}

		return parts.join("\n");
	} catch (error) {
		console.error("Error in handleAddBaseRecords:", error);
		return `Error adding records to Base: ${error instanceof Error ? error.message : String(error)}`;
	}
}
