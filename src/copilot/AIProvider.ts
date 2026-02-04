/**
 * AIProvider - Abstract interface for AI chat providers
 * Supports GitHub Copilot, OpenAI, and future providers
 */

import { App } from "obsidian";
import { ChatMessage } from "./GitHubCopilotCliService";
import { McpManager } from "./McpManager";

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

export interface StreamingCallbacks {
	onDelta: (delta: string) => void;
	onComplete?: (fullContent: string) => void;
	onError?: (error: Error) => void;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Abstract base class for AI providers
 */
export abstract class AIProvider {
	protected app: App;
	protected config: AIProviderConfig;
	protected messageHistory: ChatMessage[] = [];
	protected tools: ToolDefinition[] = [];
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
 * 
 * @deprecated Use getOpenAIApiKey from secretStorage instead for SecretStorage support
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

/**
 * Re-export SecretStorage helper functions for convenience
 * These provide enhanced security with encrypted storage support
 */
export { 
	SecretStorage,
	getOpenAIApiKey as getOpenAIApiKeySecure,
	getAzureOpenAIApiKey as getAzureOpenAIApiKeySecure
} from "../utils/secretStorage";
