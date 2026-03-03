/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module HelpSection
 * @description Renders the About/help content for Vault Copilot settings.
 *
 * @see {@link SettingsContext}
 * @since 0.0.1
 */

import { SettingsContext } from "./SettingsContext";

/**
 * About/help settings section.
 */
export class HelpSection {
	private ctx: SettingsContext;

	/**
	 * @param ctx - Shared settings context.
	 */
	constructor(ctx: SettingsContext) {
		this.ctx = ctx;
	}

	/**
	 * Renders product description, requirements, and links.
	 *
	 * @param containerEl - Parent settings container.
	 * @returns Void.
	 */
	render(containerEl: HTMLElement): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section vc-settings-help" });
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		const heading = sectionHeader.createEl("h3");
		heading.createSpan({ cls: "vc-section-icon", text: "ℹ️" });
		heading.createSpan({ text: "About" });

		section.createEl("p", {
			text: "Find documentation, requirements, and support resources for Vault Copilot.",
			cls: "vc-section-description"
		});

		const helpContent = section.createDiv({ cls: "vc-help-content" });

		helpContent.createEl("p", {
			text: "Vault Copilot brings AI assistance to Obsidian by connecting your vault with GitHub Copilot, Azure OpenAI, or OpenAI. It supports agents, skills, prompts, MCP tools, and plugin-defined tools for powerful in-vault workflows."
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
}
