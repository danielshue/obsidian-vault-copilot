// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module AIProvider
 * @description Abstract base class and interfaces for AI chat providers in Vault Copilot.
 *
 * This module provides the foundational abstraction layer for integrating multiple
 * AI providers (GitHub Copilot CLI, OpenAI, Azure OpenAI) into the plugin.
 *
 * ## Architecture
 *
 * ```
 * AIProvider (abstract)
 *   ├── GitHubCopilotCliService (provider: 'copilot')
 *   ├── OpenAIService (provider: 'openai')
 *   └── AzureOpenAIService (provider: 'azure-openai')
 * ```
 *
 * ## Key Features
 *
 * - Unified interface for all AI providers
 * - Streaming and non-streaming message support
 * - Tool/function calling integration with MCP servers
 * - Message history management
 * - Vault operations tool definitions
 *
 * ## Usage
 *
 * ```typescript
 * import { AIProviderFactory } from './AIProviderFactory';
 *
 * const provider = AIProviderFactory.create(app, {
 *   provider: 'openai',
 *   model: 'gpt-4o',
 *   streaming: true,
 * });
 *
 * await provider.initialize();
 * const response = await provider.sendMessage('Hello!');
 * ```
 *
 * @see {@link AIProviderFactory} for creating provider instances
 * @see {@link GitHubCopilotCliService} for Copilot implementation
 * @see {@link OpenAIService} for OpenAI implementation
 * @see {@link AzureOpenAIService} for Azure OpenAI implementation
 * @since 0.0.1
 */

import { App } from "obsidian";
import { ChatMessage } from "./GitHubCopilotCliService";
import { McpManager } from "../mcp/McpManager";
import * as VaultOps from "../tools/VaultOperations";
import type {
	ReadNoteResult,
	SearchNotesResult,
	GetActiveNoteResult,
	OpenNoteResult,
	OpenDailyNoteResult,
	OpenPeriodicNoteResult,
	ListNotesResult,
	ListNotesRecursivelyResult,
	WriteResult,
	FindReplaceResult,
	RecentChangesResult,
	PatchNoteResult,
	PatchOperation,
	PatchTargetType,
	GetDailyNoteResult,
	PeriodicNoteGranularity,
	FetchWebPageResult,
	WebSearchResult,
} from "../tools/VaultOperations";
import type { PeriodicNotesSettings } from "../../ui/settings";

export type AIProviderType = "copilot" | "openai" | "azure-openai";

export interface AIProviderConfig {
	/** Provider type */
	provider: AIProviderType;
	/** Model to use */
	model: string;
	/** Enable streaming responses */
	streaming: boolean;
	/** System prompt/message */
	systemMessage?: string;
	/** MCP Manager for MCP server tools (optional) */
	mcpManager?: McpManager;
}

export interface OpenAIProviderConfig extends AIProviderConfig {
	provider: "openai";
	/** OpenAI API key (optional if OPENAI_API_KEY env var is set) */
	apiKey?: string;
	/** OpenAI API base URL (for Azure or custom endpoints) */
	baseURL?: string;
	/** Organization ID (optional) */
	organization?: string;
	/** Max tokens for completion */
	maxTokens?: number;
	/** Temperature (0-2) */
	temperature?: number;
}

export interface CopilotProviderConfig extends AIProviderConfig {
	provider: "copilot";
	/** Path to Copilot CLI */
	cliPath?: string;
	/** URL for Copilot CLI */
	cliUrl?: string;
}

export interface AzureOpenAIProviderConfig extends AIProviderConfig {
	provider: "azure-openai";
	/** Azure OpenAI API key */
	apiKey: string;
	/** Azure OpenAI endpoint (e.g., https://your-resource.openai.azure.com) */
	endpoint: string;
	/** Deployment name for the model */
	deploymentName: string;
	/** API version (optional, defaults to 2024-08-01-preview) */
	apiVersion?: string;
	/** Max tokens for completion */
	maxTokens?: number;
	/** Temperature (0-2) */
	temperature?: number;
}

