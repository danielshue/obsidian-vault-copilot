/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ModelDropdownMenu
 * @description Reusable compact model dropdown menu with search, sort, grouped/flat view,
 * and a shortcut to open the detailed model picker modal.
 *
 * @since 0.1.0
 */

import { Menu, setIcon } from "obsidian";

export type ModelDropdownViewMode = "grouped" | "flat";

export interface ModelSelectionOption {
modelId: string;
providerProfileId?: string | null;
providerLabel?: string;
}

/**
 * Configuration for the compact model dropdown.
 */
export interface ModelDropdownMenuConfig {
/** Candidate model IDs for selection (legacy fallback). */
models: string[];
/** Provider-aware model options. */
modelOptions?: ModelSelectionOption[];
/** Currently selected model ID. */
selectedModel: string;
/** Currently selected provider profile ID (for duplicate model IDs). */
selectedProviderProfileId?: string | null;
/** Current alphabetical sort order. */
sortOrder: "asc" | "desc";
/** Current view mode. */
viewMode?: ModelDropdownViewMode;
/** Called when sort order is toggled. */
onSortOrderChange: (order: "asc" | "desc") => void;
/** Called when view mode is toggled. */
onViewModeChange?: (mode: ModelDropdownViewMode) => void;
/** Called when a model row is selected. */
onSelectModel: (modelId: string, providerProfileId?: string | null) => void | Promise<void>;
/** Called when the gear icon is clicked. */
onOpenDetailedPicker: (ctx: { closeMenu: () => void }) => void;
/** Optional display-name resolver. */
getDisplayName?: (modelId: string) => string;
/** Optional multiplier resolver. */
getMultiplier?: (modelId: string) => number | undefined;
	/** Optional icon HTML resolver. */
	getIconHtml?: (modelId: string) => string;
	/** Internal persisted search text between menu refreshes. */
	_searchText?: string;
}

/**
 * Resolved model row used by dropdown rendering.
 */
export interface ResolvedModelDropdownItem {
id: string;
modelId: string;
providerProfileId?: string | null;
providerLabel?: string;
label: string;
multiplier?: number;
iconHtml: string;
}

export interface ResolvedModelDropdownGroup {
	providerLabel: string;
	items: ResolvedModelDropdownItem[];
}

export function openDetailedPickerFromDropdown(
	onOpenDetailedPicker: ModelDropdownMenuConfig["onOpenDetailedPicker"],
	closeMenu: () => void,
): void {
	closeMenu();
	onOpenDetailedPicker({ closeMenu });
}

function getNormalizedOptions(
config: Pick<ModelDropdownMenuConfig, "models" | "modelOptions">,
): ModelSelectionOption[] {
if (config.modelOptions && config.modelOptions.length > 0) {
const seen = new Set<string>();
const normalized: ModelSelectionOption[] = [];
for (const option of config.modelOptions) {
const key = `${option.providerProfileId ?? ""}::${option.modelId}`;
if (seen.has(key)) continue;
seen.add(key);
normalized.push(option);
}
return normalized;
}
return Array.from(new Set(config.models)).map((modelId) => ({ modelId }));
}

function resolveItems(
config: Pick<
ModelDropdownMenuConfig,
"models" | "modelOptions" | "sortOrder" | "getDisplayName" | "getMultiplier" | "getIconHtml"
>,
searchText: string,
viewMode: ModelDropdownViewMode,
): ResolvedModelDropdownItem[] {
const needle = searchText.trim().toLowerCase();
const options = getNormalizedOptions(config);
const direction = config.sortOrder === "asc" ? 1 : -1;
const items = options.map((option) => {
const displayLabel = config.getDisplayName?.(option.modelId) ?? option.modelId;
const label = viewMode === "flat" && option.providerLabel
? `${displayLabel} (${option.providerLabel})`
: displayLabel;
return {
id: `${option.providerProfileId ?? ""}::${option.modelId}`,
modelId: option.modelId,
providerProfileId: option.providerProfileId,
providerLabel: option.providerLabel,
label,
multiplier: config.getMultiplier?.(option.modelId),
iconHtml: config.getIconHtml?.(option.modelId) ?? "",
};
});
const filtered = needle
? items.filter((item) =>
item.label.toLowerCase().includes(needle)
|| item.modelId.toLowerCase().includes(needle)
|| (item.providerLabel ?? "").toLowerCase().includes(needle),
)
: items;
return filtered.sort((a, b) => direction * a.label.localeCompare(b.label));
}

/**
 * Resolve visible flat-list model rows based on search text + sort order.
 */
export function resolveModelDropdownItems(
config: Pick<
ModelDropdownMenuConfig,
"models" | "modelOptions" | "sortOrder" | "getDisplayName" | "getMultiplier" | "getIconHtml"
>,
searchText: string,
): ResolvedModelDropdownItem[] {
return resolveItems(config, searchText, "flat");
}

