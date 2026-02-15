/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module EditorManager
 * @description Tabbed CodeMirror 6 markdown editor for the center pane.
 *
 * Manages multiple open files as tabs, each backed by a CodeMirror EditorView
 * with markdown syntax highlighting. Only the active tab's editor is visible.
 *
 * @since 0.0.27
 */

import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { marked } from "marked";

/** View mode for a tab */
type ViewMode = "source" | "preview";

/** Represents a single open editor tab */
interface EditorTab {
	/** File path within the vault */
	path: string;
	/** Display name for the tab */
	name: string;
	/** CodeMirror editor view */
	view: EditorView;
	/** Tab header element */
	tabEl: HTMLElement;
	/** Whether the file has unsaved changes */
	dirty: boolean;
	/** Original content for dirty tracking */
	originalContent: string;
	/** Current view mode (source editor or preview) */
	mode: ViewMode;
	/** The wrapper that holds both the editor view and preview */
	wrapperEl: HTMLElement;
	/** The rendered markdown preview element */
	previewEl: HTMLElement;
}

/**
 * Manages a tabbed editor interface in the center pane.
 */
export class EditorManager {
	private container: HTMLElement;
	private tabBar: HTMLElement;
	private newTabBtn: HTMLElement;
	private splitBtn!: HTMLButtonElement;
	private titlebarRightSidebarBtn: HTMLButtonElement | null = null;
	private rightSidebarObserver: MutationObserver | null = null;
	private breadcrumbBar: HTMLElement;
	private breadcrumbPath: HTMLElement;
	private viewToggleBtn!: HTMLButtonElement;
	private editorContainer: HTMLElement;
	private emptyState: HTMLElement;
	private tabs: Map<string, EditorTab> = new Map();
	private activeTabPath: string | null = null;
	private vault: any;
	private onSave: ((path: string, content: string) => Promise<void>) | null = null;
	/** Ordered history of visited tab paths for back/forward navigation */
	private tabHistory: string[] = [];
	private tabHistoryIndex = -1;
	/** Active dropdown menu element (for cleanup) */
	private activeMenu: HTMLElement | null = null;
	private activeMenuCleanup: (() => void) | null = null;

