/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CommandRegistry
 * @description Registry for dynamically registered commands.
 *
 * Commands from Pro and third-party plugins are tracked here so they
 * can be cleaned up when the registering plugin unloads.
 *
 * @since 0.1.0
 */

import type { CommandRegistration, Unsubscribe } from "../types";

/**
 * Manages dynamically registered commands.
 */
export class CommandRegistry {
	private commands = new Map<string, CommandRegistration>();
	private changeListeners = new Set<() => void>();

	/**
	 * Register a command.
	 *
	 * @param command - The command registration
	 * @returns Unsubscribe function
	 * @throws Error if command ID already registered
	 */
	register(command: CommandRegistration): Unsubscribe {
		if (this.commands.has(command.id)) {
			throw new Error(`Command already registered: ${command.id}`);
		}
		this.commands.set(command.id, command);
		this.notifyChange();

		return () => {
			this.commands.delete(command.id);
			this.notifyChange();
		};
	}

	/**
	 * Get a command by ID.
	 */
	get(id: string): CommandRegistration | undefined {
		return this.commands.get(id);
	}

	/**
	 * Get all registered commands.
	 */
	getAll(): CommandRegistration[] {
		return Array.from(this.commands.values());
	}

	/**
	 * Check if a command is registered.
	 */
	has(id: string): boolean {
		return this.commands.has(id);
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
		this.commands.clear();
		this.notifyChange();
	}

	private notifyChange(): void {
		for (const listener of this.changeListeners) {
			try { listener(); } catch (e) {
				console.error("[CommandRegistry] Change listener error:", e);
			}
		}
	}
}
