/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module NotificationPanel
 * @description VSCode-inspired notification panel for Vault Copilot.
 *
 * Renders as a floating dropdown anchored below the bell icon in the chat header.
 * Shows all current notifications with dismiss controls, a clear-all button,
 * and a "NO NEW NOTIFICATIONS" empty state.
 *
 * @example
 * ```typescript
 * const panel = new NotificationPanel(service, headerEl, onOpenSettings);
 * panel.toggle(bellBtnEl);
 * ```
 *
 * @since 0.1.0
 */

import { setIcon } from "obsidian";
import type { NotificationService, CopilotNotification } from "./NotificationService";

/** VSCode-style icon names mapped to notification type. */
const TYPE_ICONS: Record<string, string> = {
	info: "info",
	warning: "alert-triangle",
	error: "alert-circle",
};

/** CSS class names for notification type accent. */
const TYPE_CLASSES: Record<string, string> = {
	info: "vc-notif-info",
	warning: "vc-notif-warning",
	error: "vc-notif-error",
};

/**
 * Floating notification panel anchored to a trigger element.
 *
 * Call {@link toggle} to show/hide, or {@link show}/{@link hide} directly.
 * The panel auto-closes when the user clicks outside of it.
 */
export class NotificationPanel {
	private panelEl: HTMLElement | null = null;
	private isVisible = false;
	private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

	/**
	 * @param service - Notification service to read from and mutate
	 * @param containerEl - Parent element to append the panel into (e.g. `.vc-main-view`)
	 * @param onOpenSettings - Callback when the settings gear is clicked
	 */
	constructor(
		private readonly service: NotificationService,
		private readonly containerEl: HTMLElement,
		private readonly onOpenSettings: () => void,
	) {}

	// ─── Visibility ───────────────────────────────────────────────────────────

	/**
	 * Show the panel anchored below a trigger element.
	 *
	 * @param anchorEl - Element to anchor the panel below (e.g. the bell button)
	 */
	show(anchorEl: HTMLElement): void {
		if (this.isVisible) {
			this.render();
			return;
		}
		this.isVisible = true;
		this.service.markAllRead();

		this.panelEl = this.containerEl.createDiv({ cls: "vc-notification-panel" });
		this.positionPanel(anchorEl);
		this.render();

		// Close when clicking outside
		const handler = (e: MouseEvent) => {
			if (this.panelEl && !this.panelEl.contains(e.target as Node) && e.target !== anchorEl) {
				this.hide();
			}
		};
		this.outsideClickHandler = handler;
		document.addEventListener("mousedown", handler, { capture: true });
	}

	/**
	 * Hide and remove the panel from the DOM.
	 */
	hide(): void {
		if (!this.isVisible) return;
		this.isVisible = false;
		this.panelEl?.remove();
		this.panelEl = null;
		if (this.outsideClickHandler) {
			document.removeEventListener("mousedown", this.outsideClickHandler, { capture: true });
			this.outsideClickHandler = null;
		}
	}

	/**
	 * Toggle the panel open or closed.
	 *
	 * @param anchorEl - Element to anchor the panel below
	 */
	toggle(anchorEl: HTMLElement): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show(anchorEl);
		}
	}

	/** Whether the panel is currently visible. */
	get visible(): boolean {
		return this.isVisible;
	}

	/**
	 * Re-render the panel contents if visible. Called when the notification list changes.
	 */
	refresh(): void {
		if (this.isVisible && this.panelEl) {
			this.render();
		}
	}

	/**
	 * Destroy the panel and clean up listeners.
	 */
	destroy(): void {
		this.hide();
	}

	// ─── Rendering ────────────────────────────────────────────────────────────

	private render(): void {
		if (!this.panelEl) return;
		this.panelEl.empty();

		// ── Header ────────────────────────────────────────────────────────────
		const header = this.panelEl.createDiv({ cls: "vc-notification-panel-header" });
		header.createSpan({ cls: "vc-notification-panel-title", text: "NOTIFICATIONS" });

		const headerActions = header.createDiv({ cls: "vc-notification-panel-header-actions" });

		const clearAllBtn = headerActions.createEl("button", {
			cls: "vc-notification-action-btn",
			attr: { "aria-label": "Clear all notifications" },
		});
		setIcon(clearAllBtn, "check-check");
		clearAllBtn.addEventListener("click", () => {
			this.service.clearAll();
			this.render();
		});

		const settingsBtn = headerActions.createEl("button", {
			cls: "vc-notification-action-btn",
			attr: { "aria-label": "Notification settings" },
		});
		setIcon(settingsBtn, "settings");
		settingsBtn.addEventListener("click", () => {
			this.hide();
			this.onOpenSettings();
		});

		// ── Notification list ─────────────────────────────────────────────────
		const listEl = this.panelEl.createDiv({ cls: "vc-notification-list" });
		const notifications = this.service.getAll();

		if (notifications.length === 0) {
			const emptyEl = listEl.createDiv({ cls: "vc-notification-empty" });
			setIcon(emptyEl.createDiv({ cls: "vc-notification-empty-icon" }), "bell");
			emptyEl.createDiv({ cls: "vc-notification-empty-text", text: "NO NEW NOTIFICATIONS" });
			return;
		}

		for (const notif of notifications) {
			this.renderItem(listEl, notif);
		}
	}

	private renderItem(listEl: HTMLElement, notif: CopilotNotification): void {
		const item = listEl.createDiv({ cls: `vc-notification-item ${TYPE_CLASSES[notif.type] ?? ""}` });

		// Icon
		const iconEl = item.createDiv({ cls: "vc-notification-icon" });
		setIcon(iconEl, TYPE_ICONS[notif.type] ?? "info");

		// Content
		const contentEl = item.createDiv({ cls: "vc-notification-content" });
		contentEl.createDiv({ cls: "vc-notification-title", text: notif.title });
		if (notif.body) {
			contentEl.createDiv({ cls: "vc-notification-body", text: notif.body });
		}

		// Meta row: source + time
		const metaEl = contentEl.createDiv({ cls: "vc-notification-meta" });
		if (notif.source) {
			metaEl.createSpan({ cls: "vc-notification-source", text: notif.source });
		}
		metaEl.createSpan({ cls: "vc-notification-time", text: this.formatTime(notif.timestamp) });

		// Dismiss button
		const dismissBtn = item.createEl("button", {
			cls: "vc-notification-dismiss-btn",
			attr: { "aria-label": "Dismiss notification" },
		});
		setIcon(dismissBtn, "x");
		dismissBtn.addEventListener("click", (e: MouseEvent) => {
			e.stopPropagation();
			this.service.dismiss(notif.id);
			this.render();
		});
	}

	private positionPanel(anchorEl: HTMLElement): void {
		if (!this.panelEl) return;
		const rect = anchorEl.getBoundingClientRect();
		const containerRect = this.containerEl.getBoundingClientRect();
		// Position relative to the container
		const top = rect.bottom - containerRect.top + 4;
		const right = containerRect.right - rect.right;
		this.panelEl.style.top = `${top}px`;
		this.panelEl.style.right = `${right}px`;
	}

	private formatTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		if (diff < 60_000) return "just now";
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
		if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
		return new Date(timestamp).toLocaleDateString();
	}
}