/**
 * Resolve visible grouped model rows by provider based on search text + sort order.
 */
export function resolveGroupedModelDropdownItems(
config: Pick<
ModelDropdownMenuConfig,
"models" | "modelOptions" | "sortOrder" | "getDisplayName" | "getMultiplier" | "getIconHtml"
>,
searchText: string,
): ResolvedModelDropdownGroup[] {
const grouped = new Map<string, ResolvedModelDropdownItem[]>();
for (const item of resolveItems(config, searchText, "grouped")) {
const providerLabel = item.providerLabel ?? "Other";
const existing = grouped.get(providerLabel) ?? [];
existing.push(item);
grouped.set(providerLabel, existing);
}
return Array.from(grouped.entries()).map(([providerLabel, items]) => ({ providerLabel, items }));
}

/**
 * Build and show compact model dropdown anchored to `anchor`.
 */
export function showModelDropdownMenu(
config: ModelDropdownMenuConfig,
anchor: HTMLElement,
event: MouseEvent | null,
showMenuFn: (menu: Menu, event: MouseEvent | null, anchor: HTMLElement) => void,
): void {
const menu = new Menu();

const closeMenu = (): void => {
const menuEl = (menu as unknown as { dom?: HTMLElement }).dom;
menuEl?.remove();
};

const refresh = (): void => {
closeMenu();
showModelDropdownMenu(config, anchor, null, showMenuFn);
};

populateModelDropdownMenu(menu, config, closeMenu, refresh);
showMenuFn(menu, event, anchor);

const menuEl = (menu as unknown as { dom?: HTMLElement }).dom;
menuEl?.classList.add("vc-model-dropdown-menu");
}

/**
 * Populate an existing menu with compact model dropdown controls and rows.
 */
