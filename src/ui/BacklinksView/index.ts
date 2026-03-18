/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BacklinksView
 * @description Obsidian right-panel view that shows backlinks for the active note.
 *
 * Displays:
 * - **Linked mentions** — notes that contain a `[[WikiLink]]` pointing to the active note
 * - **Unlinked mentions** — notes that contain the note's title as plain text
 *
 * The view updates automatically whenever the active leaf changes or the
 * metadata cache is invalidated.
 *
 * @example Registering in main.ts
 * ```typescript
 * import { BacklinksView, BACKLINKS_VIEW_TYPE } from './ui/BacklinksView';
 * this.registerView(BACKLINKS_VIEW_TYPE, leaf => new BacklinksView(leaf, this.app));
 * ```
 *
 * @since 0.1.0
 */

import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type { App } from "obsidian";
import { getBacklinks } from "../../copilot/tools/VaultOperations";

/** Registered view type for the Backlinks panel. */
export const BACKLINKS_VIEW_TYPE = "vault-copilot-backlinks";

/**
 * Right-panel view that shows all backlinks for the currently active note,
 * split into "Linked mentions" and "Unlinked mentions" sections.
 */
export class BacklinksView extends ItemView {
	private readonly pluginApp: App;
	/** Cleanup function for registered event listeners. */
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
		return BACKLINKS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Backlinks";
	}

	getIcon(): string {
		return "links-coming-in";
	}

	async onOpen(): Promise<void> {
		this.renderPlaceholder("Open a note to see its backlinks.");

		// Update on active-file change
		const onActiveLeafChange = () => { void this.refresh(); };
		this.pluginApp.workspace.on("active-leaf-change", onActiveLeafChange);
		this.cleanupListeners.push(() =>
			this.pluginApp.workspace.off("active-leaf-change", onActiveLeafChange),
		);

		// Update on metadata cache change (links are re-resolved)
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
	 * Re-query backlinks for the active note and re-render the panel.
	 * @internal
	 */
	private async refresh(): Promise<void> {
		const activeFile = this.pluginApp.workspace.getActiveFile();
		if (!activeFile) {
			this.renderPlaceholder("Open a note to see its backlinks.");
			return;
		}

		const result = await getBacklinks(this.pluginApp, activeFile.path);
		if (!result.success) {
			this.renderError(result.error ?? "Failed to load backlinks.");
			return;
		}

		this.renderResults(
			activeFile,
			result.linkedMentions ?? [],
			result.unlinkedMentions ?? [],
		);
	}

	// ── Rendering ─────────────────────────────────────────────────────────────

	private renderPlaceholder(message: string): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		const placeholder = container.createDiv({ cls: "vc-backlinks-placeholder" });
		placeholder.createSpan({ text: message, cls: "vc-backlinks-placeholder-text" });
	}

	private renderError(message: string): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.createDiv({ cls: "vc-backlinks-error", text: message });
	}

	private renderResults(
		targetFile: TFile,
		linkedMentions: Array<{ sourcePath: string; count: number }>,
		unlinkedMentions: Array<{ sourcePath: string; count: number }>,
	): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		// ── Header ──────────────────────────────────────────────────────────
		const header = container.createDiv({ cls: "vc-backlinks-header" });
		header.createSpan({ cls: "vc-backlinks-title", text: targetFile.basename });
		const totalCount = linkedMentions.length + unlinkedMentions.length;
		header.createSpan({
			cls: "vc-backlinks-count",
			text: `${totalCount} backlink${totalCount !== 1 ? "s" : ""}`,
		});

		// ── Linked mentions ──────────────────────────────────────────────────
		this.renderSection(
			container,
			"Linked mentions",
			linkedMentions.length,
			linkedMentions,
		);

		// ── Unlinked mentions ────────────────────────────────────────────────
		this.renderSection(
			container,
			"Unlinked mentions",
			unlinkedMentions.length,
			unlinkedMentions,
		);

		// Show empty-state message if truly nothing found
		if (totalCount === 0) {
			const empty = container.createDiv({ cls: "vc-backlinks-empty" });
			empty.createSpan({ text: `No backlinks found for "${targetFile.basename}".` });
		}
	}

	/**
	 * Render a collapsible section of backlink entries.
	 * @internal
	 */
	private renderSection(
		container: HTMLElement,
		title: string,
		count: number,
		entries: Array<{ sourcePath: string; count: number }>,
	): void {
		const section = container.createDiv({ cls: "vc-backlinks-section" });
		const sectionHeader = section.createDiv({ cls: "vc-backlinks-section-header" });

		// Collapse/expand toggle
		let collapsed = false;
		const toggleIcon = sectionHeader.createSpan({ cls: "vc-backlinks-toggle", text: "▾" });
		sectionHeader.createSpan({ cls: "vc-backlinks-section-title", text: title });
		sectionHeader.createSpan({
			cls: "vc-backlinks-section-count",
			text: `(${count})`,
		});

		const list = section.createDiv({ cls: "vc-backlinks-list" });

		sectionHeader.addEventListener("click", () => {
			collapsed = !collapsed;
			list.toggleClass("vc-backlinks-list-collapsed", collapsed);
			toggleIcon.textContent = collapsed ? "▸" : "▾";
		});

		if (entries.length === 0) {
			list.createDiv({ cls: "vc-backlinks-empty-section", text: "None" });
			return;
		}

		for (const entry of entries) {
			const item = list.createDiv({ cls: "vc-backlinks-item" });
			const link = item.createEl("a", {
				cls: "vc-backlinks-link",
				text: entry.sourcePath.replace(/\.md$/, ""),
			});

			link.addEventListener("click", async (e) => {
				e.preventDefault();
				const file = this.pluginApp.vault.getAbstractFileByPath(entry.sourcePath);
				if (file instanceof TFile) {
					await this.pluginApp.workspace.getLeaf().openFile(file);
				}
			});

			if (entry.count > 1) {
				item.createSpan({
					cls: "vc-backlinks-link-count",
					text: `×${entry.count}`,
				});
			}
		}
	}
}
