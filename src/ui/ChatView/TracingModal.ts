/**
 * TracingModal - Modal to display tracing information
 * 
 * Shows captured traces and spans from agent executions in a 
 * tree-like format for debugging and inspection.
 */

import { App, Menu, Modal, setIcon } from "obsidian";
import { TracingService, TracingTrace, TracingSpan, TracingEvent, SDKLogEntry, getTracingService } from "../../copilot/TracingService";

type TabType = 'traces' | 'sdk-logs';
type SortDirection = 'asc' | 'desc';

interface SdkLogFilters {
	sources: Set<string>; // 'voice', 'cli'
	levels: Set<string>;  // 'info', 'warning', 'error', 'debug'
	agents: Set<string>;  // agent names like 'Main Vault Assistant', 'Note Manager', etc.
	searchText: string;   // text search filter
}

/**
 * Extract agent name from a log message if present (e.g., "[Main Vault Assistant]")
 */
function extractAgentName(message: string): string | null {
	const match = message.match(/^\[([^\]]+)\]/);
	return match?.[1] ?? null;
}

/**
 * Format duration in a human-friendly way
 * - Under 1 second: "XXXms"
 * - 1-60 seconds: "X.Xs"
 * - 1-60 minutes: "Xm Ys"
 * - Over 60 minutes: "Xh Ym"
 */
