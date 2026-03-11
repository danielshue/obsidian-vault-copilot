/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BaseCopilotChatView
 * @description Base chat view providing all functionality needed by the Basic plugin:
 * sessions, messages, streaming chat, model/tool selection, note context picker,
 * welcome message, and tool execution.
 *
 * ## Architecture
 *
 * ```
 * BaseCopilotChatView (ItemView)
 *   ├── SessionPanel (sidebar)
 *   ├── BaseToolbarManager (brain icon, model selector, tool selector)
 *   ├── ContextPicker (notes only in base)
 *   ├── MessagesContainer
 *   │    └── MessageRenderer
 *   └── InputArea
 *        └── SendButton
 * ```
 *
 * ## Extension points for Pro
 *
 * Pro's `CopilotChatView` extends this class and:
 * - Replaces `toolbarManager` with `ToolbarManager` (adds agent selector + voice buttons)
 * - Overrides `onAfterOpen()` to wire `PromptPicker` and skill-extended `ContextPicker`
 * - Overrides `getPluginSettingsTabId()` to return the Pro plugin ID
 * - Overrides `onPreSend()`, `preSendHook()`, `onAfterResponse()`, `syncAgentWithRuntime()`,
 *   and `onAfterSessionSave()` to inject Pro behaviour into the send flow
 * - Overrides `restoreMiddlePanel()` for expand-chat support
 *
 * @see {@link CopilotChatView} (Pro) for the extended implementation
 * @since 0.1.0
 */

import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import type { CopilotSession } from "../settings/types";
import { SessionPanel } from "./components/SessionPanel";
import { ContextPicker } from "./pickers/ContextPicker";
import { ContextAugmentation } from "./processing/ContextAugmentation";
import { MessageRenderer, ActivityPanel } from "./renderers/MessageRenderer";
import { SessionManager } from "./managers/SessionManager";
import { InputAreaManager } from "./managers/InputAreaManager";
import { MessageContextBuilder } from "./processing/MessageContextBuilder";
import { NoProviderPlaceholder } from "./components/NoProviderPlaceholder";
import { EditorSelectionManager } from "./components/EditorSelectionManager";
import { renderWelcomeMessage } from "./renderers/WelcomeMessage";
import { checkAnyProviderAvailable } from "../../utils/providerAvailability";
import { isDesktop } from "../../utils/platform";
import { ToolCatalog } from "../../copilot/tools/ToolCatalog";
import { BaseToolbarManager, type BasePluginLike, type BaseToolbarCallbacks } from "./managers/BaseToolbarManager";
import { GitHubCopilotCliService } from "../../copilot/providers/GitHubCopilotCliService";
import { NotificationService } from "../notifications/NotificationService";
import { NotificationPanel } from "../notifications/NotificationPanel";
import type { VaultCopilotExtensionAPIImpl } from "../../api/VaultCopilotExtensionAPI";

export const COPILOT_VIEW_TYPE = "copilot-chat-view";

// ─── Internal type helpers ────────────────────────────────────────────────────

type AppWithSettingsApi = {
	setting?: {
		open: () => void;
		openTabById: (id: string) => void;
	};
};

type WorkspaceWithSplits = {
	isMiddlePanelVisible?: () => boolean;
	hideMiddlePanel?: () => void;
};

type AIServiceWithCallbacks = {
	setSessionReconnectCallback?: (callback: () => void) => void;
	setShowMarkdownCallback?: (callback: (content: string, title?: string) => void) => void;
	setSpeakCallback?: (callback: (text: string) => Promise<void>) => void;
	setSendToChatCallback?: (callback: (content: string, title?: string) => void) => void;
};

// ─── Base view ────────────────────────────────────────────────────────────────

/**
 * The full-featured base chat view used by the Basic plugin.
 * Pro extends this class to add agents, voice, prompt picker, and slash commands.
 */
export class BaseCopilotChatView extends ItemView {
	/** The plugin instance — typed as minimal interface; Pro re-stores as `CopilotPlugin`. */
	public plugin: BasePluginLike;

	/** The active AI service (CLI or alternative provider). */
	protected githubCopilotCliService: GitHubCopilotCliService;

	// ─── DOM elements
	protected messagesContainer!: HTMLElement;
	protected inputArea: HTMLElement | null = null;
	protected inputEl!: HTMLDivElement;
	protected sendButton!: HTMLButtonElement;
	private isProcessing = false;
	private currentStreamingMessageEl: HTMLElement | null = null;
	protected inputAreaManager!: InputAreaManager;
	private attachmentsContainer: HTMLElement | null = null;
	protected sessionPanel: SessionPanel | null = null;
	private sessionPanelEl: HTMLElement | null = null;
	protected mainViewEl: HTMLElement | null = null;
	private sessionPanelVisible = false;
	private resizerEl: HTMLElement | null = null;
	private sessionToggleBtnEl: HTMLElement | null = null;
	private isExpanded = false;
	private expandBtnEl: HTMLElement | null = null;
	private originalMiddlePanelVisible: boolean | null = null;
	private isResizing = false;
	protected contextPickerEl: HTMLElement | null = null;
	protected contextPicker: ContextPicker | null = null;

	// ─── Tool catalog (no skillRegistry/mcpManager in Base)
	protected toolCatalog: ToolCatalog;

	// ─── Sub-managers
	protected contextAugmentation: ContextAugmentation;
	protected messageRenderer: MessageRenderer;
	protected sessionManager: SessionManager;
	protected messageContextBuilder: MessageContextBuilder;

	// ─── Toolbar
	protected toolbarManager: BaseToolbarManager;

	// ─── Notifications
	protected notificationService: NotificationService;
	private notificationPanel: NotificationPanel | null = null;
	private bellBtnEl: HTMLButtonElement | null = null;
	private bellBadgeEl: HTMLElement | null = null;
	private notifUnsubscribes: Array<() => void> = [];

	// ─── Misc state
	protected thinkingIndicatorEl: HTMLElement | null = null;
	private noProviderPlaceholder: NoProviderPlaceholder | null = null;
	protected editorSelectionManager: EditorSelectionManager;