	constructor(container: HTMLElement, vault: any) {
		this.container = container;
		this.vault = vault;
		this.container.innerHTML = "";
		this.container.classList.add("ws-editor-pane");

		// Tab header row (tabs + new tab button + header actions)
		const tabHeader = document.createElement("div");
		tabHeader.className = "ws-tab-header";
		this.container.appendChild(tabHeader);

		// Tab bar (scrollable tabs)
		this.tabBar = document.createElement("div");
		this.tabBar.className = "ws-tab-bar";
		tabHeader.appendChild(this.tabBar);

		// New tab "+" button
		this.newTabBtn = document.createElement("button");
		this.newTabBtn.className = "ws-new-tab-btn";
		this.newTabBtn.setAttribute("aria-label", "New tab");
		this.newTabBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
		tabHeader.appendChild(this.newTabBtn);

		// Tab header right actions (chevron + layout)
		const tabHeaderActions = document.createElement("div");
		tabHeaderActions.className = "ws-tab-header-actions";
		tabHeader.appendChild(tabHeaderActions);

		const chevronBtn = document.createElement("button");
		chevronBtn.setAttribute("aria-label", "Tab list");
		chevronBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
		chevronBtn.addEventListener("click", (e) => this.showTabListMenu(chevronBtn, e));
		tabHeaderActions.appendChild(chevronBtn);

		this.splitBtn = document.createElement("button");
		this.splitBtn.setAttribute("aria-label", "Toggle right sidebar");
		this.splitBtn.innerHTML = this.getRightSidebarIcon(false);
		this.splitBtn.addEventListener("click", () => this.toggleRightSidebar());
		this.splitBtn.addEventListener("contextmenu", (e) => this.showRightSidebarContextMenu(this.splitBtn, e));
		tabHeaderActions.appendChild(this.splitBtn);

		// Breadcrumb bar (below tabs): back/forward, path, view toggle, kebab menu
		this.breadcrumbBar = document.createElement("div");
		this.breadcrumbBar.className = "ws-breadcrumb-bar is-hidden";
		this.container.appendChild(this.breadcrumbBar);

		// Nav arrows
		const breadcrumbNav = document.createElement("div");
		breadcrumbNav.className = "ws-breadcrumb-nav";
		this.breadcrumbBar.appendChild(breadcrumbNav);

		const backBtn = document.createElement("button");
		backBtn.setAttribute("aria-label", "Navigate back");
		backBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
		backBtn.addEventListener("click", () => this.navigateBack());
		breadcrumbNav.appendChild(backBtn);

		const forwardBtn = document.createElement("button");
		forwardBtn.setAttribute("aria-label", "Navigate forward");
		forwardBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
		forwardBtn.addEventListener("click", () => this.navigateForward());
		breadcrumbNav.appendChild(forwardBtn);

		// Breadcrumb path
		this.breadcrumbPath = document.createElement("div");
		this.breadcrumbPath.className = "ws-breadcrumb-path";
		this.breadcrumbBar.appendChild(this.breadcrumbPath);

		// Breadcrumb right actions (view toggle + kebab menu)
		const breadcrumbActions = document.createElement("div");
		breadcrumbActions.className = "ws-breadcrumb-actions";
		this.breadcrumbBar.appendChild(breadcrumbActions);

		this.viewToggleBtn = document.createElement("button");
		this.viewToggleBtn.className = "ws-view-toggle-btn";
		this.viewToggleBtn.setAttribute("aria-label", "Toggle reading view");
		this.viewToggleBtn.innerHTML = this.getViewIcon("source");
		this.viewToggleBtn.addEventListener("click", () => this.toggleActiveTabMode());
		breadcrumbActions.appendChild(this.viewToggleBtn);

		const kebabBtn = document.createElement("button");
		kebabBtn.setAttribute("aria-label", "More options");
		kebabBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
		breadcrumbActions.appendChild(kebabBtn);

		// Editor container (holds CodeMirror instances)
		this.editorContainer = document.createElement("div");
		this.editorContainer.className = "ws-editor-container";
		this.container.appendChild(this.editorContainer);

		// Empty state (shown when no tabs open)
		this.emptyState = document.createElement("div");
		this.emptyState.className = "ws-center-placeholder";
		this.emptyState.innerHTML = `
			<a class="ws-empty-action" data-action="new-note">Create new note (Ctrl + N)</a>
			<a class="ws-empty-action" data-action="go-to-file">Go to file (Ctrl + O)</a>
			<a class="ws-empty-action" data-action="close">Close</a>
		`;
		this.editorContainer.appendChild(this.emptyState);
		this.ensureTitlebarRightSidebarButton();
		this.bindExternalRightSidebarControls();
		this.updateRightSidebarToggleUI(false);
		this.watchRightSidebarState();
		this.updateTabHeaderControls();
	}

	/**
	 * Set the save callback for when Ctrl+S is pressed.
	 */
	setSaveHandler(handler: (path: string, content: string) => Promise<void>): void {
		this.onSave = handler;
	}

