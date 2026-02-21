/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SessionEventTracer
 * @description Structured tracing for GitHub Copilot SDK session events.
 *
 * Encapsulates the `logSessionEventToTracing()` logic extracted from
 * GitHubCopilotCliService. Creates structured trace spans for session lifecycle
 * and tool execution so the Tracing modal shows a correlated timeline.
 *
 * All 32+ SDK SessionEvent types are handled explicitly (no fallback to a
 * generic default).
 *
 * Truncation limits:
 * - User prompts: 1 000 chars
 * - Tool arguments / results: 2 000 chars
 * - Assistant messages: 500 chars
 *
 * @example
 * ```typescript
 * const tracer = new SessionEventTracer();
 * session.on((event) => tracer.handleEvent(event));
 * ```
 *
 * @see {@link TracingService} for the underlying log/span API
 * @since 0.0.35
 */

import type { SessionEvent } from "@github/copilot-sdk";
import { getTracingService } from "../TracingService";

// ── Internal Types ─────────────────────────────────────────────────────────

/** Accumulated token usage for the current session */
interface SessionTokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalCost: number;
}

// ── Class ──────────────────────────────────────────────────────────────────

/**
 * Logs SDK session events to TracingService with enriched data and
 * structured trace spans.
 *
 * Owns the mutable tracing state (active trace ID, tool span map, token
 * accumulator) so that the main service class stays focused on SDK
 * orchestration.
 *
 * @since 0.0.35
 */
export class SessionEventTracer {
	/** Trace ID of the currently active session (empty string when none) */
	private activeSessionTraceId = "";

	/** Map of in-flight tool-call IDs → trace span IDs */
	private activeToolSpans = new Map<string, string>();

