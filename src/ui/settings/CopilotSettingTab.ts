/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CopilotSettingTab
 * @description Slim orchestrator for the Vault Copilot settings tab.
 *
 * Delegates each section to a dedicated module under `./sections/`.
 * This file handles only the plugin lifecycle (display, hide) and
 * coordinates the async CLI status check flow.
 *
 * @see {@link CopilotPlugin} for the main plugin implementation
 * @since 0.0.1
 */

import { App, PluginSettingTab } from "obsidian";
import CopilotPlugin from "../../main";
import { GitHubCopilotCliManager, CliStatus } from "../../copilot/providers/GitHubCopilotCliManager";
import { ToolCatalog } from "../../copilot/tools/ToolCatalog";
import { CopilotChatView, COPILOT_VIEW_TYPE } from "../ChatView";
import { isDesktop } from "../../utils/platform";
import { getProfileById, getProfileTypeDisplayName } from "./profiles";

import type { SettingSectionContext } from "./sections/SectionHelpers";
import {
	renderCliStatusSection,
	renderChatPreferencesSection,
	renderAIProviderProfilesSection,
	renderDateTimeSection,
	renderPeriodicNotesSection,
	renderWhisperCppSection,
	renderVoiceInputSection,
	renderRealtimeAgentSection,
	renderSkillsMcpSection,
	renderAutomationsSection,
	renderAdvancedSettings,
	renderVaultSetupSection,
	renderHelpSection,
	type CliStatusState,
	type ChatPreferencesState,
	type SkillsMcpState,
} from "./sections";

