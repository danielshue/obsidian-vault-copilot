/**
 * TracingModal - Modal to display tracing information
 * 
 * Shows captured traces and spans from agent executions in a 
 * tree-like format for debugging and inspection.
 */

import { App, Modal, setIcon } from "obsidian";
import { TracingService, TracingTrace, TracingSpan, TracingEvent, SDKLogEntry, getTracingService } from "../../copilot/TracingService";

type TabType = 'traces' | 'sdk-logs';

/**
 * Modal for viewing traces
 */
export class TracingModal extends Modal {
	private tracingService: TracingService;
	private tracingContentEl: HTMLElement | null = null;
	private unsubscribe: (() => void) | null = null;
	private selectedTraceId: string | null = null;
	private autoRefresh: boolean = true;
	private currentTab: TabType = 'traces';

	constructor(app: App) {
		super(app);
		this.tracingService = getTracingService();
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		
		modalEl.addClass("vc-tracing-modal");
		contentEl.empty();

		// Header
		const header = contentEl.createDiv({ cls: "vc-tracing-header" });
		header.createEl("h2", { text: "Tracing & Diagnostics" });
		
		const controls = header.createDiv({ cls: "vc-tracing-controls" });
		
		// Auto-refresh toggle
		const autoRefreshBtn = controls.createEl("button", { 
			cls: `vc-tracing-btn ${this.autoRefresh ? "vc-active" : ""}`,
			attr: { title: "Auto-refresh" }
		});
		setIcon(autoRefreshBtn, "refresh-cw");
		autoRefreshBtn.addEventListener("click", () => {
			this.autoRefresh = !this.autoRefresh;
			autoRefreshBtn.toggleClass("vc-active", this.autoRefresh);
		});
		
		// Clear button
		const clearBtn = controls.createEl("button", { 
			cls: "vc-tracing-btn",
			attr: { title: "Clear all" }
		});
		setIcon(clearBtn, "trash-2");
		clearBtn.addEventListener("click", () => {
			this.tracingService.clearTraces();
			this.tracingService.clearSdkLogs();
			this.selectedTraceId = null;
			this.render();
		});

		// Tab bar
		const tabBar = contentEl.createDiv({ cls: "vc-tracing-tabs" });
		
		const tracesTab = tabBar.createEl("button", {
			cls: `vc-tracing-tab ${this.currentTab === 'traces' ? 'vc-active' : ''}`,
			text: "Voice Traces"
		});
		tracesTab.addEventListener("click", () => {
			this.currentTab = 'traces';
			this.render();
			this.updateTabStyles(tabBar);
		});
		
		const sdkLogsTab = tabBar.createEl("button", {
			cls: `vc-tracing-tab ${this.currentTab === 'sdk-logs' ? 'vc-active' : ''}`,
			text: "SDK Logs"
		});
		sdkLogsTab.addEventListener("click", () => {
			this.currentTab = 'sdk-logs';
			this.render();
			this.updateTabStyles(tabBar);
		});

		// Status indicator
		const stats = this.tracingService.getStats();
		const statusEl = header.createDiv({ cls: "vc-tracing-status" });
		statusEl.createEl("span", { 
			text: stats.enabled ? "Tracing enabled" : "Tracing disabled",
			cls: stats.enabled ? "vc-status-ok" : "vc-status-disabled"
		});
		statusEl.createEl("span", { 
			text: `${stats.traceCount} traces`,
			cls: "vc-trace-count"
		});

		// Main content area
		this.tracingContentEl = contentEl.createDiv({ cls: "vc-tracing-content" });
		
		// Subscribe to events for live updates
		this.unsubscribe = this.tracingService.on((event) => {
			if (this.autoRefresh) {
				this.render();
			}
		});

		this.render();
	}

	private render(): void {
		if (!this.tracingContentEl) return;
		this.tracingContentEl.empty();

		if (this.currentTab === 'sdk-logs') {
			this.renderSdkLogs();
			return;
		}

		// Render traces (default tab)
		this.renderTraces();
	}

	private updateTabStyles(tabBar: HTMLElement): void {
		const tabs = tabBar.querySelectorAll('.vc-tracing-tab');
		tabs.forEach(tab => {
			const el = tab as HTMLElement;
			el.removeClass('vc-active');
			if ((el.textContent === 'Voice Traces' && this.currentTab === 'traces') ||
				(el.textContent === 'SDK Logs' && this.currentTab === 'sdk-logs')) {
				el.addClass('vc-active');
			}
		});
	}

