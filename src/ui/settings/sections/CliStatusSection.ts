/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CliStatusSection
 * @description Settings section that shows GitHub Copilot CLI connection state.
 *
 * @see {@link GitHubCopilotCliManager}
 * @since 0.0.1
 */

import { setIcon } from "obsidian";
import { SettingsContext } from "./SettingsContext";
import { GitHubCopilotCliManager, CliStatus } from "../../../copilot/providers/GitHubCopilotCliManager";

/**
 * Renders CLI installation and connection status with refresh controls.
 */
export class CliStatusSection {
	private ctx: SettingsContext;
	private manager: GitHubCopilotCliManager;
	private onStatusUpdated: (status: CliStatus) => void;
	private checkStatusAsync: () => Promise<void>;
	private statusContainer: HTMLElement | null = null;

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
			this.checkStatusAsync().finally(() => {
				refreshBtn.removeClass("vc-spinning");
			});
		});

		section.createEl("p", {
			text: "Check GitHub Copilot CLI availability and connection readiness for this vault.",
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

		const statusGrid = this.statusContainer.createDiv({ cls: "vc-status-grid" });

		const cliCard = statusGrid.createDiv({ cls: "vc-status-item" });
		this.renderStatusCard(cliCard, {
			label: "CLI Installation",
			isOk: status.installed,
			detail: status.installed ? `v${status.version || "unknown"}` : "Not installed",
			icon: status.installed
				? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
				: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
		});

		if (!status.installed) {
			this.renderInstallActions(this.statusContainer);
		} else {
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
}
