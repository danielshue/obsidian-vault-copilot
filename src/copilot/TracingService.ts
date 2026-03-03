/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module TracingService
 * @description No-op tracing service for Basic plugin.
 * 
 * Basic does not include the OpenAI Agents SDK tracing infrastructure.
 * This stub provides the same interface but does nothing.
 * 
 * Pro uses the full TracingService with IndexedDB persistence.
 * 
 * @since 0.1.0
 */

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

/** SDK log entry structure (for type compatibility) */
export interface SDKLogEntry {
	timestamp: number;
	source: string;
	message: string;
	level: "debug" | "info" | "warning" | "error";
	args?: unknown[];
}

/** Event emitted when traces change */
export type TracingEvent = 
	| { type: "trace-started"; trace: TracingTrace }
	| { type: "trace-ended"; trace: TracingTrace }
	| { type: "span-started"; span: TracingSpan }
	| { type: "span-ended"; span: TracingSpan }
	| { type: "sdk-log-added"; log: SDKLogEntry };

type TracingEventListener = (event: TracingEvent) => void;

/** No-op tracing service for Basic */
class BasicTracingService {
	private enabled = false;

	async initialize(): Promise<void> {
		// No-op
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	/** Start a new trace. Returns trace ID. */
	startTrace(_workflowName: string, _metadata?: Record<string, unknown>): string {
		return `trace-${Date.now()}`;
	}

	/** Add a span to a trace. Returns span ID. */
	addSpan(_traceId: string, _name: string, _type: string, _data?: Record<string, unknown>): string {
		return `span-${Date.now()}`;
	}

	/** Complete a span with optional result data. */
	completeSpan(_spanId: string, _result?: string | Record<string, unknown>): void {
		// No-op
	}

	/** End a trace. */
	endTrace(_traceId: string): void {
		// No-op
	}

	/** Add an SDK log entry. Matches Pro signature: (level, message, source). */
	addSdkLog(
		_level: "debug" | "info" | "warning" | "error",
		_message: string,
		_source?: string
	): void {
		// No-op - Basic doesn't persist SDK logs
	}

	/** Subscribe to tracing events. Returns unsubscribe function. */
	on(_callback: TracingEventListener): () => void {
		return () => {};
	}

	async getTraces(): Promise<TracingTrace[]> {
		return [];
	}

	async getSdkLogs(): Promise<SDKLogEntry[]> {
		return [];
	}

	async clearTraces(): Promise<void> {
		// No-op
	}

	async clearSdkLogs(): Promise<void> {
		// No-op
	}
}

/** Singleton instance */
let instance: BasicTracingService | null = null;

/**
 * Get the tracing service singleton.
 * In Basic, this returns a no-op implementation.
 */
export function getTracingService(): BasicTracingService {
	if (!instance) {
		instance = new BasicTracingService();
	}
	return instance;
}
