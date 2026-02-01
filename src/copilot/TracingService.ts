/**
 * TracingService - Captures and stores traces from the OpenAI Agents SDK
 * 
 * Uses the SDK's trace processor API to intercept traces and spans
 * for local viewing and debugging.
 */

import { addTraceProcessor, getGlobalTraceProvider } from "@openai/agents";

/** Represents a single span within a trace */
export interface TracingSpan {
	spanId: string;
	traceId: string;
	parentId?: string;
	name: string;
	type: string;
	startedAt: number;
	endedAt?: number;
	data?: Record<string, unknown>;
	error?: string;
}

/** Represents a complete trace (workflow execution) */
export interface TracingTrace {
	traceId: string;
	workflowName: string;
	groupId?: string;
	startedAt: number;
	endedAt?: number;
	spans: TracingSpan[];
	metadata?: Record<string, unknown>;
}

/** Event emitted when traces change */
export type TracingEvent = 
	| { type: "trace-started"; trace: TracingTrace }
	| { type: "trace-ended"; trace: TracingTrace }
	| { type: "span-started"; span: TracingSpan }
	| { type: "span-ended"; span: TracingSpan };

type TracingEventListener = (event: TracingEvent) => void;

/**
 * Service for capturing and managing traces from agent executions
 */
export class TracingService {
	private traces: Map<string, TracingTrace> = new Map();
	private spans: Map<string, TracingSpan> = new Map();
	private listeners: TracingEventListener[] = [];
	private enabled: boolean = false;
	private maxTraces: number = 50; // Keep last 50 traces
	private processorAdded: boolean = false;

	constructor() {
		// Traces are stored in memory
	}

	/**
	 * Enable tracing and add the trace processor
	 */
	enable(): void {
		if (this.enabled) return;
		
		this.enabled = true;
		
		// Only add processor once (it's global)
		if (!this.processorAdded) {
			this.addCustomProcessor();
			this.processorAdded = true;
		}
		
		console.log("[TracingService] Tracing enabled");
	}

	/**
	 * Disable tracing (processor remains but we stop collecting)
	 */
	disable(): void {
		this.enabled = false;
		console.log("[TracingService] Tracing disabled");
	}

	/**
	 * Check if tracing is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Add the custom trace processor to capture traces
	 */
	private addCustomProcessor(): void {
		try {
			addTraceProcessor({
				onTraceStart: async (trace) => {
					if (!this.enabled) return;
					
					const tracingTrace: TracingTrace = {
						traceId: trace.traceId,
						workflowName: trace.name || "Unknown workflow",
						groupId: trace.groupId ?? undefined,
						startedAt: Date.now(),
						spans: [],
						metadata: trace.metadata as Record<string, unknown>,
					};
					
					this.traces.set(trace.traceId, tracingTrace);
					this.emit({ type: "trace-started", trace: tracingTrace });
					this.pruneOldTraces();
				},
				
				onTraceEnd: async (trace) => {
					if (!this.enabled) return;
					
					const tracingTrace = this.traces.get(trace.traceId);
					if (tracingTrace) {
						tracingTrace.endedAt = Date.now();
						this.emit({ type: "trace-ended", trace: tracingTrace });
					}
				},
				
				onSpanStart: async (span) => {
					if (!this.enabled) return;
					
					const spanData = span.spanData as Record<string, unknown> | undefined;
					const tracingSpan: TracingSpan = {
						spanId: span.spanId,
						traceId: span.traceId,
						parentId: span.parentId ?? undefined,
						name: (spanData?.name as string) || "Unknown span",
						type: (spanData?.type as string) || "unknown",
						startedAt: Date.now(),
						data: spanData,
					};
					
					this.spans.set(span.spanId, tracingSpan);
					
					// Add to parent trace
					const trace = this.traces.get(span.traceId);
					if (trace) {
						trace.spans.push(tracingSpan);
					}
					
					this.emit({ type: "span-started", span: tracingSpan });
				},
				
				onSpanEnd: async (span) => {
					if (!this.enabled) return;
					
					const tracingSpan = this.spans.get(span.spanId);
					if (tracingSpan) {
						tracingSpan.endedAt = Date.now();
						if (span.error) {
							tracingSpan.error = span.error instanceof Error 
								? span.error.message 
								: String(span.error);
						}
						this.emit({ type: "span-ended", span: tracingSpan });
					}
				},
				
				shutdown: async () => {
					// Cleanup resources when tracing is shut down
					console.log("[TracingService] Shutdown called");
				},
				
				forceFlush: async () => {
					// Force flush any pending traces
					console.log("[TracingService] Force flush called");
				},
			});
			
			console.log("[TracingService] Custom trace processor added");
		} catch (error) {
			console.error("[TracingService] Failed to add trace processor:", error);
		}
	}

	/**
	 * Get all traces (most recent first)
	 */
	getTraces(): TracingTrace[] {
		return Array.from(this.traces.values())
			.sort((a, b) => b.startedAt - a.startedAt);
	}

