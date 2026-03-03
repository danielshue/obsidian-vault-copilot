/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/api/registries/RenderRegistry
 * @description Unit tests for RenderRegistry — priority ordering, processAll, type filtering.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RenderRegistry } from "../../../src/api/registries/RenderRegistry";
import type { RenderExtension } from "../../../src/api/types";

function makeExtension(id: string, type = "math", priority = 100): RenderExtension {
	return {
		id,
		type,
		priority,
		process: vi.fn().mockResolvedValue(undefined),
	};
}

describe("RenderRegistry", () => {
	let registry: RenderRegistry;

	beforeEach(() => {
		registry = new RenderRegistry();
	});

	it("registers and checks existence", () => {
		registry.register(makeExtension("katex"));
		expect(registry.has("katex")).toBe(true);
	});

	it("throws on duplicate id", () => {
		registry.register(makeExtension("katex"));
		expect(() => registry.register(makeExtension("katex"))).toThrow("already registered");
	});

	it("getAll returns extensions sorted by priority", () => {
		registry.register(makeExtension("low", "math", 200));
		registry.register(makeExtension("high", "math", 10));
		registry.register(makeExtension("mid", "diagram", 100));
		const all = registry.getAll();
		expect(all.map(e => e.id)).toEqual(["high", "mid", "low"]);
	});

	it("getByType filters extensions", () => {
		registry.register(makeExtension("katex", "math", 50));
		registry.register(makeExtension("mermaid", "diagram", 100));
		registry.register(makeExtension("highlight", "code", 150));
		expect(registry.getByType("math")).toHaveLength(1);
		expect(registry.getByType("math")[0].id).toBe("katex");
		expect(registry.getByType("diagram")).toHaveLength(1);
		expect(registry.getByType("nonexistent")).toHaveLength(0);
	});

	describe("processAll", () => {
		it("calls all extensions in priority order", async () => {
			const order: string[] = [];
			const ext1 = makeExtension("first", "math", 10);
			(ext1.process as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push("first"); });
			const ext2 = makeExtension("second", "math", 20);
			(ext2.process as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push("second"); });

			registry.register(ext2); // register out of order
			registry.register(ext1);

			const el = {} as HTMLElement;
			await registry.processAll(el);

			expect(order).toEqual(["first", "second"]);
			expect(ext1.process).toHaveBeenCalledWith(el);
			expect(ext2.process).toHaveBeenCalledWith(el);
		});

		it("continues processing if one extension throws", async () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const failing = makeExtension("fail", "math", 10);
			(failing.process as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("render error"));
			const passing = makeExtension("pass", "math", 20);

			registry.register(failing);
			registry.register(passing);

			await registry.processAll({} as HTMLElement);

			expect(passing.process).toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	});

	it("unsubscribe removes the extension", () => {
		const unsub = registry.register(makeExtension("katex"));
		unsub();
		expect(registry.has("katex")).toBe(false);
	});

	it("clear empties all extensions", () => {
		registry.register(makeExtension("a"));
		registry.register(makeExtension("b"));
		registry.clear();
		expect(registry.getAll()).toHaveLength(0);
	});

	it("onChange fires on register and unregister", () => {
		const listener = vi.fn();
		registry.onChange(listener);
		const unsub = registry.register(makeExtension("a"));
		expect(listener).toHaveBeenCalledTimes(1);
		unsub();
		expect(listener).toHaveBeenCalledTimes(2);
	});
});