	private renderTraces(): void {
		if (!this.tracingContentEl) return;

		const traces = this.tracingService.getTraces();

		if (traces.length === 0) {
			const emptyState = this.tracingContentEl.createDiv({ cls: "vc-tracing-empty" });
			emptyState.createEl("p", { text: "No traces captured yet." });
			emptyState.createEl("p", { 
				text: "Traces are captured from:",
				cls: "vc-tracing-hint"
			});
			const list = emptyState.createEl("ul", { cls: "vc-tracing-hint" });
			list.createEl("li", { text: "Voice conversations (realtime agent)" });
			list.createEl("li", { text: "Tool executions during voice sessions" });
			return;
		}

		// Two-column layout: trace list + detail
		const layout = this.tracingContentEl.createDiv({ cls: "vc-tracing-layout" });
		
		// Trace list
		const listEl = layout.createDiv({ cls: "vc-tracing-list" });
		for (const trace of traces) {
			this.renderTraceListItem(listEl, trace);
		}

		// Detail pane
		const detailEl = layout.createDiv({ cls: "vc-tracing-detail" });
		if (this.selectedTraceId) {
			const selectedTrace = this.tracingService.getTrace(this.selectedTraceId);
			if (selectedTrace) {
				this.renderTraceDetail(detailEl, selectedTrace);
			}
		} else if (traces.length > 0) {
			// Auto-select first trace
			const firstTrace = traces[0];
			if (firstTrace) {
				this.selectedTraceId = firstTrace.traceId;
				this.renderTraceDetail(detailEl, firstTrace);
			}
		} else {
			detailEl.createEl("p", { text: "Select a trace to view details", cls: "vc-tracing-hint" });
		}
	}

	private renderSdkLogs(): void {
		if (!this.tracingContentEl) return;

		const logs = this.tracingService.getSdkLogs();

		if (logs.length === 0) {
			const emptyState = this.tracingContentEl.createDiv({ cls: "vc-tracing-empty" });
			emptyState.createEl("p", { text: "No SDK logs captured yet." });
			emptyState.createEl("p", { 
				text: "SDK logs are captured when tracing is enabled during Copilot SDK operations.",
				cls: "vc-tracing-hint"
			});
			return;
		}

		// Log list container
		const logsContainer = this.tracingContentEl.createDiv({ cls: "vc-sdk-logs-container" });
		
		// Header with count
		const header = logsContainer.createDiv({ cls: "vc-sdk-logs-header" });
		header.createEl("span", { text: `${logs.length} log entries` });
		
		// Clear button
		const clearBtn = header.createEl("button", { cls: "vc-tracing-btn", text: "Clear" });
		clearBtn.addEventListener("click", () => {
			this.tracingService.clearSdkLogs();
			this.render();
		});

		// Log entries
		const logList = logsContainer.createDiv({ cls: "vc-sdk-logs-list" });
		
		for (const log of logs) {
			const entry = logList.createDiv({ cls: `vc-sdk-log-entry vc-log-${log.level}` });
			
			// Timestamp
			entry.createSpan({ 
				cls: "vc-sdk-log-time",
				text: this.formatTime(log.timestamp)
			});
			
			// Level badge
			entry.createSpan({ 
				cls: `vc-sdk-log-level vc-level-${log.level}`,
				text: log.level.toUpperCase()
			});
			
			// Message
			entry.createSpan({ 
				cls: "vc-sdk-log-message",
				text: log.message
			});
		}
	}

	private renderTraceListItem(container: HTMLElement, trace: TracingTrace): void {
		const isSelected = trace.traceId === this.selectedTraceId;
		const item = container.createDiv({ 
			cls: `vc-tracing-list-item ${isSelected ? "vc-selected" : ""}`
		});

		// Icon based on status
		const iconEl = item.createSpan({ cls: "vc-tracing-item-icon" });
		if (!trace.endedAt) {
			setIcon(iconEl, "loader");
			iconEl.addClass("vc-spinning");
		} else if (trace.spans.some(s => s.error)) {
			setIcon(iconEl, "alert-circle");
			iconEl.addClass("vc-error");
		} else {
			setIcon(iconEl, "check-circle");
			iconEl.addClass("vc-ok");
		}

		// Trace info
		const infoEl = item.createDiv({ cls: "vc-tracing-item-info" });
		infoEl.createEl("span", { text: trace.workflowName, cls: "vc-tracing-item-name" });
		
		const metaEl = infoEl.createDiv({ cls: "vc-tracing-item-meta" });
		metaEl.createEl("span", { text: this.formatTime(trace.startedAt) });
		metaEl.createEl("span", { text: `${trace.spans.length} spans` });
		if (trace.endedAt) {
			metaEl.createEl("span", { text: `${trace.endedAt - trace.startedAt}ms` });
		}

		item.addEventListener("click", () => {
			this.selectedTraceId = trace.traceId;
			this.render();
		});
	}

