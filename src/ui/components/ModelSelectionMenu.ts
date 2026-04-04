/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ModelSelectionMenu
 * @description Reusable builder for model selection menus used across chat, settings, and automation UI.
 *
 * Produces a consistent three-column model picker:
 * - Left column: checkmark for selected item
 * - Middle column: model icon (when unselected) + model display name
 * - Right column: optional multiplier label
 *
 * @since 0.1.0
 */

import { Menu } from "obsidian";

/**
 * Optional "default" row rendered above model entries.
 */
export interface ModelSelectionDefaultOption {
	/** Row label. */
	label: string;
	/** Whether this row is currently selected. */
	selected: boolean;
	/** Callback when this row is picked. */
	onSelect: () => void | Promise<void>;
}

/**
 * Configuration for building a model selection menu.
 */
export interface BuildModelSelectionMenuOptions {
	/** Available model IDs to list. */
	models: string[];
	/** Optional allowlist for model IDs. */
	allowedModels?: string[];
	/** Optional predicate for model visibility. */
	modelFilter?: (modelId: string) => boolean;
	/** Currently selected model ID. */
	selectedModel: string;
	/** Called when a model row is selected. */
	onSelectModel: (modelId: string) => void | Promise<void>;
	/** Optional custom display-name formatter. Defaults to raw model ID. */
	getDisplayName?: (modelId: string) => string;
	/** Optional multiplier provider shown in the right column. */
	getMultiplier?: (modelId: string) => number | undefined;
	/** Optional icon HTML provider used for unselected rows. */
	getIconHtml?: (modelId: string) => string;
	/** Optional default row rendered before model rows. */
	defaultOption?: ModelSelectionDefaultOption;
	/** Whether to render the "Model / Multiplier" header row. Defaults to true. */
	includeHeader?: boolean;
}

/**
 * Build a model selection menu with consistent rendering and behavior.
 *
 * @param options - Menu configuration
 * @returns A configured Obsidian {@link Menu}
 */
export function buildModelSelectionMenu(options: BuildModelSelectionMenuOptions): Menu {
	const menu = new Menu();
	const allowed = options.allowedModels ? new Set(options.allowedModels) : null;
	const visibleModels = options.models.filter((modelId, index, list) => {
		if (list.indexOf(modelId) !== index) return false;
		if (allowed && !allowed.has(modelId)) return false;
		if (options.modelFilter && !options.modelFilter(modelId)) return false;
		return true;
	});

	if (options.defaultOption) {
		menu.addItem((item) => {
			item
				.setTitle(options.defaultOption?.label ?? "Default")
				.onClick(() => options.defaultOption?.onSelect());
			const itemEl = (item as unknown as { dom: HTMLElement }).dom;
			const titleEl = itemEl.querySelector(".menu-item-title") as HTMLElement | null;
			if (titleEl) {
				titleEl.innerHTML = "";
				const checkEl = document.createElement("span");
				checkEl.className = "vc-model-col-check";
				checkEl.textContent = options.defaultOption?.selected ? "✓" : "";
				const nameEl = document.createElement("span");
				nameEl.className = "vc-model-col-name";
				nameEl.textContent = options.defaultOption?.label ?? "Default";
				const multEl = document.createElement("span");
				multEl.className = "vc-model-col-mult";
				multEl.textContent = "";
				titleEl.append(checkEl, nameEl, multEl);
			}
		});
		menu.addSeparator();
	}

	if (options.includeHeader !== false) {
		menu.addItem((item) => {
			item.setTitle("Model").setDisabled(true);
			const itemEl = (item as unknown as { dom: HTMLElement }).dom;
			itemEl.classList.add("vc-model-menu-header");
			const titleEl = itemEl.querySelector(".menu-item-title") as HTMLElement | null;
			if (titleEl) {
				titleEl.innerHTML = "";
				const checkCol = document.createElement("span");
				checkCol.className = "vc-model-col-check";
				const nameCol = document.createElement("span");
				nameCol.className = "vc-model-col-name";
				nameCol.textContent = "Model";
				const multCol = document.createElement("span");
				multCol.className = "vc-model-col-mult";
				multCol.textContent = "Multiplier";
				titleEl.append(checkCol, nameCol, multCol);
			}
		});
	}

	for (const modelId of visibleModels) {
		menu.addItem((item) => {
			const isSelected = options.selectedModel === modelId;
			const displayName = options.getDisplayName?.(modelId) ?? modelId;
			const multiplier = options.getMultiplier?.(modelId);
			item.setTitle(displayName).onClick(() => options.onSelectModel(modelId));

			const itemEl = (item as unknown as { dom: HTMLElement }).dom;
			const titleEl = itemEl.querySelector(".menu-item-title") as HTMLElement | null;
			if (!titleEl) return;

			titleEl.innerHTML = "";
			const checkEl = document.createElement("span");
			checkEl.className = "vc-model-col-check";
			checkEl.textContent = isSelected ? "✓" : "";

			const nameEl = document.createElement("span");
			nameEl.className = "vc-model-col-name";
			if (!isSelected) {
				nameEl.innerHTML = `${options.getIconHtml?.(modelId) ?? ""}${displayName}`;
			} else {
				nameEl.textContent = displayName;
			}

			const multEl = document.createElement("span");
			multEl.className = "vc-model-col-mult";
			multEl.textContent = multiplier !== undefined ? `${multiplier}x` : "";

			titleEl.append(checkEl, nameEl, multEl);
		});
	}

	return menu;
}
