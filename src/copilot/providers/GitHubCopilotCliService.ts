/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module GitHubCopilotCliService
 * @description GitHub Copilot CLI SDK integration for Vault Copilot.
 *
 * This module provides the primary AI provider implementation using the
 * GitHub Copilot SDK (`@github/copilot-sdk`). It manages the client/session
 * lifecycle, message streaming, idle-timeout recovery, and session persistence.
 *
 * Formatting, tool creation, tracing, and prompt construction are delegated
 * to focused companion modules extracted during the 0.0.35 refactor.
 *
 * ## Features
 *
 * - **Copilot SDK Integration**: Full CopilotClient and CopilotSession lifecycle
 * - **Session Persistence**: Create, resume, list, and delete SDK sessions
 * - **Streaming**: Real-time response streaming with delta callbacks
 * - **Idle-Timeout Recovery**: Transparent session recreation after CLI 30-min timeout
 * - **Tool Calling**: Built-in vault operations + MCP server tools (via {@link CopilotToolFactory})
 * - **Custom Skills & Instructions**: Loaded by {@link CustomizationLoader}
 * - **Tracing**: Structured event tracing via {@link SessionEventTracer}
 *
 * ## Architecture
 *
 * ```
 * GitHubCopilotCliService          (this file — lifecycle & messaging)
 *   ├── CopilotClient / Session    (@github/copilot-sdk)
 *   ├── CopilotToolFactory         (tool definitions: vault ops + MCP + skills)
 *   ├── SystemPromptBuilder        (system prompt assembly)
 *   ├── SessionEventTracer         (structured tracing for SDK events)
 *   ├── ConsoleInterceptor         (stderr/console capture for diagnostics)
 *   ├── CustomizationLoader        (skills, instructions, agents, prompts)
 *   ├── McpManager                 (MCP server tool bridge)
 *   └── types.ts                   (shared interfaces & constants)
 * ```
 *
 * ## Desktop Only
 *
 * This provider requires the Copilot CLI and is only available on desktop.
 * Mobile platforms should use {@link OpenAIService} or {@link AzureOpenAIService} instead.
 *
 * @example
 * ```typescript
 * const service = new GitHubCopilotCliService(app, {
 *   model: 'gpt-4.1',
 *   streaming: true,
 *   vaultPath: '/path/to/vault',
 *   timezone: 'America/New_York',
 *   weekStartDay: 'monday',
 * });
 *
 * await service.start();
 * await service.sendMessageStreaming('Help me organize my notes',
 *   (delta) => appendToUI(delta),
 *   (full) => renderMarkdown(full),
 * );
 * ```
 *
 * @see {@link CopilotToolFactory} for tool definitions
 * @see {@link SystemPromptBuilder} for system prompt construction
 * @see {@link SessionEventTracer} for SDK event tracing
 * @see {@link ConsoleInterceptor} for diagnostic log capture
 * @see {@link types} for shared interfaces and constants
 * @see {@link AIProvider} for the base class interface
 * @since 0.0.1
 */

import { CopilotClient, CopilotSession, SessionEvent } from "@github/copilot-sdk";
import { App } from "obsidian";
import { existsSync } from "node:fs";
import * as nodePath from "node:path";
import { CustomizationLoader, CustomInstruction } from "../customization/CustomizationLoader";
import { McpManagerEvent } from "../mcp/McpManager";

import * as VaultOps from "../tools/VaultOperations";
import { getTracingService } from "../TracingService";
import type { QuestionRequest, QuestionResponse } from "../../types/questions";

// Extracted modules
import { GitHubCopilotCliConfig, ChatMessage, ModelInfoResult, DEFAULT_REQUEST_TIMEOUT, DEFAULT_STOP_TIMEOUT, SESSION_STALE_THRESHOLD_MS } from "./types";
import type { ModelCapabilitiesInfo, ModelPolicyInfo } from "./types";
import { SessionEventTracer } from "./SessionEventTracer";
import { createObsidianTools, convertRegisteredSkillsToTools, convertMcpToolsToSdkTools, buildCustomAgentsConfig } from "./CopilotToolFactory";
import { buildSystemPrompt } from "./SystemPromptBuilder";
import { interceptConsoleLogs } from "./ConsoleInterceptor";

