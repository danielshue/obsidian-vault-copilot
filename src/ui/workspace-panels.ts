/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module workspace-panels
 * @description Helpers for managing Obsidian workspace panel layout.
 *
 * Provides utilities for opening and revealing views in specific panels
 * (left sidebar, right sidebar, main editor area) and for querying the
 * current layout state.
 *
 * @example
 * ```typescript
 * import { openViewInRightPanel } from './workspace-panels';
 *
 * // Open a view in the right panel (creates it if not already open)
 * await openViewInRightPanel(app.workspace, MY_VIEW_TYPE);
 * ```
 *
 * @since 0.1.0
 */

import { Workspace, WorkspaceLeaf } from "obsidian";

// ── Panel constants ────────────────────────────────────────────────────────

/** Standard Obsidian workspace split identifiers. */
export type WorkspacePanel = "left" | "right" | "center";

// ── Open / reveal helpers ──────────────────────────────────────────────────

/**
 * Open a view in the right sidebar, creating a new leaf if one does not
 * already exist for that view type.
 *
 * @param workspace - The Obsidian Workspace instance
 * @param viewType  - The registered view type string
 * @returns The leaf that hosts the view, or `null` if it could not be opened
 *
 * @example
 * ```typescript
 * const leaf = await openViewInRightPanel(app.workspace, BACKLINKS_VIEW_TYPE);
 * ```
 */
export async function openViewInRightPanel(
	workspace: Workspace,
	viewType: string,
): Promise<WorkspaceLeaf | null> {
	// Re-use an existing leaf of this type if one is already open
	const existing = workspace.getLeavesOfType(viewType);
	const firstExisting = existing[0];
	if (firstExisting) {
		workspace.revealLeaf(firstExisting);
		return firstExisting;
	}

	// Create a new leaf in the right sidebar
	const leaf = workspace.getRightLeaf(false);
	if (!leaf) return null;

	await leaf.setViewState({ type: viewType, active: true });
	workspace.revealLeaf(leaf);
	return leaf;
}

/**
 * Open a view in the left sidebar, creating a new leaf if one does not
 * already exist for that view type.
 *
 * @param workspace - The Obsidian Workspace instance
 * @param viewType  - The registered view type string
 * @returns The leaf that hosts the view, or `null` if it could not be opened
 *
 * @example
 * ```typescript
 * const leaf = await openViewInLeftPanel(app.workspace, FILE_EXPLORER_VIEW_TYPE);
 * ```
 */
export async function openViewInLeftPanel(
	workspace: Workspace,
	viewType: string,
): Promise<WorkspaceLeaf | null> {
	const existing = workspace.getLeavesOfType(viewType);
	const firstExisting = existing[0];
	if (firstExisting) {
		workspace.revealLeaf(firstExisting);
		return firstExisting;
	}

	const leaf = workspace.getLeftLeaf(false);
	if (!leaf) return null;

	await leaf.setViewState({ type: viewType, active: true });
	workspace.revealLeaf(leaf);
	return leaf;
}

/**
 * Open a view in the main editor area (center panel), creating a new leaf
 * if one does not already exist for that view type.
 *
 * @param workspace - The Obsidian Workspace instance
 * @param viewType  - The registered view type string
 * @returns The leaf that hosts the view, or `null` if it could not be opened
 *
 * @example
 * ```typescript
 * const leaf = await openViewInMainPanel(app.workspace, MY_EDITOR_VIEW_TYPE);
 * ```
 */
export async function openViewInMainPanel(
	workspace: Workspace,
	viewType: string,
): Promise<WorkspaceLeaf | null> {
	const existing = workspace.getLeavesOfType(viewType);
	const firstExisting = existing[0];
	if (firstExisting) {
		workspace.revealLeaf(firstExisting);
		return firstExisting;
	}

	const leaf = workspace.getLeaf("tab");
	if (!leaf) return null;

	await leaf.setViewState({ type: viewType, active: true });
	workspace.revealLeaf(leaf);
	return leaf;
}

/**
 * Close all leaves of a given view type.
 *
 * @param workspace - The Obsidian Workspace instance
 * @param viewType  - The registered view type string
 *
 * @example
 * ```typescript
 * closeView(app.workspace, BACKLINKS_VIEW_TYPE);
 * ```
 */
export function closeView(workspace: Workspace, viewType: string): void {
	workspace.getLeavesOfType(viewType).forEach(leaf => leaf.detach());
}

/**
 * Toggle a view in the right panel open or closed.
 *
 * @param workspace - The Obsidian Workspace instance
 * @param viewType  - The registered view type string
 * @returns `true` if the view was opened, `false` if it was closed
 *
 * @example
 * ```typescript
 * await toggleRightPanelView(app.workspace, BACKLINKS_VIEW_TYPE);
 * ```
 */
export async function toggleRightPanelView(
	workspace: Workspace,
	viewType: string,
): Promise<boolean> {
	const leaves = workspace.getLeavesOfType(viewType);
	if (leaves.length > 0) {
		leaves.forEach(leaf => leaf.detach());
		return false;
	}
	await openViewInRightPanel(workspace, viewType);
	return true;
}

/**
 * Determine which panel a given leaf belongs to.
 *
 * @param workspace - The Obsidian Workspace instance
 * @param leaf      - The leaf to inspect
 * @returns `"left"`, `"right"`, or `"center"` (main editor)
 *
 * @example
 * ```typescript
 * const panel = getLeafPanel(app.workspace, leaf);
 * console.log(panel); // "right"
 * ```
 */
export function getLeafPanel(workspace: Workspace, leaf: WorkspaceLeaf): WorkspacePanel {
	// Check if leaf is in the right sidebar
	if (workspace.rightSplit && isLeafInSplit(leaf, workspace.rightSplit)) {
		return "right";
	}
	// Check if leaf is in the left sidebar
	if (workspace.leftSplit && isLeafInSplit(leaf, workspace.leftSplit)) {
		return "left";
	}
	return "center";
}

/**
 * Recursively check whether a leaf is contained within a workspace split.
 *
 * @param leaf  - The leaf to search for
 * @param split - The split container to search within
 * @returns `true` if `leaf` is a descendant of `split`, `false` otherwise
 *
 * @internal
 */
function isLeafInSplit(
	leaf: WorkspaceLeaf,
	split: unknown,
): boolean {
	if (!split || typeof split !== "object") return false;
	if (!("children" in split)) return false;
	const children = (split as { children?: unknown[] }).children;
	if (!children) return false;

	for (const child of children) {
		if (child === leaf) return true;
		if (child && typeof child === "object" && "children" in child) {
			if (isLeafInSplit(leaf, child)) return true;
		}
	}
	return false;
}
