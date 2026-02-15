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
import type { LayoutManager } from "../layout/LayoutManager.js";

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
/** Serialized tab state for cross-pane transfer */
export interface TabState {
	path: string;
	name: string;
	content: string;
	dirty: boolean;
	originalContent: string;
	mode: ViewMode;
}

export class EditorManager {
	private container: HTMLElement;
	private tabBar: HTMLElement;
	private newTabBtn: HTMLElement;
	private splitBtn!: HTMLButtonElement;
	/** Kebab button in tab header for split/pane actions (wired by PaneManager) */
	paneMenuBtn!: HTMLButtonElement;
	/** Pane ID for drag-and-drop identification */
	paneId = "";
	/** LayoutManager reference for sidebar toggle delegation */
	private layoutManager: LayoutManager | null = null;
	private breadcrumbBar: HTMLElement;
	private breadcrumbPath: HTMLElement;
	private viewToggleBtn!: HTMLButtonElement;
	private editorContainer: HTMLElement;
	private emptyState: HTMLElement;
	private blankTabs: Map<string, HTMLElement> = new Map();
	private blankTabCounter = 0;
	private activeBlankTabId: string | null = null;
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
	private onCloseLastTabRequested: (() => void) | null = null;
	private paneMenuClickHandler: ((e: MouseEvent) => void) | null = null;

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
		this.newTabBtn.addEventListener("click", () => this.addBlankTab());
		this.tabBar.appendChild(this.newTabBtn);

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
		this.splitBtn.addEventListener("click", () => {
			if (this.layoutManager) this.layoutManager.toggleRight();
		});

		// Kebab menu button for split/pane actions (wired by PaneManager)
		this.paneMenuBtn = document.createElement("button");
		this.paneMenuBtn.className = "ws-pane-menu-btn";
		this.paneMenuBtn.setAttribute("aria-label", "More options");
		this.paneMenuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
		this.paneMenuBtn.addEventListener("click", (e) => this.handlePaneMenuClick(e));

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
		breadcrumbActions.appendChild(this.paneMenuBtn);

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

		// Create initial blank tab (must be after emptyState + breadcrumbBar are ready)
		this.addBlankTab();

