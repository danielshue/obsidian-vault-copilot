// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module CopilotSettingTab
 * @description Settings tab UI for Vault Copilot, including chat, voice, tools, MCP, and customization controls.
 *
 * This module contains the full Obsidian settings tab implementation. It consumes
 * the typed settings definitions from this folder and coordinates with Copilot services
 * for status checks, profile management, voice configuration, and tool visibility.
 *
 * @see {@link CopilotPlugin} for the main plugin implementation
 * @since 0.0.1
 */

import { App, PluginSettingTab, Setting, FileSystemAdapter } from "obsidian";
import CopilotPlugin from "../../main";
import { GitHubCopilotCliManager, CliStatus } from "../../copilot/providers/GitHubCopilotCliManager";
import { SkillInfo, McpServerConfig } from "../../copilot/customization/SkillRegistry";
import { WhisperCppManager, WHISPER_MODELS, WhisperServerStatus } from "../../copilot/voice-chat/whisper/WhisperCppManager";
import { DiscoveredMcpServer, isStdioConfig, McpConnectionStatus, McpServerSource } from "../../copilot/mcp/McpTypes";
import { getSourceLabel, getSourceIcon } from "../../copilot/mcp/McpManager";
import { ToolCatalog } from "../../copilot/tools/ToolCatalog";
import { ToolPickerModal, CopilotChatView, COPILOT_VIEW_TYPE } from "../ChatView";
import { FileSuggest } from "../FileSuggest";
import { getOpenAIApiKey } from "../../copilot/providers/AIProvider";
import { RealtimeVoice, TurnDetectionMode, DEFAULT_TOOL_CONFIG } from "../../copilot/voice-chat";
import { periodicNoteIcons, wrapIcon } from "../assets/periodicNotesIcons";
import { isMobile, isProviderAvailable } from "../../utils/platform";

// Import types and utilities for use in CopilotSettingTab
import type {
	CopilotPluginSettings,
	AIProviderProfile,
	AIProviderProfileType,
	OpenAIProviderProfile,
	AzureOpenAIProviderProfile,
	LocalProviderProfile,
	PeriodicNotesSettings,
	WeekStartDay,
} from "./types";
import { DEFAULT_PERIODIC_NOTES, DEFAULT_SETTINGS, COPILOT_LOGO_DATA_URL } from "./defaults";
import {
	ensureBuiltInProfiles,
	getProfileById,
	getOpenAIProfiles,
	getProfileTypeDisplayName,
	profileTypeToBackend,
	getOpenAIProfileApiKey,
	getAzureProfileApiKey,
} from "./profiles";
import { getModelDisplayName, getAvailableModels } from "./utils";
import { AIProviderProfileModal, AddHttpMcpServerModal } from "./modals";
import { AutomationDetailsModal } from "./modals/AutomationDetailsModal";

