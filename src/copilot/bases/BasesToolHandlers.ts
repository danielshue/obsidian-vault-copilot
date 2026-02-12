/**
 * BasesToolHandlers - Implementation of Bases AI tool handlers
 * 
 * Provides the handler functions for Bases tools that are registered
 * with AI providers. Handlers receive parsed arguments and delegate
 * to the appropriate Bases service modules.
 */

import type { App, TFile } from "obsidian";
import { parseBaseFile } from "./BasesParser";
import { queryBase, formatQueryResults } from "./BasesQueryEngine";
import { generateBaseYaml, validateBaseSpec, createDefaultBaseSpec } from "./BasesYamlGenerator";
import { listBases, findBaseByName, formatBasesList } from "./BasesDiscovery";
import {
	previewPropertyUpdates,
	applyPropertyUpdates,
	formatMutationPreview,
	formatMutationResult,
} from "./BasesMutator";
import type {
	CreateBaseParams,
	ReadBaseParams,
	QueryBaseParams,
	AddBaseRecordsParams,
	UpdateBaseRecordsParams,
	EvolveBaseSchemaParams,
} from "./BasesToolDefinitions";
import type { BaseFilterGroup } from "./types";

/**
 * Recursively search a filter group for a file.inFolder() expression and extract the folder path
 */
