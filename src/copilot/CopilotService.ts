import { CopilotClient, CopilotSession, SessionEvent, defineTool } from "@github/copilot-sdk";
import { App, TFile, Notice } from "obsidian";
import { SkillRegistry, VaultCopilotSkill } from "./SkillRegistry";
import { CustomizationLoader, CustomInstruction } from "./CustomizationLoader";
import { McpManager, McpManagerEvent } from "./McpManager";
import { McpTool } from "./McpTypes";
import { normalizeVaultPath, ensureMarkdownExtension } from "./pathUtils";
import * as VaultOps from "./VaultOperations";
import { getTracingService } from "./TracingService";

export interface CopilotServiceConfig {
	model: string;
	cliPath?: string;
	cliUrl?: string;
	streaming: boolean;
	/** Enable tracing and SDK debug logging */
	tracingEnabled?: boolean;
	/** Skill registry for plugin-registered skills */
	skillRegistry?: SkillRegistry;
	/** MCP Manager for MCP server tools */
	mcpManager?: McpManager;
	/** Directories containing skill definition files */
	skillDirectories?: string[];
	/** Directories containing custom agent definition files */
	agentDirectories?: string[];
	/** Directories containing instruction files */
	instructionDirectories?: string[];
	/** Directories containing prompt files */
	promptDirectories?: string[];
	/** Optional allowlist of tool names to enable (SDK availableTools) */
	availableTools?: string[];
	/** Request timeout in milliseconds (default: 120000 - 2 minutes) */
	requestTimeout?: number;
	/** Stop timeout in milliseconds before forcing (default: 10000 - 10 seconds) */
	stopTimeout?: number;
}

/** Default timeout for requests (2 minutes) */
const DEFAULT_REQUEST_TIMEOUT = 120000;
/** Default timeout for graceful stop (10 seconds) */
const DEFAULT_STOP_TIMEOUT = 10000;

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
}

/**
 * Service class that wraps the GitHub Copilot SDK for use in Obsidian.
 * Handles client lifecycle, session management, and provides Obsidian-specific tools.
 */
export class CopilotService {
	private client: CopilotClient | null = null;
	private session: CopilotSession | null = null;
	private app: App;
	private config: CopilotServiceConfig;
	private messageHistory: ChatMessage[] = [];
	private eventHandlers: ((event: SessionEvent) => void)[] = [];
	private customizationLoader: CustomizationLoader;
	private loadedInstructions: CustomInstruction[] = [];
	private mcpEventUnsubscribe: (() => void) | null = null;

	constructor(app: App, config: CopilotServiceConfig) {
		this.app = app;
		this.config = config;
		this.customizationLoader = new CustomizationLoader(app);
		
		// Subscribe to MCP server changes to update tools
		if (config.mcpManager) {
			const listener = (event: McpManagerEvent) => {
				if (event.type === "server-tools-updated" || event.type === "server-status-changed") {
					// Tools changed - recreate session to pick up new tools
					console.log("[CopilotService] MCP tools changed, session will use updated tools on next message");
				}
			};
			config.mcpManager.on(listener);
			this.mcpEventUnsubscribe = () => config.mcpManager?.off(listener);
		}
	}

	/**
	 * Initialize and start the Copilot client
	 * Handles specific error conditions like missing CLI or connection failures
	 */
	async start(): Promise<void> {
		if (this.client) {
			return;
		}

		const clientOptions: Record<string, unknown> = {};
		
		if (this.config.cliPath) {
			clientOptions.cliPath = this.config.cliPath;
		}
		
		if (this.config.cliUrl) {
			clientOptions.cliUrl = this.config.cliUrl;
		}

		// Enable SDK debug logging when tracing is enabled
		if (this.config.tracingEnabled) {
			clientOptions.logLevel = "debug";
			
			// Intercept console.log/warn/error to capture SDK logs
			this.interceptConsoleLogs();
		}

		this.client = new CopilotClient(clientOptions);
		
		try {
			await this.client.start();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			
			// Handle specific error types with user-friendly messages
			if (errorMessage.includes('ENOENT') || errorMessage.toLowerCase().includes('not found')) {
				this.client = null;
				throw new Error(
					'GitHub Copilot CLI not found. Please ensure it is installed and in your PATH. ' +
					'Run "npm install -g @github/copilot-cli" or specify the path in settings.'
				);
			}
			
			if (errorMessage.includes('ECONNREFUSED') || errorMessage.toLowerCase().includes('connection refused')) {
				this.client = null;
				throw new Error(
					'Could not connect to GitHub Copilot CLI server. ' +
					'Please ensure the CLI is running and accessible.'
				);
			}
			
			if (errorMessage.includes('EACCES') || errorMessage.toLowerCase().includes('permission')) {
				this.client = null;
				throw new Error(
					'Permission denied when starting GitHub Copilot CLI. ' +
					'Please check file permissions and try running with appropriate access.'
				);
			}
			
			// Log and rethrow unknown errors
			console.error('[Vault Copilot] Failed to start Copilot client:', error);
			this.client = null;
			throw error;
		}
	}

