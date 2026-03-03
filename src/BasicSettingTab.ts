/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BasicSettingTab
 * @description Minimal settings tab for the Basic (Vault Copilot) plugin.
 *
 * Renders two built-in sections (CLI Status, Chat Preferences) and any
 * additional sections registered via the Extension API's SettingsRegistry.
 * Pro and third-party plugins register their settings sections dynamically.
 *
 * @since 0.1.0
 */

import { App, Plugin, PluginSettingTab } from "obsidian";
import type { CopilotPluginSettings } from "./ui/settings/types";
import { GitHubCopilotCliManager, type CliStatus } from "./copilot/providers/GitHubCopilotCliManager";
import { CliStatusSection } from "./ui/settings/sections/CliStatusSection";
import { ChatPreferencesSection } from "./ui/settings/sections/ChatPreferencesSection";
import { VaultSetupSection } from "./ui/settings/sections/VaultSetupSection";
import { HelpSection } from "./ui/settings/sections/HelpSection";
import type { SettingsContext } from "./ui/settings/sections/SettingsContext";
import type { SettingsRegistry } from "./api/registries";

/**
 * Minimal plugin interface to break the circular import with main.ts.
 * BasicSettingTab only needs these members from the plugin.
 * @internal
 */
interface IBasicPlugin extends Plugin {
	settings: CopilotPluginSettings;
	saveSettings(): Promise<void>;
}

/**
 * Basic plugin settings tab.
 *
 * Renders built-in sections (CLI Status, Chat Preferences) plus
 * any sections from the SettingsRegistry (registered by Pro or other plugins).
 */
export class BasicSettingTab extends PluginSettingTab {
	plugin: IBasicPlugin;
	private githubCopilotCliManager: GitHubCopilotCliManager;
	private cachedStatus: CliStatus | null = null;
	private mainSettingsContainer: HTMLElement | null = null;
	private mainSettingsStatusKey: string | null = null;
	private settingsRegistry: SettingsRegistry;

	private cliStatusSection: CliStatusSection;
	private chatPreferencesSection: ChatPreferencesSection;
	private vaultSetupSection: VaultSetupSection;
	private helpSection: HelpSection;
	private subNavItems: HTMLElement[] = [];
	private activeSectionId: string = 'vc-section-chat';

	constructor(app: App, plugin: IBasicPlugin, settingsRegistry: SettingsRegistry) {
		super(app, plugin);
		this.plugin = plugin;
		this.settingsRegistry = settingsRegistry;
		this.githubCopilotCliManager = new GitHubCopilotCliManager(plugin.settings.cliPath);

		const ctx: SettingsContext = {
			app,
			plugin: plugin as unknown as SettingsContext['plugin'],
			display: () => this.display(),
		};

		this.cliStatusSection = new CliStatusSection(
			ctx,
			this.githubCopilotCliManager,
			(status) => {
				this.cachedStatus = status;
				this.renderMainSettingsIfReady(status);
			},
			() => this.checkStatusAsync(),
		);

		this.chatPreferencesSection = new ChatPreferencesSection(
			ctx,
			null as unknown as ConstructorParameters<typeof ChatPreferencesSection>[1],
			() => this.cachedStatus,
			this.githubCopilotCliManager,
			'basic',
		);

		this.vaultSetupSection = new VaultSetupSection(
			ctx,
			() => this.cachedStatus,
			this.githubCopilotCliManager,
		);

		this.helpSection = new HelpSection(ctx);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("vc-settings");

		this.injectSubNavItems();

		// Main container for async-refreshable sections
		const mainContainer = containerEl.createDiv({ cls: 'vc-main-sections-container' });
		this.mainSettingsContainer = mainContainer;
		this.mainSettingsStatusKey = null;
		this.renderMainSettingsIfReady(this.cachedStatus || { installed: false });

		// Render registered sections (from Pro and other plugins)
		const registeredSections = this.settingsRegistry.getAll();
		for (const section of registeredSections) {
			const sectionEl = containerEl.createDiv({ attr: { id: section.id } });
			section.render(sectionEl, { app: this.app, plugin: this.plugin, display: () => this.display() });
		}

		// CLI Status Section
		const cliEl = containerEl.createDiv({ attr: { id: 'vc-section-cli' } });
		this.cliStatusSection.render(cliEl);

		// Show Chat Preferences by default
		this.showSection('vc-section-chat');

		// Trigger async status check
		if (!this.plugin.settings.cliStatusChecked) {
			this.checkStatusAsync()
				.finally(async () => {
					this.plugin.settings.cliStatusChecked = true;
					await this.plugin.saveSettings();
				});
		} else if (this.cachedStatus || this.plugin.settings.cliLastKnownStatus) {
			this.cachedStatus = this.cachedStatus || this.plugin.settings.cliLastKnownStatus || null;
			if (this.cachedStatus) {
				this.cliStatusSection.renderStatusDisplay(this.cachedStatus);
			}
		} else {
			this.cliStatusSection.renderStatusDeferred();
		}
	}

