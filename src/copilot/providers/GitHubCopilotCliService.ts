/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module GitHubCopilotCliService
 * @description Base GitHub Copilot CLI service for the Basic (vault-copilot) plugin.
 *
 * Manages the full lifecycle of the Copilot CLI client and chat sessions using a
 * template-method pattern. The Pro service (`GitHubCopilotCliProService`) extends
 * this class and overrides {@link buildTools}, {@link buildSystemPrompt}, and
 * {@link buildSummarizer} to inject Pro-specific features (all tools, MCP, agents,
 * slash commands, custom instructions, etc.).
 *
 * ## Basic capabilities
 *
 * - CopilotClient / CopilotSession lifecycle (start, stop, reconnect)
 * - Session persistence: create, resume, list, delete
 * - Streaming with delta callbacks
 * - Idle-timeout recovery (transparent session recreation after CLI 30 min timeout)
 * - 5 Basic tools via {@link BasicToolFactory}
 * - Minimal system prompt via {@link BasicSystemPromptBuilder}
 *
 * ## Template hooks (override in Pro)
 *
 * | Method | Base returns | Pro returns |
 * |--------|-------------|------------|
 * | `buildTools()` | 5 basic tools | 40+ tools |
 * | `buildSystemPrompt()` | Minimal prompt | Full prompt with instructions |
 * | `buildSummarizer()` | `undefined` (plain reads) | SDK AI summarizer |
 *
 * @see {@link BasicToolFactory} for the 5 Basic tools
 * @see {@link BasicSystemPromptBuilder} for the minimal prompt
 * @since 0.1.0
 */

import { CopilotClient, CopilotSession, SessionEvent, approveAll, defineTool } from "@github/copilot-sdk";
import { App } from "obsidian";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import * as nodePath from "node:path";
import { homedir, tmpdir } from "node:os";

import * as VaultOps from "../tools/VaultOperations";
import { getTracingService } from "../TracingService";
import { LOG_SOURCES } from "../logging/LogTaxonomy";
import { SessionEventTracer } from "./SessionEventTracer";
import { interceptConsoleLogs } from "./ConsoleInterceptor";

import {
	GitHubCopilotCliConfig,
	ChatMessage,
	ModelInfoResult,
	SessionAgentInfo,
	SessionCompactionResult,
	ImageAttachment,
	DEFAULT_REQUEST_TIMEOUT,
	DEFAULT_STOP_TIMEOUT,
	SESSION_STALE_THRESHOLD_MS,
} from "./types";
import { createBasicTools, type BatchReadNotesFn } from "./BasicToolFactory";
import { buildBasicSystemPrompt } from "./BasicSystemPromptBuilder";
import type { ToolRegistry } from "../../api/registries/ToolRegistry";

// Re-export types for consumers that import directly from this module
export type {
	GitHubCopilotCliConfig,
	ChatMessage,
	ModelInfoResult,
	SessionCompactionResult,
	SessionAgentInfo,
} from "./types";
export { DEFAULT_REQUEST_TIMEOUT, DEFAULT_STOP_TIMEOUT } from "./types";

// ── Class ──────────────────────────────────────────────────────────────────

/**
 * Base GitHub Copilot CLI service.
 *
 * Handles client/session lifecycle, messaging (blocking + streaming), and session
 * persistence. Subclasses override the three protected template hooks to inject
 * Pro-specific tools, prompts, and AI summarizers without duplicating lifecycle code.
 *
 * @example
 * ```typescript
 * const svc = new GitHubCopilotCliService(app, {
 *   model: 'gpt-4.1',
 *   streaming: true,
 *   vaultPath: '/path/to/vault',
 * });
 *
 * await svc.start();
 * const sessionId = await svc.createSession();
 * const reply = await svc.sendMessage('What notes did I take yesterday?');
 * await svc.stop();
 * ```
 */
export class GitHubCopilotCliService {
	/** The underlying SDK client process — `null` when stopped. @internal */
	protected client: CopilotClient | null = null;
	/** The active SDK chat session — `null` before {@link createSession}. @internal */
	protected session: CopilotSession | null = null;
	/** Obsidian App reference for vault access. @internal */
	protected app: App;
	/** Current service configuration (may be updated via {@link updateConfig}). @internal */
	protected config: GitHubCopilotCliConfig;
	/** Chronological conversation history for the active session */
	protected messageHistory: ChatMessage[] = [];
	/** Registered external event handlers notified on every SDK SessionEvent */
	private eventHandlers: ((event: SessionEvent) => void)[] = [];
	/**
	 * Timestamp (ms) of the last SDK activity (send or receive).
	 * Used to detect whether the CLI's 30-minute idle timeout has likely expired.
	 */
	private lastSdkActivity: number = Date.now();
	/**
	 * Optional callback invoked when the session is automatically recreated
	 * because the CLI idle timeout was exceeded.
	 */
	private onSessionReconnect: (() => void) | null = null;
	/** Encapsulated event tracer for SDK session events */
	private readonly eventTracer = new SessionEventTracer();
	/**
	 * Optional tool registry injected by {@link setToolRegistry}.
	 * When set, {@link buildTools} appends all registered tools after the basic tools.
	 * @internal
	 */
	protected toolRegistry: ToolRegistry | null = null;

	/**
	 * Create a new GitHubCopilotCliService instance.
	 *
	 * @param app - The Obsidian App instance for vault access
	 * @param config - Base service configuration
	 */
	constructor(app: App, config: GitHubCopilotCliConfig) {
		this.app = app;
		this.config = config;
	}

