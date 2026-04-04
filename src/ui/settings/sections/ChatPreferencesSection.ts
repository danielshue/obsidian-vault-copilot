/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ChatPreferencesSection (Basic)
 * @description Minimal settings section for Basic plugin - CLI settings only.
 * No provider profiles, no OpenAI/Azure, no tool picker.
 *
 * Pro has its own full ChatPreferencesSection with all features.
 *
 * @see {@link GitHubCopilotCliManager}
 * @since 0.0.1
 */

import { Setting, Notice } from "obsidian";
import type { SettingsContext } from "./SettingsContext";
import { GitHubCopilotCliManager, CliStatus } from "../../../copilot/providers/GitHubCopilotCliManager";
import { openModelPickerModal } from "../../components/ModelPickerModal";
import { getModelDisplayName, getAvailableModels, getModelMultiplier } from "../utils";

/**
 * Renders chat preference controls for Basic plugin.
 * Simplified version - CLI-only, no provider profiles or tool picker.
 */
export class ChatPreferencesSection {
	protected ctx: SettingsContext;
	protected getCachedStatus: () => CliStatus | null;
	protected manager: GitHubCopilotCliManager;

	/**
	 * @param ctx - Shared settings context.
	 * @param getCachedStatus - Function returning latest CLI status snapshot.
	 * @param manager - GitHub Copilot CLI manager.
	 * @param _tier - Ignored in Basic (always 'basic' behavior).
	 */
	constructor(
		ctx: SettingsContext,
		getCachedStatus: () => CliStatus | null,
		manager: GitHubCopilotCliManager,
		_tier: 'basic' | 'pro' = 'basic',
	) {
		this.ctx = ctx;
		this.getCachedStatus = getCachedStatus;
		this.manager = manager;
	}

