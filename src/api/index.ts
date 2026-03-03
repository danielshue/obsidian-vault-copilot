/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module API
 * @description Barrel export for the Vault Copilot Extension API.
 * @since 0.1.0
 */

export type {
	Unsubscribe,
	AIProviderType,
	ToolParameterSchema,
	ToolDefinition,
	ToolHandler,
	ToolProvider,
	AIProviderCapabilities,
	AIProviderRegistration,
	ContextProviderRegistration,
	SettingsSectionRegistration,
	ViewRegistration,
	CommandRegistration,
	RenderExtensionType,
	RenderExtension,
	StatusBarRegistration,
	SettingsChangeEvent,
	SessionChangeEvent,
	MessageEvent,
	ProviderChangeEvent,
	VaultCopilotExtensionAPI,
} from "./types";

export {
	VaultCopilotExtensionAPIImpl,
	type ExtensionAPIOptions,
	type VaultCopilotExtensionAPIDelegate,
} from "./VaultCopilotExtensionAPI";

export {
	ToolRegistry,
	ProviderRegistry,
	ViewRegistry,
	SettingsRegistry,
	RenderRegistry,
	CommandRegistry,
	ContextRegistry,
} from "./registries";
