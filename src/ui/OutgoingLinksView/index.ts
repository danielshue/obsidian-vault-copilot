/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module OutgoingLinksView
 * @description Obsidian right-panel view that shows outgoing links from the active note.
 *
 * Displays:
 * - **Links** — resolved `[[WikiLinks]]` that point to existing notes in the vault
 * - **Unresolved links** — `[[WikiLinks]]` that reference notes not yet created,
 *   shown as potential links the user might want to create
 *
 * The view updates automatically whenever the active leaf changes or the
 * metadata cache is invalidated.
 *
 * @example Registering in main.ts
 * ```typescript
 * import { OutgoingLinksView, OUTGOING_LINKS_VIEW_TYPE } from './ui/OutgoingLinksView';
 * this.registerView(OUTGOING_LINKS_VIEW_TYPE, leaf => new OutgoingLinksView(leaf, this.app));
 * ```
 *
 * @since 0.1.0
 */

import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type { App } from "obsidian";
import { getOutgoingLinks } from "../../copilot/tools/VaultOperations";

/** Registered view type for the Outgoing Links panel. */
export const OUTGOING_LINKS_VIEW_TYPE = "vault-copilot-outgoing-links";

/**
 * Right-panel view that shows all outgoing links from the currently active note,
 * split into "Links" (resolved) and "Unlinked" (potential) sections.
 */
export class OutgoingLinksView extends ItemView {
	private readonly pluginApp: App;
	/** Cleanup functions for registered event listeners. */
	private cleanupListeners: Array<() => void> = [];

	/**
	 * @param leaf - The workspace leaf that hosts this view
	 * @param app  - The Obsidian App instance
	 */
	constructor(leaf: WorkspaceLeaf, app: App) {
		super(leaf);
		this.pluginApp = app;
	}

	getViewType(): string {
		return OUTGOING_LINKS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Outgoing Links";
	}

	getIcon(): string {
		return "links-going-out";
	}

	async onOpen(): Promise<void> {
		this.renderPlaceholder("Open a note to see its outgoing links.");

		// Update on active-file change
		const onActiveLeafChange = () => { void this.refresh(); };
		this.pluginApp.workspace.on("active-leaf-change", onActiveLeafChange);
		this.cleanupListeners.push(() =>
			this.pluginApp.workspace.off("active-leaf-change", onActiveLeafChange),
		);

		// Update on metadata cache change
		const onMetadataChanged = (_file: TFile) => { void this.refresh(); };
		this.pluginApp.metadataCache.on("changed", onMetadataChanged);
		this.cleanupListeners.push(() =>
			this.pluginApp.metadataCache.off("changed", onMetadataChanged),
		);

		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.cleanupListeners.forEach(fn => fn());
		this.cleanupListeners = [];
	}

	/**
	 * Re-query outgoing links for the active note and re-render the panel.
	 * @internal
	 */
	private async refresh(): Promise<void> {
		const activeFile = this.pluginApp.workspace.getActiveFile();
		if (!activeFile) {
			this.renderPlaceholder("Open a note to see its outgoing links.");
			return;
		}

		const result = await getOutgoingLinks(this.pluginApp, activeFile.path);
		if (!result.success) {
			this.renderError(result.error ?? "Failed to load outgoing links.");
			return;
		}

		this.renderResults(
			activeFile,
			result.resolvedLinks ?? [],
			result.unresolvedLinks ?? [],
		);
	}

	// ── Rendering ─────────────────────────────────────────────────────────────

