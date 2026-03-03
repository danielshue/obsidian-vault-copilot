/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ChatPreferencesSection
 * @description Settings section for chat runtime, provider/model selection, and tool defaults.
 *
 * @see {@link ToolPickerModal}
 * @see {@link GitHubCopilotCliManager}
 * @since 0.0.1
 */

import type CopilotPlugin from "../../../main";
import { Setting, DropdownComponent } from "obsidian";
import { SettingsContext } from "./SettingsContext";
import { GitHubCopilotCliManager, CliStatus } from "../../../copilot/providers/GitHubCopilotCliManager";
import { ToolCatalog } from "../../../copilot/tools/ToolCatalog";
import { ToolPickerModal, CopilotChatView, COPILOT_VIEW_TYPE } from "../../ChatView";
import { getProfileById } from "../profiles";
import { getModelDisplayName, getAvailableModels } from "../utils";
import { isMobile, isProviderAvailable } from "../../../utils/platform";
import { AppLogger, type LogFormat } from "../../../utils/AppLogger";
import type { OpenAIProviderProfile, AzureOpenAIProviderProfile } from "../types";
import { getOpenAIProfileApiKey, getAzureProfileApiKey, ensureBuiltInProfiles } from "../profiles";

/**
 * Renders chat preference controls and tool selection defaults.
 */
export class ChatPreferencesSection {
	private ctx: SettingsContext;
	private toolCatalog: ToolCatalog;
	private getCachedStatus: () => CliStatus | null;
	private manager: GitHubCopilotCliManager;
	private mainSettingsStatusKey: string | null = null;
	/** Plugin tier — Basic hides Pro-only settings such as tracing and tool selection. */
	private tier: 'basic' | 'pro';

	/**
	 * @param ctx - Shared settings context.
	 * @param toolCatalog - Tool catalog for summary and defaults.
	 * @param getCachedStatus - Function returning latest CLI status snapshot.
	 * @param manager - GitHub Copilot CLI manager.
	 * @param tier - Plugin tier; Basic hides Pro-only controls. Defaults to `'pro'`.
	 */
	constructor(
		ctx: SettingsContext,
		toolCatalog: ToolCatalog,
		getCachedStatus: () => CliStatus | null,
		manager: GitHubCopilotCliManager,
		tier: 'basic' | 'pro' = 'pro',
	) {
		this.ctx = ctx;
		this.toolCatalog = toolCatalog;
		this.getCachedStatus = getCachedStatus;
		this.manager = manager;
		this.tier = tier;
	}

	/** Cast plugin to the full Pro type for Pro-specific property access. */
	private get proPlugin(): CopilotPlugin { return this.ctx.plugin as unknown as CopilotPlugin; }

