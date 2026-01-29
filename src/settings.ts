import { App, PluginSettingTab, Setting, Notice, FileSystemAdapter, DropdownComponent } from "obsidian";
import CopilotPlugin from "./main";
import { CliManager, CliStatus } from "./copilot/CliManager";
import { ChatMessage } from "./copilot/CopilotService";

// Robot mascot logo (base64 encoded PNG, 48x48)
const COPILOT_LOGO_DATA_URL = "data:image/png;base64,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";

export interface CopilotSession {
	id: string;
	name: string;
	createdAt: number;
	lastUsedAt: number;
	completedAt?: number;
	durationMs?: number;
	archived: boolean;
	messages: ChatMessage[];
}

export interface CopilotPluginSettings {
	model: string;
	cliPath: string;
	cliUrl: string;
	streaming: boolean;
	showInStatusBar: boolean;
	sessions: CopilotSession[];
	activeSessionId: string | null;
}

export const DEFAULT_SETTINGS: CopilotPluginSettings = {
	model: "gpt-4.1",
	cliPath: "",
	cliUrl: "",
	streaming: true,
	showInStatusBar: true,
	sessions: [],
	activeSessionId: null,
};

export const AVAILABLE_MODELS = [
	// Auto mode
	{ value: "auto", name: "Auto", rate: "10% discount", section: "auto" },
	// GPT models
	{ value: "gpt-4.1", name: "GPT-4.1", rate: "0x", section: "gpt" },
	{ value: "gpt-4o", name: "GPT-4o", rate: "0x", section: "gpt" },
	{ value: "gpt-5-mini", name: "GPT-5 mini", rate: "0x", section: "gpt" },
	// Claude models
	{ value: "claude-haiku-4.5", name: "Claude Haiku 4.5", rate: "0.33x", section: "claude" },
	{ value: "claude-opus-4.5", name: "Claude Opus 4.5", rate: "3x", section: "claude" },
	{ value: "claude-sonnet-4", name: "Claude Sonnet 4", rate: "1x", section: "claude" },
	{ value: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", rate: "1x", section: "claude" },
	// Gemini models
	{ value: "gemini-2.5-pro", name: "Gemini 2.5 Pro", rate: "1x", section: "gemini" },
	{ value: "gemini-3-flash-preview", name: "Gemini 3 Flash (Preview)", rate: "0.33x", section: "gemini" },
	{ value: "gemini-3-pro-preview", name: "Gemini 3 Pro (Preview)", rate: "1x", section: "gemini" },
	// Other models
	{ value: "goldeneye-internal", name: "Goldeneye (Internal Only)", rate: "1x", section: "other" },
	{ value: "gpt-5", name: "GPT-5", rate: "1x", section: "other" },
	{ value: "gpt-5-codex-preview", name: "GPT-5-Codex (Preview)", rate: "1x", section: "other" },
	{ value: "gpt-5.1", name: "GPT-5.1", rate: "1x", section: "other" },
	{ value: "gpt-5.1-codex", name: "GPT-5.1-Codex", rate: "1x", section: "other" },
	{ value: "gpt-5.1-codex-max", name: "GPT-5.1-Codex-Max", rate: "1x", section: "other" },
	{ value: "gpt-5.1-codex-mini-preview", name: "GPT-5.1-Codex-Mini (Preview)", rate: "0.33x", section: "other" },
	{ value: "gpt-5.2", name: "GPT-5.2", rate: "1x", section: "other" },
	{ value: "gpt-5.2-codex", name: "GPT-5.2-Codex", rate: "1x", section: "other" },
];

export class CopilotSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;
	private cliManager: CliManager;
	private statusContainer: HTMLElement | null = null;
	private mainSettingsContainer: HTMLElement | null = null;
	private cachedStatus: CliStatus | null = null;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.cliManager = new CliManager(plugin.settings.cliPath);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("ghcp-settings");

		// Header with branding
		this.renderHeader(containerEl);

		// CLI Status Section - renders immediately with loading state
		this.renderCliStatusSection(containerEl);

		// Main settings container - will be populated after status check
		this.mainSettingsContainer = containerEl.createDiv({ cls: "ghcp-main-settings" });

		// Session Management Section
		this.renderSessionSection(containerEl);

		// Advanced Settings (always visible)
		this.renderAdvancedSettings(containerEl);

		// Help Section
		this.renderHelpSection(containerEl);

		// Trigger async status check (non-blocking)
		this.checkStatusAsync();
	}

	private renderHeader(containerEl: HTMLElement): void {
		const header = containerEl.createDiv({ cls: "ghcp-settings-header" });
		
		const titleRow = header.createDiv({ cls: "ghcp-settings-title-row" });
		
		// Copilot robot logo
		const logoWrapper = titleRow.createDiv({ cls: "ghcp-settings-logo" });
		const logoImg = logoWrapper.createEl("img", {
			attr: {
				src: COPILOT_LOGO_DATA_URL,
				alt: "GitHub Copilot for Obsidian",
				width: "48",
				height: "48"
			}
		});
		
		const titleText = titleRow.createDiv({ cls: "ghcp-settings-title-text" });
		titleText.createEl("h2", { text: "GitHub Copilot for Obsidian" });
		titleText.createEl("p", { text: "AI-powered assistant for your notes", cls: "ghcp-settings-subtitle" });
	}

	private renderCliStatusSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "ghcp-settings-section" });
		
		const sectionHeader = section.createDiv({ cls: "ghcp-section-header" });
		sectionHeader.createEl("h3", { text: "Connection Status" });
		
		const refreshBtn = sectionHeader.createEl("button", { 
			cls: "ghcp-refresh-btn",
			attr: { "aria-label": "Refresh status" }
		});
		refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
		refreshBtn.addEventListener("click", () => {
			refreshBtn.addClass("ghcp-spinning");
			this.cliManager.invalidateCache();
			this.checkStatusAsync().finally(() => {
				refreshBtn.removeClass("ghcp-spinning");
			});
		});
		
		this.statusContainer = section.createDiv({ cls: "ghcp-status-card" });
		
		// Show loading state immediately
		this.renderLoadingStatus();
	}

	private renderLoadingStatus(): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();
		
		const loadingEl = this.statusContainer.createDiv({ cls: "ghcp-status-loading" });
		loadingEl.innerHTML = `
			<div class="ghcp-spinner"></div>
			<span>Checking connection...</span>
		`;
	}

	private async checkStatusAsync(): Promise<void> {
		try {
			const status = await this.cliManager.getStatus(true);
			this.cachedStatus = status;
			this.renderStatusDisplay(status);
			this.renderMainSettingsIfReady(status);
		} catch (error) {
			this.renderStatusError(String(error));
		}
	}

	private renderStatusDisplay(status: CliStatus): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();

		const statusGrid = this.statusContainer.createDiv({ cls: "ghcp-status-grid" });

		// CLI Installation Status
		const cliCard = statusGrid.createDiv({ cls: "ghcp-status-item" });
		this.renderStatusCard(cliCard, {
			label: "CLI Installation",
			isOk: status.installed,
			detail: status.installed ? `v${status.version || "unknown"}` : "Not installed",
			icon: status.installed 
				? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
				: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
		});

		// Action buttons if CLI not installed
		if (!status.installed) {
			this.renderInstallActions(this.statusContainer);
		} else {
			// Show auth note when CLI is installed
			this.renderAuthNote(this.statusContainer);
		}
	}

	private renderStatusCard(container: HTMLElement, opts: { label: string; isOk: boolean; detail: string; icon: string }): void {
		container.addClass(opts.isOk ? "ghcp-status-ok" : "ghcp-status-error");
		
		const iconEl = container.createDiv({ cls: "ghcp-status-icon" });
		iconEl.innerHTML = opts.icon;
		
		const textEl = container.createDiv({ cls: "ghcp-status-text" });
		textEl.createEl("span", { text: opts.label, cls: "ghcp-status-label" });
		textEl.createEl("span", { text: opts.detail, cls: "ghcp-status-detail" });
	}

	private renderStatusError(error: string): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();
		
		const errorEl = this.statusContainer.createDiv({ cls: "ghcp-status-error-msg" });
		errorEl.createEl("span", { text: `Error checking status: ${error}` });
	}

	private renderInstallActions(container: HTMLElement): void {
		const actionsEl = container.createDiv({ cls: "ghcp-status-actions" });
		
		const installInfo = this.cliManager.getInstallCommand();
		
		// Command display
		const cmdGroup = actionsEl.createDiv({ cls: "ghcp-cmd-group" });
		cmdGroup.createEl("label", { text: installInfo.description });
		
		const cmdRow = cmdGroup.createDiv({ cls: "ghcp-cmd-row" });
		cmdRow.createEl("code", { text: installInfo.command });
		
		const copyBtn = cmdRow.createEl("button", { text: "Copy", cls: "ghcp-btn-secondary ghcp-btn-sm" });
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(installInfo.command);
			new Notice("Copied to clipboard");
		});

		// Action buttons
		const btnRow = actionsEl.createDiv({ cls: "ghcp-btn-row" });
		
		const installBtn = btnRow.createEl("button", { text: "Install Automatically", cls: "ghcp-btn-primary" });
		installBtn.addEventListener("click", async () => {
			installBtn.disabled = true;
			installBtn.textContent = "Installing...";
			const success = await this.cliManager.installCli();
			if (success) {
				this.cliManager.invalidateCache();
				await this.checkStatusAsync();
			}
			installBtn.disabled = false;
			installBtn.textContent = "Install Automatically";
		});

		const docsLink = btnRow.createEl("a", { text: "View Guide", cls: "ghcp-btn-link", href: installInfo.url });
		docsLink.setAttr("target", "_blank");
	}

	private renderAuthNote(container: HTMLElement): void {
		const noteEl = container.createDiv({ cls: "ghcp-auth-note" });
		noteEl.createEl("p", { 
			text: "Authentication is handled automatically when you first use GitHub Copilot. If prompted, use the /login command in the CLI.",
			cls: "ghcp-status-desc"
		});

		// Expandable PAT info
		const detailsEl = noteEl.createEl("details", { cls: "ghcp-auth-details" });
		detailsEl.createEl("summary", { text: "Alternative: Use Personal Access Token" });
		
		const patContent = detailsEl.createDiv({ cls: "ghcp-pat-content" });
		patContent.innerHTML = `
			<ol>
				<li>Visit <a href="https://github.com/settings/personal-access-tokens/new" target="_blank">GitHub PAT Settings</a></li>
				<li>Add the "Copilot Requests" permission</li>
				<li>Generate and copy the token</li>
				<li>Set <code>GH_TOKEN</code> or <code>GITHUB_TOKEN</code> environment variable</li>
			</ol>
		`;
	}

	private renderMainSettingsIfReady(status: CliStatus): void {
		if (!this.mainSettingsContainer) return;
		this.mainSettingsContainer.empty();

		if (!status.installed) {
			return; // Don't show main settings if CLI not installed
		}

		// Vault Initialization Section
		const initSection = this.mainSettingsContainer.createDiv({ cls: "ghcp-settings-section" });
		initSection.createEl("h3", { text: "Vault Setup" });
		
		const initDesc = initSection.createEl("p", { 
			text: "Initialize GitHub Copilot for this vault to enable context-aware assistance.",
			cls: "ghcp-status-desc"
		});
		
		const initBtnRow = initSection.createDiv({ cls: "ghcp-btn-row" });
		const initBtn = initBtnRow.createEl("button", { text: "Initialize Vault", cls: "ghcp-btn-primary" });
		initBtn.addEventListener("click", async () => {
			const vaultPath = this.getVaultPath();
			if (!vaultPath) {
				new Notice("Could not determine vault path");
				return;
			}
			initBtn.disabled = true;
			initBtn.textContent = "Initializing...";
			const result = await this.cliManager.initializeVault(vaultPath);
			initBtn.disabled = false;
			initBtn.textContent = "Initialize Vault";
		});
		
		const cmdPreview = initSection.createDiv({ cls: "ghcp-cmd-group" });
		cmdPreview.createEl("label", { text: "Command that will be run:" });
		const vaultPath = this.getVaultPath() || "<vault_path>";
		const normalizedPath = vaultPath.replace(/\\/g, "/");
		cmdPreview.createEl("code", { text: `copilot --add-dir "${normalizedPath}"`, cls: "ghcp-code-block" });

		// Chat Preferences Section
		const section = this.mainSettingsContainer.createDiv({ cls: "ghcp-settings-section" });
		section.createEl("h3", { text: "Chat Preferences" });

		// Model selection
		new Setting(section)
			.setName("Default Model")
			.setDesc("Select the AI model for conversations")
			.addDropdown((dropdown) => {
				for (const model of AVAILABLE_MODELS) {
					dropdown.addOption(model.value, model.name);
				}
				dropdown.setValue(this.plugin.settings.model);
				dropdown.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				});
			});

		// Streaming toggle
		new Setting(section)
			.setName("Stream Responses")
			.setDesc("Display responses as they're generated for a more interactive experience")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.streaming)
					.onChange(async (value) => {
						this.plugin.settings.streaming = value;
						await this.plugin.saveSettings();
					})
			);

		// Status bar toggle
		new Setting(section)
			.setName("Status Bar Indicator")
			.setDesc("Show Copilot connection status in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showInStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showInStatusBar = value;
						await this.plugin.saveSettings();
						this.plugin.updateStatusBar();
					})
			);
	}

	private renderSessionSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "ghcp-settings-section" });
		section.createEl("h3", { text: "Session Management" });

		const sessions = this.plugin.settings.sessions;
		
		// Session selector
		const sessionSetting = new Setting(section)
			.setName("Resume Session")
			.setDesc("Continue a previous conversation");

		let sessionDropdown: DropdownComponent;
		
		sessionSetting.addDropdown((dropdown) => {
			sessionDropdown = dropdown;
			dropdown.addOption("", "— New Session —");
			
			// Sort sessions by last used (most recent first)
			const sortedSessions = [...sessions].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
			
			for (const session of sortedSessions) {
				const date = new Date(session.lastUsedAt).toLocaleDateString();
				dropdown.addOption(session.id, `${session.name} (${date})`);
			}
			
			dropdown.setValue(this.plugin.settings.activeSessionId || "");
			dropdown.onChange(async (value) => {
				this.plugin.settings.activeSessionId = value || null;
				await this.plugin.saveSettings();
			});
		});

		sessionSetting.addButton((btn) =>
			btn
				.setButtonText("Attach")
				.setCta()
				.onClick(async () => {
					const sessionId = this.plugin.settings.activeSessionId;
					if (sessionId) {
						const session = sessions.find(s => s.id === sessionId);
						if (session) {
							session.lastUsedAt = Date.now();
							await this.plugin.saveSettings();
							new Notice(`Attached to session: ${session.name}`);
							this.plugin.loadSession(sessionId);
						}
					} else {
						// Create new session
						const newSession = this.createNewSession();
						this.plugin.settings.sessions.push(newSession);
						this.plugin.settings.activeSessionId = newSession.id;
						await this.plugin.saveSettings();
						new Notice(`Created new session: ${newSession.name}`);
						this.display();
					}
				})
		);

		// Clear sessions button
		if (sessions.length > 0) {
			new Setting(section)
				.setName("Clear All Sessions")
				.setDesc(`Remove all ${sessions.length} saved session(s)`)
				.addButton((btn) =>
					btn
						.setButtonText("Clear")
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.sessions = [];
							this.plugin.settings.activeSessionId = null;
							await this.plugin.saveSettings();
							new Notice("All sessions cleared");
							this.display();
						})
				);
		}
	}

	private createNewSession(): CopilotSession {
		const now = Date.now();
		return {
			id: `session-${now}`,
			name: `Session ${new Date(now).toLocaleDateString()} ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
		};
	}

	private renderAdvancedSettings(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "ghcp-settings-section ghcp-settings-advanced" });
		
		const header = section.createEl("details");
		header.createEl("summary", { text: "Advanced Settings" });
		
		const content = header.createDiv({ cls: "ghcp-advanced-content" });

		// CLI Path
		new Setting(content)
			.setName("Custom CLI Path")
			.setDesc("Override the default Copilot CLI location")
			.addText((text) =>
				text
					.setPlaceholder("Leave empty to use PATH")
					.setValue(this.plugin.settings.cliPath)
					.onChange(async (value) => {
						this.plugin.settings.cliPath = value;
						this.cliManager.setCliPath(value);
						await this.plugin.saveSettings();
					})
			);

		// CLI URL for external server
		new Setting(content)
			.setName("External Server URL")
			.setDesc("Connect to a remote Copilot CLI server")
			.addText((text) =>
				text
					.setPlaceholder("localhost:4321")
					.setValue(this.plugin.settings.cliUrl)
					.onChange(async (value) => {
						this.plugin.settings.cliUrl = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private renderHelpSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "ghcp-settings-section ghcp-settings-help" });
		
		const helpContent = section.createDiv({ cls: "ghcp-help-content" });
		
		helpContent.createEl("h4", { text: "About" });
		helpContent.createEl("p", { 
			text: "This plugin integrates GitHub Copilot into Obsidian, enabling AI-powered chat that can read, search, and create notes in your vault."
		});

		const reqDiv = helpContent.createDiv({ cls: "ghcp-requirements" });
		reqDiv.createEl("h4", { text: "Requirements" });
		const reqList = reqDiv.createEl("ul");
		reqList.createEl("li", { text: "GitHub Copilot CLI" });
		reqList.createEl("li", { text: "Active GitHub Copilot subscription" });
		reqList.createEl("li", { text: "Desktop version of Obsidian" });

		const linksDiv = helpContent.createDiv({ cls: "ghcp-help-links" });
		
		const links = [
			{ text: "Documentation", url: "https://docs.github.com/en/copilot" },
			{ text: "CLI Guide", url: "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli" },
			{ text: "Pricing", url: "https://github.com/features/copilot/plans" },
		];
		
		for (const link of links) {
			const a = linksDiv.createEl("a", { text: link.text, href: link.url });
			a.setAttr("target", "_blank");
		}
	}

	private getVaultPath(): string | undefined {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		return undefined;
	}
}

