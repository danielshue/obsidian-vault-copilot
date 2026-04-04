/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ModelPickerModal
 * @description Reusable searchable model picker modal with optional detail pane metadata.
 *
 * @since 0.1.0
 */

import { App, Modal } from "obsidian";

/** Detail row for boolean model abilities (vision, tool-calling, reasoning, etc.). */
export interface ModelAbilityDetail {
	key: string;
	label: string;
	enabled: boolean;
	description?: string;
}

/** Optional pricing detail values (typically per 1M tokens). */
export interface ModelPricingDetail {
	input?: number;
	output?: number;
	cachedInput?: number;
}

/** Discrete config option value (for toggles/select-like capabilities). */
export interface ModelConfigOptionDetail {
	key: string;
	label: string;
	value: string;
	description?: string;
}

/** Rich model details shown on hover/focus in the picker details panel. */
export interface ModelMetadataDetail {
	contextWindowTokens?: number;
	abilities?: ModelAbilityDetail[];
	pricing?: ModelPricingDetail;
	configOptions?: ModelConfigOptionDetail[];
}

/** Optional "default" row rendered above concrete model choices. */
export interface ModelPickerDefaultOption {
	label: string;
	selected: boolean;
	onSelect: () => void | Promise<void>;
}

/** Options for rendering and handling model selection modal behavior. */
export interface ModelPickerModalOptions {
	models: string[];
	modelOptions?: Array<{
		modelId: string;
		providerProfileId?: string | null;
		providerLabel?: string;
	}>;
	selectedModel: string;
	selectedProviderProfileId?: string | null;
	onSelectModel: (modelId: string, providerProfileId?: string | null) => void | Promise<void>;
	getDisplayName?: (modelId: string) => string;
	getProviderLabel?: (modelId: string, providerProfileId?: string | null) => string | undefined;
	getMultiplier?: (modelId: string) => number | undefined;
	getIconHtml?: (modelId: string) => string;
	getMetadata?: (modelId: string) => ModelMetadataDetail | undefined;
	groupByProvider?: boolean;
	allowedModels?: string[];
	modelFilter?: (modelId: string) => boolean;
	defaultOption?: ModelPickerDefaultOption;
	title?: string;
	searchPlaceholder?: string;
}

interface ModelPickerItem {
	id: string;
	modelId: string;
	providerProfileId?: string | null;
	providerLabel?: string;
	label: string;
	searchText: string;
}

const DEFAULT_ITEM_ID = "__default__";
const MODEL_PICKER_LAYOUT_STORAGE_KEY = "vc:model-picker:layout:v1";
const MODEL_PICKER_DEFAULT_WIDTH = 960;
const MODEL_PICKER_DEFAULT_HEIGHT = 560;
const MODEL_PICKER_MIN_WIDTH = 620;
const MODEL_PICKER_MIN_HEIGHT = 420;
const MODEL_PICKER_DEFAULT_SPLIT_RATIO = 0.42;
const MODEL_PICKER_MIN_LIST_WIDTH = 240;
const MODEL_PICKER_MIN_DETAILS_WIDTH = 280;
const MODEL_PICKER_SPLITTER_WIDTH = 10;
const VIEWPORT_PADDING = 12;

interface ModelPickerLayoutState {
	width: number;
	height: number;
	left?: number;
	top?: number;
	splitRatio?: number;
}

/**
 * Searchable model picker modal with optional model details.
 */
export class ModelPickerModal extends Modal {
	private readonly options: ModelPickerModalOptions;
	private readonly items: ModelPickerItem[];
	private filteredItems: ModelPickerItem[] = [];
	private searchQuery = "";
	private highlightedIndex = 0;
	private listEl: HTMLElement | null = null;
	private detailsEl: HTMLElement | null = null;
	private searchInputEl: HTMLInputElement | null = null;
	private hoveredModelId: string | null = null;
	private isSelecting = false;
	private modalContainerEl: HTMLElement | null = null;
	private layoutEl: HTMLElement | null = null;
	private resizeHandleEl: HTMLElement | null = null;
	private paneSplitterEl: HTMLElement | null = null;
	private splitRatio = MODEL_PICKER_DEFAULT_SPLIT_RATIO;
	private teardownHandlers: Array<() => void> = [];

