/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module customization
 * @description User customization loaders for Vault Copilot.
 *
 * This module provides loading and caching of user-defined prompts,
 * skills, and agent configurations from the vault.
 *
 * @example
 * ```typescript
 * import { PromptCache, SkillRegistry } from "./copilot/customization";
 * ```
 *
 * @see {@link CustomizationLoader} for the main loading interface
 * @see {@link SkillRegistry} for skill management
 * @see {@link PromptCache} for prompt caching
 * @see {@link AgentCache} for agent configuration caching
 * @since 0.0.28
 */

export * from "./AgentCache";
export * from "./CustomizationLoader";
export * from "./PromptCache";
export * from "./SkillRegistry";
