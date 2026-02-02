/**
 * BaseVoiceAgent - Abstract base class for voice agents
 * 
 * Provides shared functionality for:
 * - Tracing and history with agent attribution
 * - Event handling and state management
 * - Handoff registration and coordination
 * - Session lifecycle (connect, disconnect, interrupt)
 */

import { App } from "obsidian";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import type { tool } from "@openai/agents/realtime";
import {
	BaseVoiceAgentConfig,
	RealtimeAgentEvents,
	RealtimeAgentState,
	RealtimeHistoryItem,
	ToolApprovalRequest,
	ToolExecutionCallback,
	REALTIME_MODEL,
	logger,
} from "./types";
import { getTracingService } from "../copilot/TracingService";

/**
 * Abstract base class for voice agents with shared tracing, history, and handoff support
 */
export abstract class BaseVoiceAgent {
	/** Agent name for identification in traces and history */
	public readonly name: string;

	/** Obsidian App reference */
	protected app: App;

	/** Configuration */
	protected config: BaseVoiceAgentConfig;

	/** The underlying OpenAI RealtimeAgent instance */
	protected agent: RealtimeAgent | null = null;

	/** The RealtimeSession (only created by main agent, shared via handoffs) */
	protected session: RealtimeSession | null = null;

	/** Current agent state */
	protected state: RealtimeAgentState = "idle";

	/** Current trace ID for this session */
	protected currentTraceId: string = "";

	/** Event listeners */
	protected listeners: Map<keyof RealtimeAgentEvents, Set<(...args: unknown[]) => void>> = new Map();

	/** Tool execution callback */
	protected onToolExecution: ToolExecutionCallback | null = null;

	/** Registered handoff agents by name */
	protected handoffAgents: Map<string, BaseVoiceAgent> = new Map();

	/** Currently active agent (self or handoff target) */
	protected activeAgent: BaseVoiceAgent = this;

	/** Tools approved for the entire session */
	protected sessionApprovedTools: Set<string> = new Set();

	/** Counter for approval request IDs */
	protected approvalRequestCounter: number = 0;

	constructor(name: string, app: App, config: BaseVoiceAgentConfig) {
		this.name = name;
		this.app = app;
		this.config = config;
	}

	// =========================================================================
	// Abstract Methods - Subclasses must implement
	// =========================================================================

	/**
	 * Get the instructions for this agent (from markdown or hardcoded)
	 */
	abstract getInstructions(): string;

	/**
	 * Get the handoff description (when should other agents hand off to this one)
	 */
	abstract getHandoffDescription(): string;

	/**
	 * Get the tools this agent can use
	 */
	abstract getTools(): ReturnType<typeof tool>[];

	// =========================================================================
	// State Management
	// =========================================================================

	/**
	 * Get current state
	 */
	getState(): RealtimeAgentState {
		return this.state;
	}

	/**
	 * Update state and emit change event
	 */
	protected setState(newState: RealtimeAgentState): void {
		if (this.state !== newState) {
			this.state = newState;
			this.emit("stateChange", newState);
		}
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.state !== "idle" && this.state !== "error";
	}