// Re-export types for backward compatibility
export type { GitHubCopilotCliConfig, ChatMessage, ModelInfoResult, ModelCapabilitiesInfo, ModelPolicyInfo } from "./types";

/**
 * Primary AI provider wrapping the GitHub Copilot SDK for Obsidian.
 *
 * Manages the full lifecycle of the Copilot CLI client and chat sessions:
 * creating, resuming, listing, and deleting sessions; sending messages
 * (blocking or streaming); transparent idle-timeout recovery; and
 * coordinating tool definitions, custom instructions, and diagnostics
 * via companion modules.
 *
 * ## Lifecycle
 *
 * 1. Construct with an {@link App} and {@link GitHubCopilotCliConfig}.
 * 2. Call {@link start} (or let it auto-start on first message).
 * 3. Send messages via {@link sendMessage} or {@link sendMessageStreaming}.
 * 4. Call {@link stop} to tear down the CLI process and free resources.
 *
 * @example
 * ```typescript
 * const svc = new GitHubCopilotCliService(app, config);
 * await svc.start();
 * const sessionId = await svc.createSession();
 * const reply = await svc.sendMessage('What notes did I take yesterday?');
 * await svc.stop();
 * ```
 *
 * @see {@link CopilotToolFactory} for tool registration
 * @see {@link SystemPromptBuilder} for system prompt assembly
 * @see {@link SessionEventTracer} for structured event tracing
 */
export class GitHubCopilotCliService {
	/** The underlying SDK client process — `null` when stopped. @internal */
	private client: CopilotClient | null = null;
	/** The active SDK chat session — `null` before {@link createSession}. @internal */
	private session: CopilotSession | null = null;
	/** Obsidian App reference for vault access. @internal */
	private app: App;
	/** Current service configuration (may be updated via {@link updateConfig}). @internal */
	private config: GitHubCopilotCliConfig;
	/** Chronological conversation history for the active session */
	private messageHistory: ChatMessage[] = [];
	/** Registered external event handlers notified on every SDK SessionEvent */
	private eventHandlers: ((event: SessionEvent) => void)[] = [];
	/** Loader for file-based skills, agents, instructions, and prompts */
	private customizationLoader: CustomizationLoader;
	/** Instructions loaded from configured instruction directories for the current session */
	private loadedInstructions: CustomInstruction[] = [];
	/** Unsubscribe function for the MCP manager event listener (cleaned up in {@link stop}) */
	private mcpEventUnsubscribe: (() => void) | null = null;
	/** Callback for presenting interactive questions to the user via modal UI */
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
	/** Encapsulated event tracer for SDK session events */
	private readonly eventTracer = new SessionEventTracer();

