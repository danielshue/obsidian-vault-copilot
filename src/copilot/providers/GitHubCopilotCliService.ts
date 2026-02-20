/**
 * @module GitHubCopilotCliService
 * @description GitHub Copilot CLI SDK integration for Vault Copilot.
 *
 * This module provides the primary AI provider implementation using the
 * GitHub Copilot SDK (`@github/copilot-sdk`). It enables full-featured
 * AI assistance with tool calling, streaming, and custom skill support.
 *
 * ## Features
 *
 * - **Copilot SDK Integration**: Full CopilotClient and CopilotSession support
 * - **Tool Calling**: Built-in vault operations + MCP server tools
 * - **Custom Skills**: Load .skill.md files for specialized behaviors
 * - **Custom Instructions**: Support AGENTS.md and copilot-instructions.md
 * - **Streaming**: Real-time response streaming with delta callbacks
 * - **Tracing**: Integration with TracingService for diagnostics
 *
 * ## Architecture
 *
 * ```
 * GitHubCopilotCliService
 *   ├── CopilotClient (SDK)
 *   │    └── CopilotSession (per conversation)
 *   ├── ToolManager (built-in + MCP tools)
 *   ├── CustomizationLoader (skills, instructions, prompts)
 *   └── McpManager (MCP server tools)
 * ```
 *
 * ## Desktop Only
 *
 * This provider requires the Copilot CLI and is only available on desktop.
 * Mobile platforms should use {@link OpenAIService} instead.
 *
 * @example
 * ```typescript
 * const service = new GitHubCopilotCliService(app, {
 *   model: 'gpt-4.1',
 *   streaming: true,
 *   vaultPath: '/path/to/vault',
 * });
 *
 * await service.initialize();
 * await service.sendMessageStreaming('Help me organize my notes', {
 *   onDelta: (chunk) => appendToUI(chunk),
 * });
 * ```
 *
 * @see {@link AIProvider} for the base class interface
 * @see {@link GitHubCopilotCliManager} for CLI management
 * @since 0.0.1
 */

import { CopilotClient, CopilotSession, SessionEvent, defineTool } from "@github/copilot-sdk";
import { App, TFile } from "obsidian";
import { existsSync } from "node:fs";
import * as nodePath from "node:path";
import { SkillRegistry, VaultCopilotSkill } from "../customization/SkillRegistry";
import { CustomizationLoader, CustomInstruction } from "../customization/CustomizationLoader";
import { McpManager, McpManagerEvent } from "../mcp/McpManager";
import { McpTool } from "../mcp/McpTypes";
import { normalizeVaultPath, ensureMarkdownExtension } from "../../utils/pathUtils";
import * as VaultOps from "../tools/VaultOperations";
import { getTracingService } from "../TracingService";
import { TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_JSON_SCHEMAS } from "../tools/ToolDefinitions";
import type { QuestionRequest, QuestionResponse } from "../../types/questions";
import { BASES_TOOL_NAMES, BASES_TOOL_DESCRIPTIONS, BASES_TOOL_JSON_SCHEMAS, type QueryBaseParams, type AddBaseRecordsParams, type CreateBaseParams, type ReadBaseParams, type UpdateBaseRecordsParams, type EvolveBaseSchemaParams } from "../bases/BasesToolDefinitions";
import { handleQueryBase, handleAddBaseRecords, handleCreateBase, handleReadBase, handleUpdateBaseRecords, handleEvolveBaseSchema } from "../bases/BasesToolHandlers";

export interface GitHubCopilotCliConfig {
	model: string;
	cliPath?: string;
	cliUrl?: string;
	streaming: boolean;
	/** Path to the Obsidian vault directory */
	vaultPath?: string;
	/** Enable tracing and SDK debug logging */
	tracingEnabled?: boolean;
	/** SDK log level (debug, info, warn, error). Default: info */
	logLevel?: 'debug' | 'info' | 'warn' | 'error';
	/** Skill registry for plugin-registered skills */
	skillRegistry?: SkillRegistry;
	/** MCP Manager for MCP server tools */
	mcpManager?: McpManager;
	/** Directories containing skill definition files */
	skillDirectories?: string[];
	/**
	 * Skill names to disable in the SDK session.
	 * Passed as `disabledSkills` to createSession() — the SDK will skip loading these
	 * even if they exist in the configured skillDirectories.
	 */
	disabledSkills?: string[];
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
	/** Origin of the message: 'obsidian' (default) or 'telegram' */
	source?: "obsidian" | "telegram";
	/** How the message was input: 'text' (default) or 'voice' */
	inputType?: "text" | "voice";
}

/**
 * Model capabilities info (our own primitive types, not SDK types)
 */
export interface ModelCapabilitiesInfo {
	/** Whether the model supports vision */
	supportsVision?: boolean;
	/** Maximum number of tokens in a prompt */
	maxPromptTokens?: number;
	/** Maximum context window size in tokens */
	maxContextWindowTokens?: number;
	/** Supported media types for vision */
	supportedMediaTypes?: string[];
	/** Maximum number of images in a prompt */
	maxPromptImages?: number;
	/** Maximum size of a prompt image in bytes */
	maxPromptImageSize?: number;
}

/**
 * Model policy info (our own primitive types)
 */
export interface ModelPolicyInfo {
	/** Policy state: enabled, disabled, or unconfigured */
	state: "enabled" | "disabled" | "unconfigured";
	/** Terms for using the model */
	terms: string;
}

/**
 * Model info result (our own primitive types, not SDK types)
 * Wraps the SDK's ModelInfo with our own types for API encapsulation
 */
export interface ModelInfoResult {
	/** Model identifier (e.g., "claude-sonnet-4.5") */
	id: string;
	/** Display name */
	name: string;
	/** Model capabilities */
	capabilities: ModelCapabilitiesInfo;
	/** Policy state (if available) */
	policy?: ModelPolicyInfo;
	/** Billing multiplier (if available) */
	billingMultiplier?: number;
}

/**
 * Service class that wraps the GitHub Copilot SDK for use in Obsidian.
 * Handles client lifecycle, session management, and provides Obsidian-specific tools.
 */
/** Default SDK session idle timeout (CLI auto-cleans after 30 min) */
const SDK_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Safety margin — reconnect if idle for 25 min (before the 30-min CLI timeout) */
const SESSION_STALE_THRESHOLD_MS = 25 * 60 * 1000;

export class GitHubCopilotCliService {
	private client: CopilotClient | null = null;
	private session: CopilotSession | null = null;
	private app: App;
	private config: GitHubCopilotCliConfig;
	private messageHistory: ChatMessage[] = [];
	private eventHandlers: ((event: SessionEvent) => void)[] = [];
	private customizationLoader: CustomizationLoader;
	private loadedInstructions: CustomInstruction[] = [];
	private mcpEventUnsubscribe: (() => void) | null = null;
	private questionCallback: ((question: QuestionRequest) => Promise<QuestionResponse | null>) | null = null;
	/**
	 * Timestamp (ms) of the last SDK activity (send or receive).
	 * Used to detect whether the CLI's 30-minute idle timeout has likely expired.
	 */
	private lastSdkActivity: number = Date.now();
	/**
	 * Optional callback invoked when the session is automatically recreated
	 * because the CLI idle timeout was exceeded. The UI can use this to show
	 * a subtle notification to the user.
	 */
	private onSessionReconnect: (() => void) | null = null;