	/**
	 * Intercept console and process.stderr logs to capture SDK diagnostics
	 */
	private interceptConsoleLogs(): void {
		const tracingService = getTracingService();
		
		// Log that we're setting up interception
		console.log('[Vault Copilot] Setting up CLI log interception...');
		tracingService.addSdkLog('info', 'CLI log interception initialized', 'copilot-sdk');
		
		// Intercept process.stderr.write to capture CLI subprocess logs
		// The SDK writes logs with prefix "[CLI subprocess]" to stderr
		if (process?.stderr?.write) {
			const originalStderrWrite = process.stderr.write.bind(process.stderr);
			(process.stderr as any).write = (chunk: any, encoding?: any, callback?: any) => {
				const message = typeof chunk === 'string' ? chunk : chunk?.toString?.() || '';
				
				// Debug: Log all stderr writes to see what we're getting
				if (message.trim()) {
					console.log('[Vault Copilot DEBUG] stderr:', message.substring(0, 200));
				}
				
				// Capture all CLI subprocess logs (they have the [CLI subprocess] prefix)
				if (message.includes('[CLI subprocess]')) {
					// Extract the actual log content after the prefix
					const logContent = message.replace('[CLI subprocess]', '').trim();
					if (logContent) {
						// Parse log level from content if possible
						let level: 'info' | 'warning' | 'error' | 'debug' = 'info';
						if (message.toLowerCase().includes('error')) {
							level = 'error';
						} else if (message.toLowerCase().includes('warn')) {
							level = 'warning';
						} else if (message.toLowerCase().includes('debug')) {
							level = 'debug';
						}
						tracingService.addSdkLog(level, logContent, 'copilot-cli');
					}
				}
				
				// Handle the different overload signatures of write()
				if (typeof encoding === 'function') {
					return originalStderrWrite(chunk, encoding);
				}
				return originalStderrWrite(chunk, encoding, callback);
			};
			console.log('[Vault Copilot] stderr.write intercepted successfully');
		} else {
			console.warn('[Vault Copilot] process.stderr.write not available - CLI logs will not be captured');
			tracingService.addSdkLog('warning', 'process.stderr.write not available - CLI logs cannot be captured', 'copilot-sdk');
		}
		
		// Store original console methods
		const originalLog = console.log.bind(console);
		const originalWarn = console.warn.bind(console);
		const originalError = console.error.bind(console);
		
		// Intercept console.log
		console.log = (...args: unknown[]) => {
			originalLog(...args);
			const message = args.map(arg => 
				typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
			).join(' ');
			
			// Only capture copilot-related logs
			if (message.includes('[Copilot') || message.includes('copilot') || message.includes('[Vault Copilot]')) {
				tracingService.addSdkLog('info', message, 'copilot-sdk');
			}
		};
		
		// Intercept console.warn
		console.warn = (...args: unknown[]) => {
			originalWarn(...args);
			const message = args.map(arg => 
				typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
			).join(' ');
			
			if (message.includes('[Copilot') || message.includes('copilot') || message.includes('[Vault Copilot]')) {
				tracingService.addSdkLog('warning', message, 'copilot-sdk');
			}
		};
		
		// Intercept console.error
		console.error = (...args: unknown[]) => {
			originalError(...args);
			const message = args.map(arg => 
				typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
			).join(' ');
			
			if (message.includes('[Copilot') || message.includes('copilot') || message.includes('[Vault Copilot]')) {
				tracingService.addSdkLog('error', message, 'copilot-sdk');
			}
		};
	}

	/**
	 * Stop the Copilot client and clean up resources
	 * Uses timeout and force stop for graceful shutdown
	 */
	async stop(): Promise<void> {
		// Clean up MCP listener
		if (this.mcpEventUnsubscribe) {
			this.mcpEventUnsubscribe();
			this.mcpEventUnsubscribe = null;
		}
		
		if (this.session) {
			try {
				await this.session.destroy();
			} catch (error) {
				console.warn('[Vault Copilot] Error destroying session:', error);
			}
			this.session = null;
		}
		
		if (this.client) {
			const stopTimeout = this.config.stopTimeout ?? DEFAULT_STOP_TIMEOUT;
			
			try {
				// Try graceful stop with timeout
				const stopPromise = this.client.stop();
				const timeoutPromise = new Promise<never>((_, reject) => 
					setTimeout(() => reject(new Error('Stop timeout')), stopTimeout)
				);
				
				await Promise.race([stopPromise, timeoutPromise]);
			} catch (error) {
				console.warn('[Vault Copilot] Graceful stop timed out, forcing stop...');
				try {
					await this.client.forceStop();
				} catch (forceError) {
					console.error('[Vault Copilot] Force stop failed:', forceError);
				}
			}
			this.client = null;
		}
		this.messageHistory = [];
	}

	/**
	 * Create a new chat session with Obsidian-specific tools
	 * @param sessionId Optional session ID for persistence. If provided, the session can be resumed later.
	 */
	async createSession(sessionId?: string): Promise<string> {
		// Auto-start client if not running
		if (!this.client) {
			await this.start();
		}

		if (this.session) {
			await this.session.destroy();
		}

		// Load instructions from configured directories
		if (this.config.instructionDirectories && this.config.instructionDirectories.length > 0) {
			this.loadedInstructions = await this.customizationLoader.loadInstructions(this.config.instructionDirectories);
			console.log('[Vault Copilot] Loaded instructions:', this.loadedInstructions.map(i => i.name));
		}

		// Combine built-in tools with registered plugin skills and MCP tools
		const builtInTools = this.createObsidianTools();
		const registeredTools = this.convertRegisteredSkillsToTools();
		const mcpTools = this.convertMcpToolsToSdkTools();
		const tools = [...builtInTools, ...registeredTools, ...mcpTools];
		
		if (mcpTools.length > 0) {
			console.log('[Vault Copilot] Registered MCP tools:', mcpTools.map(t => t.name));
		}

		// Build session config
		const sessionConfig: Record<string, unknown> = {
			model: this.config.model,
			streaming: this.config.streaming,
			tools,
			systemMessage: {
				content: this.getSystemPrompt(),
			},
		};

		// Add session ID for persistence if provided
		if (sessionId) {
			sessionConfig.sessionId = sessionId;
		}

		// Add tool filtering if configured (SDK availableTools/excludedTools)
		if (this.config.availableTools && this.config.availableTools.length > 0) {
			sessionConfig.availableTools = this.config.availableTools;
			console.log('[Vault Copilot] Available tools filter:', this.config.availableTools.length, 'tools');
		}

		// Add skill directories if configured
		if (this.config.skillDirectories && this.config.skillDirectories.length > 0) {
			sessionConfig.skillDirectories = this.config.skillDirectories;
			console.log('[Vault Copilot] Skill directories:', this.config.skillDirectories);
		}

		// Add custom agents from agent directories if configured
		if (this.config.agentDirectories && this.config.agentDirectories.length > 0) {
			sessionConfig.customAgents = this.buildCustomAgentsConfig();
			console.log('[Vault Copilot] Agent directories:', this.config.agentDirectories);
		}

		console.log('[Vault Copilot] Creating session with config:', JSON.stringify(sessionConfig, null, 2));

		this.session = await this.client!.createSession(sessionConfig as any);

		// Set up event handler
		this.session.on((event: SessionEvent) => {
			this.handleSessionEvent(event);
		});

		this.messageHistory = [];
		
		const actualSessionId = this.session.sessionId;
		console.log('[Vault Copilot] Session created with ID:', actualSessionId);
		return actualSessionId;
	}