	/**
	 * Inject a tool registry so that dynamically registered tools (from Pro
	 * or third-party plugins) are included in every new SDK session.
	 *
	 * Call this immediately after construction before the first {@link start}.
	 * When the registry changes, tools are picked up on the **next** session
	 * start or reconnect — no mid-session rebuild is required.
	 *
	 * @param registry - The Extension API's `ToolRegistry` instance
	 */
	setToolRegistry(registry: ToolRegistry): void {
		this.toolRegistry = registry;
	}

	// ── Template hook methods (override in Pro) ────────────────────────────

	/**
	 * Build the tool list for a new/resumed SDK session.
	 *
	 * Base returns 7 Basic tools. The Pro service overrides this to return
	 * all 40+ tools (vault operations, MCP, skill registry, Extension API).
	 *
	 * @returns Array of SDK `defineTool()` results
	 * @internal
	 */
	protected buildTools(): object[] {
		const basicTools = createBasicTools(this.app, this.batchReadNotes.bind(this) as BatchReadNotesFn);
		if (!this.toolRegistry) return basicTools;

		// Append tools registered by Pro or third-party plugins via the Extension API.
		const extraTools: object[] = [];
		for (const provider of this.toolRegistry.getAllProviders()) {
			for (const toolDef of provider.tools) {
				extraTools.push(
					defineTool(toolDef.name, {
						description: toolDef.description,
						// Cast to satisfy the SDK's loose parameter type expectation
						parameters: toolDef.parameters as unknown as Record<string, unknown>,
						handler: async (args: Record<string, unknown>) => {
							return await provider.handler(toolDef.name, args);
						},
					}),
				);
			}
		}
		return [...basicTools, ...extraTools];
	}

	/**
	 * Build the system prompt string for a new SDK session.
	 *
	 * Base returns a minimal prompt with date/time + vault name + basic guidelines.
	 * The Pro service overrides this to add custom instructions, slash-command docs,
	 * bases syntax, timezone context, and week-start context.
	 *
	 * @returns System prompt string
	 * @internal
	 */
	protected buildSystemPrompt(): string {
		return buildBasicSystemPrompt(this.app, this.config.model);
	}

	/**
	 * Build the AI summarizer for `batchReadNotes`.
	 *
	 * Base returns `undefined` so `batchReadNotes` performs plain reads only.
	 * The Pro service overrides this to return a temporary SDK session that
	 * generates AI-powered summaries.
	 *
	 * @returns `NoteSummarizer` function or `undefined` for plain reads
	 * @internal
	 */
	protected buildSummarizer(): VaultOps.NoteSummarizer | undefined {
		return undefined;
	}

	/**
	 * Return the list of custom instruction files loaded for the current session.
	 *
	 * The base implementation always returns an empty array — Basic does not
	 * load instruction files.  The Pro service overrides this to expose the
	 * instructions it has applied at session-build time.
	 *
	 * @returns Empty array in Basic; instruction metadata list in Pro
	 * @see {@link LoadedInstructionProvider} in `MessageContextBuilder`
	 */
	getLoadedInstructions(): Array<{ name: string; path: string; applyTo?: string }> {
		return [];
	}

	// ── Private utility methods ────────────────────────────────────────────

	/**
	 * Resolve the Copilot CLI executable path with platform-aware fallbacks.
	 * On Windows, probes known absolute install locations since Obsidian's
	 * Electron process may not inherit the user's shell PATH.
	 *
	 * @returns The resolved CLI path
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
	 * Ensure an SDK session config includes a permission-request handler.
	 *
	 * Copilot SDK 0.1.29+ requires `onPermissionRequest` for both
	 * `createSession(...)` and `resumeSession(...)`.
	 *
	 * @param config - Session config object for create/resume operations
	 * @returns Config guaranteed to include `onPermissionRequest`
	 * @internal
	 */
	private ensurePermissionRequestHandler<T extends Record<string, unknown>>(
		config: T,
	): T & { onPermissionRequest: typeof approveAll } {
		const existingHandler = (config as { onPermissionRequest?: unknown }).onPermissionRequest;
		if (typeof existingHandler === "function") {
			return config as T & { onPermissionRequest: typeof approveAll };
		}
		return { ...config, onPermissionRequest: approveAll };
	}

	/**
	 * Install a runtime safety-net on the SDK client for permission handlers.
	 *
	 * @param client - Active CopilotClient instance
	 * @internal
	 */
	private installPermissionHandlerSafetyNet(client: CopilotClient): void {
		type PatchableClient = {
			createSession?: (config: Record<string, unknown>) => Promise<unknown>;
			resumeSession?: (sessionId: string, config?: Record<string, unknown>) => Promise<unknown>;
			__vcPermissionSafetyNetInstalled?: boolean;
		};

		const patchableClient = client as unknown as PatchableClient;
		if (patchableClient.__vcPermissionSafetyNetInstalled) return;

		const originalCreateSession = patchableClient.createSession?.bind(client);
		if (originalCreateSession) {
			patchableClient.createSession = async (config: Record<string, unknown>) => {
				const hasHandler = typeof (config as { onPermissionRequest?: unknown })?.onPermissionRequest === "function";
				if (!hasHandler) {
					console.warn("[Vault Copilot] Missing onPermissionRequest in createSession; auto-injecting approveAll.");
				}
				return originalCreateSession(this.ensurePermissionRequestHandler(config ?? {}));
			};
		}

		const originalResumeSession = patchableClient.resumeSession?.bind(client);
		if (originalResumeSession) {
			patchableClient.resumeSession = async (sessionId: string, config?: Record<string, unknown>) => {
				const inputConfig = config ?? {};
				const hasHandler = typeof (inputConfig as { onPermissionRequest?: unknown }).onPermissionRequest === "function";
				if (!hasHandler) {
					console.warn("[Vault Copilot] Missing onPermissionRequest in resumeSession; auto-injecting approveAll.");
				}
				return originalResumeSession(sessionId, this.ensurePermissionRequestHandler(inputConfig));
			};
		}

		patchableClient.__vcPermissionSafetyNetInstalled = true;
	}

