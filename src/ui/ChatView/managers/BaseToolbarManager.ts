/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BaseToolbarManager
 * @description Base toolbar manager for the chat input area — brain icon, model selector,
 * tool selector, and a simplified settings menu (Tool Sets + Chat Settings).
 *
 * ## Extension points
 *
 * - `createAdditionalLeftButtons(el)` — Pro inserts the agent selector between the brain icon
 *   and the model selector.
 * - `onCreateRightButtons(toolbarRightEl, sendButton)` — Pro inserts voice/realtime buttons
 *   before the send button.
 * - `buildSettingsMenu(menu)` — Pro prepends additional menu items, then calls `super` so
 *   the base Tool Sets and Chat Settings entries always appear at the bottom.
 * - `refreshFromSettings()` — Pro calls `super` then refreshes voice toolbar.
 * - `destroy()` — Pro calls `super` then unsubscribes agentCache.
 *
 * @see {@link ToolbarManager} (Pro) for the extended implementation
 * @since 0.1.0
 */

import { App, Menu, setIcon } from "obsidian";
import type { CopilotPluginSettings, CopilotSession } from "../../settings/types";
import { getAvailableModels, getModelDisplayName, getModelLabel, getModelMultiplier } from "../../settings/utils";
import { getProfileById } from "../../settings/profiles";
import { IToolCatalog } from "../../../copilot/tools/ToolCatalog";
import { ToolPickerModal } from "../modals/ToolPickerModal";

/**
 * Describes a toolbar item that can be collapsed into the overflow menu.
 * Lower priority numbers are hidden first when space is constrained.
 * @internal
 */
export interface CollapsibleItem {
	/** The DOM element to show/hide */
	el: HTMLElement;
	/** Collapse priority — lower numbers hide first */
	priority: number;
	/** Identifier used to check which items are hidden (e.g. 'model', 'agent', 'tool') */
	type: string;
}


/**
 * Minimal plugin interface required by BaseToolbarManager.
 * Both `BasicCopilotPlugin` and `CopilotPlugin` (Pro) satisfy this structurally.
 */
export interface BasePluginLike {
	/** Obsidian App instance */
	app: App;
	/** Plugin settings */
	settings: CopilotPluginSettings;
	/** Persist settings to disk */
	saveSettings(): Promise<void>;
}

/**
 * Minimal service interface required by BaseToolbarManager.
 * Both `GitHubCopilotCliService` and `GitHubCopilotCliProService` satisfy this.
 */
export interface BaseServiceLike {
	/** Update the active service configuration (e.g., model change) */
	updateConfig(config: { model?: string }): void;
	/** Create or recreate the active chat session */
	createSession(sessionId?: string): Promise<string>;
}

/**
 * Callbacks required by the base toolbar. Pro extends this interface with
 * `openExtensionBrowser` and `openVoiceHistory`.
 */
export interface BaseToolbarCallbacks {
	/** Return the currently active session, if any */
	getCurrentSession: () => CopilotSession | undefined;
	/** Persist plugin settings */
	saveSettings: () => Promise<void>;
	/** Open the plugin settings tab */
	openPluginSettings: () => void;
	/** Open the tool picker modal */
	openToolPicker: () => void;
}

/**
 * Optional UI behavior flags for the base toolbar.
 */
export interface BaseToolbarManagerOptions {
	/**
	 * Whether to render the leading assistant icon button in the left toolbar.
	 * Defaults to `true`.
	 */
	showAssistantIcon?: boolean;
}

/**
 * Base toolbar manager — brain icon, model selector, tool selector, and simplified gear menu.
 *
 * Override the protected hook methods to add Pro-specific behaviour without touching this class.
 */
export class BaseToolbarManager {
	protected readonly plugin: BasePluginLike;
	protected readonly service: BaseServiceLike;
	protected readonly toolCatalog: IToolCatalog;
	protected readonly callbacks: BaseToolbarCallbacks;

	protected modelSelectorEl: HTMLButtonElement | null = null;
	protected toolSelectorEl: HTMLButtonElement | null = null;
	protected toolbarRightEl: HTMLDivElement | null = null;
	protected sendButton: HTMLButtonElement | null = null;
	protected readonly showAssistantIcon: boolean;