	// =========================================================================
	// Event System
	// =========================================================================

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
	protected emit<K extends keyof RealtimeAgentEvents>(
		event: K,
		...args: Parameters<RealtimeAgentEvents[K]>
	): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach((cb) => {
				try {
					cb(...args);
				} catch (e) {
					console.error(`[${this.name}] Error in ${event} callback:`, e);
				}
			});
		}
	}

	// =========================================================================
	// Handoff Management
	// =========================================================================

	/**
	 * Register an agent as a handoff target
	 */
	registerHandoff(agent: BaseVoiceAgent): void {
		this.handoffAgents.set(agent.name, agent);
		logger.info(`[${this.name}] Registered handoff to: ${agent.name}`);
	}

	/**
	 * Get SDK RealtimeAgent instances for handoffs array
	 */
	protected getHandoffAgentInstances(): RealtimeAgent[] {
		const agents: RealtimeAgent[] = [];
		for (const handoffAgent of this.handoffAgents.values()) {
			const sdkAgent = handoffAgent.buildAgent();
			if (sdkAgent) {
				agents.push(sdkAgent);
			}
		}
		return agents;
	}

	/**
	 * Build the RealtimeAgent instance with handoffs configured
	 */
	buildAgent(): RealtimeAgent {
		const tools = this.getTools();
		const handoffs = this.getHandoffAgentInstances();

		logger.info(`[${this.name}] Building agent with ${tools.length} tools and ${handoffs.length} handoffs`);

		this.agent = new RealtimeAgent({
			name: this.name,
			handoffDescription: this.getHandoffDescription(),
			instructions: this.getInstructions(),
			tools,
			handoffs,
			voice: this.config.voice || "alloy",
		});

		return this.agent;
	}

	// =========================================================================
	// Tracing
	// =========================================================================

	/**
	 * Start a trace for this voice session
	 */
	protected startTrace(metadata?: Record<string, unknown>): string {
		const tracingService = getTracingService();
		this.currentTraceId = tracingService.startTrace(`Voice: ${this.name}`, {
			agentName: this.name,
			voice: this.config.voice,
			...metadata,
		});
		return this.currentTraceId;
	}

	/**
	 * Add a span to the current trace
	 */
	protected addTraceSpan(
		name: string,
		spanType: string,
		data?: Record<string, unknown>
	): string {
		if (!this.currentTraceId) return "";
		const tracingService = getTracingService();
		return tracingService.addSpan(this.currentTraceId, name, spanType, {
			agentName: this.activeAgent.name,
			...data,
		});
	}

	/**
	 * Complete a trace span
	 */
	protected completeTraceSpan(spanId: string): void {
		if (spanId) {
			const tracingService = getTracingService();
			tracingService.completeSpan(spanId);
		}
	}

	/**
	 * End the current trace
	 */
	protected endTrace(): void {
		if (this.currentTraceId) {
			const tracingService = getTracingService();
			tracingService.endTrace(this.currentTraceId);
			this.currentTraceId = "";
		}
	}

	// =========================================================================
	// Session Event Handlers
	// =========================================================================

	/**
	 * Set up event handlers for the session
	 */
	protected setupEventHandlers(): void {
		if (!this.session) return;

		// Handle history updates (transcripts)
		this.session.on("history_updated", (history) => {
			logger.debug(`[${this.name}] History updated with ${history.length} items`);

			// Convert to our format with agent attribution
			const items: RealtimeHistoryItem[] = history.map((item) => {
				const result: RealtimeHistoryItem = {
					type: item.type as RealtimeHistoryItem["type"],
					agentName: this.activeAgent.name,
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

				// Handle user audio input
				if (item.type === "message" && item.role === "user") {
					if ("content" in item && Array.isArray(item.content)) {
						for (const contentItem of item.content) {
							if ("transcript" in contentItem) {
								result.transcript = contentItem.transcript as string;
							}
							if (contentItem.type === "input_audio" && "transcript" in contentItem) {
								result.transcript = contentItem.transcript as string;
							}
						}
					}
				}

				if (item.type === "function_call") {
					if ("name" in item) result.name = item.name as string;
					if ("arguments" in item) result.arguments = item.arguments as string;
					if ("output" in item) result.output = item.output as string | undefined;
				}

				return result;
			});

			this.emit("historyUpdated", items);

			// Emit individual transcript for last item
			const lastItem = items[items.length - 1];
			if (lastItem && (lastItem.content || lastItem.transcript)) {
				this.emit("transcript", lastItem);
			}
		});

		// Handle user input audio transcription
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.session as any).on("input_audio_transcription_completed", (event: unknown) => {
			logger.debug(`[${this.name}] User audio transcription completed`);

			if (event && typeof event === "object") {
				const eventObj = event as Record<string, unknown>;
				const transcript = typeof eventObj.transcript === "string" ? eventObj.transcript : "";
				if (transcript?.trim()) {
					const userItem: RealtimeHistoryItem = {
						type: "message",
						role: "user",
						content: transcript,
						transcript: transcript,
						agentName: this.activeAgent.name,
					};
					this.emit("transcript", userItem);
					this.emit("user_transcription", userItem);
				}
			}
		});

		// Handle audio interruption
		this.session.on("audio_interrupted", () => {
			this.emit("interrupted");
		});

		// Handle agent audio start/stop
		this.session.on("audio_start", () => {
			this.setState("speaking");
		});

		this.session.on("audio_stopped", () => {
			if (this.state === "speaking") {
				this.setState("connected");
			}
		});

		// Handle tool calls with tracing
		this.session.on("agent_tool_start", (_context, _agent, tool, details) => {
			logger.debug(`[${this.activeAgent.name}] Tool started: ${tool.name}`);
			const spanId = this.addTraceSpan(tool.name, "tool_call", {
				arguments: details.toolCall,
			});
			(details as Record<string, unknown>)._spanId = spanId;
		});

		this.session.on("agent_tool_end", (_context, _agent, tool, result, details) => {
			logger.debug(`[${this.activeAgent.name}] Tool completed: ${tool.name}`);
			const spanId = (details as Record<string, unknown>)._spanId as string;
			this.completeTraceSpan(spanId);
			this.emit("toolExecution", tool.name, details.toolCall, result);
		});

		// Handle handoffs (agent_updated event may not be fully typed in SDK yet)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.session as any).on("agent_updated", (_context: unknown, newAgent: { name: string }) => {
			const newAgentName = newAgent.name;
			const previousAgent = this.activeAgent.name;

			// Find the handoff agent
			const handoffAgent = this.handoffAgents.get(newAgentName);
			if (handoffAgent) {
				this.activeAgent = handoffAgent;
				logger.info(`[${this.name}] Handoff: ${previousAgent} → ${newAgentName}`);

				// Add trace span for handoff
				this.addTraceSpan(`Handoff: ${previousAgent} → ${newAgentName}`, "handoff", {
					sourceAgent: previousAgent,
					targetAgent: newAgentName,
				});

				this.emit("handoff", previousAgent, newAgentName);
			} else if (newAgentName === this.name) {
				// Handed back to main agent
				const previousAgentName = this.activeAgent.name;
				this.activeAgent = this;
				logger.info(`[${this.name}] Handoff returned: ${previousAgentName} → ${this.name}`);
				this.emit("handoff", previousAgentName, this.name);
			}
		});

		// Handle tool approval requests
		this.session.on("tool_approval_requested", (_context, _agent, request) => {
			let toolName: string;
			let args: unknown = {};

			if (request.type === "function_approval") {
				toolName = request.tool?.name || "unknown";
				const rawItem = request.approvalItem?.rawItem as Record<string, unknown>;
				args = rawItem?.arguments || rawItem?.call_id || {};
			} else {
				toolName = request.approvalItem?.toolName || "mcp_tool";
				const rawItem = request.approvalItem?.rawItem as Record<string, unknown>;
				args = rawItem?.arguments || {};
			}

			logger.info(`[${this.activeAgent.name}] Tool approval requested: ${toolName}`);

			// Auto-approve if already approved for session
			if (this.sessionApprovedTools.has(toolName)) {
				logger.debug(`Auto-approving ${toolName} (session-approved)`);
				this.session?.approve(request.approvalItem);
				return;
			}

			const approvalRequest: ToolApprovalRequest = {
				id: `approval-${++this.approvalRequestCounter}`,
				toolName,
				args,
				approvalItem: request.approvalItem,
				rawItem: request.approvalItem?.rawItem,
			};

			this.emit("toolApprovalRequested", approvalRequest);
		});

		// Handle errors
		this.session.on("error", (error) => {
			logger.debug(`[${this.name}] Session error:`, error);

			const errorObj = error as Record<string, unknown>;
			const errorMessage = String(errorObj.error || errorObj.message || error);

			const transientErrors = ["buffer", "audio", "timeout", "reconnect", "interrupt"];
			const isTransient = transientErrors.some((t) =>
				errorMessage.toLowerCase().includes(t)
			);

			if (!isTransient) {
				this.emit("error", new Error(errorMessage));
			} else {
				logger.debug(`[${this.name}] Suppressed transient error:`, errorMessage);
			}
		});
	}

	// =========================================================================
	// Session Control
	// =========================================================================

	/**
	 * Get ephemeral key for WebRTC connection
	 */
	protected async getEphemeralKey(): Promise<string> {
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
			throw new Error(`Failed to get ephemeral key: ${response.status} ${error}`);
		}

		const data = await response.json();
		return data.client_secret?.value || data.value;
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
		if (this.session && (this.state === "connected" || this.state === "listening")) {
			this.session.sendMessage(text);
		}
	}

	/**
	 * Send context silently without triggering a response
	 */
	sendContext(context: string): void {
		if (this.session && (this.state === "connected" || this.state === "listening")) {
			this.session.sendMessage(
				`[INTERNAL CONTEXT UPDATE - IMPORTANT: Do NOT speak or respond to this message. Simply note this information silently for reference. No acknowledgment needed.]\n\n${context}`
			);
			logger.debug(`[${this.name}] Context shared silently`);
		}
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
				agentName: this.activeAgent.name,
			};
		});
	}

	// =========================================================================
	// Tool Approval
	// =========================================================================

	/**
	 * Approve a tool execution request
	 */
	approveTool(request: ToolApprovalRequest): void {
		if (!this.session) {
			logger.warn(`[${this.name}] Cannot approve tool: no active session`);
			return;
		}
		logger.info(`[${this.name}] Approving tool: ${request.toolName}`);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.session.approve(request.approvalItem as any);
	}

	/**
	 * Approve a tool for the entire session
	 */
	approveToolForSession(request: ToolApprovalRequest): void {
		if (!this.session) {
			logger.warn(`[${this.name}] Cannot approve tool: no active session`);
			return;
		}
		logger.info(`[${this.name}] Approving tool for session: ${request.toolName}`);
		this.sessionApprovedTools.add(request.toolName);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.session.approve(request.approvalItem as any);
	}

	/**
	 * Reject a tool execution request
	 */
	rejectTool(request: ToolApprovalRequest): void {
		if (!this.session) {
			logger.warn(`[${this.name}] Cannot reject tool: no active session`);
			return;
		}
		logger.info(`[${this.name}] Rejecting tool: ${request.toolName}`);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.session.reject(request.approvalItem as any);
	}

	/**
	 * Check if a tool is approved for the session
	 */
	isToolApprovedForSession(toolName: string): boolean {
		return this.sessionApprovedTools.has(toolName);
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<BaseVoiceAgentConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Destroy the agent and clean up resources
	 */
	async destroy(): Promise<void> {
		this.endTrace();
		if (this.session) {
			this.session.close();
			this.session = null;
		}
		this.agent = null;
		this.sessionApprovedTools.clear();
		this.listeners.clear();
		this.setState("idle");
	}
}