	/**
	 * Renders all chat preference controls.
	 *
	 * @param mainSettingsContainer - Parent container for settings sections.
	 * @param status - Current CLI status snapshot.
	 * @returns Void.
	 */
	render(mainSettingsContainer: HTMLElement, status: CliStatus): void {
		const statusKey = `${status.installed}-${status.version || ''}-${status.error || ''}`;
		this.mainSettingsStatusKey = statusKey;

		const section = mainSettingsContainer.createDiv({ cls: "vc-settings-section vc-chat-preferences-section" });
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		const heading = sectionHeader.createEl("h3");
		heading.createSpan({ cls: "vc-section-icon", text: "💬" });
		heading.createSpan({ text: "Chat Preferences" });
		section.createEl("p", {
			text: "Configure chat provider, model behavior, and runtime preferences for conversations.",
			cls: "vc-section-description"
		});

		const settingsCard = section.createDiv({ cls: "vc-plugin-inner-settings-card" });

		ensureBuiltInProfiles(this.ctx.plugin.settings);

		const profiles = this.ctx.plugin.settings.aiProviderProfiles || [];
		const chatProfiles = profiles.filter(p => {
			if (p.type === 'local') return false;
			if (p.type === 'copilot' || p.type === 'openai' || p.type === 'azure-openai') {
				return isProviderAvailable(p.type);
			}
			return false;
		});

		if (isMobile && this.ctx.plugin.settings.aiProvider === 'copilot') {
			new Setting(settingsCard)
				.setName("⚠️ Provider Unavailable")
				.setDesc("GitHub Copilot CLI is not available on mobile. Please select an OpenAI or Azure OpenAI profile.")
				.setClass("vc-mobile-warning");
		}

		new Setting(settingsCard)
			.setName("Chat Provider")
			.setDesc(isMobile
				? "Select AI provider for chat (GitHub Copilot CLI unavailable on mobile)"
				: "Select AI provider for chat: GitHub Copilot CLI or an AI Profile (OpenAI/Azure OpenAI)")
			.addDropdown((dropdown) => {
				for (const profile of chatProfiles) {
					dropdown.addOption(profile.id, profile.name);
				}

				const currentProfileId = this.ctx.plugin.settings.chatProviderProfileId || 'builtin-copilot';
				dropdown.setValue(currentProfileId);

				dropdown.onChange(async (value) => {
					this.ctx.plugin.settings.chatProviderProfileId = value;

					const profile = getProfileById(this.ctx.plugin.settings, value);
					if (profile) {
						if (profile.type === 'copilot') {
							this.ctx.plugin.settings.aiProvider = 'copilot';
						} else if (profile.type === 'openai') {
							this.ctx.plugin.settings.aiProvider = 'openai';
						} else if (profile.type === 'azure-openai') {
							this.ctx.plugin.settings.aiProvider = 'azure-openai';
						}
					}

					await this.ctx.plugin.saveSettings();

					await this.proPlugin.disconnectCopilot();
					await this.proPlugin.connectCopilot();

					this.ctx.display();
				});
			});

		if (this.ctx.plugin.settings.aiProvider === 'copilot') {
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

								const chatLeaves = this.ctx.app.workspace.getLeavesOfType(COPILOT_VIEW_TYPE);
								for (const leaf of chatLeaves) {
									const view = leaf.view as CopilotChatView;
									if (view?.refreshFromSettings) {
										view.refreshFromSettings();
									}
								}
							}

							button.setDisabled(false);
						});
				});
		} else {
			const profile = getProfileById(this.ctx.plugin.settings, this.ctx.plugin.settings.chatProviderProfileId);
			if (profile && (profile.type === 'openai' || profile.type === 'azure-openai')) {
				let modelDropdown: DropdownComponent | null = null;
				new Setting(settingsCard)
					.setName("Model")
					.setDesc(`Select model for ${profile.name}`)
					.addDropdown((dropdown) => {
						modelDropdown = dropdown;

						let currentModel = '';
						if (profile.type === 'openai') {
							currentModel = (profile as OpenAIProviderProfile).model || 'gpt-4o';
						} else if (profile.type === 'azure-openai') {
							currentModel = (profile as AzureOpenAIProviderProfile).model || (profile as AzureOpenAIProviderProfile).deploymentName;
						}

						if (profile.type === 'openai') {
							const defaultModels = [
								'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
								'o1', 'o1-mini', 'o1-preview', 'o3-mini'
							];
							for (const model of defaultModels) {
								dropdown.addOption(model, model);
							}
						} else if (profile.type === 'azure-openai') {
							const defaultModels = [
								'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-4-32k',
								'gpt-35-turbo', 'gpt-35-turbo-16k',
								'o1', 'o1-mini', 'o1-preview', 'o3-mini'
							];
							for (const model of defaultModels) {
								dropdown.addOption(model, model);
							}
						}

						dropdown.setValue(currentModel);
						dropdown.onChange(async (value) => {
							if (profile.type === 'openai') {
								(profile as OpenAIProviderProfile).model = value;
							} else if (profile.type === 'azure-openai') {
								(profile as AzureOpenAIProviderProfile).model = value;
							}

							const profiles = this.ctx.plugin.settings.aiProviderProfiles;
							const profileIndex = profiles?.findIndex(p => p.id === profile.id) ?? -1;
							if (profiles && profileIndex !== -1) {
								profiles[profileIndex] = profile;
								await this.ctx.plugin.saveSettings();
							}
						});
					})
					.addExtraButton((button) => {
						button
							.setIcon("refresh-cw")
							.setTooltip("Refresh available models from API")
							.onClick(async () => {
								button.setDisabled(true);
								console.log("Discovering models...");

								try {
									let models: string[] = [];

									if (profile.type === 'openai') {
										const apiKey = getOpenAIProfileApiKey(this.ctx.app, profile as OpenAIProviderProfile);
										const service = this.proPlugin.openaiService || new (await import('../../../copilot/providers/OpenAIService')).OpenAIService(this.ctx.app, {
											provider: 'openai',
											model: 'gpt-4o',
											streaming: false,
											apiKey,
											baseURL: (profile as OpenAIProviderProfile).baseURL,
										});

										await service.initialize();
										models = await service.listModels();
									} else if (profile.type === 'azure-openai') {
										const apiKey = getAzureProfileApiKey(this.ctx.app, profile as AzureOpenAIProviderProfile);
										const service = new (await import('../../../copilot/providers/AzureOpenAIService')).AzureOpenAIService(this.ctx.app, {
											provider: 'azure-openai',
											model: 'gpt-4o',
											streaming: false,
											apiKey: apiKey || '',
											endpoint: (profile as AzureOpenAIProviderProfile).endpoint,
											deploymentName: (profile as AzureOpenAIProviderProfile).deploymentName,
											apiVersion: (profile as AzureOpenAIProviderProfile).apiVersion,
										});

										await service.initialize();
										models = await service.listModels();
									}

									if (models.length > 0) {
										if (modelDropdown) {
											modelDropdown.selectEl.empty();
											for (const model of models) {
												modelDropdown.addOption(model, model);
											}

											let currentModel = '';
											if (profile.type === 'openai') {
												currentModel = (profile as OpenAIProviderProfile).model || '';
											} else if (profile.type === 'azure-openai') {
												currentModel = (profile as AzureOpenAIProviderProfile).model || '';
											}

											if (currentModel && models.includes(currentModel)) {
												modelDropdown.setValue(currentModel);
											} else if (models.length > 0) {
												const firstModel = models[0];
												if (!firstModel) return;
												modelDropdown.setValue(firstModel);
												if (profile.type === 'openai') {
													(profile as OpenAIProviderProfile).model = firstModel;
												} else if (profile.type === 'azure-openai') {
													(profile as AzureOpenAIProviderProfile).model = firstModel;
												}
												const profiles = this.ctx.plugin.settings.aiProviderProfiles;
												const profileIndex = profiles?.findIndex(p => p.id === profile.id) ?? -1;
												if (profiles && profileIndex !== -1) {
													profiles[profileIndex] = profile;
													await this.ctx.plugin.saveSettings();
												}
											}
										}

										console.log(`Found ${models.length} models`);
									} else {
										console.log("No models found");
									}
								} catch (error) {
									console.error(`Error discovering models: ${error}`);
								}

								button.setDisabled(false);
							});
					});
			}
		}

		new Setting(settingsCard)
			.setName("Streaming")
			.setDesc("Streaming keeps the UI responsive and avoids waiting for the entire final result before updating the screen.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.plugin.settings.streaming)
					.onChange(async (value) => {
						this.ctx.plugin.settings.streaming = value;
						await this.ctx.plugin.saveSettings();
					})
			);

		new Setting(settingsCard)
			.setName("Request Timeout")
			.setDesc("Maximum time to wait for AI responses (in seconds). Longer complex queries may need more time.")
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
			.setDesc("Context utilization ratio (0.0-1.0) at which requests block and compact before continuing.")
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

		if (this.tier === 'pro') {
			new Setting(settingsCard)
				.setName("Tracing")
				.setDesc("Enable tracing to capture detailed execution information including LLM generations, tool calls, and agent handoffs. View traces via the gear menu.")
				.addToggle((toggle) =>
					toggle
						.setValue(this.ctx.plugin.settings.tracingEnabled)
						.onChange(async (value) => {
							this.ctx.plugin.settings.tracingEnabled = value;
							await this.ctx.plugin.saveSettings();
						})
				);

			new Setting(settingsCard)
				.setName("Log Level")
				.setDesc("SDK logging level when tracing is enabled. 'debug' captures the most detail.")
				.addDropdown((dropdown) =>
					dropdown
						.addOptions({
							'debug': 'Debug (verbose)',
							'info': 'Info (default)',
							'warn': 'Warning',
							'error': 'Error only'
						})
						.setValue(this.ctx.plugin.settings.logLevel || 'info')
						.onChange(async (value) => {
							this.ctx.plugin.settings.logLevel = value as 'debug' | 'info' | 'warn' | 'error';
							await this.ctx.plugin.saveSettings();
						})
				);

			new Setting(settingsCard)
				.setName("Write logs to file")
				.setDesc("Save SDK logs to .obsidian/plugins/obsidian-vault-copilot-pro/logs/ as daily .log and .jsonl files. Desktop only.")
				.addToggle((toggle) =>
					toggle
						.setValue(this.ctx.plugin.settings.fileLoggingEnabled)
						.onChange(async (value) => {
							this.ctx.plugin.settings.fileLoggingEnabled = value;
							await this.ctx.plugin.saveSettings();
							updateLogFormatSettingState();
						})
				);

			const logFormatSetting = new Setting(settingsCard)
				.setName("Log file format")
				.setDesc("Choose text (.log), JSON (.jsonl), or both for diagnostic file output.")
				.addDropdown((dropdown) =>
					dropdown
						.addOptions({
							text: "Text (.log)",
							json: "JSON (.jsonl)",
							both: "Both",
						})
						.setValue(this.ctx.plugin.settings.logFormat || "both")
						.onChange(async (value) => {
							const format = value as LogFormat;
							this.ctx.plugin.settings.logFormat = format;
							AppLogger.getInstanceOrNull()?.reconfigure(format);
							await this.ctx.plugin.saveSettings();
						})
				);

			const updateLogFormatSettingState = (): void => {
				const enabled = this.ctx.plugin.settings.fileLoggingEnabled;
				logFormatSetting.settingEl.style.display = enabled ? "" : "none";
				logFormatSetting.setDisabled(!enabled);
			};
			updateLogFormatSettingState();
		}

		new Setting(settingsCard)
			.setName("Status Bar Indicator")
			.setDesc("Show Copilot connection status in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(this.ctx.plugin.settings.showInStatusBar)
					.onChange(async (value) => {
						this.ctx.plugin.settings.showInStatusBar = value;
						await this.ctx.plugin.saveSettings();
							this.proPlugin.updateStatusBar?.();
					})
			);

		// Tool Selection Defaults Section — Pro only (Basic has fixed tools, no ToolCatalog)
		if (this.tier === 'pro' && this.toolCatalog) {
			const toolSection = mainSettingsContainer.createDiv({ cls: "vc-settings-section vc-tool-selection-section" });
			const toolSectionHeader = toolSection.createDiv({ cls: "vc-section-header" });
			const toolSectionHeading = toolSectionHeader.createEl("h3");
			toolSectionHeading.createSpan({ cls: "vc-section-icon", text: "🧰" });
			toolSectionHeading.createSpan({ text: "Tool Selection" });

			toolSection.createEl("p", {
				text: "Configure which tools are available to the AI by default. Built-in tools are enabled by default, MCP tools are disabled.",
				cls: "vc-section-description"
			});

			const toolSettingsCard = toolSection.createDiv({ cls: "vc-plugin-inner-settings-card" });

			const toolSummaryEl = toolSettingsCard.createDiv({ cls: "vc-tool-summary" });
			this.updateToolSummary(toolSummaryEl);

			new Setting(toolSettingsCard)
				.setName("Default Enabled Tools")
				.setDesc("Choose which tools are enabled by default for new chat sessions")
				.addButton((button) => {
					button
						.setButtonText("Configure Tools...")
						.onClick(() => {
							const modal = new ToolPickerModal(this.ctx.app, {
								toolCatalog: this.toolCatalog,
								settings: this.ctx.plugin.settings,
								session: undefined,
								mode: "defaults",
								onSave: async (enabledTools: string[]) => {
									this.ctx.plugin.settings.defaultEnabledTools = enabledTools;
									this.ctx.plugin.settings.defaultDisabledTools = [];
									await this.ctx.plugin.saveSettings();
									this.updateToolSummary(toolSummaryEl);
								}
							});
							modal.open();
						});
				});
		}
	}

	/**
	 * Populates a model dropdown from available settings state.
	 * @param dropdown - Dropdown control to fill.
	 * @returns Void.
	 */
	populateModelDropdown(dropdown: DropdownComponent): void {
		dropdown.selectEl.empty();

		const models = getAvailableModels(this.ctx.plugin.settings);
		for (const modelId of models) {
			dropdown.addOption(modelId, getModelDisplayName(modelId));
		}
	}

	/**
	 * Updates the visible tool summary text.
	 * @param container - Element receiving summary copy.
	 * @returns Void.
	 */
	updateToolSummary(container: HTMLElement): void {
		container.empty();
		const summary = this.toolCatalog.getToolsSummary(this.ctx.plugin.settings);
		container.createEl("span", {
			text: `${summary.enabled}/${summary.total} tools enabled (${summary.builtin} built-in, ${summary.plugin} plugin, ${summary.mcp} MCP)`,
			cls: "vc-status-detail"
		});
	}

	/**
	 * Parse and clamp a compaction threshold ratio.
	 *
	 * @param value - Raw text input from settings control.
	 * @param fallback - Fallback ratio used when parsing fails.
	 * @returns Normalized ratio between 0.0 and 1.0.
	 * @internal
	 */
	private normalizeCompactionThreshold(value: string, fallback: number): number {
		const parsed = Number.parseFloat(value);
		if (!Number.isFinite(parsed)) {
			return fallback;
		}

		return Math.max(0, Math.min(1, parsed));
	}
}