	/**
	 * Build infinite-session compaction thresholds for new SDK sessions.
	 *
	 * @returns Infinite session compaction config for Copilot SDK session creation
	 * @internal
	 */
	private buildInfiniteSessionCompactionConfig(): {
		enabled: boolean;
		backgroundCompactionThreshold: number;
		bufferExhaustionThreshold: number;
	} {
		return {
			enabled: true,
			backgroundCompactionThreshold: this.normalizeUtilizationRatio(this.config.backgroundCompactionThreshold, 0.8),
			bufferExhaustionThreshold: this.normalizeUtilizationRatio(this.config.bufferExhaustionThreshold, 0.95),
		};
	}

	/**
	 * Normalize a context utilization ratio into the inclusive [0, 1] range.
	 *
	 * @param value - Candidate ratio value
	 * @param fallback - Fallback ratio when value is missing or invalid
	 * @returns Clamped ratio in [0, 1]
	 * @internal
	 */
	private normalizeUtilizationRatio(value: number | undefined, fallback: number): number {
		if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
		return Math.max(0, Math.min(1, value));
	}

	// ── Protected helpers (accessible by Pro subclass) ─────────────────────

	/**
	 * Update the last SDK activity timestamp to prevent spurious idle-timeout restarts.
	 * @internal
	 */
	protected touchActivity(): void {
		this.lastSdkActivity = Date.now();
	}

	/**
	 * Read CLI-registered MCP server configs to pass as `mcpServers` to the SDK session.
	 *
	 * Scans two sources:
	 * 1. `~/.copilot/mcp-config.json` — user-added servers via `copilot /mcp add`
	 * 2. `~/.copilot/installed-plugins/<marketplace>/<plugin>/.mcp.json` — plugin MCP configs (e.g. WorkIQ)
	 *
	 * Returns an SDK-compatible map of `{ serverName: { type, command/url, args, tools } }`.
	 * Returns an empty object on any read/parse error (non-fatal).
	 *
	 * @returns Record mapping server names to SDK MCP server configs
	 * @internal
	 */
	protected readCliMcpServers(): Record<string, Record<string, unknown>> {
		const configs: Record<string, Record<string, unknown>> = {};
		try {
			const basePath = nodePath.join(homedir(), ".copilot");

			/** Convert a raw CLI MCP entry to the SDK mcpServers format */
			const toSdkConfig = (entry: {
				type?: string; command?: string; args?: string[];
				url?: string; tools?: string[];
			}): Record<string, unknown> => {
				const tools = entry.tools ?? ["*"];
				if (entry.url || entry.type === "http" || entry.type === "sse") {
					return { type: "http", url: entry.url, tools };
				}
				return { type: "local", command: entry.command, args: entry.args ?? [], tools };
			};

			/** Merge servers from a parsed mcpServers map */
			const mergeServers = (raw: Record<string, Record<string, unknown>>) => {
				for (const [name, entry] of Object.entries(raw)) {
					configs[name] = toSdkConfig(entry as Parameters<typeof toSdkConfig>[0]);
				}
			};

			// 1. User-added servers (`copilot /mcp add`)
			const mcpConfigPath = nodePath.join(basePath, "mcp-config.json");
			if (existsSync(mcpConfigPath)) {
				const parsed = JSON.parse(readFileSync(mcpConfigPath, "utf-8")) as
					{ mcpServers?: Record<string, Record<string, unknown>> };
				if (parsed?.mcpServers) mergeServers(parsed.mcpServers);
			}

			// 2. Installed CLI plugin MCP configs (WorkIQ, etc.)
			const pluginsPath = nodePath.join(basePath, "installed-plugins");
			if (existsSync(pluginsPath)) {
				// Optionally filter by enabled state from config.json
				let enabledSet: Set<string> | null = null;
				const configPath = nodePath.join(basePath, "config.json");
				if (existsSync(configPath)) {
					const cfg = JSON.parse(readFileSync(configPath, "utf-8")) as {
						installed_plugins?: Array<{ name: string; marketplace: string; enabled?: boolean }>;
					};
					if (cfg?.installed_plugins) {
						enabledSet = new Set(
							cfg.installed_plugins
								.filter(p => p.enabled !== false)
								.map(p => `${p.marketplace}/${p.name}`)
						);
					}
				}

				for (const marketplace of readdirSync(pluginsPath)) {
					const marketplacePath = nodePath.join(pluginsPath, marketplace);
					if (!statSync(marketplacePath).isDirectory()) continue;
					for (const pluginName of readdirSync(marketplacePath)) {
						const pluginPath = nodePath.join(marketplacePath, pluginName);
						if (!statSync(pluginPath).isDirectory()) continue;
						if (enabledSet && !enabledSet.has(`${marketplace}/${pluginName}`)) continue;
						const mcpJsonPath = nodePath.join(pluginPath, ".mcp.json");
						if (!existsSync(mcpJsonPath)) continue;
						const parsed = JSON.parse(readFileSync(mcpJsonPath, "utf-8")) as
							{ mcpServers?: Record<string, Record<string, unknown>> };
						if (parsed?.mcpServers) mergeServers(parsed.mcpServers);
					}
				}
			}
		} catch (error) {
			console.warn("[Vault Copilot] Failed to read CLI MCP servers:", error);
		}
		return configs;
	}