	/**
	 * @param leaf - Workspace leaf hosting this view
	 * @param plugin - Plugin instance (BasicCopilotPlugin or CopilotPlugin)
	 * @param service - Active AI service (or null on mobile without a provider)
	 */
	constructor(leaf: WorkspaceLeaf, plugin: BasePluginLike, service: GitHubCopilotCliService | null) {
		super(leaf);
		this.plugin = plugin;
		this.githubCopilotCliService = service as GitHubCopilotCliService;

		// Use the notification service from the Extension API (shared with Pro/Shell)
		// so that agents can push notifications via api.addNotification().
		const extensionAPI = (plugin as { extensionAPI?: VaultCopilotExtensionAPIImpl }).extensionAPI;
		this.notificationService = extensionAPI?.notificationService ?? new NotificationService();

		// Tool catalog — no skill registry or MCP manager in Base
		this.toolCatalog = new ToolCatalog();

		this.contextAugmentation = new ContextAugmentation(plugin.app);
		this.messageRenderer = new MessageRenderer(plugin.app, this as never);

		// Wire in a render registry if the extension API provides one
		const renderRegistry = (plugin as { extensionAPI?: { renderRegistry?: unknown } }).extensionAPI?.renderRegistry;
		if (renderRegistry) {
			this.messageRenderer.setRenderRegistry(renderRegistry as never);
		}

		this.editorSelectionManager = new EditorSelectionManager(plugin.app);

		const activeService = this.getActiveAIService();
		this.wireOutputCallbacks(activeService);

		this.sessionManager = new SessionManager(
			plugin.settings,
			activeService as never,
			() => plugin.saveSettings(),
			{
				onSessionCreated: () => {
					if (this.inputAreaManager) {
						this.inputAreaManager.clearInput();
						this.inputAreaManager.clearAttachments();
						this.inputAreaManager.resetHistory();
					}
				},
				onSessionLoaded: () => {
					if (this.inputAreaManager) this.inputAreaManager.resetHistory();
				},
				onHeaderUpdate: () => this.updateHeaderTitle(),
				onSessionPanelHide: () => {
					if (this.sessionPanelVisible) this.toggleSessionPanel();
				},
				onAgentReset: async () => {
					// Base: no agent cache to refresh
				},
				onClearUI: () => this.messagesContainer.empty(),
				onLoadMessages: () => this.loadMessages(),
				onShowWelcome: () => this.addWelcomeMessage(),
			},
		);

		this.messageContextBuilder = new MessageContextBuilder(
			plugin.app,
			plugin,
			this.contextAugmentation,
			this.githubCopilotCliService,
			this.createAgentInstructionProvider(),
		);

		// Base toolbar (model selector + tool selector)
		this.toolbarManager = this.createToolbarManager(
			plugin,
			this.githubCopilotCliService as never,
			this.toolCatalog,
			{
				getCurrentSession: () => this.sessionManager.getCurrentSession(),
				saveSettings: () => plugin.saveSettings(),
				openPluginSettings: () => this.openPluginSettingsTab(),
				openToolPicker: () => this.toolbarManager.openToolPicker(),
			},
		);
	}

	/**
	 * Factory method for creating the toolbar manager. Pro overrides to return a
	 * `ToolbarManager` instance with agent selector and voice buttons.
	 *
	 * @param plugin - Plugin reference
	 * @param service - Service reference
	 * @param toolCatalog - Tool catalog
	 * @param callbacks - Base toolbar callbacks
	 * @returns A BaseToolbarManager (or subclass) instance
	 */
	protected createToolbarManager(
		plugin: BasePluginLike,
		service: never,
		toolCatalog: ToolCatalog,
		callbacks: BaseToolbarCallbacks,
	): BaseToolbarManager {
		return new BaseToolbarManager(plugin, service, toolCatalog, callbacks, {
			showAssistantIcon: false,
		});
	}

	/**
	 * Return the active AI service, preferring the CLI service if set.
	 * @throws {Error} When no service is configured
	 */
	protected getActiveAIService(): GitHubCopilotCliService {
		if (this.githubCopilotCliService) return this.githubCopilotCliService;
		throw new Error("No AI service is configured. Please configure an API key in settings.");
	}

	// ─── ItemView overrides ───────────────────────────────────────────────────────

	getViewType(): string { return COPILOT_VIEW_TYPE; }
	getDisplayText(): string { return "Vault Copilot"; }
	getIcon(): string { return "message-square"; }

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass("vc-chat-container");

		const layoutWrapper = container.createDiv({ cls: "vc-layout-wrapper" });
		this.mainViewEl = layoutWrapper.createDiv({ cls: "vc-main-view" });

		// Resizer (session panel drag)
		this.resizerEl = layoutWrapper.createDiv({ cls: "vc-resizer" });
		this.resizerEl.style.display = "none";
		this.setupResizer();

		// Session panel (right sidebar)
		this.sessionPanelEl = layoutWrapper.createDiv({ cls: "vc-session-panel-wrapper" });
		this.sessionPanelEl.style.display = "none";
		this.sessionPanel = new SessionPanel(this.plugin as never, this.sessionPanelEl, {
			onSessionSelect: (session) => this.loadSession(session),
			onNewSession: () => this.createNewSession(),
			onClose: () => this.toggleSessionPanel(),
		});

		// ─── Header ───────────────────────────────────────────────────────────────
		const header = this.mainViewEl.createDiv({ cls: "vc-chat-header" });
		const sessionTitle = header.createDiv({ cls: "vc-header-title" });
		sessionTitle.setText(this.getCurrentSessionName());

		const headerActions = header.createDiv({ cls: "vc-header-actions" });