	// Overflow collapse state
	protected overflowBtn: HTMLButtonElement | null = null;
	private toolbarLeftEl: HTMLDivElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private collapsibleItems: CollapsibleItem[] = [];
	protected hiddenItems: Set<string> = new Set();

	/**
	 * @param plugin - Minimal plugin reference (settings + saveSettings)
	 * @param service - Minimal service reference (updateConfig + createSession)
	 * @param toolCatalog - Tool catalog for tool selector state
	 * @param callbacks - Toolbar action callbacks
	 * @param options - Optional toolbar UI flags
	 */
	constructor(
		plugin: BasePluginLike,
		service: BaseServiceLike,
		toolCatalog: IToolCatalog,
		callbacks: BaseToolbarCallbacks,
		options?: BaseToolbarManagerOptions,
	) {
		this.plugin = plugin;
		this.service = service;
		this.toolCatalog = toolCatalog;
		this.callbacks = callbacks;
		this.showAssistantIcon = options?.showAssistantIcon ?? true;
	}

	/**
	 * Get the currently selected agent. Returns `null` in Base (no agent selection).
	 * Pro's `ToolbarManager` overrides to return the active `CachedAgentInfo`.
	 *
	 * @returns `null` in Base; `CachedAgentInfo | null` in Pro
	 */
	getSelectedAgent(): unknown {
		return null;
	}

	// ─── DOM builders ──────────────────────────────────────────────────────────

