/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AIProviderFactory
 * @description Factory helpers for creating and discovering AI provider implementations.
 *
 * This module is the single entry point for provider instantiation and platform-aware
 * provider discovery in Vault Copilot.
 *
 * ## Architecture
 *
 * ```
 * createAIProvider()
 *   ├── OpenAIService        (provider: "openai")
 *   ├── AzureOpenAIService   (provider: "azure-openai")
 *   └── GitHubCopilotCliService (provider: "copilot", desktop only)
 * ```
 *
 * ## Platform behavior
 *
 * - `copilot` is desktop-only (requires CLI/local process support)
 * - `openai` and `azure-openai` are available on desktop and mobile
 * - Unsupported providers throw explicit user-facing errors
 *
 * @example
 * ```typescript
 * const provider = await createAIProvider(app, {
 *   provider: "openai",
 *   model: "gpt-4o",
 *   streaming: true,
 * });
 * await provider.initialize();
 * ```
 *
 * @see {@link AIProvider} for the shared provider abstraction
 * @see {@link getAvailableProviderInfo} for platform-aware provider metadata
 * @see {@link isProviderAvailable} for low-level provider availability checks
 * @since 0.0.1
 */

import { App, Platform } from "obsidian";
import { AIProvider, AIProviderConfig, OpenAIProviderConfig, AzureOpenAIProviderConfig, CopilotProviderConfig } from "./AIProvider";
import { OpenAIService } from "./OpenAIService";
import { AzureOpenAIService } from "./AzureOpenAIService";
import { isProviderAvailable, SupportedAIProvider } from "../../utils/platform";

/**
 * Metadata describing a provider option and its current availability.
 */
export interface ProviderAvailabilityInfo {
	/** Internal provider type identifier used in settings and config. */
	type: SupportedAIProvider;
	/** User-facing provider name shown in UI. */
	name: string;
	/** Short provider description shown in picker/help text. */
	description: string;
	/** Whether this provider can be used on the current platform. */
	available: boolean;
}

/**
 * Create a concrete AI provider instance from generic config.
 *
 * This function enforces platform compatibility before instantiation and
 * performs a dynamic import for the Copilot provider to avoid loading
 * Node-dependent modules on mobile.
 *
 * @param app - Obsidian app instance passed to provider constructors
 * @param config - Provider config including `provider`, `model`, and options
 * @returns Instantiated provider implementing {@link AIProvider}
 *
 * @throws {Error} If the requested provider is not available on the current platform
 * @throws {Error} If provider type is unknown
 *
 * @example
 * ```typescript
 * const provider = await createAIProvider(app, {
 *   provider: "azure-openai",
 *   model: "gpt-4o",
 *   streaming: true,
 *   endpoint: "https://my-resource.openai.azure.com",
 *   deploymentName: "gpt-4o",
 *   apiKey: "...",
 * });
 * ```
 *
 * @see {@link getAvailableProviderNames} for user-facing availability messaging
 */
export async function createAIProvider(
	app: App,
	config: AIProviderConfig
): Promise<AIProvider> {
	const providerType = config.provider as SupportedAIProvider;
	
	if (!isProviderAvailable(providerType)) {
		throw new Error(
			`${config.provider} provider is not available on ${Platform.isMobile ? "mobile" : "this platform"}. ` +
			`Available providers: ${getAvailableProviderNames().join(", ")}`
		);
	}

	switch (config.provider) {
		case "openai":
			return new OpenAIService(app, config as OpenAIProviderConfig);

		case "azure-openai":
			return new AzureOpenAIService(app, config as AzureOpenAIProviderConfig);

		case "copilot":
			if (Platform.isMobile) {
				throw new Error(
					"GitHub Copilot CLI is not available on mobile. " +
					"Please use OpenAI or Azure OpenAI provider in settings."
				);
			}
			// Dynamic import to avoid loading Node.js modules on mobile
			const { GitHubCopilotCliService } = await import("./GitHubCopilotCliService");
			return new GitHubCopilotCliService(app, config as CopilotProviderConfig) as unknown as AIProvider;

		default:
			throw new Error(`Unknown provider type: ${config.provider}`);
	}
}

/**
 * Get provider metadata with availability for the current platform.
 *
 * Returns all supported providers with an `available` flag instead of
 * filtering unavailable entries, making this suitable for UI pickers that
 * need to display disabled options with explanatory text.
 *
 * @returns Array of provider metadata with availability flags
 *
 * @example
 * ```typescript
 * const providerInfo = getAvailableProviderInfo();
 * const enabled = providerInfo.filter(p => p.available);
 * ```
 */
export function getAvailableProviderInfo(): ProviderAvailabilityInfo[] {
	const providers = [
		{
			type: "copilot" as SupportedAIProvider,
			name: "GitHub Copilot",
			description: "Full-featured with CLI SDK, MCP, and Agent Skills",
			available: isProviderAvailable("copilot"),
		},
		{
			type: "openai" as SupportedAIProvider,
			name: "OpenAI",
			description: "Direct API access to GPT models",
			available: isProviderAvailable("openai"),
		},
		{
			type: "azure-openai" as SupportedAIProvider,
			name: "Azure OpenAI",
			description: "Enterprise Azure-hosted OpenAI models",
			available: isProviderAvailable("azure-openai"),
		},
	];

	return providers;
}

/**
 * Get user-facing names of currently available providers.
 *
 * Convenience helper that filters unavailable providers and returns only
 * display names, typically for error messages and simple UI labels.
 *
 * @returns Array of available provider names
 *
 * @example
 * ```typescript
 * const names = getAvailableProviderNames();
 * console.log(`Available providers: ${names.join(", ")}`);
 * ```
 *
 * @see {@link getAvailableProviderInfo} for structured metadata
 */
export function getAvailableProviderNames(): string[] {
	return getAvailableProviderInfo()
		.filter(p => p.available)
		.map(p => p.name);
}