	/**
	 * Create a new GitHubCopilotCliService instance.
	 *
	 * The constructor sets up the customization loader and subscribes to MCP
	 * manager events so that tool changes are detected automatically.
	 *
	 * @param app - The Obsidian App instance for vault access
	 * @param config - Service configuration including model, paths, and integrations
	 */
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
	 * Initialize and start the Copilot CLI client process.
	 *
	 * Resolves the CLI executable path (with Windows fallback probing),
	 * configures vault access, and spawns the CLI process. If the client
	 * is already running this is a no-op.
	 *
	 * @returns Resolves when the CLI process is ready to accept sessions
	 *
	 * @throws {Error} "GitHub Copilot CLI not found" — CLI binary missing from PATH
	 * @throws {Error} "Could not connect to GitHub Copilot CLI server" — connection refused
	 * @throws {Error} "Permission denied" — filesystem permission issue
	 *
	 * @example
	 * ```typescript
	 * const svc = new GitHubCopilotCliService(app, config);
	 * await svc.start();
	 * ```
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
			interceptConsoleLogs();
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
	 * Stop the Copilot client and clean up all resources.
	 *
	 * Performs an orderly shutdown:
	 * 1. Unsubscribes from MCP manager events.
	 * 2. Destroys the active SDK session.
	 * 3. Attempts a graceful client stop with a configurable timeout.
	 * 4. Falls back to {@link CopilotClient.forceStop} if the timeout expires.
	 * 5. Clears local message history.
	 *
	 * @returns Resolves when the client has been fully torn down
	 *
	 * @example
	 * ```typescript
	 * await service.stop();
	 * console.log(service.isConnected()); // false
	 * ```
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
	 * Tools like `ask_question` invoke this callback to present interactive
	 * modals to the user during a tool call. Pass `null` to unregister.
	 *
	 * @param callback - Function that shows a QuestionModal and returns the user's response, or `null` to unregister
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * service.setQuestionCallback(async (question) => {
	 *   return await showQuestionModal(app, question);
	 * });
	 * ```
	 *
	 * @see {@link QuestionRequest} for the question payload shape
	 * @since 0.0.17
	 */
	setQuestionCallback(callback: ((question: QuestionRequest) => Promise<QuestionResponse | null>) | null): void {
		this.questionCallback = callback;
	}

	/**
	 * Create a new chat session with Obsidian-specific tools.
	 *
	 * Auto-starts the client if not yet running. Destroys any existing session,
	 * reloads custom instructions, assembles the full tool set (built-in +
	 * skills + MCP), builds the system prompt, and creates an SDK session.
	 *
	 * @param sessionId - Optional session ID for persistence. If provided, the session can be resumed later via {@link resumeSession}.
	 * @returns The SDK-assigned session ID
	 *
	 * @throws {Error} If the client fails to start or session creation fails
	 *
	 * @example
	 * ```typescript
	 * const id = await service.createSession();
	 * console.log('Session:', id);
	 * ```
	 *
	 * @see {@link resumeSession} to restore an existing session
	 * @see {@link buildSystemPrompt} for system prompt construction
	 * @see {@link createObsidianTools} for tool assembly
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
		const builtInTools = createObsidianTools({
			app: this.app,
			config: this.config,
			customizationLoader: this.customizationLoader,
			questionCallback: this.questionCallback,
			batchReadNotes: this.batchReadNotes.bind(this),
		});
		const registeredTools = convertRegisteredSkillsToTools(this.config.skillRegistry);
		const mcpTools = convertMcpToolsToSdkTools(this.config.mcpManager);
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
				content: buildSystemPrompt(this.config, this.loadedInstructions),
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
			sessionConfig.customAgents = buildCustomAgentsConfig();
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
	 * Resume an existing session by its ID, preserving AI conversation context.
	 *
	 * Reloads tools and instructions, then asks the SDK to restore the
	 * server-side session. If the session no longer exists, falls back to
	 * creating a fresh session with the same ID.
	 *
	 * @param sessionId - The SDK session ID to resume
	 * @returns The resumed (or newly created) session ID
	 *
	 * @throws {Error} If client start fails and no fallback succeeds
	 *
	 * @example
	 * ```typescript
	 * const id = await service.resumeSession('sess_abc123');
	 * ```
	 *
	 * @see {@link createSession} for fresh session creation
	 * @see {@link loadSession} for loading with optional fallback messages
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
		const builtInTools = createObsidianTools({
			app: this.app,
			config: this.config,
			customizationLoader: this.customizationLoader,
			questionCallback: this.questionCallback,
			batchReadNotes: this.batchReadNotes.bind(this),
		});
		const registeredTools = convertRegisteredSkillsToTools(this.config.skillRegistry);
		const mcpTools = convertMcpToolsToSdkTools(this.config.mcpManager);
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
	 * Convert SDK session events to the local {@link ChatMessage} history format.
	 *
	 * Filters events for `user.message` and `assistant.message` types and maps
	 * them into a flat array suitable for UI display and session persistence.
	 *
	 * @param events - Raw SDK session events from `session.getMessages()`
	 * @returns Chronological array of user and assistant messages
	 * @internal
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
	 * Get the current session ID.
	 *
	 * @returns The active session ID, or `null` if no session exists
	 *
	 * @example
	 * ```typescript
	 * const activeSessionId = service.getSessionId();
	 * ```
	 */
	getSessionId(): string | null {
		return this.session?.sessionId ?? null;
	}

	/**
	 * List all available sessions from the SDK.
	 *
	 * Auto-starts the client if not yet running. Returns an empty array
	 * if the request fails rather than throwing.
	 *
	 * @returns Array of session metadata (id, timestamps, summary, remote flag).
	 *          Returns `[]` on failure.
	 *
	 * @example
	 * ```typescript
	 * const sessions = await service.listSessions();
	 * sessions.forEach(s => console.log(s.sessionId, s.summary));
	 * ```
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
	 * Delete a session from the SDK.
	 *
	 * If the deleted session is the currently active one, local state
	 * (session reference and message history) is also cleared.
	 *
	 * @param sessionId - The SDK session ID to delete
	 * @returns Resolves when the session has been deleted
	 *
	 * @throws {Error} If the SDK delete call fails
	 *
	 * @example
	 * ```typescript
	 * await service.deleteSession('sess_abc123');
	 * ```
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
	 * List available AI models from the SDK.
	 *
	 * Maps the SDK's model objects to the plugin's own
	 * {@link ModelInfoResult} type so downstream code never depends on
	 * SDK-specific shapes. Returns `[]` on failure.
	 *
	 * @returns Array of {@link ModelInfoResult} with capabilities, policy, and billing info
	 *
	 * @example
	 * ```typescript
	 * const models = await service.listModels();
	 * const visionModels = models.filter(m => m.capabilities.supportsVision);
	 * ```
	 *
	 * @see {@link ModelInfoResult} for the returned shape
	 * @see {@link ModelCapabilitiesInfo} for capability details
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
	 * Register a callback that fires when the session is transparently recreated
	 * after the CLI idle timeout (~30 min). The UI should use this to show an
	 * informational notice so the user knows AI context was reset.
	 *
	 * @param callback - Function to call on reconnect, or `null` to unregister
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * service.setSessionReconnectCallback(() => {
	 *   new Notice('Session reconnected — AI context was reset.');
	 * });
	 * ```
	 *
	 * @see {@link ensureSessionAlive} for the reconnection logic
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
	 * Send a message and wait for the complete (non-streaming) response.
	 *
	 * Auto-creates a session if none exists. Checks for idle-timeout
	 * staleness and transparently recreates the session if needed.
	 * The prompt and response are appended to {@link messageHistory}.
	 *
	 * @param prompt - The user's message text
	 * @param timeout - Request timeout in ms (defaults to {@link GitHubCopilotCliConfig.requestTimeout} then {@link DEFAULT_REQUEST_TIMEOUT})
	 * @returns The assistant's full response text
	 *
	 * @throws {Error} `"Request timed out after N seconds"` when the timeout elapses
	 * @throws {Error} Propagates any SDK-level error
	 *
	 * @example
	 * ```typescript
	 * const reply = await service.sendMessage('Summarize my daily note');
	 * ```
	 *
	 * @see {@link sendMessageStreaming} for the streaming variant
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
	 * Send a message and stream the response in real time.
	 *
	 * Auto-creates a session if none exists. Checks for idle-timeout
	 * staleness and transparently recreates the session if needed.
	 *
	 * The inactivity timeout resets on every SDK event, so interactive
	 * tool calls (e.g. `ask_question`) that block for user input won't
	 * trigger a spurious timeout.
	 *
	 * @param prompt - The user's message text
	 * @param onDelta - Called with each incremental text chunk as it arrives
	 * @param onComplete - Called with the full accumulated text when the response is complete (also called on intermediate `assistant.message` events for progressive rendering)
	 * @param timeout - Inactivity timeout in ms (defaults to {@link GitHubCopilotCliConfig.requestTimeout} then {@link DEFAULT_REQUEST_TIMEOUT})
	 * @returns Resolves when the full response has been received
	 *
	 * @throws {Error} `"Streaming request timed out after N seconds of inactivity"` on timeout
	 * @throws {Error} `"Session error during streaming"` if the SDK emits `session.error`
	 * @throws {Error} Propagates any SDK send error
	 *
	 * @example
	 * ```typescript
	 * await service.sendMessageStreaming(
	 *   'List my recent notes',
	 *   (delta) => appendToUI(delta),
	 *   (full) => renderMarkdown(full),
	 * );
	 * ```
	 *
	 * @see {@link sendMessage} for the non-streaming variant
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
	 * Abort the current in-progress request.
	 *
	 * Safe to call when no request is active — it will be a no-op.
	 * Errors during abort are logged but not thrown.
	 *
	 * @returns Resolves when the abort signal has been sent
	 *
	 * @example
	 * ```typescript
	 * // User clicks "Stop" button
	 * await service.abort();
	 * ```
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
	 * Get a shallow copy of the current message history.
	 *
	 * @returns Array of {@link ChatMessage} objects (defensive copy)
	 *
	 * @example
	 * ```typescript
	 * const history = service.getMessageHistory();
	 * console.log(history.length);
	 * ```
	 */
	getMessageHistory(): ChatMessage[] {
		return [...this.messageHistory];
	}

