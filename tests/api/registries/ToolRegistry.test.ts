/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/api/registries/ToolRegistry
 * @description Unit tests for ToolRegistry — register, unregister, query, change events.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRegistry } from "../../../src/api/registries/ToolRegistry";
import type { ToolProvider } from "../../../src/api/types";

function makeProvider(id: string, toolNames: string[] = ["tool_a"]): ToolProvider {
	return {
		id,
		tools: toolNames.map(name => ({
			name,
			description: `${name} description`,
			parameters: { type: "object" as const, properties: {} },
		})),
		handler: vi.fn().mockResolvedValue({ result: "ok" }),
	};
}

describe("ToolRegistry", () => {
	let registry: ToolRegistry;

	beforeEach(() => {
		registry = new ToolRegistry();
	});

	describe("register", () => {
		it("registers a tool provider and returns unsubscribe", () => {
			const unsub = registry.register(makeProvider("p1"));
			expect(typeof unsub).toBe("function");
			expect(registry.getAllProviders()).toHaveLength(1);
		});

		it("throws on duplicate provider ID", () => {
			registry.register(makeProvider("p1"));
			expect(() => registry.register(makeProvider("p1"))).toThrow("already registered");
		});

		it("allows re-registration after unsubscribe", () => {
			const unsub = registry.register(makeProvider("p1"));
			unsub();
			expect(() => registry.register(makeProvider("p1"))).not.toThrow();
		});
	});

	describe("getAllTools", () => {
		it("returns empty array when no providers registered", () => {
			expect(registry.getAllTools()).toEqual([]);
		});

		it("returns flat array of all tools from all providers", () => {
			registry.register(makeProvider("p1", ["tool_a", "tool_b"]));
			registry.register(makeProvider("p2", ["tool_c"]));
			const tools = registry.getAllTools();
			expect(tools).toHaveLength(3);
			expect(tools.map(t => t.name)).toEqual(["tool_a", "tool_b", "tool_c"]);
		});
	});

	describe("getAllProviders", () => {
		it("returns all registered providers", () => {
			registry.register(makeProvider("p1"));
			registry.register(makeProvider("p2"));
			expect(registry.getAllProviders()).toHaveLength(2);
		});
	});

	describe("getHandler", () => {
		it("returns the handler for a registered tool", () => {
			const provider = makeProvider("p1", ["my_tool"]);
			registry.register(provider);
			expect(registry.getHandler("my_tool")).toBe(provider.handler);
		});

		it("returns undefined for an unregistered tool", () => {
			expect(registry.getHandler("nonexistent")).toBeUndefined();
		});

		it("returns the correct handler when multiple providers exist", () => {
			const p1 = makeProvider("p1", ["tool_a"]);
			const p2 = makeProvider("p2", ["tool_b"]);
			registry.register(p1);
			registry.register(p2);
			expect(registry.getHandler("tool_a")).toBe(p1.handler);
			expect(registry.getHandler("tool_b")).toBe(p2.handler);
		});
	});

	describe("has", () => {
		it("returns true for registered tool", () => {
			registry.register(makeProvider("p1", ["my_tool"]));
			expect(registry.has("my_tool")).toBe(true);
		});

		it("returns false for unregistered tool", () => {
			expect(registry.has("nonexistent")).toBe(false);
		});

		it("returns false after unsubscribe", () => {
			const unsub = registry.register(makeProvider("p1", ["my_tool"]));
			unsub();
			expect(registry.has("my_tool")).toBe(false);
		});
	});

	describe("onChange", () => {
		it("fires on register", () => {
			const listener = vi.fn();
			registry.onChange(listener);
			registry.register(makeProvider("p1"));
			expect(listener).toHaveBeenCalledOnce();
		});

		it("fires on unsubscribe", () => {
			const listener = vi.fn();
			registry.onChange(listener);
			const unsub = registry.register(makeProvider("p1"));
			listener.mockClear();
			unsub();
			expect(listener).toHaveBeenCalledOnce();
		});

		it("stops firing after onChange unsubscribe", () => {
			const listener = vi.fn();
			const off = registry.onChange(listener);
			off();
			registry.register(makeProvider("p1"));
			expect(listener).not.toHaveBeenCalled();
		});

		it("isolates listener errors", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			registry.onChange(() => { throw new Error("boom"); });
			const goodListener = vi.fn();
			registry.onChange(goodListener);
			registry.register(makeProvider("p1"));
			expect(goodListener).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	});

	describe("clear", () => {
		it("removes all providers", () => {
			registry.register(makeProvider("p1"));
			registry.register(makeProvider("p2"));
			registry.clear();
			expect(registry.getAllProviders()).toHaveLength(0);
			expect(registry.getAllTools()).toHaveLength(0);
		});

		it("fires onChange on clear", () => {
			const listener = vi.fn();
			registry.onChange(listener);
			registry.register(makeProvider("p1"));
			listener.mockClear();
			registry.clear();
			expect(listener).toHaveBeenCalledOnce();
		});
	});
});