	private renderMainSettingsIfReady(status: CliStatus): void {
		if (!this.mainSettingsContainer) return;

		const statusKey = `${status.installed}-${status.version || ''}-${status.error || ''}`;
		if (this.mainSettingsStatusKey === statusKey && this.mainSettingsContainer.children.length > 0) {
			return;
		}
		this.mainSettingsStatusKey = statusKey;
		this.mainSettingsContainer.empty();

		const chatEl = this.mainSettingsContainer.createDiv({ attr: { id: 'vc-section-chat' } });
		this.chatPreferencesSection.render(chatEl, status);

		const vaultSetupEl = this.mainSettingsContainer.createDiv({ attr: { id: 'vc-section-vaultsetup' } });
		this.vaultSetupSection.render(vaultSetupEl);

		const helpEl = this.mainSettingsContainer.createDiv({ attr: { id: 'vc-section-help' } });
		this.helpSection.render(helpEl);

		this.showSection(this.activeSectionId);
	}

	private injectSubNavItems(): void {
		this.removeSubNavItems();

		const navEl = (this as unknown as { navEl: HTMLElement }).navEl;
		if (!navEl?.parentElement) return;

		// Built-in sub-nav
		const builtInSections: { id: string; icon: string; label: string }[] = [
			{ id: 'vc-section-vaultsetup', icon: '🏛️', label: 'Vault Setup' },
			{ id: 'vc-section-cli', icon: '🖥️', label: 'Connection Status' },
			{ id: 'vc-section-help', icon: 'ℹ️', label: 'About' },
		];

		// Registered sections from Pro and other plugins
		const registeredSections = this.settingsRegistry.getAll().map(section => ({
			id: section.id,
			icon: (section as { icon?: string }).icon || '🔧',
			label: section.title,
		}));

		const sections = [...registeredSections, ...builtInSections];

		let insertAfter: Element = navEl;
		for (const section of sections) {
			const subItem = document.createElement('div');
			subItem.className = 'vertical-tab-nav-item vc-sub-nav-item';

			const iconSpan = document.createElement('span');
			iconSpan.className = 'vc-sub-nav-icon';
			iconSpan.textContent = section.icon;
			subItem.appendChild(iconSpan);

			const labelSpan = document.createElement('span');
			labelSpan.className = 'vc-sub-nav-label';
			labelSpan.textContent = section.label;
			subItem.appendChild(labelSpan);

			subItem.dataset['sectionId'] = section.id;
			subItem.addEventListener('click', () => {
				this.showSection(section.id);
			});

			insertAfter.insertAdjacentElement('afterend', subItem);
			this.subNavItems.push(subItem);
			insertAfter = subItem;
		}
	}

	public showSection(id: string): void {
		this.activeSectionId = id;
		// Sections that live inside mainSettingsContainer
		const mainContainerSectionIds = ['vc-section-chat', 'vc-section-vaultsetup', 'vc-section-help'];
		const allSectionIds = [
			...mainContainerSectionIds,
			'vc-section-cli',
			...this.settingsRegistry.getAll().map(s => s.id),
		];

		// Hide/show the mainSettingsContainer as a whole so it doesn't push other
		// sections (e.g. Connection Status) off-screen when its children are hidden.
		if (this.mainSettingsContainer) {
			this.mainSettingsContainer.style.display =
				mainContainerSectionIds.includes(id) ? 'block' : 'none';
		}

		for (const sid of allSectionIds) {
			const el = this.containerEl.querySelector<HTMLElement>(`#${sid}`);
			if (el) {
				el.style.display = sid === id ? 'block' : 'none';
			}
		}
		for (const item of this.subNavItems) {
			item.classList.toggle('vc-sub-active', item.dataset['sectionId'] === id);
		}
		this.containerEl.scrollTop = 0;
	}

	private removeSubNavItems(): void {
		for (const item of this.subNavItems) {
			item.remove();
		}
		this.subNavItems = [];
	}

	private async checkStatusAsync(): Promise<void> {
		try {
			const status = await this.githubCopilotCliManager.getStatus();
			this.cachedStatus = status;
			this.plugin.settings.cliLastKnownStatus = status;
			await this.plugin.saveSettings();
			this.cliStatusSection.renderStatusDisplay(status);
			this.renderMainSettingsIfReady(status);
		} catch {
			this.cachedStatus = { installed: false, error: 'Status check failed' };
			this.cliStatusSection.renderStatusDisplay(this.cachedStatus);
			this.renderMainSettingsIfReady(this.cachedStatus);
		}
	}

	hide(): void {
		this.removeSubNavItems();
	}
}
