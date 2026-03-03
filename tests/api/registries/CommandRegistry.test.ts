/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/api/registries/CommandRegistry
 * @description Unit tests for CommandRegistry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommandRegistry } from "../../../src/api/registries/CommandRegistry";
import type { CommandRegistration } from "../../../src/api/types";

function makeCommand(id: string): CommandRegistration {
	return {
		id,
		name: `Command ${id}`,
		callback: vi.fn(),
	};
}

describe("CommandRegistry", () => {
	let registry: CommandRegistry;

	beforeEach(() => {
		registry = new CommandRegistry();
	});

	it("registers and retrieves by id", () => {
		const cmd = makeCommand("do-something");
		registry.register(cmd);
		expect(registry.get("do-something")).toBe(cmd);
		expect(registry.has("do-something")).toBe(true);
	});

	it("throws on duplicate id", () => {
		registry.register(makeCommand("cmd"));
		expect(() => registry.register(makeCommand("cmd"))).toThrow("already registered");
	});

	it("getAll returns all commands", () => {
		registry.register(makeCommand("a"));
		registry.register(makeCommand("b"));
		registry.register(makeCommand("c"));
		expect(registry.getAll()).toHaveLength(3);
	});

	it("unsubscribe removes the command", () => {
		const unsub = registry.register(makeCommand("cmd"));
		unsub();
		expect(registry.has("cmd")).toBe(false);
		expect(registry.get("cmd")).toBeUndefined();
	});

	it("clear empties all commands", () => {
		registry.register(makeCommand("a"));
		registry.register(makeCommand("b"));
		registry.clear();
		expect(registry.getAll()).toHaveLength(0);
	});

	it("onChange fires on register and unregister", () => {
		const listener = vi.fn();
		registry.onChange(listener);
		const unsub = registry.register(makeCommand("cmd"));
		expect(listener).toHaveBeenCalledTimes(1);
		unsub();
		expect(listener).toHaveBeenCalledTimes(2);
	});
});


