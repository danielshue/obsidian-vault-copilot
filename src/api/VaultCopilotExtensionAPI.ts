/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VaultCopilotExtensionAPIImpl
 * @description Implementation of the Torqena Extension API.
 *
 * This class bridges the registries with the plugin instance, providing
 * the full `VaultCopilotExtensionAPI` surface that Pro and third-party
 * plugins consume via `app.plugins.getPlugin('obsidian-vault-copilot')?.api`.
 *
 * @since 0.1.0
 */

import type {
	VaultCopilotExtensionAPI,
	ToolProvider,
	AIProviderRegistration,
	ContextProviderRegistration,
	SettingsSectionRegistration,
	ViewRegistration,
	CommandRegistration,
	RenderExtension,
	StatusBarRegistration,
	SettingsChangeEvent,
	SessionChangeEvent,
	MessageEvent,
	ProviderChangeEvent,
	SessionCreateOptions,
	Unsubscribe,
} from "./types";

import {
	ToolRegistry,
	ProviderRegistry,
	ViewRegistry,
	SettingsRegistry,
	RenderRegistry,
	CommandRegistry,
	ContextRegistry,
} from "./registries";

/**
 * Options for creating the Extension API implementation.
 */
export interface ExtensionAPIOptions {
	/** Delegate for existing API methods (connect, sendMessage, sessions, etc.) */
	delegate: VaultCopilotExtensionAPIDelegate;
}

/**
 * Delegate that the hosting plugin (Basic) provides for existing API methods.
 *
 * These are the methods that Basic implements directly (connection, messaging,
 * sessions). The Extension API wraps them alongside registry-based features.
 */
export interface VaultCopilotExtensionAPIDelegate {
	isConnected(): boolean;
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	sendMessage(prompt: string): Promise<string>;
	sendMessageStreaming(
		prompt: string,
		onDelta: (delta: string) => void,
		onComplete?: (fullContent: string) => void,
	): Promise<void>;
	getMessageHistory(): Array<{ role: string; content: string }>;
	clearHistory(): Promise<void>;
	listSessions(): Promise<Array<{ id: string; name: string; messageCount: number; archived: boolean }>>;
	getActiveSessionId(): string | null;
	createSession(name?: string, options?: SessionCreateOptions): Promise<{ id: string; name: string }>;
	loadSession(sessionId: string): Promise<void>;
	archiveSession(sessionId: string): Promise<void>;
	deleteSession(sessionId: string): Promise<void>;
	renameSession(sessionId: string, newName: string): Promise<void>;
	getSettings(): Record<string, unknown>;
	updateSettings(partial: Record<string, unknown>): Promise<void>;
}

/**
 * Event emitter for Extension API events (settings, session, message, provider changes).
 */
class EventBus<T> {
	private listeners = new Set<(event: T) => void>();

