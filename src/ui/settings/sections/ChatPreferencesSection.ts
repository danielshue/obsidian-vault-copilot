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

import { Setting, DropdownComponent } from "obsidian";
import type { SettingsContext } from "./SettingsContext";
import { GitHubCopilotCliManager, CliStatus } from "../../../copilot/providers/GitHubCopilotCliManager";
import { ToolCatalog } from "../../../copilot/tools/ToolCatalog";
import { getModelDisplayName, getAvailableModels } from "../utils";

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
		let modelDropdown: DropdownComponent | null = null;
		new Setting(settingsCard)
			.setName("Default Model")
			.setDesc("Select the AI model for conversations")
			.addDropdown((dropdown) => {
				modelDropdown = dropdown;
				this.populateModelDropdown(dropdown);
				dropdown.setValue(this.ctx.plugin.settings.model);
				dropdown.onChange(async (value) => {
					this.ctx.plugin.settings.model = value;
					await this.ctx.plugin.saveSettings();
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

							await this.ctx.plugin.saveSettings();

							if (modelDropdown) {
								this.populateModelDropdown(modelDropdown);
								modelDropdown.setValue(this.ctx.plugin.settings.model);
							}
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
					})
			);
	}

	/**
	 * Populates a model dropdown from available settings state.
	 */
	populateModelDropdown(dropdown: DropdownComponent): void {
		dropdown.selectEl.empty();
		const models = getAvailableModels(this.ctx.plugin.settings);
		for (const modelId of models) {
			dropdown.addOption(modelId, getModelDisplayName(modelId));
		}
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