/**
 * Callback functions for handling streaming AI responses.
 *
 * @example
 * ```typescript
 * const callbacks: StreamingCallbacks = {
 *   onDelta: (delta) => appendToUI(delta),
 *   onComplete: (fullContent) => console.log('Done:', fullContent.length, 'chars'),
 *   onError: (error) => console.error('Stream error:', error),
 * };
 *
 * await provider.sendMessageStreaming('Tell me a story', callbacks);
 * ```
 */
export interface StreamingCallbacks {
	/** Called for each chunk of streamed content */
	onDelta: (delta: string) => void;
	/** Called when the stream completes successfully */
	onComplete?: (fullContent: string) => void;
	/** Called if an error occurs during streaming */
	onError?: (error: Error) => void;
}

/**
 * Defines a tool that can be called by the AI model.
 *
 * Tools enable the AI to perform actions like reading notes, searching the vault,
 * or calling MCP server functions.
 *
 * @example
 * ```typescript
 * const readNoteTool: ToolDefinition = {
 *   name: 'read_note',
 *   description: 'Read the contents of a note from the vault',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       path: { type: 'string', description: 'Path to the note' },
 *     },
 *     required: ['path'],
 *   },
 *   handler: async (args) => {
 *     return await VaultOps.readNote(app, args.path as string);
 *   },
 * };
 * ```
 *
 * @see {@link VaultOperations} for built-in vault tool implementations
 */
export interface ToolDefinition {
	/** Unique identifier for the tool */
	name: string;
	/** Human-readable description of what the tool does */
	description: string;
	/** JSON Schema defining the tool's input parameters */
	parameters: Record<string, unknown>;
	/** Async function that executes the tool with given arguments */
	handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Abstract base class for AI chat providers.
 *
 * Concrete implementations must provide:
 * - `initialize()` - Set up connection to the AI service
 * - `sendMessage()` - Send a prompt and receive complete response
 * - `sendMessageStreaming()` - Send a prompt and receive streamed response
 * - `abort()` - Cancel the current operation
 * - `isReady()` - Check if provider is connected and ready
 * - `destroy()` - Clean up resources
 *
 * @example
 * ```typescript
 * class MyProvider extends AIProvider {
 *   async initialize(): Promise<void> {
 *     // Connect to service
 *   }
 *
 *   async sendMessage(prompt: string): Promise<string> {
 *     // Implementation
 *   }
 *
 *   // ...other abstract methods
 * }
 * ```
 *
 * @see {@link OpenAIService} for a reference implementation
 */
export abstract class AIProvider {
	/** Obsidian App instance for vault access */
	protected app: App;
	/** Provider configuration */
	protected config: AIProviderConfig;
	/** Conversation message history */
	protected messageHistory: ChatMessage[] = [];
	/** Available tool definitions */
	protected tools: ToolDefinition[] = [];
	/** System prompt prepended to conversations */
	protected systemPrompt: string = "";

	constructor(app: App, config: AIProviderConfig) {
		this.app = app;
		this.config = config;
	}

	/**
	 * Initialize the provider
	 */
	abstract initialize(): Promise<void>;

	/**
	 * Send a message and wait for complete response
	 */
	abstract sendMessage(prompt: string): Promise<string>;

	/**
	 * Send a message with streaming response
	 */
	abstract sendMessageStreaming(
		prompt: string,
		callbacks: StreamingCallbacks
	): Promise<void>;

	/**
	 * Abort the current operation
	 */
	abstract abort(): Promise<void>;

	/**
	 * Check if the provider is connected/ready
	 */
	abstract isReady(): boolean;

	/**
	 * Clean up resources
	 */
	abstract destroy(): Promise<void>;

	/**
	 * Set the system prompt
	 */
	setSystemPrompt(prompt: string): void {
		this.systemPrompt = prompt;
	}