	private renderPlaceholder(message: string): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		const placeholder = container.createDiv({ cls: "vc-outgoing-links-placeholder" });
		placeholder.createSpan({ text: message, cls: "vc-outgoing-links-placeholder-text" });
	}

	private renderError(message: string): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.createDiv({ cls: "vc-outgoing-links-error", text: message });
	}

	private renderResults(
		sourceFile: TFile,
		resolvedLinks: Array<{ targetPath: string; count: number }>,
		unresolvedLinks: Array<{ linkText: string; count: number }>,
	): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		// ── Header ──────────────────────────────────────────────────────────
		const header = container.createDiv({ cls: "vc-outgoing-links-header" });
		header.createSpan({ cls: "vc-outgoing-links-title", text: sourceFile.basename });
		const totalCount = resolvedLinks.length + unresolvedLinks.length;
		header.createSpan({
			cls: "vc-outgoing-links-count",
			text: `${totalCount} link${totalCount !== 1 ? "s" : ""}`,
		});

		// ── Resolved links ───────────────────────────────────────────────────
		this.renderLinksSection(container, "Links", resolvedLinks.length, resolvedLinks);

		// ── Unresolved links ─────────────────────────────────────────────────
		this.renderUnresolvedSection(container, "Unlinked", unresolvedLinks.length, unresolvedLinks);

		// Empty state
		if (totalCount === 0) {
			const empty = container.createDiv({ cls: "vc-outgoing-links-empty" });
			empty.createSpan({ text: `No outgoing links found in "${sourceFile.basename}".` });
		}
	}

	/**
	 * Render a section of resolved outgoing links.
	 * @internal
	 */
	private renderLinksSection(
		container: HTMLElement,
		title: string,
		count: number,
		entries: Array<{ targetPath: string; count: number }>,
	): void {
		const section = container.createDiv({ cls: "vc-outgoing-links-section" });
		const sectionHeader = section.createDiv({ cls: "vc-outgoing-links-section-header" });

		let collapsed = false;
		const toggleIcon = sectionHeader.createSpan({ cls: "vc-outgoing-links-toggle", text: "▾" });
		sectionHeader.createSpan({ cls: "vc-outgoing-links-section-title", text: title });
		sectionHeader.createSpan({
			cls: "vc-outgoing-links-section-count",
			text: `(${count})`,
		});

		const list = section.createDiv({ cls: "vc-outgoing-links-list" });

		sectionHeader.addEventListener("click", () => {
			collapsed = !collapsed;
			list.toggleClass("vc-outgoing-links-list-collapsed", collapsed);
			toggleIcon.textContent = collapsed ? "▸" : "▾";
		});

		if (entries.length === 0) {
			list.createDiv({ cls: "vc-outgoing-links-empty-section", text: "None" });
			return;
		}

		for (const entry of entries) {
			const item = list.createDiv({ cls: "vc-outgoing-links-item" });
			const displayName = entry.targetPath.replace(/\.md$/, "");
			const link = item.createEl("a", {
				cls: "vc-outgoing-links-link",
				text: displayName,
			});

			link.addEventListener("click", async (e) => {
				e.preventDefault();
				const file = this.pluginApp.vault.getAbstractFileByPath(entry.targetPath);
				if (file instanceof TFile) {
					await this.pluginApp.workspace.getLeaf().openFile(file);
				}
			});

			if (entry.count > 1) {
				item.createSpan({
					cls: "vc-outgoing-links-link-count",
					text: `×${entry.count}`,
				});
			}
		}
	}

	/**
	 * Render a section of unresolved (potential) outgoing links.
	 * @internal
	 */
	private renderUnresolvedSection(
		container: HTMLElement,
		title: string,
		count: number,
		entries: Array<{ linkText: string; count: number }>,
	): void {
		const section = container.createDiv({ cls: "vc-outgoing-links-section" });
		const sectionHeader = section.createDiv({ cls: "vc-outgoing-links-section-header" });

		let collapsed = false;
		const toggleIcon = sectionHeader.createSpan({ cls: "vc-outgoing-links-toggle", text: "▾" });
		sectionHeader.createSpan({ cls: "vc-outgoing-links-section-title", text: title });
		sectionHeader.createSpan({
			cls: "vc-outgoing-links-section-count",
			text: `(${count})`,
		});

		const list = section.createDiv({ cls: "vc-outgoing-links-list" });

		sectionHeader.addEventListener("click", () => {
			collapsed = !collapsed;
			list.toggleClass("vc-outgoing-links-list-collapsed", collapsed);
			toggleIcon.textContent = collapsed ? "▸" : "▾";
		});

		if (entries.length === 0) {
			list.createDiv({ cls: "vc-outgoing-links-empty-section", text: "None" });
			return;
		}

		for (const entry of entries) {
			const item = list.createDiv({ cls: "vc-outgoing-links-item vc-outgoing-links-item-unresolved" });
			item.createSpan({ cls: "vc-outgoing-links-link-text", text: entry.linkText });

			if (entry.count > 1) {
				item.createSpan({
					cls: "vc-outgoing-links-link-count",
					text: `×${entry.count}`,
				});
			}

			// "Create note" action
			const createBtn = item.createEl("button", {
				cls: "vc-outgoing-links-create-btn",
				text: "Create",
				attr: { "aria-label": `Create note: ${entry.linkText}` },
			});
			createBtn.addEventListener("click", async () => {
				const path = `${entry.linkText}.md`;
				const existing = this.pluginApp.vault.getAbstractFileByPath(path);
				if (!existing) {
					const newFile = await this.pluginApp.vault.create(path, "");
					await this.pluginApp.workspace.getLeaf().openFile(newFile);
				} else if (existing instanceof TFile) {
					await this.pluginApp.workspace.getLeaf().openFile(existing);
				}
			});
		}
	}
}
