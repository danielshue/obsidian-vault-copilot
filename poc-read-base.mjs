#!/usr/bin/env node
/**
 * POC Demo: Reading Data from Obsidian Bases
 * 
 * This script demonstrates how to read and parse .base files.
 * 
 * Usage:
 *   node poc-read-base.mjs <path-to-base-file>
 * 
 * Example:
 *   node poc-read-base.mjs test-vault/projects.base
 */

import { readFileSync } from 'fs';

/**
 * Simple YAML parser for .base files
 * This is a basic implementation that handles common YAML structures
 */
function parseYaml(yaml) {
	// Very simple YAML parser
	try {
		if (!yaml || yaml.trim() === "") {
			return null;
		}

		const lines = yaml.split("\n");
		const result = {};
		const stack = [result];
		let currentIndent = 0;
		let currentKey = "";

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// Skip empty lines and comments
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}

			const indent = line.search(/\S/);
			const isArrayItem = trimmed.startsWith("- ");

			if (isArrayItem) {
				const content = trimmed.substring(2);
				const arrayIndent = indent;

				// Determine parent
				while (stack.length > 1 && arrayIndent <= currentIndent) {
					stack.pop();
					currentIndent = Math.max(0, currentIndent - 2);
				}

				const parent = stack[stack.length - 1];

				if (content.includes(":")) {
					// Object in array
					const obj = {};
					const parts = content.split(":");
					const key = parts[0].trim();
					const value = parts.slice(1).join(":").trim();
					obj[key] = parseValue(value);

					if (!Array.isArray(parent[currentKey])) {
						parent[currentKey] = [];
					}
					parent[currentKey].push(obj);
					stack.push(obj);
					currentIndent = arrayIndent + 2;
				} else {
					// Simple value in array
					if (!Array.isArray(parent[currentKey])) {
						parent[currentKey] = [];
					}
					parent[currentKey].push(parseValue(content));
				}
			} else if (trimmed.includes(":")) {
				// Key-value pair
				const parts = trimmed.split(":");
				const key = parts[0].trim();
				const value = parts.slice(1).join(":").trim();

				// Adjust stack based on indentation
				while (stack.length > 1 && indent < currentIndent) {
					stack.pop();
					currentIndent = Math.max(0, currentIndent - 2);
				}

				const current = stack[stack.length - 1];

				if (!value || value === "") {
					// New nested object or array coming
					currentKey = key;
					current[key] = current[key] || {};
					stack.push(current[key]);
					currentIndent = indent + 2;
				} else {
					current[key] = parseValue(value);
					currentKey = key;
				}
			}
		}

		return result;
	} catch (error) {
		console.error("YAML parse error:", error);
		return null;
	}
}

function parseValue(value) {
	if (!value) return null;

	const trimmed = value.trim();

	// Boolean
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;

	// Null/undefined
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
 * Parse a .base file's content into a structured object
 */
function parseBaseFile(content) {
	try {
		// Extract YAML frontmatter from markdown
		const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
		
		if (!frontmatterMatch) {
			console.error("❌ No YAML frontmatter found in .base file");
			return null;
		}

		const yamlContent = frontmatterMatch[1];
		
		// Parse YAML
		const parsed = parseYaml(yamlContent);
		
		if (!parsed || typeof parsed !== "object") {
			console.error("❌ Invalid YAML structure");
			return null;
		}

		return parsed;
	} catch (error) {
		console.error("❌ Error parsing .base file:", error.message);
		return null;
	}
}

/**
 * Display the parsed Base schema in a readable format
 */
function displayBaseSchema(schema) {
	console.log("\n📊 Base Schema Contents:\n");
	console.log("=" .repeat(60));

	// Display filters
	if (schema.filters && schema.filters.length > 0) {
		console.log("\n🔍 FILTERS:");
		schema.filters.forEach((filter, idx) => {
			console.log(`  ${idx + 1}. ${filter.property} ${filter.operator} ${filter.value || '(empty)'}`);
		});
	}

	// Display properties
	if (schema.properties) {
		console.log("\n📋 PROPERTIES:");
		const sortedProps = Object.entries(schema.properties)
			.sort(([, a], [, b]) => (a.position || 0) - (b.position || 0));
		
		sortedProps.forEach(([name, config]) => {
			console.log(`  • ${name}`);
			if (config.width) console.log(`    - Width: ${config.width}px`);
			if (config.position !== undefined) console.log(`    - Position: ${config.position}`);
			if (config.type) console.log(`    - Type: ${config.type}`);
		});
	}

	// Display formulas
	if (schema.formulas) {
		console.log("\n🧮 FORMULAS:");
		Object.entries(schema.formulas).forEach(([name, formula]) => {
			console.log(`  • ${name}:`);
			console.log(`    ${formula.trim()}`);
		});
	}

	// Display summaries
	if (schema.summaries) {
		console.log("\n📊 SUMMARIES:");
		Object.entries(schema.summaries).forEach(([property, summaries]) => {
			console.log(`  • ${property}:`);
			summaries.forEach(summary => {
				console.log(`    - ${summary.type}`);
			});
		});
	}

	// Display views
	if (schema.views && schema.views.length > 0) {
		console.log("\n👁️  VIEWS:");
		schema.views.forEach((view, idx) => {
			console.log(`  ${idx + 1}. "${view.name}" (${view.type})`);
			if (view.sort && view.sort.length > 0) {
				console.log(`     Sort by: ${view.sort.map(s => `${s.property} ${s.order}`).join(', ')}`);
			}
		});
	}

	console.log("\n" + "=" .repeat(60));
}

/**
 * Main execution
 */
function main() {
	const args = process.argv.slice(2);
	
	if (args.length === 0) {
		console.error("Usage: node poc-read-base.mjs <path-to-base-file>");
		console.error("Example: node poc-read-base.mjs test-vault/projects.base");
		process.exit(1);
	}

	const baseFilePath = args[0];

	try {
		console.log(`\n📖 Reading Base file: ${baseFilePath}`);
		
		const content = readFileSync(baseFilePath, 'utf-8');
		const schema = parseBaseFile(content);

		if (!schema) {
			console.error("\n❌ Failed to parse Base file");
			process.exit(1);
		}

		displayBaseSchema(schema);

		console.log("\n✅ Successfully read and parsed Base file!\n");
		console.log("💡 Key Insight: The .base file contains ONLY the view definition.");
		console.log("   It has NO data - data comes from vault notes with frontmatter.\n");

	} catch (error) {
		console.error(`\n❌ Error reading file: ${error.message}\n`);
		process.exit(1);
	}
}

main();