	/**
	 * Clear local message history and create a fresh SDK session.
	 *
	 * This discards both local history and the server-side conversation context.
	 *
	 * @returns Resolves when the new session is ready
	 * @throws {Error} If session recreation fails
	 *
	 * @example
	 * ```typescript
	 * await service.clearHistory();
	 * ```
	 */
	async clearHistory(): Promise<void> {
		this.messageHistory = [];
		await this.createSession();
	}

	/**
	 * Get current session state for persistence.
	 *
	 * Returns a snapshot of the message history that can be serialized and
	 * restored later via {@link loadSession}.
	 *
	 * @returns Object containing a defensive copy of the message history
	 *
	 * @example
	 * ```typescript
	 * const state = service.getSessionState();
	 * saveState(state);
	 * ```
	 */
	getSessionState(): { messages: ChatMessage[] } {
		return {
			messages: [...this.messageHistory],
		};
	}

	/**
	 * Load a previous session using SDK session persistence.
	 *
	 * Attempts to resume the session via {@link resumeSession}. If the
	 * session no longer exists on the server, creates a fresh session
	 * and optionally restores the provided fallback message history
	 * for backward-compatible UI display.
	 *
	 * @param sessionId - The SDK session ID to load
	 * @param messages - Optional fallback message history to restore if SDK resume fails
	 * @returns Resolves when the session is ready
	 *
	 * @example
	 * ```typescript
	 * await service.loadSession('sess_abc123', savedMessages);
	 * ```
	 *
	 * @see {@link resumeSession} for the underlying SDK resume
	 * @see {@link getSessionState} for obtaining persistable state
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
	 * Subscribe to session events from the SDK.
	 *
	 * Handlers are called synchronously for every SDK `SessionEvent`.
	 *
	 * @param handler - Callback invoked on each session event
	 * @returns Unsubscribe function — call it to remove the handler
	 *
	 * @example
	 * ```typescript
	 * const unsub = service.onEvent((event) => {
	 *   if (event.type === 'tool.call') console.log('Tool:', event.data);
	 * });
	 * // Later:
	 * unsub();
	 * ```
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
	 * Check if the CopilotClient is currently running.
	 *
	 * @returns `true` if the client has been started and not yet stopped
	 *
	 * @example
	 * ```typescript
	 * if (!service.isConnected()) {
	 *   await service.start();
	 * }
	 * ```
	 */
	isConnected(): boolean {
		return this.client !== null;
	}