	/**
	 * Renders chat preference controls.
	 *
	 * @param mainSettingsContainer - Parent container for settings sections.
	 * @param _status - Current CLI status snapshot (unused in Basic).
	 */
	render(mainSettingsContainer: HTMLElement, _status: CliStatus): void {
		const section = mainSettingsContainer.createDiv({ cls: "vc-settings-section vc-chat-preferences-section" });
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		const heading = sectionHeader.createEl("h3");
		heading.createSpan({ cls: "vc-section-icon", text: "💬" });
		heading.createSpan({ text: "Chat Preferences" });
		section.createEl("p", {
			text: "Configure model behavior and runtime preferences for conversations.",
			cls: "vc-section-description"
		});

		const settingsCard = section.createDiv({ cls: "vc-plugin-inner-settings-card" });

		// Model selection (CLI only in Basic)
		let updateModelButton: (() => void) | null = null;
		new Setting(settingsCard)
			.setName("Default Model")
			.setDesc("Select the AI model for conversations")
			.addButton((btn) => {
				btn.buttonEl.addClass("vc-model-settings-btn");
				const refresh = () => {
					const modelId = this.ctx.plugin.settings.model;
					const multiplier = getModelMultiplier(this.ctx.plugin.settings, modelId);
					const multStr = multiplier !== undefined ? `  ${multiplier}x` : "";
					btn.buttonEl.setText(getModelDisplayName(modelId) + multStr);
				};
				updateModelButton = refresh;
				refresh();
				btn.onClick(() => {
					const models = getAvailableModels(this.ctx.plugin.settings);
					const currentModel = this.ctx.plugin.settings.model;
					openModelPickerModal(this.ctx.app, {
						models,
						selectedModel: currentModel,
						title: "Select Model",
						getDisplayName: (modelId) => getModelDisplayName(modelId),
						getMultiplier: (modelId) => getModelMultiplier(this.ctx.plugin.settings, modelId),
						onSelectModel: async (modelId) => {
							this.ctx.plugin.settings.model = modelId;
							await this.ctx.plugin.saveSettings();
							refresh();
						},
					});
				});
			})
			.addExtraButton((button) => {
				button
					.setIcon("refresh-cw")
					.setTooltip("Refresh available models from CLI")
					.onClick(async () => {
						button.setDisabled(true);

						const result = await this.manager.fetchAvailableModels();
						if (result.models.length > 0) {
							const filteredModels = result.models.filter(m => !m.toLowerCase().includes('codex'));
							this.ctx.plugin.settings.availableModels = filteredModels;

							const firstModel = filteredModels[0];
							if (firstModel && !filteredModels.includes(this.ctx.plugin.settings.model)) {
								this.ctx.plugin.settings.model = firstModel;
							}

							// Also fetch billing multipliers from the connected service
							const svc = (this.ctx.plugin as unknown as { githubCopilotCliService?: { listModels(): Promise<Array<{ id: string; billingMultiplier?: number }>> } }).githubCopilotCliService;
							if (svc) {
								try {
									const modelInfos = await svc.listModels();
									const multipliers: Record<string, number> = {};
									for (const m of modelInfos) {
										if (m.billingMultiplier !== undefined) multipliers[m.id] = m.billingMultiplier;
									}
									this.ctx.plugin.settings.modelMultipliers = multipliers;
								} catch { /* non-critical */ }
							}

							await this.ctx.plugin.saveSettings();

							updateModelButton?.();
						}

						button.setDisabled(false);
					});
			});

		// Streaming toggle
		new Setting(settingsCard)
			.setName("Streaming")
			.setDesc("Stream responses as they arrive instead of waiting for completion.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.plugin.settings.streaming)
					.onChange(async (value) => {
						this.ctx.plugin.settings.streaming = value;
						await this.ctx.plugin.saveSettings();
					})
			);

		// Request timeout
		new Setting(settingsCard)
			.setName("Request Timeout")
			.setDesc("Maximum time to wait for AI responses (in seconds).")
			.addText((text) => {
				text
					.setPlaceholder("2700")
					.setValue(String(this.ctx.plugin.settings.requestTimeout / 1000))
					.onChange(async (value) => {
						const seconds = parseInt(value, 10) || 2700;
						this.ctx.plugin.settings.requestTimeout = Math.max(10, seconds) * 1000;
						await this.ctx.plugin.saveSettings();
					});
			});

		// Context compaction settings
		const compactionSubsection = settingsCard.createDiv({ cls: "vc-chat-preferences-compaction-subsection" });
		compactionSubsection.createEl("h4", { text: "Context Compaction", cls: "vc-shell-subsection-title" });

		new Setting(compactionSubsection)
			.setName("Background Compaction Threshold")
			.setDesc("Context utilization ratio (0.0-1.0) at which background compaction begins.")
			.addText((text) => {
				text
					.setPlaceholder("0.80")
					.setValue(String(this.ctx.plugin.settings.backgroundCompactionThreshold ?? 0.8))
					.onChange(async (value) => {
						const threshold = this.normalizeCompactionThreshold(value, 0.8);
						this.ctx.plugin.settings.backgroundCompactionThreshold = threshold;
						await this.ctx.plugin.saveSettings();
					});
			});

		new Setting(compactionSubsection)
			.setName("Buffer Exhaustion Threshold")
			.setDesc("Context utilization ratio (0.0-1.0) at which requests block and compact.")
			.addText((text) => {
				text
					.setPlaceholder("0.95")
					.setValue(String(this.ctx.plugin.settings.bufferExhaustionThreshold ?? 0.95))
					.onChange(async (value) => {
						const threshold = this.normalizeCompactionThreshold(value, 0.95);
						this.ctx.plugin.settings.bufferExhaustionThreshold = threshold;
						await this.ctx.plugin.saveSettings();
					});
			});

		const sessionsSubsection = settingsCard.createDiv({ cls: "vc-chat-preferences-sessions-subsection" });
		sessionsSubsection.createEl("h4", { text: "Sessions", cls: "vc-shell-subsection-title" });
		const sessionsAdvancedSubsection = sessionsSubsection.createDiv({ cls: "vc-chat-preferences-sessions-advanced-subsection" });
		sessionsAdvancedSubsection.createEl("h5", { text: "Advanced", cls: "vc-shell-subsection-title" });

		const cleanupDayOptions: Record<string, string> = {
			"1": "1 day",
			"3": "3 days",
			"7": "7 days",
			"14": "14 days",
			"30": "30 days",
			"all": "All",
		};
		let selectedCleanupWindow = "7";

		new Setting(sessionsAdvancedSubsection)
			.setName("Cleanup window")
			.setDesc("Choose how old sessions must be before cleanup.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(cleanupDayOptions)
					.setValue(selectedCleanupWindow)
					.onChange((value) => {
						selectedCleanupWindow = value;
					})
			);

		new Setting(sessionsAdvancedSubsection)
			.setName("Clean up previous sessions")
			.setDesc("Delete SDK sessions older than the selected window for the current user.")
			.addButton((button) =>
				button
					.setButtonText("Clean Up")
					.onClick(async () => {
						button.setDisabled(true);
						try {
							const pluginWithService = this.ctx.plugin as unknown as {
								settings: { userName?: string; githubUsername?: string; anonymousId?: string };
								githubCopilotCliService?: { cleanupExpiredSessions(maxAgeMs: number, userId?: string): Promise<number> };
							};
							const service = pluginWithService.githubCopilotCliService;
							if (!service) throw new Error("Copilot CLI service not initialized");

							const userId = pluginWithService.settings.userName
								|| pluginWithService.settings.githubUsername
								|| pluginWithService.settings.anonymousId
								|| undefined;
							const maxAgeMs = selectedCleanupWindow === "all"
								? 0
								: Number(selectedCleanupWindow) * 24 * 60 * 60 * 1000;

							const deleted = await service.cleanupExpiredSessions(maxAgeMs, userId);
							new Notice(`Deleted ${deleted} session${deleted === 1 ? "" : "s"}.`);
						} catch (error) {
							console.error("[ChatPreferences.Basic] Failed to clean up sessions:", error);
							new Notice("Failed to clean up sessions.");
						} finally {
							button.setDisabled(false);
						}
					})
			);

		// Status bar toggle
		new Setting(settingsCard)
			.setName("Status Bar Indicator")
			.setDesc("Show Copilot connection status in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.plugin.settings.showInStatusBar)
					.onChange(async (value) => {
						this.ctx.plugin.settings.showInStatusBar = value;
						await this.ctx.plugin.saveSettings();
						const plugin = this.ctx.plugin as unknown as { updateStatusBar?: () => void };
						plugin.updateStatusBar?.();
					})
			);
	}



	/**
	 * Parse and clamp a compaction threshold ratio.
	 */
	protected normalizeCompactionThreshold(value: string, fallback: number): number {
		const parsed = Number.parseFloat(value);
		if (!Number.isFinite(parsed)) {
			return fallback;
		}
		return Math.max(0, Math.min(1, parsed));
	}
}