	on(listener: (event: T) => void): Unsubscribe {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	emit(event: T): void {
		for (const listener of this.listeners) {
			try { listener(event); } catch (e) {
				console.error("[ExtensionAPI] Event listener error:", e);
			}
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}

/**
 * Full implementation of the Extension API.
 *
 * Combines delegate-based existing API methods with registry-based
 * extension registration.
 */
export class VaultCopilotExtensionAPIImpl implements VaultCopilotExtensionAPI {
	// Registries
	readonly toolRegistry = new ToolRegistry();
	readonly providerRegistry = new ProviderRegistry();
	readonly viewRegistry = new ViewRegistry();
	readonly settingsRegistry = new SettingsRegistry();
	readonly renderRegistry = new RenderRegistry();
	readonly commandRegistry = new CommandRegistry();
	readonly contextRegistry = new ContextRegistry();

	// Event buses
	readonly settingsEvents = new EventBus<SettingsChangeEvent>();
	readonly sessionEvents = new EventBus<SessionChangeEvent>();
	readonly messageEvents = new EventBus<MessageEvent>();
	readonly providerEvents = new EventBus<ProviderChangeEvent>();

	// Status bar items
	private statusBarItems = new Map<string, StatusBarRegistration>();

	private delegate: VaultCopilotExtensionAPIDelegate;

	constructor(options: ExtensionAPIOptions) {
		this.delegate = options.delegate;
	}

	// ===== Existing API (delegated) =====

	isConnected(): boolean { return this.delegate.isConnected(); }
	connect(): Promise<void> { return this.delegate.connect(); }
	disconnect(): Promise<void> { return this.delegate.disconnect(); }
	sendMessage(prompt: string): Promise<string> { return this.delegate.sendMessage(prompt); }
	sendMessageStreaming(prompt: string, onDelta: (delta: string) => void, onComplete?: (fullContent: string) => void): Promise<void> {
		return this.delegate.sendMessageStreaming(prompt, onDelta, onComplete);
	}
	getMessageHistory(): Array<{ role: string; content: string }> { return this.delegate.getMessageHistory(); }
	clearHistory(): Promise<void> { return this.delegate.clearHistory(); }
	listSessions() { return this.delegate.listSessions(); }
	getActiveSessionId() { return this.delegate.getActiveSessionId(); }
	createSession(name?: string, options?: SessionCreateOptions) {
		return options === undefined
			? this.delegate.createSession(name)
			: this.delegate.createSession(name, options);
	}
	loadSession(sessionId: string) { return this.delegate.loadSession(sessionId); }
	archiveSession(sessionId: string) { return this.delegate.archiveSession(sessionId); }
	deleteSession(sessionId: string) { return this.delegate.deleteSession(sessionId); }
	renameSession(sessionId: string, newName: string) { return this.delegate.renameSession(sessionId, newName); }

	// ===== Extension registration =====

	registerToolProvider(provider: ToolProvider): Unsubscribe {
		return this.toolRegistry.register(provider);
	}

	registerAIProvider(registration: AIProviderRegistration): Unsubscribe {
		return this.providerRegistry.register(registration);
	}

	registerContextProvider(provider: ContextProviderRegistration): Unsubscribe {
		return this.contextRegistry.register(provider);
	}

	registerSettingsSection(section: SettingsSectionRegistration): Unsubscribe {
		return this.settingsRegistry.register(section);
	}

	registerView(registration: ViewRegistration): Unsubscribe {
		return this.viewRegistry.register(registration);
	}

	registerCommand(command: CommandRegistration): Unsubscribe {
		return this.commandRegistry.register(command);
	}

	registerRenderExtension(extension: RenderExtension): Unsubscribe {
		return this.renderRegistry.register(extension);
	}

	registerStatusBarItem(config: StatusBarRegistration): Unsubscribe {
		if (this.statusBarItems.has(config.id)) {
			throw new Error(`Status bar item already registered: ${config.id}`);
		}
		this.statusBarItems.set(config.id, config);

		return () => {
			this.statusBarItems.delete(config.id);
		};
	}

	// ===== Events =====

	onSettingsChange(listener: (event: SettingsChangeEvent) => void): Unsubscribe {
		return this.settingsEvents.on(listener);
	}

	onSessionChange(listener: (event: SessionChangeEvent) => void): Unsubscribe {
		return this.sessionEvents.on(listener);
	}

	onMessage(listener: (event: MessageEvent) => void): Unsubscribe {
		return this.messageEvents.on(listener);
	}

	onProviderChange(listener: (event: ProviderChangeEvent) => void): Unsubscribe {
		return this.providerEvents.on(listener);
	}

	// ===== Settings access =====

	getSettings(): Record<string, unknown> {
		return this.delegate.getSettings();
	}

	updateSettings(partial: Record<string, unknown>): Promise<void> {
		return this.delegate.updateSettings(partial);
	}

	// ===== Lifecycle =====

	/**
	 * Clear all registrations and event listeners.
	 * Called when the hosting plugin unloads.
	 */
	destroy(): void {
		this.toolRegistry.clear();
		this.providerRegistry.clear();
		this.viewRegistry.clear();
		this.settingsRegistry.clear();
		this.renderRegistry.clear();
		this.commandRegistry.clear();
		this.contextRegistry.clear();
		this.statusBarItems.clear();
		this.settingsEvents.clear();
		this.sessionEvents.clear();
		this.messageEvents.clear();
		this.providerEvents.clear();
	}
}