	/**
	 * Resume an existing session by its ID (preserves AI conversation context)
	 * @param sessionId The session ID to resume
	 * @returns The session ID if successful
	 */
	async resumeSession(sessionId: string): Promise<string> {
		// Auto-start client if not running
		if (!this.client) {
			await this.start();
		}

		if (this.session) {
			await this.session.destroy();
		}

		// Load instructions from configured directories
		if (this.config.instructionDirectories && this.config.instructionDirectories.length > 0) {
			this.loadedInstructions = await this.customizationLoader.loadInstructions(this.config.instructionDirectories);
			console.log('[Vault Copilot] Loaded instructions:', this.loadedInstructions.map(i => i.name));
		}

		// Combine built-in tools with registered plugin skills and MCP tools
		const builtInTools = this.createObsidianTools();
		const registeredTools = this.convertRegisteredSkillsToTools();
		const mcpTools = this.convertMcpToolsToSdkTools();
		const tools = [...builtInTools, ...registeredTools, ...mcpTools];
		
		if (mcpTools.length > 0) {
			console.log('[Vault Copilot] Registered MCP tools for resumed session:', mcpTools.map(t => t.name));
		}

		console.log('[Vault Copilot] Resuming session:', sessionId);

		try {
			this.session = await this.client!.resumeSession(sessionId, {
				tools,
			});

			// Set up event handler
			this.session.on((event: SessionEvent) => {
				this.handleSessionEvent(event);
			});

			// Restore message history from the SDK session
			const events = await this.session.getMessages();
			this.messageHistory = this.convertEventsToMessageHistory(events);
			
			console.log('[Vault Copilot] Session resumed with', this.messageHistory.length, 'messages');
			return this.session.sessionId;
		} catch (error) {
			console.warn('[Vault Copilot] Failed to resume session, creating new one:', error);
			// Session doesn't exist anymore, create a new one
			return this.createSession(sessionId);
		}
	}

	/**
	 * Convert SDK session events to our message history format
	 */
	private convertEventsToMessageHistory(events: SessionEvent[]): ChatMessage[] {
		const messages: ChatMessage[] = [];
		
		for (const event of events) {
			if (event.type === 'user.message') {
				messages.push({
					role: 'user',
					content: (event.data as { content?: string })?.content || '',
					timestamp: new Date(),
				});
			} else if (event.type === 'assistant.message') {
				messages.push({
					role: 'assistant',
					content: (event.data as { content?: string })?.content || '',
					timestamp: new Date(),
				});
			}
		}
		
		return messages;
	}

	/**
	 * Get the current session ID
	 */
	getSessionId(): string | null {
		return this.session?.sessionId ?? null;
	}

	/**
	 * Convert registered skills from SkillRegistry to SDK-compatible tools
	 */
	private convertRegisteredSkillsToTools(): ReturnType<typeof defineTool>[] {
		if (!this.config.skillRegistry) {
			return [];
		}

		const tools: ReturnType<typeof defineTool>[] = [];
		
		// Get all skills that have handlers
		const registry = this.config.skillRegistry;
		for (const skillInfo of registry.listSkills()) {
			const skill = registry.getSkill(skillInfo.name);
			if (!skill) continue;

			// Convert VaultCopilotSkill to SDK tool using defineTool
			const tool = defineTool(skill.name, {
				description: skill.description,
				parameters: skill.parameters as any,
				handler: async (args: Record<string, unknown>) => {
					const result = await skill.handler(args);
					// Convert SkillResult to tool result format
					if (result.success) {
						return result.data ?? { success: true, message: "Skill executed successfully" };
					} else {
						return { success: false, error: result.error ?? "Skill execution failed" };
					}
				},
			});
			
			tools.push(tool);
		}

		return tools;
	}

	/**
	 * Convert MCP tools from connected servers to SDK-compatible tools
	 */
	private convertMcpToolsToSdkTools(): ReturnType<typeof defineTool>[] {
		if (!this.config.mcpManager) {
			return [];
		}

		const tools: ReturnType<typeof defineTool>[] = [];
		const mcpTools = this.config.mcpManager.getAllTools();

		for (const { serverId, serverName, tool } of mcpTools) {
			// Create a unique tool name that includes the server name to avoid collisions
			// Format: mcp_<serverName>_<toolName>
			const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9_]/g, '_');
			const toolName = `mcp_${sanitizedServerName}_${tool.name}`;

			const sdkTool = defineTool(toolName, {
				description: `[MCP: ${serverName}] ${tool.description || tool.name}`,
				parameters: (tool.inputSchema || { type: "object", properties: {} }) as any,
				handler: async (args: Record<string, unknown>) => {
					try {
						const result = await this.config.mcpManager!.callTool(serverId, tool.name, args);
						return result;
					} catch (error) {
						return {
							success: false,
							error: error instanceof Error ? error.message : String(error),
						};
					}
				},
			});