function findFolderFromFilters(group: BaseFilterGroup): string | undefined {
	const items = group.and || group.or;
	if (items) {
		for (const item of items) {
			if (typeof item === "string") {
				const match = item.match(/file\.inFolder\(\s*"([^"]*)"\s*\)/);
				if (match && match[1] !== undefined) return match[1];
			} else {
				const found = findFolderFromFilters(item);
				if (found) return found;
			}
		}
	}
	if (group.not) {
		if (typeof group.not === "string") {
			const match = group.not.match(/file\.inFolder\(\s*"([^"]*)"\s*\)/);
			if (match && match[1] !== undefined) return match[1];
		} else {
			return findFolderFromFilters(group.not);
		}
	}
	return undefined;
}

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

		const content = await app.vault.read(baseFile as TFile);
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

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Determine folder for new notes
		let targetFolder = params.folder;
		if (!targetFolder && schema.filters) {
			// Try to infer folder from file.inFolder() expression in the filter group
			targetFolder = findFolderFromFilters(schema.filters);
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
					const folderPath = targetFolder.split("/")[0] ?? targetFolder;
					const folder = app.vault.getAbstractFileByPath(folderPath);
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

/**
 * Handler for create_base tool
 * 
 * Creates a new .base file from a specification
 */
export async function handleCreateBase(app: App, params: CreateBaseParams): Promise<string> {
	try {
		// Normalize path
		const basePath = normalizeBasePath(params.path);

		// Check if file already exists
		const existing = app.vault.getAbstractFileByPath(basePath);
		if (existing) {
			return `Error: Base file already exists at ${basePath}. Use a different path or evolve_base_schema to modify it.`;
		}

		// Create BaseSpec
		const spec = createDefaultBaseSpec(
			params.name || basePath.replace(".base", "").split("/").pop() || "Untitled",
			params.properties,
			params.description
		);

		// Add filters if provided
		if (params.filters && params.filters.length > 0) {
			spec.filters = params.filters as any;
		}

		// Validate spec
		const validationError = validateBaseSpec(spec);
		if (validationError) {
			return `Error: Invalid Base specification - ${validationError}`;
		}

		// Generate YAML
		const yamlContent = generateBaseYaml(spec);

		// Ensure parent folder exists
		const folderPath = basePath.substring(0, basePath.lastIndexOf("/"));
		if (folderPath) {
			const folder = app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				await app.vault.createFolder(folderPath);
			}
		}

		// Create the Base file
		await app.vault.create(basePath, yamlContent);

		let response = `Successfully created Base: ${basePath}\n\n`;
		response += `Properties: ${params.properties.map((p) => p.name).join(", ")}`;

		// Optionally create sample notes
		if (params.create_sample_notes) {
			const sampleRecords: AddBaseRecordsParams["records"] = [];
			
			// Create 2-3 sample records
			for (let i = 1; i <= 2; i++) {
				const sampleProps: Record<string, any> = {};
				for (const prop of params.properties) {
					// Generate sample values based on type
					if (prop.type === "number") {
						sampleProps[prop.name] = i;
					} else if (prop.type === "checkbox") {
						sampleProps[prop.name] = i === 1;
					} else if (prop.type === "date") {
						sampleProps[prop.name] = new Date().toISOString().split("T")[0];
					} else {
						sampleProps[prop.name] = `Sample ${prop.name} ${i}`;
					}
				}

				sampleRecords.push({
					title: `Sample ${spec.name} ${i}`,
					properties: sampleProps,
					content: `\n\nThis is a sample record for the ${spec.name} Base.`,
				});
			}

			const addResult = await handleAddBaseRecords(app, {
				base_path: basePath,
				records: sampleRecords,
			});

			response += `\n\n${addResult}`;
		}

		return response;
	} catch (error) {
		console.error("Error in handleCreateBase:", error);
		return `Error creating Base: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handler for read_base tool
 * 
 * Reads a Base's schema or lists all Bases in the vault
 */
export async function handleReadBase(app: App, params: ReadBaseParams): Promise<string> {
	try {
		// List mode - no base_path provided
		if (!params.base_path) {
			const bases = await listBases(app, params.include_schema_details || false);
			return formatBasesList(bases, params.include_schema_details || false);
		}

		// Read specific Base
		const basePath = normalizeBasePath(params.base_path);
		const baseFile = app.vault.getAbstractFileByPath(basePath);
		
		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Format schema for display
		const lines: string[] = [];
		lines.push(`**Base: ${basePath}**\n`);

		if (schema.filters && schema.filters.length > 0) {
			lines.push(`**Filters (${schema.filters.length}):**`);
			for (const filter of schema.filters) {
				lines.push(`  - ${filter.property} ${filter.operator} ${filter.value || "(empty)"}`);
			}
			lines.push("");
		}

		if (schema.properties) {
			const propCount = Object.keys(schema.properties).length;
			lines.push(`**Properties (${propCount}):**`);
			const sortedProps = Object.entries(schema.properties).sort(
				([, a], [, b]) => (a.position || 0) - (b.position || 0)
			);
			for (const [name, config] of sortedProps) {
				const parts = [name];
				if (config.type) parts.push(`type: ${config.type}`);
				if (config.width) parts.push(`width: ${config.width}`);
				lines.push(`  - ${parts.join(", ")}`);
			}
			lines.push("");
		}

		if (schema.formulas) {
			const formulaCount = Object.keys(schema.formulas).length;
			lines.push(`**Formulas (${formulaCount}):**`);
			for (const [name, formula] of Object.entries(schema.formulas)) {
				lines.push(`  - ${name}: ${formula.substring(0, 50)}...`);
			}
			lines.push("");
		}

		if (schema.views && schema.views.length > 0) {
			lines.push(`**Views (${schema.views.length}):**`);
			for (const view of schema.views) {
				lines.push(`  - ${view.name} (${view.type})`);
			}
			lines.push("");
		}

		lines.push("*Note: This shows the view definition only. Use query_base to see actual data.*");

		return lines.join("\n");
	} catch (error) {
		console.error("Error in handleReadBase:", error);
		return `Error reading Base: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handler for update_base_records tool
 * 
 * Updates frontmatter properties on notes matching a Base's filters
 */
export async function handleUpdateBaseRecords(
	app: App,
	params: UpdateBaseRecordsParams
): Promise<string> {
	try {
		const basePath = normalizeBasePath(params.base_path);
		const baseFile = app.vault.getAbstractFileByPath(basePath);

		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Preview mode (default: true for safety)
		if (params.preview_only !== false) {
			const preview = await previewPropertyUpdates(app, schema, params.property_updates);
			const formatted = formatMutationPreview(preview);
			return `${formatted}\n\n*To apply these changes, call update_base_records again with preview_only: false*`;
		}

		// Apply mode
		const result = await applyPropertyUpdates(app, schema, params.property_updates);
		return formatMutationResult(result);
	} catch (error) {
		console.error("Error in handleUpdateBaseRecords:", error);
		return `Error updating records: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handler for evolve_base_schema tool
 * 
 * Modifies a Base's schema and optionally backfills values
 */
export async function handleEvolveBaseSchema(
	app: App,
	params: EvolveBaseSchemaParams
): Promise<string> {
	try {
		const basePath = normalizeBasePath(params.base_path);
		const baseFile = app.vault.getAbstractFileByPath(basePath);

		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Preview mode (default: true)
		if (params.preview_only !== false) {
			let previewMsg = `**Preview: Schema evolution for ${basePath}**\n\n`;
			previewMsg += `Operation: ${params.operation}\n`;
			previewMsg += `Property: ${params.property_name}\n`;

			if (params.operation === "add_property") {
				previewMsg += `Type: ${params.property_type || "text"}\n`;
				if (params.backfill_value) {
					previewMsg += `Backfill value: ${params.backfill_value}\n`;
					const matchingNotes = await queryBase(app, schema, 1000);
					previewMsg += `\nWill backfill ${matchingNotes.length} note(s)\n`;
				}
			} else if (params.operation === "rename_property") {
				previewMsg += `New name: ${params.new_property_name}\n`;
				if (params.backfill_value) {
					const matchingNotes = await queryBase(app, schema, 1000);
					previewMsg += `Will update ${matchingNotes.length} note(s)\n`;
				}
			} else if (params.operation === "remove_property") {
				previewMsg += `\nProperty will be removed from Base schema (notes will not be modified)\n`;
			}

			previewMsg += `\n*To apply, call evolve_base_schema again with preview_only: false*`;
			return previewMsg;
		}

		// Apply mode - modify Base schema
		const modifiedSchema = { ...schema };

		if (!modifiedSchema.properties) {
			modifiedSchema.properties = {};
		}

		if (params.operation === "add_property") {
			const position = Object.keys(modifiedSchema.properties).length;
			modifiedSchema.properties[params.property_name] = {
				position,
				type: params.property_type as any,
				width: 150,
			};
		} else if (params.operation === "remove_property") {
			delete modifiedSchema.properties[params.property_name];
		} else if (params.operation === "rename_property" && params.new_property_name) {
			const oldConfig = modifiedSchema.properties[params.property_name];
			if (oldConfig) {
				modifiedSchema.properties[params.new_property_name] = oldConfig;
				delete modifiedSchema.properties[params.property_name];
			}
		}

		// Generate new YAML - convert modifiedSchema to BaseSpec
		const spec = {
			name: basePath.replace(".base", "").split("/").pop() || "Base",
			properties: Object.entries(modifiedSchema.properties).map(([name, config]) => ({
				name,
				type: config.type || "text",
				width: config.width,
			})),
			filters: modifiedSchema.filters as any,
			views: modifiedSchema.views,
		};

		const newYaml = generateBaseYaml(spec);

		// Update Base file
		await app.vault.modify(baseFile as TFile, newYaml);

		let response = `Successfully updated Base schema: ${basePath}\n\n`;
		response += `Operation: ${params.operation}\n`;
		response += `Property: ${params.property_name}\n`;

		// Backfill if requested
		if (params.backfill_value && (params.operation === "add_property" || params.operation === "rename_property")) {
			const propertyName = params.operation === "rename_property" && params.new_property_name
				? params.new_property_name
				: params.property_name;

			const backfillResult = await applyPropertyUpdates(app, modifiedSchema, {
				[propertyName]: params.backfill_value,
			});

			response += `\n${formatMutationResult(backfillResult)}`;
		}

		return response;
	} catch (error) {
		console.error("Error in handleEvolveBaseSchema:", error);
		return `Error evolving Base schema: ${error instanceof Error ? error.message : String(error)}`;
	}
}

