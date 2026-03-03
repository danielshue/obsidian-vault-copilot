/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ToolRegistry
 * @description Registry for dynamically registered tool providers.
 *
 * Tools are registered by Pro and third-party plugins via
 * `api.registerToolProvider()`. Providers query this registry at runtime
 * to get the full list of available tools.
 *
 * @since 0.1.0
 */

import type { ToolProvider, ToolDefinition, ToolHandler, Unsubscribe } from "../types";

/**
 * Manages dynamically registered tool providers.
 *
 * @example
 * ```typescript
 * const registry = new ToolRegistry();
 * const unsub = registry.register({
 *   id: "my-plugin",
 *   tools: [{ name: "my_tool", description: "Does things", parameters: { type: "object", properties: {} } }],
 *   handler: async (name, args) => ({ result: "done" }),
 * });
 * // Later:
 * unsub();
 * ```
 */
export class ToolRegistry {
	private providers = new Map<string, ToolProvider>();
	private changeListeners = new Set<() => void>();

	/**
	 * Register a tool provider.
	 *
	 * @param provider - The tool provider to register
	 * @returns Unsubscribe function to remove the provider
	 * @throws Error if a provider with the same ID is already registered
	 */
	register(provider: ToolProvider): Unsubscribe {
		if (this.providers.has(provider.id)) {
			throw new Error(`Tool provider already registered: ${provider.id}`);
		}
		this.providers.set(provider.id, provider);
		this.notifyChange();

		return () => {
			this.providers.delete(provider.id);
			this.notifyChange();
		};
	}

	/**
	 * Get all registered tool definitions.
	 *
	 * @returns Flat array of all tool definitions from all providers
	 */
	getAllTools(): ToolDefinition[] {
		const tools: ToolDefinition[] = [];
		for (const provider of this.providers.values()) {
			tools.push(...provider.tools);
		}
		return tools;
	}

	/**
	 * Get all registered providers.
	 *
	 * @returns Array of all registered providers
	 */
	getAllProviders(): ToolProvider[] {
		return Array.from(this.providers.values());
	}

	/**
	 * Find the handler for a given tool name.
	 *
	 * @param toolName - The tool name to look up
	 * @returns The handler function, or undefined if not found
	 */
	getHandler(toolName: string): ToolHandler | undefined {
		for (const provider of this.providers.values()) {
			if (provider.tools.some(t => t.name === toolName)) {
				return provider.handler;
			}
		}
		return undefined;
	}

	/**
	 * Check if a tool is registered.
	 *
	 * @param toolName - Tool name to check
	 */
	has(toolName: string): boolean {
		for (const provider of this.providers.values()) {
			if (provider.tools.some(t => t.name === toolName)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Subscribe to registry changes.
	 *
	 * @param listener - Callback when tools are added/removed
	 * @returns Unsubscribe function
	 */
	onChange(listener: () => void): Unsubscribe {
		this.changeListeners.add(listener);
		return () => { this.changeListeners.delete(listener); };
	}

	/** Clear all registrations. */
	clear(): void {
		this.providers.clear();
		this.notifyChange();
	}

	private notifyChange(): void {
		for (const listener of this.changeListeners) {
			try { listener(); } catch (e) {
				console.error("[ToolRegistry] Change listener error:", e);
			}
		}
	}
}
