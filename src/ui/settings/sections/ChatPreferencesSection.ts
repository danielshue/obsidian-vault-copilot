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

import { Setting, Menu } from "obsidian";
import type { SettingsContext } from "./SettingsContext";
import { GitHubCopilotCliManager, CliStatus } from "../../../copilot/providers/GitHubCopilotCliManager";
import { ToolCatalog } from "../../../copilot/tools/ToolCatalog";
import { getModelDisplayName, getAvailableModels, getModelLabel, getModelMultiplier } from "../utils";

/**
 * Renders chat preference controls for Basic plugin.
 * Simplified version - CLI-only, no provider profiles or tool picker.
 */
export class ChatPreferencesSection {
	protected ctx: SettingsContext;
	protected toolCatalog: ToolCatalog;
	protected getCachedStatus: () => CliStatus | null;
	protected manager: GitHubCopilotCliManager;

	/**
	 * @param ctx - Shared settings context.
	 * @param toolCatalog - Tool catalog (unused in Basic, kept for API compat).
	 * @param getCachedStatus - Function returning latest CLI status snapshot.
	 * @param manager - GitHub Copilot CLI manager.
	 * @param _tier - Ignored in Basic (always 'basic' behavior).
	 */
	constructor(
		ctx: SettingsContext,
		toolCatalog: ToolCatalog,
		getCachedStatus: () => CliStatus | null,
		manager: GitHubCopilotCliManager,
		_tier: 'basic' | 'pro' = 'basic',
	) {
		this.ctx = ctx;
		this.toolCatalog = toolCatalog;
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
				btn.onClick((e) => {
					const menu = new Menu();
					const models = getAvailableModels(this.ctx.plugin.settings);
					const currentModel = this.ctx.plugin.settings.model;

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
							const isSelected = currentModel === modelId;
							const multiplier = getModelMultiplier(this.ctx.plugin.settings, modelId);
							item.setTitle(getModelDisplayName(modelId))
								.onClick(async () => {
									this.ctx.plugin.settings.model = modelId;
									await this.ctx.plugin.saveSettings();
									refresh();
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
								nameEl.textContent = getModelDisplayName(modelId);
								const multEl = document.createElement("span");
								multEl.className = "vc-model-col-mult";
								multEl.textContent = multiplier !== undefined ? `${multiplier}x` : "";
								titleEl.append(checkEl, nameEl, multEl);
							}
						});
					}

					menu.showAtMouseEvent(e);
					const menuEl = (menu as unknown as { dom?: HTMLElement }).dom;
					menuEl?.classList.add("vc-model-menu");
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
