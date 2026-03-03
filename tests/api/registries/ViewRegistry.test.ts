/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/api/registries/ViewRegistry
 * @description Unit tests for ViewRegistry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ViewRegistry } from "../../../src/api/registries/ViewRegistry";
import type { ViewRegistration } from "../../../src/api/types";

function makeView(viewType: string): ViewRegistration {
	return {
		viewType,
		displayText: `View: ${viewType}`,
		icon: "file",
		factory: vi.fn(),
	};
}

describe("ViewRegistry", () => {
	let registry: ViewRegistry;

	beforeEach(() => {
		registry = new ViewRegistry();
	});

	it("registers and retrieves by viewType", () => {
		const view = makeView("my-view");
		registry.register(view);
		expect(registry.get("my-view")).toBe(view);
		expect(registry.has("my-view")).toBe(true);
	});

	it("throws on duplicate viewType", () => {
		registry.register(makeView("my-view"));
		expect(() => registry.register(makeView("my-view"))).toThrow("already registered");
	});

	it("getAll returns all views", () => {
		registry.register(makeView("v1"));
		registry.register(makeView("v2"));
		expect(registry.getAll()).toHaveLength(2);
	});

	it("unsubscribe removes the view", () => {
		const unsub = registry.register(makeView("v1"));
		unsub();
		expect(registry.has("v1")).toBe(false);
	});

	it("clear empties the registry", () => {
		registry.register(makeView("v1"));
		registry.register(makeView("v2"));
		registry.clear();
		expect(registry.getAll()).toHaveLength(0);
	});

	it("onChange notifies on register and unregister", () => {
		const listener = vi.fn();
		registry.onChange(listener);
		const unsub = registry.register(makeView("v1"));
		expect(listener).toHaveBeenCalledTimes(1);
		unsub();
		expect(listener).toHaveBeenCalledTimes(2);
	});
});


