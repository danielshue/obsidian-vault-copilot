/**
 * ToolPickerModal - VS Code-style tool selection modal
 * 
 * Displays tools in a hierarchical tree structure with collapsible categories,
 * search filter, and parent/child checkbox relationships.
 */

import { App, Modal, Notice } from "obsidian";
import { ToolCatalog, ToolInfo } from "../../copilot/ToolCatalog";
import { CopilotPluginSettings, CopilotSession } from "../../settings";

export interface ToolPickerModalOptions {
	/** The tool catalog instance */
	toolCatalog: ToolCatalog;
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
	"builtin": { icon: "⚡", label: "Built-In" },
	"plugin": { icon: "🧩", label: "Plugin Skills" },
	// Tool categories within built-in
	"note": { icon: "📝", label: "note" },
	"vault": { icon: "📁", label: "vault" },
	"search": { icon: "🔍", label: "search" },
	"task": { icon: "✅", label: "task" },
};

/**
 * Tool icon mapping
 */
const TOOL_ICONS: Record<string, string> = {
	// Note operations
	"read_current_note": "📄",
	"read_note": "📖",
	"create_note": "📝",
	"update_note": "✏️",
	"append_to_note": "➕",
	"delete_note": "🗑️",
	// Vault operations
	"list_vault_files": "📂",
	"search_vault": "🔎",
	"get_file_metadata": "ℹ️",
	// Task operations
	"get_tasks": "📋",
	"create_task": "✅",
	"complete_task": "☑️",
	"update_task": "🔄",
};

export class ToolPickerModal extends Modal {
	private toolCatalog: ToolCatalog;
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
		if (this.mode === "defaults") {
			descEl.setText("The selected tools will be applied globally for all chat sessions that use the default agent.");
		} else {
			descEl.setText("The selected tools will be used for this chat session only.");
		}

		// Tree container
		this.treeContainer = contentEl.createDiv({ cls: "vc-tp-tree" });
		this.renderTree();
	}

	private renderTree(): void {
		if (!this.treeContainer) return;
		this.treeContainer.empty();

		const toolsBySource = this.toolCatalog.getToolsBySource();

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
			icon = "🔌";
			label = serverName;
		} else {
			const config = CATEGORY_CONFIG[source] || { icon: "📦", label: source };
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
		chevronEl.addEventListener("click", () => {
			if (this.expandedGroups.has(source)) {
				this.expandedGroups.delete(source);
			} else {
				this.expandedGroups.add(source);
			}
			this.renderTree();
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
		labelEl.createSpan({ text: icon, cls: "vc-tp-icon" });
		labelEl.createSpan({ text: label });

		// Make header clickable for expand/collapse
		headerEl.addEventListener("click", (e) => {
			if (e.target === checkboxEl) return;
			if (this.expandedGroups.has(source)) {
				this.expandedGroups.delete(source);
			} else {
				this.expandedGroups.add(source);
			}
			this.renderTree();
		});

		// Children container
		if (isExpanded) {
			const childrenEl = groupEl.createDiv({ cls: "vc-tp-children" });
			
			// Group by category for builtin tools
			if (source === "builtin") {
				this.renderCategorizedTools(childrenEl, filteredTools);
			} else {
				// Render flat list for other sources
				for (const tool of filteredTools) {
					this.renderToolItem(childrenEl, tool, 1);
				}
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
			categories[category]!.push(tool);
		}

		// Render each category
		for (const [category, categoryTools] of Object.entries(categories)) {
			if (categoryTools.length === 0) continue;
			
			const config = CATEGORY_CONFIG[category] || { icon: "📦", label: category };
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
			labelEl.createSpan({ text: config.icon, cls: "vc-tp-icon" });
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
		const icon = TOOL_ICONS[tool.id] || "🔧";
		itemEl.createSpan({ text: icon, cls: "vc-tp-icon" });

		// Name and description on same line
		const nameEl = itemEl.createSpan({ text: tool.displayName, cls: "vc-tp-item-name" });
		itemEl.createSpan({ text: tool.description, cls: "vc-tp-item-desc" });

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
			new Notice(`Failed to save: ${error}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
