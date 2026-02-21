/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/automation/AutomationIntegration.test
 * @description Unit tests for automation install/uninstall integration.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAutomationInstall, handleAutomationUninstall } from "../../automation/AutomationIntegration";
import type { MarketplaceExtension } from "../../extensions/types";

const getAutomationEngineMock = vi.fn();

vi.mock("../../automation/AutomationEngine", () => ({
	getAutomationEngine: (...args: unknown[]) => getAutomationEngineMock(...args),
}));

describe("AutomationIntegration", () => {
	const mockEngine = {
		registerAutomation: vi.fn(async () => undefined),
		runAutomation: vi.fn(async () => undefined),
		unregisterAutomation: vi.fn(async () => undefined),
	};

	const createManifest = (packageContents: MarketplaceExtension["packageContents"]): MarketplaceExtension => ({
		uniqueId: "sample-automation",
		displayTitle: "Sample Automation",
		kind: "automation",
		semanticVersion: "1.0.0",
		briefSummary: "automation test",
		creator: { displayName: "Test" },
		classificationTags: ["Automation"],
		searchKeywords: ["automation"],
		publishTimestamp: "2026-02-21T00:00:00Z",
		lastModifiedTimestamp: "2026-02-21T00:00:00Z",
		totalSizeBytes: "100",
		requiredPluginVersion: "0.1.0",
		webDetailPage: "https://example.com",
		packageContents,
		requiredCapabilities: [],
		dependsOnExtensions: [],
	});

	beforeEach(() => {
		vi.clearAllMocks();
		getAutomationEngineMock.mockReturnValue(mockEngine);
	});

	it("installs from .automation.md frontmatter and honors run-on-install", async () => {
		const app = {
			vault: {
				adapter: {
					read: vi.fn(async () => `---
name: Morning sync
enabled: true
run-on-install: true
triggers:
  - type: startup
actions:
  - type: run-agent
    agentId: morning-planner
---
`),
				},
			},
		} as any;
		const plugin = {} as any;
		const manifest = createManifest([
			{
				relativePath: "sample-automation.automation.md",
				downloadSource: "https://example.com/sample-automation.automation.md",
				targetLocation: ".obsidian/automations/sample-automation.automation.md",
			},
		]);

		await handleAutomationInstall(app, plugin, manifest);

		expect(mockEngine.registerAutomation).toHaveBeenCalledTimes(1);
		expect(mockEngine.registerAutomation).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "sample-automation",
				name: "Morning sync",
				sourcePath: ".obsidian/automations/sample-automation.automation.md",
				sourceFormat: "automation-markdown",
				enabled: true,
			})
		);
		expect(mockEngine.runAutomation).toHaveBeenCalledWith("sample-automation");
	});

	it("throws when markdown automation file is missing", async () => {
		const app = {
			vault: {
				adapter: {
					read: vi.fn(async () => ""),
				},
			},
		} as any;
		const plugin = {} as any;
		const manifest = createManifest([]);

		await expect(handleAutomationInstall(app, plugin, manifest)).rejects.toThrow(
			"No automation configuration file found in package contents (expected .automation.md)"
		);
		expect(mockEngine.registerAutomation).not.toHaveBeenCalled();
	});

	it("does not throw when uninstall fails", async () => {
		mockEngine.unregisterAutomation.mockRejectedValueOnce(new Error("boom"));
		const app = {} as any;
		const plugin = {} as any;

		await expect(handleAutomationUninstall(app, plugin, "sample-automation")).resolves.toBeUndefined();
	});
});
