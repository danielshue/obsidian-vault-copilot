/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CliStatusSection
 * @description Settings section that shows GitHub Copilot and Foundry Local CLI connection state.
 *
 * @see {@link GitHubCopilotCliManager}
 * @since 0.0.1
 */

import { setIcon } from "obsidian";
import { SettingsContext } from "./SettingsContext";
import { GitHubCopilotCliManager, CliStatus } from "../../../copilot/providers/GitHubCopilotCliManager";
import { FoundryLocalManager } from "../../../copilot/providers/FoundryLocalManager";

/**
 * Renders CLI installation and connection status with refresh controls.
 */
export class CliStatusSection {
	private static readonly REQUIRED_FOUNDRY_MODELS = ["fara-7b", "phi-4"];
	private ctx: SettingsContext;
	private manager: GitHubCopilotCliManager;
	private foundryManager: FoundryLocalManager;
	private onStatusUpdated: (status: CliStatus) => void;
	private checkStatusAsync: () => Promise<void>;
	private statusContainer: HTMLElement | null = null;
	private lastCliStatus: CliStatus | null = null;
	private installingCopilot = false;
	private installingFoundry = false;
	private downloadingModels = new Set<string>();
	private foundryStatus: {
		loading: boolean;
		checked: boolean;
		installed: boolean;
		version?: string;
		error?: string;
		cachedModels: string[];
	} = {
		loading: false,
		checked: false,
		installed: false,
		cachedModels: [],
	};

	/**
	 * @param ctx - Shared settings context.
	 * @param manager - CLI manager for status checks and install hints.
	 * @param onStatusUpdated - Callback invoked when status changes.
	 * @param checkStatusAsync - Refresh function triggered by UI interactions.
	 */
	constructor(
		ctx: SettingsContext,
		manager: GitHubCopilotCliManager,
		onStatusUpdated: (status: CliStatus) => void,
		checkStatusAsync: () => Promise<void>,
	) {
		this.ctx = ctx;
		this.manager = manager;
		this.foundryManager = new FoundryLocalManager();
		this.onStatusUpdated = onStatusUpdated;
		this.checkStatusAsync = checkStatusAsync;
	}

	/**
	 * Renders the status section shell.
	 * @param container - Parent settings container.
	 * @returns Void.
	 */
	render(container: HTMLElement): void {
		const section = container.createDiv({ cls: "vc-settings-section" });

		const sectionHeader = section.createDiv({ cls: "vc-section-header" });
		const heading = sectionHeader.createEl("h3");
		heading.createSpan({ cls: "vc-section-icon", text: "🖥️" });
		heading.createSpan({ text: "Connection Status" });

		const headerActions = sectionHeader.createDiv({ cls: "vc-section-header-actions" });
		const refreshBtn = headerActions.createEl("button", {
			cls: "vc-refresh-btn vc-status-refresh-btn",
			attr: {
				"aria-label": "Refresh status",
				title: "Refresh status",
			}
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", () => {
			refreshBtn.addClass("vc-spinning");
			this.manager.invalidateCache();
			this.foundryManager.invalidateCache();
			this.foundryStatus = {
				loading: false,
				checked: false,
				installed: false,
				cachedModels: [],
			};
			this.checkStatusAsync().finally(() => {
				refreshBtn.removeClass("vc-spinning");
			});
		});

		section.createEl("p", {
			text: "Check GitHub Copilot CLI and Microsoft Foundry Local installation status, including required model downloads.",
			cls: "vc-section-description"
		});

		this.statusContainer = section.createDiv({ cls: "vc-status-card" });

		this.renderLoadingStatus();
	}

	/**
	 * Shows loading state while status is being checked.
	 * @returns Void.
	 */
	renderLoadingStatus(): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();