export function populateModelDropdownMenu(
	menu: Menu,
	config: ModelDropdownMenuConfig,
	closeMenu: () => void,
	onControlsChanged?: () => void,
): void {
	let searchText = config._searchText ?? "";
	let searchInputEl: HTMLInputElement | null = null;
	let noResultsTitleEl: HTMLElement | null = null;
	let viewMode: ModelDropdownViewMode = config.viewMode
		?? (config.modelOptions?.some((option) => Boolean(option.providerLabel)) ? "grouped" : "flat");

	type RenderedRow = { item: ResolvedModelDropdownItem; el: HTMLElement };
	type RenderedGroup = { headerEl: HTMLElement; rows: RenderedRow[] };
	const flatRows: RenderedRow[] = [];
	const groupedRows: RenderedGroup[] = [];

	const matchesSearch = (item: ResolvedModelDropdownItem, query: string): boolean => {
		const needle = query.trim().toLowerCase();
		if (!needle) return true;
		return item.label.toLowerCase().includes(needle)
			|| item.modelId.toLowerCase().includes(needle)
			|| (item.providerLabel ?? "").toLowerCase().includes(needle);
	};

	const applySearchFilter = (): void => {
		let visibleCount = 0;
		if (viewMode === "grouped") {
			for (const group of groupedRows) {
				let groupVisibleCount = 0;
				for (const row of group.rows) {
					const visible = matchesSearch(row.item, searchText);
					row.el.style.display = visible ? "" : "none";
					if (visible) {
						groupVisibleCount += 1;
						visibleCount += 1;
					}
				}
				group.headerEl.style.display = groupVisibleCount > 0 ? "" : "none";
			}
		} else {
			for (const row of flatRows) {
				const visible = matchesSearch(row.item, searchText);
				row.el.style.display = visible ? "" : "none";
				if (visible) visibleCount += 1;
			}
		}
		if (noResultsTitleEl) {
			noResultsTitleEl.textContent = searchText
				? `No models matching "${searchText}"`
				: "No models available";
			const rowEl = noResultsTitleEl.closest(".menu-item") as HTMLElement | null;
			if (rowEl) {
				rowEl.style.display = visibleCount === 0 ? "" : "none";
			}
		}
	};

	menu.addItem((item) => {
		item.setTitle("");
		const itemEl = (item as unknown as { dom: HTMLElement }).dom;
		itemEl.classList.add("vc-model-dropdown-controls");

		const titleEl = itemEl.querySelector(".menu-item-title");
		if (!titleEl) return;
		titleEl.textContent = "";

		const controlsEl = document.createElement("div");
		controlsEl.className = "vc-model-dropdown-controls-row";

		const searchInput = document.createElement("input");
		searchInput.type = "text";
		searchInput.placeholder = "Filter models…";
		searchInput.className = "vc-model-dropdown-search-input";
		searchInput.value = searchText;
		searchInput.addEventListener("input", () => {
			searchText = searchInput.value;
			config._searchText = searchText;
			applySearchFilter();
		});
		searchInput.addEventListener("keydown", (e) => {
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		searchInput.addEventListener("keyup", (e) => {
			e.stopPropagation();
			e.stopImmediatePropagation();
		});
		searchInput.addEventListener("pointerdown", (e) => {
			e.stopPropagation();
		});
		searchInput.addEventListener("click", (e) => {
			e.stopPropagation();
		});
		searchInputEl = searchInput;
		controlsEl.appendChild(searchInput);

		const createIconButton = (
			icon: string,
			label: string,
			active: boolean,
			onClick: () => void,
		): HTMLButtonElement => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = `vc-model-dropdown-control-btn${active ? " is-active" : ""}`;
			btn.setAttribute("aria-label", label);
			btn.setAttribute("title", label);
			setIcon(btn, icon);
			btn.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				onClick();
			});
			controlsEl.appendChild(btn);
			return btn;
		};

		createIconButton(
			config.sortOrder === "asc" ? "arrow-up-a-z" : "arrow-down-z-a",
			config.sortOrder === "asc" ? "Sort A-Z" : "Sort Z-A",
			true,
			() => {
				const next = config.sortOrder === "asc" ? "desc" : "asc";
				config.sortOrder = next;
				config.onSortOrderChange(next);
				config._searchText = searchText;
				onControlsChanged?.();
			},
		);

		createIconButton(
			viewMode === "grouped" ? "list-tree" : "list",
			viewMode === "grouped" ? "Grouped by provider" : "Flat model list",
			true,
			() => {
				viewMode = viewMode === "grouped" ? "flat" : "grouped";
				config.viewMode = viewMode;
				config._searchText = searchText;
				config.onViewModeChange?.(viewMode);
				onControlsChanged?.();
			},
		);

		createIconButton("settings", "Open detailed model picker", false, () => {
			openDetailedPickerFromDropdown(config.onOpenDetailedPicker, closeMenu);
		});

		titleEl.appendChild(controlsEl);
	});

	menu.addSeparator();

	const isSelected = (item: ResolvedModelDropdownItem): boolean => {
		if (config.selectedModel !== item.modelId) return false;
		if (config.selectedProviderProfileId === undefined || config.selectedProviderProfileId === null) {
			return true;
		}
		return config.selectedProviderProfileId === (item.providerProfileId ?? null);
	};

	const renderModelItem = (
		model: ResolvedModelDropdownItem,
		group?: RenderedGroup,
	): void => {
		menu.addItem((item) => {
			const selected = isSelected(model);
			item.setTitle(model.label).onClick(() => config.onSelectModel(model.modelId, model.providerProfileId ?? null));
			const itemEl = (item as unknown as { dom: HTMLElement }).dom;
			const titleEl = itemEl.querySelector(".menu-item-title") as HTMLElement | null;
			if (!titleEl) return;

			titleEl.innerHTML = "";
			const checkEl = document.createElement("span");
			checkEl.className = "vc-model-col-check";
			checkEl.textContent = selected ? "✓" : "";

			const nameEl = document.createElement("span");
			nameEl.className = "vc-model-col-name";
			if (selected) {
				nameEl.textContent = model.label;
			} else {
				nameEl.innerHTML = `${model.iconHtml}${model.label}`;
			}

			const multEl = document.createElement("span");
			multEl.className = "vc-model-col-mult";
			multEl.textContent = model.multiplier !== undefined ? `${model.multiplier}x` : "";

			titleEl.append(checkEl, nameEl, multEl);
			const row: RenderedRow = { item: model, el: itemEl };
			if (group) {
				group.rows.push(row);
			} else {
				flatRows.push(row);
			}
		});
	};

	if (viewMode === "grouped") {
		const groups = resolveGroupedModelDropdownItems(config, "");
		for (const group of groups) {
			let renderedGroup: RenderedGroup | null = null;
			menu.addItem((item) => {
				item.setTitle(group.providerLabel).setDisabled(true);
				const itemEl = (item as unknown as { dom: HTMLElement }).dom;
				itemEl.classList.add("vc-model-dropdown-group-header");
				renderedGroup = {
					headerEl: itemEl,
					rows: [],
				};
				groupedRows.push(renderedGroup);
			});
			for (const model of group.items) {
				renderModelItem(model, renderedGroup ?? undefined);
			}
		}
	} else {
		const items = resolveModelDropdownItems(config, "");
		for (const model of items) {
			renderModelItem(model);
		}
	}

	menu.addItem((item) => {
		item.setTitle("No models available").setDisabled(true);
		const itemEl = (item as unknown as { dom: HTMLElement }).dom;
		noResultsTitleEl = itemEl.querySelector(".menu-item-title") as HTMLElement | null;
	});

	applySearchFilter();

	if (searchInputEl) {
		setTimeout(() => {
			if (!searchInputEl) return;
			searchInputEl.focus();
			const end = searchInputEl.value.length;
			searchInputEl.setSelectionRange(end, end);
		}, 0);
	}
}
