/**
 * AzureOpenAIService - Provider implementation for Azure OpenAI API
 * Supports chat completions with tool calling and streaming using Azure OpenAI endpoints
 */

import OpenAI from "openai";
import { App } from "obsidian";
import { ChatMessage } from "./CopilotService";
import {
	AIProvider,
	AIProviderConfig,
	StreamingCallbacks,
	ToolDefinition,
} from "./AIProvider";

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

interface AzureOpenAITool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

type AzureOpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type AzureOpenAIToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

/**
 * Get API key from environment or config
 */
export function getAzureOpenAIApiKey(configKey?: string): string | undefined {
	// First check config
	if (configKey) {
		return configKey;
	}
	
	// Then check environment variables (works in Node.js context)
	if (typeof process !== "undefined" && process.env) {
		return process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
	}
	
	return undefined;
}

/**
 * Azure OpenAI provider implementation
 */
export class AzureOpenAIService extends AIProvider {
	private client: OpenAI | null = null;
	private abortController: AbortController | null = null;
	private isInitialized: boolean = false;
	declare protected config: AzureOpenAIProviderConfig;

	constructor(app: App, config: AzureOpenAIProviderConfig) {
		super(app, config);
	}

	/**
	 * Initialize the Azure OpenAI client
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized && this.client) {
			return;
		}

		const apiKey = getAzureOpenAIApiKey(this.config.apiKey);
		if (!apiKey) {
			throw new Error(
				"Azure OpenAI API key not found. Set AZURE_OPENAI_KEY environment variable or configure in settings."
			);
		}

		if (!this.config.endpoint) {
			throw new Error("Azure OpenAI endpoint not configured.");
		}

		if (!this.config.deploymentName) {
			throw new Error("Azure OpenAI deployment name not configured.");
		}

		const apiVersion = this.config.apiVersion || "2024-08-01-preview";

		// Configure Azure OpenAI client
		this.client = new OpenAI({
			apiKey,
			baseURL: `${this.config.endpoint}/openai/deployments/${this.config.deploymentName}`,
			defaultQuery: { "api-version": apiVersion },
			defaultHeaders: { "api-key": apiKey },
			dangerouslyAllowBrowser: true, // Required for Obsidian (Electron browser context)
		});

		this.isInitialized = true;
		console.log("[AzureOpenAIService] Initialized with deployment:", this.config.deploymentName);
	}

	/**
	 * Send a message and wait for complete response
	 */
	async sendMessage(prompt: string): Promise<string> {
		if (!this.client) {
			await this.initialize();
		}

		this.addToHistory("user", prompt);

		const messages = this.buildMessages();
		const tools = this.buildTools();

		try {
			let response = await this.client!.chat.completions.create({
				model: this.config.deploymentName, // Azure uses deployment name as model
				messages,
				tools: tools.length > 0 ? tools : undefined,
				max_tokens: this.config.maxTokens,
				temperature: this.config.temperature,
			});

			// Handle tool calls in a loop
			let assistantMessage = response.choices[0]?.message;
			while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
				// Execute tool calls
				const toolResults = await this.executeToolCalls(assistantMessage.tool_calls);

				// Add assistant message with tool calls to messages
				messages.push(assistantMessage);

				// Add tool results
				for (const result of toolResults) {
					messages.push({
						role: "tool",
						tool_call_id: result.tool_call_id,
						content: JSON.stringify(result.result),
					});
				}

				// Get next response
				response = await this.client!.chat.completions.create({
					model: this.config.deploymentName,
					messages,
					tools: tools.length > 0 ? tools : undefined,
					max_tokens: this.config.maxTokens,
					temperature: this.config.temperature,
				});

				assistantMessage = response.choices[0]?.message;
			}

			const content = assistantMessage?.content || "";
			this.addToHistory("assistant", content);
			return content;
		} catch (error) {
			console.error("[AzureOpenAIService] Error sending message:", error);
			throw error;
		}
	}

	/**
	 * Send a message with streaming response
	 */
	async sendMessageStreaming(
		prompt: string,
		callbacks: StreamingCallbacks
	): Promise<void> {
		if (!this.client) {
			await this.initialize();
		}

		this.addToHistory("user", prompt);
		this.abortController = new AbortController();

		const messages = this.buildMessages();
		const tools = this.buildTools();
		let fullContent = "";

		try {
			const stream = await this.client!.chat.completions.create({
				model: this.config.deploymentName,
				messages,
				tools: tools.length > 0 ? tools : undefined,
				max_tokens: this.config.maxTokens,
				temperature: this.config.temperature,
				stream: true,
			}, {
				signal: this.abortController.signal,
			});

			let currentToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
			let hasToolCalls = false;

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta;

				// Handle content delta
				if (delta?.content) {
					fullContent += delta.content;
					callbacks.onDelta(delta.content);
				}

				// Handle tool calls
				if (delta?.tool_calls) {
					hasToolCalls = true;
					for (const toolCall of delta.tool_calls) {
						const index = toolCall.index;
						if (!currentToolCalls.has(index)) {
							currentToolCalls.set(index, {
								id: toolCall.id || "",
								name: toolCall.function?.name || "",
								arguments: "",
							});
						}
						const tc = currentToolCalls.get(index)!;
						if (toolCall.id) tc.id = toolCall.id;
						if (toolCall.function?.name) tc.name = toolCall.function.name;
						if (toolCall.function?.arguments) tc.arguments += toolCall.function.arguments;
					}
				}
			}

			// If we have tool calls, execute them and continue
			if (hasToolCalls && currentToolCalls.size > 0) {
				const toolCalls: AzureOpenAIToolCall[] = Array.from(currentToolCalls.values()).map(tc => ({
					id: tc.id,
					type: "function" as const,
					function: {
						name: tc.name,
						arguments: tc.arguments,
					},
				}));

				// Execute tool calls
				const toolResults = await this.executeToolCalls(toolCalls);

				// Add assistant message with tool calls
				messages.push({
					role: "assistant",
					content: fullContent || null,
					tool_calls: toolCalls,
				});

				// Add tool results
				for (const result of toolResults) {
					messages.push({
						role: "tool",
						tool_call_id: result.tool_call_id,
						content: JSON.stringify(result.result),
					});
				}

				// Continue streaming with tool results
				const continueStream = await this.client!.chat.completions.create({
					model: this.config.deploymentName,
					messages,
					tools: tools.length > 0 ? tools : undefined,
					max_tokens: this.config.maxTokens,
					temperature: this.config.temperature,
					stream: true,
				}, {
					signal: this.abortController.signal,
				});

				for await (const chunk of continueStream) {
					const delta = chunk.choices[0]?.delta;
					if (delta?.content) {
						fullContent += delta.content;
						callbacks.onDelta(delta.content);
					}
				}
			}

			this.addToHistory("assistant", fullContent);
			callbacks.onComplete?.(fullContent);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				callbacks.onComplete?.(fullContent);
				return;
			}
			console.error("[AzureOpenAIService] Streaming error:", error);
			callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
			throw error;
		} finally {
			this.abortController = null;
		}
	}

	/**
	 * Abort the current operation
	 */
	async abort(): Promise<void> {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	/**
	 * Check if the provider is ready
	 */
	isReady(): boolean {
		return this.isInitialized && this.client !== null;
	}

	/**
	 * Clean up resources
	 */
	async destroy(): Promise<void> {
		await this.abort();
		this.client = null;
		this.isInitialized = false;
		this.messageHistory = [];
	}

	/**
	 * Build messages array for API call
	 */
	private buildMessages(): AzureOpenAIMessage[] {
		const messages: AzureOpenAIMessage[] = [];

		// Add system message
		if (this.systemPrompt) {
			messages.push({
				role: "system",
				content: this.systemPrompt,
			});
		}

		// Add conversation history
		for (const msg of this.messageHistory) {
			messages.push({
				role: msg.role,
				content: msg.content,
			});
		}

		return messages;
	}

	/**
	 * Build tools array for API call
	 * Includes both manually set tools and MCP tools
	 */
	private buildTools(): AzureOpenAITool[] {
		// Combine manually set tools with MCP tools
		const allTools = [...this.tools, ...this.convertMcpToolsToToolDefinitions()];
		
		return allTools.map((tool) => ({
			type: "function" as const,
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			},
		}));
	}

	/**
	 * Execute tool calls and return results
	 */
	private async executeToolCalls(
		toolCalls: AzureOpenAIToolCall[]
	): Promise<Array<{ tool_call_id: string; result: unknown }>> {
		const results: Array<{ tool_call_id: string; result: unknown }> = [];

		for (const toolCall of toolCalls) {
			const toolName = toolCall.function.name;
			const tool = this.tools.find((t) => t.name === toolName);

			if (!tool) {
				results.push({
					tool_call_id: toolCall.id,
					result: { error: `Unknown tool: ${toolName}` },
				});
				continue;
			}

			try {
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(toolCall.function.arguments || "{}");
				} catch {
					// If parsing fails, use empty args
				}

				console.log(`[AzureOpenAIService] Executing tool: ${toolName}`, args);
				const result = await tool.handler(args);
				results.push({
					tool_call_id: toolCall.id,
					result,
				});
			} catch (error) {
				console.error(`[AzureOpenAIService] Tool execution error (${toolName}):`, error);
				results.push({
					tool_call_id: toolCall.id,
					result: { error: error instanceof Error ? error.message : String(error) },
				});
			}
		}

		return results;
	}

	/**
	 * Test the connection to Azure OpenAI
	 */
	async testConnection(): Promise<{ success: boolean; error?: string }> {
		try {
			if (!this.client) {
				await this.initialize();
			}

			// Make a simple API call to test connection
			// Use a minimal chat completion request
			const response = await this.client!.chat.completions.create({
				model: this.config.deploymentName,
				messages: [{ role: "user", content: "test" }],
				max_tokens: 1,
			});

			console.log("[AzureOpenAIService] Connection test successful");
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	}

	/**
	 * List available models from Azure OpenAI
	 * Note: Azure doesn't provide a models API, so we return common model names
	 */
	async listModels(): Promise<string[]> {
		// Azure OpenAI doesn't have a dynamic models list API
		// Return common models that users might have deployed
		// Based on: https://ai.azure.us/explore/models?selectedCollection=OpenAI
		return [
			"gpt-4o",
			"gpt-4o-mini",
			"gpt-4-turbo",
			"gpt-4",
			"gpt-4-32k",
			"gpt-35-turbo",
			"gpt-35-turbo-16k",
			"o1",
			"o1-mini",
			"o1-preview",
			"o3-mini",
			"gpt-realtime",
			"gpt-realtime-mini",
			"gpt-audio",
			"gpt-audio-mini",
		].sort();
	}
}
