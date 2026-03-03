/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module settings/index
 * @description Barrel export for vault-copilot settings module.
 * Re-exports types, defaults, and utilities needed by basic plugin components.
 */

export type {
	CopilotPluginSettings,
	BasicCopilotPluginSettings,
	CopilotSession,
	OpenAIProviderProfile,
	AzureOpenAIProviderProfile,
	AIProviderProfile,
	PeriodicNotesSettings,
} from "./types";

export { DEFAULT_SETTINGS, FALLBACK_MODELS } from "./defaults";
export * from "./utils";
export * from "./profiles";