	// ── Structured tracing state ──────────────────────────────────────────
	/** Active TracingService trace ID for the current session lifecycle */
	private activeSessionTraceId: string = "";
	/** Map of toolCallId → TracingService spanId for in-flight tool calls */
	private activeToolSpans: Map<string, string> = new Map();
	/** Accumulated token counts for the current session (reset on session create/resume) */
	private sessionTokenUsage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };

	constructor(app: App, config: GitHubCopilotCliConfig) {
		this.app = app;
		this.config = config;
		this.customizationLoader = new CustomizationLoader(app);
		
		// Subscribe to MCP server changes to update tools
		if (config.mcpManager) {
			const listener = (event: McpManagerEvent) => {
				if (event.type === "server-tools-updated" || event.type === "server-status-changed") {
					// Tools changed - recreate session to pick up new tools
					console.log("[GitHubCopilotCliService] MCP tools changed, session will use updated tools on next message");
				}
			};
			config.mcpManager.on(listener);
			this.mcpEventUnsubscribe = () => config.mcpManager?.off(listener);
		}
	}

	/**
	 * Resolve the Copilot CLI executable path with platform-aware fallbacks.
	 * On Windows, probes known absolute install locations since Obsidian's
	 * Electron process may not inherit the user's shell PATH.
	 *
	 * @returns The resolved CLI path (may be an absolute path on Windows)
	 * @internal
	 */
	private resolveCliPath(): string {
		const configuredCliPath = this.config.cliPath?.trim();
		if (configuredCliPath && configuredCliPath.length > 0) {
			return configuredCliPath;
		}

		if (process.platform === "win32") {
			const appData = process.env.APPDATA;
			const localAppData = process.env.LOCALAPPDATA;
			const userProfile = process.env.USERPROFILE;

			const candidates = [
				appData ? nodePath.join(appData, "npm", "copilot.cmd") : undefined,
				appData ? nodePath.join(appData, "npm", "copilot") : undefined,
				appData ? nodePath.join(appData, "Code - Insiders", "User", "globalStorage", "github.copilot-chat", "copilotCli", "copilot.bat") : undefined,
				appData ? nodePath.join(appData, "Code", "User", "globalStorage", "github.copilot-chat", "copilotCli", "copilot.bat") : undefined,
				localAppData ? nodePath.join(localAppData, "Programs", "Microsoft VS Code Insiders", "bin", "copilot.cmd") : undefined,
				localAppData ? nodePath.join(localAppData, "Programs", "Microsoft VS Code", "bin", "copilot.cmd") : undefined,
				userProfile ? nodePath.join(userProfile, "AppData", "Roaming", "npm", "copilot.cmd") : undefined,
			];

			for (const candidate of candidates) {
				if (candidate && existsSync(candidate)) {
					return candidate;
				}
			}
		}

		return "copilot";
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
		
		const resolvedCliPath = this.resolveCliPath();
		
		if (this.config.cliUrl) {
			clientOptions.cliUrl = this.config.cliUrl;
		}

		// Set vault path as working directory and add-dir for file access
		const vaultArgs: string[] = [];
		if (this.config.vaultPath) {
			// Normalize path for cross-platform compatibility
			const normalizedPath = this.config.vaultPath.replace(/\\/g, "/");
			// Set working directory for the CLI process
			clientOptions.cwd = this.config.vaultPath;
			// Add --add-dir to grant CLI access to the vault directory
			vaultArgs.push("--add-dir", normalizedPath);
		}

		// On Windows, .cmd/.bat files cannot be spawned directly without shell:true.
		// The SDK uses child_process.spawn() without shell:true, so we wrap
		// the .cmd/.bat path with cmd.exe /c to make it work.
		if (process.platform === "win32" && /\.(cmd|bat)$/i.test(resolvedCliPath)) {
			const comSpec = process.env.ComSpec || "cmd.exe";
			clientOptions.cliPath = comSpec;
			clientOptions.cliArgs = ["/c", resolvedCliPath, ...vaultArgs];
		} else {
			clientOptions.cliPath = resolvedCliPath;
			clientOptions.cliArgs = [...vaultArgs];
		}

		// Enable SDK logging when tracing is enabled
		if (this.config.tracingEnabled) {
			// Use configured log level, default to 'info' if not specified
			clientOptions.logLevel = this.config.logLevel || "info";
			
			// Intercept console.log/warn/error to capture SDK logs
			this.interceptConsoleLogs();
		}

		this.client = new CopilotClient(clientOptions);
		
		try {
			await this.client.start();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			
			// Handle specific error types with user-friendly messages
			if (errorMessage.includes('ENOENT') || errorMessage.includes('EINVAL') || errorMessage.toLowerCase().includes('not found')) {
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
	 * Set the question callback for asking the user questions via modal UI.
	 * 
	 * @param callback - Function that shows a QuestionModal and returns the user's response
	 * @since 0.0.17
	 */
	setQuestionCallback(callback: ((question: QuestionRequest) => Promise<QuestionResponse | null>) | null): void {
		this.questionCallback = callback;
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

		// Add disabled skills if configured (SDK will skip these even if found in skillDirectories)
		if (this.config.disabledSkills && this.config.disabledSkills.length > 0) {
			sessionConfig.disabledSkills = this.config.disabledSkills;
			console.log('[Vault Copilot] Disabled skills:', this.config.disabledSkills);
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
		this.touchActivity();
		
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
			this.touchActivity();
			
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
	 * List all available sessions from the SDK
	 * Maps directly to client.listSessions()
	 * @returns Array of session metadata from the SDK
	 */
	async listSessions(): Promise<Array<{ sessionId: string; startTime?: Date; modifiedTime?: Date; summary?: string; isRemote?: boolean }>> {
		if (!this.client) {
			await this.start();
		}

		try {
			const sessions = await this.client!.listSessions();
			console.log('[Vault Copilot] SDK listSessions returned:', sessions.length, 'sessions');
			return sessions.map(s => ({
				sessionId: s.sessionId,
				startTime: s.startTime,
				modifiedTime: s.modifiedTime,
				summary: s.summary,
				isRemote: s.isRemote,
			}));
		} catch (error) {
			console.error('[Vault Copilot] Failed to list sessions:', error);
			return [];
		}
	}

	/**
	 * Delete a session from the SDK
	 * Maps directly to client.deleteSession()
	 * @param sessionId The session ID to delete
	 */
	async deleteSession(sessionId: string): Promise<void> {
		if (!this.client) {
			await this.start();
		}

		try {
			await this.client!.deleteSession(sessionId);
			console.log('[Vault Copilot] SDK session deleted:', sessionId);
			
			// If we deleted the current session, clear our local state
			if (this.session?.sessionId === sessionId) {
				this.session = null;
				this.messageHistory = [];
			}
		} catch (error) {
			console.error('[Vault Copilot] Failed to delete session:', error);
			throw error;
		}
	}

	/**
	 * List available models from the SDK
	 * Maps to client.listModels() and converts to our own primitive types
	 * @returns Array of model info with only our own primitives
	 */
	async listModels(): Promise<ModelInfoResult[]> {
		if (!this.client) {
			await this.start();
		}

		try {
			const models = await this.client!.listModels();
			console.log('[Vault Copilot] SDK listModels returned:', models.length, 'models');
			return models.map(m => ({
				id: m.id,
				name: m.name,
				capabilities: {
					supportsVision: m.capabilities?.supports?.vision,
					maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
					maxContextWindowTokens: m.capabilities?.limits?.max_context_window_tokens,
					supportedMediaTypes: m.capabilities?.limits?.vision?.supported_media_types,
					maxPromptImages: m.capabilities?.limits?.vision?.max_prompt_images,
					maxPromptImageSize: m.capabilities?.limits?.vision?.max_prompt_image_size,
				},
				policy: m.policy ? {
					state: m.policy.state,
					terms: m.policy.terms,
				} : undefined,
				billingMultiplier: m.billing?.multiplier,
			}));
		} catch (error) {
			console.error('[Vault Copilot] Failed to list models:', error);
			return [];
		}
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
			
			// Cast needed: defineTool returns Tool<T> with varying T per handler signature
			tools.push(tool as any);
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

			// Cast needed: defineTool returns Tool<T> with varying T per handler signature
			tools.push(sdkTool as any);
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
	 * Register a callback that fires when the session is transparently recreated
	 * after the CLI idle timeout (~30 min). The UI should use this to show an
	 * informational notice so the user knows AI context was reset.
	 *
	 * @param callback - Function to call on reconnect, or null to unregister
	 */
	setSessionReconnectCallback(callback: (() => void) | null): void {
		this.onSessionReconnect = callback;
	}

	/**
	 * Update the last-activity timestamp. Called after every SDK interaction
	 * (sending a prompt or receiving a response) to track idle time.
	 * @internal
	 */
	private touchActivity(): void {
		this.lastSdkActivity = Date.now();
	}

	/**
	 * Check whether the SDK session has likely expired due to the CLI's
	 * 30-minute idle timeout. If the session is stale (>25 min idle),
	 * transparently recreate it and restore local message history.
	 *
	 * @returns true if the session was recreated, false if still alive
	 * @internal
	 */
	private async ensureSessionAlive(): Promise<boolean> {
		if (!this.session) return false;

		const idleMs = Date.now() - this.lastSdkActivity;
		if (idleMs < SESSION_STALE_THRESHOLD_MS) return false;

		const idleMinutes = Math.round(idleMs / 60000);
		console.log(`[Vault Copilot] Session idle for ${idleMinutes} min (threshold: ${SESSION_STALE_THRESHOLD_MS / 60000} min) — recreating`);

		const tracingService = getTracingService();
		tracingService.addSdkLog('info', `[Session Reconnect] Idle ${idleMinutes} min — recreating session`, 'session-lifecycle');

		// Preserve current message history before recreating
		const savedHistory = [...this.messageHistory];
		const currentSessionId = this.session.sessionId;

		try {
			await this.createSession(currentSessionId);
			// Restore the local message history (AI context is lost, but UI history is preserved)
			this.messageHistory = savedHistory;
			this.touchActivity();

			// Notify the UI
			if (this.onSessionReconnect) {
				this.onSessionReconnect();
			}
			return true;
		} catch (error) {
			console.error('[Vault Copilot] Failed to recreate stale session:', error);
			tracingService.addSdkLog('error', `[Session Reconnect Failed] ${error}`, 'session-lifecycle');
			throw error;
		}
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

		// Check if the session has gone stale (CLI 30-min idle timeout)
		await this.ensureSessionAlive();

		// Log the prompt to tracing service
		const tracingService = getTracingService();
		tracingService.addSdkLog('info', `[User Prompt]\n${prompt}`, 'copilot-prompt');

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
			source: "obsidian" as const,
		});

		this.touchActivity();

		const requestTimeout = timeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
		
		try {
			const response = await this.session!.sendAndWait({ prompt }, requestTimeout);
			
			this.touchActivity();

			const assistantContent = response?.data?.content || "";
			
			// Log the response to tracing service
			tracingService.addSdkLog('info', `[Assistant Response]\n${assistantContent.substring(0, 500)}${assistantContent.length > 500 ? '...' : ''}`, 'copilot-response');
			
			this.messageHistory.push({
				role: "assistant",
				content: assistantContent,
				timestamp: new Date(),
				source: "obsidian" as const,
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

		// Check if the session has gone stale (CLI 30-min idle timeout)
		await this.ensureSessionAlive();

		// Log the prompt to tracing service
		const tracingService = getTracingService();
		tracingService.addSdkLog('info', `[User Prompt (Streaming)]\n${prompt}`, 'copilot-prompt');

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
			source: "obsidian" as const,
		});

		this.touchActivity();

		let fullContent = "";
		let finalContent = "";
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

			/**
			 * Reset the inactivity timeout.
			 * Called on every SDK event so that interactive tool calls (like ask_question,
			 * which block while waiting for user input) don't cause a spurious timeout.
			 */
			const resetTimeout = () => {
				if (hasCompleted) return;
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
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
						
						tracingService.addSdkLog('error', `[Streaming Timeout] Request timed out after ${requestTimeout / 1000} seconds of inactivity`, 'copilot-error');
						reject(new Error(`Streaming request timed out after ${requestTimeout / 1000} seconds of inactivity`));
					}
				}, requestTimeout);
			};
			
			// Start the initial timeout
			resetTimeout();
			
			// Track last content passed to onComplete to avoid redundant renders
			// when assistant.message and session.idle fire back-to-back with identical content
			let lastRenderedContent = "";

			const unsubscribe = this.session!.on((event: SessionEvent) => {
				if (hasCompleted) return;

				// Reset timeout on every event — keeps the clock alive during
				// interactive tool calls (e.g. ask_question waiting for user input)
				resetTimeout();
				
				// Log all events for debugging (except deltas which are too verbose)
				if (event.type !== "assistant.message_delta" && event.type !== "assistant.reasoning_delta") {
					tracingService.addSdkLog('debug', `[SDK Event] ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`, 'copilot-event');
				}
				
				if (event.type === "assistant.message_delta") {
					const delta = (event.data as { deltaContent: string }).deltaContent;
					fullContent += delta;
					finalContent = fullContent;
					onDelta(delta);
				} else if (event.type === "assistant.message") {
					const assistantContent = (event.data as { content?: string }).content ?? "";
					if (fullContent.length === 0 || assistantContent.length > fullContent.length) {
						finalContent = assistantContent;
					} else {
						finalContent = fullContent;
					}
					// Don't reset fullContent — keep accumulating across all turns
					// so multi-turn subagent responses preserve earlier content.
					// Trigger intermediate markdown render so content is readable
					// while subsequent tool calls execute.
					// Skip if fullContent hasn't changed (empty intermediate messages
					// between tool calls would cause redundant contentEl.empty() +
					// re-render cycles that briefly blank the screen).
					if (onComplete && finalContent && finalContent !== lastRenderedContent) {
						lastRenderedContent = finalContent;
						onComplete(finalContent);
					}
				} else if (event.type === "session.idle") {
					cleanup();
					this.touchActivity();
					const resolvedContent = finalContent || fullContent;
					this.messageHistory.push({
						role: "assistant",
						content: resolvedContent,
						timestamp: new Date(),
						source: "obsidian" as const,
					});
					
					// Log the response to tracing service
					tracingService.addSdkLog('info', `[Assistant Response (Streaming)]\n${resolvedContent.substring(0, 500)}${resolvedContent.length > 500 ? '...' : ''}`, 'copilot-response');
					
					// Only call onComplete if content changed since last render
					// (assistant.message already rendered the same content moments ago)
					if (onComplete && resolvedContent !== lastRenderedContent) {
						onComplete(resolvedContent);
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
			console.warn('[Vault Copilot] Could not resume session, creating fresh SDK session with fallback messages:', error);
			// Fallback: create a NEW SDK session WITHOUT the old sessionId.
			// The old ID may be a local-only ID (e.g. from Telegram /new) that was
			// never registered with the SDK server. Passing it to createSession
			// would cause a "Session not found" error on the first sendAndWait.
			await this.createSession();
			
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
	updateConfig(config: Partial<GitHubCopilotCliConfig>): void {
		this.config = { ...this.config, ...config };
	}

	private handleSessionEvent(event: SessionEvent): void {
		// Log session event to TracingService for diagnostics
		this.logSessionEventToTracing(event);
		
		for (const handler of this.eventHandlers) {
			handler(event);
		}
	}

	/**
	 * Log session events to TracingService with enriched data and structured traces.
	 *
	 * Creates structured trace spans for session lifecycle and tool execution so that
	 * the Tracing modal shows a correlated timeline. All 32 SDK SessionEvent types are
	 * handled explicitly (no fallback to a generic default).
	 *
	 * Truncation limits:
	 * - User prompts: 1 000 chars
	 * - Tool arguments / results: 2 000 chars
	 * - Assistant messages: 500 chars
	 *
	 * @internal
	 * @see https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md
	 */
	private logSessionEventToTracing(event: SessionEvent): void {
		const eventType = event.type;

		// Skip ephemeral streaming deltas — too verbose, no diagnostic value
		if (eventType === 'assistant.message_delta' || eventType === 'assistant.reasoning_delta') {
			return;
		}

		const tracingService = getTracingService();
		const eventData = 'data' in event ? event.data : {};

		// Helper to safely truncate strings
		const truncate = (s: string | undefined, max: number): string => {
			if (!s) return '';
			return s.length > max ? s.substring(0, max) + '…' : s;
		};

		// Helper to safely stringify objects for logging
		const safeStringify = (obj: unknown, max: number): string => {
			try {
				const json = JSON.stringify(obj);
				return truncate(json, max);
			} catch {
				return '[unserializable]';
			}
		};

		let level: 'debug' | 'info' | 'warning' | 'error' = 'debug';
		let source = 'sdk-event';
		let message = '';

		switch (eventType) {
			// ── Session lifecycle ───────────────────────────────────────────
			case 'session.start': {
				level = 'info';
				source = 'session-lifecycle';
				const d = eventData as {
					sessionId?: string; version?: string;
					copilotVersion?: string; selectedModel?: string;
					context?: Record<string, unknown>;
				};
				message = `[Session Start] sessionId=${d.sessionId || 'unknown'} model=${d.selectedModel || 'unknown'} sdk=${d.version || '?'} copilot=${d.copilotVersion || '?'}`;

				// Start a structured trace for this session
				this.sessionTokenUsage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
				this.activeToolSpans.clear();
				this.activeSessionTraceId = tracingService.startTrace(
					`Session ${d.sessionId?.substring(0, 8) || 'unknown'}`,
					{ sessionId: d.sessionId, model: d.selectedModel, sdkVersion: d.version, copilotVersion: d.copilotVersion },
				);
				break;
			}
			case 'session.resume': {
				level = 'info';
				source = 'session-lifecycle';
				const d = eventData as { eventCount?: number; resumeTime?: number; context?: Record<string, unknown> };
				message = `[Session Resume] eventCount=${d.eventCount || 0}`;

				this.sessionTokenUsage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
				this.activeToolSpans.clear();
				this.activeSessionTraceId = tracingService.startTrace(
					'Session Resumed',
					{ eventCount: d.eventCount },
				);
				break;
			}
			case 'session.idle': {
				level = 'info';
				source = 'session-lifecycle';
				const tokenSummary = this.sessionTokenUsage.inputTokens + this.sessionTokenUsage.outputTokens > 0
					? ` tokens(in=${this.sessionTokenUsage.inputTokens} out=${this.sessionTokenUsage.outputTokens})`
					: '';
				message = `[Session Idle]${tokenSummary}`;

				// End the structured session trace
				if (this.activeSessionTraceId) {
					tracingService.endTrace(this.activeSessionTraceId);
					this.activeSessionTraceId = '';
				}
				break;
			}
			case 'session.error': {
				level = 'error';
				source = 'session-lifecycle';
				const d = eventData as { errorType?: string; message?: string; stack?: string };
				message = `[Session Error] ${d.errorType || 'unknown'}: ${d.message || 'Unknown error'}`;
				if (d.stack) {
					message += `\n${truncate(d.stack, 1000)}`;
				}

				// Record error as a span on the session trace
				if (this.activeSessionTraceId) {
					const spanId = tracingService.addSpan(this.activeSessionTraceId, 'Session Error', 'error', {
						errorType: d.errorType, message: d.message, stack: d.stack,
					});
					tracingService.completeSpan(spanId, d.message || 'Session error');
				}
				break;
			}
			case 'session.info': {
				level = 'info';
				source = 'session-lifecycle';
				const d = eventData as { infoType?: string; message?: string };
				message = `[Session Info] ${d.infoType || 'unknown'}: ${d.message || ''}`;
				break;
			}

			// ── Session state ──────────────────────────────────────────────
			case 'session.model_change': {
				level = 'info';
				source = 'session-state';
				const d = eventData as { previousModel?: string; newModel?: string };
				message = `[Model Change] ${d.previousModel || 'none'} → ${d.newModel || 'unknown'}`;
				break;
			}
			case 'session.handoff': {
				level = 'info';
				source = 'session-state';
				const d = eventData as { sourceType?: string; repository?: string; summary?: string };
				message = `[Session Handoff] sourceType=${d.sourceType || 'unknown'}${d.repository ? ` repo=${d.repository}` : ''}`;
				break;
			}
			case 'session.truncation': {
				level = 'warning';
				source = 'session-state';
				const d = eventData as {
					tokenLimit?: number; preTokenCount?: number; postTokenCount?: number;
					preMessageCount?: number; postMessageCount?: number;
				};
				message = `[Session Truncation] limit=${d.tokenLimit || '?'} tokens(${d.preTokenCount || '?'}→${d.postTokenCount || '?'}) messages(${d.preMessageCount || '?'}→${d.postMessageCount || '?'})`;
				break;
			}
			case 'session.snapshot_rewind': {
				level = 'info';
				source = 'session-state';
				const d = eventData as { upToEventId?: string; eventsRemoved?: number };
				message = `[Snapshot Rewind] upToEventId=${d.upToEventId || '?'} eventsRemoved=${d.eventsRemoved ?? '?'}`;
				break;
			}
			case 'session.usage_info': {
				level = 'debug';
				source = 'session-state';
				const d = eventData as { tokenLimit?: number; currentTokens?: number; messagesLength?: number };
				message = `[Usage Info] tokens=${d.currentTokens || 0}/${d.tokenLimit || '?'} messages=${d.messagesLength || 0}`;
				break;
			}
			case 'session.compaction_start': {
				level = 'info';
				source = 'session-state';
				message = '[Compaction Start]';
				break;
			}
			case 'session.compaction_complete': {
				level = 'info';
				source = 'session-state';
				const d = eventData as {
					success?: boolean; preTokenCount?: number; postTokenCount?: number;
					summaryContent?: string;
				};
				message = `[Compaction Complete] success=${d.success ?? '?'} tokens(${d.preTokenCount || '?'}→${d.postTokenCount || '?'})`;
				break;
			}

			// ── User events ────────────────────────────────────────────────
			case 'user.message': {
				level = 'info';
				source = 'user-event';
				const d = eventData as { content?: string; source?: string; attachments?: unknown[]; transformedContent?: string };
				const preview = truncate(d.content, 1000);
				const attachCount = Array.isArray(d.attachments) ? d.attachments.length : 0;
				message = `[User Message] ${preview}`;
				if (d.source) message += ` (source=${d.source})`;
				if (attachCount > 0) message += ` [${attachCount} attachment(s)]`;

				// Record as a span so it appears in the trace timeline
				if (this.activeSessionTraceId) {
					const spanId = tracingService.addSpan(this.activeSessionTraceId, 'User Prompt', 'user-message', {
						contentLength: d.content?.length || 0,
						source: d.source,
						attachments: attachCount,
					});
					tracingService.completeSpan(spanId);
				}
				break;
			}
			case 'pending_messages.modified': {
				level = 'debug';
				source = 'user-event';
				message = '[Pending Messages Modified]';
				break;
			}

			// ── Assistant events ───────────────────────────────────────────
			case 'assistant.turn_start': {
				level = 'debug';
				source = 'assistant-event';
				const d = eventData as { turnId?: string };
				message = `[Turn Start] turnId=${d.turnId || 'unknown'}`;
				break;
			}
			case 'assistant.intent': {
				level = 'info';
				source = 'assistant-event';
				const d = eventData as { intent?: string };
				message = `[Intent] ${truncate(d.intent, 500)}`;
				break;
			}
			case 'assistant.reasoning': {
				level = 'debug';
				source = 'assistant-event';
				const d = eventData as { reasoningId?: string; content?: string };
				message = `[Reasoning] reasoningId=${d.reasoningId || 'unknown'} ${truncate(d.content, 300)}`;
				break;
			}
			case 'assistant.message': {
				level = 'info';
				source = 'assistant-event';
				const d = eventData as { messageId?: string; content?: string; toolRequests?: unknown[] };
				const toolReqs = Array.isArray(d.toolRequests) ? d.toolRequests.length : 0;
				message = `[Assistant Message] ${truncate(d.content, 500)}`;
				if (toolReqs > 0) message += ` [${toolReqs} tool request(s)]`;
				break;
			}
			case 'assistant.turn_end': {
				level = 'debug';
				source = 'assistant-event';
				const d = eventData as { turnId?: string };
				message = `[Turn End] turnId=${d.turnId || 'unknown'}`;
				break;
			}
			case 'assistant.usage': {
				level = 'info';
				source = 'assistant-event';
				const d = eventData as {
					model?: string; inputTokens?: number; outputTokens?: number;
					cacheReadTokens?: number; cost?: number; duration?: number;
				};
				// Accumulate per-session totals
				this.sessionTokenUsage.inputTokens += d.inputTokens || 0;
				this.sessionTokenUsage.outputTokens += d.outputTokens || 0;
				this.sessionTokenUsage.totalCost += d.cost || 0;

				message = `[Usage] model=${d.model || 'unknown'} input=${d.inputTokens || 0} output=${d.outputTokens || 0}`;
				if (d.cacheReadTokens) message += ` cache=${d.cacheReadTokens}`;
				if (d.cost !== undefined) message += ` cost=$${d.cost.toFixed(4)}`;
				if (d.duration) message += ` duration=${d.duration}ms`;
				message += ` | session_total(in=${this.sessionTokenUsage.inputTokens} out=${this.sessionTokenUsage.outputTokens})`;
				break;
			}

			// ── Tool events ────────────────────────────────────────────────
			case 'tool.user_requested': {
				level = 'info';
				source = 'tool-event';
				const d = eventData as { toolName?: string; toolCallId?: string; arguments?: unknown };
				message = `[Tool Requested] ${d.toolName || 'unknown'}`;
				if (d.arguments) message += ` args=${safeStringify(d.arguments, 500)}`;
				break;
			}
			case 'tool.execution_start': {
				level = 'info';
				source = 'tool-event';
				const d = eventData as {
					toolName?: string; toolCallId?: string; arguments?: unknown;
					mcpServerName?: string; parentToolCallId?: string;
				};
				const toolName = d.toolName || 'unknown';
				message = `[Tool Start] ${toolName} (${d.toolCallId || 'unknown'})`;
				if (d.mcpServerName) message += ` mcp=${d.mcpServerName}`;
				if (d.arguments) message += ` args=${safeStringify(d.arguments, 2000)}`;

				// Start a structured span for this tool call
				if (this.activeSessionTraceId && d.toolCallId) {
					const spanId = tracingService.addSpan(this.activeSessionTraceId, `Tool: ${toolName}`, 'tool-call', {
						toolName,
						toolCallId: d.toolCallId,
						mcpServerName: d.mcpServerName,
						arguments: d.arguments,
					});
					this.activeToolSpans.set(d.toolCallId, spanId);
				}
				break;
			}
			case 'tool.execution_partial_result': {
				level = 'debug';
				source = 'tool-event';
				const d = eventData as { toolCallId?: string; partialOutput?: string };
				message = `[Tool Partial] ${d.toolCallId || 'unknown'} ${truncate(d.partialOutput, 200)}`;
				break;
			}
			case 'tool.execution_progress': {
				level = 'debug';
				source = 'tool-event';
				const d = eventData as { toolCallId?: string; progressMessage?: string };
				message = `[Tool Progress] ${d.toolCallId || 'unknown'}: ${d.progressMessage || ''}`;
				break;
			}
			case 'tool.execution_complete': {
				const d = eventData as {
					toolCallId?: string; toolName?: string; success?: boolean;
					result?: unknown; error?: string; toolTelemetry?: Record<string, unknown>;
				};
				level = d.success === false ? 'error' : 'info';
				source = 'tool-event';
				const toolCallId = d.toolCallId || 'unknown';
				message = `[Tool Complete] ${toolCallId} success=${d.success ?? 'unknown'}`;
				if (d.success === false && d.error) {
					message += ` error=${truncate(d.error, 500)}`;
				}
				if (d.result !== undefined) {
					message += ` result=${safeStringify(d.result, 2000)}`;
				}

				// Complete the structured span
				if (d.toolCallId) {
					const spanId = this.activeToolSpans.get(d.toolCallId);
					if (spanId) {
						tracingService.completeSpan(spanId, d.success === false ? (d.error || 'Tool failed') : undefined);
						this.activeToolSpans.delete(d.toolCallId);
					}
				}
				break;
			}

			// ── Subagent events ────────────────────────────────────────────
			case 'subagent.started': {
				level = 'info';
				source = 'subagent-event';
				const d = eventData as { toolCallId?: string; agentName?: string; agentDisplayName?: string; agentDescription?: string };
				message = `[Subagent Started] ${d.agentDisplayName || d.agentName || 'unknown'}`;
				if (d.agentDescription) message += `: ${truncate(d.agentDescription, 200)}`;

				// Start a span for the subagent
				if (this.activeSessionTraceId && d.toolCallId) {
					const spanId = tracingService.addSpan(this.activeSessionTraceId, `Subagent: ${d.agentDisplayName || d.agentName || 'unknown'}`, 'subagent', {
						agentName: d.agentName,
						agentDisplayName: d.agentDisplayName,
					});
					this.activeToolSpans.set(d.toolCallId, spanId);
				}
				break;
			}
			case 'subagent.completed': {
				level = 'info';
				source = 'subagent-event';
				const d = eventData as { toolCallId?: string; agentName?: string };
				message = `[Subagent Completed] ${d.agentName || 'unknown'}`;

				if (d.toolCallId) {
					const spanId = this.activeToolSpans.get(d.toolCallId);
					if (spanId) {
						tracingService.completeSpan(spanId);
						this.activeToolSpans.delete(d.toolCallId);
					}
				}
				break;
			}
			case 'subagent.failed': {
				level = 'error';
				source = 'subagent-event';
				const d = eventData as { toolCallId?: string; agentName?: string; error?: string };
				message = `[Subagent Failed] ${d.agentName || 'unknown'}: ${d.error || 'Unknown error'}`;

				if (d.toolCallId) {
					const spanId = this.activeToolSpans.get(d.toolCallId);
					if (spanId) {
						tracingService.completeSpan(spanId, d.error || 'Subagent failed');
						this.activeToolSpans.delete(d.toolCallId);
					}
				}
				break;
			}
			case 'subagent.selected': {
				level = 'info';
				source = 'subagent-event';
				const d = eventData as { agentName?: string; agentDisplayName?: string; tools?: unknown[] };
				const toolCount = Array.isArray(d.tools) ? d.tools.length : 0;
				message = `[Subagent Selected] ${d.agentDisplayName || d.agentName || 'unknown'} (${toolCount} tools)`;
				break;
			}

			// ── Abort ──────────────────────────────────────────────────────
			case 'abort': {
				level = 'warning';
				source = 'session-lifecycle';
				const d = eventData as { reason?: string };
				message = `[Abort] reason=${d.reason || 'unknown'}`;

				// End the session trace on abort
				if (this.activeSessionTraceId) {
					tracingService.endTrace(this.activeSessionTraceId);
					this.activeSessionTraceId = '';
				}
				break;
			}

			// ── Hook observation ───────────────────────────────────────────
			case 'hook.start': {
				level = 'debug';
				source = 'hook-event';
				const d = eventData as { hookInvocationId?: string; hookType?: string; input?: unknown };
				message = `[Hook Start] type=${d.hookType || 'unknown'} id=${d.hookInvocationId || 'unknown'}`;
				break;
			}
			case 'hook.end': {
				level = 'debug';
				source = 'hook-event';
				const d = eventData as { hookInvocationId?: string; hookType?: string; success?: boolean; error?: string };
				message = `[Hook End] type=${d.hookType || 'unknown'} success=${d.success ?? '?'}`;
				if (d.error) message += ` error=${truncate(d.error, 200)}`;
				break;
			}

			// ── System message ─────────────────────────────────────────────
			case 'system.message': {
				level = 'info';
				source = 'system-event';
				const d = eventData as { content?: string; role?: string; name?: string };
				message = `[System Message] role=${d.role || 'system'}${d.name ? ` name=${d.name}` : ''} ${truncate(d.content, 500)}`;
				break;
			}

			// ── Catch-all for any future/unknown event types ───────────────
			default:
				level = 'debug';
				source = 'sdk-event';
				message = `[${eventType}] ${safeStringify(eventData, 500)}`;
		}

		tracingService.addSdkLog(level, message, source);
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
await vc.listSessions(): Promise<SessionInfo[]>
vc.getActiveSessionId(): string | null
await vc.createSession(name?): Promise<SessionInfo>
await vc.loadSession(sessionId): Promise<void>
await vc.archiveSession(sessionId): Promise<void>
await vc.unarchiveSession(sessionId): Promise<void>
await vc.deleteSession(sessionId): Promise<void>
await vc.renameSession(sessionId, newName): Promise<void>

// Model discovery
await vc.listModels(): Promise<ModelInfoResult[]>

// Note operations
await vc.readNote(path): Promise<{ success, content?, error? }>
await vc.searchNotes(query, limit?): Promise<{ results: Array<{ path, title, excerpt }> }>
await vc.createNote(path, content): Promise<{ success, path?, error? }>
await vc.updateNote(path, content): Promise<{ success, error? }>
await vc.deleteNote(path): Promise<{ success, error? }>
await vc.appendToNote(path, content): Promise<{ success, error? }>
await vc.batchReadNotes(paths, aiSummarize?, summaryPrompt?): Promise<{ results: Array<{ path, success, content?, summary?, error? }> }>
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
- When reading 10+ files, use batch_read_notes with aiSummarize=true to get AI-generated summaries instead of full content

## Obsidian Bases (.base files)
When the user asks you to create a Base, just call create_base with the path (and optionally name, description, and filters). The tool will automatically:
1. Scan vault notes near the target path to discover frontmatter properties
2. Present an interactive checkbox question to the user asking which properties to include as columns
3. Ask the user to select a view type (table, card, list)
4. Create the Base with the user's selections

You do NOT need to scan notes yourself or present properties manually — the tool handles all of this via inline question UI. Just call create_base once.

IMPORTANT: Do NOT pass a "properties" array unless the user has explicitly told you the exact property names. If you pass properties, the interactive discovery will be skipped and the user won't get to choose.

### Bases filter syntax reference
- Frontmatter property comparison: \`status != "archived"\` or \`priority == "high"\`
- Folder scoping: \`file.inFolder("Projects/MBA")\`
- Tag filtering: \`file.hasTag("lesson")\`
- Operators: ==, !=, >, <, >=, <=
- String values must be in double quotes
- Filters go inside an \`and:\` or \`or:\` group

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
		const tools = [
			defineTool(TOOL_NAMES.READ_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.READ_NOTE],
				handler: async (args: { path: string }) => {
					return await VaultOps.readNote(this.app, args.path);
				},
			}),

			defineTool(TOOL_NAMES.SEARCH_NOTES, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.SEARCH_NOTES],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.SEARCH_NOTES],
				handler: async (args: { query: string; limit?: number }) => {
					return await VaultOps.searchNotes(this.app, args.query, args.limit ?? 10);
				},
			}),

			defineTool(TOOL_NAMES.CREATE_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.CREATE_NOTE],
				handler: async (args: { path: string; content: string }) => {
					return await VaultOps.createNote(this.app, args.path, args.content);
				},
			}),

			defineTool(TOOL_NAMES.GET_ACTIVE_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_ACTIVE_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_ACTIVE_NOTE],
				handler: async () => {
					return await VaultOps.getActiveNote(this.app);
				},
			}),

			defineTool(TOOL_NAMES.LIST_NOTES, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES],
				handler: async (args: { folder?: string }) => {
					return await VaultOps.listNotes(this.app, args.folder);
				},
			}),

			defineTool(TOOL_NAMES.LIST_NOTES_RECURSIVELY, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES_RECURSIVELY],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES_RECURSIVELY],
				handler: async (args: { folder?: string; limit?: number }) => {
					return await VaultOps.listNotesRecursively(this.app, args.folder, args.limit);
				},
			}),

			defineTool(TOOL_NAMES.APPEND_TO_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.APPEND_TO_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.APPEND_TO_NOTE],
				handler: async (args: { path: string; content: string }) => {
					return await VaultOps.appendToNote(this.app, args.path, args.content);
				},
			}),

			defineTool(TOOL_NAMES.BATCH_READ_NOTES, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.BATCH_READ_NOTES],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.BATCH_READ_NOTES],
				handler: async (args: { paths: string[]; aiSummarize?: boolean; summaryPrompt?: string }) => {
					return await this.batchReadNotes(args.paths, args.aiSummarize, args.summaryPrompt);
				},
			}),

			defineTool(TOOL_NAMES.UPDATE_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.UPDATE_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.UPDATE_NOTE],
				handler: async (args: { path: string; content: string }) => {
					return await VaultOps.updateNote(this.app, args.path, args.content);
				},
			}),

			defineTool(TOOL_NAMES.DELETE_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.DELETE_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.DELETE_NOTE],
				handler: async (args: { path: string }) => {
					return await VaultOps.deleteNote(this.app, args.path);
				},
			}),

			defineTool(TOOL_NAMES.GET_RECENT_CHANGES, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_RECENT_CHANGES],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_RECENT_CHANGES],
				handler: async (args: { limit?: number }) => {
					return await VaultOps.getRecentChanges(this.app, args.limit ?? 10);
				},
			}),

			defineTool(TOOL_NAMES.PATCH_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.PATCH_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.PATCH_NOTE],
				handler: async (args: { path: string; operation: string; target_type: string; target?: string; content: string }) => {
					return await VaultOps.patchNote(this.app, args.path, args.operation as VaultOps.PatchOperation, args.target_type as VaultOps.PatchTargetType, args.target, args.content);
				},
			}),

			defineTool(TOOL_NAMES.GET_DAILY_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_DAILY_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_DAILY_NOTE],
				handler: async (args: { date?: string }) => {
					return await VaultOps.getDailyNote(this.app, args.date);
				},
			}),

			defineTool(TOOL_NAMES.RENAME_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.RENAME_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.RENAME_NOTE],
				handler: async (args: { oldPath: string; newPath: string }) => {
					return await VaultOps.renameNote(this.app, args.oldPath, args.newPath);
				},
			}),

			defineTool(TOOL_NAMES.FETCH_WEB_PAGE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.FETCH_WEB_PAGE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.FETCH_WEB_PAGE],
				handler: async (args: { url: string }) => {
					return await VaultOps.fetchWebPage(args.url);
				},
			}),

			// Bases AI tools
			defineTool(BASES_TOOL_NAMES.CREATE_BASE, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.CREATE_BASE],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.CREATE_BASE],
				handler: async (args: CreateBaseParams) => {
					return await handleCreateBase(this.app, args, this.questionCallback);
				},
			}),

			defineTool(BASES_TOOL_NAMES.READ_BASE, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.READ_BASE],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.READ_BASE],
				handler: async (args: ReadBaseParams) => {
					return await handleReadBase(this.app, args);
				},
			}),

			defineTool(BASES_TOOL_NAMES.QUERY_BASE, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.QUERY_BASE],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.QUERY_BASE],
				handler: async (args: QueryBaseParams) => {
					return await handleQueryBase(this.app, args);
				},
			}),

			defineTool(BASES_TOOL_NAMES.ADD_BASE_RECORDS, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.ADD_BASE_RECORDS],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.ADD_BASE_RECORDS],
				handler: async (args: AddBaseRecordsParams) => {
					return await handleAddBaseRecords(this.app, args);
				},
			}),

			defineTool(BASES_TOOL_NAMES.UPDATE_BASE_RECORDS, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS],
				handler: async (args: UpdateBaseRecordsParams) => {
					return await handleUpdateBaseRecords(this.app, args);
				},
			}),

			defineTool(BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA],
				handler: async (args: EvolveBaseSchemaParams) => {
					return await handleEvolveBaseSchema(this.app, args);
				},
			}),

			// Introspection tools
			defineTool(TOOL_NAMES.LIST_AVAILABLE_TOOLS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_TOOLS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_TOOLS],
				handler: async (args: { source?: string }) => {
					const source = args.source || "all";
					const catalog = new (await import("../tools/ToolCatalog")).ToolCatalog(
						this.config.skillRegistry,
						this.config.mcpManager
					);
					const allTools = catalog.getAllTools();
					const filtered = source === "all"
						? allTools
						: allTools.filter(t => t.source === source);
					return {
						count: filtered.length,
						source,
						tools: filtered.map(t => ({
							id: t.id,
							displayName: t.displayName,
							description: t.description,
							source: t.source,
							...(t.serverName ? { serverName: t.serverName } : {}),
						})),
					};
				},
			}),

			defineTool(TOOL_NAMES.LIST_AVAILABLE_SKILLS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_SKILLS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_SKILLS],
				handler: async (args: { source?: string }) => {
					const source = args.source || "all";
					const results: Array<{ name: string; description: string; source: string; path?: string; resources?: Array<{ name: string; path: string; type: string }> }> = [];

					// File-based skills from CustomizationLoader
					if (source === "all" || source === "file") {
						const dirs = this.config.skillDirectories ?? [];
						const fileSkills = await this.customizationLoader.loadSkills(dirs);
						for (const skill of fileSkills) {
							// Enforce disableModelInvocation: skip skills that opt out of AI auto-discovery
							if (skill.disableModelInvocation === true) continue;

							results.push({
								name: skill.name,
								description: skill.description,
								source: "file",
								path: skill.path,
								resources: skill.resources?.map(r => ({
									name: r.name,
									path: r.relativePath,
									type: r.type,
								})),
							});
						}
					}

					// Runtime skills from SkillRegistry
					if (source === "all" || source === "runtime") {
						if (this.config.skillRegistry) {
							for (const skill of this.config.skillRegistry.listSkills()) {
								results.push({
									name: skill.name,
									description: skill.description,
									source: "runtime",
								});
							}
						}
					}

					return { count: results.length, source, skills: results };
				},
			}),

			defineTool(TOOL_NAMES.READ_SKILL_RESOURCE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_SKILL_RESOURCE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.READ_SKILL_RESOURCE],
				handler: async (args: { skillName: string; resourcePath: string }) => {
					// Find the skill to get its path
					const dirs = this.config.skillDirectories ?? [];
					const fileSkills = await this.customizationLoader.loadSkills(dirs);
					const skill = fileSkills.find(s => s.name.toLowerCase() === args.skillName.toLowerCase());
					if (!skill) {
						return { error: `Skill '${args.skillName}' not found. Use list_available_skills to see available skills.` };
					}

					try {
						const content = await this.customizationLoader.readSkillResource(skill.path, args.resourcePath);
						if (content === null) {
							return { error: `Resource '${args.resourcePath}' not found in skill '${args.skillName}'.` };
						}
						return {
							skillName: args.skillName,
							resourcePath: args.resourcePath,
							content,
							size: content.length,
						};
					} catch (err) {
						return { error: `Failed to read resource: ${err instanceof Error ? err.message : String(err)}` };
					}
				},
			}),

			defineTool(TOOL_NAMES.LIST_AVAILABLE_AGENTS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_AGENTS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_AGENTS],
				handler: async (args: { name?: string }) => {
					const dirs = this.config.agentDirectories ?? [];
					const agents = await this.customizationLoader.loadAgents(dirs);
					const filtered = args.name
						? agents.filter(a => a.name.toLowerCase().includes(args.name!.toLowerCase()))
						: agents;
					return {
						count: filtered.length,
						agents: filtered.map(a => ({
							name: a.name,
							description: a.description,
							tools: a.tools ?? [],
							path: a.path,
						})),
					};
				},
			}),

			defineTool(TOOL_NAMES.LIST_AVAILABLE_PROMPTS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_PROMPTS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_PROMPTS],
				handler: async (args: { name?: string }) => {
					const dirs = this.config.promptDirectories ?? [];
					const prompts = await this.customizationLoader.loadPrompts(dirs);
					const filtered = args.name
						? prompts.filter(p => p.name.toLowerCase().includes(args.name!.toLowerCase()))
						: prompts;
					return {
						count: filtered.length,
						prompts: filtered.map(p => ({
							name: p.name,
							description: p.description,
							tools: p.tools ?? [],
							model: p.model,
							agent: p.agent,
							path: p.path,
						})),
					};
				},
			}),

			defineTool(TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS],
				handler: async (args: { applyTo?: string }) => {
					const dirs = this.config.instructionDirectories ?? [];
					const instructions = await this.customizationLoader.loadInstructions(dirs);
					const filtered = args.applyTo
						? instructions.filter(i => i.applyTo?.toLowerCase().includes(args.applyTo!.toLowerCase()))
						: instructions;
					return {
						count: filtered.length,
						instructions: filtered.map(i => ({
							name: i.name,
							applyTo: i.applyTo,
							path: i.path,
						})),
					};
				},
			}),
		];

		// Add ask_question tool if question callback is available
		if (this.questionCallback) {
			const callback = this.questionCallback;
			// Cast needed: defineTool returns Tool<T> with varying T per handler signature
			tools.push(
				defineTool(TOOL_NAMES.ASK_QUESTION, {
					description: TOOL_DESCRIPTIONS[TOOL_NAMES.ASK_QUESTION],
					parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.ASK_QUESTION],
					handler: async (args: {
						type: string;
						question: string;
						context?: string;
						options?: string[];
						allowMultiple?: boolean;
						placeholder?: string;
						textLabel?: string;
						defaultValue?: string;
						defaultSelected?: string[];
						multiline?: boolean;
						required?: boolean;
					}) => {
						const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

						// Build question request based on type
						const questionRequest: QuestionRequest = {
							id,
							type: args.type,
							question: args.question,
							context: args.context,
							required: args.required !== false,
						} as QuestionRequest;

						// Add type-specific properties
						if (args.type === "text") {
							(questionRequest as any).placeholder = args.placeholder;
							(questionRequest as any).defaultValue = args.defaultValue;
							(questionRequest as any).multiline = args.multiline || false;
						} else if (args.type === "multipleChoice") {
							if (!args.options || args.options.length === 0) {
								return { success: false, error: "multipleChoice type requires options array" };
							}
							(questionRequest as any).options = args.options;
							(questionRequest as any).allowMultiple = args.allowMultiple || false;
							(questionRequest as any).defaultSelected = args.defaultSelected;
						} else if (args.type === "radio") {
							if (!args.options || args.options.length === 0) {
								return { success: false, error: "radio type requires options array" };
							}
							(questionRequest as any).options = args.options;
							(questionRequest as any).defaultSelected = args.defaultSelected?.[0];
						} else if (args.type === "mixed") {
							if (!args.options || args.options.length === 0) {
								return { success: false, error: "mixed type requires options array" };
							}
							(questionRequest as any).options = args.options;
							(questionRequest as any).allowMultiple = args.allowMultiple || false;
							(questionRequest as any).defaultSelected = args.defaultSelected;
							(questionRequest as any).textPlaceholder = args.placeholder;
							(questionRequest as any).textLabel = args.textLabel;
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
								question: args.question,
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
				}) as any
			);
		}

		return tools;
	}

	async batchReadNotes(paths: string[], aiSummarize?: boolean, summaryPrompt?: string): Promise<{ results: Array<{ path: string; success: boolean; content?: string; summary?: string; error?: string }> }> {
		const results = await Promise.all(
			paths.map(async (path) => {
				try {
					const normalizedPath = normalizeVaultPath(path);
					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return { path, success: false, error: `Note not found: ${path}` };
					}
					const content = await this.app.vault.read(file);
					
					if (aiSummarize) {
						const summary = await this.generateAISummary(content, file.basename, summaryPrompt);
						return { path, success: true, summary };
					}
					return { path, success: true, content };
				} catch (error) {
					return { path, success: false, error: `Failed to read note: ${error}` };
				}
			})
		);
		return { results };
	}

	/**
	 * Generate an AI summary of note content using the Copilot CLI.
	 * Creates a temporary session for the summarization request.
	 */
	private async generateAISummary(content: string, title: string, customPrompt?: string): Promise<string> {
		try {
			if (!this.client) {
				throw new Error("Copilot client not initialized");
			}

			// Create a temporary session for this summarization task
		const tempSession = await this.client.createSession({
			model: this.config.model,
			streaming: false,
			tools: [], // No tools needed for summarization
			systemMessage: {
				content: "You are a helpful assistant that generates concise summaries of notes."
			}
		});

		const defaultPrompt = `Summarize the following note concisely. Extract key information including any frontmatter fields, main topics, and important details.\n\nTitle: ${title}\n\nContent:\n${content}`;
		
		const prompt = customPrompt 
			? `${customPrompt}\n\nTitle: ${title}\n\nContent:\n${content}`
			: defaultPrompt;

		// Make the request with a shorter timeout for summaries
		const response = await tempSession.sendAndWait({ prompt }, 30000); // 30 second timeout
		const summary = response?.data?.content || "Failed to generate summary";

		// Clean up the temporary session
		await tempSession.destroy();
			return summary;
		} catch (error) {
			console.error(`[GitHubCopilotCliService] Failed to generate AI summary for ${title}:`, error);
			return `Error generating summary: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
}