export class CopilotSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;
	private githubCopilotCliManager: GitHubCopilotCliManager;
	private statusContainer: HTMLElement | null = null;
	private mainSettingsContainer: HTMLElement | null = null;
	private skillsContainer: HTMLElement | null = null;
	private cachedStatus: CliStatus | null = null;
	private mainSettingsStatusKey: string | null = null;
	private skillRegistryUnsubscribe: (() => void) | null = null;
	private toolCatalog: ToolCatalog;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.githubCopilotCliManager = new GitHubCopilotCliManager(plugin.settings.cliPath);
		this.toolCatalog = new ToolCatalog(plugin.skillRegistry, plugin.mcpManager);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("vc-settings");

		// Main settings container - will be populated after status check
		this.mainSettingsContainer = containerEl.createDiv({ cls: "vc-main-settings" });
		this.mainSettingsStatusKey = null;
		this.renderMainSettingsIfReady(this.cachedStatus || { installed: false });

		// Registered Skills Section
		this.renderRegisteredSkillsSection(containerEl);

		// Automations Section
		this.renderAutomationsSection(containerEl);

		// Advanced Settings (always visible)
		this.renderAdvancedSettings(containerEl);

		// CLI Status Section - renders immediately with loading state (moved to bottom)
		this.renderCliStatusSection(containerEl);

		// Vault Setup Section
		this.renderVaultSetupSection(containerEl);

		// Help Section
		this.renderHelpSection(containerEl);

		// Trigger async status check (non-blocking)
		const hasUserConfig = this.hasUserConfiguration();
		if (!this.plugin.settings.cliStatusChecked && hasUserConfig) {
			this.plugin.settings.cliStatusChecked = true;
			void this.plugin.saveSettings();
		}

		if (!this.plugin.settings.cliStatusChecked && !hasUserConfig) {
			this.checkStatusAsync()
				.finally(async () => {
					this.plugin.settings.cliStatusChecked = true;
					await this.plugin.saveSettings();
				});
		} else if (this.cachedStatus || this.plugin.settings.cliLastKnownStatus) {
			this.cachedStatus = this.cachedStatus || this.plugin.settings.cliLastKnownStatus || null;
			if (this.cachedStatus) {
				this.renderStatusDisplay(this.cachedStatus);
			}
		} else {
			this.renderStatusDeferred();
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

	private renderCliStatusSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section" });
		
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		sectionHeader.createEl("h3", { text: "GitHub Copilot Connection Status" });
		
		const refreshBtn = sectionHeader.createEl("button", { 
			cls: "vc-refresh-btn",
			attr: { "aria-label": "Refresh status" }
		});
		refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
		refreshBtn.addEventListener("click", () => {
			refreshBtn.addClass("vc-spinning");
			this.githubCopilotCliManager.invalidateCache();
			this.checkStatusAsync().finally(() => {
				refreshBtn.removeClass("vc-spinning");
			});
		});
		
		this.statusContainer = section.createDiv({ cls: "vc-status-card" });
		
		// Show loading state immediately
		this.renderLoadingStatus();
	}

	private renderLoadingStatus(): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();
		
		const loadingEl = this.statusContainer.createDiv({ cls: "vc-status-loading" });
		loadingEl.innerHTML = `
			<div class="vc-spinner"></div>
			<span>Checking connection...</span>
		`;
	}

	private renderStatusDeferred(): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();

		const infoEl = this.statusContainer.createDiv({ cls: "vc-status-loading" });
		infoEl.innerHTML = `
			<span>Connection status check is paused. Use refresh to check.</span>
		`;
	}

	private async checkStatusAsync(): Promise<void> {
		try {
			const status = await this.githubCopilotCliManager.getStatus(true);
			this.cachedStatus = status;
			this.plugin.settings.cliLastKnownStatus = status;
			await this.plugin.saveSettings();
			this.renderStatusDisplay(status);
			this.renderMainSettingsIfReady(status);
		} catch (error) {
			this.renderStatusError(String(error));
		}
	}

	private renderStatusDisplay(status: CliStatus): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();

		const statusGrid = this.statusContainer.createDiv({ cls: "vc-status-grid" });

		// CLI Installation Status
		const cliCard = statusGrid.createDiv({ cls: "vc-status-item" });
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
		container.addClass(opts.isOk ? "vc-status-ok" : "vc-status-error");
		
		const iconEl = container.createDiv({ cls: "vc-status-icon" });
		iconEl.innerHTML = opts.icon;
		
		const textEl = container.createDiv({ cls: "vc-status-text" });
		textEl.createEl("span", { text: opts.label, cls: "vc-status-label" });
		textEl.createEl("span", { text: opts.detail, cls: "vc-status-detail" });
	}

	private renderStatusError(error: string): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();
		
		const errorEl = this.statusContainer.createDiv({ cls: "vc-status-error-msg" });
		errorEl.createEl("span", { text: `Error checking status: ${error}` });
	}

	private renderInstallActions(container: HTMLElement): void {
		const actionsEl = container.createDiv({ cls: "vc-status-actions" });
		
		const installInfo = this.githubCopilotCliManager.getInstallCommand();
		
		// Command display
		const cmdGroup = actionsEl.createDiv({ cls: "vc-cmd-group" });
		cmdGroup.createEl("label", { text: installInfo.description });
		
		const cmdRow = cmdGroup.createDiv({ cls: "vc-cmd-row" });
		cmdRow.createEl("code", { text: installInfo.command });
		
		const copyBtn = cmdRow.createEl("button", { text: "Copy", cls: "vc-btn-secondary vc-btn-sm" });
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(installInfo.command);
			console.log("Copied to clipboard");
		});

		// Action buttons
		const btnRow = actionsEl.createDiv({ cls: "vc-btn-row" });

		const docsLink = btnRow.createEl("a", { text: "View Guide", cls: "vc-btn-link", href: installInfo.url });
		docsLink.setAttr("target", "_blank");
	}

	private renderAuthNote(container: HTMLElement): void {
		const noteEl = container.createDiv({ cls: "vc-auth-note" });
		noteEl.createEl("p", { 
			text: "Authentication is handled automatically when you first use GitHub Copilot. If prompted, use the /login command in the CLI.",
			cls: "vc-status-desc"
		});

		// Expandable PAT info
		const detailsEl = noteEl.createEl("details", { cls: "vc-auth-details" });
		detailsEl.createEl("summary", { text: "Alternative: Use Personal Access Token" });
		
		const patContent = detailsEl.createDiv({ cls: "vc-pat-content" });
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

		const statusKey = `${status.installed}-${status.version || ''}-${status.error || ''}`;
		if (this.mainSettingsStatusKey === statusKey && this.mainSettingsContainer.children.length > 0) {
			return;
		}
		this.mainSettingsStatusKey = statusKey;
		this.mainSettingsContainer.empty();

		// Chat Preferences Section
		const section = this.mainSettingsContainer.createDiv({ cls: "vc-settings-section" });
		section.createEl("h3", { text: "Chat Preferences" });

		// Ensure built-in profiles exist
		ensureBuiltInProfiles(this.plugin.settings);

		// AI Provider Selection - GitHub Copilot CLI or AI Profiles
		const profiles = this.plugin.settings.aiProviderProfiles || [];
		// Chat profiles: Filter based on platform availability
		// On mobile: only OpenAI and Azure OpenAI
		// On desktop: Copilot built-in, OpenAI, and Azure OpenAI
		const chatProfiles = profiles.filter(p => {
			if (p.type === 'local') return false; // Never show local for chat
			// Type guard: only check availability for supported provider types
			if (p.type === 'copilot' || p.type === 'openai' || p.type === 'azure-openai') {
				return isProviderAvailable(p.type);
			}
			return false;
		});
		
		// Show warning on mobile if Copilot is selected
		if (isMobile && this.plugin.settings.aiProvider === 'copilot') {
			new Setting(section)
				.setName("⚠️ Provider Unavailable")
				.setDesc("GitHub Copilot CLI is not available on mobile. Please select an OpenAI or Azure OpenAI profile.")
				.setClass("vc-mobile-warning");
		}
		
		new Setting(section)
			.setName("Chat Provider")
			.setDesc(isMobile 
				? "Select AI provider for chat (GitHub Copilot CLI unavailable on mobile)"
				: "Select AI provider for chat: GitHub Copilot CLI or an AI Profile (OpenAI/Azure OpenAI)")
			.addDropdown((dropdown) => {
				// Add all chat-capable profiles
				for (const profile of chatProfiles) {
					dropdown.addOption(profile.id, profile.name);
				}
				
				// Set current value based on chatProviderProfileId
				const currentProfileId = this.plugin.settings.chatProviderProfileId || 'builtin-copilot';
				dropdown.setValue(currentProfileId);
				
				dropdown.onChange(async (value) => {
					this.plugin.settings.chatProviderProfileId = value;
					
					// Update aiProvider based on selected profile
					const profile = getProfileById(this.plugin.settings, value);
					if (profile) {
						if (profile.type === 'copilot') {
							this.plugin.settings.aiProvider = 'copilot';
						} else if (profile.type === 'openai') {
							this.plugin.settings.aiProvider = 'openai';
						} else if (profile.type === 'azure-openai') {
							this.plugin.settings.aiProvider = 'azure-openai';
						}
					}
					
					await this.plugin.saveSettings();
					
					// Reconnect to the new provider
					await this.plugin.disconnectCopilot();
					await this.plugin.connectCopilot();
					
					// Refresh settings to update model dropdown visibility
					this.display();
				});
			});

		// Model selection - only show for GitHub Copilot CLI
		if (this.plugin.settings.aiProvider === 'copilot') {
			let modelDropdown: any;
			const modelSetting = new Setting(section)
				.setName("Default Model")
				.setDesc("Select the AI model for conversations")
				.addDropdown((dropdown) => {
					modelDropdown = dropdown;
					this.populateModelDropdown(dropdown);
					dropdown.setValue(this.plugin.settings.model);
					dropdown.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					});
				})
				.addExtraButton((button) => {
					button
						.setIcon("refresh-cw")
						.setTooltip("Refresh available models from CLI")
						.onClick(async () => {
							button.setDisabled(true);
							
							const result = await this.githubCopilotCliManager.fetchAvailableModels();
							if (result.models.length > 0) {
								// Filter out Codex models since we don't work with code in the vault
								const filteredModels = result.models.filter(m => !m.toLowerCase().includes('codex'));
								this.plugin.settings.availableModels = filteredModels;
								
								// Validate current model is still available
								const firstModel = filteredModels[0];
								if (firstModel && !filteredModels.includes(this.plugin.settings.model)) {
									this.plugin.settings.model = firstModel;
								}
								
								await this.plugin.saveSettings();
								
								// Update the dropdown
								if (modelDropdown) {
									this.populateModelDropdown(modelDropdown);
									modelDropdown.setValue(this.plugin.settings.model);
								}
								
								// Immediately update any open chat views
								const chatLeaves = this.app.workspace.getLeavesOfType(COPILOT_VIEW_TYPE);
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
			// For OpenAI and Azure OpenAI, show model selection with discovery
			const profile = getProfileById(this.plugin.settings, this.plugin.settings.chatProviderProfileId);
			if (profile && (profile.type === 'openai' || profile.type === 'azure-openai')) {
				let modelDropdown: any;
				const modelSetting = new Setting(section)
					.setName("Model")
					.setDesc(`Select model for ${profile.name}`)
					.addDropdown((dropdown) => {
						modelDropdown = dropdown;
						
						// Get current model from profile
						let currentModel = '';
						if (profile.type === 'openai') {
							currentModel = (profile as OpenAIProviderProfile).model || 'gpt-4o';
						} else if (profile.type === 'azure-openai') {
							currentModel = (profile as AzureOpenAIProviderProfile).model || (profile as AzureOpenAIProviderProfile).deploymentName;
						}
						
						// Populate with default chat models initially (no realtime/audio)
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
							// Update the profile's model
							if (profile.type === 'openai') {
								(profile as OpenAIProviderProfile).model = value;
							} else if (profile.type === 'azure-openai') {
								(profile as AzureOpenAIProviderProfile).model = value;
							}
							
							// Update the profile in settings
							const profileIndex = this.plugin.settings.aiProviderProfiles!.findIndex(p => p.id === profile.id);
							if (profileIndex !== -1) {
								this.plugin.settings.aiProviderProfiles![profileIndex] = profile;
								await this.plugin.saveSettings();
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
										// Fetch models from OpenAI API
										const apiKey = getOpenAIProfileApiKey(this.app, profile as OpenAIProviderProfile);
										const service = this.plugin.openaiService || new (await import('../../copilot/providers/OpenAIService')).OpenAIService(this.app, {
											provider: 'openai',
											model: 'gpt-4o',
											streaming: false,
											apiKey,
											baseURL: (profile as OpenAIProviderProfile).baseURL,
										});
										
										await service.initialize();
										models = await service.listModels();
									} else if (profile.type === 'azure-openai') {
										// For Azure, we provide the static list
										const apiKey = getAzureProfileApiKey(this.app, profile as AzureOpenAIProviderProfile);
										const service = new (await import('../../copilot/providers/AzureOpenAIService')).AzureOpenAIService(this.app, {
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
										// Repopulate dropdown
										if (modelDropdown) {
											modelDropdown.selectEl.empty();
											for (const model of models) {
												modelDropdown.addOption(model, model);
											}
											
											// Keep current selection if still available
											let currentModel = '';
											if (profile.type === 'openai') {
												currentModel = (profile as OpenAIProviderProfile).model || '';
											} else if (profile.type === 'azure-openai') {
												currentModel = (profile as AzureOpenAIProviderProfile).model || '';
											}
											
											if (currentModel && models.includes(currentModel)) {
												modelDropdown.setValue(currentModel);
											} else if (models.length > 0) {
												modelDropdown.setValue(models[0]);
												// Update profile with first model
												if (profile.type === 'openai') {
													(profile as OpenAIProviderProfile).model = models[0];
												} else if (profile.type === 'azure-openai') {
													(profile as AzureOpenAIProviderProfile).model = models[0];
												}
												const profileIndex = this.plugin.settings.aiProviderProfiles!.findIndex(p => p.id === profile.id);
												if (profileIndex !== -1) {
													this.plugin.settings.aiProviderProfiles![profileIndex] = profile;
													await this.plugin.saveSettings();
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

		// Streaming toggle
		new Setting(section)
			.setName("Streaming")
			.setDesc("Streaming keeps the UI responsive and avoids waiting for the entire final result before updating the screen.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.streaming)
					.onChange(async (value) => {
						this.plugin.settings.streaming = value;
						await this.plugin.saveSettings();
					})
			);

		// Request timeout
		new Setting(section)
			.setName("Request Timeout")
			.setDesc("Maximum time to wait for AI responses (in seconds). Longer complex queries may need more time.")
			.addText((text) => {
				text
					.setPlaceholder("120")
					.setValue(String(this.plugin.settings.requestTimeout / 1000))
					.onChange(async (value) => {
						const seconds = parseInt(value, 10) || 120;
						this.plugin.settings.requestTimeout = Math.max(10, seconds) * 1000; // Minimum 10 seconds
						await this.plugin.saveSettings();
					});
			});

		// Tracing toggle
		new Setting(section)
			.setName("Tracing")
			.setDesc("Enable tracing to capture detailed execution information including LLM generations, tool calls, and agent handoffs. View traces via the gear menu.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.tracingEnabled)
					.onChange(async (value) => {
						this.plugin.settings.tracingEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		// Log level dropdown (only shown when tracing is enabled)
		new Setting(section)
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
					.setValue(this.plugin.settings.logLevel || 'info')
					.onChange(async (value) => {
						this.plugin.settings.logLevel = value as 'debug' | 'info' | 'warn' | 'error';
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

		// Date & Time Preferences Section
		this.renderDateTimeSettings(this.mainSettingsContainer);

		// Tool Selection Defaults Section
		const toolSection = this.mainSettingsContainer.createDiv({ cls: "vc-settings-section" });
		toolSection.createEl("h3", { text: "Tool Selection" });
		
		const toolDesc = toolSection.createEl("p", { 
			text: "Configure which tools are available to the AI by default. Built-in tools are enabled by default, MCP tools are disabled.",
			cls: "vc-status-desc"
		});
		
		// Tool summary display
		const toolSummaryEl = toolSection.createDiv({ cls: "vc-tool-summary" });
		this.updateToolSummary(toolSummaryEl);
		
		// Button to open tool picker
		new Setting(toolSection)
			.setName("Default Enabled Tools")
			.setDesc("Choose which tools are enabled by default for new chat sessions")
			.addButton((button) => {
				button
					.setButtonText("Configure Tools...")
					.onClick(() => {
						const modal = new ToolPickerModal(this.app, {
							toolCatalog: this.toolCatalog,
							settings: this.plugin.settings,
							session: undefined, // no session - defaults mode
							mode: "defaults",
							onSave: async (enabledTools: string[]) => {
								this.plugin.settings.defaultEnabledTools = enabledTools;
								this.plugin.settings.defaultDisabledTools = [];
								await this.plugin.saveSettings();
								this.updateToolSummary(toolSummaryEl);
							}
						});
						modal.open();
					});
			});

		// Periodic Notes Settings Section
		this.renderPeriodicNotesSettings(this.mainSettingsContainer);

		// AI Provider Profiles Section (before Voice settings)
		this.renderAIProviderProfilesSection(this.mainSettingsContainer);

		// Whisper.cpp Local Server Section
		this.renderWhisperCppSection(this.mainSettingsContainer);

		// Voice Chat Settings Section
		this.renderVoiceSettings(this.mainSettingsContainer);
	}

	/**
	 * Render AI Provider Profiles management section
	 */
	private renderAIProviderProfilesSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: "vc-settings-section" });
		section.createEl("h3", { text: "AI Provider Profiles" });
		
		section.createEl("p", { 
			text: "Configure AI provider profiles for Chat and Voice services. GitHub Copilot CLI is built-in. Create additional profiles for OpenAI, Azure OpenAI, or local Whisper servers.",
			cls: "vc-status-desc"
		});

		// Profile list container
		const profileListContainer = section.createDiv({ cls: "vc-profile-list" });
		this.renderProfileList(profileListContainer);

		// Add profile button
		new Setting(section)
			.setName("Add Profile")
			.setDesc("Create a new AI provider profile")
			.addButton((button) => {
				button
					.setButtonText("Add Profile")
					.onClick(() => {
						const modal = new AIProviderProfileModal(this.app, null, async (profile) => {
							if (!this.plugin.settings.aiProviderProfiles) {
								this.plugin.settings.aiProviderProfiles = [];
							}
							this.plugin.settings.aiProviderProfiles.push(profile);
							await this.plugin.saveSettings();
							this.renderProfileList(profileListContainer);
							// Refresh all settings to update dropdowns
							this.display();
							console.log(`Profile "${profile.name}" created`);
						});
						modal.open();
					});
			});
	}

	/**
	 * Render the list of AI provider profiles
	 */
	private renderProfileList(container: HTMLElement): void {
		container.empty();

		const profiles = this.plugin.settings.aiProviderProfiles || [];

		if (profiles.length === 0) {
			const emptyState = container.createDiv({ cls: "vc-profile-empty" });
			emptyState.createEl("p", { text: "No profiles configured yet." });
			emptyState.createEl("p", { 
				text: "Click \"Add Profile\" to create your first AI provider profile.",
				cls: "vc-status-desc"
			});
			return;
		}

		// Create a table for profiles
		const table = container.createEl("table", { cls: "vc-profiles-table" });
		
		// Header
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Name" });
		headerRow.createEl("th", { text: "Type" });
		headerRow.createEl("th", { text: "Details" });
		headerRow.createEl("th", { text: "Actions" });

		// Body
		const tbody = table.createEl("tbody");
		for (const profile of profiles) {
			const row = tbody.createEl("tr");
			
			// Name
			row.createEl("td", { text: profile.name, cls: "vc-profile-name" });
			
			// Type badge
			const typeCell = row.createEl("td");
			const typeBadge = typeCell.createEl("span", {
				text: getProfileTypeDisplayName(profile.type),
				cls: `vc-profile-type-badge vc-profile-type-${profile.type}`
			});

			// Details
			const detailsCell = row.createEl("td", { cls: "vc-profile-details" });
			if (profile.type === 'copilot') {
				detailsCell.createEl("span", { text: "Built-in GitHub Copilot CLI integration", cls: "vc-profile-detail" });
			} else if (profile.type === 'openai') {
				const openai = profile as OpenAIProviderProfile;
				if (openai.baseURL) {
					detailsCell.createEl("span", { text: openai.baseURL, cls: "vc-profile-detail" });
				} else {
					detailsCell.createEl("span", { text: "api.openai.com", cls: "vc-profile-detail" });
				}
			} else if (profile.type === 'azure-openai') {
				const azure = profile as AzureOpenAIProviderProfile;
				const deployment = azure.deploymentName || 'No deployment';
				detailsCell.createEl("span", { text: deployment, cls: "vc-profile-detail" });
			} else if (profile.type === 'local') {
				const local = profile as LocalProviderProfile;
				detailsCell.createEl("span", { text: local.serverUrl, cls: "vc-profile-detail" });
			}

			// Actions
			const actionsCell = row.createEl("td", { cls: "vc-profile-actions" });
			
			// Check if this is a readonly profile
			if (profile.readonly) {
				actionsCell.createEl("span", { text: "Built-in", cls: "vc-readonly-badge" });
			} else {
				// Edit button
				const editBtn = actionsCell.createEl("button", { text: "Edit", cls: "vc-btn-sm" });
				editBtn.addEventListener("click", () => {
					const modal = new AIProviderProfileModal(this.app, profile, async (updatedProfile) => {
						const index = this.plugin.settings.aiProviderProfiles!.findIndex(p => p.id === profile.id);
						if (index !== -1) {
							this.plugin.settings.aiProviderProfiles![index] = updatedProfile;
							await this.plugin.saveSettings();
							this.renderProfileList(container);
							// Refresh all settings to update dropdowns
							this.display();
							console.log(`Profile "${updatedProfile.name}" updated`);
						}
					});
					modal.open();
				});

				// Delete button
				const deleteBtn = actionsCell.createEl("button", { text: "Delete", cls: "vc-btn-sm vc-btn-danger" });
				deleteBtn.addEventListener("click", async () => {
					// Check if profile is in use
					const inUseBy: string[] = [];
					if (this.plugin.settings.voiceInputProfileId === profile.id) {
						inUseBy.push("Voice Input");
					}
					if (this.plugin.settings.realtimeAgentProfileId === profile.id) {
						inUseBy.push("Realtime Agent");
					}
					if (this.plugin.settings.chatProviderProfileId === profile.id) {
						inUseBy.push("Chat Preferences");
					}

					let confirmMessage = `Are you sure you want to delete the profile "${profile.name}"?`;
					if (inUseBy.length > 0) {
						confirmMessage += `\n\nThis profile is currently used by: ${inUseBy.join(", ")}. These will be reset to "None".`;
					}

					if (confirm(confirmMessage)) {
						// Remove profile
						const index = this.plugin.settings.aiProviderProfiles!.findIndex(p => p.id === profile.id);
						if (index !== -1) {
							this.plugin.settings.aiProviderProfiles!.splice(index, 1);
						}

						// Reset references if this profile was in use
						if (this.plugin.settings.voiceInputProfileId === profile.id) {
							this.plugin.settings.voiceInputProfileId = null;
						}
						if (this.plugin.settings.realtimeAgentProfileId === profile.id) {
							this.plugin.settings.realtimeAgentProfileId = null;
						}
						if (this.plugin.settings.chatProviderProfileId === profile.id) {
							this.plugin.settings.chatProviderProfileId = null;
						}

						await this.plugin.saveSettings();
						this.renderProfileList(container);
						
						// Re-render voice settings sections to update dropdowns
						this.display();
						
						console.log(`Profile "${profile.name}" deleted`);
					}
				});
			}
		}
	}

	private renderDateTimeSettings(container: HTMLElement): void {
		const section = container.createDiv({ cls: "vc-settings-section" });
		section.createEl("h3", { text: "Date & Time" });
		
		section.createEl("p", { 
			text: "Configure your preferred timezone and week start day. These settings are used throughout Vault Copilot for date calculations and AI context.",
			cls: "vc-status-desc"
		});

		// Common IANA timezones organized by region
		const timezones = [
			{ value: "", name: "System Default" },
			// Americas
			{ value: "America/New_York", name: "Eastern Time (US & Canada)" },
			{ value: "America/Chicago", name: "Central Time (US & Canada)" },
			{ value: "America/Denver", name: "Mountain Time (US & Canada)" },
			{ value: "America/Los_Angeles", name: "Pacific Time (US & Canada)" },
			{ value: "America/Anchorage", name: "Alaska" },
			{ value: "Pacific/Honolulu", name: "Hawaii" },
			{ value: "America/Toronto", name: "Eastern Time (Canada)" },
			{ value: "America/Vancouver", name: "Pacific Time (Canada)" },
			{ value: "America/Sao_Paulo", name: "Brasilia Time" },
			{ value: "America/Mexico_City", name: "Mexico City" },
			// Europe
			{ value: "Europe/London", name: "London (GMT/BST)" },
			{ value: "Europe/Paris", name: "Paris (CET)" },
			{ value: "Europe/Berlin", name: "Berlin (CET)" },
			{ value: "Europe/Madrid", name: "Madrid (CET)" },
			{ value: "Europe/Rome", name: "Rome (CET)" },
			{ value: "Europe/Amsterdam", name: "Amsterdam (CET)" },
			{ value: "Europe/Moscow", name: "Moscow" },
			// Asia/Pacific
			{ value: "Asia/Tokyo", name: "Tokyo (JST)" },
			{ value: "Asia/Hong_Kong", name: "Hong Kong (HKT)" },
			{ value: "Asia/Shanghai", name: "China Standard Time" },
			{ value: "Asia/Singapore", name: "Singapore (SGT)" },
			{ value: "Asia/Seoul", name: "Seoul (KST)" },
			{ value: "Asia/Kolkata", name: "India Standard Time" },
			{ value: "Asia/Dubai", name: "Dubai (GST)" },
			{ value: "Australia/Sydney", name: "Sydney (AEST)" },
			{ value: "Australia/Melbourne", name: "Melbourne (AEST)" },
			{ value: "Australia/Perth", name: "Perth (AWST)" },
			{ value: "Pacific/Auckland", name: "Auckland (NZST)" },
			// Universal
			{ value: "UTC", name: "Coordinated Universal Time (UTC)" },
		];

		// Timezone selection
		new Setting(section)
			.setName("Timezone")
			.setDesc("Your preferred timezone for date/time display. Used by voice agents and AI assistants.")
			.addDropdown((dropdown) => {
				for (const tz of timezones) {
					dropdown.addOption(tz.value, tz.name);
				}
				dropdown.setValue(this.plugin.settings.timezone || "");
				dropdown.onChange(async (value) => {
					this.plugin.settings.timezone = value;
					await this.plugin.saveSettings();
				});
			});

		// Week start day selection
		new Setting(section)
			.setName("Week Starts On")
			.setDesc("The first day of the week for calendar calculations (affects weekly notes and date context)")
			.addDropdown((dropdown) => {
				dropdown.addOption("sunday", "Sunday");
				dropdown.addOption("monday", "Monday");
				dropdown.addOption("saturday", "Saturday");
				dropdown.setValue(this.plugin.settings.weekStartDay || "sunday");
				dropdown.onChange(async (value) => {
					this.plugin.settings.weekStartDay = value as WeekStartDay;
					await this.plugin.saveSettings();
				});
			});

		// Preview of current date/time
		const previewContainer = section.createDiv({ cls: "vc-datetime-preview" });
		this.updateDateTimePreview(previewContainer);
	}

	private updateDateTimePreview(container: HTMLElement): void {
		container.empty();
		const now = new Date();
		const timezone = this.plugin.settings.timezone || undefined;
		const weekStartDay = this.plugin.settings.weekStartDay || "sunday";
		
		try {
			const options: Intl.DateTimeFormatOptions = {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				timeZoneName: 'short',
				...(timezone ? { timeZone: timezone } : {})
			};
			
			const formattedDate = now.toLocaleDateString('en-US', options);
			
			const previewText = container.createDiv({ cls: "vc-datetime-preview-text" });
			previewText.createEl("span", { text: "Current time in this timezone: ", cls: "vc-preview-label" });
			previewText.createEl("strong", { text: formattedDate });

			const weekInfo = container.createDiv({ cls: "vc-datetime-preview-week" });
			weekInfo.createEl("span", { text: `Week starts on: ${weekStartDay.charAt(0).toUpperCase() + weekStartDay.slice(1)}` });
		} catch (e) {
			container.createEl("span", { 
				text: "Invalid timezone selection", 
				cls: "vc-datetime-preview-error" 
			});
		}
	}

	/**
	 * Populate the model dropdown with available models
	 */
	private populateModelDropdown(dropdown: any): void {
		// Clear existing options
		dropdown.selectEl.empty();
		
		const models = getAvailableModels(this.plugin.settings);
		for (const modelId of models) {
			dropdown.addOption(modelId, getModelDisplayName(modelId));
		}
	}

	private renderPeriodicNotesSettings(container: HTMLElement): void {
		const section = container.createDiv({ cls: "vc-settings-section" });
		section.createEl("h3", { text: "Periodic Notes" });
		
		section.createEl("p", { 
			text: "Configure periodic notes (daily, weekly, monthly, quarterly, yearly) with custom folders, date formats, and templates. These settings are used by the Note Manager voice agent.",
			cls: "vc-status-desc"
		});

		// Ensure periodic notes settings exist
		if (!this.plugin.settings.periodicNotes) {
			this.plugin.settings.periodicNotes = { ...DEFAULT_PERIODIC_NOTES };
		}

		const noteTypes: Array<{ key: keyof PeriodicNotesSettings; label: string; defaultFormat: string; formatHelp: string; icon: string }> = [
			{ 
				key: 'daily', 
				label: 'Daily Notes', 
				defaultFormat: 'YYYY-MM-DD',
				formatHelp: 'Common formats: YYYY-MM-DD, DD-MM-YYYY, MMMM D, YYYY',
				icon: periodicNoteIcons.daily
			},
			{ 
				key: 'weekly', 
				label: 'Weekly Notes', 
				defaultFormat: 'gggg-[W]ww',
				formatHelp: 'Common formats: gggg-[W]ww (2026-W05), YYYY-[Week]-ww',
				icon: periodicNoteIcons.weekly
			},
			{ 
				key: 'monthly', 
				label: 'Monthly Notes', 
				defaultFormat: 'YYYY-MM',
				formatHelp: 'Common formats: YYYY-MM, MMMM YYYY, MM-YYYY',
				icon: periodicNoteIcons.monthly
			},
			{ 
				key: 'quarterly', 
				label: 'Quarterly Notes', 
				defaultFormat: 'YYYY-[Q]Q',
				formatHelp: 'Common formats: YYYY-[Q]Q (2026-Q1), [Q]Q-YYYY',
				icon: periodicNoteIcons.quarterly
			},
			{ 
				key: 'yearly', 
				label: 'Yearly Notes', 
				defaultFormat: 'YYYY',
				formatHelp: 'Common formats: YYYY, [Year] YYYY',
				icon: periodicNoteIcons.yearly
			},
		];

		for (const noteType of noteTypes) {
			const config = this.plugin.settings.periodicNotes[noteType.key];
			
			// Create collapsible section for each note type
			const noteSection = section.createEl("details", { cls: "vc-periodic-note-section" });
			const summary = noteSection.createEl("summary", { cls: "vc-periodic-note-header" });
			
			// Header with icon and toggle
			const headerRow = summary.createDiv({ cls: "vc-periodic-header-row" });
			
			// Add icon
			const iconEl = headerRow.createSpan({ cls: "vc-periodic-icon" });
			iconEl.innerHTML = wrapIcon(noteType.icon, 20);
			
			headerRow.createEl("span", { text: noteType.label, cls: "vc-periodic-label" });
			
			const statusBadge = headerRow.createEl("span", { 
				text: config.enabled ? "Enabled" : "Disabled",
				cls: `vc-periodic-badge ${config.enabled ? "vc-badge-ok" : "vc-badge-disabled"}`
			});

			const content = noteSection.createDiv({ cls: "vc-periodic-content" });

			// Enable toggle
			new Setting(content)
				.setName("Enabled")
				.setDesc(`Enable ${noteType.label.toLowerCase()} support`)
				.addToggle((toggle) => {
					toggle.setValue(config.enabled);
					toggle.onChange(async (value) => {
						this.plugin.settings.periodicNotes[noteType.key].enabled = value;
						statusBadge.setText(value ? "Enabled" : "Disabled");
						statusBadge.removeClass("vc-badge-ok", "vc-badge-disabled");
						statusBadge.addClass(value ? "vc-badge-ok" : "vc-badge-disabled");
						await this.plugin.saveSettings();
					});
				});

			// Folder setting
			new Setting(content)
				.setName("Folder")
				.setDesc("Folder where notes are stored (relative to vault root)")
				.addText((text) => {
					text.setPlaceholder(DEFAULT_PERIODIC_NOTES[noteType.key].folder);
					text.setValue(config.folder);
					text.onChange(async (value) => {
						this.plugin.settings.periodicNotes[noteType.key].folder = value || DEFAULT_PERIODIC_NOTES[noteType.key].folder;
						await this.plugin.saveSettings();
					});
				});

			// Format setting
			new Setting(content)
				.setName("Date Format")
				.setDesc(noteType.formatHelp)
				.addText((text) => {
					text.setPlaceholder(noteType.defaultFormat);
					text.setValue(config.format);
					text.onChange(async (value) => {
						this.plugin.settings.periodicNotes[noteType.key].format = value || noteType.defaultFormat;
						await this.plugin.saveSettings();
					});
				});

			// Template setting
			new Setting(content)
				.setName("Template")
				.setDesc("Path to template file (optional)")
				.addText((text) => {
					text.setPlaceholder("Templates/periodic-template.md");
					text.setValue(config.templatePath || "");
					text.onChange(async (value) => {
						this.plugin.settings.periodicNotes[noteType.key].templatePath = value || undefined;
						await this.plugin.saveSettings();
					});
				});
		}

		// Help text about moment.js formats
		const helpEl = section.createDiv({ cls: "vc-periodic-help" });
		helpEl.innerHTML = `
			<details>
				<summary>Date Format Reference (moment.js)</summary>
				<table class="vc-format-table">
					<tr><td><code>YYYY</code></td><td>4-digit year (2026)</td></tr>
					<tr><td><code>YY</code></td><td>2-digit year (26)</td></tr>
					<tr><td><code>MM</code></td><td>Month as 2 digits (01-12)</td></tr>
					<tr><td><code>M</code></td><td>Month as number (1-12)</td></tr>
					<tr><td><code>MMMM</code></td><td>Month name (January)</td></tr>
					<tr><td><code>MMM</code></td><td>Short month (Jan)</td></tr>
					<tr><td><code>DD</code></td><td>Day as 2 digits (01-31)</td></tr>
					<tr><td><code>D</code></td><td>Day as number (1-31)</td></tr>
					<tr><td><code>ww</code></td><td>Week of year (01-53)</td></tr>
					<tr><td><code>gggg</code></td><td>ISO week year</td></tr>
					<tr><td><code>Q</code></td><td>Quarter (1-4)</td></tr>
					<tr><td><code>[text]</code></td><td>Literal text (escaped)</td></tr>
				</table>
			</details>
		`;
	}

	/**
	 * Whisper.cpp manager instance for the settings tab
	 */
	private whisperCppManager: WhisperCppManager | null = null;
	private whisperCppStatusContainer: HTMLElement | null = null;

	/**
	 * Get or create WhisperCppManager instance
	 */
	private getWhisperCppManager(): WhisperCppManager {
		if (!this.whisperCppManager) {
			const adapter = this.app.vault.adapter;
			if (adapter instanceof FileSystemAdapter) {
				const basePath = adapter.getBasePath();
				this.whisperCppManager = new WhisperCppManager(basePath);
			} else {
				throw new Error("WhisperCppManager requires FileSystemAdapter");
			}
		}
		return this.whisperCppManager;
	}

	/**
	 * Render Whisper.cpp management section
	 */
	private renderWhisperCppSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: "vc-settings-section vc-whisper-section" });
		section.createEl("h3", { text: "Whisper.cpp Local Server" });
		
		section.createEl("p", { 
			text: "Download and run whisper.cpp locally for offline speech-to-text. No API keys or cloud services required.",
			cls: "vc-status-desc"
		});

		// Status container that will be updated
		this.whisperCppStatusContainer = section.createDiv({ cls: "vc-whisper-status-container" });
		this.refreshWhisperCppStatus();
	}

	/**
	 * Refresh the whisper.cpp status display
	 */
	private async refreshWhisperCppStatus(): Promise<void> {
		if (!this.whisperCppStatusContainer) return;
		this.whisperCppStatusContainer.empty();

		const container = this.whisperCppStatusContainer;
		
		try {
			const manager = this.getWhisperCppManager();
			const installStatus = await manager.checkInstallation();
			const serverStatus = await manager.getServerStatus();
			const downloadedModels = await manager.listDownloadedModels();

			// Installation status
			const statusRow = container.createDiv({ cls: "vc-whisper-status-row" });
			const statusIcon = statusRow.createSpan({ cls: "vc-whisper-status-icon" });
			const statusText = statusRow.createSpan({ cls: "vc-whisper-status-text" });

			if (installStatus.installed) {
				statusIcon.addClass("vc-whisper-status-ok");
				statusIcon.setText("✓");
				statusText.setText(`Whisper.cpp installed${installStatus.version ? ` (${installStatus.version})` : ''}`);
			} else {
				statusIcon.addClass("vc-whisper-status-missing");
				statusIcon.setText("✗");
				statusText.setText("Whisper.cpp not installed");
			}

			// Server status
			const serverRow = container.createDiv({ cls: "vc-whisper-status-row" });
			const serverIcon = serverRow.createSpan({ cls: "vc-whisper-status-icon" });
			const serverText = serverRow.createSpan({ cls: "vc-whisper-status-text" });

			if (serverStatus.running) {
				serverIcon.addClass("vc-whisper-status-ok");
				serverIcon.setText("●");
				serverText.setText(`Server running on port ${serverStatus.port || 8080}`);
			} else {
				serverIcon.addClass("vc-whisper-status-stopped");
				serverIcon.setText("○");
				serverText.setText("Server not running");
			}

			// Download whisper.cpp section
			if (!installStatus.installed) {
				this.renderWhisperDownloadSection(container, manager);
			} else {
				// Models section
				this.renderWhisperModelsSection(container, manager, downloadedModels);
				
				// Server controls
				this.renderWhisperServerControls(container, manager, serverStatus, downloadedModels);

				// Uninstall section
				this.renderWhisperUninstallSection(container, manager);
			}
		} catch (error) {
			container.createEl("p", { 
				text: `Error: ${error instanceof Error ? error.message : String(error)}`,
				cls: "vc-whisper-error"
			});
		}
	}

	/**
	 * Render download whisper.cpp section
	 */
	private renderWhisperDownloadSection(container: HTMLElement, manager: WhisperCppManager): void {
		const downloadSection = container.createDiv({ cls: "vc-whisper-download-section" });
		
		// Check platform support first
		const platformCheck = manager.isPlatformSupported();
		if (!platformCheck.supported) {
			downloadSection.createEl("p", { 
				text: "⚠️ Platform Not Supported",
				cls: "vc-whisper-warning-title"
			});
			downloadSection.createEl("p", { 
				text: platformCheck.reason || "Your platform is not supported for pre-built binaries.",
				cls: "vc-whisper-warning"
			});
			downloadSection.createEl("p", { 
				text: "Alternative: Use the OpenAI Whisper API or Azure Speech services instead. Create an AI Provider Profile in the section above.",
				cls: "vc-whisper-info"
			});
			return;
		}

		downloadSection.createEl("p", { 
			text: "Download whisper.cpp server binaries from GitHub. This will download the latest release for your platform.",
			cls: "vc-whisper-info"
		});

		const progressContainer = downloadSection.createDiv({ cls: "vc-whisper-progress-container" });
		progressContainer.style.display = "none";
		const progressBar = progressContainer.createDiv({ cls: "vc-whisper-progress-bar" });
		const progressFill = progressBar.createDiv({ cls: "vc-whisper-progress-fill" });
		const progressText = progressContainer.createDiv({ cls: "vc-whisper-progress-text" });

		new Setting(downloadSection)
			.setName("Download Whisper.cpp")
			.setDesc("Download whisper.cpp server binaries (~25 MB)")
			.addButton((button) => {
				button
					.setButtonText("Download")
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText("Downloading...");
						progressContainer.style.display = "block";

						try {
							const result = await manager.downloadWhisperCpp((downloaded, total, percentage) => {
								progressFill.style.width = `${percentage}%`;
								const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
								const totalMB = (total / 1024 / 1024).toFixed(1);
								progressText.setText(`${downloadedMB} MB / ${totalMB} MB (${percentage.toFixed(0)}%)`);
							});

							if (result.success) {
								console.log("Whisper.cpp downloaded successfully!");
								await this.refreshWhisperCppStatus();
							} else {
								console.error(`Download failed: ${result.error}`);
								button.setDisabled(false);
								button.setButtonText("Download");
								progressContainer.style.display = "none";
							}
						} catch (error) {
							console.error(`Download error: ${error instanceof Error ? error.message : String(error)}`);
							button.setDisabled(false);
							button.setButtonText("Download");
							progressContainer.style.display = "none";
						}
					});
			});
	}

	/**
	 * Render models section
	 */
	private renderWhisperModelsSection(container: HTMLElement, manager: WhisperCppManager, downloadedModels: string[]): void {
		const modelsSection = container.createDiv({ cls: "vc-whisper-models-section" });
		modelsSection.createEl("h4", { text: "Models" });

		// Downloaded models list
		if (downloadedModels.length > 0) {
			const downloadedList = modelsSection.createDiv({ cls: "vc-whisper-downloaded-models" });
			downloadedList.createEl("p", { text: "Downloaded models:", cls: "vc-whisper-models-label" });
			
			for (const modelFile of downloadedModels) {
				const modelRow = downloadedList.createDiv({ cls: "vc-whisper-model-row" });
				modelRow.createSpan({ text: modelFile, cls: "vc-whisper-model-name" });
				
				const deleteBtn = modelRow.createEl("button", { cls: "vc-whisper-model-delete" });
				deleteBtn.setText("Delete");
				deleteBtn.addEventListener("click", async () => {
					if (confirm(`Delete model ${modelFile}?`)) {
						try {
							await manager.deleteModel(modelFile);
							console.log(`Deleted ${modelFile}`);
							await this.refreshWhisperCppStatus();
						} catch (error) {
							console.error(`Failed to delete: ${error instanceof Error ? error.message : String(error)}`);
						}
					}
				});
			}
		}

		// Available models to download
		const availableSection = modelsSection.createDiv({ cls: "vc-whisper-available-models" });
		availableSection.createEl("p", { text: "Download a model:", cls: "vc-whisper-models-label" });

		const modelSelect = availableSection.createEl("select", { cls: "vc-whisper-model-select" });
		for (const model of WHISPER_MODELS) {
			const isDownloaded = downloadedModels.includes(model.filename);
			const option = modelSelect.createEl("option");
			option.value = model.id;
			option.text = `${model.name}${isDownloaded ? ' (downloaded)' : ''}`;
			if (isDownloaded) {
				option.disabled = true;
			}
		}

		// Progress container for model download
		const modelProgressContainer = availableSection.createDiv({ cls: "vc-whisper-progress-container" });
		modelProgressContainer.style.display = "none";
		const modelProgressBar = modelProgressContainer.createDiv({ cls: "vc-whisper-progress-bar" });
		const modelProgressFill = modelProgressBar.createDiv({ cls: "vc-whisper-progress-fill" });
		const modelProgressText = modelProgressContainer.createDiv({ cls: "vc-whisper-progress-text" });

		const downloadModelBtn = availableSection.createEl("button", { cls: "vc-whisper-download-model-btn" });
		downloadModelBtn.setText("Download Model");
		downloadModelBtn.addEventListener("click", async () => {
			const selectedModelId = modelSelect.value;
			const selectedModel = WHISPER_MODELS.find(m => m.id === selectedModelId);
			if (!selectedModel) return;

			downloadModelBtn.disabled = true;
			downloadModelBtn.setText("Downloading...");
			modelProgressContainer.style.display = "block";

			try {
				const result = await manager.downloadModel(selectedModelId, (downloaded, total, percentage) => {
					modelProgressFill.style.width = `${percentage}%`;
					const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
					const totalMB = (total / 1024 / 1024).toFixed(1);
					modelProgressText.setText(`${downloadedMB} MB / ${totalMB} MB (${percentage.toFixed(0)}%)`);
				});

				if (result.success) {
					console.log(`Model ${selectedModel.name} downloaded successfully!`);
					await this.refreshWhisperCppStatus();
				} else {
					console.error(`Download failed: ${result.error}`);
					downloadModelBtn.disabled = false;
					downloadModelBtn.setText("Download Model");
					modelProgressContainer.style.display = "none";
				}
			} catch (error) {
				console.error(`Download error: ${error instanceof Error ? error.message : String(error)}`);
				downloadModelBtn.disabled = false;
				downloadModelBtn.setText("Download Model");
				modelProgressContainer.style.display = "none";
			}
		});
	}

	/**
	 * Render server controls section
	 */
	private renderWhisperServerControls(container: HTMLElement, manager: WhisperCppManager, serverStatus: WhisperServerStatus, downloadedModels: string[]): void {
		const serverSection = container.createDiv({ cls: "vc-whisper-server-section" });
		serverSection.createEl("h4", { text: "Server Controls" });

		if (downloadedModels.length === 0) {
			serverSection.createEl("p", { 
				text: "Download a model first to start the server.",
				cls: "vc-whisper-info"
			});
			return;
		}

		// Model selection for server
		const modelSelectSetting = new Setting(serverSection)
			.setName("Model")
			.setDesc("Select which model to use for the server");

		let selectedServerModel = downloadedModels[0] || '';
		modelSelectSetting.addDropdown((dropdown) => {
			for (const modelFile of downloadedModels) {
				const modelInfo = WHISPER_MODELS.find(m => m.filename === modelFile);
				const displayName = modelInfo ? modelInfo.name : modelFile;
				dropdown.addOption(modelFile, displayName);
			}
			if (selectedServerModel) {
				dropdown.setValue(selectedServerModel);
			}
			dropdown.onChange((value) => {
				selectedServerModel = value;
			});
		});

		// Server action buttons
		const buttonContainer = serverSection.createDiv({ cls: "vc-whisper-button-container" });

		if (serverStatus.running) {
			const stopBtn = buttonContainer.createEl("button", { cls: "mod-warning" });
			stopBtn.setText("Stop Server");
			stopBtn.addEventListener("click", async () => {
				try {
					const result = manager.stopServer();
					if (result.success) {
						console.log("Whisper.cpp server stopped");
						await this.refreshWhisperCppStatus();
					} else {
						console.error(`Failed to stop server: ${result.error}`);
					}
				} catch (error) {
					console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
				}
			});
		} else {
			const startBtn = buttonContainer.createEl("button", { cls: "mod-cta" });
			startBtn.setText("Start Server");
			startBtn.addEventListener("click", async () => {
				try {
					if (!selectedServerModel) {
						console.log("Please select a model first");
						return;
					}
					// Extract model ID from filename (e.g., "ggml-tiny.bin" -> "tiny")
					const modelId = selectedServerModel.replace('ggml-', '').replace('.bin', '');
					
					startBtn.disabled = true;
					startBtn.setText("Starting...");

					const result = await manager.startServer(modelId);
					if (result.success) {
						console.log("Whisper.cpp server started!");
						// Update voice settings to use local-whisper
						if (this.plugin.settings.voice) {
							this.plugin.settings.voice.backend = 'local-whisper';
							this.plugin.settings.voice.whisperServerUrl = 'http://127.0.0.1:8080';
							await this.plugin.saveSettings();
						}
						await this.refreshWhisperCppStatus();
					} else {
						console.error(`Failed to start server: ${result.error}`);
						startBtn.disabled = false;
						startBtn.setText("Start Server");
					}
				} catch (error) {
					console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
					startBtn.disabled = false;
					startBtn.setText("Start Server");
				}
			});
		}

		// Show endpoint info when running
		if (serverStatus.running) {
			const endpointInfo = serverSection.createDiv({ cls: "vc-whisper-endpoint-info" });
			endpointInfo.createEl("code", { text: `Endpoint: http://127.0.0.1:${serverStatus.port || 8080}/inference` });
		}
	}

	/**
	 * Render uninstall section
	 */
	private renderWhisperUninstallSection(container: HTMLElement, manager: WhisperCppManager): void {
		const uninstallSection = container.createDiv({ cls: "vc-whisper-uninstall-section" });
		uninstallSection.createEl("h4", { text: "Uninstall" });

		new Setting(uninstallSection)
			.setName("Remove Whisper.cpp")
			.setDesc("Remove all whisper.cpp binaries and downloaded models")
			.addButton((button) => {
				button
					.setButtonText("Uninstall")
					.setWarning()
					.onClick(async () => {
						if (confirm("Are you sure you want to uninstall whisper.cpp? This will remove all binaries and downloaded models.")) {
							button.setDisabled(true);
							button.setButtonText("Uninstalling...");

							try {
								const result = await manager.uninstall();
								if (result.success) {
									console.log("Whisper.cpp uninstalled successfully");
									await this.refreshWhisperCppStatus();
								} else {
									console.error(`Uninstall failed: ${result.error}`);
									button.setDisabled(false);
									button.setButtonText("Uninstall");
								}
							} catch (error) {
								console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
								button.setDisabled(false);
								button.setButtonText("Uninstall");
							}
						}
					});
			});
	}

	private renderVoiceSettings(container: HTMLElement): void {
		// Ensure voice settings exist
		if (!this.plugin.settings.voice) {
			this.plugin.settings.voice = {
				voiceInputEnabled: false,
				backend: 'openai-whisper',
				whisperServerUrl: 'http://127.0.0.1:8080',
				language: 'auto',
				audioDeviceId: undefined,
				autoSynthesize: 'off',
				speechTimeout: 0,
			};
		}

		// Voice Input Section
		const voiceSection = container.createDiv({ cls: "vc-settings-section" });
		voiceSection.createEl("h3", { text: "Voice Input" });
		
		voiceSection.createEl("p", { 
			text: "Configure voice-to-text for hands-free chat input.",
			cls: "vc-status-desc"
		});

		// Container for voice input conditional settings
		const voiceInputConditionalContainer = voiceSection.createDiv({ cls: "vc-voice-input-conditional" });

		// Enable Voice Input toggle
		new Setting(voiceSection)
			.setName("Enable Voice Input")
			.setDesc("Show the microphone button in the chat view for voice-to-text input")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.voice!.voiceInputEnabled || false);
				toggle.onChange(async (value) => {
					this.plugin.settings.voice!.voiceInputEnabled = value;
					await this.plugin.saveSettings();
					this.renderVoiceInputConditionalSettings(voiceInputConditionalContainer);
				});
			});

		voiceSection.appendChild(voiceInputConditionalContainer);
		this.renderVoiceInputConditionalSettings(voiceInputConditionalContainer);

		// Realtime Voice Agent Section (separate)
		this.renderRealtimeAgentSection(container);
	}

	/**
	 * Render Realtime Voice Agent as a separate section
	 */
	private renderRealtimeAgentSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: "vc-settings-section" });
		section.createEl("h3", { text: "Realtime Voice Agent (Experimental)" });
		
		section.createEl("p", { 
			text: "Enable two-way voice conversations with an AI agent that can access your notes.",
			cls: "vc-status-desc"
		});

		// Container for realtime agent conditional settings
		const realtimeConditionalContainer = section.createDiv({ cls: "vc-realtime-conditional" });

		new Setting(section)
			.setName("Enable Realtime Agent")
			.setDesc("Show the agent button next to the microphone for two-way voice conversations")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.voice!.realtimeAgentEnabled || false);
				toggle.onChange(async (value) => {
					this.plugin.settings.voice!.realtimeAgentEnabled = value;
					await this.plugin.saveSettings();
					this.renderRealtimeConditionalSettings(realtimeConditionalContainer);
				});
			});

		section.appendChild(realtimeConditionalContainer);
		this.renderRealtimeConditionalSettings(realtimeConditionalContainer);
	}

	/**
	 * Render voice input settings that are conditional on voice input being enabled
	 */
	private renderVoiceInputConditionalSettings(container: HTMLElement): void {
		container.empty();

		if (!this.plugin.settings.voice?.voiceInputEnabled) {
			return;
		}

		// 1. AI Provider Profile selection
		const profiles = this.plugin.settings.aiProviderProfiles || [];
		// Filter out copilot profile - voice can only use OpenAI, Azure OpenAI, or Local
		const voiceProfiles = profiles.filter(p => p.type !== 'copilot');
		const selectedProfileId = this.plugin.settings.voiceInputProfileId;
		const selectedProfile = getProfileById(this.plugin.settings, selectedProfileId);

		new Setting(container)
			.setName("AI Provider Profile")
			.setDesc("Select the AI provider profile to use for speech-to-text (OpenAI, Azure OpenAI, or Local Whisper)")
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'None');
				for (const profile of voiceProfiles) {
					dropdown.addOption(profile.id, `${profile.name} (${getProfileTypeDisplayName(profile.type)})`);
				}
				dropdown.setValue(selectedProfileId || '');
				dropdown.onChange(async (value) => {
					this.plugin.settings.voiceInputProfileId = value || null;
					// Update the legacy backend field based on profile type
					const profile = getProfileById(this.plugin.settings, value);
					if (profile) {
						this.plugin.settings.voice!.backend = profileTypeToBackend(profile.type);
					}
					await this.plugin.saveSettings();
					// Re-render to show model dropdown and update UI
					this.renderVoiceInputConditionalSettings(container);
				});
			});

		// Show warning if no profile selected
		if (!selectedProfile) {
			const warningEl = container.createDiv({ cls: "vc-profile-warning" });
			warningEl.innerHTML = `
				<span class="vc-status-warning">⚠</span>
				<span>No AI provider profile selected. <a href="#" class="vc-profile-link">Add a profile</a> in the AI Provider Profiles section above.</span>
			`;
			const link = warningEl.querySelector('.vc-profile-link');
			if (link) {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					// Scroll to profiles section
					const profilesSection = container.closest('.vc-main-settings')?.querySelector('.vc-profile-list');
					profilesSection?.scrollIntoView({ behavior: 'smooth' });
				});
			}
		}

		// 2. Audio Model selection (only if profile selected)
		if (selectedProfile) {
			const modelSetting = new Setting(container)
				.setName("Audio Model")
				.setDesc("Select the audio model for speech-to-text transcription");

			let modelDropdown: any = null;
			
			modelSetting.addDropdown((dropdown) => {
				modelDropdown = dropdown;
				const currentModel = this.plugin.settings.voice!.audioModel;
				
				dropdown.addOption('', 'Default');
				// Pre-populate with standard audio models
				dropdown.addOption('whisper-1', 'whisper-1');
				if (currentModel && currentModel !== 'whisper-1') {
					dropdown.addOption(currentModel, currentModel);
				}
				dropdown.setValue(currentModel || '');
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.audioModel = value || undefined;
					await this.plugin.saveSettings();
				});
			});

			modelSetting.addButton((button) => {
				button
					.setButtonText("↻")
					.setTooltip("Refresh models")
					.onClick(async () => {
						button.setDisabled(true);
						console.log("Loading audio models...");
						
						try {
							let models: string[] = [];
							
							if (selectedProfile.type === 'openai') {
								const OpenAIServiceModule = await import('../../copilot/providers/OpenAIService');
								const apiKey = getOpenAIProfileApiKey(this.app, selectedProfile as OpenAIProviderProfile);
								const service = new OpenAIServiceModule.OpenAIService(this.app, {
									provider: 'openai',
									model: 'gpt-4o',
									streaming: false,
									apiKey,
									baseURL: (selectedProfile as any).baseURL,
								});
								
								await service.initialize();
								models = await service.listAudioModels();
							} else if (selectedProfile.type === 'azure-openai') {
								const AzureOpenAIServiceModule = await import('../../copilot/providers/AzureOpenAIService');
								const apiKey = getAzureProfileApiKey(this.app, selectedProfile as AzureOpenAIProviderProfile);
								const service = new AzureOpenAIServiceModule.AzureOpenAIService(this.app, {
									provider: 'azure-openai',
									model: 'gpt-4o',
									streaming: false,
									apiKey: apiKey || '',
									endpoint: (selectedProfile as any).endpoint,
									deploymentName: (selectedProfile as any).deploymentName,
									apiVersion: (selectedProfile as any).apiVersion,
								});
								
								await service.initialize();
								models = await service.listAudioModels();
							}
							
							if (models.length > 0) {
								if (modelDropdown) {
									modelDropdown.selectEl.empty();
									modelDropdown.addOption('', 'Default');
									for (const model of models) {
										modelDropdown.addOption(model, model);
									}
									const currentModel = this.plugin.settings.voice!.audioModel;
									modelDropdown.setValue(currentModel || '');
								}
								console.log(`Loaded ${models.length} audio models`);
							} else {
								console.log("No audio models found");
							}
						} catch (error) {
							console.error("Failed to load audio models:", error);
							const message = error instanceof Error ? error.message : String(error);
							console.error(`Failed to load models: ${message}`);
						} finally {
							button.setDisabled(false);
						}
					});
			});
		}

		// 3. Audio device selection (Microphone)
		const audioDeviceSetting = new Setting(container)
			.setName("Microphone")
			.setDesc("Select the audio input device");
		
		this.populateAudioDevices(audioDeviceSetting);

		// 4. Voice language (common to all backends)
		new Setting(container)
			.setName("Speech Language")
			.setDesc("The language that text-to-speech and speech-to-text should use. Select 'auto' to use the configured display language if possible. Note that not all display languages may be supported by speech recognition and synthesizers.")
			.addDropdown((dropdown) => {
				const languages = [
					{ value: 'auto', name: 'Auto (Use Display Language)' },
					{ value: 'en-US', name: 'English (US)' },
					{ value: 'en-GB', name: 'English (UK)' },
					{ value: 'es-ES', name: 'Spanish' },
					{ value: 'fr-FR', name: 'French' },
					{ value: 'de-DE', name: 'German' },
					{ value: 'it-IT', name: 'Italian' },
					{ value: 'pt-BR', name: 'Portuguese (Brazil)' },
					{ value: 'ja-JP', name: 'Japanese' },
					{ value: 'zh-CN', name: 'Chinese (Simplified)' },
					{ value: 'ko-KR', name: 'Korean' },
				];
				for (const lang of languages) {
					dropdown.addOption(lang.value, lang.name);
				}
				dropdown.setValue(this.plugin.settings.voice!.language);
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.language = value;
					await this.plugin.saveSettings();
				});
			});

		// 5. Auto Synthesize - read responses aloud
		new Setting(container)
			.setName("Auto Synthesize")
			.setDesc("Whether a textual response should automatically be read out aloud when speech was used as input. For example in a chat session, a response is automatically synthesized when voice was used as chat request.")
			.addDropdown((dropdown) => {
				dropdown.addOption('off', 'off');
				dropdown.addOption('on', 'on');
				dropdown.setValue(this.plugin.settings.voice!.autoSynthesize || 'off');
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.autoSynthesize = value as 'off' | 'on';
					await this.plugin.saveSettings();
				});
			});

		// 6. Speech Timeout
		new Setting(container)
			.setName("Speech Timeout")
			.setDesc("The duration in milliseconds that voice speech recognition remains active after you stop speaking. For example in a chat session, the transcribed text is submitted automatically after the timeout is met. Set to 0 to disable this feature.")
			.addText((text) => {
				text.setPlaceholder('0');
				text.setValue(String(this.plugin.settings.voice!.speechTimeout || 0));
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.onChange(async (value) => {
					const timeout = parseInt(value, 10) || 0;
					this.plugin.settings.voice!.speechTimeout = timeout;
					await this.plugin.saveSettings();
				});
			});
	}

	private async populateAudioDevices(setting: Setting): Promise<void> {
		setting.addDropdown(async (dropdown) => {
			dropdown.addOption('default', 'System Default');
			
			try {
				// Request microphone permission first (required to enumerate devices)
				await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
					stream.getTracks().forEach(track => track.stop());
				});
				
				const devices = await navigator.mediaDevices.enumerateDevices();
				const audioInputs = devices.filter(d => d.kind === 'audioinput');
				
				for (const device of audioInputs) {
					const label = device.label || `Microphone ${audioInputs.indexOf(device) + 1}`;
					dropdown.addOption(device.deviceId, label);
				}
			} catch (error) {
				console.log('Could not enumerate audio devices:', error);
			}
			
			dropdown.setValue(this.plugin.settings.voice?.audioDeviceId || 'default');
			dropdown.onChange(async (value) => {
				if (this.plugin.settings.voice) {
					this.plugin.settings.voice.audioDeviceId = value === 'default' ? undefined : value;
					await this.plugin.saveSettings();
				}
			});
		});
	}

	private renderRealtimeConditionalSettings(container: HTMLElement): void {
		container.empty();
		
		if (!this.plugin.settings.voice?.realtimeAgentEnabled) {
			return;
		}

		const realtimeSection = container.createDiv({ cls: "vc-realtime-settings" });

		// 1. AI Provider Profile selection (OpenAI profiles only)
		const openaiProfiles = getOpenAIProfiles(this.plugin.settings);
		const selectedProfileId = this.plugin.settings.realtimeAgentProfileId;
		const selectedProfile = getProfileById(this.plugin.settings, selectedProfileId);

		new Setting(realtimeSection)
			.setName("AI Provider Profile")
			.setDesc("Select the OpenAI profile to use for the Realtime Agent (Azure not supported)")
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'None');
				for (const profile of openaiProfiles) {
					dropdown.addOption(profile.id, `${profile.name}`);
				}
				dropdown.setValue(selectedProfileId || '');
				dropdown.onChange(async (value) => {
					this.plugin.settings.realtimeAgentProfileId = value || null;
					await this.plugin.saveSettings();
					// Re-render to show model dropdown and update UI
					this.renderRealtimeConditionalSettings(container);
				});
			});

		// Show warning if no profile selected
		if (!selectedProfile) {
			const warningEl = realtimeSection.createDiv({ cls: "vc-profile-warning" });
			if (openaiProfiles.length === 0) {
				warningEl.innerHTML = `
					<span class="vc-status-warning">⚠</span>
					<span>No OpenAI profiles available. <a href="#" class="vc-profile-link">Add an OpenAI profile</a> in the AI Provider Profiles section above.</span>
				`;
			} else {
				warningEl.innerHTML = `
					<span class="vc-status-warning">⚠</span>
					<span>No profile selected. Select an OpenAI profile to enable the Realtime Agent.</span>
				`;
			}
			const link = warningEl.querySelector('.vc-profile-link');
			if (link) {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					const profilesSection = container.closest('.vc-main-settings')?.querySelector('.vc-profile-list');
					profilesSection?.scrollIntoView({ behavior: 'smooth' });
				});
			}
		}

		// 2. Realtime Model selection (only if profile selected)
		if (selectedProfile) {
			const modelSetting = new Setting(realtimeSection)
				.setName("Realtime Model")
				.setDesc("Select the realtime model for voice conversations");

			let modelDropdown: any = null;
			
			modelSetting.addDropdown((dropdown) => {
				modelDropdown = dropdown;
				const currentModel = this.plugin.settings.realtimeAgentModel;
				
				dropdown.addOption('', 'Default');
				// Pre-populate with standard realtime models
				dropdown.addOption('gpt-4o-realtime-preview', 'gpt-4o-realtime-preview');
				dropdown.addOption('gpt-4o-mini-realtime-preview', 'gpt-4o-mini-realtime-preview');
				if (currentModel && currentModel !== 'gpt-4o-realtime-preview' && currentModel !== 'gpt-4o-mini-realtime-preview') {
					dropdown.addOption(currentModel, currentModel);
				}
				dropdown.setValue(currentModel || '');
				dropdown.onChange(async (value) => {
					this.plugin.settings.realtimeAgentModel = value || undefined;
					await this.plugin.saveSettings();
				});
			});

			modelSetting.addButton((button) => {
				button
					.setButtonText("↻")
					.setTooltip("Refresh models")
					.onClick(async () => {
						button.setDisabled(true);
						console.log("Loading realtime models...");
						
						try {
							let models: string[] = [];
							
							// Only OpenAI is supported for realtime models
							if (selectedProfile.type === 'openai') {
								const OpenAIServiceModule = await import('../../copilot/providers/OpenAIService');
								const apiKey = getOpenAIProfileApiKey(this.app, selectedProfile as OpenAIProviderProfile);
								const service = new OpenAIServiceModule.OpenAIService(this.app, {
									provider: 'openai',
									model: 'gpt-4o',
									streaming: false,
									apiKey,
									baseURL: (selectedProfile as any).baseURL,
								});
								
								await service.initialize();
								models = await service.listRealtimeModels();
							}
							
							if (models.length > 0) {
								if (modelDropdown) {
									modelDropdown.selectEl.empty();
									modelDropdown.addOption('', 'Default');
									for (const model of models) {
										modelDropdown.addOption(model, model);
									}
									const currentModel = this.plugin.settings.realtimeAgentModel;
									modelDropdown.setValue(currentModel || '');
								}
								console.log(`Loaded ${models.length} realtime models`);
							} else {
								console.log("No realtime models found");
							}
						} catch (error) {
							console.error("Failed to load realtime models:", error);
							const message = error instanceof Error ? error.message : String(error);
							console.error(`Failed to load models: ${message}`);
						} finally {
							button.setDisabled(false);
						}
					});
			});
		}

		// 3. Voice selection
		new Setting(realtimeSection)
			.setName("Voice")
			.setDesc("Select the voice for the realtime agent")
			.addDropdown((dropdown) => {
				const voices = [
					{ value: 'alloy', name: 'Alloy' },
					{ value: 'ash', name: 'Ash' },
					{ value: 'ballad', name: 'Ballad' },
					{ value: 'coral', name: 'Coral' },
					{ value: 'echo', name: 'Echo' },
					{ value: 'fable', name: 'Fable' },
					{ value: 'onyx', name: 'Onyx' },
					{ value: 'nova', name: 'Nova' },
					{ value: 'sage', name: 'Sage' },
					{ value: 'shimmer', name: 'Shimmer' },
					{ value: 'verse', name: 'Verse' },
				];
				for (const voice of voices) {
					dropdown.addOption(voice.value, voice.name);
				}
				dropdown.setValue(this.plugin.settings.voice!.realtimeVoice || 'alloy');
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.realtimeVoice = value as RealtimeVoice;
					await this.plugin.saveSettings();
				});
			});

		// Turn detection mode
		new Setting(realtimeSection)
			.setName("Turn Detection")
			.setDesc("How the agent detects when you've finished speaking")
			.addDropdown((dropdown) => {
				dropdown.addOption('server_vad', 'Server VAD (Voice Activity Detection)');
				dropdown.addOption('semantic_vad', 'Semantic VAD (Smarter, context-aware)');
				dropdown.setValue(this.plugin.settings.voice!.realtimeTurnDetection || 'server_vad');
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.realtimeTurnDetection = value as TurnDetectionMode;
					await this.plugin.saveSettings();
				});
			});

		// Language for speech recognition
		new Setting(realtimeSection)
			.setName("Language")
			.setDesc("Language for speech recognition (improves accuracy)")
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Auto-detect');
				dropdown.addOption('en', 'English');
				dropdown.addOption('es', 'Spanish');
				dropdown.addOption('fr', 'French');
				dropdown.addOption('de', 'German');
				dropdown.addOption('it', 'Italian');
				dropdown.addOption('pt', 'Portuguese');
				dropdown.addOption('nl', 'Dutch');
				dropdown.addOption('ja', 'Japanese');
				dropdown.addOption('ko', 'Korean');
				dropdown.addOption('zh', 'Chinese');
				dropdown.addOption('ru', 'Russian');
				dropdown.addOption('ar', 'Arabic');
				dropdown.addOption('hi', 'Hindi');
				dropdown.setValue(this.plugin.settings.voice!.realtimeLanguage || 'en');
				dropdown.onChange(async (value) => {
					this.plugin.settings.voice!.realtimeLanguage = value;
					await this.plugin.saveSettings();
				});
			});

		// Tool Configuration Section
		realtimeSection.createEl("h4", { text: "Tool Capabilities", cls: "setting-item-heading" });

		// Vault Read Tools
		new Setting(realtimeSection)
			.setName("Vault Read Access")
			.setDesc("Allow reading notes, searching, and listing files")
			.addToggle((toggle) => {
				const config = this.plugin.settings.voice?.realtimeToolConfig || DEFAULT_TOOL_CONFIG;
				toggle.setValue(config.vaultRead ?? true);
				toggle.onChange(async (value) => {
					if (!this.plugin.settings.voice) return;
					this.plugin.settings.voice.realtimeToolConfig = {
						...this.plugin.settings.voice.realtimeToolConfig,
						vaultRead: value,
					};
					await this.plugin.saveSettings();
				});
			});

		// Vault Write Tools
		new Setting(realtimeSection)
			.setName("Vault Write Access")
			.setDesc("Allow creating and modifying notes")
			.addToggle((toggle) => {
				const config = this.plugin.settings.voice?.realtimeToolConfig || DEFAULT_TOOL_CONFIG;
				toggle.setValue(config.vaultWrite ?? true);
				toggle.onChange(async (value) => {
					if (!this.plugin.settings.voice) return;
					this.plugin.settings.voice.realtimeToolConfig = {
						...this.plugin.settings.voice.realtimeToolConfig,
						vaultWrite: value,
					};
					await this.plugin.saveSettings();
				});
			});

		// Web Access Tools
		new Setting(realtimeSection)
			.setName("Web Access")
			.setDesc("Allow searching the web and fetching web pages")
			.addToggle((toggle) => {
				const config = this.plugin.settings.voice?.realtimeToolConfig || DEFAULT_TOOL_CONFIG;
				toggle.setValue(config.webAccess ?? true);
				toggle.onChange(async (value) => {
					if (!this.plugin.settings.voice) return;
					this.plugin.settings.voice.realtimeToolConfig = {
						...this.plugin.settings.voice.realtimeToolConfig,
						webAccess: value,
					};
					await this.plugin.saveSettings();
				});
			});

		// MCP Tools
		new Setting(realtimeSection)
			.setName("MCP Tools")
			.setDesc("Allow using tools from connected MCP servers")
			.addToggle((toggle) => {
				const config = this.plugin.settings.voice?.realtimeToolConfig || DEFAULT_TOOL_CONFIG;
				toggle.setValue(config.mcpTools ?? true);
				toggle.onChange(async (value) => {
					if (!this.plugin.settings.voice) return;
					this.plugin.settings.voice.realtimeToolConfig = {
						...this.plugin.settings.voice.realtimeToolConfig,
						mcpTools: value,
					};
					await this.plugin.saveSettings();
				});
			});

		// Voice Agent Definition Files Section
		realtimeSection.createEl("h4", { text: "Voice Agent Definition Files", cls: "setting-item-heading" });
		realtimeSection.createEl("p", {
			text: "Configure the instruction/prompt files for each voice agent. Start typing to see suggestions, or type a path manually.",
			cls: "vc-status-desc"
		});

		// Main Vault Assistant file
		new Setting(realtimeSection)
			.setName("Main Vault Assistant")
			.setDesc("Orchestrator agent that routes requests to specialists")
			.addText((text) => {
				text.setPlaceholder("Reference/Agents/main-vault-assistant.voice-agent.md");
				text.setValue(this.plugin.settings.voice?.voiceAgentFiles?.mainAssistant || "");
				text.onChange(async (value) => {
					if (!this.plugin.settings.voice) return;
					if (!this.plugin.settings.voice.voiceAgentFiles) {
						this.plugin.settings.voice.voiceAgentFiles = {};
					}
					this.plugin.settings.voice.voiceAgentFiles.mainAssistant = value || undefined;
					await this.plugin.saveSettings();
				});
				// Add file suggester for autocomplete
				new FileSuggest(this.app, text.inputEl, { suffix: ".voice-agent.md" });
			});

		// Note Manager file
		new Setting(realtimeSection)
			.setName("Note Manager")
			.setDesc("Specialist for reading, searching, and editing notes")
			.addText((text) => {
				text.setPlaceholder("Reference/Agents/note-manager.voice-agent.md");
				text.setValue(this.plugin.settings.voice?.voiceAgentFiles?.noteManager || "");
				text.onChange(async (value) => {
					if (!this.plugin.settings.voice) return;
					if (!this.plugin.settings.voice.voiceAgentFiles) {
						this.plugin.settings.voice.voiceAgentFiles = {};
					}
					this.plugin.settings.voice.voiceAgentFiles.noteManager = value || undefined;
					await this.plugin.saveSettings();
				});
				// Add file suggester for autocomplete
				new FileSuggest(this.app, text.inputEl, { suffix: ".voice-agent.md" });
			});

		// Task Manager file
		new Setting(realtimeSection)
			.setName("Task Manager")
			.setDesc("Specialist for managing tasks (create, complete, list)")
			.addText((text) => {
				text.setPlaceholder("Reference/Agents/task-manager.voice-agent.md");
				text.setValue(this.plugin.settings.voice?.voiceAgentFiles?.taskManager || "");
				text.onChange(async (value) => {
					if (!this.plugin.settings.voice) return;
					if (!this.plugin.settings.voice.voiceAgentFiles) {
						this.plugin.settings.voice.voiceAgentFiles = {};
					}
					this.plugin.settings.voice.voiceAgentFiles.taskManager = value || undefined;
					await this.plugin.saveSettings();
				});
				// Add file suggester for autocomplete
				new FileSuggest(this.app, text.inputEl, { suffix: ".voice-agent.md" });
			});

		// WorkIQ file
		new Setting(realtimeSection)
			.setName("WorkIQ")
			.setDesc("Microsoft 365 integration agent")
			.addText((text) => {
				text.setPlaceholder("Reference/Agents/workiq.voice-agent.md");
				text.setValue(this.plugin.settings.voice?.voiceAgentFiles?.workiq || "");
				text.onChange(async (value) => {
					if (!this.plugin.settings.voice) return;
					if (!this.plugin.settings.voice.voiceAgentFiles) {
						this.plugin.settings.voice.voiceAgentFiles = {};
					}
					this.plugin.settings.voice.voiceAgentFiles.workiq = value || undefined;
					await this.plugin.saveSettings();
				});
				// Add file suggester for autocomplete
				new FileSuggest(this.app, text.inputEl, { suffix: ".voice-agent.md" });
			});
	}

	private updateToolSummary(container: HTMLElement): void {
		container.empty();
		const summary = this.toolCatalog.getToolsSummary(this.plugin.settings);
		container.createEl("span", { 
			text: `${summary.enabled}/${summary.total} tools enabled (${summary.builtin} built-in, ${summary.plugin} plugin, ${summary.mcp} MCP)`,
			cls: "vc-status-detail"
		});
	}

	private renderRegisteredSkillsSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section vc-skills-section" });
		
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		sectionHeader.createEl("h3", { text: "Registered Skills & MCP Servers" });
		
		this.skillsContainer = section.createDiv({ cls: "vc-skills-container" });
		
		// Subscribe to skill registry changes
		if (this.skillRegistryUnsubscribe) {
			this.skillRegistryUnsubscribe();
		}
		this.skillRegistryUnsubscribe = this.plugin.skillRegistry.onSkillChange(() => {
			this.updateSkillsDisplay();
		});
		
		// Initial render
		this.updateSkillsDisplay();
	}

	private updateSkillsDisplay(): void {
		if (!this.skillsContainer) return;
		this.skillsContainer.empty();
		
		const skills = this.plugin.skillRegistry.listSkills();
		
		// Skills Table
		this.renderSkillsTable(this.skillsContainer, skills);
		
		// MCP Servers Table - now using McpManager
		this.renderMcpServersSection(this.skillsContainer);
	}

	private renderSkillsTable(container: HTMLElement, skills: SkillInfo[]): void {
		const skillsSection = container.createDiv({ cls: "vc-skills-subsection" });
		skillsSection.createEl("h4", { text: "Skills" });
		
		if (skills.length === 0) {
			const emptyState = skillsSection.createDiv({ cls: "vc-empty-state" });
			emptyState.createEl("p", { text: "No skills registered yet." });
			emptyState.createEl("p", { 
				text: "Skills can be registered by other plugins using the Vault Copilot API.",
				cls: "vc-status-desc"
			});
			return;
		}
		
		const table = skillsSection.createEl("table", { cls: "vc-skills-table" });
		
		// Header row
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Name" });
		headerRow.createEl("th", { text: "Description" });
		headerRow.createEl("th", { text: "Plugin" });
		headerRow.createEl("th", { text: "Category" });
		
		// Body rows
		const tbody = table.createEl("tbody");
		for (const skill of skills) {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: skill.name, cls: "vc-skill-name" });
			row.createEl("td", { text: skill.description, cls: "vc-skill-desc" });
			row.createEl("td", { text: skill.pluginId, cls: "vc-skill-plugin" });
			row.createEl("td", { text: skill.category || "general", cls: "vc-skill-category" });
		}
		
		// Summary
		const summary = skillsSection.createDiv({ cls: "vc-table-summary" });
		const pluginCount = new Set(skills.map(s => s.pluginId)).size;
		summary.createEl("span", { 
			text: `${skills.length} skill${skills.length !== 1 ? "s" : ""} from ${pluginCount} plugin${pluginCount !== 1 ? "s" : ""}` 
		});
	}

	private renderMcpServersSection(container: HTMLElement): void {
		const mcpSection = container.createDiv({ cls: "vc-skills-subsection" });
		
		// Header with refresh button
		const headerRow = mcpSection.createDiv({ cls: "vc-mcp-header-row" });
		headerRow.createEl("h4", { text: "MCP Servers" });
		
		// Only show refresh button on desktop (auto-discovery not available on mobile)
		if (!isMobile) {
			const refreshBtn = headerRow.createEl("button", { 
				text: "↻ Refresh",
				cls: "vc-mcp-refresh-btn"
			});
			refreshBtn.addEventListener("click", async () => {
				await this.plugin.mcpManager.refreshDiscovery();
				this.updateSkillsDisplay();
				console.log("MCP servers refreshed");
			});
		}
		
		// Add HTTP MCP Server button
		const addHttpBtn = headerRow.createEl("button", { 
			text: "+ Add HTTP MCP Server",
			cls: "vc-mcp-add-http-btn"
		});
		addHttpBtn.addEventListener("click", () => {
			const modal = new AddHttpMcpServerModal(this.app, this.plugin, () => {
				this.updateSkillsDisplay();
			});
			modal.open();
		});
		
		const servers = this.plugin.mcpManager.getServers();
		
		if (servers.length === 0) {
			const emptyState = mcpSection.createDiv({ cls: "vc-empty-state" });
			emptyState.createEl("p", { text: "No MCP servers discovered." });
			if (isMobile) {
				emptyState.createEl("p", { 
					text: "On mobile, only HTTP-based MCP servers are supported. Stdio servers (local processes) are not available.",
					cls: "vc-status-desc"
				});
			} else {
				emptyState.createEl("p", { 
					text: "MCP servers are auto-discovered from Claude Desktop, VS Code, Cursor, and Copilot CLI configs.",
					cls: "vc-status-desc"
				});
			}
			return;
		}
		
		// Group servers by source
		const bySource = new Map<string, DiscoveredMcpServer[]>();
		for (const server of servers) {
			const source = server.config.source;
			if (!bySource.has(source)) {
				bySource.set(source, []);
			}
			bySource.get(source)!.push(server);
		}
		
		// Render each source group
		for (const [source, sourceServers] of bySource) {
			const sourceSection = mcpSection.createDiv({ cls: "vc-mcp-source-section" });
			sourceSection.createEl("h5", { 
				text: `${getSourceIcon(source as McpServerSource)} ${getSourceLabel(source as McpServerSource)}`,
				cls: "vc-mcp-source-header"
			});
			
			const table = sourceSection.createEl("table", { cls: "vc-skills-table vc-mcp-table" });
			
			// Header row
			const thead = table.createEl("thead");
			const headerRow2 = thead.createEl("tr");
			headerRow2.createEl("th", { text: "Name" });
			headerRow2.createEl("th", { text: "Type" });
			headerRow2.createEl("th", { text: "Auto Start" });
			headerRow2.createEl("th", { text: "Status" });
			headerRow2.createEl("th", { text: "Actions" });
			
			// Body rows
			const tbody = table.createEl("tbody");
			for (const server of sourceServers) {
				this.renderMcpServerRow(tbody, server);
			}
		}
		
		// Summary
		const summary = mcpSection.createDiv({ cls: "vc-table-summary" });
		const connectedCount = servers.filter(s => s.status.status === "connected").length;
		summary.createEl("span", { 
			text: `${connectedCount} of ${servers.length} server${servers.length !== 1 ? "s" : ""} connected` 
		});
	}
	
	private renderMcpServerRow(tbody: HTMLElement, server: DiscoveredMcpServer): void {
		const row = tbody.createEl("tr");
		const config = server.config;
		const status = server.status;
		
		// Name cell
		const nameCell = row.createEl("td", { cls: "vc-mcp-name" });
		nameCell.createEl("strong", { text: config.name });
		if (isStdioConfig(config)) {
			nameCell.createEl("div", { 
				text: `${config.command} ${(config.args || []).join(" ")}`,
				cls: "vc-mcp-command"
			});
		}
		
		// Type cell
		row.createEl("td", { 
			text: config.transport === "stdio" ? "stdio" : "HTTP",
			cls: "vc-mcp-type" 
		});
		
		// Auto Start cell
		const autoStartCell = row.createEl("td", { cls: "vc-mcp-autostart" });
		const autoStartCheckbox = autoStartCell.createEl("input", {
			type: "checkbox",
			cls: "vc-mcp-autostart-checkbox"
		});
		autoStartCheckbox.checked = this.plugin.mcpManager.isServerAutoStart(config.id);
		autoStartCheckbox.addEventListener("change", async () => {
			await this.plugin.mcpManager.setServerAutoStart(config.id, autoStartCheckbox.checked);
			console.log(autoStartCheckbox.checked 
				? `${config.name} will auto-start on launch` 
				: `${config.name} will not auto-start`);
		});
		
		// Status cell
		const statusCell = row.createEl("td", { cls: "vc-mcp-status" });
		const statusBadge = this.getStatusBadge(status.status);
		const badge = statusCell.createEl("span", { 
			text: statusBadge.text,
			cls: `vc-status-badge ${statusBadge.cls}`
		});
		if (status.error) {
			badge.setAttribute("title", status.error);
		}
		if (status.tools && status.tools.length > 0) {
			statusCell.createEl("div", { 
				text: `${status.tools.length} tools`,
				cls: "vc-mcp-tools-count"
			});
		}
		
		// Actions cell
		const actionsCell = row.createEl("td", { cls: "vc-mcp-actions" });
		
		if (status.status === "connected") {
			const stopBtn = actionsCell.createEl("button", { 
				text: "Stop",
				cls: "vc-mcp-action-btn vc-mcp-stop-btn"
			});
			stopBtn.addEventListener("click", async () => {
				try {
					await this.plugin.mcpManager.stopServer(config.id);
					this.updateSkillsDisplay();
					console.log(`Stopped ${config.name}`);
				} catch (error) {
					console.error(`Failed to stop: ${error}`);
				}
			});
		} else if (status.status === "connecting") {
			actionsCell.createEl("span", { text: "Connecting...", cls: "vc-mcp-connecting" });
		} else {
			// Disconnected or error - show Start button
			const startBtn = actionsCell.createEl("button", { 
				text: "Start",
				cls: "vc-mcp-action-btn vc-mcp-start-btn"
			});
			startBtn.addEventListener("click", async () => {
				try {
					startBtn.disabled = true;
					startBtn.textContent = "Starting...";
					await this.plugin.mcpManager.startServer(config.id);
					this.updateSkillsDisplay();
					console.log(`Started ${config.name}`);
				} catch (error) {
					console.error(`Failed to start: ${error}`);
					this.updateSkillsDisplay();
				}
			});
		}
	}
	
	private getStatusBadge(status: McpConnectionStatus): { text: string; cls: string } {
		switch (status) {
			case "connected":
				return { text: "Connected", cls: "vc-badge-ok" };
			case "connecting":
				return { text: "Connecting", cls: "vc-badge-warning" };
			case "error":
				return { text: "Error", cls: "vc-badge-error" };
			case "disconnected":
			default:
				return { text: "Stopped", cls: "vc-badge-disabled" };
		}
	}

	// Keep old method for backward compatibility with SkillRegistry-based MCP servers
	private renderMcpServersTable(container: HTMLElement, servers: Map<string, McpServerConfig>): void {
		// This method is now deprecated in favor of renderMcpServersSection
		// Keeping for potential backward compatibility
	}

	private renderAutomationsSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section vc-automations-section" });
		
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		sectionHeader.createEl("h3", { text: "Automations" });
		
		const desc = section.createEl("p", { 
			text: "Manage scheduled and event-triggered workflows. Automations can execute agents, prompts, skills, or vault operations automatically.",
			cls: "vc-status-desc"
		});
		
		// Get automations from engine
		const automations = this.plugin.automationEngine?.getAllAutomations() || [];
		
		if (automations.length === 0) {
			const emptyState = section.createDiv({ cls: "vc-empty-state" });
			emptyState.createEl("p", { text: "No automations installed yet." });
			emptyState.createEl("p", { 
				text: "Install automation extensions from the Extension Browser to get started.",
				cls: "vc-status-desc"
			});
			
			// Add button to open extension browser
			new Setting(section)
				.addButton(button => button
					.setButtonText("Browse Automations")
					.onClick(async () => {
						// Open extension browser filtered to automations
						const leaves = this.app.workspace.getLeavesOfType("extension-browser");
						if (leaves.length > 0 && leaves[0]) {
							this.app.workspace.revealLeaf(leaves[0]);
						} else {
							await this.app.workspace.getLeaf(true).setViewState({
								type: "extension-browser",
								active: true,
							});
						}
					}));
			return;
		}
		
		// Render automations table
		this.renderAutomationsTable(section, automations);
	}

	private renderAutomationsTable(container: HTMLElement, automations: import('../../automation/types').AutomationInstance[]): void {
		const table = container.createEl("table", { cls: "vc-automations-table" });
		
		// Header row
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Name" });
		headerRow.createEl("th", { text: "Triggers" });
		headerRow.createEl("th", { text: "Status" });
		headerRow.createEl("th", { text: "Last Run" });
		headerRow.createEl("th", { text: "Actions" });
		
		// Body rows
		const tbody = table.createEl("tbody");
		for (const automation of automations) {
			const row = tbody.createEl("tr");
			
			// Name
			row.createEl("td", { text: automation.name, cls: "vc-automation-name" });
			
			// Triggers
			const triggersCell = row.createEl("td", { cls: "vc-automation-triggers" });
			const triggerTypes = automation.config.triggers.map(t => t.type).join(", ");
			triggersCell.createEl("span", { text: triggerTypes });
			
			// Status
			const statusCell = row.createEl("td", { cls: "vc-automation-status" });
			const statusBadge = statusCell.createEl("span", { 
				cls: `vc-status-badge ${automation.enabled ? 'vc-status-enabled' : 'vc-status-disabled'}`,
				text: automation.enabled ? "Enabled" : "Disabled"
			});
			
			// Last Run
			const lastRunCell = row.createEl("td", { cls: "vc-automation-lastrun" });
			if (automation.lastRun) {
				const date = new Date(automation.lastRun);
				const timeAgo = this.formatTimeAgo(date);
				lastRunCell.createEl("span", { text: timeAgo });
				if (automation.lastResult) {
					const resultIcon = automation.lastResult.success ? "✓" : "✗";
					const resultClass = automation.lastResult.success ? "vc-result-success" : "vc-result-failure";
					lastRunCell.createEl("span", { 
						text: ` ${resultIcon}`,
						cls: resultClass
					});
				}
			} else {
				lastRunCell.createEl("span", { text: "Never", cls: "vc-text-muted" });
			}
			
			// Actions
			const actionsCell = row.createEl("td", { cls: "vc-automation-actions" });
			
			// Toggle button
			const toggleBtn = actionsCell.createEl("button", { 
				cls: "vc-btn vc-btn-small",
				text: automation.enabled ? "Disable" : "Enable"
			});
			toggleBtn.onclick = async () => {
				if (automation.enabled) {
					await this.plugin.automationEngine?.disableAutomation(automation.id);
				} else {
					await this.plugin.automationEngine?.enableAutomation(automation.id);
				}
				this.display(); // Refresh display
			};
			
			// Run now button
			const runBtn = actionsCell.createEl("button", { 
				cls: "vc-btn vc-btn-small",
				text: "Run Now"
			});
			runBtn.onclick = async () => {
				try {
					await this.plugin.automationEngine?.runAutomation(automation.id);
					this.display(); // Refresh display
				} catch (error) {
					console.error("Failed to run automation:", error);
				}
			};
			
			// View details button
			const detailsBtn = actionsCell.createEl("button", { 
				cls: "vc-btn vc-btn-small",
				text: "Details"
			});
			detailsBtn.onclick = () => {
				this.showAutomationDetails(automation);
			};
		}
		
		// Summary
		const summary = container.createDiv({ cls: "vc-table-summary" });
		const enabledCount = automations.filter(a => a.enabled).length;
		summary.createEl("span", { 
			text: `${automations.length} automation${automations.length !== 1 ? "s" : ""} (${enabledCount} enabled)` 
		});
	}

	private formatTimeAgo(date: Date): string {
		const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
		
		if (seconds < 60) return "Just now";
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
		if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
		
		return date.toLocaleDateString();
	}

	private showAutomationDetails(automation: import('../../automation/types').AutomationInstance): void {
		const modal = new AutomationDetailsModal(this.app, automation);
		modal.open();
	}

	private renderAdvancedSettings(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section vc-settings-advanced" });
		
		section.createEl("h2", { text: "Assistant Customization" });
		
		const content = section.createDiv({ cls: "vc-advanced-content" });

		// Skill Directories Section
		this.renderDirectoryList(
			content,
			"Skill Directories",
			"Folders containing skill definition files. Paths can be relative to the vault or absolute.",
			this.plugin.settings.skillDirectories,
			async (dirs) => {
				this.plugin.settings.skillDirectories = dirs;
				await this.plugin.saveSettings();
			}
		);

		// Agent Directories Section
		this.renderDirectoryList(
			content,
			"Agent Directories",
			"Folders containing custom agent definition files. Paths can be relative to the vault or absolute.",
			this.plugin.settings.agentDirectories,
			async (dirs) => {
				this.plugin.settings.agentDirectories = dirs;
				await this.plugin.saveSettings();
			}
		);

		// Instruction Directories Section
		this.renderDirectoryList(
			content,
			"Instruction Directories",
			"Folders containing .instructions.md files that provide context to the assistant.",
			this.plugin.settings.instructionDirectories,
			async (dirs) => {
				this.plugin.settings.instructionDirectories = dirs;
				await this.plugin.saveSettings();
			}
		);

		// Prompt Directories Section
		this.renderDirectoryList(
			content,
			"Prompt Directories",
			"Folders containing .prompt.md files that define reusable prompts. Access prompts by typing / in chat.",
			this.plugin.settings.promptDirectories,
			async (dirs) => {
				this.plugin.settings.promptDirectories = dirs;
				await this.plugin.saveSettings();
			}
		);
	}

	private renderDirectoryList(
		container: HTMLElement,
		title: string,
		description: string,
		directories: string[],
		onUpdate: (dirs: string[]) => Promise<void>
	): void {
		const wrapper = container.createDiv({ cls: "vc-directory-list" });
		
		const headerRow = wrapper.createDiv({ cls: "vc-directory-header" });
		headerRow.createEl("label", { text: title, cls: "vc-directory-title" });
		headerRow.createEl("span", { text: description, cls: "vc-directory-desc" });
		
		const listContainer = wrapper.createDiv({ cls: "vc-directory-items" });
		
		const renderItems = () => {
			listContainer.empty();
			
			if (directories.length === 0) {
				listContainer.createEl("span", { 
					text: "No directories configured",
					cls: "vc-directory-empty"
				});
			} else {
				for (let i = 0; i < directories.length; i++) {
					const dir = directories[i];
					const itemEl = listContainer.createDiv({ cls: "vc-directory-item" });
					
					const pathEl = itemEl.createEl("code", { text: dir, cls: "vc-directory-path" });
					
					const removeBtn = itemEl.createEl("button", { 
						cls: "vc-btn-icon vc-btn-remove",
						attr: { "aria-label": "Remove directory" }
					});
					removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
					removeBtn.addEventListener("click", async () => {
						directories.splice(i, 1);
						await onUpdate(directories);
						renderItems();
					});
				}
			}
		};
		
		renderItems();
		
		// Add new directory input
		const addRow = wrapper.createDiv({ cls: "vc-directory-add" });
		const input = addRow.createEl("input", {
			type: "text",
			placeholder: "~/.copilot/skills, relative/path, or /absolute/path",
			cls: "vc-directory-input"
		});
		
		const addBtn = addRow.createEl("button", { text: "Add", cls: "vc-btn-secondary vc-btn-sm" });
		addBtn.addEventListener("click", async () => {
			const value = input.value.trim();
			if (value && !directories.includes(value)) {
				directories.push(value);
				await onUpdate(directories);
				input.value = "";
				renderItems();
			}
		});
		
		// Allow Enter key to add
		input.addEventListener("keydown", async (e) => {
			if (e.key === "Enter") {
				const value = input.value.trim();
				if (value && !directories.includes(value)) {
					directories.push(value);
					await onUpdate(directories);
					input.value = "";
					renderItems();
				}
			}
		});
	}

	private renderVaultSetupSection(containerEl: HTMLElement): void {
		// Only render if CLI is installed and vault not already initialized
		if (!this.cachedStatus?.installed) {
			return;
		}

		// Check if vault is already initialized (has .github/copilot-instructions.md)
		const vaultInitialized = this.app.vault.getAbstractFileByPath(".github/copilot-instructions.md") !== null;
		
		if (vaultInitialized) {
			return;
		}

		const section = containerEl.createDiv({ cls: "vc-settings-section" });
		section.createEl("h3", { text: "Vault Setup" });
		
		const desc = section.createEl("p", { 
			text: "Initialize GitHub Copilot for this vault to enable context-aware assistance.",
			cls: "vc-status-desc"
		});
		
		const btnRow = section.createDiv({ cls: "vc-btn-row" });
		const btn = btnRow.createEl("button", { text: "Initialize Vault", cls: "vc-btn-primary" });
		btn.addEventListener("click", async () => {
			const vaultPath = this.getVaultPath();
			if (!vaultPath) {
				console.error("Could not determine vault path");
				return;
			}
			btn.disabled = true;
			btn.textContent = "Initializing...";
			const result = await this.githubCopilotCliManager.initializeVault(vaultPath);
			btn.disabled = false;
			btn.textContent = "Initialize Vault";
			// Re-render settings to hide section if initialization succeeded
			this.display();
		});
		
		const cmdPreview = section.createDiv({ cls: "vc-cmd-group" });
		cmdPreview.createEl("label", { text: "Command that will be run:" });
		const vaultPath = this.getVaultPath() || "<vault_path>";
		const normalizedPath = vaultPath.replace(/\\/g, "/");
		cmdPreview.createEl("code", { text: `copilot --add-dir "${normalizedPath}"`, cls: "vc-code-block" });
	}

	private renderHelpSection(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section vc-settings-help" });
		
		const helpContent = section.createDiv({ cls: "vc-help-content" });
		
		helpContent.createEl("h4", { text: "About Vault Copilot" });
		helpContent.createEl("p", {
			text: `Version ${this.plugin.manifest.version}`,
			cls: "vc-version-info"
		});
		helpContent.createEl("p", {
			text: "Vault Copilot brings AI assistance to Obsidian by connecting to your GitHub Copilot, Azure OpenAI, or OpenAI account to your vault. It supports Agent Skills, MCP Tools, and plugin-defined tools to enable powerful operations inside your vault. The assistant can read, search notes, create and update content, help organize information, and support workflows that span multiple plugins."
		});
		helpContent.createEl("p", {
			text: "Vault Copilot is designed to be extensible. You can add your own skills, enable MCP integrations, or install plugins that register additional capabilities. The assistant automatically discovers these tools and uses them when they are relevant."
		});
		helpContent.createEl("p", {
			text: "Vault Copilot is written by Dan Shue and welcomes community contributions. It is not affiliated with, sponsored by, or endorsed by Microsoft, GitHub, or OpenAI."
		});

		const reqDiv = helpContent.createDiv({ cls: "vc-requirements" });
		reqDiv.createEl("h4", { text: "Requirements" });
		const reqList = reqDiv.createEl("ul");
		reqList.createEl("li", { text: "One of: GitHub Copilot CLI (with active subscription), Azure OpenAI, or OpenAI" });
		reqList.createEl("li", { text: "Obsidian vault with read and write access" });

		const linksDiv = helpContent.createDiv({ cls: "vc-help-links" });
		
		const links = [
			{ text: "GitHub Copilot Documentation", url: "https://docs.github.com/en/copilot" },
			{ text: "GitHub Copilot CLI", url: "https://docs.github.com/en/copilot/how-tos/copilot-cli" },
			{ text: "GitHub Copilot Pricing", url: "https://github.com/features/copilot/plans" },
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

	hide(): void {
		// Validate settings before closing
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

		// Save settings if any changes were made
		// Note: Not awaiting since hide() must be synchronous, but this is safe
		// as settings will persist before any subsequent user actions
		if (settingsChanged) {
			void this.plugin.saveSettings();
		}

		// Clean up skill registry subscription
		if (this.skillRegistryUnsubscribe) {
			this.skillRegistryUnsubscribe();
			this.skillRegistryUnsubscribe = null;
		}
		
		// Refresh agent cache when settings panel closes (in case directories changed)
		this.plugin.agentCache?.refreshCache();
		
		// Refresh prompt cache when settings panel closes (in case directories changed)
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

