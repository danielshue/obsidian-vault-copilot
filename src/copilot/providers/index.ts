/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module providers
 * @description Barrel exports for AI provider implementations and provider utilities.
 *
 * This module provides a single import surface for provider abstractions,
 * provider factory helpers, and concrete provider implementations.
 *
 * ## Architecture
 *
 * ```
 * providers/index.ts
 *   ├── AIProvider (base abstraction)
 *   ├── AIProviderFactory (platform-aware creation)
 *   ├── GitHubCopilotCliService (desktop Copilot CLI)
 *   ├── OpenAIService (OpenAI API)
 *   ├── AzureOpenAIService (Azure OpenAI API)
 *   └── GitHubCopilotCliManager (CLI install/auth/status helper)
 * ```
 *
 * @see {@link AIProvider} for the base abstract class
 * @see {@link AIProviderFactory} for provider instantiation
 * @see {@link GitHubCopilotCliService} for Copilot SDK integration
 * @since 0.0.14
 */

export * from "./AIProvider";
export * from "./AIProviderFactory";
export * from "./AzureOpenAIService";
export * from "./GitHubCopilotCliManager";
export * from "./GitHubCopilotCliService";
export * from "./OpenAIService";