	/**
	 * Build the tool allow-list from registered tools.
	 *
	 * Base class uses only the dynamic tool names. Pro overrides may also
	 * consult `config.availableTools` if set by the user.
	 *
	 * @param tools - The combined tool list for this session
	 * @returns Deduplicated array of tool name strings
	 * @internal
	 */
	protected computeAvailableToolAllowList(tools: Array<{ name?: string }>): string[] {
		const dynamicToolNames = tools
			.map((tool) => tool.name)
			.filter((name): name is string => typeof name === "string" && name.trim().length > 0);
		return [...new Set(dynamicToolNames)];
	}

	/**
	 * Convert SDK `SessionEvent` array to `ChatMessage` history.
	 *
	 * @param events - Raw SDK session events
	 * @returns Reconstructed message history
	 * @internal
	 */
	protected convertEventsToMessageHistory(events: SessionEvent[]): ChatMessage[] {
		const messages: ChatMessage[] = [];
		for (const event of events) {
			if (event.type === "user.message") {
				messages.push({
					role: "user",
					content: (event.data as { content?: string })?.content || "",
					timestamp: new Date(),
				});
			} else if (event.type === "assistant.message") {
				messages.push({
					role: "assistant",
					content: (event.data as { content?: string })?.content || "",
					timestamp: new Date(),
				});
			}
		}
		return messages;
	}

	/**
	 * Handle incoming SDK {@link SessionEvent}, log it, and dispatch to external handlers.
	 *
	 * @param event - The SDK session event
	 * @internal
	 */
	protected handleSessionEvent(event: SessionEvent): void {
		if (event.type.startsWith("tool.")) {
			const data = event.data as Record<string, unknown>;
			console.log(`[Vault Copilot] SessionEvent: ${event.type}`, JSON.stringify({
				toolName: data.toolName,
				toolCallId: data.toolCallId,
				success: data.success,
				...(data.result && typeof data.result === "object" && "content" in (data.result as Record<string, unknown>)
					? { resultPreview: String((data.result as Record<string, unknown>).content).substring(0, 200) }
					: {}),
			}));
		}

		if (event.type === "assistant.message") {
			const data = event.data as Record<string, unknown>;
			const toolRequests = data.toolRequests as Array<{ toolCallId: string; name: string }> | undefined;
			if (toolRequests && toolRequests.length > 0) {
				console.log(`[Vault Copilot] assistant.message toolRequests:`, toolRequests.map(t => t.name));
			}
		}

		if (event.type === "session.error") {
			console.error(`[Vault Copilot] SessionEvent: session.error`, JSON.stringify(event.data));
		}
		if (event.type === "session.warning") {
			console.warn(`[Vault Copilot] SessionEvent: session.warning`, JSON.stringify(event.data));
		}

		this.eventTracer.handleEvent(event);
		for (const handler of this.eventHandlers) handler(event);
	}

	/**
	 * Check if the session has gone stale and recreate it if needed.
	 *
	 * @returns `true` if the session was recreated, `false` otherwise
	 * @internal
	 */
	protected async ensureSessionAlive(): Promise<boolean> {
		if (!this.session) return false;
		const idleMs = Date.now() - this.lastSdkActivity;
		if (idleMs < SESSION_STALE_THRESHOLD_MS) return false;

		const idleMinutes = Math.round(idleMs / 60000);
		console.log(`[Vault Copilot] Session idle for ${idleMinutes} min — recreating`);

		const tracingService = getTracingService();
		tracingService.addSdkLog("info", `[Session Reconnect] Idle ${idleMinutes} min — recreating session`, LOG_SOURCES.SESSION_LIFECYCLE);

		const savedHistory = [...this.messageHistory];
		const currentSessionId = this.session.sessionId;

		try {
			await this.createSession(currentSessionId);
			this.messageHistory = savedHistory;
			this.touchActivity();
			if (this.onSessionReconnect) this.onSessionReconnect();
			return true;
		} catch (error) {
			console.error("[Vault Copilot] Failed to recreate stale session:", error);
			tracingService.addSdkLog("error", `[Session Reconnect Failed] ${error}`, LOG_SOURCES.SESSION_LIFECYCLE);
			throw error;
		}
	}

	// ── Public lifecycle ───────────────────────────────────────────────────

