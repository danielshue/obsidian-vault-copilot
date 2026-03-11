/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/ui/notifications/NotificationService
 * @description Unit tests for NotificationService — add, dismiss, clearAll, listeners, and destroy.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "../../../src/ui/notifications/NotificationService";

describe("NotificationService", () => {
	let svc: NotificationService;

	beforeEach(() => {
		svc = new NotificationService();
	});

	// ─── add ─────────────────────────────────────────────────────────────────

	describe("add", () => {
		it("adds a notification and returns it", () => {
			const n = svc.add({ title: "Hello", type: "info" });
			expect(n.title).toBe("Hello");
			expect(n.type).toBe("info");
			expect(n.read).toBe(false);
			expect(n.id).toMatch(/^notif-/);
		});

		it("defaults type to info when not provided", () => {
			const n = svc.add({ title: "Test" });
			expect(n.type).toBe("info");
		});

		it("stores optional body and source", () => {
			const n = svc.add({ title: "T", body: "details", source: "agent" });
			expect(n.body).toBe("details");
			expect(n.source).toBe("agent");
		});

		it("prepends new notifications (newest first)", () => {
			svc.add({ title: "First" });
			svc.add({ title: "Second" });
			const all = svc.getAll();
			expect(all[0].title).toBe("Second");
			expect(all[1].title).toBe("First");
		});

		it("fires onChange listeners", () => {
			const listener = vi.fn();
			svc.onChange(listener);
			svc.add({ title: "X" });
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it("fires onAdd listeners with the new notification", () => {
			const addListener = vi.fn();
			svc.onAdd(addListener);
			const n = svc.add({ title: "Ping" });
			expect(addListener).toHaveBeenCalledTimes(1);
			expect(addListener).toHaveBeenCalledWith(n);
		});
	});

	// ─── dismiss ─────────────────────────────────────────────────────────────

	describe("dismiss", () => {
		it("removes a notification by id", () => {
			const n = svc.add({ title: "Remove me" });
			expect(svc.getAll()).toHaveLength(1);
			svc.dismiss(n.id);
			expect(svc.getAll()).toHaveLength(0);
		});

		it("fires onChange after dismissal", () => {
			const n = svc.add({ title: "X" });
			const listener = vi.fn();
			svc.onChange(listener);
			svc.dismiss(n.id);
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it("does nothing for unknown ids", () => {
			const listener = vi.fn();
			svc.onChange(listener);
			svc.dismiss("unknown-id");
			expect(listener).not.toHaveBeenCalled();
		});
	});

	// ─── clearAll ────────────────────────────────────────────────────────────

	describe("clearAll", () => {
		it("removes all notifications", () => {
			svc.add({ title: "A" });
			svc.add({ title: "B" });
			svc.clearAll();
			expect(svc.getAll()).toHaveLength(0);
		});

		it("fires onChange when clearing a non-empty list", () => {
			svc.add({ title: "A" });
			const listener = vi.fn();
			svc.onChange(listener);
			svc.clearAll();
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it("does not fire onChange when already empty", () => {
			const listener = vi.fn();
			svc.onChange(listener);
			svc.clearAll();
			expect(listener).not.toHaveBeenCalled();
		});
	});

	// ─── markAllRead ─────────────────────────────────────────────────────────

	describe("markAllRead", () => {
		it("marks all notifications as read", () => {
			svc.add({ title: "A" });
			svc.add({ title: "B" });
			expect(svc.getUnreadCount()).toBe(2);
			svc.markAllRead();
			expect(svc.getUnreadCount()).toBe(0);
		});

		it("fires onChange when notifications change from unread to read", () => {
			svc.add({ title: "A" });
			const listener = vi.fn();
			svc.onChange(listener);
			svc.markAllRead();
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it("does not fire onChange when all are already read", () => {
			svc.add({ title: "A" });
			svc.markAllRead();
			const listener = vi.fn();
			svc.onChange(listener);
			svc.markAllRead(); // second call — nothing changes
			expect(listener).not.toHaveBeenCalled();
		});
	});

	// ─── getUnreadCount ──────────────────────────────────────────────────────

	describe("getUnreadCount", () => {
		it("returns 0 for empty list", () => {
			expect(svc.getUnreadCount()).toBe(0);
		});

		it("counts only unread items", () => {
			svc.add({ title: "A" });
			svc.add({ title: "B" });
			svc.markAllRead();
			svc.add({ title: "C" });
			expect(svc.getUnreadCount()).toBe(1);
		});
	});

	// ─── onChange / unsubscribe ───────────────────────────────────────────────

	describe("onChange unsubscribe", () => {
		it("stops firing after unsubscribe", () => {
			const listener = vi.fn();
			const unsub = svc.onChange(listener);
			unsub();
			svc.add({ title: "X" });
			expect(listener).not.toHaveBeenCalled();
		});
	});

	// ─── onAdd / unsubscribe ─────────────────────────────────────────────────

	describe("onAdd unsubscribe", () => {
		it("stops firing after unsubscribe", () => {
			const listener = vi.fn();
			const unsub = svc.onAdd(listener);
			unsub();
			svc.add({ title: "X" });
			expect(listener).not.toHaveBeenCalled();
		});
	});

	// ─── destroy ─────────────────────────────────────────────────────────────

	describe("destroy", () => {
		it("clears all listeners so they no longer fire", () => {
			const changeListener = vi.fn();
			const addListener = vi.fn();
			svc.onChange(changeListener);
			svc.onAdd(addListener);
			svc.destroy();
			svc.add({ title: "After destroy" });
			expect(changeListener).not.toHaveBeenCalled();
			expect(addListener).not.toHaveBeenCalled();
		});
	});
});