		const newSessionBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "New session" },
		});
		setIcon(newSessionBtn, "plus");
		newSessionBtn.addEventListener("click", () => this.createNewSession());

		const settingsMenuBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "Settings menu" },
		});
		setIcon(settingsMenuBtn, "settings");
		settingsMenuBtn.addEventListener("click", (e) => this.toolbarManager.showSettingsMenu(e));

		this.sessionToggleBtnEl = headerActions.createEl("button", {
			cls: "vc-header-btn vc-session-toggle-btn",
			attr: { "aria-label": "Toggle sessions" },
		});
		setIcon(this.sessionToggleBtnEl, "panel-right");
		this.sessionToggleBtnEl.addEventListener("click", () => this.toggleSessionPanel());

		// ─── Bell / notification button ───────────────────────────────────────────
		this.bellBtnEl = headerActions.createEl("button", {
			cls: "vc-header-btn vc-bell-btn",
			attr: { "aria-label": "Notifications" },
		});
		setIcon(this.bellBtnEl, "bell");
		this.bellBadgeEl = this.bellBtnEl.createSpan({ cls: "vc-bell-badge" });
		this.bellBadgeEl.style.display = "none";
		this.bellBtnEl.addEventListener("click", () => this.toggleNotificationPanel());

		headerActions.createSpan({ cls: "vc-header-divider" });

		this.expandBtnEl = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "Expand chat" },
		});
		setIcon(this.expandBtnEl, "maximize");
		this.expandBtnEl.addEventListener("click", () => { void this.toggleExpandChat(); });

		const closePaneBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "Close chat" },
		});
		setIcon(closePaneBtn, "x");
		closePaneBtn.addEventListener("click", () => this.closeChatPane());

		// ─── Messages ─────────────────────────────────────────────────────────────
		this.messagesContainer = this.mainViewEl.createDiv({ cls: "vc-messages" });

		// ─── Input area ───────────────────────────────────────────────────────────
		this.inputArea = this.mainViewEl.createDiv({ cls: "vc-input-area" });
		const inputArea = this.inputArea;
		const inputWrapper = inputArea.createDiv({ cls: "vc-input-wrapper" });

		// Context row
		const contextRow = inputWrapper.createDiv({ cls: "vc-context-row" });
		const addContextBtn = contextRow.createEl("button", {
			cls: "vc-add-context",
			attr: { "aria-label": "Add context" },
		});
		addContextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`;
		addContextBtn.addEventListener("click", () => this.inputAreaManager?.openNotePicker());

		// Main text input
		this.inputEl = inputWrapper.createDiv({
			cls: "vc-input is-empty",
			attr: {
				contenteditable: "true",
				"data-placeholder": "Ask Vault Copilot anything",
			},
		}) as HTMLDivElement;

		this.contextPickerEl = inputWrapper.createDiv({ cls: "vc-context-picker" });
		this.contextPickerEl.style.display = "none";

		// Pro uses promptPickerEl — create a placeholder for it so Pro can find it
		const promptPickerEl = inputWrapper.createDiv({ cls: "vc-prompt-picker" });
		promptPickerEl.style.display = "none";
		// Store reference so Pro's onAfterOpen can access it
		(this as Record<string, unknown>)["promptPickerEl"] = promptPickerEl;

		// Bottom toolbar row
		const toolbarControls = inputWrapper.createDiv({ cls: "vc-toolbar-controls" });
		this.attachmentsContainer = toolbarControls.createDiv({ cls: "vc-attachments vc-attachments-toolbar" });
		const toolbarRightEl = toolbarControls.createDiv({ cls: "vc-toolbar-right" });

		// Selector toolbar below the input wrapper
		const inputToolbar = inputArea.createDiv({ cls: "vc-input-toolbar" });
		const toolbarLeft = inputToolbar.createDiv({ cls: "vc-toolbar-left" });

		// Wire InputAreaManager
		this.inputAreaManager = new InputAreaManager(this.plugin as never, this.inputEl, this.attachmentsContainer);

		// Build toolbar buttons (model, tool selectors)
		this.toolbarManager.createToolbarLeft(toolbarLeft);

		// Send button
		this.sendButton = toolbarRightEl.createEl("button", {
			cls: "vc-send-btn",
			attr: { "aria-label": "Send message (Enter or Ctrl-Alt-Enter)" },
		});
		this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;

		// Wire right toolbar (voice buttons + send position in Pro)
		this.toolbarManager.createToolbarRight(toolbarRightEl, this.sendButton);

		// ─── Event listeners ──────────────────────────────────────────────────────
		this.editorSelectionManager.setupSelectionChangeListener();
		this.editorSelectionManager.setupInputFocusListener(this.inputEl);

		this.contextPicker = this.createContextPicker(this.contextPickerEl);

		this.inputEl.addEventListener("keydown", (e) => {
			if (this.contextPicker?.handleKeyDown(e)) return;
			if (this.onKeyDownHook(e)) return;

			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				const isEmpty = (this.inputEl.textContent || "").trim() === "";
				if (isEmpty || e.key === "ArrowUp" || e.key === "ArrowDown") {
					e.preventDefault();
					this.inputAreaManager.navigateHistory(e.key === "ArrowUp" ? "up" : "down");
					return;
				}
			}

			if (e.key === "Enter" && (!e.shiftKey || (e.ctrlKey && e.altKey))) {
				e.preventDefault();
				this.beforeSend();
				void this.sendMessage();
			}
		});

		this.inputEl.addEventListener("input", () => {
			this.inputAreaManager.autoResizeInput();
			this.onInputChange();
			const isEmpty = (this.inputEl.textContent || "").trim() === "";
			this.inputEl.classList.toggle("is-empty", isEmpty);
			if (isEmpty && this.inputEl.childNodes.length > 0) {
				// Remove residual <br> nodes the browser inserts after deletion
				this.inputEl.innerHTML = "";
			}
		});

		this.inputEl.addEventListener("paste", (e: ClipboardEvent) => {
			this.handleImagePaste(e);
		});

		this.sendButton.addEventListener("click", () => this.handleSendOrCancel());

		// ─── Initial state ────────────────────────────────────────────────────────
		await this.loadMessages();

		if (this.githubCopilotCliService.getMessageHistory().length === 0) {
			this.addWelcomeMessage();
		}

		this.startService();
		this.registerKeyboardShortcuts();
		await this.updateProviderAvailabilityUI();

		// Hook: Pro wires PromptPicker and extends ContextPicker with skills
		await this.onAfterOpen();

		// ─── Notification panel setup ────────────────────────────────────────────
		this.setupNotifications();
	}

	// ─── Extension hooks ─────────────────────────────────────────────────────────

	/**
	 * Called at the end of `onOpen()`. Loads CLI MCP server tools into the catalog
	 * and refreshes the toolbar badge. Pro overrides to also wire `PromptPicker`,
	 * extend `ContextPicker` with skills, and subscribe to settings/session changes.
	 */
	protected async onAfterOpen(): Promise<void> {
		this.toolCatalog.loadCliMcpTools();
		this.toolbarManager.updateToolSelectorText();
	}

	// ─── Notification helpers ─────────────────────────────────────────────────────

	/**
	 * Wire up the notification service to the bell icon and toast display.
	 * Called once at the end of `onOpen()`.
	 * @internal
	 */
	private setupNotifications(): void {
		if (!this.mainViewEl) return;

		// Build the notification panel (lazy — only renders when toggled)
		this.notificationPanel = new NotificationPanel(
			this.notificationService,
			this.mainViewEl,
			() => this.openPluginSettingsTab(),
		);

		// Update the badge whenever the list changes
		const unsubChange = this.notificationService.onChange(() => {
			this.updateBellBadge();
			this.notificationPanel?.refresh();
		});
		this.notifUnsubscribes.push(unsubChange);

		// Show a brief toast for each incoming notification
		const unsubAdd = this.notificationService.onAdd((notif) => {
			this.showNotificationToast(notif.title, notif.body, notif.type);
		});
		this.notifUnsubscribes.push(unsubAdd);

		// Render initial badge state
		this.updateBellBadge();
	}

	/**
	 * Toggle the notification panel open or closed.
	 * @internal
	 */
	private toggleNotificationPanel(): void {
		if (!this.bellBtnEl || !this.notificationPanel) return;
		this.notificationPanel.toggle(this.bellBtnEl);
		// After toggling open, badge should clear (markAllRead is called inside panel.show)
		this.updateBellBadge();
	}

	/**
	 * Refresh the unread badge on the bell button.
	 * @internal
	 */
	private updateBellBadge(): void {
		if (!this.bellBadgeEl) return;
		const count = this.notificationService.getUnreadCount();
		if (count === 0) {
			this.bellBadgeEl.style.display = "none";
		} else {
			this.bellBadgeEl.style.display = "";
			this.bellBadgeEl.setText(count > 99 ? "99+" : String(count));
		}
	}

	/**
	 * Show a brief auto-dismissing toast notification at the bottom-right.
	 *
	 * @param title - Notification summary
	 * @param body - Optional detail text
	 * @param type - Severity level
	 * @internal
	 */
	private showNotificationToast(
		title: string,
		body?: string,
		type: "info" | "warning" | "error" = "info",
	): void {
		const typeIcon: Record<string, string> = {
			info: "info",
			warning: "alert-triangle",
			error: "alert-circle",
		};

		const toast = document.body.createDiv({
			cls: `vc-notification-toast vc-toast-${type}`,
		});

		const iconEl = toast.createDiv({ cls: "vc-toast-icon" });
		setIcon(iconEl, typeIcon[type] ?? "info");

		const contentEl = toast.createDiv({ cls: "vc-toast-content" });
		contentEl.createDiv({ cls: "vc-toast-title", text: title });
		if (body) {
			contentEl.createDiv({ cls: "vc-toast-body", text: body });
		}

		const dismissBtn = toast.createEl("button", {
			cls: "vc-toast-dismiss",
			attr: { "aria-label": "Dismiss" },
		});
		setIcon(dismissBtn, "x");

		const removeToast = () => {
			toast.addClass("vc-toast-hiding");
			setTimeout(() => toast.remove(), 200);
		};
		dismissBtn.addEventListener("click", removeToast);

		// Auto-dismiss after 4 seconds
		const timer = setTimeout(removeToast, 4000);
		toast.addEventListener("mouseenter", () => clearTimeout(timer));
	}

	/**
	 * Create the context picker for the note attachment chip UI.
	 * Pro overrides to also pass a `getSkills` callback.
	 *
	 * @param containerEl - The container for the picker dropdown
	 */
	protected createContextPicker(containerEl: HTMLElement): ContextPicker {
		return new ContextPicker({
			containerEl,
			inputEl: this.inputEl,
			getFiles: () => this.app.vault.getMarkdownFiles(),
			getSkills: () => [],
			onSelectFile: (file) => this.inputAreaManager.insertInlineChip(file),
			onSelectSkill: () => { /* No skill support in Base */ },
		});
	}

	/**
	 * Called when the input `keydown` event fires, after context picker handling.
	 * Pro overrides to intercept prompt picker navigation keys.
	 * Return `true` to mark the event as handled and stop further processing.
	 *
	 * @param _e - The keyboard event
	 */
	protected onKeyDownHook(_e: KeyboardEvent): boolean {
		return false;
	}

	/**
	 * Called on every `input` event after auto-resize. Pro overrides to also
	 * call `promptPicker.handleInput()` and `contextPicker.handleInput()` for skills.
	 */
	protected onInputChange(): void {
		this.contextPicker?.handleInput();
	}

	/**
	 * Called immediately before a message is sent (inside the Enter keydown handler).
	 * Pro overrides to call `promptPicker.checkAndClearJustSelected()`.
	 */
	protected beforeSend(): void {
		// Base: no-op
	}

	/**
	 * Called at the very start of `sendMessage()` before any processing.
	 * Pro overrides to call `setLastUserMessage()` and remove handoff buttons.
	 *
	 * @param _message - The raw user message text
	 */
	protected onPreSend(_message: string): void {
		// Base: no-op
	}

	/**
	 * Called after `ensureSessionExists()` and before context building.
	 * Return `true` if the message was fully handled (stops normal chat send).
	 * Pro overrides to handle slash commands and realtime agent messages.
	 *
	 * @param _message - The raw user message text
	 */
	protected async preSendHook(_message: string): Promise<boolean> {
		return false;
	}

	/**
	 * Pre-process the user's message before building context.
	 * Base is a passthrough (no #fetch URL expansion).
	 * Pro overrides to call `PromptProcessor.processFetchReferences()`.
	 *
	 * @param message - Raw user message
	 * @returns Processed message and any fetched content
	 * @internal
	 */
	protected async preprocessMessage(message: string): Promise<{ processedMessage: string; fetchedUrls: string[]; fetchedContext: string[] }> {
		return { processedMessage: message, fetchedUrls: [], fetchedContext: [] };
	}

	/**
	 * Create the agent instruction provider for this view.
	 *
	 * Base returns `undefined` (no agent support in Basic).
	 * Pro overrides this to return an async provider backed by `AgentCache`.
	 *
	 * @returns `undefined` in Basic; an `AgentInstructionProvider` in Pro
	 * @see {@link import('./processing/MessageContextBuilder').AgentInstructionProvider}
	 */
	protected createAgentInstructionProvider(): import('./processing/MessageContextBuilder').AgentInstructionProvider | undefined {
		return undefined;
	}

	/**
	 * Called after `ensureSessionExists()` to sync the selected agent to the SDK session.
	 * Base is a no-op; Pro calls `toolbarManager.syncSelectedAgentWithRuntime()`.
	 */
	protected async syncAgentWithRuntime(): Promise<void> {
		// Base: no agent to sync
	}

	/**
	 * Called from the `finally` block of `sendMessage()` after a response is complete.
	 * Pro overrides to render handoff buttons if the active agent defines any.
	 *
	 * @param _message - The original user message
	 */
	protected onAfterResponse(_message: string): void {
		// Base: no handoff buttons
	}

	/**
	 * Called after `sessionManager.saveCurrentSession()` completes.
	 * Pro overrides to call `plugin.notifySessionUpdate()` for Telegram integration.
	 */
	protected onAfterSessionSave(): void {
		// Base: no-op
	}

	/**
	 * Restore the editor middle panel after collapsing it for expand mode.
	 * Base is a no-op; Pro calls `plugin.activateMiddlePanel()`.
	 */
	protected async restoreMiddlePanel(): Promise<void> {
		// Base: no-op (BasicCopilotPlugin does not manage middle panel)
	}

	/**
	 * Return the settings tab ID for this plugin variant.
	 * Base returns `"obsidian-vault-copilot"`.
	 * Pro overrides to return `"obsidian-vault-copilot-pro"`.
	 */
	protected getPluginSettingsTabId(): string {
		return "obsidian-vault-copilot";
	}

	/**
	 * Resolve a CLI manager for provider availability checks.
	 *
	 * Supports both plugin shapes:
	 * - Pro style: `getCliManager()`
	 * - Basic style: `cliManager` property
	 *
	 * @returns CLI manager instance when available, otherwise `null`
	 */
	private getCliManagerForAvailability(): unknown {
		const plugin = this.plugin as {
			getCliManager?: () => unknown;
			cliManager?: unknown;
		};

		return plugin.getCliManager?.() ?? plugin.cliManager ?? null;
	}

	// ─── Provider availability ────────────────────────────────────────────────────

	private async updateProviderAvailabilityUI(): Promise<void> {
		const cliManager = this.getCliManagerForAvailability();
		const status = await checkAnyProviderAvailable(
			this.app,
			this.plugin.settings,
			cliManager as never,
		);

		if (status.available) {
			if (this.inputArea) this.inputArea.style.display = "";
			if (this.noProviderPlaceholder) this.noProviderPlaceholder.hide();
		} else {
			if (this.inputArea) this.inputArea.style.display = "none";

			if (!this.noProviderPlaceholder && this.mainViewEl) {
				this.noProviderPlaceholder = new NoProviderPlaceholder(
					this.mainViewEl,
					this.app,
					{
						onOpenSettings: () => this.openPluginSettingsTab(),
						onInstallCli: isDesktop ? () => {
							window.open("https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli", "_blank");
						} : undefined,
					},
				);
			} else if (this.noProviderPlaceholder) {
				this.noProviderPlaceholder.show();
			}
		}
	}

	protected openPluginSettingsTab(): void {
		const appWithSettings = this.app as unknown as AppWithSettingsApi;
		appWithSettings.setting?.open();
		appWithSettings.setting?.openTabById(this.getPluginSettingsTabId());
	}

	// ─── Send flow ────────────────────────────────────────────────────────────────

	private async sendMessage(): Promise<void> {
		const { text: message, chipFilePaths } = this.inputAreaManager.extractInputContent();
		if (!message || this.isProcessing) return;

		// Pre-send hook (Pro: setLastUserMessage, remove handoff buttons)
		this.onPreSend(message);

		this.editorSelectionManager.clearHighlight();
		this.inputAreaManager.addToHistory(message);

		this.isProcessing = true;
		this.updateUIState();
		this.showThinkingIndicator();

		this.inputEl.innerHTML = "";
		this.inputAreaManager.autoResizeInput();

		await this.ensureSessionExists();
		await this.syncAgentWithRuntime();

		const welcomeEl = this.messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) welcomeEl.remove();

		// Pre-send hook: slash commands, realtime agent, etc. (Pro)
		try {
			const handled = await this.preSendHook(message);
			if (handled) {
				this.isProcessing = false;
				this.updateUIState();
				this.hideThinkingIndicator();
				this.scrollToBottom();
				return;
			}
		} catch (error) {
			this.addErrorMessage(`Command error: ${error}`);
			this.isProcessing = false;
			this.updateUIState();
			this.hideThinkingIndicator();
			return;
		}

		// Pre-process message (Base: passthrough; Pro overrides for #fetch expansion)
		const { processedMessage, fetchedUrls, fetchedContext } =
			await this.preprocessMessage(message);

		// Build context (notes, chips, attachments)
		const { fullMessage, usedReferences } = await this.messageContextBuilder.buildContext({
			processedMessage,
			fetchedUrls,
			fetchedContext,
			chipFilePaths,
			attachedNotes: this.inputAreaManager.getAttachedNotes(),
			preservedSelectionText: this.editorSelectionManager.getPreservedSelectionText(),
			selectedAgent: this.toolbarManager.getSelectedAgent() as import('./processing/MessageContextBuilder').SelectedAgentRef | null,
		});

		const userMessageEl = await this.messageRenderer.renderMessage(this.messagesContainer, {
			role: "user",
			content: processedMessage,
			timestamp: new Date(),
		});

		if (usedReferences.length > 0) {
			this.messageRenderer.renderUsedReferences(this.messagesContainer, usedReferences);
		}

		const attachedImages = this.inputAreaManager.getAttachedImages();

		this.inputAreaManager.clearAttachments();
		this.inputAreaManager.clearImages();

		try {
			this.currentStreamingMessageEl = this.messageRenderer.createMessageElement(
				this.messagesContainer,
				"assistant",
				"",
			);

			if (userMessageEl) {
				requestAnimationFrame(() => this.scrollMessageToTop(userMessageEl));
			}

			this.toolbarManager.logToolContext();

			const activityPanel: ActivityPanel = this.messageRenderer.renderActivityPanel(
				this.messagesContainer,
				this.currentStreamingMessageEl,
				() => this.scrollToBottom(),
			);

			// Subscribe to service events for tool/sub-agent activity display
			const unsubscribeEvents = this.githubCopilotCliService.onEvent((event: unknown) => {
				const data = (event as Record<string, unknown>).data as Record<string, unknown> | undefined;
				switch ((event as Record<string, unknown>).type) {
					case "tool.execution_start":
						if (data) {
							activityPanel.addToolCall(
								String(data.toolName ?? "unknown"),
								String(data.toolCallId ?? ""),
								data.arguments ? JSON.stringify(data.arguments) : undefined,
							);
						}
						break;
					case "tool.execution_complete":
						if (data) {
							activityPanel.updateToolComplete(
								String(data.toolCallId ?? ""),
								(data.success as boolean) !== false,
							);
						}
						break;
					case "subagent.started":
						if (data) {
							activityPanel.addSubagent(
								String(data.agentDisplayName ?? data.agentName ?? "Sub-agent"),
								String(data.toolCallId ?? ""),
							);
						}
						break;
					case "subagent.completed":
						if (data) {
							activityPanel.updateSubagentComplete(String(data.toolCallId ?? ""), true);
						}
						break;
					case "subagent.failed":
						if (data) {
							activityPanel.updateSubagentComplete(String(data.toolCallId ?? ""), false);
						}
						break;
				}
			});

			let isFirstDelta = true;
			try {
				if (this.plugin.settings.streaming) {
					let lastScrollTime = 0;
					let accumulatedText = "";
					let renderChain: Promise<void> = Promise.resolve();
					let lastOnCompleteContent = "";
					const streamingEl = this.currentStreamingMessageEl;

					await this.githubCopilotCliService.sendMessageStreaming(
						fullMessage,
						(delta: string) => {
							if (isFirstDelta) { this.hideThinkingIndicator(); isFirstDelta = false; }
							accumulatedText += delta;
							if (streamingEl) {
								const contentEl = streamingEl.querySelector(".vc-message-content");
								if (contentEl) contentEl.textContent = accumulatedText;
							}
							const now = Date.now();
							if (now - lastScrollTime > 150) { lastScrollTime = now; this.scrollToBottom(); }
						},
						(fullContent: string) => {
							if (fullContent === lastOnCompleteContent) return;
							lastOnCompleteContent = fullContent;
							renderChain = renderChain.then(async () => {
								if (streamingEl) {
									try {
										await this.messageRenderer.renderMarkdownContent(streamingEl, fullContent);
									} catch {
										const contentEl = streamingEl.querySelector(".vc-message-content");
										if (contentEl) contentEl.textContent = fullContent;
									}
									this.messageRenderer.addCopyButton(streamingEl);
								}
								this.scrollToBottom();
							});
						},
						undefined,
						attachedImages.length > 0 ? attachedImages : undefined,
					);
					await renderChain;
					this.currentStreamingMessageEl = null;
				} else {
					this.hideThinkingIndicator();
					const response = await this.githubCopilotCliService.sendMessage(fullMessage, undefined, attachedImages.length > 0 ? attachedImages : undefined);
					if (this.currentStreamingMessageEl) {
						await this.messageRenderer.renderMarkdownContent(this.currentStreamingMessageEl, response);
						this.messageRenderer.addCopyButton(this.currentStreamingMessageEl);
					}
					this.currentStreamingMessageEl = null;
				}
			} finally {
				unsubscribeEvents();
				activityPanel.finalize();
			}
		} catch (error) {
			console.error("Vault Copilot error:", error);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.addErrorMessage(String(error));
		} finally {
			this.hideThinkingIndicator();

			// Hook: Pro renders handoff buttons here
			this.onAfterResponse(message);

			await this.sessionManager.autoRenameSessionFromFirstMessage(
				message,
				this.sessionPanel ? () => this.sessionPanel?.render() : undefined,
			);

			await this.sessionManager.saveCurrentSession();

			// Hook: Pro notifies Telegram / other consumers
			this.onAfterSessionSave();

			this.isProcessing = false;
			this.updateUIState();
		}
	}

	// ─── Session actions ──────────────────────────────────────────────────────────

	async createNewSession(name?: string): Promise<void> {
		await this.sessionManager.createNewSession(name);
		this.inputAreaManager?.renderAttachments();
	}

	async loadSession(session: CopilotSession): Promise<void> {
		await this.sessionManager.loadSession(session);
	}

	async saveCurrentSession(): Promise<void> {
		await this.sessionManager.saveCurrentSession();
	}

	async clearChat(): Promise<void> {
		await this.githubCopilotCliService.clearHistory();
		this.messagesContainer.empty();
		this.addWelcomeMessage();
	}

	protected async ensureSessionExists(): Promise<void> {
		await this.sessionManager.ensureSessionExists();
	}

	// ─── Settings refresh ─────────────────────────────────────────────────────────

	refreshFromSettings(): void {
		this.toolbarManager.refreshFromSettings();
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────────────────

	registerKeyboardShortcuts(): void {
		this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
			if (e.ctrlKey && e.key === "n" && this.containerEl.contains(document.activeElement)) {
				e.preventDefault();
				void this.createNewSession();
			}
		});
	}

	async onClose(): Promise<void> {
		if (this.isExpanded) {
			if (this.originalMiddlePanelVisible) await this.restoreMiddlePanel();
			this.originalMiddlePanelVisible = null;
			this.isExpanded = false;
		}
		this.toolbarManager.destroy();
		this.editorSelectionManager.destroy();
		if (this.noProviderPlaceholder) {
			this.noProviderPlaceholder.destroy();
			this.noProviderPlaceholder = null;
		}
		// Clean up notification resources
		this.notificationPanel?.destroy();
		this.notificationPanel = null;
		for (const unsub of this.notifUnsubscribes) unsub();
		this.notifUnsubscribes = [];
		// Pro cleans up additional resources in its onClose override
		await this.onAfterClose();
	}

	/**
	 * Hook called at the end of `onClose()`. Pro cleans up voice managers,
	 * settings change subscriptions, and session update subscriptions here.
	 */
	protected async onAfterClose(): Promise<void> {
		// Base: no-op
	}

	// ─── Private utility helpers ──────────────────────────────────────────────────

	private async startService(): Promise<void> {
		try {
			if (!this.githubCopilotCliService.isConnected()) {
				await this.githubCopilotCliService.start();

				this.wireSessionReconnectCallback(this.githubCopilotCliService);
				this.wireOutputCallbacks(this.githubCopilotCliService);

				const activeSessionId = this.plugin.settings.activeSessionId;
				if (activeSessionId) {
					const session = this.plugin.settings.sessions.find((s) => s.id === activeSessionId);
					if (session?.conversationId) {
						try {
							await this.githubCopilotCliService.loadSession(session.conversationId, session.messages || []);
						} catch {
							const freshConvId = await this.githubCopilotCliService.createSession();
							if (session && freshConvId) {
								session.conversationId = freshConvId;
								await this.plugin.saveSettings();
							}
						}
					} else {
						const convId = await this.githubCopilotCliService.createSession();
						if (session && convId) {
							session.conversationId = convId;
							await this.plugin.saveSettings();
						}
					}
				} else {
					await this.githubCopilotCliService.createSession();
				}

				// Pro calls plugin.updateStatusBar() here via hook
				this.onServiceStarted();
			}
		} catch (error) {
			console.error("Failed to start Copilot service:", error);
		}
	}

	/**
	 * Called after the service has successfully started and a session is active.
	 * Pro overrides to call `plugin.updateStatusBar()`.
	 */
	protected onServiceStarted(): void {
		// Base: no-op
	}

	private async loadMessages(): Promise<void> {
		const history = this.githubCopilotCliService.getMessageHistory();
		for (const message of history) {
			await this.messageRenderer.renderMessage(this.messagesContainer, message);
		}
		this.scrollToBottom();
	}

	private addWelcomeMessage(): void {
		if (!this.plugin.settings.displayWelcomeMessage) return;

		renderWelcomeMessage(this.messagesContainer, {
			onExampleClick: (text) => {
				this.inputEl.innerText = text;
				void this.sendMessage();
			},
			showWelcomeMessage: this.plugin.settings.displayWelcomeMessage,
			onShowWelcomeMessageChange: (showWelcomeMessage) => {
				this.plugin.settings.displayWelcomeMessage = showWelcomeMessage;
				void this.plugin.saveSettings();
			},
		});
	}

	private handleSendOrCancel(): void {
		if (this.isProcessing) void this.cancelRequest();
		else void this.sendMessage();
	}

	/**
	 * Handle a paste event on the input element.
	 * If the clipboard contains an image, it is captured as an attachment chip
	 * and the default paste is suppressed. Text pastes proceed normally.
	 *
	 * @param e - The ClipboardEvent from the paste listener
	 */
	private handleImagePaste(e: ClipboardEvent): void {
		const items = e.clipboardData?.items;
		if (!items) return;

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item && item.type.startsWith("image/")) {
				e.preventDefault();
				const blob = item.getAsFile();
				if (blob) {
					this.inputAreaManager.attachImageFromBlob(blob);
				}
				return;
			}
		}
	}

	private async cancelRequest(): Promise<void> {
		try {
			await this.githubCopilotCliService.abort();
			if (this.currentStreamingMessageEl) {
				const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
				if (contentEl && contentEl.textContent) {
					contentEl.textContent += "\n\n*[Generation cancelled]*";
				} else {
					this.currentStreamingMessageEl.remove();
				}
				this.currentStreamingMessageEl = null;
			}
			this.isProcessing = false;
			this.updateUIState();
		} catch (error) {
			console.error("Failed to cancel:", error);
		}
	}

	private updateUIState(): void {
		this.inputEl.contentEditable = this.isProcessing ? "false" : "true";

		if (this.isProcessing) {
			this.sendButton.addClass("vc-loading");
			this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect></svg>`;
			this.sendButton.setAttribute("aria-label", "Stop generation");
		} else {
			this.sendButton.removeClass("vc-loading");
			this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;
			this.sendButton.setAttribute("aria-label", "Send message");
		}
	}

	private addErrorMessage(error: string): void {
		const errorEl = this.messagesContainer.createDiv({ cls: "vc-error" });
		errorEl.createEl("span", { text: `Error: ${error}` });
	}

	private wireSessionReconnectCallback(service: GitHubCopilotCliService): void {
		const callbackService = service as unknown as AIServiceWithCallbacks;
		callbackService.setSessionReconnectCallback?.(() => this.showReconnectNotice());
	}

	private wireOutputCallbacks(service: GitHubCopilotCliService): void {
		const callbackService = service as unknown as AIServiceWithCallbacks;

		callbackService.setShowMarkdownCallback?.((content, title) => {
			this.postContentToChat(content, title);
		});

		callbackService.setSendToChatCallback?.((content, title) => {
			this.postContentToChat(content, title);
		});

		callbackService.setSpeakCallback?.(async (text) => {
			if (typeof window !== "undefined" && "speechSynthesis" in window) {
				const utterance = new SpeechSynthesisUtterance(text);
				window.speechSynthesis.speak(utterance);
			}
		});
	}

	private postContentToChat(content: string, title?: string): void {
		void this.messageRenderer.renderMessage(this.messagesContainer, {
			role: "assistant",
			content: title ? `## ${title}\n\n${content}` : content,
			timestamp: new Date(),
		});
		this.scrollToBottom();
	}

	private showReconnectNotice(): void {
		if (!this.messagesContainer) return;
		const noticeEl = this.messagesContainer.createDiv({ cls: "vc-reconnect-notice" });
		noticeEl.createEl("span", {
			text: "Session expired — reconnected. AI context was reset, but your chat history is preserved.",
		});
		this.scrollToBottom();
		setTimeout(() => {
			noticeEl.addClass("vc-reconnect-notice-fade");
			setTimeout(() => noticeEl.remove(), 500);
		}, 8000);
	}

	// ─── Thinking indicator ───────────────────────────────────────────────────────

	private showThinkingIndicator(): void {
		if (this.thinkingIndicatorEl || !this.inputArea) return;
		this.thinkingIndicatorEl = this.inputArea.createDiv({ cls: "vc-thinking" });
		this.thinkingIndicatorEl.createDiv({ cls: "vc-thinking-text" }).setText("Thinking...");
		const progressEl = this.thinkingIndicatorEl.createDiv({ cls: "vc-thinking-progress" });
		progressEl.createDiv({ cls: "vc-thinking-progress-bar" });
		if (this.inputArea.firstChild) {
			this.inputArea.insertBefore(this.thinkingIndicatorEl, this.inputArea.firstChild);
		}
	}

	private hideThinkingIndicator(): void {
		if (this.thinkingIndicatorEl) {
			this.thinkingIndicatorEl.remove();
			this.thinkingIndicatorEl = null;
		}
	}

	// ─── Layout helpers ───────────────────────────────────────────────────────────

	private toggleSessionPanel(): void {
		this.sessionPanelVisible = !this.sessionPanelVisible;

		if (this.sessionPanelEl) {
			this.sessionPanelEl.style.display = this.sessionPanelVisible ? "flex" : "none";
			if (this.sessionPanelVisible && this.sessionPanel) this.sessionPanel.render();
		}
		if (this.resizerEl) {
			this.resizerEl.style.display = this.sessionPanelVisible ? "block" : "none";
		}
		if (this.sessionToggleBtnEl) {
			this.sessionToggleBtnEl.style.display = this.sessionPanelVisible ? "none" : "flex";
		}
	}

	private async toggleExpandChat(): Promise<void> {
		const workspace = this.app.workspace as unknown as WorkspaceWithSplits;

		if (!this.isExpanded) {
			this.originalMiddlePanelVisible = workspace.isMiddlePanelVisible?.() ?? false;
			if (this.originalMiddlePanelVisible) workspace.hideMiddlePanel?.();
			this.isExpanded = true;
		} else {
			if (this.originalMiddlePanelVisible) await this.restoreMiddlePanel();
			this.originalMiddlePanelVisible = null;
			this.isExpanded = false;
		}

		if (this.expandBtnEl) {
			setIcon(this.expandBtnEl, this.isExpanded ? "minimize" : "maximize");
			this.expandBtnEl.setAttribute("aria-label", this.isExpanded ? "Restore chat layout" : "Expand chat");
		}
	}

	private closeChatPane(): void {
		if (this.isExpanded) {
			if (this.originalMiddlePanelVisible) void this.restoreMiddlePanel();
			this.originalMiddlePanelVisible = null;
			this.isExpanded = false;
		}
		this.leaf.detach();
	}

	private setupResizer(): void {
		if (!this.resizerEl) return;
		const resizer = this.resizerEl;

		const onMouseDown = (e: MouseEvent) => {
			e.preventDefault();
			this.isResizing = true;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		};

		const onMouseMove = (e: MouseEvent) => {
			if (!this.isResizing || !this.sessionPanelEl) return;
			const container = this.containerEl.children[1] as HTMLElement;
			if (!container) return;
			const containerRect = container.getBoundingClientRect();
			const newPanelWidth = containerRect.right - e.clientX;
			const constrained = Math.max(200, Math.min(containerRect.width * 0.5, newPanelWidth));
			this.sessionPanelEl.style.width = `${constrained}px`;
			this.sessionPanelEl.style.flex = "none";
		};

		const onMouseUp = () => {
			this.isResizing = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		resizer.addEventListener("mousedown", onMouseDown);
	}

	private getCurrentSessionName(): string {
		const id = this.plugin.settings.activeSessionId;
		if (id) {
			const session = this.plugin.settings.sessions.find((s) => s.id === id);
			if (session) return session.name;
		}
		return "New Chat";
	}

	protected updateHeaderTitle(): void {
		const titleEl = this.containerEl.querySelector(".vc-header-title");
		if (titleEl) titleEl.setText(this.getCurrentSessionName());
	}

	protected insertTextAtCursor(text: string): void {
		const existingText = this.inputEl.textContent || "";
		this.inputEl.textContent = existingText ? `${existingText} ${text}` : text;

		const range = document.createRange();
		const selection = window.getSelection();
		range.selectNodeContents(this.inputEl);
		range.collapse(false);
		if (selection) { selection.removeAllRanges(); selection.addRange(range); }

		this.inputAreaManager.autoResizeInput();
		this.inputEl.focus();
	}

	private scrollToBottom(): void {
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private scrollMessageToTop(messageEl: HTMLElement): void {
		const containerRect = this.messagesContainer.getBoundingClientRect();
		const messageRect = messageEl.getBoundingClientRect();
		this.messagesContainer.scrollTop =
			this.messagesContainer.scrollTop + (messageRect.top - containerRect.top);
	}
}