	/**
	 * Build the left toolbar: brain icon → [extra buttons] → model selector → tool selector.
	 *
	 * @param toolbarLeft - Container element for left-side toolbar buttons
	 */
	createToolbarLeft(toolbarLeft: HTMLDivElement): void {
		if (this.showAssistantIcon) {
			const brainIconBtn = toolbarLeft.createEl("button", {
				cls: "vc-brain-icon-btn",
				attr: { "aria-label": "AI Assistant" },
			});
			brainIconBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>`;
		}

		// Hook: Pro inserts agent selector between brain icon and model selector
		this.createAdditionalLeftButtons(toolbarLeft);

		// Model selector
		this.modelSelectorEl = toolbarLeft.createEl("button", {
			cls: "vc-model-selector",
			attr: { "aria-label": "Select model" },
		});
		this.updateModelSelectorText();
		this.setupModelSelector();

		// Tool selector
		this.toolSelectorEl = toolbarLeft.createEl("button", {
			cls: "vc-tool-selector",
			attr: { "aria-label": "Select tools" },
		});
		this.updateToolSelectorText();
		this.toolSelectorEl.addEventListener("click", () => this.callbacks.openToolPicker());

		// Overflow "..." button (hidden until items need to collapse)
		this.overflowBtn = toolbarLeft.createEl("button", {
			cls: "vc-toolbar-overflow-btn vc-toolbar-btn",
			attr: { "aria-label": "More options" },
		});
		this.overflowBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>`;
		this.overflowBtn.addEventListener("click", (e) => this.showOverflowMenu(e as MouseEvent));

		// Register collapsible items (lower priority = hidden first)
		// Collapse order: tools first → model → agent (Pro) last
		this.registerCollapsibleItem(this.toolSelectorEl, 1, "tool");
		this.registerCollapsibleItem(this.modelSelectorEl, 2, "model");

		// Start observing toolbar width for overflow
		this.toolbarLeftEl = toolbarLeft;
		this.setupToolbarOverflow();
	}

	/**
	 * Hook for subclasses to insert buttons between the brain icon and the model selector.
	 * Base implementation is a no-op; Pro inserts the agent selector here.
	 *
	 * @param _el - The left toolbar container element
	 */
	protected createAdditionalLeftButtons(_el: HTMLDivElement): void {
		// no-op — Pro overrides to add agent selector
	}

	/**
	 * Wire the right toolbar references. Call after the send button has been appended to
	 * `toolbarRightEl`. In Base the send button is already last; Pro's hook adds voice buttons
	 * before it by temporarily detaching and re-appending.
	 *
	 * @param toolbarRightEl - Right toolbar container
	 * @param sendButton - The send/stop button element
	 */
	createToolbarRight(toolbarRightEl: HTMLDivElement, sendButton: HTMLButtonElement): void {
		this.toolbarRightEl = toolbarRightEl;
		this.sendButton = sendButton;
		// Hook: Pro detaches send button, adds voice/realtime buttons, re-appends send
		this.onCreateRightButtons(toolbarRightEl, sendButton);
	}

	/**
	 * Hook for subclasses to insert buttons before the send button.
	 * Base is a no-op (send button is already last in the DOM).
	 */
	protected onCreateRightButtons(_toolbarRightEl: HTMLDivElement, _sendButton: HTMLButtonElement): void {
		// no-op — Pro overrides to add voice/realtime buttons
	}

	// ─── Settings menu ──────────────────────────────────────────────────────────

	/**
	 * Show the gear settings dropdown anchored to the triggering mouse event.
	 *
	 * @param e - The click event on the gear button
	 */
	showSettingsMenu(e: Event): void {
		const menu = new Menu();
		this.buildSettingsMenu(menu);
		menu.showAtMouseEvent(e as MouseEvent);
	}

	/**
	 * Populate the settings dropdown menu.
	 *
	 * Base implementation adds **Tool Sets** and **Chat Settings**.
	 * Pro overrides this to prepend additional items, then calls `super.buildSettingsMenu(menu)`
	 * so the base items always appear at the bottom.
	 *
	 * @param menu - Obsidian Menu instance to populate
	 */
	protected buildSettingsMenu(menu: Menu): void {
		menu.addItem((item) => {
			item.setTitle("Tool Sets").setIcon("sliders-horizontal")
				.onClick(() => this.callbacks.openToolPicker());
		});
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("Chat Settings").setIcon("settings")
				.onClick(() => this.callbacks.openPluginSettings());
		});
	}

	// ─── Refresh / update helpers ───────────────────────────────────────────────

	/**
	 * Refresh toolbar state after settings change: validates the active model,
	 * syncs service config, and updates model selector text.
	 * Pro overrides to also call `refreshVoiceToolbar()`.
	 */
	refreshFromSettings(): void {
		const availableModels = getAvailableModels(this.plugin.settings);
		const firstModel = availableModels[0];
		if (firstModel && !availableModels.includes(this.plugin.settings.model)) {
			this.plugin.settings.model = firstModel;
			void this.plugin.saveSettings();
		}
		this.updateModelSelectorText();
		this.service.updateConfig({ model: this.plugin.settings.model });
	}

	/**
	 * Refresh the model selector button label. Hides the button for Azure OpenAI profiles
	 * (where the deployment name is fixed and model selection is irrelevant).
	 */
	updateModelSelectorText(): void {
		if (!this.modelSelectorEl) return;

		const profileId = this.plugin.settings.chatProviderProfileId;
		const profile = getProfileById(this.plugin.settings, profileId);

		if (profile && profile.type === "azure-openai") {
			this.modelSelectorEl.style.display = "none";
		} else {
			this.modelSelectorEl.style.display = "";
			const provider = this.getModelProvider(this.plugin.settings.model);
			const providerIcon = this.getModelProviderIcon(provider);
			const modelName = getModelDisplayName(this.plugin.settings.model);
			this.modelSelectorEl.innerHTML = `${providerIcon}<span class="vc-model-selector-text">${modelName}</span>`;
		}
	}

	/**
	 * Refresh the tool selector badge (enabled/total count).
	 */
	updateToolSelectorText(): void {
		if (!this.toolSelectorEl) return;

		const currentSession = this.callbacks.getCurrentSession();
		const summary = this.toolCatalog.getToolsSummary(this.plugin.settings, currentSession);

		this.toolSelectorEl.empty();
		setIcon(this.toolSelectorEl, "sliders-horizontal");
		this.toolSelectorEl.setAttribute("aria-label", `Tools ${summary.enabled}/${summary.total}`);

		if (summary.enabled < summary.total) {
			this.toolSelectorEl.addClass("vc-tools-filtered");
		} else {
			this.toolSelectorEl.removeClass("vc-tools-filtered");
		}
	}

	// ─── Tool picker / diagnostics ───────────────────────────────────────────────

	/**
	 * Open the tool picker modal for the current session.
	 *
	 * @example
	 * ```typescript
	 * this.toolbarManager.openToolPicker();
	 * ```
	 */
	openToolPicker(): void {
		const currentSession = this.callbacks.getCurrentSession();
		new ToolPickerModal(this.plugin.app, {
			toolCatalog: this.toolCatalog,
			settings: this.plugin.settings,
			session: currentSession,
			mode: "session",
			onSave: async (enabledTools) => {
				if (currentSession) {
					currentSession.toolOverrides = { enabled: enabledTools };
					await this.callbacks.saveSettings();
					await this.service.createSession(currentSession.id);
				}
				this.updateToolSelectorText();
			},
		}).open();
	}

	/**
	 * Log the current tool context (enabled/total counts per source) to the tracing service.
	 *
	 * @param promptTools - Optional list of tools explicitly specified by a prompt
	 */
	/**
	 * Log the current tool context to diagnostics.
	 * Base is a no-op; Pro's ToolbarManager overrides to log via TracingService.
	 *
	 * @param _promptTools - Optional list of tools explicitly specified by a prompt
	 */
	logToolContext(_promptTools?: string[]): void {
		// Base: no TracingService dependency; Pro overrides
	}

	/**
	 * Show diagnostic information in the browser console.
	 * Pro includes this in the settings menu under "Diagnostics".
	 * @internal
	 */
	protected showDiagnostics(): void {
		const diagnostics: string[] = [];
		const serviceAny = this.service as { isConnected?: () => boolean };
		diagnostics.push(`**Service Status:** ${serviceAny.isConnected?.() ? "Connected" : "Disconnected"}`);
		diagnostics.push(`**Model:** ${this.plugin.settings.model}`);
		diagnostics.push(`**Streaming:** ${this.plugin.settings.streaming ? "Enabled" : "Disabled"}`);

		const session = this.callbacks.getCurrentSession();
		if (session) {
			diagnostics.push(`\n**Session:** ${session.name}`);
			diagnostics.push(`**Messages:** ${session.messages?.length || 0}`);
		}

		const tools = this.toolCatalog.getAllTools();
		diagnostics.push(`\n**Available Tools:** ${tools.length}`);

		const settings = this.plugin.settings as { agentDirectories?: unknown[]; promptDirectories?: unknown[]; skillDirectories?: unknown[] };
		diagnostics.push(`\n**Agent Directories:** ${settings.agentDirectories?.length ?? 0}`);
		diagnostics.push(`**Prompt Directories:** ${settings.promptDirectories?.length ?? 0}`);
		diagnostics.push(`**Skill Directories:** ${settings.skillDirectories?.length ?? 0}`);

		console.log(diagnostics.join("\n"));
	}

	// ─── Lifecycle ───────────────────────────────────────────────────────────────

	/**
	 * Release any subscriptions held by this manager.
	 * Base is a no-op; Pro unsubscribes from `agentCache`.
	 */
	destroy(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		this.collapsibleItems = [];
		this.hiddenItems.clear();
	}

	// ─── Toolbar overflow ────────────────────────────────────────────────────────

	/**
	 * Register a toolbar element as collapsible. Lower priority items are
	 * hidden first when the toolbar is too narrow.
	 *
	 * @param el - The DOM element to collapse
	 * @param priority - Collapse priority (lower = hidden sooner)
	 * @param type - Identifier string (e.g. 'model', 'agent', 'tool')
	 */
	protected registerCollapsibleItem(el: HTMLElement, priority: number, type: string): void {
		this.collapsibleItems.push({ el, priority, type });
		this.collapsibleItems.sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Set up a ResizeObserver on the toolbar to handle overflow collapse.
	 * @internal
	 */
	private setupToolbarOverflow(): void {
		if (!this.toolbarLeftEl) return;

		this.resizeObserver = new ResizeObserver(() => {
			this.updateOverflowState();
		});
		this.resizeObserver.observe(this.toolbarLeftEl);
	}

	/**
	 * Recalculate which toolbar items fit and hide/show accordingly.
	 * This runs inside a ResizeObserver callback, so DOM writes here
	 * are batched before the next paint (no visible flicker).
	 * @internal
	 */
	private updateOverflowState(): void {
		if (!this.toolbarLeftEl || !this.overflowBtn) return;

		// Phase 1: Show everything to measure natural width
		for (const item of this.collapsibleItems) {
			item.el.classList.remove("vc-toolbar-collapsed");
		}
		this.overflowBtn.classList.remove("is-visible");
		this.hiddenItems.clear();

		// If everything fits, we're done
		if (this.toolbarLeftEl.scrollWidth <= this.toolbarLeftEl.clientWidth) {
			return;
		}

		// Phase 2: Show overflow button, then progressively hide items
		this.overflowBtn.classList.add("is-visible");

		// Items sorted by priority ascending (lowest priority hidden first)
		for (const item of this.collapsibleItems) {
			item.el.classList.add("vc-toolbar-collapsed");
			this.hiddenItems.add(item.type);

			if (this.toolbarLeftEl.scrollWidth <= this.toolbarLeftEl.clientWidth) {
				break;
			}
		}
	}

	/**
	 * Show the overflow menu with options for all currently hidden toolbar items.
	 *
	 * @param e - The mouse event from the overflow button click
	 */
	protected showOverflowMenu(e: MouseEvent): void {
		const menu = new Menu();
		this.buildOverflowMenuItems(menu);
		this.showMenuAnchoredToTrigger(menu, e, this.overflowBtn);
	}

	/**
	 * Populate the overflow menu with VS Code-style picker launcher items.
	 * Pro overrides to add agent-specific items.
	 *
	 * @param menu - Obsidian Menu instance to populate
	 */
	protected buildOverflowMenuItems(menu: Menu): void {
		menu.addItem((item) => {
			item.setTitle("Open Model Picker").setIcon("cpu")
				.onClick(() => this.openModelPickerMenu());
		});

		menu.addItem((item) => {
			item.setTitle("Configure Tools...").setIcon("sliders-horizontal")
				.onClick(() => this.callbacks.openToolPicker());
		});
	}

	/**
	 * Programmatically open the model picker menu, anchored to the overflow button.
	 * Called from the overflow menu item and can be overridden by subclasses.
	 */
	protected openModelPickerMenu(): void {
		const menu = new Menu();
		const models = getAvailableModels(this.plugin.settings);
		const currentModel = this.plugin.settings.model;

		menu.addItem((item) => {
			item.setTitle("Model").setDisabled(true);
		});

		for (const modelId of models) {
			menu.addItem((item) => {
				const provider = this.getModelProvider(modelId);
				const isSelected = currentModel === modelId;
				const multiplier = getModelMultiplier(this.plugin.settings, modelId);
				item.setTitle(getModelDisplayName(modelId))
					.setChecked(isSelected)
					.onClick(async () => {
						this.plugin.settings.model = modelId;
						await this.callbacks.saveSettings();
						this.service.updateConfig({ model: modelId });
						this.updateModelSelectorText();
					});

				const itemEl = (item as unknown as { dom: HTMLElement }).dom;
				const titleEl = itemEl.querySelector(".menu-item-title") as HTMLElement | null;
				if (titleEl) {
					titleEl.innerHTML = "";
					const checkEl = document.createElement("span");
					checkEl.className = "vc-model-col-check";
					checkEl.textContent = isSelected ? "✓" : "";
					const nameEl = document.createElement("span");
					nameEl.className = "vc-model-col-name";
					nameEl.innerHTML = this.getModelProviderIcon(provider) + getModelDisplayName(modelId);
					const multEl = document.createElement("span");
					multEl.className = "vc-model-col-mult";
					multEl.textContent = multiplier !== undefined ? `${multiplier}x` : "";
					titleEl.append(checkEl, nameEl, multEl);
				}
			});
		}

		const anchor = this.overflowBtn ?? this.modelSelectorEl;
		if (anchor) {
			this.showMenuAnchoredToTrigger(menu, null as unknown as MouseEvent, anchor);
		}
		const menuEl = (menu as unknown as { dom?: HTMLElement }).dom;
		menuEl?.classList.add("vc-model-menu");
	}

	// ─── Private helpers ─────────────────────────────────────────────────────────

	/**
	 * Wire click handler to the model selector button.
	 * @internal
	 */
	private setupModelSelector(): void {
		if (!this.modelSelectorEl) return;

		this.modelSelectorEl.addEventListener("click", (e) => {
			const menu = new Menu();
			const models = getAvailableModels(this.plugin.settings);
			const currentModel = this.plugin.settings.model;

			// Header row
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

			for (const modelId of models) {
				menu.addItem((item) => {
					const provider = this.getModelProvider(modelId);
					const isSelected = currentModel === modelId;
					const multiplier = getModelMultiplier(this.plugin.settings, modelId);
					item.setTitle(getModelDisplayName(modelId))
						.onClick(async () => {
							this.plugin.settings.model = modelId;
							await this.callbacks.saveSettings();
							this.service.updateConfig({ model: modelId });
							this.updateModelSelectorText();
						});

					const itemEl = (item as unknown as { dom: HTMLElement }).dom;
					const titleEl = itemEl.querySelector(".menu-item-title") as HTMLElement | null;
					if (titleEl) {
						titleEl.innerHTML = "";
						const checkEl = document.createElement("span");
						checkEl.className = "vc-model-col-check";
						checkEl.textContent = isSelected ? "✓" : "";
						const nameEl = document.createElement("span");
						nameEl.className = "vc-model-col-name";
						nameEl.innerHTML = this.getModelProviderIcon(provider) + getModelDisplayName(modelId);
						const multEl = document.createElement("span");
						multEl.className = "vc-model-col-mult";
						multEl.textContent = multiplier !== undefined ? `${multiplier}x` : "";
						titleEl.append(checkEl, nameEl, multEl);
					}
				});
			}

			this.showMenuAnchoredToTrigger(menu, e as MouseEvent, this.modelSelectorEl);
			const menuEl = (menu as unknown as { dom?: HTMLElement }).dom;
			menuEl?.classList.add("vc-model-menu");
		});
	}

	/**
	 * Infer the provider family from a model identifier string.
	 *
	 * @param modelId - Raw model identifier from settings
	 * @returns Provider family for icon selection
	 */
	protected getModelProvider(modelId: string): "anthropic" | "openai" | "gemini" | "generic" {
		const normalized = modelId.toLowerCase();
		if (normalized.includes("claude")) return "anthropic";
		if (normalized.includes("gemini")) return "gemini";
		if (
			normalized.includes("gpt") ||
			normalized.includes("o1") ||
			normalized.includes("o3") ||
			normalized.includes("openai")
		) {
			return "openai";
		}
		return "generic";
	}

	/**
	 * Return an SVG icon span for a provider family.
	 *
	 * @param provider - Provider family
	 * @returns HTML string containing the icon span
	 */
	protected getModelProviderIcon(provider: "anthropic" | "openai" | "gemini" | "generic"): string {
		switch (provider) {
			case "anthropic":
				return `<span class="vc-model-provider-icon vc-model-provider-anthropic" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20 12 4l6 16"></path><path d="M8.7 13h6.6"></path></svg></span>`;
			case "openai":
				return `<span class="vc-model-provider-icon vc-model-provider-openai" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3.5"></circle></svg></span>`;
			case "gemini":
				return `<span class="vc-model-provider-icon vc-model-provider-gemini" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 14.5 9.5 21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z"></path></svg></span>`;
			default:
				return `<span class="vc-model-provider-icon vc-model-provider-generic" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle></svg></span>`;
		}
	}

	/**
	 * Show `menu` anchored to the lower-left of `triggerEl`, falling back to mouse position.
	 *
	 * @param menu - Obsidian Menu to display
	 * @param event - Triggering mouse event
	 * @param triggerEl - Element to anchor the menu to
	 */
	protected showMenuAnchoredToTrigger(menu: Menu, event: MouseEvent | null, triggerEl: HTMLElement | null): void {
		const menuApi = menu as unknown as {
			showAtPosition?: (pos: { x: number; y: number }) => void;
			showAtMouseEvent: (ev: MouseEvent) => void;
			dom?: HTMLElement;
		};

		if (!triggerEl || typeof menuApi.showAtPosition !== "function") {
			if (event) menuApi.showAtMouseEvent(event);
			return;
		}

		const rect = triggerEl.getBoundingClientRect();
		// Position above the trigger element
		menuApi.showAtPosition({
			x: Math.round(rect.left),
			y: Math.round(rect.top - 4),
		});

		const menuEl = menuApi.dom;
		if (!menuEl) return;

		window.requestAnimationFrame(() => {
			const margin = 8;
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const menuRect = menuEl.getBoundingClientRect();

			// Anchor above the trigger, left-aligned
			let left = rect.left;
			let top = rect.top - menuRect.height - 4;

			// Fall back below if not enough room above
			if (top < margin) {
				top = rect.bottom + 4;
			}

			left = Math.min(Math.max(left, margin), Math.max(margin, viewportWidth - margin - menuRect.width));
			top = Math.min(Math.max(top, margin), Math.max(margin, viewportHeight - margin - menuRect.height));

			menuEl.style.left = `${Math.round(left)}px`;
			menuEl.style.top = `${Math.round(top)}px`;
		});
	}
}
