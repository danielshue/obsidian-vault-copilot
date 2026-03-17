/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ViewMoveHelper
 * @description Helpers for moving Obsidian views between workspace panels.
 *
 * Provides drag-aware utilities and programmatic APIs to relocate a view leaf
 * from one panel (left / center / right) to another without losing state.
 *
 * @example
 * ```typescript
 * import { moveViewToPanel } from './ViewMoveHelper';
 *
 * // Move the backlinks view to the right panel
 * await moveViewToPanel(app.workspace, BACKLINKS_VIEW_TYPE, 'right');
 * ```
 *
 * @since 0.1.0
 */

import { Workspace, WorkspaceLeaf } from "obsidian";
import { openViewInRightPanel, openViewInLeftPanel, openViewInMainPanel } from "./workspace-panels";
import type { WorkspacePanel } from "./workspace-panels";

// ── Programmatic move ──────────────────────────────────────────────────────

/**
 * Move all leaves of a view type to a specific workspace panel.
 *
 * Existing leaves are detached and a new leaf is created in the target panel.
 * The view state (type) is preserved; any internal component state is the
 * responsibility of the view's own `onOpen` / `onClose` lifecycle.
 *
 * @param workspace  - The Obsidian Workspace instance
 * @param viewType   - The registered view type to move
 * @param targetPanel - Destination panel: `"left"`, `"right"`, or `"center"`
 * @returns The new leaf hosting the view, or `null` on failure
 *
 * @example
 * ```typescript
 * const leaf = await moveViewToPanel(app.workspace, BACKLINKS_VIEW_TYPE, 'right');
 * ```
 */
export async function moveViewToPanel(
	workspace: Workspace,
	viewType: string,
	targetPanel: WorkspacePanel,
): Promise<WorkspaceLeaf | null> {
	// Close existing leaves
	workspace.getLeavesOfType(viewType).forEach(leaf => leaf.detach());

	// Open in target panel
	switch (targetPanel) {
		case "right":  return openViewInRightPanel(workspace, viewType);
		case "left":   return openViewInLeftPanel(workspace, viewType);
		case "center": return openViewInMainPanel(workspace, viewType);
		default:       return openViewInRightPanel(workspace, viewType);
	}
}

// ── Drag-and-drop helper ───────────────────────────────────────────────────

/**
 * Attach drag-start and drag-end event listeners to a view header element so
 * the user can drag the view between panels.  The listeners are cleaned up
 * automatically when `unregister()` is called (typically in `onClose()`).
 *
 * @param headerEl  - The draggable header element (usually the view title bar)
 * @param workspace - The Obsidian Workspace instance
 * @param viewType  - The registered view type being dragged
 * @returns An object with an `unregister()` function to remove listeners
 *
 * @example
 * ```typescript
 * // Inside a view's onOpen():
 * const dragHelper = attachViewDragListeners(
 *   this.containerEl.querySelector('.view-header') as HTMLElement,
 *   this.app.workspace,
 *   BACKLINKS_VIEW_TYPE,
 * );
 * // In onClose():
 * dragHelper.unregister();
 * ```
 */
export function attachViewDragListeners(
	headerEl: HTMLElement,
	workspace: Workspace,
	viewType: string,
): { unregister: () => void } {
	let dragTarget: WorkspacePanel | null = null;

	const onDragStart = (e: DragEvent) => {
		headerEl.classList.add("vc-view-dragging");
		if (e.dataTransfer) {
			e.dataTransfer.setData("text/plain", viewType);
			e.dataTransfer.effectAllowed = "move";
		}
	};

	const onDragEnd = async () => {
		headerEl.classList.remove("vc-view-dragging");
		// Remove all drop zone indicators
		document.querySelectorAll(".vc-dropzone-active").forEach(el => {
			el.classList.remove("vc-dropzone-active");
		});
		if (dragTarget) {
			await moveViewToPanel(workspace, viewType, dragTarget);
			dragTarget = null;
		}
	};

	// Wire panel drop zones
	const panelSelectors: Array<[string, WorkspacePanel]> = [
		[".workspace-split.mod-left-split", "left"],
		[".workspace-split.mod-right-split", "right"],
		[".workspace-split.mod-root", "center"],
	];

	const dropCleanups: Array<() => void> = [];

	for (const [selector, panel] of panelSelectors) {
		const el = document.querySelector(selector) as HTMLElement | null;
		if (!el) continue;

		const dropHandler = (e: Event) => {
			e.preventDefault();
			(e.currentTarget as HTMLElement).classList.remove("vc-dropzone-active");
			dragTarget = panel;
		};
		const dragOverHandler = (e: Event) => {
			e.preventDefault();
			(e.currentTarget as HTMLElement).classList.add("vc-dropzone-active");
		};
		const dragLeaveHandler = (e: Event) => {
			(e.currentTarget as HTMLElement).classList.remove("vc-dropzone-active");
		};

		el.addEventListener("drop", dropHandler);
		el.addEventListener("dragover", dragOverHandler);
		el.addEventListener("dragleave", dragLeaveHandler);

		dropCleanups.push(() => {
			el.removeEventListener("drop", dropHandler);
			el.removeEventListener("dragover", dragOverHandler);
			el.removeEventListener("dragleave", dragLeaveHandler);
		});
	}

	headerEl.setAttribute("draggable", "true");
	headerEl.addEventListener("dragstart", onDragStart);
	headerEl.addEventListener("dragend", onDragEnd);

	return {
		unregister: () => {
			headerEl.removeEventListener("dragstart", onDragStart);
			headerEl.removeEventListener("dragend", onDragEnd);
			headerEl.removeAttribute("draggable");
			dropCleanups.forEach(fn => fn());
		},
	};
}
