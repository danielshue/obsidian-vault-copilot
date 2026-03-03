/**
 * Global test setup for vault-copilot tests.
 */

import { vi } from "vitest";

// ── DOM stubs ─────────────────────────────────────────────────────────────────
// Minimal document/HTMLElement mocks for tests that import plugin code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalAny = global as any;

if (typeof globalAny.document === "undefined") {
	const mockElement = {
		rel: "",
		href: "",
		crossOrigin: "",
		remove: vi.fn(),
		appendChild: vi.fn(),
		style: {},
		classList: {
			add: vi.fn(),
			remove: vi.fn(),
			toggle: vi.fn(),
			contains: vi.fn().mockReturnValue(false),
		},
	};

	globalAny.document = {
		createElement: vi.fn().mockReturnValue({ ...mockElement }),
		head: {
			appendChild: vi.fn(),
			removeChild: vi.fn(),
		},
		body: {
			appendChild: vi.fn(),
			removeChild: vi.fn(),
		},
		createDocumentFragment: vi.fn().mockReturnValue({
			appendChild: vi.fn(),
		}),
	};
}

// ── window.moment mock ────────────────────────────────────────────────────────
const momentMock = vi.fn((input?: string | Date) => {
	const date = input ? new Date(input) : new Date();
	return {
		format: vi.fn().mockReturnValue(date.toISOString()),
		isValid: vi.fn().mockReturnValue(true),
		isSame: vi.fn().mockReturnValue(false),
		add: vi.fn().mockReturnThis(),
		subtract: vi.fn().mockReturnThis(),
		startOf: vi.fn().mockReturnThis(),
		endOf: vi.fn().mockReturnThis(),
		toDate: vi.fn().mockReturnValue(date),
		valueOf: vi.fn().mockReturnValue(date.getTime()),
	};
}) as unknown as typeof window.moment;

globalAny.window = globalAny.window ?? {};
global.window.moment = momentMock;
