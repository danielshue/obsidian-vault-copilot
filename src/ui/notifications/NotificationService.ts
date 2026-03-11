/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module NotificationService
 * @description Core notification store for Vault Copilot.
 *
 * Manages the list of in-app notifications (info, warning, error), tracks read state,
 * and fires listeners whenever the list changes. The Extension API (Pro/Shell) calls
 * {@link NotificationService.add} to push agent-generated notifications into the UI.
 *
 * @example
 * ```typescript
 * const svc = new NotificationService();
 * const unsub = svc.onChange(() => refreshBellBadge());
 * svc.add({ title: "Build complete", type: "info" });
 * unsub();
 * ```
 *
 * @since 0.1.0
 */

/** Severity level for a notification. */
export type NotificationType = "info" | "warning" | "error";

/**
 * A single notification entry.
 */
export interface CopilotNotification {
	/** Unique identifier (auto-generated if not provided). */
	id: string;
	/** Short summary shown as the primary label. */
	title: string;
	/** Optional detail text shown below the title. */
	body?: string;
	/** Severity level — controls the icon and accent colour. */
	type: NotificationType;
	/** Unix timestamp (ms) when the notification was created. */
	timestamp: number;
	/** Optional source label (e.g. `"agent"`, `"system"`). */
	source?: string;
	/** Whether the user has opened the panel and seen this notification. */
	read: boolean;
}

/** Options accepted by {@link NotificationService.add}. */
export interface AddNotificationOptions {
	/** Short summary. */
	title: string;
	/** Optional detail text. */
	body?: string;
	/** Severity level. Defaults to `"info"`. */
	type?: NotificationType;
	/** Optional source label. */
	source?: string;
}

/** Cleanup function returned by {@link NotificationService.onChange}. */
export type NotificationUnsubscribe = () => void;

/**
 * Service that manages the notification list and notifies registered listeners
 * whenever it changes.
 */
export class NotificationService {
	private notifications: CopilotNotification[] = [];
	private changeListeners = new Set<() => void>();
	private addListeners = new Set<(notification: CopilotNotification) => void>();

	// ─── Mutators ─────────────────────────────────────────────────────────────

	/**
	 * Add a new notification and notify all listeners.
	 *
	 * @param options - Notification content and metadata
	 * @returns The created {@link CopilotNotification}
	 *
	 * @example
	 * ```typescript
	 * const n = svc.add({ title: "Agent finished", type: "info" });
	 * ```
	 */
	add(options: AddNotificationOptions): CopilotNotification {
		const notification: CopilotNotification = {
			id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			title: options.title,
			body: options.body,
			type: options.type ?? "info",
			timestamp: Date.now(),
			source: options.source,
			read: false,
		};
		this.notifications.unshift(notification);
		this.emitChange();
		for (const listener of this.addListeners) {
			try { listener(notification); } catch (e) {
				console.error("[NotificationService] add listener error:", e);
			}
		}
		return notification;
	}

	/**
	 * Mark a single notification as dismissed (removed from the list).
	 *
	 * @param id - The notification ID to remove
	 */
	dismiss(id: string): void {
		const before = this.notifications.length;
		this.notifications = this.notifications.filter(n => n.id !== id);
		if (this.notifications.length !== before) this.emitChange();
	}

	/**
	 * Remove all notifications.
	 */
	clearAll(): void {
		if (this.notifications.length === 0) return;
		this.notifications = [];
		this.emitChange();
	}

	/**
	 * Mark all notifications as read (called when the panel is opened).
	 */
	markAllRead(): void {
		let changed = false;
		for (const n of this.notifications) {
			if (!n.read) { n.read = true; changed = true; }
		}
		if (changed) this.emitChange();
	}

	// ─── Accessors ────────────────────────────────────────────────────────────

	/**
	 * Return a snapshot of all notifications (newest first).
	 *
	 * @returns Immutable copy of the notification list
	 */
	getAll(): readonly CopilotNotification[] {
		return this.notifications;
	}

	/**
	 * Return the number of unread notifications.
	 *
	 * @returns Unread count
	 */
	getUnreadCount(): number {
		return this.notifications.filter(n => !n.read).length;
	}

	// ─── Listeners ────────────────────────────────────────────────────────────

	/**
	 * Register a listener that fires whenever the notification list changes.
	 *
	 * @param listener - Callback invoked on any change
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```typescript
	 * const unsub = svc.onChange(() => updateBadge(svc.getUnreadCount()));
	 * // Later:
	 * unsub();
	 * ```
	 */
	onChange(listener: () => void): NotificationUnsubscribe {
		this.changeListeners.add(listener);
		return () => { this.changeListeners.delete(listener); };
	}

	/**
	 * Register a listener that fires when a new notification is added.
	 * Used to trigger transient toasts without re-rendering the full panel.
	 *
	 * @param listener - Callback receiving the new notification
	 * @returns Unsubscribe function
	 */
	onAdd(listener: (notification: CopilotNotification) => void): NotificationUnsubscribe {
		this.addListeners.add(listener);
		return () => { this.addListeners.delete(listener); };
	}

	/**
	 * Remove all listeners. Call during plugin unload.
	 */
	destroy(): void {
		this.changeListeners.clear();
		this.addListeners.clear();
	}

	// ─── Internal ─────────────────────────────────────────────────────────────

	private emitChange(): void {
		for (const listener of this.changeListeners) {
			try { listener(); } catch (e) {
				console.error("[NotificationService] change listener error:", e);
			}
		}
	}
}