	/**
	 * @param app - Obsidian app instance.
	 * @param options - Modal options for model list, rendering, and selection callbacks.
	 */
	constructor(app: App, options: ModelPickerModalOptions) {
		super(app);
		this.options = options;

		const allowed = options.allowedModels ? new Set(options.allowedModels) : null;
		const rawOptions: Array<{
			modelId: string;
			providerProfileId?: string | null;
			providerLabel?: string;
		}> = options.modelOptions?.length
			? options.modelOptions
			: options.models.map((modelId) => ({ modelId, providerProfileId: null, providerLabel: undefined }));
		const seen = new Set<string>();
		const modelItems: ModelPickerItem[] = [];
		for (const option of rawOptions) {
			const modelId = option.modelId;
			if (allowed && !allowed.has(modelId)) continue;
			if (options.modelFilter && !options.modelFilter(modelId)) continue;
			const key = `${option.providerProfileId ?? ""}::${modelId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const providerLabel = option.providerLabel
				?? options.getProviderLabel?.(modelId, option.providerProfileId ?? null);
			const label = options.getDisplayName?.(modelId) ?? modelId;
			modelItems.push({
				id: key,
				modelId,
				providerProfileId: option.providerProfileId ?? null,
				providerLabel,
				label,
				searchText: `${label} ${modelId} ${providerLabel ?? ""}`.toLowerCase(),
			});
		}

		this.items = options.defaultOption
			? [{
				id: DEFAULT_ITEM_ID,
				modelId: DEFAULT_ITEM_ID,
				label: options.defaultOption.label,
				searchText: options.defaultOption.label.toLowerCase(),
			}, ...modelItems]
			: modelItems;
		this.filteredItems = [...this.items];
		this.highlightedIndex = this.computeHighlightedIndex([this.getSelectedItemId()]);
		this.hoveredModelId = options.selectedModel || (modelItems[0]?.modelId ?? null);
		this.syncHoveredModelFromHighlighted();
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(this.options.title ?? "Select Model");
		contentEl.empty();
		this.modalEl.addClass("vc-model-picker-modal");
		contentEl.addClass("vc-model-picker-content");
		this.modalContainerEl = this.resolveModalContainerEl();

		const searchWrap = contentEl.createDiv({ cls: "vc-mpm-search-wrap" });
		this.searchInputEl = searchWrap.createEl("input", {
			type: "text",
			cls: "vc-mpm-search-input",
			attr: { placeholder: this.options.searchPlaceholder ?? "Search models..." },
		});
		this.searchInputEl.addEventListener("input", () => {
			this.searchQuery = this.searchInputEl?.value.trim().toLowerCase() ?? "";
			this.highlightedIndex = 0;
			this.applyFilter();
		});
		this.searchInputEl.addEventListener("keydown", (e) => this.handleSearchKeydown(e));

		const layout = contentEl.createDiv({ cls: "vc-mpm-layout" });
		this.layoutEl = layout;
		this.listEl = layout.createDiv({ cls: "vc-mpm-list" });
		this.paneSplitterEl = layout.createDiv({ cls: "vc-mpm-pane-splitter" });
		this.detailsEl = layout.createDiv({ cls: "vc-mpm-details" });

		this.renderList();
		this.renderDetails();
		this.setupMovableResizableLayout();
		this.searchInputEl.focus();
	}

	onClose(): void {
		this.teardownMovableResizableLayout();
		this.contentEl.empty();
	}

	private applyFilter(): void {
		const q = this.searchQuery;
		const previousHighlightedId = this.filteredItems[this.highlightedIndex]?.id;
		this.filteredItems = this.items.filter((item) => {
			if (!q) return true;
			if (item.id === DEFAULT_ITEM_ID) return item.label.toLowerCase().includes(q);
			return item.searchText.includes(q);
		});
		this.highlightedIndex = this.computeHighlightedIndex([
			previousHighlightedId,
			this.getSelectedItemId(),
			this.filteredItems[0]?.id,
		]);
		this.syncHoveredModelFromHighlighted();
		this.renderList();
		this.renderDetails();
	}

	private handleSearchKeydown(e: KeyboardEvent): void {
		if (e.key === "Escape" && this.searchInputEl?.value) {
			e.preventDefault();
			this.searchInputEl.value = "";
			this.searchQuery = "";
			this.applyFilter();
			return;
		}
		if (this.filteredItems.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			this.moveHighlight(1);
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			this.moveHighlight(-1);
			return;
		}
		if (e.key === "Home") {
			e.preventDefault();
			this.highlightedIndex = 0;
			this.syncHoveredModelFromHighlighted();
			this.renderList();
			this.renderDetails();
			return;
		}
		if (e.key === "End") {
			e.preventDefault();
			this.highlightedIndex = this.filteredItems.length - 1;
			this.syncHoveredModelFromHighlighted();
			this.renderList();
			this.renderDetails();
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			const item = this.filteredItems[this.highlightedIndex];
			if (item) void this.selectItem(item.id);
		}
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();

		if (this.filteredItems.length === 0) {
			this.listEl.createDiv({ cls: "vc-mpm-empty", text: "No matching models" });
			return;
		}

		const groupedByProvider = this.options.groupByProvider === true;
		let lastProviderKey: string | null = null;
		this.filteredItems.forEach((item, index) => {
			const isDefault = item.id === DEFAULT_ITEM_ID;
			if (!isDefault && groupedByProvider) {
				const providerKey = item.providerProfileId ?? item.providerLabel ?? "other";
				if (providerKey !== lastProviderKey) {
					lastProviderKey = providerKey;
					this.listEl!.createDiv({
						cls: "vc-mpm-group-header",
						text: item.providerLabel ?? "Other",
					});
				}
			}
			const isSelected = isDefault
				? !!this.options.defaultOption?.selected
				: (
					this.options.selectedModel === item.modelId
					&& (
						this.options.selectedProviderProfileId === undefined
						|| this.options.selectedProviderProfileId === null
						|| (this.options.selectedProviderProfileId === (item.providerProfileId ?? null))
					)
				);
			const row = this.listEl!.createDiv({ cls: "vc-mpm-row" });
			if (index === this.highlightedIndex) row.addClass("is-highlighted");
			if (isSelected) row.addClass("is-selected");

			const check = row.createSpan({ cls: "vc-mpm-check", text: isSelected ? "✓" : "" });
			check.setAttr("aria-hidden", "true");

			const name = row.createSpan({ cls: "vc-mpm-name" });
			if (!isSelected && !isDefault) {
				name.innerHTML = `${this.options.getIconHtml?.(item.modelId) ?? ""}${item.label}`;
			} else {
				name.setText(item.label);
			}

			const mult = row.createSpan({ cls: "vc-mpm-mult" });
			if (!isDefault) {
				const multiplier = this.options.getMultiplier?.(item.modelId);
				mult.setText(multiplier !== undefined ? `${multiplier}x` : "");
			}

			row.addEventListener("mouseenter", () => {
				this.highlightedIndex = index;
				this.syncHoveredModelFromHighlighted();
				this.renderList();
				this.renderDetails();
			});
			row.addEventListener("pointerup", (event: PointerEvent) => {
				if (event.button !== 0) return;
				void this.selectItem(item.id);
			});
			row.addEventListener("click", () => void this.selectItem(item.id));
		});

		const highlightedRow = this.listEl.querySelector(".vc-mpm-row.is-highlighted");
		highlightedRow?.scrollIntoView({ block: "nearest" });
	}

	private async selectItem(itemId: string): Promise<void> {
		if (this.isSelecting) return;
		this.isSelecting = true;
		if (itemId === DEFAULT_ITEM_ID) {
			try {
				await this.options.defaultOption?.onSelect();
				this.close();
			} finally {
				this.isSelecting = false;
			}
			return;
		}
		try {
			const item = this.items.find((candidate) => candidate.id === itemId);
			if (!item || item.id === DEFAULT_ITEM_ID) return;
			await this.options.onSelectModel(item.modelId, item.providerProfileId ?? null);
			this.close();
		} finally {
			this.isSelecting = false;
		}
	}

	private renderDetails(): void {
		if (!this.detailsEl) return;
		this.detailsEl.empty();

		const highlightedItem = this.filteredItems[this.highlightedIndex];
		const modelId = highlightedItem?.id && highlightedItem.id !== DEFAULT_ITEM_ID
			? highlightedItem.modelId
			: (this.hoveredModelId || this.options.selectedModel);
		if (!modelId) {
			this.detailsEl.createDiv({ cls: "vc-mpm-details-empty", text: "Select a model to view details" });
			return;
		}

		this.detailsEl.createDiv({
			cls: "vc-mpm-details-model",
			text: this.options.getDisplayName?.(modelId) ?? modelId,
		});
		const providerLabel = highlightedItem?.providerLabel
			?? this.options.getProviderLabel?.(modelId, highlightedItem?.providerProfileId ?? null);
		if (providerLabel) {
			this.detailsEl.createDiv({
				cls: "vc-mpm-details-provider",
				text: providerLabel,
			});
		}

		const metadata = this.options.getMetadata?.(modelId);
		const hasExtendedDetails = Boolean(
			(metadata?.abilities && metadata.abilities.length > 0) ||
			(metadata?.configOptions && metadata.configOptions.length > 0) ||
			(metadata?.pricing && (
				metadata.pricing.input !== undefined ||
				metadata.pricing.output !== undefined ||
				metadata.pricing.cachedInput !== undefined
			)),
		);

		const contextRow = this.detailsEl.createDiv({ cls: "vc-mpm-detail-row" });
		contextRow.createSpan({ cls: "vc-mpm-detail-label", text: "Context Length" });
		contextRow.createSpan({
			cls: "vc-mpm-detail-value",
			text: metadata?.contextWindowTokens !== undefined
				? `${this.formatThousands(metadata.contextWindowTokens)} tokens`
				: "Unknown",
		});

		if (metadata) {
			this.renderAbilitySection(metadata);
			this.renderPricingSection(metadata);
			this.renderConfigSection(metadata);
		}

		if (!hasExtendedDetails) {
			this.detailsEl.createDiv({ cls: "vc-mpm-details-empty", text: "No extended model details available" });
		}
	}

	private moveHighlight(delta: number): void {
		this.highlightedIndex = Math.max(0, Math.min(this.filteredItems.length - 1, this.highlightedIndex + delta));
		this.syncHoveredModelFromHighlighted();
		this.renderList();
		this.renderDetails();
	}

	private getSelectedItemId(): string | undefined {
		if (this.options.defaultOption?.selected) return DEFAULT_ITEM_ID;
		if (!this.options.selectedModel) return undefined;
		const selectedProvider = this.options.selectedProviderProfileId ?? null;
		const matched = this.items.find((item) =>
			item.id !== DEFAULT_ITEM_ID
			&& item.modelId === this.options.selectedModel
			&& (
				this.options.selectedProviderProfileId === undefined
				|| this.options.selectedProviderProfileId === null
				|| (item.providerProfileId ?? null) === selectedProvider
			),
		);
		return matched?.id;
	}

	private computeHighlightedIndex(preferredIds: Array<string | undefined>): number {
		if (this.filteredItems.length === 0) return 0;
		for (const preferredId of preferredIds) {
			if (!preferredId) continue;
			const index = this.filteredItems.findIndex((item) => item.id === preferredId);
			if (index >= 0) return index;
		}
		return 0;
	}

	private syncHoveredModelFromHighlighted(): void {
		const highlightedItem = this.filteredItems[this.highlightedIndex];
		if (!highlightedItem) return;
		if (highlightedItem.id === DEFAULT_ITEM_ID) return;
		this.hoveredModelId = highlightedItem.modelId;
	}

	private renderAbilitySection(metadata: ModelMetadataDetail): void {
		if (!this.detailsEl || !metadata.abilities || metadata.abilities.length === 0) return;
		const details = this.detailsEl.createEl("details", { cls: "vc-mpm-section", attr: { open: "true" } });
		details.createEl("summary", { cls: "vc-mpm-section-title", text: "Abilities" });
		for (const ability of metadata.abilities) {
			const row = details.createDiv({ cls: "vc-mpm-subrow" });
			row.createSpan({ cls: "vc-mpm-subrow-name", text: ability.label });
			row.createSpan({ cls: "vc-mpm-subrow-value", text: ability.enabled ? "Supported" : "Not supported" });
			if (ability.description) {
				row.createDiv({ cls: "vc-mpm-subrow-desc", text: ability.description });
			}
		}
	}

	private renderPricingSection(metadata: ModelMetadataDetail): void {
		if (!this.detailsEl || !metadata.pricing) return;
		const { input, output, cachedInput } = metadata.pricing;
		if (input === undefined && output === undefined && cachedInput === undefined) return;
		const details = this.detailsEl.createEl("details", { cls: "vc-mpm-section", attr: { open: "true" } });
		details.createEl("summary", { cls: "vc-mpm-section-title", text: "Pricing" });
		if (input !== undefined) this.renderSimpleSubrow(details, "Input", `$${input.toFixed(2)}/1M`);
		if (output !== undefined) this.renderSimpleSubrow(details, "Output", `$${output.toFixed(2)}/1M`);
		if (cachedInput !== undefined) this.renderSimpleSubrow(details, "Input (Cached)", `$${cachedInput.toFixed(2)}/1M`);
	}

	private renderConfigSection(metadata: ModelMetadataDetail): void {
		if (!this.detailsEl || !metadata.configOptions || metadata.configOptions.length === 0) return;
		const details = this.detailsEl.createEl("details", { cls: "vc-mpm-section", attr: { open: "true" } });
		details.createEl("summary", { cls: "vc-mpm-section-title", text: "Model Config" });
		for (const option of metadata.configOptions) {
			this.renderSimpleSubrow(details, option.label, option.value, option.description);
		}
	}

	private renderSimpleSubrow(parent: HTMLElement, name: string, value: string, description?: string): void {
		const row = parent.createDiv({ cls: "vc-mpm-subrow" });
		row.createSpan({ cls: "vc-mpm-subrow-name", text: name });
		row.createSpan({ cls: "vc-mpm-subrow-value", text: value });
		if (description) {
			row.createDiv({ cls: "vc-mpm-subrow-desc", text: description });
		}
	}

	private formatThousands(value: number): string {
		return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
	}

	private setupMovableResizableLayout(): void {
		const containerEl = this.modalContainerEl;
		if (!containerEl || typeof window === "undefined") return;

		const initialLayout = this.clampLayoutToViewport(this.readStoredLayout() ?? this.getDefaultLayout());
		this.splitRatio = this.clampSplitRatio(initialLayout.splitRatio ?? this.splitRatio);
		this.applyLayout(initialLayout);
		this.setupPaneSplitter();
		this.setupDrag(containerEl);
		this.setupResize(containerEl);
		const onResize = () => {
			if (!this.modalContainerEl) return;
			const rect = this.modalContainerEl.getBoundingClientRect();
			this.applyLayout(this.clampLayoutToViewport({
				width: rect.width,
				height: rect.height,
				left: rect.left,
				top: rect.top,
			}));
			this.persistCurrentLayout();
		};
		window.addEventListener("resize", onResize);
		this.teardownHandlers.push(() => window.removeEventListener("resize", onResize));
	}

	private setupPaneSplitter(): void {
		const splitterEl = this.paneSplitterEl;
		const layoutEl = this.layoutEl;
		if (!splitterEl || !layoutEl) return;

		const onPointerDown = (downEvent: PointerEvent) => {
			if (downEvent.button !== 0) return;
			downEvent.preventDefault();
			splitterEl.setPointerCapture(downEvent.pointerId);

			const layoutRect = layoutEl.getBoundingClientRect();
			const maxListWidth = Math.max(
				MODEL_PICKER_MIN_LIST_WIDTH,
				layoutRect.width - MODEL_PICKER_SPLITTER_WIDTH - MODEL_PICKER_MIN_DETAILS_WIDTH,
			);
			const minListWidth = Math.min(MODEL_PICKER_MIN_LIST_WIDTH, maxListWidth);
			const availableWidth = Math.max(1, layoutRect.width - MODEL_PICKER_SPLITTER_WIDTH);

			const onPointerMove = (moveEvent: PointerEvent) => {
				const relativeX = moveEvent.clientX - layoutRect.left - MODEL_PICKER_SPLITTER_WIDTH / 2;
				const nextListWidth = Math.min(Math.max(relativeX, minListWidth), maxListWidth);
				this.splitRatio = this.clampSplitRatio(nextListWidth / availableWidth);
				this.applySplitRatio();
			};

			const onPointerUp = (upEvent: PointerEvent) => {
				splitterEl.releasePointerCapture(upEvent.pointerId);
				splitterEl.removeEventListener("pointermove", onPointerMove);
				splitterEl.removeEventListener("pointerup", onPointerUp);
				splitterEl.removeEventListener("pointercancel", onPointerUp);
				this.persistCurrentLayout();
			};

			splitterEl.addEventListener("pointermove", onPointerMove);
			splitterEl.addEventListener("pointerup", onPointerUp, { once: true });
			splitterEl.addEventListener("pointercancel", onPointerUp, { once: true });
		};

		splitterEl.addEventListener("pointerdown", onPointerDown);
		this.teardownHandlers.push(() => splitterEl.removeEventListener("pointerdown", onPointerDown));
	}

	private resolveModalContainerEl(): HTMLElement | null {
		if (!(this.modalEl instanceof HTMLElement)) return null;
		if (this.modalEl.matches(".modal")) return this.modalEl;
		const nestedModal = this.modalEl.querySelector(".modal");
		return nestedModal instanceof HTMLElement ? nestedModal : null;
	}

	private teardownMovableResizableLayout(): void {
		while (this.teardownHandlers.length) {
			const teardown = this.teardownHandlers.pop();
			teardown?.();
		}
		this.resizeHandleEl?.remove();
		this.resizeHandleEl = null;
		this.paneSplitterEl = null;
		this.layoutEl = null;
		this.modalContainerEl = null;
	}

	private setupDrag(containerEl: HTMLElement): void {
		const dragHandle = this.titleEl;
		dragHandle.addClass("vc-mpm-drag-handle");

		const onMouseDown = (downEvent: MouseEvent) => {
			if (downEvent.button !== 0 || downEvent.target instanceof HTMLInputElement) return;
			downEvent.preventDefault();

			const startRect = containerEl.getBoundingClientRect();
			const startX = downEvent.clientX;
			const startY = downEvent.clientY;

			const onMouseMove = (moveEvent: MouseEvent) => {
				const nextLeft = startRect.left + (moveEvent.clientX - startX);
				const nextTop = startRect.top + (moveEvent.clientY - startY);
				const nextLayout = this.clampLayoutToViewport({
					width: startRect.width,
					height: startRect.height,
					left: nextLeft,
					top: nextTop,
				});
				this.applyLayout(nextLayout);
			};

			const onMouseUp = () => {
				window.removeEventListener("mousemove", onMouseMove);
				window.removeEventListener("mouseup", onMouseUp);
				this.persistCurrentLayout();
			};

			window.addEventListener("mousemove", onMouseMove);
			window.addEventListener("mouseup", onMouseUp, { once: true });
		};

		dragHandle.addEventListener("mousedown", onMouseDown);
		this.teardownHandlers.push(() => {
			dragHandle.removeEventListener("mousedown", onMouseDown);
			dragHandle.removeClass("vc-mpm-drag-handle");
		});
	}

	private setupResize(containerEl: HTMLElement): void {
		const handleEl = document.createElement("div");
		handleEl.className = "vc-mpm-resize-handle";
		handleEl.setAttribute("role", "separator");
		handleEl.setAttribute("aria-label", "Resize model picker");
		containerEl.appendChild(handleEl);
		this.resizeHandleEl = handleEl;

		const onPointerDown = (downEvent: PointerEvent) => {
			if (downEvent.button !== 0) return;
			downEvent.preventDefault();
			handleEl.setPointerCapture(downEvent.pointerId);

			const startRect = containerEl.getBoundingClientRect();
			const startX = downEvent.clientX;
			const startY = downEvent.clientY;

			const onPointerMove = (moveEvent: PointerEvent) => {
				const nextLayout = this.clampLayoutToViewport({
					width: startRect.width + (moveEvent.clientX - startX),
					height: startRect.height + (moveEvent.clientY - startY),
					left: startRect.left,
					top: startRect.top,
				});
				this.applyLayout(nextLayout);
			};

			const onPointerUp = (upEvent: PointerEvent) => {
				handleEl.releasePointerCapture(upEvent.pointerId);
				handleEl.removeEventListener("pointermove", onPointerMove);
				handleEl.removeEventListener("pointerup", onPointerUp);
				handleEl.removeEventListener("pointercancel", onPointerUp);
				this.persistCurrentLayout();
			};

			handleEl.addEventListener("pointermove", onPointerMove);
			handleEl.addEventListener("pointerup", onPointerUp, { once: true });
			handleEl.addEventListener("pointercancel", onPointerUp, { once: true });
		};

		handleEl.addEventListener("pointerdown", onPointerDown);
		this.teardownHandlers.push(() => handleEl.removeEventListener("pointerdown", onPointerDown));
	}

	private applyLayout(layout: ModelPickerLayoutState): void {
		if (!this.modalContainerEl) return;
		this.modalContainerEl.style.width = `${layout.width}px`;
		this.modalContainerEl.style.height = `${layout.height}px`;
		this.modalContainerEl.style.maxWidth = `${layout.width}px`;
		this.modalContainerEl.style.minWidth = `${layout.width}px`;
		this.modalContainerEl.style.maxHeight = `${layout.height}px`;
		this.modalContainerEl.style.minHeight = `${layout.height}px`;
		this.modalContainerEl.style.left = `${layout.left ?? VIEWPORT_PADDING}px`;
		this.modalContainerEl.style.top = `${layout.top ?? VIEWPORT_PADDING}px`;
		this.modalContainerEl.style.position = "fixed";
		this.applySplitRatio();
	}

	private clampSplitRatio(ratio: number): number {
		if (!Number.isFinite(ratio)) return MODEL_PICKER_DEFAULT_SPLIT_RATIO;
		const layoutWidth = this.layoutEl?.getBoundingClientRect().width ?? MODEL_PICKER_DEFAULT_WIDTH;
		const availableWidth = Math.max(1, layoutWidth - MODEL_PICKER_SPLITTER_WIDTH);
		const minRatio = Math.min(0.9, MODEL_PICKER_MIN_LIST_WIDTH / availableWidth);
		const maxRatio = Math.max(minRatio, 1 - (MODEL_PICKER_MIN_DETAILS_WIDTH / availableWidth));
		return Math.min(Math.max(ratio, minRatio), maxRatio);
	}

	private applySplitRatio(): void {
		const layoutEl = this.layoutEl;
		const listEl = this.listEl;
		if (!layoutEl || !listEl) return;
		const layoutWidth = layoutEl.getBoundingClientRect().width;
		const availableWidth = Math.max(1, layoutWidth - MODEL_PICKER_SPLITTER_WIDTH);
		this.splitRatio = this.clampSplitRatio(this.splitRatio);
		const listWidth = Math.round(availableWidth * this.splitRatio);
		const maxListWidth = Math.max(MODEL_PICKER_MIN_LIST_WIDTH, availableWidth - MODEL_PICKER_MIN_DETAILS_WIDTH);
		listEl.style.width = `${Math.min(Math.max(listWidth, MODEL_PICKER_MIN_LIST_WIDTH), maxListWidth)}px`;
		listEl.style.minWidth = `${MODEL_PICKER_MIN_LIST_WIDTH}px`;
		listEl.style.maxWidth = `${maxListWidth}px`;
	}

	private getDefaultLayout(): ModelPickerLayoutState {
		if (typeof window === "undefined") {
			return { width: MODEL_PICKER_DEFAULT_WIDTH, height: MODEL_PICKER_DEFAULT_HEIGHT, left: VIEWPORT_PADDING, top: VIEWPORT_PADDING };
		}
		const maxWidth = Math.max(320, window.innerWidth - VIEWPORT_PADDING * 2);
		const maxHeight = Math.max(260, window.innerHeight - VIEWPORT_PADDING * 2);
		const width = Math.min(MODEL_PICKER_DEFAULT_WIDTH, maxWidth);
		const height = Math.min(MODEL_PICKER_DEFAULT_HEIGHT, maxHeight);
		const left = Math.max(VIEWPORT_PADDING, (window.innerWidth - width) / 2);
		const top = Math.max(VIEWPORT_PADDING, (window.innerHeight - height) / 2);
		return {
			width,
			height,
			left,
			top,
			splitRatio: MODEL_PICKER_DEFAULT_SPLIT_RATIO,
		};
	}

	private clampLayoutToViewport(layout: ModelPickerLayoutState): ModelPickerLayoutState {
		if (typeof window === "undefined") return layout;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const availableWidth = Math.max(320, viewportWidth - VIEWPORT_PADDING * 2);
		const availableHeight = Math.max(260, viewportHeight - VIEWPORT_PADDING * 2);
		const minWidth = Math.min(MODEL_PICKER_MIN_WIDTH, availableWidth);
		const minHeight = Math.min(MODEL_PICKER_MIN_HEIGHT, availableHeight);
		const width = Math.max(Math.min(layout.width, availableWidth), minWidth);
		const height = Math.max(Math.min(layout.height, availableHeight), minHeight);
		const maxLeft = viewportWidth - width - VIEWPORT_PADDING;
		const maxTop = viewportHeight - height - VIEWPORT_PADDING;
		const fallbackLeft = Math.max(VIEWPORT_PADDING, (viewportWidth - width) / 2);
		const fallbackTop = Math.max(VIEWPORT_PADDING, (viewportHeight - height) / 2);
		const left = Math.min(Math.max(layout.left ?? fallbackLeft, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, maxLeft));
		const top = Math.min(Math.max(layout.top ?? fallbackTop, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, maxTop));
		return {
			width,
			height,
			left,
			top,
			splitRatio: typeof layout.splitRatio === "number" ? this.clampSplitRatio(layout.splitRatio) : this.splitRatio,
		};
	}

	private readStoredLayout(): ModelPickerLayoutState | null {
		if (typeof window === "undefined") return null;
		try {
			const raw = window.localStorage.getItem(MODEL_PICKER_LAYOUT_STORAGE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as Partial<ModelPickerLayoutState>;
			if (typeof parsed.width !== "number" || typeof parsed.height !== "number") return null;
			return {
				width: parsed.width,
				height: parsed.height,
				left: typeof parsed.left === "number" ? parsed.left : undefined,
				top: typeof parsed.top === "number" ? parsed.top : undefined,
				splitRatio: typeof parsed.splitRatio === "number" ? parsed.splitRatio : undefined,
			};
		} catch {
			return null;
		}
	}

	private persistCurrentLayout(): void {
		const containerEl = this.modalContainerEl;
		if (!containerEl || typeof window === "undefined") return;
		const rect = containerEl.getBoundingClientRect();
		const clamped = this.clampLayoutToViewport({
			width: rect.width,
			height: rect.height,
			left: rect.left,
			top: rect.top,
			splitRatio: this.splitRatio,
		});
		try {
			window.localStorage.setItem(MODEL_PICKER_LAYOUT_STORAGE_KEY, JSON.stringify(clamped));
		} catch {
			// Ignore localStorage write failures.
		}
	}
}

/**
 * Convenience helper to open a searchable model picker modal.
 *
 * @param app - Obsidian app instance.
 * @param options - Modal options.
 */
export function openModelPickerModal(app: App, options: ModelPickerModalOptions): void {
	const modal = new ModelPickerModal(app, options);
	modal.open();
}