function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	const seconds = ms / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	if (minutes < 60) {
		return `${minutes}m ${remainingSeconds}s`;
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h ${remainingMinutes}m`;
}

/**
 * Determine effective source for a log entry
 * - 'voice' for realtime-agent logs
 * - 'service' for logs starting with [CopilotService] or [Vault Copilot]
 * - 'cli' for other copilot-cli/copilot-sdk logs
 */
function getEffectiveSource(log: { source: string; message: string }): 'voice' | 'cli' | 'service' {
	if (log.source === 'realtime-agent') {
		return 'voice';
	}
	if (log.message.startsWith('[CopilotService]') || log.message.startsWith('[Vault Copilot]')) {
		return 'service';
	}
	return 'cli';
}

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
	
	// SDK Logs state
	private sdkLogSortDir: SortDirection = 'desc'; // newest first by default
	private sdkLogFilters: SdkLogFilters = {
		sources: new Set(['voice', 'cli', 'service']),
		levels: new Set(['info', 'warning', 'error', 'debug']),
		agents: new Set(), // Empty means show all agents
		searchText: ''
	};

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

		// Trace count header - only shown on Voice Traces tab
		const traceCountHeader = this.tracingContentEl.createDiv({ cls: "vc-tracing-tab-header" });
		traceCountHeader.createEl("span", { 
			text: `${traces.length} trace${traces.length !== 1 ? 's' : ''}`,
			cls: "vc-trace-count-badge"
		});

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

		const allLogs = this.tracingService.getSdkLogs();

		// Extract unique agent names from voice logs
		const agentNames = new Set<string>();
		for (const log of allLogs) {
			const agentName = extractAgentName(log.message);
			// Exclude service sources - they're not agents
			if (agentName && agentName !== 'CopilotService' && agentName !== 'Vault Copilot') {
				agentNames.add(agentName);
			}
		}
		const sortedAgentNames = Array.from(agentNames).sort();

		// Filter controls
		const filterBar = this.tracingContentEl.createDiv({ cls: "vc-sdk-logs-filters" });
		
		// Sort button
		const sortBtn = filterBar.createEl("button", { 
			cls: "vc-tracing-btn vc-sort-btn",
			attr: { title: `Sort by date (${this.sdkLogSortDir === 'desc' ? 'newest first' : 'oldest first'})` }
		});
		setIcon(sortBtn, this.sdkLogSortDir === 'desc' ? 'arrow-down' : 'arrow-up');
		sortBtn.createSpan({ text: this.sdkLogSortDir === 'desc' ? 'Newest' : 'Oldest' });
		sortBtn.addEventListener("click", () => {
			this.sdkLogSortDir = this.sdkLogSortDir === 'desc' ? 'asc' : 'desc';
			this.render();
		});

		// Source filter dropdown
		const sourceFilter = filterBar.createDiv({ cls: "vc-filter-group" });
		sourceFilter.createEl("span", { text: "Source:", cls: "vc-filter-label" });
		
		const sources = ['voice', 'cli', 'service'] as const;
		for (const source of sources) {
			const isActive = this.sdkLogFilters.sources.has(source);
			const btn = sourceFilter.createEl("button", {
				cls: `vc-filter-btn ${isActive ? 'vc-active' : ''}`,
				text: source
			});
			btn.addEventListener("click", () => {
				if (isActive) {
					this.sdkLogFilters.sources.delete(source);
				} else {
					this.sdkLogFilters.sources.add(source);
				}
				this.render();
			});
		}

		// Level filter dropdown
		const levelFilter = filterBar.createDiv({ cls: "vc-filter-group" });
		levelFilter.createEl("span", { text: "Level:", cls: "vc-filter-label" });
		
		const levels = ['debug', 'info', 'warning', 'error'] as const;
		for (const level of levels) {
			const isActive = this.sdkLogFilters.levels.has(level);
			const btn = levelFilter.createEl("button", {
				cls: `vc-filter-btn vc-level-${level} ${isActive ? 'vc-active' : ''}`,
				text: level
			});
			btn.addEventListener("click", () => {
				if (isActive) {
					this.sdkLogFilters.levels.delete(level);
				} else {
					this.sdkLogFilters.levels.add(level);
				}
				this.render();
			});
		}

		// Agent filter (only show if there are voice logs with agent names)
		if (sortedAgentNames.length > 0) {
			const agentFilter = filterBar.createDiv({ cls: "vc-filter-group" });
			agentFilter.createEl("span", { text: "Agent:", cls: "vc-filter-label" });
			
			// "All" button
			const allAgentsActive = this.sdkLogFilters.agents.size === 0;
			const allBtn = agentFilter.createEl("button", {
				cls: `vc-filter-btn ${allAgentsActive ? 'vc-active' : ''}`,
				text: "All"
			});
			allBtn.addEventListener("click", () => {
				this.sdkLogFilters.agents.clear();
				this.render();
			});
			
			for (const agentName of sortedAgentNames) {
				const isActive = this.sdkLogFilters.agents.has(agentName);
				// Shorten long agent names for the button
				const shortName = agentName.length > 20 ? agentName.substring(0, 17) + '...' : agentName;
				const btn = agentFilter.createEl("button", {
					cls: `vc-filter-btn vc-agent-filter ${isActive ? 'vc-active' : ''}`,
					text: shortName,
					attr: { title: agentName }
				});
				btn.addEventListener("click", () => {
					if (isActive) {
						this.sdkLogFilters.agents.delete(agentName);
					} else {
						this.sdkLogFilters.agents.add(agentName);
					}
					this.render();
				});
			}
		}

		// Search input
		const searchGroup = filterBar.createDiv({ cls: "vc-filter-group vc-search-group" });
		const searchInput = searchGroup.createEl("input", {
			cls: "vc-sdk-log-search",
			attr: { 
				type: "text", 
				placeholder: "Search logs...",
				value: this.sdkLogFilters.searchText
			}
		});
		searchInput.addEventListener("input", (e) => {
			this.sdkLogFilters.searchText = (e.target as HTMLInputElement).value;
			this.render();
		});
		// Keep focus on search input after re-render
		if (this.sdkLogFilters.searchText) {
			setTimeout(() => {
				searchInput.focus();
				searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
			}, 0);
		}

		// Apply filters
		const filteredLogs = allLogs.filter(log => {
			const logSource = getEffectiveSource(log);
			
			// Check source filter
			if (!this.sdkLogFilters.sources.has(logSource)) {
				return false;
			}
			
			// Check level filter
			if (!this.sdkLogFilters.levels.has(log.level)) {
				return false;
			}
			
			// Check agent filter (applies to both voice and CLI logs)
			if (this.sdkLogFilters.agents.size > 0) {
				const agentName = extractAgentName(log.message);
				// If no agent name or the agent doesn't match filter, exclude it
				if (!agentName || !this.sdkLogFilters.agents.has(agentName)) {
					return false;
				}
			}
			
			// Check search text filter
			if (this.sdkLogFilters.searchText) {
				const searchLower = this.sdkLogFilters.searchText.toLowerCase();
				if (!log.message.toLowerCase().includes(searchLower)) {
					return false;
				}
			}
			
			return true;
		});

		// Apply sort
		const sortedLogs = [...filteredLogs].sort((a, b) => {
			return this.sdkLogSortDir === 'desc' 
				? b.timestamp - a.timestamp 
				: a.timestamp - b.timestamp;
		});

		if (sortedLogs.length === 0) {
			const emptyState = this.tracingContentEl.createDiv({ cls: "vc-tracing-empty" });
			if (allLogs.length === 0) {
				emptyState.createEl("p", { text: "No SDK logs captured yet." });
				emptyState.createEl("p", { 
					text: "SDK logs are captured from:",
					cls: "vc-tracing-hint"
				});
				const list = emptyState.createEl("ul", { cls: "vc-tracing-hint" });
				list.createEl("li", { text: "Realtime voice agent sessions" });
				list.createEl("li", { text: "Copilot CLI operations" });
			} else {
				emptyState.createEl("p", { text: "No logs match the current filters." });
			}
			return;
		}

		// Log list container
		const logsContainer = this.tracingContentEl.createDiv({ cls: "vc-sdk-logs-container" });
		
		// Header with count
		const header = logsContainer.createDiv({ cls: "vc-sdk-logs-header" });
		header.createEl("span", { text: `${sortedLogs.length} log entries` + (allLogs.length !== sortedLogs.length ? ` (${allLogs.length} total)` : '') });
		
		// Clear button
		const clearBtn = header.createEl("button", { cls: "vc-tracing-btn", text: "Clear" });
		clearBtn.addEventListener("click", () => {
			this.tracingService.clearSdkLogs();
			this.render();
		});

		// Log entries
		const logList = logsContainer.createDiv({ cls: "vc-sdk-logs-list" });
		
		// Threshold for considering a message "long" (needs expand/collapse)
		const LONG_MESSAGE_THRESHOLD = 150;
		
		for (const log of sortedLogs) {
			const isLongMessage = log.message.length > LONG_MESSAGE_THRESHOLD;
			const entry = logList.createDiv({ 
				cls: `vc-sdk-log-entry vc-log-${log.level}${isLongMessage ? ' vc-log-expandable vc-log-collapsed' : ''}`
			});
			
			// Right-click context menu for copying
			entry.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				const menu = new Menu();
				
				// Copy message only
				menu.addItem((item) => {
					item.setTitle("Copy message")
						.setIcon("copy")
						.onClick(() => {
							navigator.clipboard.writeText(log.message);
						});
				});
				
				// Copy full log entry (timestamp, level, source, message)
				menu.addItem((item) => {
					const fullEntry = `[${this.formatTime(log.timestamp)}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`;
					item.setTitle("Copy full entry")
						.setIcon("clipboard-copy")
						.onClick(() => {
							navigator.clipboard.writeText(fullEntry);
						});
				});
				
				menu.showAtMouseEvent(e);
			});
			
			// Timestamp
			entry.createSpan({ 
				cls: "vc-sdk-log-time",
				text: this.formatTime(log.timestamp)
			});
			
			// Source badge
			const sourceText = getEffectiveSource(log);
			entry.createSpan({ 
				cls: `vc-sdk-log-source`,
				text: sourceText
			});
			
			// Level badge
			entry.createSpan({ 
				cls: `vc-sdk-log-level vc-level-${log.level}`,
				text: log.level.toUpperCase()
			});
			
			// Message container
			const messageContainer = entry.createDiv({ cls: "vc-sdk-log-message-container" });
			
			if (isLongMessage) {
				// Truncated message (shown when collapsed)
				messageContainer.createSpan({ 
					cls: "vc-sdk-log-message-truncated",
					text: log.message.substring(0, LONG_MESSAGE_THRESHOLD) + '...'
				});
				
				// Full message (shown when expanded)
				messageContainer.createSpan({ 
					cls: "vc-sdk-log-message-full",
					text: log.message
				});
				
				// Expand/collapse toggle
				const toggle = entry.createSpan({ cls: "vc-sdk-log-toggle" });
				setIcon(toggle, "chevron-down");
				toggle.setAttribute("title", "Click to expand");
				
				entry.addEventListener("click", () => {
					const isCollapsed = entry.hasClass("vc-log-collapsed");
					entry.toggleClass("vc-log-collapsed", !isCollapsed);
					setIcon(toggle, isCollapsed ? "chevron-up" : "chevron-down");
					toggle.setAttribute("title", isCollapsed ? "Click to collapse" : "Click to expand");
				});
			} else {
				// Short message - just show it directly
				messageContainer.createSpan({ 
					cls: "vc-sdk-log-message",
					text: log.message
				});
			}
		}
	}

	private renderTraceListItem(container: HTMLElement, trace: TracingTrace): void {
		const isSelected = trace.traceId === this.selectedTraceId;
		const item = container.createDiv({ 
			cls: `vc-tracing-list-item ${isSelected ? "vc-selected" : ""}`
		});

		// Check if trace is stale (not ended but older than 5 minutes)
		const isStale = !trace.endedAt && (Date.now() - trace.startedAt > 5 * 60 * 1000);

		// Icon based on status
		const iconEl = item.createSpan({ cls: "vc-tracing-item-icon" });
		if (!trace.endedAt && !isStale) {
			setIcon(iconEl, "loader");
			iconEl.addClass("vc-spinning");
		} else if (trace.spans.some(s => s.error)) {
			setIcon(iconEl, "alert-circle");
			iconEl.addClass("vc-error");
		} else if (isStale) {
			setIcon(iconEl, "clock");
			iconEl.addClass("vc-stale");
			iconEl.setAttribute("title", "Trace was not properly ended (stale)");
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
			metaEl.createEl("span", { text: formatDuration(trace.endedAt - trace.startedAt) });
		} else if (isStale) {
			metaEl.createEl("span", { text: "stale", cls: "vc-stale-label" });
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
			meta.createEl("span", { text: `Duration: ${formatDuration(trace.endedAt - trace.startedAt)}` });
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
			this.renderSpanNode(spanTree, span, trace.spans, 0, trace.startedAt);
		}

		// Also render orphan spans (ones with parent not in this trace)
		const orphanSpans = trace.spans.filter(s => 
			s.parentId && !trace.spans.some(p => p.spanId === s.parentId)
		);
		if (orphanSpans.length > 0) {
			for (const span of orphanSpans) {
				this.renderSpanNode(spanTree, span, trace.spans, 0, trace.startedAt);
			}
		}
	}

	private renderSpanNode(container: HTMLElement, span: TracingSpan, allSpans: TracingSpan[], depth: number, traceStartedAt: number): void {
		const node = container.createDiv({ 
			cls: "vc-tracing-span-node",
			attr: { style: `margin-left: ${depth * 16}px` }
		});

		// Check if span is stale (not ended but older than 5 minutes)
		const isStale = !span.endedAt && (Date.now() - traceStartedAt > 5 * 60 * 1000);

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
				text: formatDuration(span.endedAt - span.startedAt)
			});
		} else if (isStale) {
			header.createSpan({ cls: "vc-tracing-span-duration vc-stale", text: "stale" });
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
				this.renderSpanNode(childContainer, child, allSpans, depth + 1, traceStartedAt);
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
