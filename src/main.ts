/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BasicPlugin
 * @description Vault Copilot Basic — the core plugin providing GitHub Copilot integration,
 * chat UI, session management, and the Extension API.
 *
 * This is the minimal entry point that:
 * - Connects to GitHub Copilot via the CLI SDK
 * - Provides the core chat view
 * - Exposes the Extension API for Pro and third-party plugins
 * - Manages plugin settings and sessions
 *
 * Pro features (tools, MCP, voice, rendering, automations) register via the
 * Extension API at runtime.
 *
 * @since 0.1.0
 */

import { Plugin, WorkspaceLeaf, App } from "obsidian";
import { CopilotChatView, COPILOT_VIEW_TYPE } from "./ui/ChatView";
import { BacklinksView, BACKLINKS_VIEW_TYPE } from "./ui/BacklinksView";
import { OutgoingLinksView, OUTGOING_LINKS_VIEW_TYPE } from "./ui/OutgoingLinksView";
import { openViewInRightPanel } from "./ui/workspace-panels";
import { DEFAULT_SETTINGS } from "./ui/settings/defaults";
import type { CopilotPluginSettings, CopilotSession } from "./ui/settings/types";
import { GitHubCopilotCliService, type GitHubCopilotCliConfig } from "./copilot/providers/GitHubCopilotCliService";
import { GitHubCopilotCliManager } from "./copilot/providers/GitHubCopilotCliManager";
import { VaultCopilotExtensionAPIImpl, type VaultCopilotExtensionAPIDelegate } from "./api/VaultCopilotExtensionAPI";
import { BasicSettingTab } from "./BasicSettingTab";
import { supportsLocalProcesses, isMobile } from "./utils/platform";
import { expandHomePath } from "./utils/pathUtils";

/** View type constant for the chat view */
export { COPILOT_VIEW_TYPE };
/** View type constant for the backlinks panel */
export { BACKLINKS_VIEW_TYPE };
/** View type constant for the outgoing links panel */
export { OUTGOING_LINKS_VIEW_TYPE };

/**
 * Vault Copilot Basic plugin.
 *
 * Provides core AI chat functionality via the GitHub Copilot CLI SDK
 * and the Extension API for Pro/third-party plugin registration.
 */
export default class BasicCopilotPlugin extends Plugin {
	/** Plugin settings */
	settings!: CopilotPluginSettings;
	/** GitHub Copilot CLI service (desktop only) */
	githubCopilotCliService: GitHubCopilotCliService | null = null;
	/** CLI manager for health checks */
	cliManager: GitHubCopilotCliManager | null = null;
	/** Extension API for plugin registration */
	extensionAPI!: VaultCopilotExtensionAPIImpl;
	/** Ribbon icon element for show/hide toggling */
	private ribbonIconEl: HTMLElement | null = null;
	/** Status bar item element */
	private statusBarEl: HTMLElement | null = null;
	/**
	 * Optional factory for the GitHub Copilot CLI service.
	 *
	 * Pro (or any extension) calls {@link setCliServiceFactory} to replace the
	 * base `GitHubCopilotCliService` with its own subclass (e.g. `GitHubCopilotCliProService`).
	 * The factory is used on the next {@link connectCopilot} call.
	 * @internal
	 */
	private cliServiceFactory: ((app: App, config: GitHubCopilotCliConfig) => GitHubCopilotCliService) | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Validate provider on mobile
		if (isMobile && this.settings.aiProvider === "copilot") {
			this.settings.aiProvider = "openai";
			await this.saveSettings();
		}

		// Initialize Extension API
		this.extensionAPI = new VaultCopilotExtensionAPIImpl({
			delegate: this.createExtensionAPIDelegate(),
		});

		// Initialize Copilot CLI service (desktop only)
		if (supportsLocalProcesses()) {
			this.githubCopilotCliService = this.createCliService();
			this.cliManager = new GitHubCopilotCliManager(
				this.settings.cliPath ? expandHomePath(this.settings.cliPath) : undefined,
			);
		}

		// Register core chat view
		this.registerView(
			COPILOT_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new CopilotChatView(leaf, this, this.githubCopilotCliService),
		);

		// Register Backlinks panel view (right sidebar)
		this.registerView(
			BACKLINKS_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new BacklinksView(leaf, this.app),
		);

		// Register Outgoing Links panel view (right sidebar)
		this.registerView(
			OUTGOING_LINKS_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new OutgoingLinksView(leaf, this.app),
		);

		// Wire tool registry into the CLI service so registered tools appear on next session
		if (this.githubCopilotCliService) {
			this.githubCopilotCliService.setToolRegistry(this.extensionAPI.toolRegistry);
		}

