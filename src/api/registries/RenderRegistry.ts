/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module RenderRegistry
 * @description Registry for dynamically registered render extensions.
 *
 * Render extensions post-process rendered markdown (e.g., KaTeX math,
 * Mermaid diagrams, syntax highlighting). Extensions are chained in
 * priority order.
 *
 * @since 0.1.0
 */

import type { RenderExtension, Unsubscribe } from "../types";

/**
 * Manages dynamically registered render extensions.
 */
export class RenderRegistry {
	private extensions = new Map<string, RenderExtension>();
	private changeListeners = new Set<() => void>();

	/**
	 * Register a render extension.
	 *
	 * @param extension - The render extension
	 * @returns Unsubscribe function
	 * @throws Error if extension ID already registered
	 */
	register(extension: RenderExtension): Unsubscribe {
		if (this.extensions.has(extension.id)) {
			throw new Error(`Render extension already registered: ${extension.id}`);
		}
		this.extensions.set(extension.id, extension);
		this.notifyChange();

		return () => {
			this.extensions.delete(extension.id);
			this.notifyChange();
		};
	}

	/**
	 * Get all extensions sorted by priority.
	 */
	getAll(): RenderExtension[] {
		return Array.from(this.extensions.values()).sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Get extensions by type.
	 *
	 * @param type - The extension type to filter by
	 */
	getByType(type: string): RenderExtension[] {
		return this.getAll().filter(ext => ext.type === type);
	}

	/**
	 * Apply all registered render extensions to an element.
	 *
	 * @param el - The element to process
	 */
	async processAll(el: HTMLElement): Promise<void> {
		for (const ext of this.getAll()) {
			try {
				await ext.process(el);
			} catch (e) {
				console.error(`[RenderRegistry] Extension "${ext.id}" error:`, e);
			}
		}
	}

	/**
	 * Check if an extension is registered.
	 */
	has(id: string): boolean {
		return this.extensions.has(id);
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
		this.extensions.clear();
		this.notifyChange();
	}

	private notifyChange(): void {
		for (const listener of this.changeListeners) {
			try { listener(); } catch (e) {
				console.error("[RenderRegistry] Change listener error:", e);
			}
		}
	}
}