	/**
	 * Merge partial configuration into the current config.
	 *
	 * Changes take effect on the next session creation; they do not
	 * automatically recreate the active session.
	 *
	 * @param config - Partial configuration to merge
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * service.updateConfig({ model: 'claude-sonnet-4', streaming: false });
	 * ```
	 */
	updateConfig(config: Partial<GitHubCopilotCliConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Dispatch a session event to TracingService and all registered external handlers.
	 *
	 * @param event - The raw SDK session event to process
	 * @internal
	 */
	private handleSessionEvent(event: SessionEvent): void {
		// Log session event to TracingService for diagnostics
		this.eventTracer.handleEvent(event);
		
		for (const handler of this.eventHandlers) {
			handler(event);
		}
	}

	/**
	 * Get the list of loaded instructions for displaying in the settings UI.
	 *
	 * @returns Array of instruction metadata (name, path, optional applyTo glob)
	 *
	 * @example
	 * ```typescript
	 * const instructions = service.getLoadedInstructions();
	 * instructions.forEach((i) => console.log(i.name, i.path));
	 * ```
	 */
	getLoadedInstructions(): Array<{ name: string; path: string; applyTo?: string }> {
		return this.loadedInstructions.map(i => ({
			name: i.name,
			path: i.path,
			applyTo: i.applyTo
		}));
	}

	/**
	 * Read multiple vault notes in parallel, with optional AI summarization.
	 *
	 * Delegates to {@link VaultOps.batchReadNotes}, passing a Copilot SDK-based
	 * summarizer callback when AI summarization is requested.
	 *
	 * @param paths - Array of vault-relative note paths to read
	 * @param aiSummarize - When true, return a concise AI summary instead of full content
	 * @param summaryPrompt - Optional custom prompt for the summarization model
	 * @returns Object with a `results` array — each entry has `path`, `success`, and either `content`/`summary` or `error`
	 *
	 * @example
	 * ```typescript
	 * const batch = await service.batchReadNotes(
	 *   ["Daily Notes/2026-02-21.md", "Projects/Roadmap.md"],
	 *   true,
	 * );
	 * console.log(batch.results.length);
	 * ```
	 *
	 * @see {@link VaultOps.batchReadNotes} for low-level vault read behavior
	 */
	async batchReadNotes(paths: string[], aiSummarize?: boolean, summaryPrompt?: string): Promise<{ results: Array<{ path: string; success: boolean; content?: string; summary?: string; error?: string }> }> {
		const summarizer: VaultOps.NoteSummarizer | undefined = aiSummarize
			? async (content: string, title: string, customPrompt?: string): Promise<string> => {
				try {
					if (!this.client) {
						throw new Error("Copilot client not initialized");
					}

					const tempSession = await this.client.createSession({
						model: this.config.model,
						streaming: false,
						tools: [],
						systemMessage: {
							content: "You are a helpful assistant that generates concise summaries of notes.",
						},
					});

					const defaultPrompt = `Summarize the following note concisely. Extract key information including any frontmatter fields, main topics, and important details.\n\nTitle: ${title}\n\nContent:\n${content}`;
					const prompt = customPrompt
						? `${customPrompt}\n\nTitle: ${title}\n\nContent:\n${content}`
						: defaultPrompt;

					const response = await tempSession.sendAndWait({ prompt }, 30000);
					const summary = response?.data?.content || "Failed to generate summary";
					await tempSession.destroy();
					return summary;
				} catch (error) {
					console.error(`[GitHubCopilotCliService] Failed to generate AI summary for ${title}:`, error);
					return `Error generating summary: ${error instanceof Error ? error.message : String(error)}`;
				}
			}
			: undefined;

		return VaultOps.batchReadNotes(this.app, paths, aiSummarize, summaryPrompt, summarizer);
	}
}

