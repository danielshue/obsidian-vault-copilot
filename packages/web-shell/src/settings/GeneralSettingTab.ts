/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module GeneralSettingTab
 * @description General settings — language, about info.
 */

import { Setting } from "@vault-copilot/obsidian-shim/src/ui/Setting.js";
import { SettingTab } from "./SettingTab.js";
import { loadSettings, saveSettings } from "./WebShellSettings.js";
import type { App } from "@vault-copilot/obsidian-shim/src/core/App.js";

export class GeneralSettingTab extends SettingTab {
	constructor(app: App) {
		super(app, "general", "General");
	}

	display(): void {
		const el = this.containerEl;
		el.empty();

		// About section
		new Setting(el).setName("About").setHeading();

		const aboutDiv = document.createElement("div");
		aboutDiv.className = "setting-item-description";
		aboutDiv.style.marginBottom = "16px";
		aboutDiv.innerHTML = `
			<div style="margin-bottom: 8px;"><strong>Vault Copilot</strong> (Web Shell)</div>
			<div style="color: var(--text-muted); font-size: var(--font-ui-smaller);">
				v0.0.26 &middot; Running in ${window.electronAPI ? "Electron" : "Browser"}
			</div>
		`;
		el.appendChild(aboutDiv);

		const settings = loadSettings();

		// Language
		new Setting(el).setName("Language").setHeading();

		new Setting(el)
			.setName("Interface language")
			.setDesc("Change the display language of the application.")
			.addDropdown((dd) => {
				dd.addOption("en", "English")
					.addOption("es", "Español")
					.addOption("fr", "Français")
					.addOption("de", "Deutsch")
					.addOption("ja", "日本語")
					.addOption("zh", "中文")
					.setValue(settings.language)
					.onChange((val) => {
						settings.language = val;
						saveSettings(settings);
					});
			});

		// Vault info
		new Setting(el).setName("Vault").setHeading();

		const fileCount = this.app.vault?.getFiles?.()?.length ?? 0;
		new Setting(el)
			.setName("Vault statistics")
			.setDesc(`${fileCount} files in vault`);

		new Setting(el)
			.setName("Override config folder")
			.setDesc("Configuration is stored in localStorage for the web shell.")
			.addText((text) => {
				text.setValue(".obsidian").setDisabled(true);
			});
	}
}
