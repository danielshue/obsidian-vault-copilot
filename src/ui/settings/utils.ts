/**
 * @module settings/utils
 * @description Utility functions for settings and model management.
 *
 * This module contains helper functions for model display names,
 * available models resolution, and other settings-related utilities.
 *
 * @since 0.0.1
 */

import { FALLBACK_MODELS } from "./defaults";

// ============================================================================
// Model Display Helpers
// ============================================================================

/**
 * Get display name for a model ID
 * Converts model IDs like "gpt-5.1-codex" to "GPT-5.1-Codex"
 */
export function getModelDisplayName(modelId: string): string {
	if (!modelId) return "Unknown";
	
	// Handle special cases
	if (modelId === "auto") return "Auto";
	
	// Capitalize and format
	return modelId
		.split('-')
		.map(part => {
			// Preserve version numbers like "4.5", "5.1"
			if (/^\d/.test(part)) return part;
			// Capitalize first letter, keep rest lowercase except known acronyms
			if (part.toLowerCase() === 'gpt') return 'GPT';
			if (part.toLowerCase() === 'mini') return 'Mini';
			if (part.toLowerCase() === 'max') return 'Max';
			if (part.toLowerCase() === 'preview') return '(Preview)';
			if (part.toLowerCase() === 'codex') return 'Codex';
			if (part.toLowerCase() === 'pro') return 'Pro';
			if (part.toLowerCase() === 'flash') return 'Flash';
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(' ')
		.replace(' (Preview)', ' (Preview)');
}

/**
 * Get the billing multiplier for a model ID from saved settings.
 *
 * @param settings - Settings object containing the multiplier map
 * @param modelId - Model identifier to look up
 * @returns The multiplier or undefined if not known
 */
export function getModelMultiplier(
	settings: { modelMultipliers?: Record<string, number> },
	modelId: string,
): number | undefined {
	return settings.modelMultipliers?.[modelId];
}

/**
 * Format a model label for display in a list, optionally appending the billing multiplier.
 * Example: `"Claude Sonnet 4.5  1x"` where the model costs 1 request unit.
 *
 * @param modelId - The model identifier
 * @param multiplier - Optional billing multiplier to append
 * @returns Formatted label string
 */
export function getModelLabel(modelId: string, multiplier?: number): string {
	const name = getModelDisplayName(modelId);
	if (multiplier === undefined) return name;
	const formatted = Number.isInteger(multiplier) ? `${multiplier}x` : `${multiplier}x`;
	return `${name}  ${formatted}`;
}

/**
 * Get available models from settings or fallback
 */
export function getAvailableModels(settings: { availableModels?: string[] }): string[] {
	const discoveredModels = Array.isArray(settings.availableModels)
		? settings.availableModels.filter((model): model is string => typeof model === "string" && model.length > 0)
		: [];

	const mergedModels = [...FALLBACK_MODELS];
	for (const model of discoveredModels) {
		if (!mergedModels.includes(model)) {
			mergedModels.push(model);
		}
	}

	return mergedModels;
}
