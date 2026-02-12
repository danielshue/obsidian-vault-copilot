/**
 * BasesYamlGenerator - Generate valid .base YAML from structured specifications
 * 
 * Creates .base file content from BaseSpec objects. Used by create_base and
 * evolve_base_schema tools to generate syntactically valid Bases YAML that
 * Obsidian can render.
 */

import type { BaseSpec, BaseFilter, BaseView, BaseProperty } from "./types";

/**
 * Generate valid .base file content from a BaseSpec
 * 
 * @param spec - The Base specification
 * @returns Valid .base file content (markdown with YAML frontmatter)
 */
export function generateBaseYaml(spec: BaseSpec): string {
	const lines: string[] = ["---"];

	// Generate filters section
	if (spec.filters && spec.filters.length > 0) {
		lines.push("filters:");
		for (const filter of spec.filters) {
			lines.push(`  - property: ${filter.property}`);
			lines.push(`    operator: ${filter.operator}`);
			if (filter.value !== undefined && filter.value !== null) {
				const value = typeof filter.value === "string" ? filter.value : String(filter.value);
				lines.push(`    value: ${value}`);
			}
		}
		lines.push("");
	}

	// Generate properties section
	if (spec.properties && spec.properties.length > 0) {
		lines.push("properties:");
		
		// Sort by position if available, otherwise maintain order
		const sortedProps = [...spec.properties].sort((a, b) => {
			const aPos = a.width !== undefined ? spec.properties.indexOf(a) : 999;
			const bPos = b.width !== undefined ? spec.properties.indexOf(b) : 999;
			return aPos - bPos;
		});

		sortedProps.forEach((prop, index) => {
			lines.push(`  ${prop.name}:`);
			if (prop.width) {
				lines.push(`    width: ${prop.width}`);
			}
			lines.push(`    position: ${index}`);
			if (prop.type) {
				lines.push(`    type: ${prop.type}`);
			}
		});
		lines.push("");
	}

	// Generate views section
	if (spec.views && spec.views.length > 0) {
		lines.push("views:");
		for (const view of spec.views) {
			lines.push(`  - name: ${view.name}`);
			lines.push(`    type: ${view.type}`);
			
			if (view.sort && view.sort.length > 0) {
				lines.push(`    sort:`);
				for (const sort of view.sort) {
					lines.push(`      - property: ${sort.property}`);
					lines.push(`        order: ${sort.order}`);
				}
			}
			
			if (view.filters && view.filters.length > 0) {
				lines.push(`    filters:`);
				for (const filter of view.filters) {
					lines.push(`      - property: ${filter.property}`);
					lines.push(`        operator: ${filter.operator}`);
					if (filter.value !== undefined && filter.value !== null) {
						lines.push(`        value: ${filter.value}`);
					}
				}
			}
		}
		lines.push("");
	}

	lines.push("---");

	return lines.join("\n");
}

/**
 * Validate a BaseSpec before generating YAML
 * 
 * @param spec - The spec to validate
 * @returns Error message if invalid, null if valid
 */
export function validateBaseSpec(spec: BaseSpec): string | null {
	if (!spec.name || spec.name.trim() === "") {
		return "Base name is required";
	}

	if (!spec.properties || spec.properties.length === 0) {
		return "At least one property is required";
	}

	// Check for duplicate property names
	const propertyNames = new Set<string>();
	for (const prop of spec.properties) {
		if (!prop.name || prop.name.trim() === "") {
			return "All properties must have a name";
		}
		if (propertyNames.has(prop.name)) {
			return `Duplicate property name: ${prop.name}`;
		}
		propertyNames.add(prop.name);
	}

	// Validate view types
	if (spec.views) {
		for (const view of spec.views) {
			if (!["table", "card", "list", "map"].includes(view.type)) {
				return `Invalid view type: ${view.type}. Must be table, card, list, or map`;
			}
		}
	}

	return null;
}

/**
 * Create a default BaseSpec for a given name and properties
 * 
 * @param name - Base name
 * @param properties - Property definitions
 * @param description - Optional description
 * @returns A valid BaseSpec with defaults
 */
export function createDefaultBaseSpec(
	name: string,
	properties: Array<{ name: string; type?: string; width?: number }>,
	description?: string
): BaseSpec {
	return {
		name,
		description,
		properties: properties.map((prop, index) => ({
			name: prop.name,
			type: (prop.type as any) || "text",
			width: prop.width || 150,
		})),
		views: [
			{
				name: "All",
				type: "table",
			},
		],
	};
}
