/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ViewRegistry
 * @description Registry for dynamically registered workspace views.
 *
 * Views are registered by Pro and third-party plugins. Basic manages the
 * lifecycle and cleanup of registered views.
 *
 * @since 0.1.0
 */

import type { ViewRegistration, Unsubscribe } from "../types";

/**
 * Manages dynamically registered workspace views.
 */
export class ViewRegistry {
	private views = new Map<string, ViewRegistration>();
	private changeListeners = new Set<() => void>();

	/**
	 * Register a workspace view.
	 *
	 * @param registration - The view registration
	 * @returns Unsubscribe function
	 * @throws Error if view type already registered
	 */
	register(registration: ViewRegistration): Unsubscribe {
		if (this.views.has(registration.viewType)) {
			throw new Error(`View already registered: ${registration.viewType}`);
		}
		this.views.set(registration.viewType, registration);
		this.notifyChange();

		return () => {
			this.views.delete(registration.viewType);
			this.notifyChange();
		};
	}

	/**
	 * Get a view registration by type.
	 */
	get(viewType: string): ViewRegistration | undefined {
		return this.views.get(viewType);
	}

	/**
	 * Get all registered views.
	 */
	getAll(): ViewRegistration[] {
		return Array.from(this.views.values());
	}

	/**
	 * Check if a view type is registered.
	 */
	has(viewType: string): boolean {
		return this.views.has(viewType);
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
		this.views.clear();
		this.notifyChange();
	}

	private notifyChange(): void {
		for (const listener of this.changeListeners) {
			try { listener(); } catch (e) {
				console.error("[ViewRegistry] Change listener error:", e);
			}
		}
	}
}