	/**
	 * Start the Copilot CLI client process.
	 *
	 * @throws {Error} If the CLI binary is not found or cannot start
	 *
	 * @example
	 * ```typescript
	 * await service.start();
	 * ```
	 */
	async start(): Promise<void> {
		if (this.client) return;

		const clientOptions: Record<string, unknown> = {};
		const resolvedCliPath = this.resolveCliPath();

		if (this.config.cliUrl) {
			clientOptions.cliUrl = this.config.cliUrl;
		}

		const vaultArgs: string[] = [];
		if (this.config.vaultPath) {
			const normalizedPath = this.config.vaultPath.replace(/\\/g, "/");
			clientOptions.cwd = this.config.vaultPath;
			vaultArgs.push("--add-dir", normalizedPath);
		}

		if (process.platform === "win32" && /\.(cmd|bat)$/i.test(resolvedCliPath)) {
			const comSpec = process.env.ComSpec || "cmd.exe";
			clientOptions.cliPath = comSpec;
			clientOptions.cliArgs = ["/c", resolvedCliPath, ...vaultArgs];
		} else {
			clientOptions.cliPath = resolvedCliPath;
			clientOptions.cliArgs = [...vaultArgs];
		}

		if (this.config.tracingEnabled) {
			clientOptions.logLevel = this.config.logLevel || "info";
			interceptConsoleLogs();
		}

		this.client = new CopilotClient(clientOptions);
		this.installPermissionHandlerSafetyNet(this.client);

		console.log("[Vault Copilot] CopilotClient options:", JSON.stringify({
			cliPath: clientOptions.cliPath,
			cliArgs: clientOptions.cliArgs,
			cwd: clientOptions.cwd,
			cliUrl: clientOptions.cliUrl,
			logLevel: clientOptions.logLevel,
		}));

		try {
			await this.client.start();
		} catch (error) {
			this.client = null;
			const errorMessage = error instanceof Error ? error.message : String(error);

			if (errorMessage.includes("ENOENT") || errorMessage.includes("EINVAL") || errorMessage.toLowerCase().includes("not found")) {
				throw new Error(
					"GitHub Copilot CLI not found. Please ensure it is installed and in your PATH. " +
					'Run "npm install -g @github/copilot-cli" or specify the path in settings.'
				);
			}
			if (errorMessage.includes("ECONNREFUSED") || errorMessage.toLowerCase().includes("connection refused")) {
				throw new Error(
					"Could not connect to GitHub Copilot CLI server. " +
					"Please ensure the CLI is running and accessible."
				);
			}
			if (errorMessage.includes("EACCES") || errorMessage.toLowerCase().includes("permission")) {
				throw new Error(
					"Permission denied when starting GitHub Copilot CLI. " +
					"Please check file permissions and try running with appropriate access."
				);
			}

			console.error("[Vault Copilot] Failed to start Copilot client:", error);
			throw error;
		}
	}