	/**
	 * Open a file in a tab. If already open, activates that tab.
	 */
	async openFile(filePath: string): Promise<void> {
		// Already open — just activate
		if (this.tabs.has(filePath)) {
			this.activateTab(filePath);
			return;
		}

		// Read file content from vault
		const file = this.vault.getAbstractFileByPath(filePath);
		if (!file) {
			console.warn(`[EditorManager] File not found: ${filePath}`);
			return;
		}

		let content: string;
		try {
			content = await this.vault.read(file);
		} catch (err) {
			console.error(`[EditorManager] Failed to read ${filePath}:`, err);
			return;
		}

		// Create tab header
		const tabEl = document.createElement("div");
		tabEl.className = "ws-tab";
		const tabName = filePath.split("/").pop()?.replace(/\.md$/, "") || filePath;

		const nameSpan = document.createElement("span");
		nameSpan.className = "ws-tab-name";
		nameSpan.textContent = tabName;
		tabEl.appendChild(nameSpan);

		const closeBtn = document.createElement("span");
		closeBtn.className = "ws-tab-close";
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		tabEl.appendChild(closeBtn);

		// Tab click → activate
		tabEl.addEventListener("click", (e) => {
			if (!(e.target as HTMLElement).closest(".ws-tab-close")) {
				this.activateTab(filePath);
			}
		});

		// Close button
		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.closeTab(filePath);
		});

		this.tabBar.appendChild(tabEl);

		// Create wrapper that holds both editor and preview
		const wrapperEl = document.createElement("div");
		wrapperEl.className = "ws-editor-wrapper";
		this.editorContainer.appendChild(wrapperEl);

		// Create CodeMirror editor
		const editorEl = document.createElement("div");
		editorEl.className = "ws-editor-view";
		wrapperEl.appendChild(editorEl);

		// Create preview pane
		const previewEl = document.createElement("div");
		previewEl.className = "ws-preview-view markdown-rendered";
		previewEl.style.display = "none";
		wrapperEl.appendChild(previewEl);

		const self = this;
		const state = EditorState.create({
			doc: content,
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				highlightActiveLineGutter(),
				history(),
				drawSelection(),
				rectangularSelection(),
				indentOnInput(),
				bracketMatching(),
				foldGutter(),
				syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
				markdown({ base: markdownLanguage, codeLanguages: languages }),
				keymap.of([
					...defaultKeymap,
					...historyKeymap,
					...foldKeymap,
					indentWithTab,
					{
						key: "Mod-s",
						run: () => {
							self.saveActiveTab();
							return true;
						}
					}
				]),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						const tab = self.tabs.get(filePath);
						if (tab) {
							const currentContent = update.state.doc.toString();
							const isDirty = currentContent !== tab.originalContent;
							if (isDirty !== tab.dirty) {
								tab.dirty = isDirty;
								self.updateTabDirtyState(tab);
							}
						}
					}
				}),
				EditorView.theme({
					"&": {
						height: "100%",
						fontSize: "var(--font-text-size, 16px)",
					},
					".cm-content": {
						fontFamily: "var(--font-text, -apple-system, BlinkMacSystemFont, sans-serif)",
						padding: "16px 0",
					},
					".cm-line": {
						padding: "0 24px",
					},
					".cm-gutters": {
						backgroundColor: "var(--background-secondary)",
						color: "var(--text-faint)",
						borderRight: "1px solid var(--background-modifier-border)",
					},
					".cm-activeLineGutter": {
						backgroundColor: "var(--background-modifier-hover)",
					},
					".cm-activeLine": {
						backgroundColor: "var(--background-modifier-hover)",
					},
					".cm-cursor": {
						borderLeftColor: "var(--text-normal)",
					},
					".cm-selectionBackground": {
						backgroundColor: "var(--text-selection) !important",
					},
					"&.cm-focused .cm-selectionBackground": {
						backgroundColor: "var(--text-selection) !important",
					},
				}),
			],
		});

		const view = new EditorView({
			state,
			parent: editorEl,
		});

		const tab: EditorTab = {
			path: filePath,
			name: tabName,
			view,
			tabEl,
			dirty: false,
			originalContent: content,
			mode: "source",
			wrapperEl,
			previewEl,
		};

		this.tabs.set(filePath, tab);
		this.updateTabHeaderControls();
		this.activateTab(filePath);
	}

	/**
	 * Activate a tab, showing its editor and hiding others.
	 * @param fromHistory - If true, skip pushing to history (used by back/forward nav)
	 */
	private activateTab(filePath: string, fromHistory = false): void {
		this.activeTabPath = filePath;

		// Push to navigation history (unless navigating via back/forward)
		if (!fromHistory) {
			// Trim forward history when navigating to a new tab
			if (this.tabHistoryIndex < this.tabHistory.length - 1) {
				this.tabHistory = this.tabHistory.slice(0, this.tabHistoryIndex + 1);
			}
			// Avoid duplicate consecutive entries
			if (this.tabHistory[this.tabHistory.length - 1] !== filePath) {
				this.tabHistory.push(filePath);
			}
			this.tabHistoryIndex = this.tabHistory.length - 1;
		}

		// Hide empty state, show breadcrumb bar
		this.emptyState.style.display = "none";
		this.breadcrumbBar.classList.remove("is-hidden");

		// Update breadcrumb path (show folder / filename)
		const parts = filePath.replace(/\.md$/, "").split("/");
		this.breadcrumbPath.textContent = parts.join(" / ");

		for (const [path, tab] of this.tabs) {
			const isActive = path === filePath;
			tab.tabEl.classList.toggle("is-active", isActive);
			tab.wrapperEl.style.display = isActive ? "" : "none";
			if (isActive) {
				this.updateToggleIcon(tab.mode);
				if (tab.mode === "source") {
					tab.view.focus();
				}
			}
		}
	}

	/**
	 * Close a tab and dispose its editor.
	 */
	closeTab(filePath: string): void {
		const tab = this.tabs.get(filePath);
		if (!tab) return;

		tab.view.destroy();
		tab.tabEl.remove();
		tab.wrapperEl.remove();
		this.tabs.delete(filePath);
		this.updateTabHeaderControls();

		// Activate another tab or show empty state
		if (this.activeTabPath === filePath) {
			const remaining = Array.from(this.tabs.keys());
			if (remaining.length > 0) {
				this.activateTab(remaining[remaining.length - 1]);
			} else {
				this.activeTabPath = null;
				this.emptyState.style.display = "";
				this.breadcrumbBar.classList.add("is-hidden");
			}
		}
	}

	/** Keep header controls in sync with current tab state. */
	private updateTabHeaderControls(): void {
		this.newTabBtn.style.display = this.tabs.size === 0 ? "none" : "";
	}

	/**
	 * Save the currently active tab.
	 */
	private async saveActiveTab(): Promise<void> {
		if (!this.activeTabPath) return;
		const tab = this.tabs.get(this.activeTabPath);
		if (!tab) return;

		const content = tab.view.state.doc.toString();
		try {
			if (this.onSave) {
				await this.onSave(tab.path, content);
			} else {
				const file = this.vault.getAbstractFileByPath(tab.path);
				if (file) {
					await this.vault.modify(file, content);
				}
			}
			tab.originalContent = content;
			tab.dirty = false;
			this.updateTabDirtyState(tab);
		} catch (err) {
			console.error(`[EditorManager] Failed to save ${tab.path}:`, err);
		}
	}

	/**
	 * Update the tab's visual dirty indicator.
	 */
	private updateTabDirtyState(tab: EditorTab): void {
		tab.tabEl.classList.toggle("is-dirty", tab.dirty);
	}

	/**
	 * Toggle the active tab between source and preview mode.
	 */
	private toggleActiveTabMode(): void {
		if (!this.activeTabPath) return;
		const tab = this.tabs.get(this.activeTabPath);
		if (!tab) return;

		const newMode: ViewMode = tab.mode === "source" ? "preview" : "source";
		tab.mode = newMode;
		this.updateToggleIcon(newMode);

		const editorEl = tab.view.dom.parentElement as HTMLElement;

		if (newMode === "preview") {
			const mdContent = tab.view.state.doc.toString();
			tab.previewEl.innerHTML = marked.parse(mdContent) as string;
			editorEl.style.display = "none";
			tab.previewEl.style.display = "";
		} else {
			tab.previewEl.style.display = "none";
			editorEl.style.display = "";
			tab.view.focus();
		}
	}

	/** SVG icon for the current view mode (shows what you'll switch TO) */
	private getViewIcon(currentMode: ViewMode): string {
		if (currentMode === "source") {
			// Currently in source → show "book" icon to switch to reading view
			return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
		}
		// Currently in preview → show "pencil" icon to switch to edit mode
		return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
	}

	/** Update the toggle button icon to reflect current mode. */
	private updateToggleIcon(mode: ViewMode): void {
		this.viewToggleBtn.innerHTML = this.getViewIcon(mode);
		this.viewToggleBtn.setAttribute("aria-label", mode === "source" ? "Switch to reading view" : "Switch to source mode");
	}

	/**
	 * Check if a file is currently open.
	 */
	isFileOpen(filePath: string): boolean {
		return this.tabs.has(filePath);
	}

	/**
	 * Get the currently active file path.
	 */
	getActiveFilePath(): string | null {
		return this.activeTabPath;
	}

	/** Navigate to the previous tab in history. */
	private navigateBack(): void {
		if (this.tabHistoryIndex <= 0) return;
		this.tabHistoryIndex--;
		const path = this.tabHistory[this.tabHistoryIndex];
		if (this.tabs.has(path)) {
			this.activateTab(path, true);
		} else {
			// Tab was closed, skip it
			this.navigateBack();
		}
	}

	/** Navigate to the next tab in history. */
	private navigateForward(): void {
		if (this.tabHistoryIndex >= this.tabHistory.length - 1) return;
		this.tabHistoryIndex++;
		const path = this.tabHistory[this.tabHistoryIndex];
		if (this.tabs.has(path)) {
			this.activateTab(path, true);
		} else {
			this.navigateForward();
		}
	}

	/** Show a dropdown menu listing all open tabs, with a checkmark on the active one. */
	private showTabListMenu(anchor: HTMLElement, e: MouseEvent): void {
		e.stopPropagation();
		this.dismissMenu();

		const menu = document.createElement("div");
		menu.className = "menu ws-tab-list-menu";
		document.body.appendChild(menu);

		// "Stack tabs" option
		const stackItem = document.createElement("div");
		stackItem.className = "menu-item";
		stackItem.innerHTML = `<span class="menu-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg></span><span>Stack tabs</span>`;
		menu.appendChild(stackItem);

		// "Close all" option
		const closeAllItem = document.createElement("div");
		closeAllItem.className = "menu-item";
		closeAllItem.innerHTML = `<span class="menu-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span><span>Close all</span>`;
		closeAllItem.addEventListener("click", () => {
			this.dismissMenu();
			const paths = Array.from(this.tabs.keys());
			for (const p of paths) this.closeTab(p);
		});
		menu.appendChild(closeAllItem);

		// Separator
		const sep = document.createElement("div");
		sep.className = "menu-separator";
		menu.appendChild(sep);

		// List of open tabs
		for (const [path, tab] of this.tabs) {
			const item = document.createElement("div");
			item.className = "menu-item";
			const isActive = path === this.activeTabPath;
			const check = document.createElement("span");
			check.className = "menu-item-check";
			check.innerHTML = isActive
				? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
				: "";
			item.appendChild(check);
			const title = document.createElement("span");
			title.className = "menu-item-title";
			title.textContent = tab.name;
			item.appendChild(title);
			item.addEventListener("click", () => {
				this.dismissMenu();
				this.activateTab(path);
			});
			menu.appendChild(item);
		}

		// Position below the anchor
		const rect = anchor.getBoundingClientRect();
		menu.style.top = `${rect.bottom + 4}px`;
		menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;

		// Click outside to dismiss
		const dismiss = (ev: MouseEvent) => {
			if (!menu.contains(ev.target as Node)) {
				this.dismissMenu();
			}
		};
		setTimeout(() => document.addEventListener("click", dismiss), 0);
		this.activeMenu = menu;
		this.activeMenuCleanup = () => document.removeEventListener("click", dismiss);
	}

	/** Dismiss the active dropdown menu. */
	private dismissMenu(): void {
		if (this.activeMenu) {
			this.activeMenu.remove();
			this.activeMenu = null;
		}
		if (this.activeMenuCleanup) {
			this.activeMenuCleanup();
			this.activeMenuCleanup = null;
		}
	}

	/** Icon for right sidebar toggle button. */
	private getRightSidebarIcon(collapsed: boolean): string {
		if (collapsed) {
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="15" y="3" width="6" height="18" rx="0"/></svg>`;
		}
		return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`;
	}

	/** Ensure a dedicated titlebar button exists for reopening the right sidebar when collapsed. */
	private ensureTitlebarRightSidebarButton(): void {
		if (this.titlebarRightSidebarBtn) return;
		const btn = document.createElement("button");
		btn.className = "ws-titlebar-right-sidebar-btn";
		btn.setAttribute("aria-label", "Right sidebar");
		btn.title = "Right sidebar";
		btn.style.display = "none";
		btn.innerHTML = this.getRightSidebarIcon(true);
		btn.addEventListener("click", () => this.toggleRightSidebar());
		btn.addEventListener("contextmenu", (e) => this.showRightSidebarContextMenu(btn, e));
		document.body.appendChild(btn);
		this.titlebarRightSidebarBtn = btn;
	}

	/** Show a simple context menu for the titlebar sidebar toggle. */
	private showRightSidebarContextMenu(anchor: HTMLElement, e: MouseEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this.dismissMenu();

		const menu = document.createElement("div");
		menu.className = "menu ws-tab-list-menu";
		document.body.appendChild(menu);

		const item = document.createElement("div");
		item.className = "menu-item";
		const collapsed = this.isRightSidebarCollapsed();
		item.innerHTML = `<span class="menu-item-icon">${this.getRightSidebarIcon(collapsed)}</span><span class="menu-item-title">${collapsed ? "Show right sidebar" : "Collapse right sidebar"}</span>`;
		item.addEventListener("click", () => {
			this.dismissMenu();
			this.toggleRightSidebar();
		});
		menu.appendChild(item);

		const rect = anchor.getBoundingClientRect();
		menu.style.top = `${rect.bottom + 6}px`;
		menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;

		const dismiss = (ev: MouseEvent) => {
			if (!menu.contains(ev.target as Node)) {
				this.dismissMenu();
			}
		};
		setTimeout(() => document.addEventListener("click", dismiss), 0);
		this.activeMenu = menu;
		this.activeMenuCleanup = () => document.removeEventListener("click", dismiss);
	}

	/** Sync icon/placement of sidebar toggle controls based on collapsed state. */
	private updateRightSidebarToggleUI(collapsed: boolean): void {
		this.splitBtn.innerHTML = this.getRightSidebarIcon(collapsed);
		this.splitBtn.setAttribute("aria-label", collapsed ? "Show right sidebar" : "Collapse right sidebar");
		if (this.titlebarRightSidebarBtn) {
			this.titlebarRightSidebarBtn.innerHTML = this.getRightSidebarIcon(collapsed);
			this.titlebarRightSidebarBtn.style.display = collapsed ? "flex" : "none";
		}
		this.splitBtn.style.display = "";
	}

	/** Bind right-pane close icon (if present) to the same toggle flow. */
	private bindExternalRightSidebarControls(): void {
		const closeBtn = document.querySelector<HTMLElement>(".ws-right-close");
		if (!closeBtn || closeBtn.dataset.wsRightSidebarBound === "true") return;
		closeBtn.dataset.wsRightSidebarBound = "true";
		closeBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleRightSidebar();
		});
		closeBtn.addEventListener("contextmenu", (e) => this.showRightSidebarContextMenu(closeBtn, e));
	}

	/** Determine whether right sidebar is currently collapsed. */
	private isRightSidebarCollapsed(): boolean {
		const rightSplit = document.querySelector<HTMLElement>(".workspace-split.mod-right-split");
		if (!rightSplit) return false;
		const computed = getComputedStyle(rightSplit);
		const hiddenByDisplay = rightSplit.style.display === "none" || computed.display === "none";
		const hiddenByVisibility = computed.visibility === "hidden";
		const hiddenByClass = rightSplit.classList.contains("is-collapsed")
			|| rightSplit.classList.contains("mod-collapsed")
			|| rightSplit.classList.contains("is-hidden");
		const hiddenBySize = rightSplit.getBoundingClientRect().width < 8;
		return hiddenByDisplay || hiddenByVisibility || hiddenByClass || hiddenBySize;
	}

	/** Observe right sidebar display changes from any source and keep toggle UI in sync. */
	private watchRightSidebarState(): void {
		const rightSplit = document.querySelector<HTMLElement>(".workspace-split.mod-right-split");
		if (!rightSplit) return;
		this.rightSidebarObserver?.disconnect();
		this.rightSidebarObserver = new MutationObserver(() => {
			this.updateRightSidebarToggleUI(this.isRightSidebarCollapsed());
		});
		this.rightSidebarObserver.observe(rightSplit, { attributes: true, attributeFilter: ["style", "class"] });
		this.updateRightSidebarToggleUI(this.isRightSidebarCollapsed());
	}

	/** Toggle the right sidebar visibility. */
	private toggleRightSidebar(): void {
		const rightSplit = document.querySelector<HTMLElement>(".workspace-split.mod-right-split");
		const rightResizer = document.querySelector<HTMLElement>('.workspace-resizer[data-resize="right"]');
		if (!rightSplit) return;

		const isHidden = this.isRightSidebarCollapsed();
		if (isHidden) {
			rightSplit.classList.remove("is-collapsed", "mod-collapsed", "is-hidden");
			rightSplit.style.display = "";
			rightSplit.style.visibility = "";
			if (rightSplit.getBoundingClientRect().width < 8) {
				rightSplit.style.width = rightSplit.dataset.wsSavedWidth || "420px";
			}
			if (rightResizer) rightResizer.style.display = "";
			this.updateRightSidebarToggleUI(false);
		} else {
			const currentWidth = rightSplit.getBoundingClientRect().width;
			if (currentWidth > 20) {
				rightSplit.dataset.wsSavedWidth = `${Math.round(currentWidth)}px`;
			}
			rightSplit.style.display = "none";
			if (rightResizer) rightResizer.style.display = "none";
			this.updateRightSidebarToggleUI(true);
		}
	}
}
