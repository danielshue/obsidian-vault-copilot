/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ContextRegistry
 * @description Registry for dynamically registered context providers.
 *
 * Context providers augment the system prompt with additional information.
 * They are called in priority order (lower = earlier) and their results
 * are concatenated into the system prompt.
 *
 * @since 0.1.0
 */

import type { App } from "obsidian";
import type { ContextProviderRegistration, Unsubscribe } from "../types";

/**
 * Manages dynamically registered context providers.
 */
export class ContextRegistry {
	private providers = new Map<string, ContextProviderRegistration>();
	private changeListeners = new Set<() => void>();

	/**
	 * Register a context provider.
	 *
	 * @param provider - The context provider registration
	 * @returns Unsubscribe function
	 * @throws Error if provider ID already registered
	 */
	register(provider: ContextProviderRegistration): Unsubscribe {
		if (this.providers.has(provider.id)) {
			throw new Error(`Context provider already registered: ${provider.id}`);
		}
		this.providers.set(provider.id, provider);
		this.notifyChange();

		return () => {
			this.providers.delete(provider.id);
			this.notifyChange();
		};
	}

	/**
	 * Get all providers sorted by priority.
	 */
	getAll(): ContextProviderRegistration[] {
		return Array.from(this.providers.values()).sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Collect context from all registered providers.
	 *
	 * @param app - The Obsidian App instance
	 * @returns Concatenated context string
	 */
	async collectContext(app: App): Promise<string> {
		const parts: string[] = [];
		for (const provider of this.getAll()) {
			try {
				const result = await provider.provider(app);
				if (result) {
					parts.push(result);
				}
			} catch (e) {
				console.error(`[ContextRegistry] Provider "${provider.id}" error:`, e);
			}
		}
		return parts.join("\n\n");
	}

	/**
	 * Check if a provider is registered.
	 */
	has(id: string): boolean {
		return this.providers.has(id);
	}

	/**
	 * Subscribe to registry changes.
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
				console.error("[ContextRegistry] Change listener error:", e);
			}
		}
	}
}
