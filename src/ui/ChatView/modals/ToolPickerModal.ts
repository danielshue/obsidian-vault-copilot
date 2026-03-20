/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ToolPickerModal
 * @description VS Code-style tool selection modal with hierarchical categories and search.
 *
 * Presents built-in, plugin, and MCP tools in a collapsible tree with parent/child checkbox
 * relationships, supports session-scoped and default tool configurations, and emits enabled
 * tool IDs on save.
 *
 * @since 0.0.14
 */

import { App, Modal, setIcon } from "obsidian";
import { IToolCatalog, ToolInfo } from "../../../copilot/tools/ToolCatalog";
import { CopilotPluginSettings, CopilotSession } from "../../../ui/settings";

export interface ToolPickerModalOptions {
	/** The tool catalog instance */
	toolCatalog: IToolCatalog;
	/** Plugin settings */
	settings: CopilotPluginSettings;
	/** Current session (if applying to session) */
	session?: CopilotSession;
	/** Mode: 'session' to save to session, 'defaults' to save as global defaults */
	mode: "session" | "defaults";
	/** Callback when tools are selected/saved */
	onSave: (enabledTools: string[]) => Promise<void>;
}

/**
 * Category configuration with icons
 */
const CATEGORY_CONFIG: Record<string, { icon: string; label: string }> = {
	// Built-in categories
	"builtin": { icon: "wrench", label: "Built-In" },
	"plugin": { icon: "puzzle", label: "Plugin Skills" },
	// Tool categories within built-in
	"note": { icon: "file-text", label: "note" },
	"vault": { icon: "folder", label: "vault" },
	"search": { icon: "search", label: "search" },
	"task": { icon: "check-square", label: "task" },
	"other": { icon: "package", label: "other" },
};

/**
 * Tool icon mapping
 */
const TOOL_ICONS: Record<string, string> = {
	// Note operations
	"read_current_note": "file-text",
	"read_note": "book-open",
	"create_note": "file-plus",
	"update_note": "file-pen",
	"append_to_note": "plus-square",
	"delete_note": "trash-2",
	// Vault operations
	"list_vault_files": "folder-open",
	"search_vault": "search",
	"get_file_metadata": "info",
	// Task operations
	"get_tasks": "list-checks",
	"create_task": "check-square",
	"complete_task": "check-check",
	"update_task": "refresh-cw",
};

/**
 * Modal that lets users enable/disable tools for chat sessions or defaults.
 */
export class ToolPickerModal extends Modal {
	private toolCatalog: IToolCatalog;
	private settings: CopilotPluginSettings;
	private session?: CopilotSession;
	private mode: "session" | "defaults";
	private onSave: (enabledTools: string[]) => Promise<void>;

	// State
	private selectedTools: Set<string>;
	private searchQuery = "";
	private expandedGroups: Set<string> = new Set(["builtin", "plugin"]); // Expanded by default
	private treeContainer: HTMLElement | null = null;
	private selectedCountEl: HTMLElement | null = null;

	constructor(app: App, options: ToolPickerModalOptions) {
		super(app);
		this.toolCatalog = options.toolCatalog;
		this.settings = options.settings;
		this.session = options.session;
		this.mode = options.mode;
		this.onSave = options.onSave;

		// Initialize selected tools from current state
		const enabledTools = this.toolCatalog.getEnabledTools(this.settings, this.session);
		this.selectedTools = new Set(enabledTools);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		
		// Set modal title
		titleEl.setText("Configure Tools");
		
		// Add modal class for styling
		this.modalEl.addClass("vc-tool-picker-modal");
		contentEl.addClass("vc-tool-picker-content");
		
		this.renderContent();
	}

	private renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Search bar row with selected count and OK button
		const searchRow = contentEl.createDiv({ cls: "vc-tp-search-row" });
		
		const searchInput = searchRow.createEl("input", {
			type: "text",
			placeholder: "Select tools that are available to chat.",
			cls: "vc-tp-search-input"
		});
		searchInput.addEventListener("input", (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
			this.renderTree();
		});

		// Selected count badge
		this.selectedCountEl = searchRow.createEl("span", { cls: "vc-tp-selected-count" });
		this.updateSelectedCount();

		// OK button
		const okBtn = searchRow.createEl("button", {
			text: "OK",
			cls: "vc-tp-ok-btn"
		});
		okBtn.addEventListener("click", () => this.applySelection());

		// Description text
		const descEl = contentEl.createDiv({ cls: "vc-tp-description" });
		descEl.setText(
			this.mode === "session"
				? "The selected tools apply to this chat session and will be remembered as your default for future sessions."
				: "The selected tools will be applied globally for all chat sessions that use the default tool configuration."
		);