		this.updateTabHeaderControls();
	}

	/** Append a tab element immediately before the new-tab button. */
	private insertTabBeforeNewButton(tabEl: HTMLElement): void {
		this.tabBar.insertBefore(tabEl, this.newTabBtn);
	}

	/** Set callback invoked when user attempts to close the final tab in this pane. */
	setCloseLastTabHandler(handler: () => void): void {
		this.onCloseLastTabRequested = handler;
	}

	/** Allow host containers (PaneManager) to override pane-menu button behavior. */
	setPaneMenuHandler(handler: ((e: MouseEvent) => void) | null): void {
		this.paneMenuClickHandler = handler;
	}

	/** Total number of visible tabs (file + blank) in this pane. */
	private getTabCount(): number {
		return this.tabs.size + this.blankTabs.size;
	}

	/** Handle pane-menu button clicks with standalone fallback behavior. */
	private handlePaneMenuClick(e: MouseEvent): void {
		e.stopPropagation();
		if (this.paneMenuClickHandler) {
			this.paneMenuClickHandler(e);
			return;
		}
		if (this.activeTabPath) {
			this.showTabContextMenu(this.paneMenuBtn, this.activeTabPath, e);
			return;
		}
		this.showTabListMenu(this.paneMenuBtn, e);
	}

	/** Request closure of the last tab, with detached-window fallback. */
	private requestCloseLastTab(): void {
		if (this.onCloseLastTabRequested) {
			this.onCloseLastTabRequested();
			return;
		}
		if (this.isDetachedFileTabView()) {
			window.close();
		}
	}

	/** Returns true when running in detached file-tab view window mode. */
	private isDetachedFileTabView(): boolean {
		return new URLSearchParams(window.location.search).get("view") === "ws-file-tab-view";
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

		// If the active tab is a blank tab, remove it (file will replace it)
		if (this.activeBlankTabId) {
			this.removeBlankTab(this.activeBlankTabId, false);
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
		tabEl.draggable = true;
		const tabName = filePath.split("/").pop()?.replace(/\.md$/, "") || filePath;

		const nameSpan = document.createElement("span");
		nameSpan.className = "ws-tab-name";
		nameSpan.textContent = tabName;
		tabEl.appendChild(nameSpan);

		const closeBtn = document.createElement("span");
		closeBtn.className = "ws-tab-close";
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		tabEl.appendChild(closeBtn);
		let dragStartClientX = 0;
		let dragStartClientY = 0;
		let poppedOutAtEdge = false;
		const handleDragAtEdge = (ev: DragEvent) => {
			if (poppedOutAtEdge) return;
			if (this.isDetachedFileTabView()) return;
			const atEdge = ev.clientX <= 0
				|| ev.clientY <= 0
				|| ev.clientX >= window.innerWidth - 1
				|| ev.clientY >= window.innerHeight - 1;
			if (!atEdge) return;
			poppedOutAtEdge = true;
			tabEl.classList.remove("is-dragging");
			tabEl.removeEventListener("drag", handleDragAtEdge);
			void this.popOutFileTab(filePath);
		};

		// Tab drag-and-drop
		tabEl.addEventListener("dragstart", (e) => {
			if (e.dataTransfer) {
				poppedOutAtEdge = false;
				dragStartClientX = e.clientX;
				dragStartClientY = e.clientY;
				e.dataTransfer.setData("text/x-pane-tab", JSON.stringify({ fromPaneId: this.paneId, filePath }));
				e.dataTransfer.effectAllowed = "copyMove";
				tabEl.classList.add("is-dragging");
				tabEl.addEventListener("drag", handleDragAtEdge);
			}
		});
		tabEl.addEventListener("dragend", (e: DragEvent) => {
			tabEl.classList.remove("is-dragging");
			tabEl.removeEventListener("drag", handleDragAtEdge);
			if (poppedOutAtEdge) return;
			const wasHandledDrop = e.dataTransfer?.dropEffect === "move";
			if (wasHandledDrop && this.isDetachedFileTabView()) {
				const shouldCloseWindow = this.tabs.size <= 1;
				if (this.tabs.has(filePath)) this.closeTab(filePath);
				if (shouldCloseWindow) window.close();
				return;
			}
			const dx = Math.abs(e.clientX - dragStartClientX);
			const dy = Math.abs(e.clientY - dragStartClientY);
			const wasDragged = Math.max(dx, dy) > 12;
			if (!wasHandledDrop && wasDragged) {
				if (this.isDetachedFileTabView()) {
					void this.dockFileToMain(filePath);
				} else {
					void this.popOutFileTab(filePath);
				}
			}
		});

		tabEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showTabContextMenu(tabEl, filePath, e);
		});

		// Tab click → activate
		tabEl.addEventListener("click", (e) => {
			if (!(e.target as HTMLElement).closest(".ws-tab-close")) {
				this.activateTab(filePath);
			}
		});

		// Close button
		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.getTabCount() <= 1) {
				this.requestCloseLastTab();
				return;
			}
			this.closeTab(filePath);
		});

		this.insertTabBeforeNewButton(tabEl);

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
		this.activeBlankTabId = null;

		// Deactivate all blank tabs
		for (const [, bEl] of this.blankTabs) {
			bEl.classList.remove("is-active");
		}

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
				// Activate a blank tab, or create one
				const blankIds = Array.from(this.blankTabs.keys());
				if (blankIds.length > 0) {
					this.activateBlankTab(blankIds[blankIds.length - 1]);
				} else {
					this.addBlankTab();
				}
			}
		}
	}

	/** Add a blank "New tab" tab to the tab bar. */
	private addBlankTab(): void {
		const id = `blank-${++this.blankTabCounter}`;
		const tabEl = document.createElement("div");
		tabEl.className = "ws-tab";
		tabEl.draggable = true;

		const nameSpan = document.createElement("span");
		nameSpan.className = "ws-tab-name";
		nameSpan.textContent = "New tab";
		tabEl.appendChild(nameSpan);

		const closeBtn = document.createElement("span");
		closeBtn.className = "ws-tab-close";
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		tabEl.appendChild(closeBtn);
		let dragStartClientX = 0;
		let dragStartClientY = 0;

		tabEl.addEventListener("click", (e) => {
			if (!(e.target as HTMLElement).closest(".ws-tab-close")) {
				this.activateBlankTab(id);
			}
		});

		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.getTabCount() <= 1) {
				this.requestCloseLastTab();
				return;
			}
			this.removeBlankTab(id);
		});

		tabEl.addEventListener("dragstart", (e) => {
			if (e.dataTransfer) {
				e.dataTransfer.setData("text/x-pane-tab", JSON.stringify({ fromPaneId: this.paneId, blankTabId: id }));
				e.dataTransfer.effectAllowed = "move";
				tabEl.classList.add("is-dragging");
			}
		});
		tabEl.addEventListener("dragend", (e: DragEvent) => {
			tabEl.classList.remove("is-dragging");
		});

		this.insertTabBeforeNewButton(tabEl);
		this.blankTabs.set(id, tabEl);
		this.activateBlankTab(id);
	}

	/** Activate a blank tab, deactivating any file tab. */
	private activateBlankTab(id: string): void {
		this.activeTabPath = null;
		this.activeBlankTabId = id;

		// Deactivate all file tabs
		for (const [, tab] of this.tabs) {
			tab.tabEl.classList.remove("is-active");
			tab.wrapperEl.style.display = "none";
		}

		// Deactivate all blank tabs, activate this one
		for (const [bId, bEl] of this.blankTabs) {
			bEl.classList.toggle("is-active", bId === id);
		}

		// Show empty state
		this.emptyState.style.display = "";
		this.breadcrumbBar.classList.add("is-hidden");
	}

	/** Returns true when a blank "New tab" is currently active. */
	isBlankTabActive(): boolean {
		return this.activeBlankTabId !== null;
	}

	/** Add and activate a blank tab (for cross-pane tab moves). */
	createBlankTab(): void {
		const existingBlankIds = Array.from(this.blankTabs.keys());
		if (existingBlankIds.length > 0) {
			this.activateBlankTab(existingBlankIds[existingBlankIds.length - 1]);
			return;
		}
		this.addBlankTab();
	}

	/** Remove a blank tab without forcing replacement (for cross-pane moves). */
	removeBlankTabForTransfer(blankTabId: string): boolean {
		if (!this.blankTabs.has(blankTabId)) return false;
		this.removeBlankTab(blankTabId, false);
		return true;
	}

	/** Remove a blank tab. If it was active, activate another tab. */
	private removeBlankTab(id: string, ensureReplacement = true): void {
		const el = this.blankTabs.get(id);
		if (!el) return;
		el.remove();
		this.blankTabs.delete(id);

		if (this.activeBlankTabId === id) {
			this.activeBlankTabId = null;
			// Activate another blank tab, or last file tab, or show empty state
			const remainingBlank = Array.from(this.blankTabs.keys());
			if (remainingBlank.length > 0) {
				this.activateBlankTab(remainingBlank[remainingBlank.length - 1]);
			} else {
				const remaining = Array.from(this.tabs.keys());
				if (remaining.length > 0) {
					this.activateTab(remaining[remaining.length - 1]);
				} else if (ensureReplacement) {
					// No tabs at all — create a new blank tab
					this.addBlankTab();
				}
			}
		}
	}

	/** Keep header controls in sync with current tab state. */
	private updateTabHeaderControls(): void {
		// Hide all blank tabs when file tabs exist and a file is active
		// (blank tabs remain accessible in the tab bar)
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

	/** Get file paths of all open tabs in order. */
	getOpenTabPaths(): string[] {
		return Array.from(this.tabs.keys());
	}

	/**
	 * Export a tab's state and close it locally. Used for cross-pane tab moves.
	 */
	exportTab(filePath: string): TabState | null {
		const tab = this.tabs.get(filePath);
		if (!tab) return null;

		const state: TabState = {
			path: tab.path,
			name: tab.name,
			content: tab.view.state.doc.toString(),
			dirty: tab.dirty,
			originalContent: tab.originalContent,
			mode: tab.mode,
		};

		this.closeTab(filePath);
		return state;
	}

	/**
	 * Import a tab from a serialized state (without reading from vault).
	 */
	async importTab(state: TabState): Promise<void> {
		// If already open, just activate
		if (this.tabs.has(state.path)) {
			this.activateTab(state.path);
			return;
		}

		// Remove active blank tab
		if (this.activeBlankTabId) {
			this.removeBlankTab(this.activeBlankTabId, false);
		}

		// Create tab header
		const tabEl = document.createElement("div");
		tabEl.className = "ws-tab";
		tabEl.draggable = true;

		const nameSpan = document.createElement("span");
		nameSpan.className = "ws-tab-name";
		nameSpan.textContent = state.name;
		tabEl.appendChild(nameSpan);

		const closeBtn = document.createElement("span");
		closeBtn.className = "ws-tab-close";
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		tabEl.appendChild(closeBtn);

		const filePath = state.path;
		let dragStartClientX = 0;
		let dragStartClientY = 0;
		let poppedOutAtEdge = false;
		const handleDragAtEdge = (ev: DragEvent) => {
			if (poppedOutAtEdge) return;
			if (this.isDetachedFileTabView()) return;
			const atEdge = ev.clientX <= 0
				|| ev.clientY <= 0
				|| ev.clientX >= window.innerWidth - 1
				|| ev.clientY >= window.innerHeight - 1;
			if (!atEdge) return;
			poppedOutAtEdge = true;
			tabEl.classList.remove("is-dragging");
			tabEl.removeEventListener("drag", handleDragAtEdge);
			void this.popOutFileTab(filePath);
		};

		// Tab drag-and-drop
		tabEl.addEventListener("dragstart", (e) => {
			if (e.dataTransfer) {
				poppedOutAtEdge = false;
				dragStartClientX = e.clientX;
				dragStartClientY = e.clientY;
				e.dataTransfer.setData("text/x-pane-tab", JSON.stringify({ fromPaneId: this.paneId, filePath }));
				e.dataTransfer.effectAllowed = "copyMove";
				tabEl.classList.add("is-dragging");
				tabEl.addEventListener("drag", handleDragAtEdge);
			}
		});
		tabEl.addEventListener("dragend", (e: DragEvent) => {
			tabEl.classList.remove("is-dragging");
			tabEl.removeEventListener("drag", handleDragAtEdge);
			if (poppedOutAtEdge) return;
			const wasHandledDrop = e.dataTransfer?.dropEffect === "move";
			if (wasHandledDrop && this.isDetachedFileTabView()) {
				const shouldCloseWindow = this.tabs.size <= 1;
				if (this.tabs.has(filePath)) this.closeTab(filePath);
				if (shouldCloseWindow) window.close();
				return;
			}
			const dx = Math.abs(e.clientX - dragStartClientX);
			const dy = Math.abs(e.clientY - dragStartClientY);
			const wasDragged = Math.max(dx, dy) > 12;
			if (!wasHandledDrop && wasDragged) {
				if (this.isDetachedFileTabView()) {
					void this.dockFileToMain(filePath);
				} else {
					void this.popOutFileTab(filePath);
				}
			}
		});

		tabEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showTabContextMenu(tabEl, filePath, e);
		});

		tabEl.addEventListener("click", (e) => {
			if (!(e.target as HTMLElement).closest(".ws-tab-close")) {
				this.activateTab(filePath);
			}
		});

		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.getTabCount() <= 1) {
				this.requestCloseLastTab();
				return;
			}
			this.closeTab(filePath);
		});

		this.insertTabBeforeNewButton(tabEl);

		// Create wrapper
		const wrapperEl = document.createElement("div");
		wrapperEl.className = "ws-editor-wrapper";
		this.editorContainer.appendChild(wrapperEl);

		const editorEl = document.createElement("div");
		editorEl.className = "ws-editor-view";
		wrapperEl.appendChild(editorEl);

		const previewEl = document.createElement("div");
		previewEl.className = "ws-preview-view markdown-rendered";
		previewEl.style.display = "none";
		wrapperEl.appendChild(previewEl);

		const self = this;
		const editorState = EditorState.create({
			doc: state.content,
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
						run: () => { self.saveActiveTab(); return true; },
					},
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
					"&": { height: "100%", fontSize: "var(--font-text-size, 16px)" },
					".cm-content": { fontFamily: "var(--font-text, -apple-system, BlinkMacSystemFont, sans-serif)", padding: "16px 0" },
					".cm-line": { padding: "0 24px" },
					".cm-gutters": { background: "transparent", border: "none", color: "var(--text-faint)" },
					".cm-activeLineGutter": { background: "transparent" },
					"&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--text-selection) !important" },
				}),
			],
		});

		const view = new EditorView({ state: editorState, parent: editorEl });

		const tab: EditorTab = {
			path: state.path,
			name: state.name,
			view,
			tabEl,
			dirty: state.dirty,
			originalContent: state.originalContent,
			mode: state.mode,
			wrapperEl,
			previewEl,
		};

		if (state.dirty) this.updateTabDirtyState(tab);

		this.tabs.set(state.path, tab);
		this.updateTabHeaderControls();
		this.activateTab(state.path);
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
			for (const p of paths) {
				if (this.getTabCount() <= 1) {
					this.requestCloseLastTab();
					break;
				}
				this.closeTab(p);
			}
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

	/** Pop out a file tab to a separate window (Electron only). */
	private async popOutFileTab(filePath: string): Promise<void> {
		if (!window.electronAPI?.openWindow) return;
		const tab = this.tabs.get(filePath);
		if (!tab) return;
		try {
			await window.electronAPI.openWindow("ws-file-tab-view", {
				title: tab.name || "Vault Copilot",
				width: 1000,
				height: 760,
				query: { openFile: filePath },
			});
			this.closeTab(filePath);
		} catch (err) {
			console.error("[EditorManager] Failed to pop out tab:", err);
		}
	}

	/** Dock a file tab from detached window back into the main window. */
	private async dockFileToMain(filePath: string): Promise<void> {
		if (!window.electronAPI?.dockTab) return;
		const shouldCloseWindow = this.isDetachedFileTabView() && this.tabs.size <= 1;
		const result = await window.electronAPI.dockTab(filePath);
		if (!result?.ok) return;
		if (this.tabs.has(filePath)) this.closeTab(filePath);
		if (shouldCloseWindow) window.close();
	}

	/** Get the current active tab mode when a file tab is active. */
	getActiveTabMode(): ViewMode | null {
		if (!this.activeTabPath) return null;
		const tab = this.tabs.get(this.activeTabPath);
		return tab?.mode ?? null;
	}

	/** Set active tab mode (source/preview) when a file tab is active. */
	setActiveTabMode(mode: ViewMode): void {
		const current = this.getActiveTabMode();
		if (!current || current === mode) return;
		this.toggleActiveTabMode();
	}

	/** Pop out the active file tab into a separate window. */
	async popOutActiveTab(): Promise<void> {
		if (!this.activeTabPath) return;
		await this.popOutFileTab(this.activeTabPath);
	}

	/** Show context menu for a file tab. */
	private showTabContextMenu(anchor: HTMLElement, filePath: string, e: MouseEvent): void {
		e.stopPropagation();
		this.dismissMenu();

		const menu = document.createElement("div");
		menu.className = "menu ws-tab-list-menu";
		document.body.appendChild(menu);

		if (window.electronAPI?.openWindow) {
			const item = document.createElement("div");
			item.className = "menu-item";
			item.innerHTML = `<span class="menu-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg></span><span>Open in new window</span>`;
			item.addEventListener("click", async () => {
				this.dismissMenu();
				await this.popOutFileTab(filePath);
			});
			menu.appendChild(item);

			if (window.electronAPI?.dockTab && this.isDetachedFileTabView()) {
				const dockItem = document.createElement("div");
				dockItem.className = "menu-item";
				dockItem.innerHTML = `<span class="menu-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 4 4 8 8 12"/><path d="M4 8h10a4 4 0 1 1 0 8h-1"/></svg></span><span>Dock to main window</span>`;
				dockItem.addEventListener("click", async () => {
					this.dismissMenu();
					await this.dockFileToMain(filePath);
				});
				menu.appendChild(dockItem);
			}
		}

		const rect = anchor.getBoundingClientRect();
		menu.style.top = `${rect.bottom + 4}px`;
		menu.style.left = `${rect.left}px`;

		const dismiss = (ev: MouseEvent) => {
			if (!menu.contains(ev.target as Node)) {
				this.dismissMenu();
			}
		};
		setTimeout(() => document.addEventListener("click", dismiss), 0);
		this.activeMenu = menu;
		this.activeMenuCleanup = () => document.removeEventListener("click", dismiss);
	}

	/** Connect to the LayoutManager for sidebar toggle delegation. */
	setLayoutManager(lm: LayoutManager): void {
		this.layoutManager = lm;
		// Keep split button icon in sync with layout state changes
		lm.addStateChangeListener(() => {
			const collapsed = lm.isRightCollapsed;
			this.splitBtn.innerHTML = this.getRightSidebarIcon(collapsed);
			this.splitBtn.setAttribute("aria-label", collapsed ? "Show right sidebar" : "Collapse right sidebar");
		});
	}

	/** Icon for right sidebar toggle button. */
	private getRightSidebarIcon(collapsed: boolean): string {
		if (collapsed) {
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="11 8 16 12 11 16"/></svg>`;
		}
		return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="13 8 8 12 13 16"/></svg>`;
	}
}
