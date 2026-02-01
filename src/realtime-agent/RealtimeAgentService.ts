/**
 * RealtimeAgentService - OpenAI Realtime Voice Agent integration
 *
 * Provides real-time voice conversation capabilities using OpenAI's Realtime API
 * with support for tools, interruptions, and live transcription.
 */

import { App, Notice } from "obsidian";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import {
	RealtimeAgentConfig,
	RealtimeAgentEvents,
	RealtimeAgentState,
	RealtimeHistoryItem,
	RealtimeToolConfig,
	ToolExecutionCallback,
	DEFAULT_TOOL_CONFIG,
	REALTIME_MODEL,
	logger,
} from "./types";
import { createAllTools, getToolNames } from "./tool-manager";
import { handlePossibleJsonToolCall, mightBeJsonToolCall } from "./workarounds";

export class RealtimeAgentService {
	private app: App;
	private config: RealtimeAgentConfig;
	private agent: RealtimeAgent | null = null;
	private session: RealtimeSession | null = null;
	private state: RealtimeAgentState = "idle";
	private listeners: Map<
		keyof RealtimeAgentEvents,
		Set<(...args: unknown[]) => void>
	> = new Map();
	private onToolExecution: ToolExecutionCallback | null = null;
	private toolConfig: RealtimeToolConfig;

	constructor(app: App, config: RealtimeAgentConfig) {
		this.app = app;
		this.config = config;
		this.toolConfig = { ...DEFAULT_TOOL_CONFIG, ...config.toolConfig };
	}

	/**
	 * Get current state
	 */
	getState(): RealtimeAgentState {
		return this.state;
	}

	/**
	 * Subscribe to events
	 */
	on<K extends keyof RealtimeAgentEvents>(
		event: K,
		callback: RealtimeAgentEvents[K]
	): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		const callbacks = this.listeners.get(event)!;
		callbacks.add(callback as (...args: unknown[]) => void);

