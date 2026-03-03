/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VaultSetupSection
 * @description Settings section that initializes vault-level Copilot onboarding files.
 *
 * @see {@link GitHubCopilotCliManager}
 * @since 0.0.1
 */

import { FileSystemAdapter } from "obsidian";
import { SettingsContext } from "./SettingsContext";
import { GitHubCopilotCliManager } from "../../../copilot/providers/GitHubCopilotCliManager";
import type { CliStatus } from "../../../copilot/providers/GitHubCopilotCliManager";

/**
 * Renders vault setup controls for Copilot initialization.
 */
export class VaultSetupSection {
	private ctx: SettingsContext;
	private getCachedStatus: () => CliStatus | null;
	private githubCopilotCliManager: GitHubCopilotCliManager;

	/**
	 * @param ctx - Shared settings context.
	 * @param getCachedStatus - Function returning last CLI status snapshot.
	 * @param githubCopilotCliManager - CLI manager used for vault initialization.
	 */
	constructor(
		ctx: SettingsContext,
		getCachedStatus: () => CliStatus | null,
		githubCopilotCliManager: GitHubCopilotCliManager,
	) {
		this.ctx = ctx;
		this.getCachedStatus = getCachedStatus;
		this.githubCopilotCliManager = githubCopilotCliManager;
	}

	/**
	 * Renders the vault setup section.
	 * @param containerEl - Parent settings container.
	 * @returns Void.
	 */
	render(containerEl: HTMLElement): void {
		const status = this.getCachedStatus();
		const vaultInitialized = this.ctx.app.vault.getAbstractFileByPath(".github/copilot-instructions.md") !== null;

		const section = containerEl.createDiv({ cls: "vc-settings-section" });
		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		const heading = sectionHeader.createEl("h3");
		heading.createSpan({ cls: "vc-section-icon", text: "🏛️" });
		heading.createSpan({ text: "Vault Setup" });

		section.createEl("p", {
			text: "Initialize GitHub Copilot for this vault to enable context-aware assistance.",
			cls: "vc-section-description"
		});

		if (!status?.installed) {
			section.createEl("p", {
				text: "Install GitHub Copilot CLI first, then return here to initialize this vault.",
				cls: "vc-status-desc"
			});
			return;
		}

		if (vaultInitialized) {
			section.createEl("p", {
				text: "This vault is already initialized for GitHub Copilot.",
				cls: "vc-status-desc"
			});
			return;
		}

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
			await this.githubCopilotCliManager.initializeVault(vaultPath);
			btn.disabled = false;
			btn.textContent = "Initialize Vault";
			this.ctx.display();
		});

		const cmdPreview = section.createDiv({ cls: "vc-cmd-group" });
		cmdPreview.createEl("label", { text: "Command that will be run:" });
		const vaultPath = this.getVaultPath() || "<vault_path>";
		const normalizedPath = vaultPath.replace(/\\/g, "/");
		cmdPreview.createEl("code", { text: `copilot --add-dir "${normalizedPath}"`, cls: "vc-code-block" });
	}

	/**
	 * Resolves filesystem path for the current vault.
	 * @returns Absolute vault path when available.
	 * @internal
	 */
	private getVaultPath(): string | undefined {
		const adapter = this.ctx.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		return undefined;
	}
}
