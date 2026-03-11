/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ExtensionAdminSection
 * @description Settings section for configuring the extension package submission system.
 *
 * Exposes admin-only knobs:
 * - Maximum zip file size (MB)
 * - Daily submission rate limit (submissions per user per day)
 * - Read-only view of recent submission history
 *
 * Both limits default to the values in {@link DEFAULT_SETTINGS} and are persisted
 * in plugin settings so they survive restarts.
 *
 * @since 0.0.44
 */

import { Setting } from "obsidian";
import type { SettingsContext } from "./SettingsContext";
import type { ExtensionSubmissionRecord } from "../../../extensions/types";

/**
 * Renders the Extension Admin settings section.
 *
 * Add an instance to the settings tab by calling {@link render} from within
 * `BasicSettingTab.display()` (or the Pro equivalent).
 */
export class ExtensionAdminSection {
	private readonly ctx: SettingsContext;

	/**
	 * @param ctx - Shared settings context providing access to the plugin instance.
	 * @example
	 * ```typescript
	 * const adminSection = new ExtensionAdminSection(ctx);
	 * adminSection.render(containerEl);
	 * ```
	 */
	constructor(ctx: SettingsContext) {
		this.ctx = ctx;
	}

	/**
	 * Render the Extension Admin section into the given container element.
	 *
	 * @param container - Parent container element (the settings tab's main div).
	 * @example
	 * ```typescript
	 * adminSection.render(mainSettingsContainer);
	 * ```
	 */
	render(container: HTMLElement): void {
		const section = container.createDiv({ cls: "vc-settings-section vc-extension-admin-section" });

		// Section header
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		const heading = sectionHeader.createEl("h3");
		heading.createSpan({ cls: "vc-section-icon", text: "📦" });
		heading.createSpan({ text: "Extension Packages" });
		section.createEl("p", {
			text: "Configure limits for community extension package submissions. " +
				"Changes take effect immediately for all subsequent submissions.",
			cls: "vc-section-description",
		});

		const card = section.createDiv({ cls: "vc-plugin-inner-settings-card" });

		// ── Max zip file size ─────────────────────────────────────────────────
		new Setting(card)
			.setName("Maximum Zip File Size (MB)")
			.setDesc(
				"The largest extension package zip file that will be accepted. " +
				"Packages exceeding this limit are rejected before upload.",
			)
			.addText((text) => {
				text
					.setPlaceholder("10")
					.setValue(String(this.ctx.plugin.settings.maxExtensionZipSizeMb ?? 10))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (Number.isFinite(parsed) && parsed >= 1) {
							this.ctx.plugin.settings.maxExtensionZipSizeMb = parsed;
							await this.ctx.plugin.saveSettings();
						}
					});
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "100";
				text.inputEl.style.width = "80px";
			});

		// ── Daily submission rate limit ───────────────────────────────────────
		new Setting(card)
			.setName("Daily Submission Limit (per user)")
			.setDesc(
				"Maximum number of extension packages a single user may submit per calendar day (UTC). " +
				"Users who exceed this limit receive an error until the next day.",
			)
			.addText((text) => {
				text
					.setPlaceholder("5")
					.setValue(String(this.ctx.plugin.settings.extensionSubmissionRateLimit ?? 5))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (Number.isFinite(parsed) && parsed >= 1) {
							this.ctx.plugin.settings.extensionSubmissionRateLimit = parsed;
							await this.ctx.plugin.saveSettings();
						}
					});
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "100";
				text.inputEl.style.width = "80px";
			});

		// ── Submission history summary ────────────────────────────────────────
		this.renderHistorySummary(card);
	}

	/**
	 * Render a read-only summary of recent submission history.
	 *
	 * @param card - The settings card container.
	 * @internal
	 */
	private renderHistorySummary(card: HTMLElement): void {
		const history = this.ctx.plugin.settings.extensionSubmissionHistory ?? [];

		const todayUtc = new Date().toISOString().slice(0, 10);
		const todayCount = history.filter(
			(r: ExtensionSubmissionRecord) => r.submittedAt.startsWith(todayUtc),
		).length;

		new Setting(card)
			.setName("Recent Submissions")
			.setDesc(`${history.length} total record(s) — ${todayCount} today (UTC).`)
			.addButton((btn) => {
				btn
					.setButtonText("Clear History")
					.setWarning()
					.onClick(async () => {
						this.ctx.plugin.settings.extensionSubmissionHistory = [];
						await this.ctx.plugin.saveSettings();
						// Re-render the section to reflect updated counts
						const sectionEl = card.closest(".vc-extension-admin-section");
						if (sectionEl) {
							sectionEl.empty();
							this.render(sectionEl.parentElement ?? card);
						}
					});
			});
	}
}