	/** Token usage accumulated during the current session */
	private sessionTokenUsage: SessionTokenUsage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };

	/**
	 * Handle a single SDK session event, logging it and managing trace spans.
	 *
	 * Skip ephemeral streaming deltas (`assistant.message_delta`,
	 * `assistant.reasoning_delta`) — they are too verbose and have no
	 * diagnostic value.
	 *
	 * @param event - The raw SDK SessionEvent
	 */
	handleEvent(event: SessionEvent): void {
		const eventType = event.type;

		// Skip ephemeral streaming deltas — too verbose, no diagnostic value
		if (eventType === "assistant.message_delta" || eventType === "assistant.reasoning_delta") {
			return;
		}

		const tracingService = getTracingService();
		const eventData = "data" in event ? event.data : {};

		// Helper to safely truncate strings
		const truncate = (s: string | undefined, max: number): string => {
			if (!s) return "";
			return s.length > max ? s.substring(0, max) + "…" : s;
		};

		// Helper to safely stringify objects for logging
		const safeStringify = (obj: unknown, max: number): string => {
			try {
				const json = JSON.stringify(obj);
				return truncate(json, max);
			} catch {
				return "[unserializable]";
			}
		};

		let level: "debug" | "info" | "warning" | "error" = "debug";
		let source = "sdk-event";
		let message = "";

		switch (eventType) {
			// ── Session lifecycle ───────────────────────────────────────
			case "session.start": {
				level = "info";
				source = "session-lifecycle";
				const d = eventData as {
					sessionId?: string;
					version?: string;
					copilotVersion?: string;
					selectedModel?: string;
					context?: Record<string, unknown>;
				};
				message = `[Session Start] sessionId=${d.sessionId || "unknown"} model=${d.selectedModel || "unknown"} sdk=${d.version || "?"} copilot=${d.copilotVersion || "?"}`;

				// Start a structured trace for this session
				this.sessionTokenUsage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
				this.activeToolSpans.clear();
				this.activeSessionTraceId = tracingService.startTrace(
					`Session ${d.sessionId?.substring(0, 8) || "unknown"}`,
					{ sessionId: d.sessionId, model: d.selectedModel, sdkVersion: d.version, copilotVersion: d.copilotVersion },
				);
				break;
			}
			case "session.resume": {
				level = "info";
				source = "session-lifecycle";
				const d = eventData as { eventCount?: number; resumeTime?: number; context?: Record<string, unknown> };
				message = `[Session Resume] eventCount=${d.eventCount || 0}`;

				this.sessionTokenUsage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
				this.activeToolSpans.clear();
				this.activeSessionTraceId = tracingService.startTrace("Session Resumed", { eventCount: d.eventCount });
				break;
			}
			case "session.idle": {
				level = "info";
				source = "session-lifecycle";
				const tokenSummary =
					this.sessionTokenUsage.inputTokens + this.sessionTokenUsage.outputTokens > 0
						? ` tokens(in=${this.sessionTokenUsage.inputTokens} out=${this.sessionTokenUsage.outputTokens})`
						: "";
				message = `[Session Idle]${tokenSummary}`;

				// End the structured session trace
				if (this.activeSessionTraceId) {
					tracingService.endTrace(this.activeSessionTraceId);
					this.activeSessionTraceId = "";
				}
				break;
			}
			case "session.error": {
				level = "error";
				source = "session-lifecycle";
				const d = eventData as { errorType?: string; message?: string; stack?: string };
				message = `[Session Error] ${d.errorType || "unknown"}: ${d.message || "Unknown error"}`;
				if (d.stack) {
					message += `\n${truncate(d.stack, 1000)}`;
				}

				// Record error as a span on the session trace
				if (this.activeSessionTraceId) {
					const spanId = tracingService.addSpan(this.activeSessionTraceId, "Session Error", "error", {
						errorType: d.errorType,
						message: d.message,
						stack: d.stack,
					});
					tracingService.completeSpan(spanId, d.message || "Session error");
				}
				break;
			}
			case "session.info": {
				level = "info";
				source = "session-lifecycle";
				const d = eventData as { infoType?: string; message?: string };
				message = `[Session Info] ${d.infoType || "unknown"}: ${d.message || ""}`;
				break;
			}

			// ── Session state ──────────────────────────────────────────
			case "session.model_change": {
				level = "info";
				source = "session-state";
				const d = eventData as { previousModel?: string; newModel?: string };
				message = `[Model Change] ${d.previousModel || "none"} → ${d.newModel || "unknown"}`;
				break;
			}
			case "session.handoff": {
				level = "info";
				source = "session-state";
				const d = eventData as { sourceType?: string; repository?: string; summary?: string };
				message = `[Session Handoff] sourceType=${d.sourceType || "unknown"}${d.repository ? ` repo=${d.repository}` : ""}`;
				break;
			}
			case "session.truncation": {
				level = "warning";
				source = "session-state";
				const d = eventData as {
					tokenLimit?: number;
					preTokenCount?: number;
					postTokenCount?: number;
					preMessageCount?: number;
					postMessageCount?: number;
				};
				message = `[Session Truncation] limit=${d.tokenLimit || "?"} tokens(${d.preTokenCount || "?"}→${d.postTokenCount || "?"}) messages(${d.preMessageCount || "?"}→${d.postMessageCount || "?"})`;
				break;
			}
			case "session.snapshot_rewind": {
				level = "info";
				source = "session-state";
				const d = eventData as { upToEventId?: string; eventsRemoved?: number };
				message = `[Snapshot Rewind] upToEventId=${d.upToEventId || "?"} eventsRemoved=${d.eventsRemoved ?? "?"}`;
				break;
			}
			case "session.usage_info": {
				level = "debug";
				source = "session-state";
				const d = eventData as { tokenLimit?: number; currentTokens?: number; messagesLength?: number };
				message = `[Usage Info] tokens=${d.currentTokens || 0}/${d.tokenLimit || "?"} messages=${d.messagesLength || 0}`;
				break;
			}
			case "session.compaction_start": {
				level = "info";
				source = "session-state";
				message = "[Compaction Start]";
				break;
			}
			case "session.compaction_complete": {
				level = "info";
				source = "session-state";
				const d = eventData as {
					success?: boolean;
					preTokenCount?: number;
					postTokenCount?: number;
					summaryContent?: string;
				};
				message = `[Compaction Complete] success=${d.success ?? "?"} tokens(${d.preTokenCount || "?"}→${d.postTokenCount || "?"})`;
				break;
			}

			// ── User events ────────────────────────────────────────────
			case "user.message": {
				level = "info";
				source = "user-event";
				const d = eventData as { content?: string; source?: string; attachments?: unknown[]; transformedContent?: string };
				const preview = truncate(d.content, 1000);
				const attachCount = Array.isArray(d.attachments) ? d.attachments.length : 0;
				message = `[User Message] ${preview}`;
				if (d.source) message += ` (source=${d.source})`;
				if (attachCount > 0) message += ` [${attachCount} attachment(s)]`;

				// Record as a span so it appears in the trace timeline
				if (this.activeSessionTraceId) {
					const spanId = tracingService.addSpan(this.activeSessionTraceId, "User Prompt", "user-message", {
						contentLength: d.content?.length || 0,
						source: d.source,
						attachments: attachCount,
					});
					tracingService.completeSpan(spanId);
				}
				break;
			}
			case "pending_messages.modified": {
				level = "debug";
				source = "user-event";
				message = "[Pending Messages Modified]";
				break;
			}

			// ── Assistant events ───────────────────────────────────────
			case "assistant.turn_start": {
				level = "debug";
				source = "assistant-event";
				const d = eventData as { turnId?: string };
				message = `[Turn Start] turnId=${d.turnId || "unknown"}`;
				break;
			}
			case "assistant.intent": {
				level = "info";
				source = "assistant-event";
				const d = eventData as { intent?: string };
				message = `[Intent] ${truncate(d.intent, 500)}`;
				break;
			}
			case "assistant.reasoning": {
				level = "debug";
				source = "assistant-event";
				const d = eventData as { reasoningId?: string; content?: string };
				message = `[Reasoning] reasoningId=${d.reasoningId || "unknown"} ${truncate(d.content, 300)}`;
				break;
			}
			case "assistant.message": {
				level = "info";
				source = "assistant-event";
				const d = eventData as { messageId?: string; content?: string; toolRequests?: unknown[] };
				const toolReqs = Array.isArray(d.toolRequests) ? d.toolRequests.length : 0;
				message = `[Assistant Message] ${truncate(d.content, 500)}`;
				if (toolReqs > 0) message += ` [${toolReqs} tool request(s)]`;
				break;
			}
			case "assistant.turn_end": {
				level = "debug";
				source = "assistant-event";
				const d = eventData as { turnId?: string };
				message = `[Turn End] turnId=${d.turnId || "unknown"}`;
				break;
			}
			case "assistant.usage": {
				level = "info";
				source = "assistant-event";
				const d = eventData as {
					model?: string;
					inputTokens?: number;
					outputTokens?: number;
					cacheReadTokens?: number;
					cost?: number;
					duration?: number;
				};
				// Accumulate per-session totals
				this.sessionTokenUsage.inputTokens += d.inputTokens || 0;
				this.sessionTokenUsage.outputTokens += d.outputTokens || 0;
				this.sessionTokenUsage.totalCost += d.cost || 0;

				message = `[Usage] model=${d.model || "unknown"} input=${d.inputTokens || 0} output=${d.outputTokens || 0}`;
				if (d.cacheReadTokens) message += ` cache=${d.cacheReadTokens}`;
				if (d.cost !== undefined) message += ` cost=$${d.cost.toFixed(4)}`;
				if (d.duration) message += ` duration=${d.duration}ms`;
				message += ` | session_total(in=${this.sessionTokenUsage.inputTokens} out=${this.sessionTokenUsage.outputTokens})`;
				break;
			}

			// ── Tool events ────────────────────────────────────────────
			case "tool.user_requested": {
				level = "info";
				source = "tool-event";
				const d = eventData as { toolName?: string; toolCallId?: string; arguments?: unknown };
				message = `[Tool Requested] ${d.toolName || "unknown"}`;
				if (d.arguments) message += ` args=${safeStringify(d.arguments, 500)}`;
				break;
			}
			case "tool.execution_start": {
				level = "info";
				source = "tool-event";
				const d = eventData as {
					toolName?: string;
					toolCallId?: string;
					arguments?: unknown;
					mcpServerName?: string;
					parentToolCallId?: string;
				};
				const toolName = d.toolName || "unknown";
				message = `[Tool Start] ${toolName} (${d.toolCallId || "unknown"})`;
				if (d.mcpServerName) message += ` mcp=${d.mcpServerName}`;
				if (d.arguments) message += ` args=${safeStringify(d.arguments, 2000)}`;

				// Start a structured span for this tool call
				if (this.activeSessionTraceId && d.toolCallId) {
					const spanId = tracingService.addSpan(this.activeSessionTraceId, `Tool: ${toolName}`, "tool-call", {
						toolName,
						toolCallId: d.toolCallId,
						mcpServerName: d.mcpServerName,
						arguments: d.arguments,
					});
					this.activeToolSpans.set(d.toolCallId, spanId);
				}
				break;
			}
			case "tool.execution_partial_result": {
				level = "debug";
				source = "tool-event";
				const d = eventData as { toolCallId?: string; partialOutput?: string };
				message = `[Tool Partial] ${d.toolCallId || "unknown"} ${truncate(d.partialOutput, 200)}`;
				break;
			}
			case "tool.execution_progress": {
				level = "debug";
				source = "tool-event";
				const d = eventData as { toolCallId?: string; progressMessage?: string };
				message = `[Tool Progress] ${d.toolCallId || "unknown"}: ${d.progressMessage || ""}`;
				break;
			}
			case "tool.execution_complete": {
				const d = eventData as {
					toolCallId?: string;
					toolName?: string;
					success?: boolean;
					result?: unknown;
					error?: string;
					toolTelemetry?: Record<string, unknown>;
				};
				level = d.success === false ? "error" : "info";
				source = "tool-event";
				const toolCallId = d.toolCallId || "unknown";
				message = `[Tool Complete] ${toolCallId} success=${d.success ?? "unknown"}`;
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
						tracingService.completeSpan(spanId, d.success === false ? (d.error || "Tool failed") : undefined);
						this.activeToolSpans.delete(d.toolCallId);
					}
				}
				break;
			}

			// ── Subagent events ────────────────────────────────────────
			case "subagent.started": {
				level = "info";
				source = "subagent-event";
				const d = eventData as { toolCallId?: string; agentName?: string; agentDisplayName?: string; agentDescription?: string };
				message = `[Subagent Started] ${d.agentDisplayName || d.agentName || "unknown"}`;
				if (d.agentDescription) message += `: ${truncate(d.agentDescription, 200)}`;

				// Start a span for the subagent
				if (this.activeSessionTraceId && d.toolCallId) {
					const spanId = tracingService.addSpan(
						this.activeSessionTraceId,
						`Subagent: ${d.agentDisplayName || d.agentName || "unknown"}`,
						"subagent",
						{
							agentName: d.agentName,
							agentDisplayName: d.agentDisplayName,
						},
					);
					this.activeToolSpans.set(d.toolCallId, spanId);
				}
				break;
			}
			case "subagent.completed": {
				level = "info";
				source = "subagent-event";
				const d = eventData as { toolCallId?: string; agentName?: string };
				message = `[Subagent Completed] ${d.agentName || "unknown"}`;

				if (d.toolCallId) {
					const spanId = this.activeToolSpans.get(d.toolCallId);
					if (spanId) {
						tracingService.completeSpan(spanId);
						this.activeToolSpans.delete(d.toolCallId);
					}
				}
				break;
			}
			case "subagent.failed": {
				level = "error";
				source = "subagent-event";
				const d = eventData as { toolCallId?: string; agentName?: string; error?: string };
				message = `[Subagent Failed] ${d.agentName || "unknown"}: ${d.error || "Unknown error"}`;

				if (d.toolCallId) {
					const spanId = this.activeToolSpans.get(d.toolCallId);
					if (spanId) {
						tracingService.completeSpan(spanId, d.error || "Subagent failed");
						this.activeToolSpans.delete(d.toolCallId);
					}
				}
				break;
			}
			case "subagent.selected": {
				level = "info";
				source = "subagent-event";
				const d = eventData as { agentName?: string; agentDisplayName?: string; tools?: unknown[] };
				const toolCount = Array.isArray(d.tools) ? d.tools.length : 0;
				message = `[Subagent Selected] ${d.agentDisplayName || d.agentName || "unknown"} (${toolCount} tools)`;
				break;
			}

			// ── Abort ──────────────────────────────────────────────────
			case "abort": {
				level = "warning";
				source = "session-lifecycle";
				const d = eventData as { reason?: string };
				message = `[Abort] reason=${d.reason || "unknown"}`;

				// End the session trace on abort
				if (this.activeSessionTraceId) {
					tracingService.endTrace(this.activeSessionTraceId);
					this.activeSessionTraceId = "";
				}
				break;
			}

			// ── Hook observation ───────────────────────────────────────
			case "hook.start": {
				level = "debug";
				source = "hook-event";
				const d = eventData as { hookInvocationId?: string; hookType?: string; input?: unknown };
				message = `[Hook Start] type=${d.hookType || "unknown"} id=${d.hookInvocationId || "unknown"}`;
				break;
			}
			case "hook.end": {
				level = "debug";
				source = "hook-event";
				const d = eventData as { hookInvocationId?: string; hookType?: string; success?: boolean; error?: string };
				message = `[Hook End] type=${d.hookType || "unknown"} success=${d.success ?? "?"}`;
				if (d.error) message += ` error=${truncate(d.error, 200)}`;
				break;
			}

			// ── System message ─────────────────────────────────────────
			case "system.message": {
				level = "info";
				source = "system-event";
				const d = eventData as { content?: string; role?: string; name?: string };
				message = `[System Message] role=${d.role || "system"}${d.name ? ` name=${d.name}` : ""} ${truncate(d.content, 500)}`;
				break;
			}

			// ── Catch-all for any future/unknown event types ───────────
			default:
				level = "debug";
				source = "sdk-event";
				message = `[${eventType}] ${safeStringify(eventData, 500)}`;
		}

		tracingService.addSdkLog(level, message, source);
	}
}