		// Register commands from CommandRegistry when Pro registers them
		this.extensionAPI.commandRegistry.onChange(() => {
			for (const cmd of this.extensionAPI.commandRegistry.getAll()) {
				this.addCommand({
					id: cmd.id,
					name: cmd.name,
					callback: cmd.callback,
					...(cmd.hotkey ? { hotkeys: [{ modifiers: [], key: cmd.hotkey }] } : {}),
				});
			}
		});

		// Register views from ViewRegistry when Pro registers them
		this.extensionAPI.viewRegistry.onChange(() => {
			for (const reg of this.extensionAPI.viewRegistry.getAll()) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.registerView(reg.viewType, (leaf: WorkspaceLeaf) => reg.factory(leaf) as any);
			}
		});

		// Add settings tab
		this.addSettingTab(new BasicSettingTab(this.app, this, this.extensionAPI.settingsRegistry));

		// Add ribbon icon for chat (always register so Obsidian tracks it, then apply visibility)
		this.ribbonIconEl = this.addRibbonIcon("message-circle", "Open Vault Copilot chat", () => {
			this.activateChatView();
		});
		this.updateRibbonIcon();

		// Add status bar item
		this.updateStatusBar();

		// Register core commands
		this.addCommand({
			id: "open-copilot-chat",
			name: "Open chat",
			callback: () => this.activateChatView(),
		});

		this.addCommand({
			id: "connect-copilot",
			name: "Connect to Copilot",
			callback: () => this.connectCopilot(),
		});

		this.addCommand({
			id: "open-backlinks",
			name: "Open Backlinks panel",
			callback: () => {
				void openViewInRightPanel(this.app.workspace, BACKLINKS_VIEW_TYPE);
			},
		});

		this.addCommand({
			id: "open-outgoing-links",
			name: "Open Outgoing Links panel",
			callback: () => {
				void openViewInRightPanel(this.app.workspace, OUTGOING_LINKS_VIEW_TYPE);
			},
		});

		// Auto-connect on startup if using GitHub Copilot and previously connected.
		// "Previously connected" is signalled by having stored model multipliers.
		const hadPriorSession = supportsLocalProcesses()
			&& this.settings.aiProvider === 'copilot'
			&& !!this.settings.modelMultipliers
			&& Object.keys(this.settings.modelMultipliers).length > 0;
		if (hadPriorSession) {
			this.app.workspace.onLayoutReady(() => {
				void this.connectCopilot();
			});
		}
	}

	async onunload(): Promise<void> {
		await this.disconnectCopilot();
		this.extensionAPI?.destroy();
	}

	/**
	 * Get the Extension API for other plugins.
	 * Usage: `app.plugins.getPlugin('obsidian-vault-copilot')?.api`
	 */
	get api(): VaultCopilotExtensionAPIImpl {
		return this.extensionAPI;
	}

	/**
	 * Apply current `showRibbonIcon` setting to the ribbon element.
	 * Called on load and whenever the setting is toggled.
	 */
	updateRibbonIcon(): void {
		if (!this.ribbonIconEl) return;
		const show = this.settings.showRibbonIcon ?? true;
		this.ribbonIconEl.toggleClass('vc-ribbon-hidden', !show);
	}

	/**
	 * Refresh the status bar indicator to reflect current connection state.
	 * Creates the element on first call if `showInStatusBar` is enabled,
	 * removes it if disabled, and re-renders the connected/disconnected state.
	 */
	updateStatusBar(): void {
		if (!this.statusBarEl) {
			if (this.settings.showInStatusBar) {
				this.statusBarEl = this.addStatusBarItem();
				this.statusBarEl.addEventListener("click", () => {
					this.toggleChatView();
				});
			} else {
				return;
			}
		}

		if (!this.settings.showInStatusBar) {
			this.statusBarEl.remove();
			this.statusBarEl = null;
			return;
		}

		const isConnected = this.isAnyServiceConnected();
		this.statusBarEl.empty();

		const statusEl = this.statusBarEl.createSpan({ cls: "vc-status" });
		statusEl.setAttribute("aria-label", isConnected ? "Toggle Vault Copilot window" : "Connect to Copilot");

		const logoEl = statusEl.createSpan({ cls: "vc-status-logo" });
		logoEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.25 2.5h1.5a4.75 4.75 0 0 1 4.75 4.75v.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-.5a3.25 3.25 0 0 0-3.25-3.25h-1.5a3.25 3.25 0 0 0-3.25 3.25v.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-.5A4.75 4.75 0 0 1 7.25 2.5zm-3 4.25a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0zm5.5 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0zM2 11.5c0-.83.67-1.5 1.5-1.5h9c.83 0 1.5.67 1.5 1.5v1c0 .83-.67 1.5-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-1zm1.5-.5a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h9a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9z"/></svg>`;

		statusEl.createSpan({
			cls: `vc-status-indicator ${isConnected ? "vc-connected" : "vc-disconnected"}`,
		});
	}

	/** Load settings from disk with defaults. */
	async loadSettings(): Promise<void> {
		const savedData = (await this.loadData()) as Partial<CopilotPluginSettings> || {};
		this.settings = {
			...DEFAULT_SETTINGS,
			...savedData,
		} as CopilotPluginSettings;
	}

	/** Save settings to disk. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Check if any AI service is connected. */
	isAnyServiceConnected(): boolean {
		return this.githubCopilotCliService?.isConnected() ?? false;
	}

	/** Get the active AI service. */
	getActiveService(): GitHubCopilotCliService | null {
		return this.githubCopilotCliService;
	}

	/** Connect to the active AI service. */
	async connectCopilot(): Promise<void> {
		if (!this.githubCopilotCliService) {
			if (supportsLocalProcesses()) {
				this.githubCopilotCliService = this.createCliService();
			}
		}
		if (this.githubCopilotCliService && !this.githubCopilotCliService.isConnected()) {
			await this.githubCopilotCliService.start();
			this.updateStatusBar();
			void this.refreshModelMultipliers();
		}
	}

	/**
	 * Fetch billing multipliers for all models from the CLI service and persist them
	 * to settings. Called after connecting so that dropdowns and menus show correct
	 * request costs without requiring a manual refresh.
	 * @internal
	 */
	private async refreshModelMultipliers(): Promise<void> {
		if (!this.githubCopilotCliService) return;
		try {
			const models = await this.githubCopilotCliService.listModels();
			if (models.length === 0) return;
			const multipliers: Record<string, number> = {};
			for (const m of models) {
				if (m.billingMultiplier !== undefined) multipliers[m.id] = m.billingMultiplier;
			}
			this.settings.modelMultipliers = multipliers;
			await this.saveSettings();
		} catch {
			// Non-critical — multipliers are best-effort
		}
	}

	/**
	 * Register a factory function that creates the GitHub Copilot CLI service.
	 *
	 * Pro calls this to inject `GitHubCopilotCliProService` (which overrides
	 * `buildTools()`, `buildSystemPrompt()`, and `buildSummarizer()`) instead of
	 * the default base service. The factory is invoked on the **next** call to
	 * {@link connectCopilot} or immediately if called before plugin startup connnet.
	 *
	 * @param factory - Function that creates a `GitHubCopilotCliService` subclass
	 * @returns Unsubscribe function that restores the default service factory
	 *
	 * @example
	 * ```typescript
	 * // From the Pro plugin:
	 * const basic = app.plugins.getPlugin('obsidian-vault-copilot') as BasicCopilotPlugin;
	 * const unsub = basic.setCliServiceFactory((app, config) =>
	 *   new GitHubCopilotCliProService(app, config as GitHubCopilotCliProConfig)
	 * );
	 * // On Pro unload:
	 * unsub();
	 * ```
	 */
	setCliServiceFactory(
		factory: (app: App, config: GitHubCopilotCliConfig) => GitHubCopilotCliService,
	): () => void {
		this.cliServiceFactory = factory;
		// If the service is already running, swap it out (stop old, create new on next connect)
		if (this.githubCopilotCliService) {
			void this.githubCopilotCliService.stop().then(() => {
				this.githubCopilotCliService = null;
			});
		}
		return () => {
			this.cliServiceFactory = null;
		};
	}

	/** Disconnect from AI services. */
	async disconnectCopilot(): Promise<void> {
		if (this.githubCopilotCliService) {
			await this.githubCopilotCliService.stop();
		}
		this.updateStatusBar();
	}

	/** Activate the chat view in the workspace. */
	activateChatView(): void {
		const workspace = this.app.workspace;
		let leaf = workspace.getLeavesOfType(COPILOT_VIEW_TYPE)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				void leaf.setViewState({ type: COPILOT_VIEW_TYPE, active: true });
			}
		}
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/** Toggle the chat view open or closed. */
	toggleChatView(): void {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(COPILOT_VIEW_TYPE);
		if (leaves.length > 0) {
			leaves.forEach(leaf => leaf.detach());
		} else {
			this.activateChatView();
		}
	}

	/** Load a session by ID. */
	async loadSession(sessionId: string): Promise<void> {
		const session = this.settings.sessions.find(s => s.id === sessionId);
		if (!session) throw new Error(`Session not found: ${sessionId}`);
		if (this.githubCopilotCliService) {
			await this.githubCopilotCliService.loadSession(sessionId, session.messages || []);
			this.settings.activeSessionId = sessionId;
			session.lastUsedAt = Date.now();
			await this.saveSettings();
			this.activateChatView();
		}
	}

	/**
	 * Build the service config for GitHubCopilotCliService (base config only).
	 * @internal
	 */
	private getServiceConfig(): GitHubCopilotCliConfig {
		const vaultPath = this.getVaultBasePath();
		return {
			model: this.settings.model,
			cliPath: this.settings.cliPath ? expandHomePath(this.settings.cliPath) : undefined,
			cliUrl: this.settings.cliUrl || undefined,
			streaming: this.settings.streaming,
			vaultPath,
			requestTimeout: this.settings.requestTimeout,
			backgroundCompactionThreshold: this.settings.backgroundCompactionThreshold,
			bufferExhaustionThreshold: this.settings.bufferExhaustionThreshold,
			tracingEnabled: this.settings.tracingEnabled,
			logLevel: this.settings.logLevel,
		};
	}

	/**
	 * Create the CLI service using the registered factory (if any) or the default base class.
	 *
	 * Always calls {@link GitHubCopilotCliService.setToolRegistry} with the current
	 * Extension API tool registry so dynamically registered tools are available.
	 *
	 * @internal
	 */
	private createCliService(): GitHubCopilotCliService {
		const config = this.getServiceConfig();
		const service = this.cliServiceFactory
			? this.cliServiceFactory(this.app, config)
			: new GitHubCopilotCliService(this.app, config);
		service.setToolRegistry(this.extensionAPI.toolRegistry);
		return service;
	}

	/** @internal */
	private getVaultBasePath(): string | undefined {
		const adapter = this.app.vault.adapter;
		if ('getBasePath' in adapter && typeof adapter.getBasePath === 'function') {
			return adapter.getBasePath() as string;
		}
		return undefined;
	}

	/**
	 * Create the delegate for the Extension API.
	 * @internal
	 */
	private createExtensionAPIDelegate(): VaultCopilotExtensionAPIDelegate {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const plugin = this;

		return {
			isConnected: () => plugin.isAnyServiceConnected(),
			connect: () => plugin.connectCopilot(),
			disconnect: () => plugin.disconnectCopilot(),
			sendMessage: async (prompt: string) => {
				const service = plugin.getActiveService();
				if (!service) throw new Error("No AI service available");
				return await service.sendMessage(prompt);
			},
			sendMessageStreaming: async (prompt, onDelta, onComplete) => {
				const service = plugin.getActiveService();
				if (!service) throw new Error("No AI service available");
				return await service.sendMessageStreaming(prompt, onDelta, onComplete);
			},
			getMessageHistory: () => {
				const service = plugin.getActiveService();
				return service?.getMessageHistory() ?? [];
			},
			clearHistory: async () => {
				const service = plugin.getActiveService();
				if (!service) throw new Error("No AI service available");
				service.clearHistory();
			},
			listSessions: async () =>
				plugin.settings.sessions.map(s => ({
					id: s.id,
					name: s.name,
					messageCount: s.messages?.length ?? 0,
					archived: s.archived,
				})),
			getActiveSessionId: () => plugin.settings.activeSessionId,
			createSession: async (name?: string) => {
				const now = Date.now();
				const sessionId = `session-${now}`;
				let actualId = sessionId;
				if (plugin.githubCopilotCliService) {
					actualId = await plugin.githubCopilotCliService.createSession(sessionId);
				}
				const newSession: CopilotSession = {
					id: actualId,
					name: name || `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
					createdAt: now,
					lastUsedAt: now,
					archived: false,
					messages: [],
				};
				plugin.settings.sessions.push(newSession);
				plugin.settings.activeSessionId = newSession.id;
				await plugin.saveSettings();
				return { id: newSession.id, name: newSession.name, messageCount: 0, archived: false };
			},
			loadSession: async (sessionId: string) => {
				await plugin.loadSession(sessionId);
			},
			archiveSession: async (sessionId: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				session.archived = true;
				session.completedAt = Date.now();
				await plugin.saveSettings();
			},
			deleteSession: async (sessionId: string) => {
				const index = plugin.settings.sessions.findIndex(s => s.id === sessionId);
				if (index === -1) throw new Error(`Session not found: ${sessionId}`);
				if (plugin.githubCopilotCliService) {
					try { await plugin.githubCopilotCliService.deleteSession(sessionId); }
					catch { /* continue local deletion */ }
				}
				plugin.settings.sessions.splice(index, 1);
				if (plugin.settings.activeSessionId === sessionId) {
					plugin.settings.activeSessionId = null;
				}
				await plugin.saveSettings();
			},
			renameSession: async (sessionId: string, newName: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				session.name = newName;
				await plugin.saveSettings();
			},
			getSettings: () => ({ ...plugin.settings } as Record<string, unknown>),
			updateSettings: async (partial: Record<string, unknown>) => {
				Object.assign(plugin.settings, partial);
				await plugin.saveSettings();
			},
		};
	}
}
