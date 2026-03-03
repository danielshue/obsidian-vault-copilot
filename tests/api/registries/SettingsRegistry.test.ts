/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/api/registries/SettingsRegistry
 * @description Unit tests for SettingsRegistry — priority ordering, register, query, events.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsRegistry } from "../../../src/api/registries/SettingsRegistry";
import type { SettingsSectionRegistration } from "../../../src/api/types";

function makeSection(id: string, priority = 100): SettingsSectionRegistration {
	return {
		id,
		title: `Section ${id}`,
		priority,
		render: vi.fn(),
	};
}

describe("SettingsRegistry", () => {
	let registry: SettingsRegistry;

	beforeEach(() => {
		registry = new SettingsRegistry();
	});

	it("registers and retrieves by id", () => {
		const section = makeSection("sec-1");
		registry.register(section);
		expect(registry.get("sec-1")).toBe(section);
		expect(registry.has("sec-1")).toBe(true);
	});

	it("throws on duplicate id", () => {
		registry.register(makeSection("sec-1"));
		expect(() => registry.register(makeSection("sec-1"))).toThrow("already registered");
	});

	it("getAll returns sections sorted by priority", () => {
		registry.register(makeSection("low", 200));
		registry.register(makeSection("high", 10));
		registry.register(makeSection("mid", 100));
		const all = registry.getAll();
		expect(all.map(s => s.id)).toEqual(["high", "mid", "low"]);
	});

	it("unsubscribe removes the section", () => {
		const unsub = registry.register(makeSection("sec-1"));
		unsub();
		expect(registry.has("sec-1")).toBe(false);
	});

	it("clear empties the registry", () => {
		registry.register(makeSection("a"));
		registry.register(makeSection("b"));
		registry.clear();
		expect(registry.getAll()).toHaveLength(0);
	});

	it("onChange fires on register, unregister, and clear", () => {
		const listener = vi.fn();
		registry.onChange(listener);
		const unsub = registry.register(makeSection("a"));
		expect(listener).toHaveBeenCalledTimes(1);
		unsub();
		expect(listener).toHaveBeenCalledTimes(2);
		registry.register(makeSection("b"));
		listener.mockClear();
		registry.clear();
		expect(listener).toHaveBeenCalledOnce();
	});
});