export class CopilotSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;
	private githubCopilotCliManager: GitHubCopilotCliManager;
	private cachedStatus: CliStatus | null = null;
	private skillRegistryUnsubscribe: (() => void) | null = null;
	private toolCatalog: ToolCatalog;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.githubCopilotCliManager = new GitHubCopilotCliManager(plugin.settings.cliPath);
		this.toolCatalog = new ToolCatalog(plugin.skillRegistry, plugin.mcpManager, plugin.skillCache);
	}

	display(): void {
		const { containerEl } = this;

		// Snapshot which collapsible sections are currently open
		const openSections = new Set<string>();
		containerEl.querySelectorAll("details.vc-collapsible[open]").forEach(el => {
			const cls = el.className;
			openSections.add(cls);
		});

		containerEl.empty();
		containerEl.addClass("vc-settings");

		// Build the shared context used by every section renderer
		const ctx: SettingSectionContext = {
			app: this.app,
			plugin: this.plugin,
			cliManager: this.githubCopilotCliManager,
			toolCatalog: this.toolCatalog,
			refreshDisplay: () => this.display(),
		};

		// ── Chat Preferences (main settings area) ─────────────────────
		const chatState: ChatPreferencesState = renderChatPreferencesSection(containerEl, ctx);
		chatState.renderMainSettingsIfReady(this.cachedStatus || { installed: false } as CliStatus);

		// ── AI Provider Profiles ──────────────────────────────────────
		renderAIProviderProfilesSection(containerEl, ctx);

		// ── Date & Time ───────────────────────────────────────────────
		renderDateTimeSection(containerEl, ctx);

		// ── Periodic Notes ────────────────────────────────────────────
		renderPeriodicNotesSection(containerEl, ctx);

		// ── Whisper.cpp (desktop only — requires Node.js) ────────────
		if (isDesktop) {
			renderWhisperCppSection(containerEl, ctx);
		}

		// ── Voice Input ───────────────────────────────────────────────
		renderVoiceInputSection(containerEl, ctx);

		// ── Realtime Agent ────────────────────────────────────────────
		renderRealtimeAgentSection(containerEl, ctx);

		// ── Registered Skills & MCP Servers ───────────────────────────
		const skillsState: SkillsMcpState = renderSkillsMcpSection(containerEl, ctx);
		// Keep a reference so hide() can clean up
		this.skillRegistryUnsubscribe = this.plugin.skillRegistry.onSkillChange(() => {
			skillsState.updateSkillsDisplay();
		});

		// ── Automations ───────────────────────────────────────────────
		renderAutomationsSection(containerEl, ctx);

		// ── Assistant Customization (directories) ─────────────────────
		renderAdvancedSettings(containerEl, ctx);

		// ── CLI Connection Status (desktop only — requires child_process) ──
		let cliState: CliStatusState | null = null;
		if (isDesktop) {
			cliState = renderCliStatusSection(
				containerEl,
				ctx,
				{ value: this.cachedStatus },
				(status: CliStatus) => {
					this.cachedStatus = status;
					chatState.renderMainSettingsIfReady(status);
				}
			);
		} else {
			// Web/mobile: show a simplified connection info section
			this.renderWebConnectionStatus(containerEl);
		}

		// ── Vault Setup (desktop only — requires CLI manager) ─────────
		if (isDesktop) {
			renderVaultSetupSection(containerEl, ctx, this.cachedStatus, this.githubCopilotCliManager);
		}

		// ── Help / About ──────────────────────────────────────────────
		renderHelpSection(containerEl, ctx);

		// ── Restore previously-open sections ──────────────────────────
		if (openSections.size > 0) {
			containerEl.querySelectorAll("details.vc-collapsible").forEach(el => {
				if (openSections.has(el.className)) {
					(el as HTMLDetailsElement).open = true;
				}
			});
		}

		// ── Async CLI status check ────────────────────────────────────
		const hasUserConfig = this.hasUserConfiguration();
		if (!this.plugin.settings.cliStatusChecked && hasUserConfig) {
			this.plugin.settings.cliStatusChecked = true;
			void this.plugin.saveSettings();
		}

		if (!this.plugin.settings.cliStatusChecked && !hasUserConfig) {
			cliState?.checkStatusAsync()
				.finally(async () => {
					this.plugin.settings.cliStatusChecked = true;
					await this.plugin.saveSettings();
				});
		} else if (this.cachedStatus || this.plugin.settings.cliLastKnownStatus) {
			this.cachedStatus = this.cachedStatus || this.plugin.settings.cliLastKnownStatus || null;
			if (this.cachedStatus) {
				cliState?.renderStatusDisplay(this.cachedStatus);
			}
		} else {
			cliState?.renderStatusDeferred();
		}
	}

	private hasUserConfiguration(): boolean {
		const settings = this.plugin.settings;
		const hasProfiles = (settings.aiProviderProfiles?.length ?? 0) > 0;
		const hasSelectedProfiles = !!settings.chatProviderProfileId || !!settings.voiceInputProfileId || !!settings.realtimeAgentProfileId;
		const hasOpenAiKey = !!settings.openai?.apiKeySecretId;
		const hasVoiceEnabled = !!settings.voice?.voiceInputEnabled || !!settings.voice?.realtimeAgentEnabled;
		return hasProfiles || hasSelectedProfiles || hasOpenAiKey || hasVoiceEnabled;
	}

	/**
	 * Render a simplified connection status section for web/mobile platforms
	 * where the GitHub Copilot CLI is not available.
	 *
	 * @param containerEl - Parent element to render into
	 * @internal
	 */
	private renderWebConnectionStatus(containerEl: HTMLElement): void {
		const details = containerEl.createEl("details", { cls: "vc-settings-section vc-collapsible" });
		details.open = true;
		const summary = details.createEl("summary", { cls: "vc-section-summary" });
		summary.createEl("h3", { text: "Connection Status" });
		const content = details.createDiv({ cls: "vc-section-content" });

		const statusCard = content.createDiv({ cls: "vc-status-card" });

		const profileId = this.plugin.settings.chatProviderProfileId;
		const profile = getProfileById(this.plugin.settings, profileId);

		if (profile) {
			// Provider configured — show connected status
			const statusGrid = statusCard.createDiv({ cls: "vc-status-grid" });
			const item = statusGrid.createDiv({ cls: "vc-status-item vc-status-ok" });
			const iconEl = item.createDiv({ cls: "vc-status-icon" });
			iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
			const textEl = item.createDiv({ cls: "vc-status-text" });
			textEl.createEl("span", { text: "AI Provider", cls: "vc-status-label" });
			textEl.createEl("span", {
				text: `${profile.name} (${getProfileTypeDisplayName(profile.type)})`,
				cls: "vc-status-detail"
			});
		} else {
			// No provider configured — show warning
			const statusGrid = statusCard.createDiv({ cls: "vc-status-grid" });
			const item = statusGrid.createDiv({ cls: "vc-status-item vc-status-error" });
			const iconEl = item.createDiv({ cls: "vc-status-icon" });
			iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
			const textEl = item.createDiv({ cls: "vc-status-text" });
			textEl.createEl("span", { text: "AI Provider", cls: "vc-status-label" });
			textEl.createEl("span", { text: "Not configured", cls: "vc-status-detail" });

			const noteEl = content.createDiv({ cls: "vc-auth-note" });
			noteEl.createEl("p", {
				text: "Create an AI Provider Profile above (OpenAI or Azure OpenAI) and select it in Chat Preferences to get started.",
				cls: "vc-status-desc"
			});
			noteEl.createEl("p", {
				text: "GitHub Copilot CLI is only available on the desktop app.",
				cls: "vc-status-desc"
			});
		}
	}

	hide(): void {
		let settingsChanged = false;

		// Auto-disable Voice Input if enabled but no provider selected
		if (this.plugin.settings.voice?.voiceInputEnabled && !this.plugin.settings.voiceInputProfileId) {
			this.plugin.settings.voice.voiceInputEnabled = false;
			settingsChanged = true;
		}

		// Auto-disable Realtime Agent if enabled but no provider selected
		if (this.plugin.settings.voice?.realtimeAgentEnabled && !this.plugin.settings.realtimeAgentProfileId) {
			this.plugin.settings.voice.realtimeAgentEnabled = false;
			settingsChanged = true;
		}

		if (settingsChanged) {
			void this.plugin.saveSettings();
		}

		// Clean up skill registry subscription
		if (this.skillRegistryUnsubscribe) {
			this.skillRegistryUnsubscribe();
			this.skillRegistryUnsubscribe = null;
		}

		// Refresh caches when settings panel closes
		this.plugin.agentCache?.refreshCache();
		this.plugin.promptCache?.refreshCache();

		// Refresh chat view from settings (model, voice toolbar, etc.)
		const chatLeaves = this.app.workspace.getLeavesOfType(COPILOT_VIEW_TYPE);
		for (const leaf of chatLeaves) {
			const view = leaf.view as CopilotChatView;
			if (view?.refreshFromSettings) {
				view.refreshFromSettings();
			}
		}
	}
}