		return () => {
			callbacks.delete(callback as (...args: unknown[]) => void);
		};
	}

	/**
	 * Emit an event
	 */
	private emit<K extends keyof RealtimeAgentEvents>(
		event: K,
		...args: Parameters<RealtimeAgentEvents[K]>
	): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach((cb) => {
				try {
					cb(...args);
				} catch (e) {
					console.error(`[RealtimeAgent] Error in ${event} callback:`, e);
				}
			});
		}
	}

	/**
	 * Update state and emit change event
	 */
	private setState(newState: RealtimeAgentState): void {
		if (this.state !== newState) {
			this.state = newState;
			this.emit("stateChange", newState);
		}
	}

	/**
	 * Update tool configuration at runtime
	 */
	updateToolConfig(config: Partial<RealtimeToolConfig>): void {
		this.toolConfig = { ...this.toolConfig, ...config };
		logger.info("Tool config updated:", this.toolConfig);
	}

	/**
	 * Generate an ephemeral key for WebRTC connection
	 */
	private async getEphemeralKey(): Promise<string> {
		const response = await fetch(
			"https://api.openai.com/v1/realtime/client_secrets",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					session: {
						type: "realtime",
						model: REALTIME_MODEL,
					},
				}),
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(
				`Failed to get ephemeral key: ${response.status} ${error}`
			);
		}

		const data = await response.json();
		return data.client_secret?.value || data.value;
	}

	/**
	 * Connect to the realtime session
	 */
	async connect(): Promise<void> {
		if (this.state !== "idle") {
			throw new Error(`Cannot connect: agent is in ${this.state} state`);
		}

		try {
			this.setState("connecting");

			// Create all tools for the agent
			const allTools = createAllTools(
				this.app,
				this.toolConfig,
				this.config.mcpManager,
				this.onToolExecution
			);

			// Log tools being registered for debugging
			const toolNames = getToolNames(allTools);
			logger.info(
				`Creating agent with ${allTools.length} tools:`,
				toolNames
			);

			// Create the agent with instructions including tool names
			const toolNamesStr = toolNames.join(", ");

			this.agent = new RealtimeAgent({
				name: "Vault Assistant",
				instructions:
					this.config.instructions ||
					`You are a helpful voice assistant for an Obsidian knowledge vault.

YOUR AVAILABLE TOOLS (use these EXACT names):
${toolNamesStr}

CRITICAL RULES:
1. To mark tasks complete, call the "mark_tasks_complete" tool with the note path
2. To modify notes, call "update_note" or "append_to_note" 
3. NEVER output text that looks like code, JSON, or function calls
4. NEVER invent tool names - only use the tools listed above
5. When you need to take an action, USE A TOOL - don't describe what you would do

WRONG: Saying "update_checklist(...)" or outputting JSON
RIGHT: Actually calling the mark_tasks_complete tool

When [INTERNAL CONTEXT UPDATE] messages arrive, note them silently - do not speak about them.

Be conversational. After using a tool, briefly confirm what you did.`,
				tools: allTools,
				voice: this.config.voice || "alloy",
			});

			// Create session with configuration
			this.session = new RealtimeSession(this.agent, {
				model: REALTIME_MODEL,
				config: {
					toolChoice: "auto",
					voice: this.config.voice || "alloy",
					inputAudioTranscription: {
						model: "whisper-1",
						...(this.config.language
							? { language: this.config.language }
							: {}),
					},
					turnDetection: {
						type: this.config.turnDetection || "server_vad",
						threshold: 0.5,
						prefix_padding_ms: 300,
						silence_duration_ms: 500,
						create_response: true,
					},
				},
			});

			// Debug: Log the session config that will be sent
			const sessionConfig = await this.session.getInitialSessionConfig();
			logger.debug(
				"Session config tools count:",
				sessionConfig.tools?.length || 0
			);
			logger.debug(
				"Session config toolChoice:",
				sessionConfig.toolChoice
			);

			// Set up event handlers
			this.setupEventHandlers();

			// Get ephemeral key and connect
			const ephemeralKey = await this.getEphemeralKey();
			await this.session.connect({ apiKey: ephemeralKey });

			this.setState("connected");
			new Notice("Realtime agent connected");
		} catch (error) {
			this.setState("error");
			this.emit(
				"error",
				error instanceof Error ? error : new Error(String(error))
			);
			throw error;
		}
	}

	/**
	 * Set up event handlers for the session
	 */
	private setupEventHandlers(): void {
		if (!this.session) return;

		// Handle history updates (transcripts)
		this.session.on("history_updated", (history) => {
			// Debug: Check for function_call items in history
			const functionCalls = history.filter(
				(item) => item.type === "function_call"
			);
			if (functionCalls.length > 0) {
				logger.debug(
					"Function calls in history:",
					functionCalls
				);
			}

			// Convert to our format and emit
			const items: RealtimeHistoryItem[] = history.map((item) => {
				const result: RealtimeHistoryItem = {
					type: item.type as RealtimeHistoryItem["type"],
				};

				if ("role" in item) {
					result.role = item.role as RealtimeHistoryItem["role"];
				}

				if ("content" in item && Array.isArray(item.content)) {
					for (const contentItem of item.content) {
						if ("text" in contentItem && contentItem.text) {
							result.content = contentItem.text;
						}
						if ("transcript" in contentItem && contentItem.transcript) {
							result.transcript = contentItem.transcript;
						}
					}
				}

				if (item.type === "function_call") {
					if ("name" in item) result.name = item.name as string;
					if ("arguments" in item)
						result.arguments = item.arguments as string;
					if ("output" in item)
						result.output = item.output as string | undefined;
				}

				return result;
			});
			this.emit("historyUpdated", items);

			// Emit individual transcript items for messages with content
			const lastItem = items[items.length - 1];
			if (lastItem && (lastItem.content || lastItem.transcript)) {
				this.emit("transcript", lastItem);

				// WORKAROUND: Detect structured output that looks like a tool call
				if (mightBeJsonToolCall(lastItem)) {
					const content =
						lastItem.content || lastItem.transcript || "";
					handlePossibleJsonToolCall(
						this.app,
						content,
						this.onToolExecution
					);
				}
			}
		});

		// Handle audio interruption
		this.session.on("audio_interrupted", () => {
			this.emit("interrupted");
		});

		// Handle agent audio start (speaking)
		this.session.on("audio_start", () => {
			this.setState("speaking");
		});

		// Handle agent audio stop
		this.session.on("audio_stopped", () => {
			if (this.state === "speaking") {
				this.setState("connected");
			}
		});

		// Handle agent tool calls
		this.session.on(
			"agent_tool_start",
			(_context, _agent, tool, details) => {
				logger.debug(
					"Tool call STARTED:",
					tool.name,
					details.toolCall
				);
			}
		);

		this.session.on(
			"agent_tool_end",
			(_context, _agent, tool, result, details) => {
				logger.debug(
					"Tool call COMPLETED:",
					tool.name,
					"result:",
					result?.substring(0, 200)
				);
				this.emit("toolExecution", tool.name, details.toolCall, result);
			}
		);

		// Debug: Log raw transport events to see what's coming from the API
		this.session.on("transport_event", (event) => {
			const eventType = (event as Record<string, unknown>).type as string;
			if (eventType?.includes("function") || eventType?.includes("tool")) {
				logger.debug(
					"Transport event (tool-related):",
					event
				);
			}
		});

		// Handle errors
		this.session.on("error", (error) => {
			this.emit("error", new Error(String(error.error)));
		});
	}

	/**
	 * Disconnect from the session
	 */
	async disconnect(): Promise<void> {
		try {
			if (this.session) {
				this.session.close();
				this.session = null;
			}
			this.agent = null;
			this.setState("idle");
		} catch (error) {
			logger.error("Error disconnecting:", error);
			this.setState("idle");
		}
	}

	/**
	 * Manually interrupt the agent
	 */
	interrupt(): void {
		if (this.session && this.state === "speaking") {
			this.session.interrupt();
		}
	}

	/**
	 * Send a text message to the agent
	 */
	sendMessage(text: string): void {
		if (
			this.session &&
			(this.state === "connected" || this.state === "listening")
		) {
			this.session.sendMessage(text);
		}
	}

	/**
	 * Send context silently without triggering a response or showing in transcript
	 */
	sendContext(context: string): void {
		if (
			this.session &&
			(this.state === "connected" || this.state === "listening")
		) {
			this.session.sendMessage(
				`[INTERNAL CONTEXT UPDATE - IMPORTANT: Do NOT speak or respond to this message. Simply note this information silently for reference. No acknowledgment needed.]\n\n${context}`
			);
			logger.debug("Context shared silently");
		}
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<RealtimeAgentConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Set tool execution callback
	 */
	setToolExecutionCallback(callback: ToolExecutionCallback | null): void {
		this.onToolExecution = callback;
	}

	/**
	 * Get current history
	 */
	getHistory(): RealtimeHistoryItem[] {
		if (!this.session) return [];

		const history = this.session.history || [];
		return history.map((item: unknown) => {
			const h = item as Record<string, unknown>;
			return {
				type: h.type as RealtimeHistoryItem["type"],
				role: h.role as RealtimeHistoryItem["role"],
				content: h.content as string | undefined,
				transcript: h.transcript as string | undefined,
				name: h.name as string | undefined,
				arguments: h.arguments as string | undefined,
				output: h.output as string | undefined,
			};
		});
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.state !== "idle" && this.state !== "error";
	}

	/**
	 * Destroy the service
	 */
	async destroy(): Promise<void> {
		await this.disconnect();
		this.listeners.clear();
	}
}