	/**
	 * Stop the Copilot CLI client and clean up resources.
	 *
	 * Subclasses should call `super.stop()` if they override this method.
	 *
	 * @example
	 * ```typescript
	 * await service.stop();
	 * ```
	 */
	async stop(): Promise<void> {
		if (this.session) {
			try {
				await this.session.destroy();
			} catch (error) {
				console.warn("[Vault Copilot] Error destroying session:", error);
			}
			this.session = null;
		}

		if (this.client) {
			const stopTimeout = this.config.stopTimeout ?? DEFAULT_STOP_TIMEOUT;
			try {
				const stopPromise = this.client.stop();
				const timeoutPromise = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error("Stop timeout")), stopTimeout)
				);
				await Promise.race([stopPromise, timeoutPromise]);
			} catch {
				console.warn("[Vault Copilot] Graceful stop timed out, forcing stop...");
				try {
					await this.client.forceStop();
				} catch (forceError) {
					console.error("[Vault Copilot] Force stop failed:", forceError);
				}
			}
			this.client = null;
		}
		this.messageHistory = [];
	}

	/**
	 * Create a new chat session.
	 *
	 * Calls {@link buildTools} and {@link buildSystemPrompt} to assemble
	 * the session configuration. Auto-starts the client if not running.
	 *
	 * @param sessionId - Optional session ID for persistence
	 * @returns The SDK-assigned session ID
	 *
	 * @throws {Error} If the client fails to start or session creation fails
	 *
	 * @example
	 * ```typescript
	 * const id = await service.createSession();
	 * ```
	 */
	async createSession(sessionId?: string): Promise<string> {
		if (!this.client) await this.start();
		const client = this.client;
		if (!client) throw new Error("Copilot client not initialized");

		if (this.session) await this.session.destroy();

		const tools = this.buildTools();
		const sessionConfig: Record<string, unknown> = {
			model: this.config.model,
			streaming: this.config.streaming,
			tools,
			systemMessage: { content: this.buildSystemPrompt() },
			infiniteSessions: this.buildInfiniteSessionCompactionConfig(),
			onPermissionRequest: approveAll,
			// Do not restrict availableTools — allows CLI-native MCP extensions (e.g. WorkIQ)
			// registered in the Copilot CLI config to be callable alongside plugin tools.
		};

		const cliMcpServers = this.readCliMcpServers();
		if (Object.keys(cliMcpServers).length > 0) {
			sessionConfig.mcpServers = cliMcpServers;
			console.log("[Vault Copilot] CLI MCP servers:", Object.keys(cliMcpServers));
		}

		if (sessionId) sessionConfig.sessionId = sessionId;

		const sessionConfigWithPermissions = this.ensurePermissionRequestHandler(sessionConfig);
		console.log("[Vault Copilot] Creating session with config:", JSON.stringify({
			...sessionConfigWithPermissions,
			tools: (sessionConfigWithPermissions.tools as unknown[])?.length + " tools",
			systemMessage: "(omitted)",
		}, null, 2));

		this.session = await client.createSession(
			sessionConfigWithPermissions as unknown as Parameters<CopilotClient["createSession"]>[0]
		);
		this.session.on((event: SessionEvent) => this.handleSessionEvent(event));
		this.messageHistory = [];
		this.touchActivity();

		const actualSessionId = this.session.sessionId;
		console.log("[Vault Copilot] Session created with ID:", actualSessionId);
		return actualSessionId;
	}

	/**
	 * Resume an existing session by its ID.
	 *
	 * Falls back to {@link createSession} if the session no longer exists.
	 *
	 * @param sessionId - The SDK session ID to resume
	 * @returns The resumed (or newly created) session ID
	 *
	 * @throws {Error} If client start fails
	 *
	 * @example
	 * ```typescript
	 * const id = await service.resumeSession('sess_abc123');
	 * ```
	 */
	async resumeSession(sessionId: string): Promise<string> {
		if (!this.client) await this.start();
		const client = this.client;
		if (!client) throw new Error("Copilot client not initialized");

		if (this.session) await this.session.destroy();

		const tools = this.buildTools();
		const resumeConfig: Record<string, unknown> = {
			tools,
			onPermissionRequest: approveAll,
			// Do not restrict availableTools — allows CLI-native MCP extensions to be callable.
		};

		const cliMcpServers = this.readCliMcpServers();
		if (Object.keys(cliMcpServers).length > 0) {
			resumeConfig.mcpServers = cliMcpServers;
			console.log("[Vault Copilot] CLI MCP servers (resume):", Object.keys(cliMcpServers));
		}

		const resumeConfigWithPermissions = this.ensurePermissionRequestHandler(resumeConfig);
		console.log("[Vault Copilot] Resuming session:", sessionId);

		try {
			this.session = await client.resumeSession(
				sessionId,
				resumeConfigWithPermissions as Parameters<typeof client.resumeSession>[1]
			);
			this.session.on((event: SessionEvent) => this.handleSessionEvent(event));

			const events = await this.session.getMessages();
			this.messageHistory = this.convertEventsToMessageHistory(events);
			this.touchActivity();

			console.log("[Vault Copilot] Session resumed with", this.messageHistory.length, "messages");
			return this.session.sessionId;
		} catch (error) {
			console.warn("[Vault Copilot] Failed to resume session, creating new one:", error);
			return this.createSession(sessionId);
		}
	}

	/**
	 * List all available SDK sessions.
	 *
	 * @returns Array of session metadata objects
	 *
	 * @example
	 * ```typescript
	 * const sessions = await service.listSessions();
	 * ```
	 */
	async listSessions(): Promise<Array<{ sessionId: string; startTime?: Date; modifiedTime?: Date; summary?: string; isRemote?: boolean }>> {
		if (!this.client) await this.start();
		const client = this.client;
		if (!client) throw new Error("Copilot client not initialized");

		try {
			const sessions = await client.listSessions();
			return sessions.map(s => ({
				sessionId: s.sessionId,
				startTime: s.startTime,
				modifiedTime: s.modifiedTime,
				summary: s.summary,
				isRemote: s.isRemote,
			}));
		} catch (error) {
			console.error("[Vault Copilot] Failed to list sessions:", error);
			return [];
		}
	}

	/**
	 * Delete a session by ID.
	 *
	 * @param sessionId - The session ID to delete
	 * @throws {Error} If deletion fails
	 *
	 * @example
	 * ```typescript
	 * await service.deleteSession('sess_abc123');
	 * ```
	 */
	async deleteSession(sessionId: string): Promise<void> {
		if (!this.client) await this.start();
		const client = this.client;
		if (!client) throw new Error("Copilot client not initialized");

		try {
			await client.deleteSession(sessionId);
			if (this.session?.sessionId === sessionId) {
				this.session = null;
				this.messageHistory = [];
			}
		} catch (error) {
			console.error("[Vault Copilot] Failed to delete session:", error);
			throw error;
		}
	}

	/**
	 * List all available models from the Copilot CLI.
	 *
	 * @returns Array of model information objects
	 *
	 * @example
	 * ```typescript
	 * const models = await service.listModels();
	 * ```
	 */
	async listModels(): Promise<ModelInfoResult[]> {
		if (!this.client) await this.start();
		const client = this.client;
		if (!client) throw new Error("Copilot client not initialized");

		try {
			const models = await client.listModels();
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
				policy: m.policy ? { state: m.policy.state, terms: m.policy.terms } : undefined,
				billingMultiplier: m.billing?.multiplier,
			}));
		} catch (error) {
			console.error("[Vault Copilot] Failed to list models:", error);
			return [];
		}
	}

	/**
	 * Compact the active session to free context window space.
	 *
	 * @returns Compaction result with tokens and messages freed
	 * @throws {Error} If no session is active
	 *
	 * @example
	 * ```typescript
	 * const result = await service.compactSession();
	 * ```
	 */
	async compactSession(): Promise<SessionCompactionResult> {
		if (!this.session) await this.createSession();
		const session = this.session;
		if (!session) throw new Error("Session not initialized");

		const result = await session.rpc.compaction.compact();
		this.touchActivity();
		return {
			success: result.success,
			tokensRemoved: result.tokensRemoved,
			messagesRemoved: result.messagesRemoved,
		};
	}

	/**
	 * Send a message and wait for the full response.
	 *
	 * @param prompt - The user message to send
	 * @param timeout - Optional request timeout in ms
	 * @returns The assistant's full response text
	 *
	 * @throws {Error} If the session is not available or the request times out
	 *
	 * @example
	 * ```typescript
	 * const reply = await service.sendMessage('Summarize my meeting notes');
	 * ```
	 */
	/**
	 * Write base64 image attachments to temp files and return their paths.
	 * Returns an array of objects with path and name for cleanup.
	 *
	 * @param images - Image attachments to write to disk
	 * @returns Array of { path, name } objects for the written temp files
	 * @internal
	 */
	private writeImageTempFiles(images: ImageAttachment[]): { path: string; name: string }[] {
		const results: { path: string; name: string }[] = [];
		for (const img of images) {
			try {
				const ext = img.mimeType.split("/")[1] ?? "png";
				const tempPath = nodePath.join(tmpdir(), `vc-img-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
				writeFileSync(tempPath, Buffer.from(img.base64Data, "base64"));
				results.push({ path: tempPath, name: img.name });
			} catch {
				// Skip images that fail to write
			}
		}
		return results;
	}

	/**
	 * Remove temp files written for image attachments.
	 *
	 * @param paths - File paths to delete
	 * @internal
	 */
	private cleanupTempFiles(paths: string[]): void {
		for (const p of paths) {
			try { unlinkSync(p); } catch { /* ignore */ }
		}
	}

	async sendMessage(prompt: string, timeout?: number, images?: ImageAttachment[]): Promise<string> {
		if (!this.session) await this.createSession();
		await this.ensureSessionAlive();
		const session = this.session;
		if (!session) throw new Error("Session not initialized");

		const tracingService = getTracingService();
		tracingService.addSdkLog("info", `[User Prompt]\n${prompt}`, LOG_SOURCES.COPILOT_PROMPT);

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
			source: "obsidian",
		});
		this.touchActivity();

		const requestTimeout = timeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
		const tempFiles = images && images.length > 0 ? this.writeImageTempFiles(images) : [];
		const attachments = tempFiles.map(f => ({ type: "file" as const, path: f.path, displayName: f.name }));

		try {
			const response = await session.sendAndWait(
				attachments.length > 0 ? { prompt, attachments } : { prompt },
				requestTimeout
			);
			this.touchActivity();

			const assistantContent = response?.data?.content || "";
			tracingService.addSdkLog("info", `[Assistant Response]\n${assistantContent.substring(0, 500)}${assistantContent.length > 500 ? "..." : ""}`, LOG_SOURCES.COPILOT_RESPONSE);

			this.messageHistory.push({
				role: "assistant",
				content: assistantContent,
				timestamp: new Date(),
				source: "obsidian",
			});
			return assistantContent;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			tracingService.addSdkLog("error", `[Request Error] ${errorMessage}`, LOG_SOURCES.COPILOT_ERROR);
			if (errorMessage.toLowerCase().includes("timeout")) {
				throw new Error(`Request timed out after ${requestTimeout / 1000} seconds`);
			}
			throw error;
		} finally {
			this.cleanupTempFiles(tempFiles.map(f => f.path));
		}
	}

	/**
	 * Send a message and stream the response via callbacks.
	 *
	 * @param prompt - The user message to send
	 * @param onDelta - Called for each streamed response chunk
	 * @param onComplete - Optional callback for the final assembled response
	 * @param timeout - Optional request timeout in ms (inactivity-based)
	 * @param images - Optional image attachments to include with the message
	 *
	 * @throws {Error} If the session is not available or the request times out
	 *
	 * @example
	 * ```typescript
	 * await service.sendMessageStreaming(
	 *   'List my tasks',
	 *   (delta) => appendToUI(delta),
	 *   (full) => renderMarkdown(full),
	 * );
	 * ```
	 */
	async sendMessageStreaming(
		prompt: string,
		onDelta: (delta: string) => void,
		onComplete?: (fullContent: string) => void,
		timeout?: number,
		images?: ImageAttachment[]
	): Promise<void> {
		if (!this.session) await this.createSession();
		await this.ensureSessionAlive();
		const session = this.session;
		if (!session) throw new Error("Session not initialized");

		const tracingService = getTracingService();
		tracingService.addSdkLog("info", `[User Prompt (Streaming)]\n${prompt}`, LOG_SOURCES.COPILOT_PROMPT);

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
			source: "obsidian",
		});
		this.touchActivity();

		let fullContent = "";
		let finalContent = "";
		const requestTimeout = timeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
		const tempFiles = images && images.length > 0 ? this.writeImageTempFiles(images) : [];
		const attachments = tempFiles.map(f => ({ type: "file" as const, path: f.path, displayName: f.name }));

		return new Promise<void>((resolve, reject) => {
			let timeoutId: NodeJS.Timeout | null = null;
			let hasCompleted = false;

			const cleanup = () => {
				hasCompleted = true;
				if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
			};

			const resetTimeout = () => {
				if (hasCompleted) return;
				if (timeoutId) clearTimeout(timeoutId);
				timeoutId = setTimeout(async () => {
					if (!hasCompleted) {
						cleanup();
						unsubscribe();
						try { await this.session?.abort(); } catch {}
						tracingService.addSdkLog("error", `[Streaming Timeout] ${requestTimeout / 1000}s of inactivity`, LOG_SOURCES.COPILOT_ERROR);
						reject(new Error(`Streaming request timed out after ${requestTimeout / 1000} seconds of inactivity`));
					}
				}, requestTimeout);
			};

			resetTimeout();
			let lastRenderedContent = "";

			const unsubscribe = session.on((event: SessionEvent) => {
				if (hasCompleted) return;
				resetTimeout();

				if (event.type !== "assistant.message_delta" && event.type !== "assistant.reasoning_delta") {
					tracingService.addSdkLog("debug", `[SDK Event] ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`, LOG_SOURCES.COPILOT_EVENT);
				}

				if (event.type === "assistant.message_delta") {
					const delta = (event.data as { deltaContent: string }).deltaContent;
					fullContent += delta;
					finalContent = fullContent;
					onDelta(delta);
				} else if (event.type === "assistant.message") {
					const assistantContent = (event.data as { content?: string }).content ?? "";
					finalContent = fullContent.length === 0 || assistantContent.length > fullContent.length
						? assistantContent
						: fullContent;
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
						source: "obsidian",
					});
					tracingService.addSdkLog("info", `[Assistant Response (Streaming)]\n${resolvedContent.substring(0, 500)}${resolvedContent.length > 500 ? "..." : ""}`, LOG_SOURCES.COPILOT_RESPONSE);
					if (onComplete && resolvedContent !== lastRenderedContent) onComplete(resolvedContent);
					unsubscribe();
					resolve();
				} else if (event.type === "session.error") {
					cleanup();
					const errorData = event.data as { message?: string };
					tracingService.addSdkLog("error", `[Streaming Error] ${errorData.message || "Unknown error"}`, LOG_SOURCES.COPILOT_ERROR);
					unsubscribe();
					reject(new Error(errorData.message || "Session error during streaming"));
				}
			});

			session.send(attachments.length > 0 ? { prompt, attachments } : { prompt }).catch((err) => {
				cleanup();
				unsubscribe();
				tracingService.addSdkLog("error", `[Send Error] ${err.message || err}`, LOG_SOURCES.COPILOT_ERROR);
				reject(err);
			});
		}).finally(() => {
			this.cleanupTempFiles(tempFiles.map(f => f.path));
		});
	}

	/**
	 * Abort the current in-progress SDK request.
	 *
	 * @example
	 * ```typescript
	 * await service.abort();
	 * ```
	 */
	async abort(): Promise<void> {
		if (this.session) {
			try {
				await this.session.abort();
				console.log("[Vault Copilot] Request aborted");
			} catch (error) {
				console.warn("[Vault Copilot] Error during abort:", error);
			}
		}
	}

	/**
	 * Clear the local message history and recreate the session.
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
	 * Load (or create) a session, restoring optional fallback messages.
	 *
	 * Tries to resume the session via SDK persistence; falls back to a new
	 * session and restores `messages` as local history if provided.
	 *
	 * @param sessionId - The session ID to load
	 * @param messages - Optional fallback messages to restore as local history
	 *
	 * @example
	 * ```typescript
	 * await service.loadSession('sess_abc123', savedHistory);
	 * ```
	 */
	async loadSession(sessionId: string, messages?: ChatMessage[]): Promise<void> {
		if (!this.client) await this.start();

		try {
			await this.resumeSession(sessionId);
		} catch (error) {
			console.warn("[Vault Copilot] Could not resume session, creating fresh SDK session:", error);
			await this.createSession();
			if (messages) {
				this.messageHistory = messages.map(msg => ({ ...msg, timestamp: new Date(msg.timestamp) }));
			}
		}
	}

	/**
	 * Read multiple notes in one call.
	 *
	 * The base implementation performs plain reads. The Pro service overrides
	 * {@link buildSummarizer} to return an AI-powered summarizer for large batches.
	 *
	 * @param paths - Vault-relative paths of notes to read
	 * @param aiSummarize - When `true`, use AI summaries instead of full content
	 * @param summaryPrompt - Optional custom prompt for AI summarization
	 * @returns Per-path read results
	 *
	 * @example
	 * ```typescript
	 * const { results } = await service.batchReadNotes(['Daily/2025-06-01.md']);
	 * ```
	 */
	async batchReadNotes(
		paths: string[],
		aiSummarize?: boolean,
		summaryPrompt?: string
	): Promise<{ results: Array<{ path: string; success: boolean; content?: string; summary?: string; error?: string }> }> {
		const summarizer = this.buildSummarizer();
		return VaultOps.batchReadNotes(this.app, paths, aiSummarize, summaryPrompt, summarizer);
	}

	/**
	 * Update the service configuration at runtime.
	 *
	 * @param config - Partial config to merge into the current configuration
	 *
	 * @example
	 * ```typescript
	 * service.updateConfig({ model: 'claude-sonnet-4' });
	 * ```
	 */
	updateConfig(config: Partial<GitHubCopilotCliConfig>): void {
		this.config = { ...this.config, ...config };
	}

	// ── Public query methods ───────────────────────────────────────────────

	/**
	 * Get a snapshot of the current local message history.
	 *
	 * @returns Copy of the message history array
	 */
	getMessageHistory(): ChatMessage[] {
		return [...this.messageHistory];
	}

	/**
	 * Get a snapshot of the current session state.
	 *
	 * @returns Object containing a copy of the message history
	 */
	getSessionState(): { messages: ChatMessage[] } {
		return { messages: [...this.messageHistory] };
	}

	/**
	 * Return the active session ID, or null when no session is active.
	 *
	 * @returns Session ID string or null
	 *
	 * @example
	 * ```typescript
	 * const id = service.getSessionId(); // e.g. 'sess_abc123'
	 * ```
	 */
	getSessionId(): string | null {
		return this.session?.sessionId ?? null;
	}

	/**
	 * Check whether the Copilot CLI client is running.
	 *
	 * @returns `true` if the client is connected
	 */
	isConnected(): boolean {
		return this.client !== null;
	}

	/**
	 * Register an external handler for all SDK session events.
	 *
	 * @param handler - Handler function to call on each event
	 * @returns Unsubscribe function to remove the handler
	 *
	 * @example
	 * ```typescript
	 * const unsub = service.onEvent((event) => console.log(event.type));
	 * // Later:
	 * unsub();
	 * ```
	 */
	onEvent(handler: (event: SessionEvent) => void): () => void {
		this.eventHandlers.push(handler);
		return () => {
			const index = this.eventHandlers.indexOf(handler);
			if (index > -1) this.eventHandlers.splice(index, 1);
		};
	}

	/**
	 * Set the callback to invoke when the session is automatically recreated
	 * due to the 30-minute CLI idle timeout.
	 *
	 * @param callback - Function to call on reconnect, or `null` to unregister
	 *
	 * @example
	 * ```typescript
	 * service.setSessionReconnectCallback(() => showReconnectNotice());
	 * ```
	 */
	setSessionReconnectCallback(callback: (() => void) | null): void {
		this.onSessionReconnect = callback;
	}
}
