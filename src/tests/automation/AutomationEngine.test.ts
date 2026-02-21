/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/automation/AutomationEngine.test
 * @description Unit tests for automation engine running-state behavior.
 */

import { describe, expect, it, vi } from "vitest";
import { AutomationEngine } from "../../automation/AutomationEngine";
import type { AutomationInstance } from "../../automation/types";

function createEngine(): AutomationEngine {
	const app = {
		vault: {
			adapter: {
				read: vi.fn(async () => ""),
				write: vi.fn(async () => undefined),
			},
			getAbstractFileByPath: vi.fn(() => null),
			create: vi.fn(async (path: string) => ({ path })),
			modify: vi.fn(async () => undefined),
		},
		workspace: {
			onLayoutReady: vi.fn((_cb: () => void) => undefined),
		},
		commands: {
			executeCommandById: vi.fn(() => true),
		},
	} as any;

	const plugin = {
		registerEvent: vi.fn(),
		agentCache: {
			getFullAgent: vi.fn(async () => ({
				name: "test-agent",
				description: "A test agent",
				instructions: "You are a test agent.",
			})),
			getAgents: vi.fn(() => [{ name: "test-agent" }]),
		},
		getActiveService: vi.fn(() => null),
	} as any;

	return new AutomationEngine(app, plugin);
}

describe("AutomationEngine running-state", () => {
	it("tracks running state during in-flight execution and clears after completion", async () => {
		const engine = createEngine();
		const automation: AutomationInstance = {
			id: "running-state-test",
			name: "Running state test",
			config: {
				triggers: [
					{ type: "startup", delay: 40 },
				],
				actions: [
					{ type: "run-agent", agentId: "test-agent" },
				],
			},
			enabled: false,
			executionCount: 0,
		};

		await engine.registerAutomation(automation);

		const runPromise = engine.runAutomation("running-state-test");
		expect(engine.isAutomationRunning("running-state-test")).toBe(true);
		expect(engine.getRunningAutomationIds()).toContain("running-state-test");

		await runPromise;

		expect(engine.isAutomationRunning("running-state-test")).toBe(false);
		expect(engine.getRunningAutomationIds()).not.toContain("running-state-test");
	});
});