	/**
	 * Get a specific trace by ID
	 */
	getTrace(traceId: string): TracingTrace | undefined {
		return this.traces.get(traceId);
	}

	/**
	 * Clear all traces
	 */
	clearTraces(): void {
		this.traces.clear();
		this.spans.clear();
		console.log("[TracingService] Traces cleared");
	}

	/**
	 * Manually start a trace (for non-SDK sources like RealtimeAgent)
	 */
	startTrace(name: string, metadata?: Record<string, unknown>): string {
		if (!this.enabled) return "";
		
		const traceId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const trace: TracingTrace = {
			traceId,
			workflowName: name,
			startedAt: Date.now(),
			spans: [],
			metadata,
		};
		
		this.traces.set(traceId, trace);
		this.emit({ type: "trace-started", trace });
		this.pruneOldTraces();
		
		return traceId;
	}

	/**
	 * Manually end a trace
	 */
	endTrace(traceId: string): void {
		if (!this.enabled) return;
		
		const trace = this.traces.get(traceId);
		if (trace) {
			trace.endedAt = Date.now();
			this.emit({ type: "trace-ended", trace });
		}
	}

	/**
	 * Manually add a span to a trace
	 */
	addSpan(traceId: string, name: string, type: string, data?: Record<string, unknown>): string {
		if (!this.enabled) return "";
		
		const spanId = `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const span: TracingSpan = {
			spanId,
			traceId,
			name,
			type,
			startedAt: Date.now(),
			data,
		};
		
		this.spans.set(spanId, span);
		
		const trace = this.traces.get(traceId);
		if (trace) {
			trace.spans.push(span);
		}
		
		this.emit({ type: "span-started", span });
		return spanId;
	}

	/**
	 * Manually complete a span
	 */
	completeSpan(spanId: string, error?: string): void {
		if (!this.enabled) return;
		
		const span = this.spans.get(spanId);
		if (span) {
			span.endedAt = Date.now();
			if (error) {
				span.error = error;
			}
			this.emit({ type: "span-ended", span });
		}
	}

	/**
	 * Subscribe to tracing events
	 */
	on(listener: TracingEventListener): () => void {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index > -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	/**
	 * Emit an event to all listeners
	 */
	private emit(event: TracingEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error("[TracingService] Listener error:", error);
			}
		}
	}

	/**
	 * Remove old traces to prevent memory bloat
	 */
	private pruneOldTraces(): void {
		if (this.traces.size <= this.maxTraces) return;
		
		const sorted = Array.from(this.traces.entries())
			.sort((a, b) => a[1].startedAt - b[1].startedAt);
		
		const toDelete = sorted.slice(0, sorted.length - this.maxTraces);
		for (const [traceId, trace] of toDelete) {
			// Remove associated spans
			for (const span of trace.spans) {
				this.spans.delete(span.spanId);
			}
			this.traces.delete(traceId);
		}
	}

	/**
	 * Force flush any pending traces
	 */
	async forceFlush(): Promise<void> {
		try {
			await getGlobalTraceProvider().forceFlush();
		} catch (error) {
			console.error("[TracingService] Force flush error:", error);
		}
	}

	/**
	 * Get summary statistics
	 */
	getStats(): { traceCount: number; spanCount: number; enabled: boolean } {
		return {
			traceCount: this.traces.size,
			spanCount: this.spans.size,
			enabled: this.enabled,
		};
	}

	/**
	 * Storage for SDK diagnostic logs
	 */
	private sdkLogs: SDKLogEntry[] = [];
	private maxSdkLogs: number = 500;

	/**
	 * Add an SDK diagnostic log entry
	 */
	addSdkLog(level: 'debug' | 'info' | 'warning' | 'error', message: string, source: string = 'sdk'): void {
		if (!this.enabled) return;
		
		const entry: SDKLogEntry = {
			timestamp: Date.now(),
			level,
			message,
			source,
		};
		
		this.sdkLogs.push(entry);
		
		// Prune old logs
		if (this.sdkLogs.length > this.maxSdkLogs) {
			this.sdkLogs = this.sdkLogs.slice(-this.maxSdkLogs);
		}
	}

	/**
	 * Get SDK diagnostic logs
	 */
	getSdkLogs(): SDKLogEntry[] {
		return [...this.sdkLogs];
	}

	/**
	 * Clear SDK logs
	 */
	clearSdkLogs(): void {
		this.sdkLogs = [];
	}
}

/** SDK diagnostic log entry */
export interface SDKLogEntry {
	timestamp: number;
	level: 'debug' | 'info' | 'warning' | 'error';
	message: string;
	source: string;
}

// Singleton instance
let tracingServiceInstance: TracingService | null = null;

/**
 * Get the global TracingService instance
 */
export function getTracingService(): TracingService {
	if (!tracingServiceInstance) {
		tracingServiceInstance = new TracingService();
	}
	return tracingServiceInstance;
}
