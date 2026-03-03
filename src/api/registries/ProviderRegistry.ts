/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ProviderRegistry
 * @description Registry for dynamically registered AI providers.
 *
 * The active provider is selected by the user in settings. The registry
 * stores provider factories and metadata; actual instances are created
 * on demand when the user switches providers.
 *
 * @since 0.1.0
 */

import type { AIProviderRegistration, Unsubscribe } from "../types";

/**
 * Manages dynamically registered AI providers.
 */
export class ProviderRegistry {
	private providers = new Map<string, AIProviderRegistration>();
	private changeListeners = new Set<() => void>();

	/**
	 * Register an AI provider.
	 *
	 * @param registration - The provider registration
	 * @returns Unsubscribe function
	 * @throws Error if ID already registered
	 */
	register(registration: AIProviderRegistration): Unsubscribe {
		if (this.providers.has(registration.id)) {
			throw new Error(`AI provider already registered: ${registration.id}`);
		}
		this.providers.set(registration.id, registration);
		this.notifyChange();

		return () => {
			this.providers.delete(registration.id);
			this.notifyChange();
		};
	}

	/**
	 * Get a provider registration by ID.
	 */
	get(id: string): AIProviderRegistration | undefined {
		return this.providers.get(id);
	}

	/**
	 * Get all registered providers.
	 */
	getAll(): AIProviderRegistration[] {
		return Array.from(this.providers.values());
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
				console.error("[ProviderRegistry] Change listener error:", e);
			}
		}
	}
}