		// Tree container
		this.treeContainer = contentEl.createDiv({ cls: "vc-tp-tree" });
		this.renderTree();
	}

	private renderTree(): void {
		if (!this.treeContainer) return;
		this.treeContainer.empty();

		const toolsBySource = this.toolCatalog.getKnownToolsBySource();

		// Render Built-In group
		if (toolsBySource.builtin && toolsBySource.builtin.length > 0) {
			this.renderSourceGroup(this.treeContainer, "builtin", toolsBySource.builtin);
		}

		// Render Plugin group
		if (toolsBySource.plugin && toolsBySource.plugin.length > 0) {
			this.renderSourceGroup(this.treeContainer, "plugin", toolsBySource.plugin);
		}

		// Render MCP server groups
		for (const [source, tools] of Object.entries(toolsBySource)) {
			if (source.startsWith("mcp:")) {
				this.renderSourceGroup(this.treeContainer, source, tools);
			}
		}
	}

	private toggleGroup(groupKey: string): void {
		if (this.expandedGroups.has(groupKey)) {
			this.expandedGroups.delete(groupKey);
		} else {
			this.expandedGroups.add(groupKey);
		}
		this.renderTree();
	}

	private renderSourceGroup(container: HTMLElement, source: string, tools: ToolInfo[]): void {
		// Filter tools by search
		const filteredTools = tools.filter(tool =>
			this.searchQuery === "" ||
			tool.displayName.toLowerCase().includes(this.searchQuery) ||
			tool.description.toLowerCase().includes(this.searchQuery) ||
			tool.id.toLowerCase().includes(this.searchQuery)
		);

		if (filteredTools.length === 0) return;

		// Get config
		let icon: string;
		let label: string;
		if (source.startsWith("mcp:")) {
			const serverName = source.replace("mcp:", "");
			icon = "plug";
			label = serverName;
		} else {
			const config = CATEGORY_CONFIG[source] || { icon: "package", label: source };
			icon = config.icon;
			label = config.label;
		}

		const isExpanded = this.expandedGroups.has(source);
		const allSelected = filteredTools.every(t => this.selectedTools.has(t.id));
		const someSelected = filteredTools.some(t => this.selectedTools.has(t.id));

		// Group container
		const groupEl = container.createDiv({ cls: "vc-tp-group" });

		// Group header row
		const headerEl = groupEl.createDiv({ cls: "vc-tp-group-header" });
		
		// Expand/collapse chevron
		const chevronEl = headerEl.createSpan({ cls: "vc-tp-chevron" });
		chevronEl.innerHTML = isExpanded 
			? `<svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M11 10H5l3-4z"/></svg>`
			: `<svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M6 4v8l4-4z"/></svg>`;
		chevronEl.addEventListener("click", (event) => {
			event.stopPropagation();
			this.toggleGroup(source);
		});

		// Checkbox for group
		const checkboxEl = headerEl.createEl("input", { type: "checkbox", cls: "vc-tp-checkbox" });
		checkboxEl.checked = allSelected;
		checkboxEl.indeterminate = someSelected && !allSelected;
		checkboxEl.addEventListener("change", () => {
			if (checkboxEl.checked) {
				filteredTools.forEach(t => this.selectedTools.add(t.id));
			} else {
				filteredTools.forEach(t => this.selectedTools.delete(t.id));
			}
			this.renderTree();
			this.updateSelectedCount();
		});

		// Icon and label
		const labelEl = headerEl.createSpan({ cls: "vc-tp-group-label" });
		const iconEl = labelEl.createSpan({ cls: "vc-tp-icon" });
		setIcon(iconEl, icon);
		labelEl.createSpan({ text: label });

		// Make header clickable for expand/collapse
		headerEl.addEventListener("click", (e) => {
			if (e.target === checkboxEl) return;
			this.toggleGroup(source);
		});

		// Children container
		if (isExpanded) {
			const childrenEl = groupEl.createDiv({ cls: "vc-tp-children" });

			// Render flat list for all sources (matches VS Code tool picker hierarchy)
			for (const tool of filteredTools) {
				this.renderToolItem(childrenEl, tool, 1);
			}
		}
	}

	private renderCategorizedTools(container: HTMLElement, tools: ToolInfo[]): void {
		// Group tools by category
		const categories: Record<string, ToolInfo[]> = {};
		
		for (const tool of tools) {
			// Determine category from tool id
			let category = "other";
			if (tool.id.includes("note")) category = "note";
			else if (tool.id.includes("vault") || tool.id.includes("file") || tool.id.includes("list")) category = "vault";
			else if (tool.id.includes("search")) category = "search";
			else if (tool.id.includes("task")) category = "task";
			
			if (!categories[category]) categories[category] = [];
			const categoryList = categories[category];
			if (categoryList) {
				categoryList.push(tool);
			}
		}

		// Render each category
		for (const [category, categoryTools] of Object.entries(categories)) {
			if (categoryTools.length === 0) continue;
			
			const config = CATEGORY_CONFIG[category] || { icon: "package", label: category };
			const catKey = `builtin:${category}`;
			const isExpanded = this.expandedGroups.has(catKey);
			const allSelected = categoryTools.every(t => this.selectedTools.has(t.id));
			const someSelected = categoryTools.some(t => this.selectedTools.has(t.id));

			// Category row
			const catEl = container.createDiv({ cls: "vc-tp-category" });
			const catHeader = catEl.createDiv({ cls: "vc-tp-category-header" });

			// Chevron
			const chevronEl = catHeader.createSpan({ cls: "vc-tp-chevron" });
			chevronEl.innerHTML = isExpanded 
				? `<svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M11 10H5l3-4z"/></svg>`
				: `<svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M6 4v8l4-4z"/></svg>`;

			// Checkbox
			const checkboxEl = catHeader.createEl("input", { type: "checkbox", cls: "vc-tp-checkbox" });
			checkboxEl.checked = allSelected;
			checkboxEl.indeterminate = someSelected && !allSelected;
			checkboxEl.addEventListener("change", () => {
				if (checkboxEl.checked) {
					categoryTools.forEach(t => this.selectedTools.add(t.id));
				} else {
					categoryTools.forEach(t => this.selectedTools.delete(t.id));
				}
				this.renderTree();
				this.updateSelectedCount();
			});

			// Icon and label
			const labelEl = catHeader.createSpan({ cls: "vc-tp-category-label" });
			const iconEl = labelEl.createSpan({ cls: "vc-tp-icon" });
			setIcon(iconEl, config.icon);
			labelEl.createSpan({ text: config.label });

			// Click to expand/collapse
			catHeader.addEventListener("click", (e) => {
				if (e.target === checkboxEl) return;
				if (this.expandedGroups.has(catKey)) {
					this.expandedGroups.delete(catKey);
				} else {
					this.expandedGroups.add(catKey);
				}
				this.renderTree();
			});

			// Tool items
			if (isExpanded) {
				const toolsEl = catEl.createDiv({ cls: "vc-tp-category-tools" });
				for (const tool of categoryTools) {
					this.renderToolItem(toolsEl, tool, 2);
				}
			}
		}
	}

	private renderToolItem(container: HTMLElement, tool: ToolInfo, depth: number): void {
		const itemEl = container.createDiv({ cls: `vc-tp-item vc-tp-depth-${depth}` });
		itemEl.setAttr("title", tool.description);

		// Checkbox
		const checkboxEl = itemEl.createEl("input", { type: "checkbox", cls: "vc-tp-checkbox" });
		checkboxEl.checked = this.selectedTools.has(tool.id);
		checkboxEl.addEventListener("change", () => {
			if (checkboxEl.checked) {
				this.selectedTools.add(tool.id);
			} else {
				this.selectedTools.delete(tool.id);
			}
			this.updateSelectedCount();
		});

		// Icon
		const icon = TOOL_ICONS[tool.id] || "wrench";
		const iconEl = itemEl.createSpan({ cls: "vc-tp-icon" });
		setIcon(iconEl, icon);

		// Name, then description
		const textEl = itemEl.createDiv({ cls: "vc-tp-item-text" });
		textEl.createSpan({ text: tool.id, cls: "vc-tp-item-name" });
		const descEl = textEl.createSpan({ text: ` - ${tool.description}`, cls: "vc-tp-item-desc" });
		descEl.setAttr("title", tool.description);

		// Click anywhere to toggle
		itemEl.addEventListener("click", (e) => {
			if (e.target === checkboxEl) return;
			checkboxEl.checked = !checkboxEl.checked;
			checkboxEl.dispatchEvent(new Event("change"));
		});
	}

	private updateSelectedCount(): void {
		if (!this.selectedCountEl) return;
		this.selectedCountEl.setText(`${this.selectedTools.size} Selected`);
	}

	private async applySelection(): Promise<void> {
		try {
			const enabledTools = Array.from(this.selectedTools);
			await this.onSave(enabledTools);
			this.close();
		} catch (error) {
			console.error(`Failed to save: ${error}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
