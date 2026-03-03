/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/api/registries/ProviderRegistry
 * @description Unit tests for ProviderRegistry — register, query, change events.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderRegistry } from "../../../src/api/registries/ProviderRegistry";
import type { AIProviderRegistration } from "../../../src/api/types";

function makeReg(id: string): AIProviderRegistration {
	return {
		id,
		name: `Provider ${id}`,
		type: "custom",
		factory: vi.fn(),
		capabilities: { streaming: true, tools: true, multiModal: false },
	};
}

describe("ProviderRegistry", () => {
	let registry: ProviderRegistry;

	beforeEach(() => {
		registry = new ProviderRegistry();
	});

	it("registers and retrieves a provider by ID", () => {
		const reg = makeReg("openai");
		registry.register(reg);
		expect(registry.get("openai")).toBe(reg);
		expect(registry.has("openai")).toBe(true);
	});

	it("throws on duplicate ID", () => {
		registry.register(makeReg("openai"));
		expect(() => registry.register(makeReg("openai"))).toThrow("already registered");
	});

	it("returns undefined for unknown ID", () => {
		expect(registry.get("missing")).toBeUndefined();
		expect(registry.has("missing")).toBe(false);
	});

	it("getAll returns all providers", () => {
		registry.register(makeReg("a"));
		registry.register(makeReg("b"));
		expect(registry.getAll()).toHaveLength(2);
	});

	it("unsubscribe removes provider", () => {
		const unsub = registry.register(makeReg("openai"));
		unsub();
		expect(registry.has("openai")).toBe(false);
		expect(registry.getAll()).toHaveLength(0);
	});

	it("onChange fires on register and unregister", () => {
		const listener = vi.fn();
		registry.onChange(listener);
		const unsub = registry.register(makeReg("openai"));
		expect(listener).toHaveBeenCalledTimes(1);
		unsub();
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("clear removes all providers and fires onChange", () => {
		const listener = vi.fn();
		registry.register(makeReg("a"));
		registry.register(makeReg("b"));
		registry.onChange(listener);
		registry.clear();
		expect(registry.getAll()).toHaveLength(0);
		expect(listener).toHaveBeenCalledOnce();
	});

	it("isolates onChange listener errors", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		registry.onChange(() => { throw new Error("fail"); });
		const good = vi.fn();
		registry.onChange(good);
		registry.register(makeReg("a"));
		expect(good).toHaveBeenCalledOnce();
		errorSpy.mockRestore();
	});
});


