/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/api/registries/ContextRegistry
 * @description Unit tests for ContextRegistry — priority ordering, collectContext, error isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextRegistry } from "../../../src/api/registries/ContextRegistry";
import type { ContextProviderRegistration } from "../../../src/api/types";
import type { App } from "obsidian";

const mockApp = {} as App;

function makeProvider(id: string, priority = 100, result = "context from " + id): ContextProviderRegistration {
	return {
		id,
		priority,
		provider: vi.fn().mockResolvedValue(result),
	};
}

describe("ContextRegistry", () => {
	let registry: ContextRegistry;

	beforeEach(() => {
		registry = new ContextRegistry();
	});

	it("registers and checks existence", () => {
		registry.register(makeProvider("p1"));
		expect(registry.has("p1")).toBe(true);
	});

	it("throws on duplicate id", () => {
		registry.register(makeProvider("p1"));
		expect(() => registry.register(makeProvider("p1"))).toThrow("already registered");
	});

	it("getAll returns providers sorted by priority", () => {
		registry.register(makeProvider("low", 200));
		registry.register(makeProvider("high", 10));
		registry.register(makeProvider("mid", 100));
		expect(registry.getAll().map(p => p.id)).toEqual(["high", "mid", "low"]);
	});

	describe("collectContext", () => {
		it("returns empty string with no providers", async () => {
			const result = await registry.collectContext(mockApp);
			expect(result).toBe("");
		});

		it("concatenates context from all providers in priority order", async () => {
			registry.register(makeProvider("second", 20, "B"));
			registry.register(makeProvider("first", 10, "A"));
			registry.register(makeProvider("third", 30, "C"));

			const result = await registry.collectContext(mockApp);
			expect(result).toBe("A\n\nB\n\nC");
		});

		it("passes the app instance to each provider", async () => {
			const prov = makeProvider("p1");
			registry.register(prov);
			await registry.collectContext(mockApp);
			expect(prov.provider).toHaveBeenCalledWith(mockApp);
		});

		it("skips null/empty results", async () => {
			registry.register(makeProvider("empty", 10, ""));
			registry.register({
				id: "null",
				priority: 20,
				provider: vi.fn().mockResolvedValue(null),
			});
			registry.register(makeProvider("real", 30, "data"));

			const result = await registry.collectContext(mockApp);
			expect(result).toBe("data");
		});

		it("continues on provider error", async () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			registry.register({
				id: "fail",
				priority: 10,
				provider: vi.fn().mockRejectedValue(new Error("boom")),
			});
			registry.register(makeProvider("good", 20, "ok"));

			const result = await registry.collectContext(mockApp);
			expect(result).toBe("ok");
			expect(errorSpy).toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	});

	it("unsubscribe removes the provider", () => {
		const unsub = registry.register(makeProvider("p1"));
		unsub();
		expect(registry.has("p1")).toBe(false);
	});

	it("clear empties all providers", () => {
		registry.register(makeProvider("a"));
		registry.register(makeProvider("b"));
		registry.clear();
		expect(registry.getAll()).toHaveLength(0);
	});

	it("onChange fires on register and unregister", () => {
		const listener = vi.fn();
		registry.onChange(listener);
		const unsub = registry.register(makeProvider("p1"));
		expect(listener).toHaveBeenCalledTimes(1);
		unsub();
		expect(listener).toHaveBeenCalledTimes(2);
	});
});