	private renderTraceDetail(container: HTMLElement, trace: TracingTrace): void {
		// Header
		const header = container.createDiv({ cls: "vc-tracing-detail-header" });
		header.createEl("h3", { text: trace.workflowName });
		
		const meta = header.createDiv({ cls: "vc-tracing-detail-meta" });
		meta.createEl("span", { text: `ID: ${trace.traceId.slice(0, 12)}...` });
		meta.createEl("span", { text: `Started: ${this.formatTime(trace.startedAt)}` });
		if (trace.endedAt) {
			meta.createEl("span", { text: `Duration: ${trace.endedAt - trace.startedAt}ms` });
		}
		if (trace.groupId) {
			meta.createEl("span", { text: `Group: ${trace.groupId.slice(0, 8)}...` });
		}

		// Spans tree
		const spansEl = container.createDiv({ cls: "vc-tracing-spans" });
		spansEl.createEl("h4", { text: "Spans" });

		if (trace.spans.length === 0) {
			spansEl.createEl("p", { text: "No spans recorded", cls: "vc-tracing-hint" });
			return;
		}

		// Build span tree
		const rootSpans = trace.spans.filter(s => !s.parentId);
		const spanTree = spansEl.createDiv({ cls: "vc-tracing-span-tree" });
		
		for (const span of rootSpans) {
			this.renderSpanNode(spanTree, span, trace.spans, 0);
		}

		// Also render orphan spans (ones with parent not in this trace)
		const orphanSpans = trace.spans.filter(s => 
			s.parentId && !trace.spans.some(p => p.spanId === s.parentId)
		);
		if (orphanSpans.length > 0) {
			for (const span of orphanSpans) {
				this.renderSpanNode(spanTree, span, trace.spans, 0);
			}
		}
	}

	private renderSpanNode(container: HTMLElement, span: TracingSpan, allSpans: TracingSpan[], depth: number): void {
		const node = container.createDiv({ 
			cls: "vc-tracing-span-node",
			attr: { style: `margin-left: ${depth * 16}px` }
		});

		// Expand/collapse for spans with children
		const children = allSpans.filter(s => s.parentId === span.spanId);
		const hasChildren = children.length > 0;

		// Header
		const header = node.createDiv({ cls: "vc-tracing-span-header" });
		
		if (hasChildren) {
			const toggle = header.createSpan({ cls: "vc-tracing-span-toggle" });
			setIcon(toggle, "chevron-down");
		} else {
			header.createSpan({ cls: "vc-tracing-span-toggle vc-empty" });
		}

		// Type badge
		const typeBadge = header.createSpan({ 
			cls: `vc-tracing-span-type vc-type-${span.type}`,
			text: span.type
		});

		// Name
		header.createSpan({ cls: "vc-tracing-span-name", text: span.name });

		// Duration
		if (span.endedAt) {
			header.createSpan({ 
				cls: "vc-tracing-span-duration",
				text: `${span.endedAt - span.startedAt}ms`
			});
		} else {
			header.createSpan({ cls: "vc-tracing-span-duration vc-running", text: "running..." });
		}

		// Error indicator
		if (span.error) {
			const errorIcon = header.createSpan({ cls: "vc-tracing-span-error" });
			setIcon(errorIcon, "alert-circle");
			errorIcon.setAttribute("title", span.error);
		}

		// Expandable detail section
		const detailSection = node.createDiv({ cls: "vc-tracing-span-detail vc-collapsed" });
		
		// Render span data
		if (span.data && Object.keys(span.data).length > 0) {
			const dataEl = detailSection.createDiv({ cls: "vc-tracing-span-data" });
			dataEl.createEl("strong", { text: "Data:" });
			const pre = dataEl.createEl("pre");
			pre.createEl("code", { text: JSON.stringify(span.data, null, 2) });
		}

		if (span.error) {
			const errorEl = detailSection.createDiv({ cls: "vc-tracing-span-error-detail" });
			errorEl.createEl("strong", { text: "Error:" });
			errorEl.createEl("span", { text: span.error });
		}

		// Toggle detail on click
		header.addEventListener("click", (e) => {
			e.stopPropagation();
			detailSection.toggleClass("vc-collapsed", !detailSection.hasClass("vc-collapsed"));
		});

		// Render children
		if (hasChildren) {
			const childContainer = node.createDiv({ cls: "vc-tracing-span-children" });
			for (const child of children) {
				this.renderSpanNode(childContainer, child, allSpans, depth + 1);
			}
		}
	}

	private formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString(undefined, { 
			hour: "2-digit", 
			minute: "2-digit", 
			second: "2-digit",
			fractionalSecondDigits: 3
		});
	}

	onClose(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.tracingContentEl = null;
	}
}

/**
 * Open tracing in a popout window
 */
export function openTracingPopout(app: App): void {
	// For now, use a modal. Obsidian's popout window API is complex
	// and requires creating a proper view. Modal provides similar functionality.
	const modal = new TracingModal(app);
	modal.open();
}
