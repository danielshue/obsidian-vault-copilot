/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/BasicPlugin
 * @description Smoke tests for BasicCopilotPlugin — lifecycle, Extension API exposure,
 * command registration, delegate wiring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules that require platform access before importing BasicPlugin
vi.mock("../src/copilot/providers/GitHubCopilotCliService", () => {
	const MockCliService = vi.fn(function (this: Record<string, unknown>) {
		this.isConnected = vi.fn().mockReturnValue(false);
		this.start = vi.fn().mockResolvedValue(undefined);
		this.stop = vi.fn().mockResolvedValue(undefined);
		this.sendMessage = vi.fn().mockResolvedValue("response");
		this.sendMessageStreaming = vi.fn().mockResolvedValue(undefined);
		this.getMessageHistory = vi.fn().mockReturnValue([]);
		this.clearHistory = vi.fn();
		this.loadSession = vi.fn().mockResolvedValue(undefined);
		this.createSession = vi.fn().mockResolvedValue("session-1");
		this.deleteSession = vi.fn().mockResolvedValue(undefined);
		this.setToolRegistry = vi.fn();
	});
	return { GitHubCopilotCliService: MockCliService };
});

vi.mock("../../src/copilot/providers/GitHubCopilotCliManager", () => {
	const MockCliManager = vi.fn(function (this: Record<string, unknown>) {
		this.check = vi.fn().mockResolvedValue({ installed: true });
	});
	return { GitHubCopilotCliManager: MockCliManager };
});

vi.mock("../src/utils/platform", () => ({
	supportsLocalProcesses: vi.fn().mockReturnValue(true),
	isMobile: false,
	isDesktop: true,
}));

vi.mock("../src/utils/pathUtils", () => ({
	expandHomePath: vi.fn().mockImplementation((p: string) => p),
}));

// Mock CopilotChatView (via the vault-copilot re-export shim)
vi.mock("../src/ui/ChatView", () => ({
	CopilotChatView: vi.fn(),
	COPILOT_VIEW_TYPE: "copilot-chat-view",
}));

// Mock BasicSettingTab
vi.mock("../src/BasicSettingTab", () => ({
	BasicSettingTab: vi.fn(),
}));

import BasicCopilotPlugin from "../src/main";
import { VaultCopilotExtensionAPIImpl } from "../src/api/VaultCopilotExtensionAPI";

// ── Minimal Obsidian mocks ─────────────────────────────────────────────────

function makeApp() {
	return {
		vault: {
			adapter: {
				getBasePath: vi.fn().mockReturnValue("/mock/vault"),
			},
		},
		workspace: {
			getLeavesOfType: vi.fn().mockReturnValue([]),
			getRightLeaf: vi.fn().mockReturnValue({
				setViewState: vi.fn().mockResolvedValue(undefined),
			}),
			revealLeaf: vi.fn(),
		},
	} as unknown as import("obsidian").App;
}

function makeManifest() {
	return {
		id: "obsidian-vault-copilot",
		name: "Vault Copilot",
		version: "0.1.0",
	};
}

describe("BasicCopilotPlugin", () => {
	let plugin: BasicCopilotPlugin;

	beforeEach(async () => {
		const app = makeApp();
		const manifest = makeManifest() as never;
		plugin = new BasicCopilotPlugin(app, manifest);

		// Mock Plugin base class methods
		plugin.loadData = vi.fn().mockResolvedValue({});
		plugin.saveData = vi.fn().mockResolvedValue(undefined);
		plugin.registerView = vi.fn();
		plugin.addCommand = vi.fn();
		plugin.addRibbonIcon = vi.fn();
		plugin.addSettingTab = vi.fn();

		await plugin.onload();
	});

	describe("lifecycle", () => {
		it("initializes settings with defaults", () => {
			expect(plugin.settings).toBeDefined();
			expect(plugin.settings.aiProvider).toBeDefined();
		});

		it("creates Extension API", () => {
			expect(plugin.extensionAPI).toBeInstanceOf(VaultCopilotExtensionAPIImpl);
		});

		it("exposes Extension API via .api getter", () => {
			expect(plugin.api).toBe(plugin.extensionAPI);
		});

		it("creates CLI service on desktop", () => {
			expect(plugin.githubCopilotCliService).toBeDefined();
		});

		it("registers the chat view", () => {
			expect(plugin.registerView).toHaveBeenCalledWith(
				"copilot-chat-view",
				expect.any(Function),
			);
		});

		it("registers core commands", () => {
			expect(plugin.addCommand).toHaveBeenCalledWith(
				expect.objectContaining({ id: "open-copilot-chat" }),
			);
			expect(plugin.addCommand).toHaveBeenCalledWith(
				expect.objectContaining({ id: "connect-copilot" }),
			);
		});

		it("adds ribbon icon", () => {
			expect(plugin.addRibbonIcon).toHaveBeenCalled();
		});

		it("adds settings tab", () => {
			expect(plugin.addSettingTab).toHaveBeenCalled();
		});
	});

	describe("Extension API delegate", () => {
		it("isConnected returns service state", () => {
			expect(plugin.api.isConnected()).toBe(false);
		});

		it("getSettings returns a copy of settings", () => {
			const settings = plugin.api.getSettings();
			expect(settings).toBeDefined();
			expect(typeof settings).toBe("object");
		});

		it("listSessions returns sessions from settings", async () => {
			plugin.settings.sessions = [
				{
					id: "s1",
					name: "Session 1",
					messages: [{ role: "user", content: "hello" }],
					archived: false,
					createdAt: Date.now(),
					lastUsedAt: Date.now(),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any,
			];
			const sessions = await plugin.api.listSessions();
			expect(sessions).toHaveLength(1);
			expect(sessions[0]).toEqual({
				id: "s1",
				name: "Session 1",
				messageCount: 1,
				archived: false,
			});
		});

		it("createSession adds a new session", async () => {
			plugin.settings.sessions = [];
			const session = await plugin.api.createSession("My Chat");
			expect(session.name).toBe("My Chat");
			expect(plugin.settings.sessions).toHaveLength(1);
			expect(plugin.saveData).toHaveBeenCalled();
		});

		it("updateSettings merges and saves", async () => {
			await plugin.api.updateSettings({ chatModel: "gpt-5" });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((plugin.settings as any).chatModel).toBe("gpt-5");
			expect(plugin.saveData).toHaveBeenCalled();
		});
	});

	describe("registry integration", () => {
		it("commands registered by Pro appear via addCommand", () => {
			const callsBefore = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.length;

			plugin.api.registerCommand({
				id: "pro-open-tracing",
				name: "Open tracing",
				callback: vi.fn(),
			});

			const callsAfter = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.length;
			expect(callsAfter).toBeGreaterThan(callsBefore);
		});

		it("views registered by Pro appear via registerView", () => {
			const callsBefore = (plugin.registerView as ReturnType<typeof vi.fn>).mock.calls.length;

			plugin.api.registerView({
				viewType: "extension-browser",
				displayText: "Extensions",
				factory: vi.fn(),
			});

			const callsAfter = (plugin.registerView as ReturnType<typeof vi.fn>).mock.calls.length;
			expect(callsAfter).toBeGreaterThan(callsBefore);
		});
	});

	describe("onunload", () => {
		it("calls destroy on Extension API", async () => {
			const destroySpy = vi.spyOn(plugin.extensionAPI, "destroy");
			await plugin.onunload();
			expect(destroySpy).toHaveBeenCalled();
		});
	});
});
