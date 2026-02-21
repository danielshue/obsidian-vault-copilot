/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import type { QuestionRequest, QuestionResponse } from "../../types/questions";
import { TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_JSON_SCHEMAS } from "../tools/ToolDefinitions";
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

/**
 * Supported AI provider identifiers.
 *
 * - `copilot`: GitHub Copilot CLI SDK provider
 * - `openai`: OpenAI Chat Completions provider
 * - `azure-openai`: Azure OpenAI Chat Completions provider
 */
export type AIProviderType = "copilot" | "openai" | "azure-openai";

/**
 * Base configuration shared by all provider implementations.
 */
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

/**
 * Configuration for the OpenAI provider implementation.
 */
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

/**
 * Configuration for the GitHub Copilot CLI provider implementation.
 */
export interface CopilotProviderConfig extends AIProviderConfig {
	provider: "copilot";
	/** Path to Copilot CLI */
	cliPath?: string;
	/** URL for Copilot CLI */
	cliUrl?: string;
}

/**
 * Configuration for the Azure OpenAI provider implementation.
 */
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
	/** Callback for handling question requests from the AI */
	protected questionCallback: ((question: QuestionRequest) => Promise<QuestionResponse | null>) | null = null;

	/**
	 * Create a new abstract provider wrapper.
	 *
	 * @param app - Obsidian app instance used by vault operation tools
	 * @param config - Initial provider configuration
	 *
	 * @example
	 * ```typescript
	 * const provider = new OpenAIService(app, {
	 *   provider: "openai",
	 *   model: "gpt-4o",
	 *   streaming: true,
	 * });
	 * ```
	 */
	constructor(app: App, config: AIProviderConfig) {
		this.app = app;
		this.config = config;
	}

	/**
	 * Initialize the provider connection and any required resources.
	 *
	 * @returns Resolves when the provider is ready to send messages
	 *
	 * @example
	 * ```typescript
	 * await provider.initialize();
	 * ```
	 */
	abstract initialize(): Promise<void>;

	/**
	 * Send a message and wait for the complete response.
	 *
	 * @param prompt - User prompt text
	 * @returns Full assistant response text
	 *
	 * @example
	 * ```typescript
	 * const reply = await provider.sendMessage("Summarize this note");
	 * ```
	 */
	abstract sendMessage(prompt: string): Promise<string>;

	/**
	 * Send a message with a streaming response.
	 *
	 * @param prompt - User prompt text
	 * @param callbacks - Streaming lifecycle callbacks
	 * @returns Resolves when streaming is complete
	 *
	 * @example
	 * ```typescript
	 * await provider.sendMessageStreaming("Draft release notes", {
	 *   onDelta: (chunk) => appendToUI(chunk),
	 *   onComplete: (full) => renderMarkdown(full),
	 * });
	 * ```
	 */
	abstract sendMessageStreaming(
		prompt: string,
		callbacks: StreamingCallbacks
	): Promise<void>;

	/**
	 * Abort the current in-flight request.
	 *
	 * @returns Resolves when cancellation is requested
	 *
	 * @example
	 * ```typescript
	 * await provider.abort();
	 * ```
	 */
	abstract abort(): Promise<void>;

	/**
	 * Check whether the provider is connected and ready.
	 *
	 * @returns `true` when ready to accept requests, otherwise `false`
	 *
	 * @example
	 * ```typescript
	 * if (!provider.isReady()) await provider.initialize();
	 * ```
	 */
	abstract isReady(): boolean;

	/**
	 * Destroy provider resources and release connections.
	 *
	 * @returns Resolves when cleanup is complete
	 *
	 * @example
	 * ```typescript
	 * await provider.destroy();
	 * ```
	 */
	abstract destroy(): Promise<void>;

	/**
	 * Set the system prompt prepended to subsequent conversations.
	 *
	 * @param prompt - System instruction text
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * provider.setSystemPrompt("Use concise bullet points.");
	 * ```
	 */
	setSystemPrompt(prompt: string): void {
		this.systemPrompt = prompt;
	}

	/**
	 * Set the active tool definitions available to the provider.
	 *
	 * @param tools - Tool definitions the model may call
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * provider.setTools([readTool, searchTool]);
	 * ```
	 */
	setTools(tools: ToolDefinition[]): void {
		this.tools = tools;
	}

	/**
	 * Set the question callback for asking the user questions via modal UI.
	 * This enables the `ask_question` tool for this provider.
	 * 
	 * @param callback - Function that shows a QuestionModal and returns the user's response
	 * @returns Nothing
	 * 
	 * @example
	 * ```typescript
	 * provider.setQuestionCallback(async (question) => {
	 *   return new Promise((resolve) => {
	 *     const modal = new QuestionModal(app, question, resolve);
	 *     modal.open();
	 *   });
	 * });
	 * ```
	 * 
	 * @since 0.0.17
	 */
	setQuestionCallback(callback: ((question: QuestionRequest) => Promise<QuestionResponse | null>) | null): void {
		this.questionCallback = callback;
	}

	/**
	 * Create a ToolDefinition for the ask_question tool.
	 * Used by OpenAI and Azure OpenAI providers to include ask_question in their tool set.
	 * 
	 * @returns ToolDefinition for ask_question, or null if no question callback is set
	 *
	 * @example
	 * ```typescript
	 * const askQuestionTool = this.createAskQuestionToolDefinition();
	 * if (askQuestionTool) this.setTools([...this.tools, askQuestionTool]);
	 * ```
	 * @internal
	 * @since 0.0.17
	 */
	protected createAskQuestionToolDefinition(): ToolDefinition | null {
		if (!this.questionCallback) {
			return null;
		}

		const callback = this.questionCallback;

		return {
			name: TOOL_NAMES.ASK_QUESTION,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.ASK_QUESTION],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.ASK_QUESTION] as Record<string, unknown>,
			handler: async (args: Record<string, unknown>) => {
				const type = args.type as string;
				const question = args.question as string;
				const context = args.context as string | undefined;
				const options = args.options as string[] | undefined;
				const allowMultiple = args.allowMultiple as boolean | undefined;
				const placeholder = args.placeholder as string | undefined;
				const textLabel = args.textLabel as string | undefined;
				const defaultValue = args.defaultValue as string | undefined;
				const defaultSelected = args.defaultSelected as string[] | undefined;
				const multiline = args.multiline as boolean | undefined;
				const required = args.required as boolean | undefined;

				// Generate unique ID
				const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

				// Build question request based on type
				const questionRequest: QuestionRequest = {
					id,
					type,
					question,
					context,
					required: required !== false,
				} as QuestionRequest;

				// Add type-specific properties
				if (type === "text") {
					(questionRequest as any).placeholder = placeholder;
					(questionRequest as any).defaultValue = defaultValue;
					(questionRequest as any).multiline = multiline || false;
				} else if (type === "multipleChoice") {
					if (!options || options.length === 0) {
						return { success: false, error: "multipleChoice type requires options array" };
					}
					(questionRequest as any).options = options;
					(questionRequest as any).allowMultiple = allowMultiple || false;
					(questionRequest as any).defaultSelected = defaultSelected;
				} else if (type === "radio") {
					if (!options || options.length === 0) {
						return { success: false, error: "radio type requires options array" };
					}
					(questionRequest as any).options = options;
					(questionRequest as any).defaultSelected = defaultSelected?.[0];
				} else if (type === "mixed") {
					if (!options || options.length === 0) {
						return { success: false, error: "mixed type requires options array" };
					}
					(questionRequest as any).options = options;
					(questionRequest as any).allowMultiple = allowMultiple || false;
					(questionRequest as any).defaultSelected = defaultSelected;
					(questionRequest as any).textPlaceholder = placeholder;
					(questionRequest as any).textLabel = textLabel;
				}

				try {
					const response = await callback(questionRequest);

					if (!response) {
						return { success: false, cancelled: true, message: "User cancelled the question" };
					}

					// Format response
					let formattedResponse: string;
					if (response.type === "text") {
						formattedResponse = response.text;
					} else if (response.type === "multipleChoice" || response.type === "radio") {
						formattedResponse = response.selected.join(", ");
					} else if (response.type === "mixed") {
						const parts = [];
						if (response.selected.length > 0) {
							parts.push(`Selected: ${response.selected.join(", ")}`);
						}
						if (response.text) {
							parts.push(`Additional input: ${response.text}`);
						}
						formattedResponse = parts.join("; ");
					} else {
						formattedResponse = JSON.stringify(response);
					}

					return {
						success: true,
						question: question,
						response: formattedResponse,
						responseData: response,
					};
				} catch (error) {
					return {
						success: false,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			},
		};
	}

	/**
	 * Get a defensive copy of message history.
	 *
	 * @returns Array of recorded chat messages
	 *
	 * @example
	 * ```typescript
	 * const history = provider.getMessageHistory();
	 * console.log(history.length);
	 * ```
	 */
	getMessageHistory(): ChatMessage[] {
		return [...this.messageHistory];
	}

	/**
	 * Clear all in-memory message history.
	 *
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * provider.clearHistory();
	 * ```
	 */
	clearHistory(): void {
		this.messageHistory = [];
	}

	/**
	 * Merge and apply partial provider configuration.
	 *
	 * @param config - Partial configuration fields to override
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * provider.updateConfig({ streaming: false });
	 * ```
	 */
	updateConfig(config: Partial<AIProviderConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get the current provider type.
	 *
	 * @returns Provider type discriminator
	 *
	 * @example
	 * ```typescript
	 * if (provider.getProviderType() === "openai") {
	 *   // OpenAI-specific UI behavior
	 * }
	 * ```
	 */
	getProviderType(): AIProviderType {
		return this.config.provider;
	}

	/**
	 * Get the currently configured model name.
	 *
	 * @returns Model identifier string
	 *
	 * @example
	 * ```typescript
	 * console.log(provider.getModel());
	 * ```
	 */
	getModel(): string {
		return this.config.model;
	}

	/**
	 * Get the configured MCP manager, if any.
	 *
	 * @returns MCP manager instance or `undefined` when not configured
	 *
	 * @example
	 * ```typescript
	 * const mcp = provider.getMcpManager();
	 * if (mcp) console.log(mcp.getAllTools().length);
	 * ```
	 */
	getMcpManager(): McpManager | undefined {
		return this.config.mcpManager;
	}

	/**
	 * Convert MCP tools into provider `ToolDefinition` objects.
	 *
	 * Wraps each MCP tool with a uniform async handler that executes
	 * through the configured {@link McpManager} and normalizes errors.
	 *
	 * @returns Tool definitions derived from all registered MCP tools
	 *
	 * @example
	 * ```typescript
	 * const mcpTools = this.convertMcpToolsToToolDefinitions();
	 * this.setTools([...this.tools, ...mcpTools]);
	 * ```
	 *
	 * @internal
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

	/**
	 * Append a message to in-memory history.
	 *
	 * @param role - Message author role
	 * @param content - Message body text
	 * @returns Nothing
	 * @internal
	 */
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
	 * Read a note from the vault.
	 *
	 * @param path - Vault-relative note path
	 * @returns Read operation result from VaultOperations
	 * @internal
	 */
	protected async readNote(path: string): Promise<ReadNoteResult> {
		return VaultOps.readNote(this.app, path);
	}

	/**
	 * Search notes by query.
	 *
	 * @param query - Search query string
	 * @param limit - Maximum result count
	 * @returns Search results from VaultOperations
	 * @internal
	 */
	protected async searchNotes(query: string, limit = 10): Promise<SearchNotesResult> {
		return VaultOps.searchNotes(this.app, query, limit);
	}

	/**
	 * Get the currently active note.
	 *
	 * @returns Active note details or error metadata
	 * @internal
	 */
	protected async getActiveNote(): Promise<GetActiveNoteResult> {
		return VaultOps.getActiveNote(this.app);
	}

	/**
	 * Open a note in the editor.
	 *
	 * @param path - Vault-relative note path
	 * @returns Open operation result
	 * @internal
	 */
	protected async openNote(path: string): Promise<OpenNoteResult> {
		return VaultOps.openNote(this.app, path);
	}

	/**
	 * Open a daily note for a specific date.
	 *
	 * @param dateInput - Date expression (ISO date or natural date string)
	 * @param createIfMissing - Whether to create the note when missing
	 * @returns Daily-note open operation result
	 * @internal
	 */
	protected async openDailyNote(
		dateInput: string,
		createIfMissing = true
	): Promise<OpenDailyNoteResult> {
		return VaultOps.openDailyNote(this.app, dateInput, createIfMissing);
	}

	/**
	 * Open a periodic note (weekly, monthly, quarterly, yearly).
	 *
	 * @param periodExpression - Period expression understood by VaultOperations
	 * @param granularity - Period granularity (week/month/quarter/year)
	 * @param settings - Optional periodic notes settings override
	 * @param createIfMissing - Whether to create the note when missing
	 * @returns Periodic-note open operation result
	 * @internal
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
	 * List notes in a folder (non-recursive).
	 *
	 * @param folder - Optional folder path
	 * @param limit - Maximum number of notes to return
	 * @returns Folder listing result
	 * @internal
	 */
	protected async listNotes(folder?: string, limit = 100): Promise<ListNotesResult> {
		return VaultOps.listNotes(this.app, folder, limit);
	}

	/**
	 * List notes recursively.
	 *
	 * @param folder - Optional root folder path
	 * @param limit - Maximum number of notes to return
	 * @returns Recursive listing result
	 * @internal
	 */
	protected async listNotesRecursively(folder?: string, limit = 200): Promise<ListNotesRecursivelyResult> {
		return VaultOps.listNotesRecursively(this.app, folder, limit);
	}

	/**
	 * Create a new note.
	 *
	 * @param path - Vault-relative target note path
	 * @param content - Initial note content
	 * @returns Write operation result
	 * @internal
	 */
	protected async createNote(path: string, content: string): Promise<WriteResult> {
		return VaultOps.createNote(this.app, path, content);
	}

	/**
	 * Append content to an existing note.
	 *
	 * @param path - Vault-relative note path
	 * @param content - Text to append
	 * @returns Write operation result
	 * @internal
	 */
	protected async appendToNote(path: string, content: string): Promise<WriteResult> {
		return VaultOps.appendToNote(this.app, path, content);
	}

	/**
	 * Replace a note's entire content.
	 *
	 * @param path - Vault-relative note path
	 * @param content - New full note content
	 * @returns Write operation result
	 * @internal
	 */
	protected async updateNote(path: string, content: string): Promise<WriteResult> {
		return VaultOps.updateNote(this.app, path, content);
	}

	/**
	 * Delete a note (move to trash).
	 *
	 * @param path - Vault-relative note path
	 * @returns Delete operation result
	 * @internal
	 */
	protected async deleteNote(path: string): Promise<WriteResult> {
		return VaultOps.deleteNote(this.app, path);
	}

	/**
	 * Rename or move a note.
	 *
	 * @param oldPath - Existing vault-relative path
	 * @param newPath - New vault-relative path
	 * @returns Result with success, newPath, or error
	 * @internal
	 */
	protected async renameNote(oldPath: string, newPath: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
		return VaultOps.renameNote(this.app, oldPath, newPath);
	}

	/**
	 * Find and replace text in a note.
	 *
	 * @param path - Vault-relative note path
	 * @param find - Search string or pattern
	 * @param replace - Replacement string
	 * @returns Find/replace operation result
	 * @internal
	 */
	protected async findAndReplaceInNote(path: string, find: string, replace: string): Promise<FindReplaceResult> {
		return VaultOps.findAndReplaceInNote(this.app, path, find, replace);
	}

	/**
	 * Get recently changed files.
	 *
	 * @param limit - Maximum number of changed files to return
	 * @returns Recent changes result
	 * @internal
	 */
	protected async getRecentChanges(limit = 10): Promise<RecentChangesResult> {
		return VaultOps.getRecentChanges(this.app, limit);
	}

	/**
	 * Patch a note using a structured patch operation.
	 *
	 * @param path - Vault-relative note path
	 * @param operation - Patch operation kind
	 * @param targetType - How the target location is interpreted
	 * @param target - Target anchor value used by the chosen target type
	 * @param content - Content to insert/replace
	 * @returns Patch operation result
	 * @internal
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
	 * Get a daily note for a specific date (read-only).
	 *
	 * @param date - Optional date string; defaults to current date when omitted
	 * @returns Daily note retrieval result
	 * @internal
	 */
	protected async getDailyNote(date?: string): Promise<GetDailyNoteResult> {
		return VaultOps.getDailyNote(this.app, date);
	}

	/**
	 * Fetch a web page.
	 *
	 * @param url - Absolute URL to fetch
	 * @returns Web page fetch result
	 * @internal
	 */
	protected async fetchWebPage(url: string): Promise<FetchWebPageResult> {
		return VaultOps.fetchWebPage(url);
	}

	/**
	 * Search the web.
	 *
	 * @param query - Search query
	 * @param limit - Maximum number of search results
	 * @returns Web search result
	 * @internal
	 */
	protected async webSearch(query: string, limit = 5): Promise<WebSearchResult> {
		return VaultOps.webSearch(query, limit);
	}
}

/**
 * Available OpenAI models for profile setup and model pickers.
 *
 * @see {@link OpenAIProviderConfig.model} for where these model IDs are used
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
 * Resolve the OpenAI API key from explicit config or environment.
 *
 * On desktop: checks `configKey`, then `process.env.OPENAI_API_KEY`.
 * On mobile: only checks `configKey` (no guaranteed `process.env`).
 *
 * @param configKey - API key from settings/profile (highest priority)
 * @returns Resolved API key, or `undefined` when unavailable
 *
 * @example
 * ```typescript
 * const apiKey = getOpenAIApiKey(profile.apiKey);
 * if (!apiKey) throw new Error("OpenAI API key is required");
 * ```
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