			tools.push(sdkTool);
		}

		return tools;
	}

	/**
	 * Build custom agents configuration from agent directories
	 */
	private buildCustomAgentsConfig(): Array<{ name: string; slug: string; instructions: string }> {
		// For now, return empty array - agents will be loaded from directories by the SDK
		// The SDK's customAgents expects an array of agent configurations
		// When agentDirectories is set, the CLI will discover agents from those paths
		return [];
	}

	/**
	 * Send a message and wait for the complete response
	 * @param prompt The message to send
	 * @param timeout Optional timeout in milliseconds (uses config.requestTimeout if not specified)
	 */
	async sendMessage(prompt: string, timeout?: number): Promise<string> {
		if (!this.session) {
			await this.createSession();
		}

		// Log the prompt to tracing service
		const tracingService = getTracingService();
		tracingService.addSdkLog('info', `[User Prompt]\n${prompt}`, 'copilot-prompt');

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
		});

		const requestTimeout = timeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
		
		try {
			const response = await this.session!.sendAndWait({ prompt }, requestTimeout);
			
			const assistantContent = response?.data?.content || "";
			
			// Log the response to tracing service
			tracingService.addSdkLog('info', `[Assistant Response]\n${assistantContent.substring(0, 500)}${assistantContent.length > 500 ? '...' : ''}`, 'copilot-response');
			
			this.messageHistory.push({
				role: "assistant",
				content: assistantContent,
				timestamp: new Date(),
			});

			return assistantContent;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			tracingService.addSdkLog('error', `[Request Error] ${errorMessage}`, 'copilot-error');
			
			if (errorMessage.toLowerCase().includes('timeout')) {
				console.error('[Vault Copilot] Request timed out after', requestTimeout, 'ms');
				throw new Error(`Request timed out after ${requestTimeout / 1000} seconds`);
			}
			
			throw error;
		}
	}

	/**
	 * Send a message with streaming response
	 * @param prompt The message to send
	 * @param onDelta Callback for each delta chunk
	 * @param onComplete Optional callback when complete
	 * @param timeout Optional timeout in milliseconds (uses config.requestTimeout if not specified)
	 */
	async sendMessageStreaming(
		prompt: string, 
		onDelta: (delta: string) => void,
		onComplete?: (fullContent: string) => void,
		timeout?: number
	): Promise<void> {
		if (!this.session) {
			await this.createSession();
		}

		// Log the prompt to tracing service
		const tracingService = getTracingService();
		tracingService.addSdkLog('info', `[User Prompt (Streaming)]\n${prompt}`, 'copilot-prompt');

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
		});

		let fullContent = "";
		const requestTimeout = timeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;

		return new Promise<void>((resolve, reject) => {
			let timeoutId: NodeJS.Timeout | null = null;
			let hasCompleted = false;
			
			const cleanup = () => {
				hasCompleted = true;
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}
			};
			
			// Set up timeout
			timeoutId = setTimeout(async () => {
				if (!hasCompleted) {
					cleanup();
					unsubscribe();
					
					// Try to abort the request
					try {
						await this.session?.abort();
					} catch (abortError) {
						console.warn('[Vault Copilot] Error aborting timed-out request:', abortError);
					}
					
					tracingService.addSdkLog('error', `[Streaming Timeout] Request timed out after ${requestTimeout / 1000} seconds`, 'copilot-error');
					reject(new Error(`Streaming request timed out after ${requestTimeout / 1000} seconds`));
				}
			}, requestTimeout);
			
			const unsubscribe = this.session!.on((event: SessionEvent) => {
				if (hasCompleted) return;
				
				// Log all events for debugging (except deltas which are too verbose)
				if (event.type !== "assistant.message_delta") {
					tracingService.addSdkLog('debug', `[SDK Event] ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`, 'copilot-event');
				}
				
				if (event.type === "assistant.message_delta") {
					const delta = (event.data as { deltaContent: string }).deltaContent;
					fullContent += delta;
					onDelta(delta);
				} else if (event.type === "assistant.message") {
					fullContent = (event.data as { content: string }).content;
				} else if (event.type === "session.idle") {
					cleanup();
					this.messageHistory.push({
						role: "assistant",
						content: fullContent,
						timestamp: new Date(),
					});
					
					// Log the response to tracing service
					tracingService.addSdkLog('info', `[Assistant Response (Streaming)]\n${fullContent.substring(0, 500)}${fullContent.length > 500 ? '...' : ''}`, 'copilot-response');
					
					if (onComplete) {
						onComplete(fullContent);
					}
					unsubscribe();
					resolve();
				} else if (event.type === "session.error") {
					cleanup();
					const errorData = event.data as { message?: string };
					tracingService.addSdkLog('error', `[Streaming Error] ${errorData.message || "Unknown error"}`, 'copilot-error');
					unsubscribe();
					reject(new Error(errorData.message || "Session error during streaming"));
				}
			});

			this.session!.send({ prompt }).catch((err) => {
				cleanup();
				unsubscribe();
				tracingService.addSdkLog('error', `[Send Error] ${err.message || err}`, 'copilot-error');
				reject(err);
			});
		});
	}

	/**
	 * Abort the current operation
	 * Call this to cancel an in-progress request
	 */
	async abort(): Promise<void> {
		if (this.session) {
			try {
				await this.session.abort();
				console.log('[Vault Copilot] Request aborted');
			} catch (error) {
				console.warn('[Vault Copilot] Error during abort:', error);
			}
		}
	}

	/**
	 * Get message history
	 */
	getMessageHistory(): ChatMessage[] {
		return [...this.messageHistory];
	}

	/**
	 * Clear message history and create a new session
	 */
	async clearHistory(): Promise<void> {
		this.messageHistory = [];
		await this.createSession();
	}

	/**
	 * Get current session state for persistence
	 */
	getSessionState(): { messages: ChatMessage[] } {
		return {
			messages: [...this.messageHistory],
		};
	}

	/**
	 * Load a previous session using SDK session persistence
	 * This resumes the actual AI conversation context from the SDK
	 * @param sessionId The session ID to load
	 * @param messages Optional fallback messages if session can't be resumed (for backward compatibility)
	 */
	async loadSession(sessionId: string, messages?: ChatMessage[]): Promise<void> {
		if (!this.client) {
			await this.start();
		}

		try {
			// Try to resume the session using SDK persistence
			await this.resumeSession(sessionId);
			console.log('[Vault Copilot] Session loaded via SDK persistence');
		} catch (error) {
			console.warn('[Vault Copilot] Could not resume session, creating new with fallback messages:', error);
			// Fallback: create a new session and restore message history manually
			await this.createSession(sessionId);
			
			if (messages) {
				this.messageHistory = messages.map(msg => ({
					...msg,
					timestamp: new Date(msg.timestamp),
				}));
			}
		}
	}

	/**
	 * Subscribe to session events
	 */
	onEvent(handler: (event: SessionEvent) => void): () => void {
		this.eventHandlers.push(handler);
		return () => {
			const index = this.eventHandlers.indexOf(handler);
			if (index > -1) {
				this.eventHandlers.splice(index, 1);
			}
		};
	}

	/**
	 * Check if the service is connected
	 */
	isConnected(): boolean {
		return this.client !== null;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<CopilotServiceConfig>): void {
		this.config = { ...this.config, ...config };
	}

	private handleSessionEvent(event: SessionEvent): void {
		for (const handler of this.eventHandlers) {
			handler(event);
		}
	}

	private getSystemPrompt(): string {
		return `You are a helpful AI assistant integrated into Obsidian, a powerful knowledge management application.

## Your Capabilities
- **Read notes**: Use read_note to get a single note, or batch_read_notes for multiple notes at once
- **Search**: Use search_notes to find notes by content or title
- **Create**: Use create_note to create new notes
- **Update**: Use update_note to replace entire note content, or append_to_note to add to the end
- **Patch**: Use patch_note to insert content at specific locations (after headings, block references, etc.)
- **Delete**: Use delete_note to remove notes (moves to system trash)
- **Rename/Move**: Use rename_note to move or rename notes
- **Recent changes**: Use get_recent_changes to see recently modified files
- **Daily notes**: Use get_daily_note to get today's or a specific date's daily note
- **Active note**: Use get_active_note to get the currently open note
- **List notes**: Use list_notes to browse notes and subfolders in a folder (non-recursive, shows file/folder types)
- **List all notes**: Use list_notes_recursively to get ALL notes from a folder and its subfolders

## Available Slash Commands
When the user asks about available commands, help, or what you can do, respond ONLY with this list of slash commands available in GitHub Copilot for Obsidian:

### Note Commands
| Command | Description |
|---------|-------------|
| \`/help\` | Show available slash commands |
| \`/read <path>\` | Read a note by path |
| \`/search <query>\` | Search for notes |
| \`/list [folder]\` | List notes in a folder |
| \`/create <path> [content]\` | Create a new note |
| \`/append <path> <content>\` | Append content to a note |
| \`/update <path> <content>\` | Update/replace entire note content |
| \`/delete <path>\` | Delete a note (moves to trash) |
| \`/rename <old> <new>\` | Rename or move a note |
| \`/recent [count]\` | Show recently modified notes |
| \`/daily [YYYY-MM-DD]\` | Get today's or a specific date's daily note |
| \`/active\` | Get the currently active note |
| \`/batch <path1> <path2>...\` | Read multiple notes at once |

### Session Commands
| Command | Description |
|---------|-------------|
| \`/sessions\` | List all chat sessions |
| \`/new [name]\` | Create a new chat session |
| \`/archive\` | Archive the current session |
| \`/clear\` | Clear chat history |

**Important**: Do NOT mention CLI commands, keyboard shortcuts, or any commands that are not in the list above. The user is asking about this Obsidian plugin's commands, not a terminal CLI.

## Public API for Other Plugins
When the user asks about the API, respond with the following information about this plugin's public API that other Obsidian plugins can use:

\`\`\`typescript
// Get the Vault Copilot API from another plugin
const vc = (app as any).plugins.plugins['obsidian-vault-copilot']?.api;

// Check connection status
vc.isConnected(): boolean

// Connection management
await vc.connect(): Promise<void>
await vc.disconnect(): Promise<void>

// Chat functionality
await vc.sendMessage(prompt: string): Promise<string>
await vc.sendMessageStreaming(prompt, onDelta, onComplete): Promise<void>
vc.getMessageHistory(): ChatMessage[]
await vc.clearHistory(): Promise<void>

// Session management
vc.listSessions(): SessionInfo[]
vc.getActiveSessionId(): string | null
await vc.createSession(name?): Promise<SessionInfo>
await vc.loadSession(sessionId): Promise<void>
await vc.archiveSession(sessionId): Promise<void>
await vc.unarchiveSession(sessionId): Promise<void>
await vc.deleteSession(sessionId): Promise<void>
await vc.renameSession(sessionId, newName): Promise<void>

// Note operations
await vc.readNote(path): Promise<{ success, content?, error? }>
await vc.searchNotes(query, limit?): Promise<{ results: Array<{ path, title, excerpt }> }>
await vc.createNote(path, content): Promise<{ success, path?, error? }>
await vc.updateNote(path, content): Promise<{ success, error? }>
await vc.deleteNote(path): Promise<{ success, error? }>
await vc.appendToNote(path, content): Promise<{ success, error? }>
await vc.batchReadNotes(paths): Promise<{ results: Array<{ path, success, content?, error? }> }>
await vc.renameNote(oldPath, newPath): Promise<{ success, newPath?, error? }>

// Utility operations
await vc.getActiveNote(): Promise<{ hasActiveNote, path?, title?, content? }>
await vc.listNotes(folder?): Promise<{ notes: Array<{ path, title }> }>
await vc.getRecentChanges(limit?): Promise<{ files: Array<{ path, title, mtime, mtimeFormatted }> }>
await vc.getDailyNote(date?): Promise<{ success, path?, content?, exists, error? }>
\`\`\`

## Guidelines
- When the user asks about their notes, use the available tools to fetch the content
- Format your responses in Markdown, which Obsidian renders natively
- **Always use [[wikilinks]] when referencing files in the vault** so users can click to navigate (e.g., [[Daily Notes/2026-01-29]] or [[Projects/My Project.md]])
- Be concise but helpful
- If you're unsure about something, ask for clarification
- For bulk operations, prefer batch_read_notes over multiple read_note calls

## Context
You are running inside Obsidian and have access to the user's vault through the provided tools.

## Customization Directories
The following directories are configured for extending your capabilities:

${this.getCustomizationDirectoriesInfo()}

${this.getLoadedInstructionsContent()}
`;
	}

	/**
	 * Generate information about configured customization directories
	 */
	private getCustomizationDirectoriesInfo(): string {
		const sections: string[] = [];

		const agentDirs = this.config.agentDirectories || [];
		if (agentDirs.length > 0) {
			sections.push(`### Agent Directories
Agents are custom personas with specific instructions and tool configurations.
Locations: ${agentDirs.map(d => `\`${d}\``).join(', ')}
File pattern: \`*.agent.md\``);
		}

		const skillDirs = this.config.skillDirectories || [];
		if (skillDirs.length > 0) {
			sections.push(`### Skill Directories
Skills define reusable capabilities and tool definitions. Each skill is a subfolder containing a SKILL.md file.
Locations: ${skillDirs.map(d => `\`${d}\``).join(', ')}
Structure: \`<skill-name>/SKILL.md\``);
		}

		const instructionDirs = this.config.instructionDirectories || [];
		if (instructionDirs.length > 0) {
			sections.push(`### Instruction Directories
Instructions provide additional context and guidelines for your responses.
Locations: ${instructionDirs.map(d => `\`${d}\``).join(', ')}
File pattern: \`*.instructions.md\`, \`copilot-instructions.md\`, \`AGENTS.md\``);
		}

		if (sections.length === 0) {
			return 'No customization directories are configured. Users can add agent, skill, and instruction directories in the plugin settings.';
		}

		return sections.join('\n\n');
	}

	/**
	 * Get the content of loaded instructions to include in the system prompt
	 */
	private getLoadedInstructionsContent(): string {
		if (this.loadedInstructions.length === 0) {
			return '';
		}

		const parts: string[] = ['## User-Defined Instructions\n\nThe following instructions have been loaded from the vault and should be followed:'];

		for (const instruction of this.loadedInstructions) {
			parts.push(`\n### ${instruction.name}${instruction.applyTo ? ` (applies to: ${instruction.applyTo})` : ''}\n\n${instruction.content}`);
		}

		return parts.join('\n');
	}

	/**
	 * Get the list of loaded instructions (for displaying in UI)
	 */
	getLoadedInstructions(): Array<{ name: string; path: string; applyTo?: string }> {
		return this.loadedInstructions.map(i => ({
			name: i.name,
			path: i.path,
			applyTo: i.applyTo
		}));
	}

	private createObsidianTools() {
		return [
			defineTool("read_note", {
				description: "Read the content of a note from the Obsidian vault by its path",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file (e.g., 'folder/note.md' or 'note.md')" }
					},
					required: ["path"]
				},
				handler: async (args: { path: string }) => {
					return await this.readNote(args.path);
				},
			}),

			defineTool("search_notes", {
				description: "Search for notes in the Obsidian vault by content or title",
				parameters: {
					type: "object",
					properties: {
						query: { type: "string", description: "The search query" },
						limit: { type: "number", description: "Maximum number of results to return (default: 10)" }
					},
					required: ["query"]
				},
				handler: async (args: { query: string; limit?: number }) => {
					return await this.searchNotes(args.query, args.limit ?? 10);
				},
			}),

			defineTool("create_note", {
				description: "Create a new note in the Obsidian vault",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path for the new note (e.g., 'folder/note.md')" },
						content: { type: "string", description: "The content of the note in Markdown format" }
					},
					required: ["path", "content"]
				},
				handler: async (args: { path: string; content: string }) => {
					return await this.createNote(args.path, args.content);
				},
			}),

			defineTool("get_active_note", {
				description: "Get information about the currently active note in Obsidian",
				parameters: {
					type: "object",
					properties: {},
					required: []
				},
				handler: async () => {
					return await this.getActiveNote();
				},
			}),

			defineTool("list_notes", {
				description: "List notes and subfolders in a folder (non-recursive). Returns items with type indicator (file/folder). Use with vault root or specific folder path.",
				parameters: {
					type: "object",
					properties: {
						folder: { type: "string", description: "Folder path to list (empty or '/' for vault root)" }
					},
					required: []
				},
				handler: async (args: { folder?: string }) => {
					return await this.listNotes(args.folder);
				},
			}),

			defineTool("list_notes_recursively", {
				description: "List ALL notes recursively from a folder path (includes all subfolders). Returns flat list of all note paths. Useful for getting complete vault structure.",
				parameters: {
					type: "object",
					properties: {
						folder: { type: "string", description: "Folder path to list recursively (empty or '/' for entire vault)" },
						limit: { type: "number", description: "Maximum number of notes to return (default: 200)" }
					},
					required: []
				},
				handler: async (args: { folder?: string; limit?: number }) => {
					return await this.listNotesRecursively(args.folder, args.limit);
				},
			}),

			defineTool("append_to_note", {
				description: "Append content to an existing note",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file" },
						content: { type: "string", description: "The content to append" }
					},
					required: ["path", "content"]
				},
				handler: async (args: { path: string; content: string }) => {
					return await this.appendToNote(args.path, args.content);
				},
			}),

			defineTool("batch_read_notes", {
				description: "Read multiple notes at once. More efficient than calling read_note multiple times.",
				parameters: {
					type: "object",
					properties: {
						paths: { 
							type: "array", 
							items: { type: "string" },
							description: "Array of note paths to read" 
						}
					},
					required: ["paths"]
				},
				handler: async (args: { paths: string[] }) => {
					return await this.batchReadNotes(args.paths);
				},
			}),

			defineTool("update_note", {
				description: "Update/replace the entire content of an existing note",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file" },
						content: { type: "string", description: "The new content to replace the existing content" }
					},
					required: ["path", "content"]
				},
				handler: async (args: { path: string; content: string }) => {
					return await this.updateNote(args.path, args.content);
				},
			}),

			defineTool("delete_note", {
				description: "Delete a note from the vault. Use with caution.",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file to delete" }
					},
					required: ["path"]
				},
				handler: async (args: { path: string }) => {
					return await this.deleteNote(args.path);
				},
			}),

			defineTool("get_recent_changes", {
				description: "Get recently modified files in the vault",
				parameters: {
					type: "object",
					properties: {
						limit: { type: "number", description: "Maximum number of files to return (default: 10)" }
					},
					required: []
				},
				handler: async (args: { limit?: number }) => {
					return await this.getRecentChanges(args.limit ?? 10);
				},
			}),

			defineTool("patch_note", {
				description: "Insert content at a specific location in a note, relative to a heading, block reference, or frontmatter",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string", description: "The path to the note file" },
						operation: { 
							type: "string", 
							enum: ["append", "prepend", "replace"],
							description: "The operation to perform: append (after target), prepend (before target), or replace (replace target section)" 
						},
						target_type: { 
							type: "string", 
							enum: ["heading", "block", "frontmatter", "end"],
							description: "Type of target: heading (by heading text), block (by block ID), frontmatter, or end (end of file)" 
						},
						target: { type: "string", description: "The target identifier (heading text, block ID, or empty for frontmatter/end)" },
						content: { type: "string", description: "The content to insert" }
					},
					required: ["path", "operation", "target_type", "content"]
				},
				handler: async (args: { path: string; operation: string; target_type: string; target?: string; content: string }) => {
					return await this.patchNote(args.path, args.operation, args.target_type, args.target, args.content);
				},
			}),

			defineTool("get_daily_note", {
				description: "Get today's daily note or a daily note for a specific date",
				parameters: {
					type: "object",
					properties: {
						date: { type: "string", description: "Optional date in YYYY-MM-DD format. Defaults to today." }
					},
					required: []
				},
				handler: async (args: { date?: string }) => {
					return await this.getDailyNote(args.date);
				},
			}),

			defineTool("rename_note", {
				description: "Rename or move a note to a new path",
				parameters: {
					type: "object",
					properties: {
						oldPath: { type: "string", description: "The current path of the note" },
						newPath: { type: "string", description: "The new path for the note" }
					},
					required: ["oldPath", "newPath"]
				},
				handler: async (args: { oldPath: string; newPath: string }) => {
					return await this.renameNote(args.oldPath, args.newPath);
				},
			}),

			defineTool("fetch_web_page", {
				description: "Fetch and extract content from a web page URL. Returns the text content of the page.",
				parameters: {
					type: "object",
					properties: {
						url: { type: "string", description: "The URL of the web page to fetch" }
					},
					required: ["url"]
				},
				handler: async (args: { url: string }) => {
					return await VaultOps.fetchWebPage(args.url);
				},
			}),
		];
	}

	async readNote(path: string): Promise<{ success: boolean; content?: string; error?: string }> {
		try {
			const normalizedPath = normalizeVaultPath(path);
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			const content = await this.app.vault.read(file);
			return { success: true, content };
		} catch (error) {
			return { success: false, error: `Failed to read note: ${error}` };
		}
	}

	async searchNotes(query: string, limit: number): Promise<{ results: Array<{ path: string; title: string; excerpt: string }> }> {
		const files = this.app.vault.getMarkdownFiles();
		const results: Array<{ path: string; title: string; excerpt: string }> = [];
		const lowerQuery = query.toLowerCase();

		for (const file of files) {
			if (results.length >= limit) break;

			const titleMatch = file.basename.toLowerCase().includes(lowerQuery);
			let contentMatch = false;
			let excerpt = "";

			try {
				const content = await this.app.vault.cachedRead(file);
				const lowerContent = content.toLowerCase();
				const queryIndex = lowerContent.indexOf(lowerQuery);
				
				if (queryIndex !== -1) {
					contentMatch = true;
					const start = Math.max(0, queryIndex - 50);
					const end = Math.min(content.length, queryIndex + query.length + 50);
					excerpt = (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
				}
			} catch {
				// Skip files that can't be read
			}

			if (titleMatch || contentMatch) {
				results.push({
					path: file.path,
					title: file.basename,
					excerpt: excerpt || file.basename,
				});
			}
		}

		return { results };
	}

	async createNote(path: string, content: string): Promise<{ success: boolean; path?: string; error?: string }> {
		try {
			// Normalize path and ensure .md extension
			const normalizedPath = ensureMarkdownExtension(path);
			
			// Check if file already exists
			const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (existing) {
				return { success: false, error: `Note already exists: ${normalizedPath}` };
			}

			await this.app.vault.create(normalizedPath, content);
			return { success: true, path: normalizedPath };
		} catch (error) {
			return { success: false, error: `Failed to create note: ${error}` };
		}
	}

	async getActiveNote(): Promise<{ hasActiveNote: boolean; path?: string; title?: string; content?: string }> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return { hasActiveNote: false };
		}

		try {
			const content = await this.app.vault.read(activeFile);
			return {
				hasActiveNote: true,
				path: activeFile.path,
				title: activeFile.basename,
				content,
			};
		} catch {
			return {
				hasActiveNote: true,
				path: activeFile.path,
				title: activeFile.basename,
			};
		}
	}

	async listNotes(folder?: string): Promise<{ items: Array<{ path: string; name: string; type: 'file' | 'folder' }> }> {
		const { TFolder, TFile } = await import('obsidian');
		const normalizedFolder = folder ? normalizeVaultPath(folder) : '';
		
		// Get the target folder (or root)
		let targetFolder;
		if (normalizedFolder === '' || normalizedFolder === '/') {
			targetFolder = this.app.vault.getRoot();
		} else {
			const abstractFile = this.app.vault.getAbstractFileByPath(normalizedFolder);
			if (!abstractFile || !(abstractFile instanceof TFolder)) {
				return { items: [] };
			}
			targetFolder = abstractFile;
		}

		// List immediate children only (non-recursive)
		const items: Array<{ path: string; name: string; type: 'file' | 'folder' }> = [];
		
		for (const child of targetFolder.children) {
			if (child instanceof TFolder) {
				items.push({
					path: child.path,
					name: child.name,
					type: 'folder'
				});
			} else if (child instanceof TFile && child.extension === 'md') {
				items.push({
					path: child.path,
					name: child.basename,
					type: 'file'
				});
			}
		}

		// Sort: folders first, then files, alphabetically
		items.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return { items: items.slice(0, 100) };
	}

	async listNotesRecursively(folder?: string, limit = 200): Promise<{ notes: Array<{ path: string; title: string }>; total: number; truncated: boolean }> {
		const files = this.app.vault.getMarkdownFiles();
		const normalizedFolder = folder ? normalizeVaultPath(folder) : '';
		
		// Filter to folder (or all if no folder specified)
		const filtered = normalizedFolder === '' || normalizedFolder === '/'
			? files
			: files.filter(file => file.path.startsWith(normalizedFolder + '/') || file.path === normalizedFolder);
		
		// Sort alphabetically by path
		filtered.sort((a, b) => a.path.localeCompare(b.path));
		
		const total = filtered.length;
		const truncated = total > limit;
		
		const notes = filtered
			.slice(0, limit)
			.map(file => ({
				path: file.path,
				title: file.basename,
			}));

		return { notes, total, truncated };
	}

	async appendToNote(path: string, content: string): Promise<{ success: boolean; error?: string }> {
		try {
			const normalizedPath = normalizeVaultPath(path);
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			await this.app.vault.append(file, "\n" + content);
			return { success: true };
		} catch (error) {
			return { success: false, error: `Failed to append to note: ${error}` };
		}
	}

	async batchReadNotes(paths: string[]): Promise<{ results: Array<{ path: string; success: boolean; content?: string; error?: string }> }> {
		const results = await Promise.all(
			paths.map(async (path) => {
				try {
					const normalizedPath = normalizeVaultPath(path);
					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return { path, success: false, error: `Note not found: ${path}` };
					}
					const content = await this.app.vault.read(file);
					return { path, success: true, content };
				} catch (error) {
					return { path, success: false, error: `Failed to read note: ${error}` };
				}
			})
		);
		return { results };
	}

	async updateNote(path: string, content: string): Promise<{ success: boolean; error?: string }> {
		try {
			const normalizedPath = normalizeVaultPath(path);
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			await this.app.vault.modify(file, content);
			return { success: true };
		} catch (error) {
			return { success: false, error: `Failed to update note: ${error}` };
		}
	}

	async deleteNote(path: string): Promise<{ success: boolean; error?: string }> {
		try {
			const normalizedPath = normalizeVaultPath(path);
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			await this.app.vault.trash(file, true); // Move to system trash for safety
			return { success: true };
		} catch (error) {
			return { success: false, error: `Failed to delete note: ${error}` };
		}
	}

	async getRecentChanges(limit: number): Promise<{ files: Array<{ path: string; title: string; mtime: number; mtimeFormatted: string }> }> {
		const files = this.app.vault.getMarkdownFiles()
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, limit)
			.map(file => ({
				path: file.path,
				title: file.basename,
				mtime: file.stat.mtime,
				mtimeFormatted: new Date(file.stat.mtime).toISOString(),
			}));
		return { files };
	}

	async patchNote(
		path: string, 
		operation: string, 
		targetType: string, 
		target: string | undefined, 
		content: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			const normalizedPath = normalizeVaultPath(path);
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}

			const fileContent = await this.app.vault.read(file);
			let newContent: string;

			if (targetType === "end") {
				// Simply append to end
				newContent = fileContent + "\n" + content;
			} else if (targetType === "frontmatter") {
				// Handle frontmatter
				const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
				if (frontmatterMatch) {
					const frontmatterEnd = frontmatterMatch[0].length;
					if (operation === "append") {
						newContent = fileContent.slice(0, frontmatterEnd) + "\n" + content + fileContent.slice(frontmatterEnd);
					} else if (operation === "prepend") {
						newContent = content + "\n" + fileContent;
					} else {
						// replace frontmatter
						newContent = content + fileContent.slice(frontmatterEnd);
					}
				} else {
					// No frontmatter exists
					if (operation === "prepend" || operation === "append") {
						newContent = content + "\n" + fileContent;
					} else {
						newContent = content + "\n" + fileContent;
					}
				}
			} else if (targetType === "heading") {
				// Find heading
				const headingRegex = new RegExp(`^(#{1,6})\\s+${this.escapeRegex(target || "")}\\s*$`, "m");
				const match = fileContent.match(headingRegex);
				if (!match || match.index === undefined || !match[1]) {
					return { success: false, error: `Heading not found: ${target}` };
				}

				const headingLevel = match[1].length;
				const headingEnd = (match.index as number) + match[0].length;

				// Find the end of this section (next heading of same or higher level, or EOF)
				const restContent = fileContent.slice(headingEnd);
				const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}}\\s+`, "m");
				const nextMatch = restContent.match(nextHeadingRegex);
				const sectionEnd = nextMatch && nextMatch.index !== undefined 
					? headingEnd + nextMatch.index 
					: fileContent.length;

				if (operation === "prepend") {
					// Insert right after the heading line
					newContent = fileContent.slice(0, headingEnd) + "\n" + content + fileContent.slice(headingEnd);
				} else if (operation === "append") {
					// Insert at the end of the section
					newContent = fileContent.slice(0, sectionEnd) + "\n" + content + fileContent.slice(sectionEnd);
				} else {
					// Replace the entire section content (keep heading)
					newContent = fileContent.slice(0, headingEnd) + "\n" + content + "\n" + fileContent.slice(sectionEnd);
				}
			} else if (targetType === "block") {
				// Find block reference ^blockid
				const blockRegex = new RegExp(`\\^${this.escapeRegex(target || "")}\\s*$`, "m");
				const match = fileContent.match(blockRegex);
				if (!match || match.index === undefined) {
					return { success: false, error: `Block reference not found: ^${target}` };
				}

				// Find the start of the line containing the block reference
				const beforeMatch = fileContent.slice(0, match.index);
				const lineStart = beforeMatch.lastIndexOf("\n") + 1;
				const lineEnd = match.index + match[0].length;

				if (operation === "prepend") {
					newContent = fileContent.slice(0, lineStart) + content + "\n" + fileContent.slice(lineStart);
				} else if (operation === "append") {
					newContent = fileContent.slice(0, lineEnd) + "\n" + content + fileContent.slice(lineEnd);
				} else {
					// Replace the entire block line
					newContent = fileContent.slice(0, lineStart) + content + " ^" + target + fileContent.slice(lineEnd);
				}
			} else {
				return { success: false, error: `Unknown target type: ${targetType}` };
			}

			await this.app.vault.modify(file, newContent);
			return { success: true };
		} catch (error) {
			return { success: false, error: `Failed to patch note: ${error}` };
		}
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	async getDailyNote(date?: string): Promise<{ success: boolean; path?: string; content?: string; exists: boolean; error?: string }> {
		try {
			// Determine the date
			const targetDate = date ? new Date(date) : new Date();
			const dateStr = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD format

			// Common daily note folder patterns
			const possiblePaths = [
				`Daily Notes/${dateStr}.md`,
				`daily/${dateStr}.md`,
				`Daily/${dateStr}.md`,
				`journal/${dateStr}.md`,
				`Journal/${dateStr}.md`,
				`${dateStr}.md`,
			];

			// Try to find existing daily note
			for (const path of possiblePaths) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file && file instanceof TFile) {
					const content = await this.app.vault.read(file);
					return { success: true, path: file.path, content, exists: true };
				}
			}

			// Also search for files matching the date in their name
			const files = this.app.vault.getMarkdownFiles();
			for (const file of files) {
				if (dateStr && (file.basename === dateStr || file.basename.includes(dateStr))) {
					const content = await this.app.vault.read(file);
					return { success: true, path: file.path, content, exists: true };
				}
			}

			return { success: true, exists: false, error: `No daily note found for ${dateStr}. Common paths checked: ${possiblePaths.join(", ")}` };
		} catch (error) {
			return { success: false, exists: false, error: `Failed to get daily note: ${error}` };
		}
	}

	async renameNote(oldPath: string, newPath: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
		try {
			const normalizedOldPath = normalizeVaultPath(oldPath);
			const file = this.app.vault.getAbstractFileByPath(normalizedOldPath);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `Note not found: ${oldPath}` };
			}

			// Normalize new path and ensure .md extension
			const normalizedNewPath = ensureMarkdownExtension(newPath);

			// Check if target already exists
			const existing = this.app.vault.getAbstractFileByPath(normalizedNewPath);
			if (existing) {
				return { success: false, error: `A note already exists at: ${normalizedNewPath}` };
			}

			await this.app.fileManager.renameFile(file, normalizedNewPath);
			return { success: true, newPath: normalizedNewPath };
		} catch (error) {
			return { success: false, error: `Failed to rename note: ${error}` };
		}
	}

}
