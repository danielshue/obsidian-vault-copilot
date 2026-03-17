/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ExtensionAPITypes
 * @description Shared type definitions for the Torqena Extension API.
 *
 * These types define the contract between Basic and Pro plugins (and any
 * third-party plugins). Basic exposes `VaultCopilotExtensionAPI` via its
 * `api` property; Pro (and others) register capabilities through it.
 *
 * @example
 * ```typescript
 * // From a Pro or third-party plugin
 * const basic = app.plugins.getPlugin('obsidian-vault-copilot');
 * const api = basic?.api as VaultCopilotExtensionAPI;
 * const unsub = api.registerToolProvider(myTools, myHandler);
 * // On unload:
 * unsub();
 * ```
 *
 * @since 0.1.0
 */

import type { App, WorkspaceLeaf } from "obsidian";

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

/** Cleanup function returned by all registration methods. */
export type Unsubscribe = () => void;

/** Supported AI provider types. */
export type AIProviderType = "copilot" | "openai" | "azure-openai" | "custom";

// ---------------------------------------------------------------------------
// Tool Provider
// ---------------------------------------------------------------------------

/**
 * JSON Schema definition for a tool parameter.
 *
 * Follows the JSON Schema subset used by OpenAI / Copilot SDK tool definitions.
 */
export interface ToolParameterSchema {
	type: "object";
	properties: Record<string, {
		type: string;
		description?: string;
		enum?: string[];
		items?: Record<string, unknown>;
		default?: unknown;
	}>;
	required?: string[];
}

/**
 * A single tool definition that can be registered with the Extension API.
 */
export interface ToolDefinition {
	/** Unique tool name (snake_case recommended) */
	name: string;
	/** Human-readable description shown to the AI */
	description: string;
	/** JSON Schema for the tool's parameters */
	parameters: ToolParameterSchema;
	/** Optional category for grouping in UI */
	category?: string;
}

/**
 * Handler function invoked when the AI calls a registered tool.
 *
 * @param toolName - The name of the tool being invoked
 * @param args - Parsed arguments matching the tool's parameter schema
 * @returns Result object or string to return to the AI
 */
export type ToolHandler = (
	toolName: string,
	args: Record<string, unknown>,
) => Promise<unknown>;

/**
 * A tool provider bundles one or more tool definitions with a shared handler.
 */
export interface ToolProvider {
	/** Unique provider ID (typically the plugin ID) */
	id: string;
	/** Tool definitions to register */
	tools: ToolDefinition[];
	/** Handler called when any of these tools are invoked */
	handler: ToolHandler;
}

// ---------------------------------------------------------------------------
// AI Provider
// ---------------------------------------------------------------------------

/**
 * Capabilities an AI provider supports.
 */
export interface AIProviderCapabilities {
	streaming: boolean;
	toolCalling: boolean;
	vision?: boolean;
	audio?: boolean;
}

/**
 * Registration for an AI provider (e.g., OpenAI, Azure OpenAI).
 */
export interface AIProviderRegistration {
	/** Unique provider ID */
	id: string;
	/** Display name */
	name: string;
	/** Provider type */
	type: AIProviderType;
	/** Provider capabilities */
	capabilities: AIProviderCapabilities;
	/** Factory to create a provider instance */
	factory: (app: App, config: Record<string, unknown>) => unknown;
}

// ---------------------------------------------------------------------------
// Context Provider
// ---------------------------------------------------------------------------

/**
 * A context provider augments the system prompt with additional context.
 *
 * Providers are called in priority order (lower = earlier).
 */