		const loadingEl = this.statusContainer.createDiv({ cls: "vc-status-loading" });
		loadingEl.innerHTML = `
			<div class="vc-spinner"></div>
			<span>Checking connection...</span>
		`;
	}

	/**
	 * Shows deferred state when checks are intentionally paused.
	 * @returns Void.
	 */
	renderStatusDeferred(): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();

		const infoEl = this.statusContainer.createDiv({ cls: "vc-status-loading" });
		infoEl.innerHTML = `
			<span>Connection status check is paused. Use refresh to check.</span>
		`;
	}

	/**
	 * Renders status cards and actionable guidance.
	 * @param status - Current CLI status snapshot.
	 * @returns Void.
	 */
	renderStatusDisplay(status: CliStatus): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();
		this.lastCliStatus = status;

		const statusGrid = this.statusContainer.createDiv({ cls: "vc-status-grid" });

		const cliCard = statusGrid.createDiv({ cls: "vc-status-item" });
		this.renderStatusCard(cliCard, {
			label: "CLI Installation",
			state: this.installingCopilot ? "pending" : (status.installed ? "ok" : "error"),
			detail: this.installingCopilot
				? "Installing..."
				: (status.installed ? `v${status.version || "unknown"}` : "Not installed"),
		});
		if (!status.installed) {
			this.renderStatusCardAction(cliCard, {
				label: this.installingCopilot ? "Installing..." : "Install CLI",
				running: this.installingCopilot,
				onClick: (button) => void this.installCopilotCli(button),
			});
		}

		const foundryCard = statusGrid.createDiv({ cls: "vc-status-item" });
		const foundryState = this.foundryStatus.loading || !this.foundryStatus.checked
			? "pending"
			: (this.installingFoundry ? "pending" : (this.foundryStatus.installed ? "ok" : "error"));
		this.renderStatusCard(foundryCard, {
			label: "Foundry Local CLI",
			state: foundryState,
			detail: this.installingFoundry
				? "Installing..."
				: (this.foundryStatus.loading || !this.foundryStatus.checked
				? "Checking..."
				: (this.foundryStatus.installed ? `v${this.foundryStatus.version || "unknown"}` : "Not installed")),
		});
		if (!this.foundryStatus.loading && this.foundryStatus.checked && !this.foundryStatus.installed) {
			const installInfo = this.foundryManager.getInstallCommand();
			if (installInfo.command) {
				this.renderStatusCardAction(foundryCard, {
					label: this.installingFoundry ? "Installing..." : "Install CLI",
					running: this.installingFoundry,
					onClick: (button) => void this.installFoundryCli(button),
				});
			}
		}

		const foundryModelStates = this.getRequiredFoundryModelStates();
		for (const model of foundryModelStates) {
			const modelCard = statusGrid.createDiv({ cls: "vc-status-item" });
			const state = !this.foundryStatus.checked || this.foundryStatus.loading
				? "pending"
				: (this.foundryStatus.installed
					? (model.installed ? "ok" : "error")
					: "pending");
			this.renderStatusCard(modelCard, {
				label: `Model: ${model.displayName}`,
				state,
				detail: !this.foundryStatus.checked || this.foundryStatus.loading
					? "Checking..."
					: (this.foundryStatus.installed
						? (model.installed ? "Downloaded" : "Not downloaded")
						: "Install Foundry Local first"),
			});
			if (this.foundryStatus.checked && this.foundryStatus.installed && !model.installed) {
				const isDownloading = this.downloadingModels.has(model.model);
				this.renderStatusCardAction(modelCard, {
					label: isDownloading ? "Downloading..." : "Download Model",
					running: isDownloading,
					onClick: (button) => void this.downloadFoundryModel(model.model, button),
				});
			}
		}

		if (!status.installed) {
			this.renderInstallActions(this.statusContainer);
		}

		if (!this.foundryStatus.loading && this.foundryStatus.checked && !this.foundryStatus.installed) {
			this.renderFoundryInstallActions(this.statusContainer);
		}

		if (this.foundryStatus.checked && this.foundryStatus.installed) {
			this.renderFoundryModelActions(this.statusContainer, foundryModelStates);
		}

		if (status.installed) {
			this.renderAuthNote(this.statusContainer);
		}

		if (!this.foundryStatus.loading && !this.foundryStatus.checked) {
			void this.refreshFoundryStatus();
		}
	}

	private renderStatusCard(container: HTMLElement, opts: { label: string; state: "ok" | "error" | "pending"; detail: string }): void {
		container.addClass(opts.state === "ok" ? "vc-status-ok" : (opts.state === "pending" ? "vc-status-pending" : "vc-status-error"));

		const iconEl = container.createDiv({ cls: "vc-status-icon" });
		iconEl.innerHTML = this.getStatusIcon(opts.state);

		const textEl = container.createDiv({ cls: "vc-status-text" });
		textEl.createEl("span", { text: opts.label, cls: "vc-status-label" });
		textEl.createEl("span", { text: opts.detail, cls: "vc-status-detail" });
	}

	/**
	 * Returns icon markup for status states shown in the status cards.
	 */
	private getStatusIcon(state: "ok" | "error" | "pending"): string {
		if (state === "ok") {
			return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
		}
		if (state === "pending") {
			return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
		}
		return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
	}

	/**
	 * Renders status error output.
	 * @param error - Error text to display.
	 * @returns Void.
	 */
	renderStatusError(error: string): void {
		if (!this.statusContainer) return;
		this.statusContainer.empty();

		const errorEl = this.statusContainer.createDiv({ cls: "vc-status-error-msg" });
		errorEl.createEl("span", { text: `Error checking status: ${error}` });
	}

	/**
	 * Renders CLI installation command and docs link.
	 * @param container - Parent container for actions.
	 * @returns Void.
	 * @internal
	 */
	private renderInstallActions(container: HTMLElement): void {
		const actionsEl = container.createDiv({ cls: "vc-status-actions" });

		const installInfo = this.manager.getInstallCommand();

		const cmdGroup = actionsEl.createDiv({ cls: "vc-cmd-group" });
		cmdGroup.createEl("label", { text: installInfo.description });

		const cmdRow = cmdGroup.createDiv({ cls: "vc-cmd-row" });
		cmdRow.createEl("code", { text: installInfo.command });

		const copyBtn = cmdRow.createEl("button", { text: "Copy", cls: "vc-btn-secondary vc-btn-sm" });
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(installInfo.command);
			console.log("Copied to clipboard");
		});

		const btnRow = actionsEl.createDiv({ cls: "vc-btn-row" });
		const docsLink = btnRow.createEl("a", { text: "View Guide", cls: "vc-btn-link", href: installInfo.url });
		docsLink.setAttr("target", "_blank");
	}

	/**
	 * Renders Foundry Local CLI install command and setup link.
	 */
	private renderFoundryInstallActions(container: HTMLElement): void {
		const actionsEl = container.createDiv({ cls: "vc-status-actions" });
		const installInfo = this.foundryManager.getInstallCommand();
		const cmdGroup = actionsEl.createDiv({ cls: "vc-cmd-group" });
		cmdGroup.createEl("label", { text: installInfo.description });

		if (installInfo.command) {
			const cmdRow = cmdGroup.createDiv({ cls: "vc-cmd-row" });
			cmdRow.createEl("code", { text: installInfo.command });

			const copyBtn = cmdRow.createEl("button", { text: "Copy", cls: "vc-btn-secondary vc-btn-sm" });
			copyBtn.addEventListener("click", () => {
				navigator.clipboard.writeText(installInfo.command);
				console.log("Copied to clipboard");
			});
		}

		const btnRow = actionsEl.createDiv({ cls: "vc-btn-row" });
		const docsLink = btnRow.createEl("a", { text: "Foundry Setup Guide", cls: "vc-btn-link", href: installInfo.url });
		docsLink.setAttr("target", "_blank");
	}

	/**
	 * Renders download commands for required Foundry models that are not cached yet.
	 */
	private renderFoundryModelActions(
		container: HTMLElement,
		models: Array<{ model: string; displayName: string; installed: boolean }>
	): void {
		const missingModels = models.filter((model) => !model.installed);
		if (missingModels.length === 0) return;

		const actionsEl = container.createDiv({ cls: "vc-status-actions" });
		const cmdGroup = actionsEl.createDiv({ cls: "vc-cmd-group" });
		cmdGroup.createEl("label", { text: "Download required Foundry Local models" });

		for (const model of missingModels) {
			const command = `foundry model download ${model.model}`;
			const cmdRow = cmdGroup.createDiv({ cls: "vc-cmd-row" });
			cmdRow.createEl("code", { text: command });
			const copyBtn = cmdRow.createEl("button", { text: "Copy", cls: "vc-btn-secondary vc-btn-sm" });
			copyBtn.addEventListener("click", () => {
				navigator.clipboard.writeText(command);
				console.log("Copied to clipboard");
			});
		}
	}

	/**
	 * Renders authentication guidance when CLI is available.
	 * @param container - Parent container for notes.
	 * @returns Void.
	 * @internal
	 */
	private renderAuthNote(container: HTMLElement): void {
		const noteEl = container.createDiv({ cls: "vc-auth-note" });
		noteEl.createEl("p", {
			text: "Authentication is handled automatically when you first use GitHub Copilot. If prompted, use the /login command in the CLI.",
			cls: "vc-status-desc"
		});

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

	/**
	 * Refreshes Foundry CLI/model state and triggers status re-render using last CLI snapshot.
	 */
	private async refreshFoundryStatus(): Promise<void> {
		if (this.foundryStatus.loading) return;
		this.foundryStatus.loading = true;

		try {
			const status = await this.foundryManager.getStatus(true);
			let cachedModels: string[] = [];
			let listError: string | undefined;

			if (status.installed) {
				const modelList = await this.foundryManager.listCachedModels(true);
				cachedModels = modelList.models;
				listError = modelList.error;
			}

			this.foundryStatus = {
				loading: false,
				checked: true,
				installed: status.installed,
				version: status.version,
				error: status.error || listError,
				cachedModels,
			};
		} catch (error) {
			this.foundryStatus = {
				loading: false,
				checked: true,
				installed: false,
				error: error instanceof Error ? error.message : "Failed to check Foundry Local status",
				cachedModels: [],
			};
		}

		if (this.lastCliStatus) {
			this.renderStatusDisplay(this.lastCliStatus);
		}
	}

	/**
	 * Runs GitHub Copilot CLI install flow and updates UI install state.
	 */
	private async installCopilotCli(button: HTMLButtonElement): Promise<void> {
		if (this.installingCopilot) return;
		this.installingCopilot = true;
		const originalLabel = button.textContent ?? "Install CLI";
		button.addClass("vc-spinning");
		button.disabled = true;
		button.textContent = "Installing...";
		try {
			await this.manager.installCli();
			this.manager.invalidateCache();
			await this.checkStatusAsync();
		} finally {
			this.installingCopilot = false;
			button.removeClass("vc-spinning");
			button.disabled = false;
			button.textContent = originalLabel;
			if (this.lastCliStatus) {
				this.renderStatusDisplay(this.lastCliStatus);
			}
		}
	}

	/**
	 * Runs Foundry Local install flow and refreshes Foundry status cards.
	 */
	private async installFoundryCli(button: HTMLButtonElement): Promise<void> {
		if (this.installingFoundry) return;
		this.installingFoundry = true;
		const originalLabel = button.textContent ?? "Install CLI";
		button.addClass("vc-spinning");
		button.disabled = true;
		button.textContent = "Installing...";
		try {
			await this.foundryManager.installCli();
			this.foundryManager.invalidateCache();
			await this.refreshFoundryStatus();
		} finally {
			this.installingFoundry = false;
			button.removeClass("vc-spinning");
			button.disabled = false;
			button.textContent = originalLabel;
			if (this.lastCliStatus) {
				this.renderStatusDisplay(this.lastCliStatus);
			}
		}
	}

	/**
	 * Downloads a required Foundry model and refreshes model status cards.
	 */
	private async downloadFoundryModel(modelId: string, button: HTMLButtonElement): Promise<void> {
		if (this.downloadingModels.has(modelId)) return;
		this.downloadingModels.add(modelId);
		const originalLabel = button.textContent ?? "Download Model";
		button.addClass("vc-spinning");
		button.disabled = true;
		button.textContent = "Downloading...";
		try {
			await this.foundryManager.downloadModel(modelId);
			await this.refreshFoundryStatus();
		} finally {
			this.downloadingModels.delete(modelId);
			button.removeClass("vc-spinning");
			button.disabled = false;
			button.textContent = originalLabel;
			if (this.lastCliStatus) {
				this.renderStatusDisplay(this.lastCliStatus);
			}
		}
	}

	/**
	 * Renders an inline status-card action button with install/download animation state.
	 */
	private renderStatusCardAction(
		container: HTMLElement,
		opts: { label: string; running: boolean; onClick: (button: HTMLButtonElement) => void }
	): void {
		const actionWrap = container.createDiv({ cls: "vc-status-card-action" });
		const button = actionWrap.createEl("button", { text: opts.label, cls: "vc-btn-secondary vc-install-btn" });
		if (opts.running) {
			button.addClass("vc-spinning");
			button.disabled = true;
		}
		button.addEventListener("click", () => opts.onClick(button));
	}

	/**
	 * Maps required Foundry model IDs to UI display names and install state.
	 */
	private getRequiredFoundryModelStates(): Array<{ model: string; displayName: string; installed: boolean }> {
		const installedSet = new Set(this.foundryStatus.cachedModels.map((model) => model.toLowerCase()));

		return CliStatusSection.REQUIRED_FOUNDRY_MODELS.map((model) => {
			const isInstalled = Array.from(installedSet).some((installed) => installed.includes(model));
			const displayName = model === "fara-7b" ? "Fara-7B" : "Phi-4";
			return { model, displayName, installed: isInstalled };
		});
	}
}