	/**
	 * Set available tools
	 */
	setTools(tools: ToolDefinition[]): void {
		this.tools = tools;
	}

	/**
	 * Get message history
	 */
	getMessageHistory(): ChatMessage[] {
		return [...this.messageHistory];
	}

	/**
	 * Clear message history
	 */
	clearHistory(): void {
		this.messageHistory = [];
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<AIProviderConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get the provider type
	 */
	getProviderType(): AIProviderType {
		return this.config.provider;
	}

	/**
	 * Get the current model
	 */
	getModel(): string {
		return this.config.model;
	}

	/**
	 * Get MCP manager if configured
	 */
	getMcpManager(): McpManager | undefined {
		return this.config.mcpManager;
	}

	/**
	 * Convert MCP tools to ToolDefinition format for use with the provider
	 */
	protected convertMcpToolsToToolDefinitions(): ToolDefinition[] {
		if (!this.config.mcpManager) {
			return [];
		}

		const mcpTools = this.config.mcpManager.getAllTools();
		const toolDefinitions: ToolDefinition[] = [];

		for (const mcpToolWrapper of mcpTools) {
			const mcpTool = mcpToolWrapper.tool;
			toolDefinitions.push({
				name: mcpTool.name,
				description: mcpTool.description || "",
				parameters: mcpTool.inputSchema || { type: "object", properties: {} },
				handler: async (args: Record<string, unknown>) => {
					try {
						const result = await this.config.mcpManager!.callTool(
							mcpToolWrapper.serverId,
							mcpTool.name,
							args
						);
						return result;
					} catch (error) {
						console.error(`[AIProvider] MCP tool execution error (${mcpTool.name}):`, error);
						return { error: error instanceof Error ? error.message : String(error) };
					}
				},
			});
		}

		return toolDefinitions;
	}

	protected addToHistory(role: "user" | "assistant", content: string): void {
		this.messageHistory.push({
			role,
			content,
			timestamp: new Date(),
		});
	}

	// ===========================================================================
	// Vault Operations - Delegated to VaultOperations module
	// ===========================================================================

	/**
	 * Read a note from the vault
	 */
	protected async readNote(path: string): Promise<ReadNoteResult> {
		return VaultOps.readNote(this.app, path);
	}

	/**
	 * Search notes by query
	 */
	protected async searchNotes(query: string, limit = 10): Promise<SearchNotesResult> {
		return VaultOps.searchNotes(this.app, query, limit);
	}

	/**
	 * Get the currently active note
	 */
	protected async getActiveNote(): Promise<GetActiveNoteResult> {
		return VaultOps.getActiveNote(this.app);
	}

	/**
	 * Open a note in the editor
	 */
	protected async openNote(path: string): Promise<OpenNoteResult> {
		return VaultOps.openNote(this.app, path);
	}

	/**
	 * Open a daily note for a specific date
	 */
	protected async openDailyNote(
		dateInput: string,
		createIfMissing = true
	): Promise<OpenDailyNoteResult> {
		return VaultOps.openDailyNote(this.app, dateInput, createIfMissing);
	}

	/**
	 * Open a periodic note (weekly, monthly, quarterly, yearly)
	 */
	protected async openPeriodicNote(
		periodExpression: string,
		granularity: PeriodicNoteGranularity,
		settings?: PeriodicNotesSettings,
		createIfMissing = true
	): Promise<OpenPeriodicNoteResult> {
		return VaultOps.openPeriodicNote(this.app, periodExpression, granularity, settings, createIfMissing);
	}

	/**
	 * List notes in a folder (non-recursive)
	 */
	protected async listNotes(folder?: string, limit = 100): Promise<ListNotesResult> {
		return VaultOps.listNotes(this.app, folder, limit);
	}

	/**
	 * List notes recursively
	 */
	protected async listNotesRecursively(folder?: string, limit = 200): Promise<ListNotesRecursivelyResult> {
		return VaultOps.listNotesRecursively(this.app, folder, limit);
	}

	/**
	 * Create a new note
	 */
	protected async createNote(path: string, content: string): Promise<WriteResult> {
		return VaultOps.createNote(this.app, path, content);
	}

	/**
	 * Append content to a note
	 */
	protected async appendToNote(path: string, content: string): Promise<WriteResult> {
		return VaultOps.appendToNote(this.app, path, content);
	}

	/**
	 * Update a note with new content (replaces entire content)
	 */
	protected async updateNote(path: string, content: string): Promise<WriteResult> {
		return VaultOps.updateNote(this.app, path, content);
	}

	/**
	 * Delete a note (moves to trash)
	 */
	protected async deleteNote(path: string): Promise<WriteResult> {
		return VaultOps.deleteNote(this.app, path);
	}

	/**
	 * Rename/move a note
	 */
	protected async renameNote(oldPath: string, newPath: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
		return VaultOps.renameNote(this.app, oldPath, newPath);
	}

	/**
	 * Find and replace text in a note
	 */
	protected async findAndReplaceInNote(path: string, find: string, replace: string): Promise<FindReplaceResult> {
		return VaultOps.findAndReplaceInNote(this.app, path, find, replace);
	}

	/**
	 * Get recently changed files
	 */
	protected async getRecentChanges(limit = 10): Promise<RecentChangesResult> {
		return VaultOps.getRecentChanges(this.app, limit);
	}

	/**
	 * Patch a note (insert content at specific location)
	 */
	protected async patchNote(
		path: string,
		operation: PatchOperation,
		targetType: PatchTargetType,
		target: string | undefined,
		content: string
	): Promise<PatchNoteResult> {
		return VaultOps.patchNote(this.app, path, operation, targetType, target, content);
	}

	/**
	 * Get a daily note for a specific date (read-only)
	 */
	protected async getDailyNote(date?: string): Promise<GetDailyNoteResult> {
		return VaultOps.getDailyNote(this.app, date);
	}

	/**
	 * Fetch a web page
	 */
	protected async fetchWebPage(url: string): Promise<FetchWebPageResult> {
		return VaultOps.fetchWebPage(url);
	}

	/**
	 * Search the web
	 */
	protected async webSearch(query: string, limit = 5): Promise<WebSearchResult> {
		return VaultOps.webSearch(query, limit);
	}
}

/**
 * Available OpenAI models
 */
export const OPENAI_MODELS = [
	// GPT-4 models
	{ value: "gpt-4o", name: "GPT-4o", description: "Most capable GPT-4 model" },
	{ value: "gpt-4o-mini", name: "GPT-4o Mini", description: "Affordable small model" },
	{ value: "gpt-4-turbo", name: "GPT-4 Turbo", description: "Latest GPT-4 Turbo" },
	{ value: "gpt-4", name: "GPT-4", description: "Original GPT-4" },
	// GPT-3.5 models
	{ value: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "Fast and affordable" },
	// o1 reasoning models
	{ value: "o1", name: "o1", description: "Complex reasoning model" },
	{ value: "o1-mini", name: "o1-mini", description: "Fast reasoning model" },
	{ value: "o1-preview", name: "o1 Preview", description: "Preview reasoning model" },
	// o3 models (if available)
	{ value: "o3-mini", name: "o3-mini", description: "Efficient reasoning" },
];

/**
 * Get API key from config or environment (desktop only)
 * On desktop: checks config, then environment variables
 * On mobile: only checks config (no process.env available)
 */
export function getOpenAIApiKey(configKey?: string): string | undefined {
	// First check config
	if (configKey) {
		return configKey;
	}
	
	// On desktop, fallback to environment variables
	// This check ensures we don't break on mobile where process is unavailable
	if (typeof process !== "undefined" && process.env) {
		return process.env.OPENAI_API_KEY;
	}
	
	return undefined;
}