export interface ContextProviderRegistration {
	/** Unique provider ID */
	id: string;
	/** Display name */
	name: string;
	/** Execution priority (lower = called first, default 100) */
	priority: number;
	/**
	 * Produce context text to include in the system prompt.
	 *
	 * @param app - The Obsidian App instance
	 * @returns Context string (or empty to skip)
	 */
	provider: (app: App) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Settings Section
// ---------------------------------------------------------------------------

/**
 * Registration for a settings section that appears in the Torqena settings tab.
 */
export interface SettingsSectionRegistration {
	/** Unique section ID */
	id: string;
	/** Section display title */
	title: string;
	/** Icon name (Lucide icon) */
	icon?: string;
	/** Display priority (lower = shown first) */
	priority: number;
	/**
	 * Render the section into its container element.
	 *
	 * @param containerEl - DOM element to render into
	 * @param ctx - Settings context with app, plugin, and redraw callback
	 */
	render: (containerEl: HTMLElement, ctx: { app: App; plugin: unknown; display: () => void }) => void;
}

// ---------------------------------------------------------------------------
// View Registration
// ---------------------------------------------------------------------------

/**
 * Registration for a workspace view.
 */
export interface ViewRegistration {
	/** Unique view type identifier */
	viewType: string;
	/** Display text shown in tab */
	displayText: string;
	/** Icon name (Lucide icon) */
	icon?: string;
	/**
	 * Factory to create the view instance.
	 *
	 * @param leaf - The workspace leaf to attach the view to
	 * @returns The view instance
	 */
	factory: (leaf: WorkspaceLeaf) => unknown;
}

// ---------------------------------------------------------------------------
// Command Registration
// ---------------------------------------------------------------------------

/**
 * Registration for a command.
 */
export interface CommandRegistration {
	/** Unique command ID (will be prefixed with plugin ID by Obsidian) */
	id: string;
	/** Human-readable command name */
	name: string;
	/** Callback when command is executed */
	callback: () => void | Promise<void>;
	/** Optional hotkey hint */
	hotkey?: string;
}

// ---------------------------------------------------------------------------
// Render Extension
// ---------------------------------------------------------------------------

/** Types of render extensions. */
export type RenderExtensionType = "math" | "mermaid" | "highlight" | "custom";

/**
 * A render extension that post-processes rendered markdown.
 */
export interface RenderExtension {
	/** Unique extension ID */
	id: string;
	/** Extension type for ordering */
	type: RenderExtensionType;
	/** Execution priority (lower = runs first) */
	priority: number;
	/**
	 * Process the rendered HTML element.
	 *
	 * @param el - The container element with rendered markdown
	 * @returns The processed element (may be the same or a replacement)
	 */
	process: (el: HTMLElement) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Status Bar
// ---------------------------------------------------------------------------

/**
 * Registration for a status bar item.
 */
export interface StatusBarRegistration {
	/** Unique item ID */
	id: string;
	/** Priority for ordering (lower = further left) */
	priority: number;
	/**
	 * Render the status bar content.
	 *
	 * @param el - The status bar item element
	 */
	render: (el: HTMLElement) => void;
	/** Optional click handler */
	onClick?: () => void;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** Settings change event. */
export interface SettingsChangeEvent {
	/** Keys that changed */
	changedKeys: string[];
}

/** Session change event. */
export interface SessionChangeEvent {
	/** Type of change */
	type: "created" | "loaded" | "archived" | "deleted" | "renamed";
	/** Session ID affected */
	sessionId: string;
}

/** Message event. */
export interface MessageEvent {
	/** Message role */
	role: "user" | "assistant" | "system";
	/** Message content */
	content: string;
	/** Session ID */
	sessionId: string;
}

/** Provider change event. */
export interface ProviderChangeEvent {
	/** Previous provider ID */
	previousId: string | null;
	/** New provider ID */
	newId: string;
}

// ---------------------------------------------------------------------------
// Extension API — the main contract
// ---------------------------------------------------------------------------

/**
 * The Extension API that Basic exposes for Pro and third-party plugins.
 *
 * All registration methods return an {@link Unsubscribe} function that
 * removes the registration and cleans up resources.
 */
export interface VaultCopilotExtensionAPI {
	// ===== Existing API (connection & messaging) =====

	/** Check if the AI service is connected and ready */
	isConnected(): boolean;
	/** Connect to the active AI provider */
	connect(): Promise<void>;
	/** Disconnect from the active AI provider */
	disconnect(): Promise<void>;
	/** Send a message and wait for the complete response */
	sendMessage(prompt: string): Promise<string>;
	/** Send a message with streaming response */
	sendMessageStreaming(
		prompt: string,
		onDelta: (delta: string) => void,
		onComplete?: (fullContent: string) => void,
	): Promise<void>;
	/** Get message history from the current session */
	getMessageHistory(): Array<{ role: string; content: string }>;
	/** Clear the current chat history */
	clearHistory(): Promise<void>;

	// ===== Session management =====

	/** List all sessions */
	listSessions(): Promise<Array<{ id: string; name: string; messageCount: number; archived: boolean }>>;
	/** Get the active session ID */
	getActiveSessionId(): string | null;
	/** Create a new session */
	createSession(name?: string): Promise<{ id: string; name: string }>;
	/** Load a session by ID */
	loadSession(sessionId: string): Promise<void>;
	/** Archive a session */
	archiveSession(sessionId: string): Promise<void>;
	/** Delete a session */
	deleteSession(sessionId: string): Promise<void>;
	/** Rename a session */
	renameSession(sessionId: string, newName: string): Promise<void>;

	// ===== Extension registration (NEW) =====

	/** Register one or more tools with a shared handler */
	registerToolProvider(provider: ToolProvider): Unsubscribe;
	/** Register an AI provider */
	registerAIProvider(registration: AIProviderRegistration): Unsubscribe;
	/** Register a context provider for system prompt augmentation */
	registerContextProvider(provider: ContextProviderRegistration): Unsubscribe;
	/** Register a settings section */
	registerSettingsSection(section: SettingsSectionRegistration): Unsubscribe;
	/** Register a workspace view */
	registerView(registration: ViewRegistration): Unsubscribe;
	/** Register a command */
	registerCommand(command: CommandRegistration): Unsubscribe;
	/** Register a render extension (e.g., KaTeX, Mermaid) */
	registerRenderExtension(extension: RenderExtension): Unsubscribe;
	/** Register a status bar item */
	registerStatusBarItem(config: StatusBarRegistration): Unsubscribe;

	// ===== Events (NEW) =====

	/** Subscribe to settings changes */
	onSettingsChange(listener: (event: SettingsChangeEvent) => void): Unsubscribe;
	/** Subscribe to session changes */
	onSessionChange(listener: (event: SessionChangeEvent) => void): Unsubscribe;
	/** Subscribe to messages */
	onMessage(listener: (event: MessageEvent) => void): Unsubscribe;
	/** Subscribe to provider changes */
	onProviderChange(listener: (event: ProviderChangeEvent) => void): Unsubscribe;

	// ===== Settings access (NEW) =====

	/** Get the current plugin settings (read-only copy) */
	getSettings(): Record<string, unknown>;
	/** Update settings (partial merge) */
	updateSettings(partial: Record<string, unknown>): Promise<void>;
}
