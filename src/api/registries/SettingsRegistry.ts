/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SettingsRegistry
 * @description Registry for dynamically registered settings sections.
 *
 * Settings sections from Pro and third-party plugins are rendered
 * alongside Basic's own sections, ordered by priority.
 *
 * @since 0.1.0
 */

import type { SettingsSectionRegistration, Unsubscribe } from "../types";

/**
 * Manages dynamically registered settings sections.
 */
export class SettingsRegistry {
	private sections = new Map<string, SettingsSectionRegistration>();
	private changeListeners = new Set<() => void>();

	/**
	 * Register a settings section.
	 *
	 * @param section - The section registration
	 * @returns Unsubscribe function
	 * @throws Error if section ID already registered
	 */
	register(section: SettingsSectionRegistration): Unsubscribe {
		if (this.sections.has(section.id)) {
			throw new Error(`Settings section already registered: ${section.id}`);
		}
		this.sections.set(section.id, section);
		this.notifyChange();

		return () => {
			this.sections.delete(section.id);
			this.notifyChange();
		};
	}

	/**
	 * Get all sections sorted by priority.
	 */
	getAll(): SettingsSectionRegistration[] {
		return Array.from(this.sections.values()).sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Get a section by ID.
	 */
	get(id: string): SettingsSectionRegistration | undefined {
		return this.sections.get(id);
	}

	/**
	 * Check if a section is registered.
	 */
	has(id: string): boolean {
		return this.sections.has(id);
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
		this.sections.clear();
		this.notifyChange();
	}

	private notifyChange(): void {
		for (const listener of this.changeListeners) {
			try { listener(); } catch (e) {
				console.error("[SettingsRegistry] Change listener error:", e);
			}
		}
	}
}
