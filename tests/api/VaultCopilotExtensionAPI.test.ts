/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/api/VaultCopilotExtensionAPI
 * @description Unit tests for VaultCopilotExtensionAPIImpl — delegates, registries, events, destroy.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	VaultCopilotExtensionAPIImpl,
	type VaultCopilotExtensionAPIDelegate,
} from "../../src/api/VaultCopilotExtensionAPI";
import type {
	ToolProvider,
	AIProviderRegistration,
	ContextProviderRegistration,
	SettingsSectionRegistration,
	ViewRegistration,
	CommandRegistration,
	RenderExtension,
	StatusBarRegistration,
} from "../../src/api/types";

// ── Mock delegate ────────────────────────────────────────────────────────────

function makeDelegate(): VaultCopilotExtensionAPIDelegate {
	return {
		isConnected: vi.fn().mockReturnValue(true),
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		sendMessage: vi.fn().mockResolvedValue("response"),
		sendMessageStreaming: vi.fn().mockResolvedValue(undefined),
		getMessageHistory: vi.fn().mockReturnValue([]),
		clearHistory: vi.fn().mockResolvedValue(undefined),
		listSessions: vi.fn().mockResolvedValue([]),
		getActiveSessionId: vi.fn().mockReturnValue("session-1"),
		createSession: vi.fn().mockResolvedValue({ id: "s1", name: "New" }),
		loadSession: vi.fn().mockResolvedValue(undefined),
		archiveSession: vi.fn().mockResolvedValue(undefined),
		deleteSession: vi.fn().mockResolvedValue(undefined),
		renameSession: vi.fn().mockResolvedValue(undefined),
		getSettings: vi.fn().mockReturnValue({ theme: "dark" }),
		updateSettings: vi.fn().mockResolvedValue(undefined),
	};
}

// ── Factories ────────────────────────────────────────────────────────────────

function makeToolProvider(): ToolProvider {
	return {
		id: "pro-tools",
		tools: [{ name: "read_note", description: "Read a note", parameters: { type: "object", properties: {} } }],
		handler: vi.fn().mockResolvedValue({ content: "data" }),
	};
}

function makeAIProvider(): AIProviderRegistration {
	return {
		id: "openai",
		name: "OpenAI",
		type: "openai",
		capabilities: { streaming: true, toolCalling: true },
		factory: vi.fn(),
	};
}

function makeContextProvider(): ContextProviderRegistration {
	return {
		id: "vault-context",
		name: "Vault Context",
		priority: 50,
		provider: vi.fn().mockResolvedValue("active note context"),
	};
}

function makeSettingsSection(): SettingsSectionRegistration {
	return {
		id: "pro-settings",
		title: "Pro Features",
		priority: 200,
		render: vi.fn(),
	};
}

function makeView(): ViewRegistration {
	return {
		viewType: "extension-browser",
		displayText: "Extensions",
		icon: "puzzle",
		factory: vi.fn(),
	};
}

function makeCommand(): CommandRegistration {
	return {
		id: "open-tracing",
		name: "Open tracing",
		callback: vi.fn(),
	};
}

function makeRenderExtension(): RenderExtension {
	return {
		id: "katex",
		type: "math",
		priority: 10,
		process: vi.fn().mockResolvedValue(undefined),
	};
}

function makeStatusBar(): StatusBarRegistration {
	return {
		id: "connection-status",
		priority: 10,
		render: vi.fn(),
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("VaultCopilotExtensionAPIImpl", () => {
	let api: VaultCopilotExtensionAPIImpl;
	let delegate: VaultCopilotExtensionAPIDelegate;

	beforeEach(() => {
		delegate = makeDelegate();
		api = new VaultCopilotExtensionAPIImpl({ delegate });
	});

	// ===== Delegate passthrough =====

	describe("delegate methods", () => {
		it("isConnected delegates", () => {
			expect(api.isConnected()).toBe(true);
			expect(delegate.isConnected).toHaveBeenCalled();
		});

		it("connect delegates", async () => {
			await api.connect();
			expect(delegate.connect).toHaveBeenCalled();
		});

		it("disconnect delegates", async () => {
			await api.disconnect();
			expect(delegate.disconnect).toHaveBeenCalled();
		});

		it("sendMessage delegates with prompt", async () => {
			const result = await api.sendMessage("Hello");
			expect(delegate.sendMessage).toHaveBeenCalledWith("Hello");
			expect(result).toBe("response");
		});

		it("sendMessageStreaming delegates", async () => {
			const onDelta = vi.fn();
			const onComplete = vi.fn();
			await api.sendMessageStreaming("Hi", onDelta, onComplete);
			expect(delegate.sendMessageStreaming).toHaveBeenCalledWith("Hi", onDelta, onComplete);
		});

		it("getMessageHistory delegates", () => {
			expect(api.getMessageHistory()).toEqual([]);
			expect(delegate.getMessageHistory).toHaveBeenCalled();
		});

		it("clearHistory delegates", async () => {
			await api.clearHistory();
			expect(delegate.clearHistory).toHaveBeenCalled();
		});

		it("session methods delegate", async () => {
			await api.listSessions();
			expect(delegate.listSessions).toHaveBeenCalled();

			expect(api.getActiveSessionId()).toBe("session-1");

			await api.createSession("test");
			expect(delegate.createSession).toHaveBeenCalledWith("test");

			await api.loadSession("s1");
			expect(delegate.loadSession).toHaveBeenCalledWith("s1");

			await api.archiveSession("s1");
			expect(delegate.archiveSession).toHaveBeenCalledWith("s1");

			await api.deleteSession("s1");
			expect(delegate.deleteSession).toHaveBeenCalledWith("s1");

			await api.renameSession("s1", "New Name");
			expect(delegate.renameSession).toHaveBeenCalledWith("s1", "New Name");
		});

		it("settings methods delegate", async () => {
			expect(api.getSettings()).toEqual({ theme: "dark" });
			await api.updateSettings({ theme: "light" });
			expect(delegate.updateSettings).toHaveBeenCalledWith({ theme: "light" });
		});
	});

	// ===== Registration =====

	describe("registerToolProvider", () => {
		it("registers tools and returns unsubscribe", () => {
			const unsub = api.registerToolProvider(makeToolProvider());
			expect(api.toolRegistry.getAllTools()).toHaveLength(1);
			unsub();
			expect(api.toolRegistry.getAllTools()).toHaveLength(0);
		});
	});

	describe("registerAIProvider", () => {
		it("registers provider and returns unsubscribe", () => {
			const unsub = api.registerAIProvider(makeAIProvider());
			expect(api.providerRegistry.has("openai")).toBe(true);
			unsub();
			expect(api.providerRegistry.has("openai")).toBe(false);
		});
	});

	describe("registerContextProvider", () => {
		it("registers context provider", () => {
			const unsub = api.registerContextProvider(makeContextProvider());
			expect(api.contextRegistry.has("vault-context")).toBe(true);
			unsub();
			expect(api.contextRegistry.has("vault-context")).toBe(false);
		});
	});

	describe("registerSettingsSection", () => {
		it("registers settings section", () => {
			const unsub = api.registerSettingsSection(makeSettingsSection());
			expect(api.settingsRegistry.has("pro-settings")).toBe(true);
			unsub();
			expect(api.settingsRegistry.has("pro-settings")).toBe(false);
		});
	});

	describe("registerView", () => {
		it("registers view", () => {
			const unsub = api.registerView(makeView());
			expect(api.viewRegistry.has("extension-browser")).toBe(true);
			unsub();
			expect(api.viewRegistry.has("extension-browser")).toBe(false);
		});
	});

	describe("registerCommand", () => {
		it("registers command", () => {
			const unsub = api.registerCommand(makeCommand());
			expect(api.commandRegistry.has("open-tracing")).toBe(true);
			unsub();
			expect(api.commandRegistry.has("open-tracing")).toBe(false);
		});
	});

	describe("registerRenderExtension", () => {
		it("registers render extension", () => {
			const unsub = api.registerRenderExtension(makeRenderExtension());
			expect(api.renderRegistry.has("katex")).toBe(true);
			unsub();
			expect(api.renderRegistry.has("katex")).toBe(false);
		});
	});

	describe("registerStatusBarItem", () => {
		it("registers status bar item", () => {
			const unsub = api.registerStatusBarItem(makeStatusBar());
			expect(typeof unsub).toBe("function");
			unsub();
		});

		it("throws on duplicate status bar item", () => {
			api.registerStatusBarItem(makeStatusBar());
			expect(() => api.registerStatusBarItem(makeStatusBar())).toThrow("already registered");
		});
	});

	// ===== Events =====

	describe("event subscriptions", () => {
		it("onSettingsChange fires when emitted", () => {
			const listener = vi.fn();
			api.onSettingsChange(listener);
			api.settingsEvents.emit({ changedKeys: ["theme"] });
			expect(listener).toHaveBeenCalledWith({ changedKeys: ["theme"] });
		});

		it("onSessionChange fires when emitted", () => {
			const listener = vi.fn();
			api.onSessionChange(listener);
			api.sessionEvents.emit({ type: "created", sessionId: "s1" });
			expect(listener).toHaveBeenCalledWith({ type: "created", sessionId: "s1" });
		});

		it("onMessage fires when emitted", () => {
			const listener = vi.fn();
			api.onMessage(listener);
			api.messageEvents.emit({ role: "user", content: "hello", sessionId: "s1" });
			expect(listener).toHaveBeenCalledWith({ role: "user", content: "hello", sessionId: "s1" });
		});

		it("onProviderChange fires when emitted", () => {
			const listener = vi.fn();
			api.onProviderChange(listener);
			api.providerEvents.emit({ previousId: "copilot", newId: "openai" });
			expect(listener).toHaveBeenCalledWith({ previousId: "copilot", newId: "openai" });
		});

		it("event unsubscribe stops delivery", () => {
			const listener = vi.fn();
			const unsub = api.onSettingsChange(listener);
			unsub();
			api.settingsEvents.emit({ changedKeys: ["theme"] });
			expect(listener).not.toHaveBeenCalled();
		});

		it("event listener errors are isolated", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			api.onSettingsChange(() => { throw new Error("oops"); });
			const good = vi.fn();
			api.onSettingsChange(good);
			api.settingsEvents.emit({ changedKeys: ["theme"] });
			expect(good).toHaveBeenCalledOnce();
			errorSpy.mockRestore();
		});
	});

	// ===== Lifecycle =====

	describe("destroy", () => {
		it("clears all registries and event buses", () => {
			api.registerToolProvider(makeToolProvider());
			api.registerAIProvider(makeAIProvider());
			api.registerContextProvider(makeContextProvider());
			api.registerSettingsSection(makeSettingsSection());
			api.registerView(makeView());
			api.registerCommand(makeCommand());
			api.registerRenderExtension(makeRenderExtension());
			api.registerStatusBarItem(makeStatusBar());

			const settingsListener = vi.fn();
			api.onSettingsChange(settingsListener);

			api.destroy();

			expect(api.toolRegistry.getAllTools()).toHaveLength(0);
			expect(api.providerRegistry.getAll()).toHaveLength(0);
			expect(api.contextRegistry.getAll()).toHaveLength(0);
			expect(api.settingsRegistry.getAll()).toHaveLength(0);
			expect(api.viewRegistry.getAll()).toHaveLength(0);
			expect(api.commandRegistry.getAll()).toHaveLength(0);
			expect(api.renderRegistry.getAll()).toHaveLength(0);

			// Events should no longer fire
			api.settingsEvents.emit({ changedKeys: ["test"] });
			expect(settingsListener).not.toHaveBeenCalled();
		});
	});

	// ===== Multi-plugin scenario =====

	describe("multi-plugin registration", () => {
		it("supports multiple plugins registering simultaneously", () => {
			const proTools = makeToolProvider();
			const thirdPartyTools: ToolProvider = {
				id: "third-party",
				tools: [{ name: "custom_tool", description: "Custom", parameters: { type: "object", properties: {} } }],
				handler: vi.fn(),
			};

			const unsub1 = api.registerToolProvider(proTools);
			const unsub2 = api.registerToolProvider(thirdPartyTools);

			expect(api.toolRegistry.getAllTools()).toHaveLength(2);
			expect(api.toolRegistry.getAllProviders()).toHaveLength(2);

			// Unsubscribing one doesn't affect the other
			unsub1();
			expect(api.toolRegistry.getAllTools()).toHaveLength(1);
			expect(api.toolRegistry.getAllTools()[0].name).toBe("custom_tool");

			unsub2();
			expect(api.toolRegistry.getAllTools()).toHaveLength(0);
		});

		it("supports registering across all registries at once", () => {
			const unsubs = [
				api.registerToolProvider(makeToolProvider()),
				api.registerAIProvider(makeAIProvider()),
				api.registerContextProvider(makeContextProvider()),
				api.registerSettingsSection(makeSettingsSection()),
				api.registerView(makeView()),
				api.registerCommand(makeCommand()),
				api.registerRenderExtension(makeRenderExtension()),
				api.registerStatusBarItem(makeStatusBar()),
			];

			// All registered
			expect(api.toolRegistry.getAllProviders()).toHaveLength(1);
			expect(api.providerRegistry.getAll()).toHaveLength(1);
			expect(api.contextRegistry.getAll()).toHaveLength(1);
			expect(api.settingsRegistry.getAll()).toHaveLength(1);
			expect(api.viewRegistry.getAll()).toHaveLength(1);
			expect(api.commandRegistry.getAll()).toHaveLength(1);
			expect(api.renderRegistry.getAll()).toHaveLength(1);

			// Cleanup all
			unsubs.forEach(fn => fn());

			expect(api.toolRegistry.getAllProviders()).toHaveLength(0);
			expect(api.providerRegistry.getAll()).toHaveLength(0);
			expect(api.contextRegistry.getAll()).toHaveLength(0);
			expect(api.settingsRegistry.getAll()).toHaveLength(0);
			expect(api.viewRegistry.getAll()).toHaveLength(0);
			expect(api.commandRegistry.getAll()).toHaveLength(0);
			expect(api.renderRegistry.getAll()).toHaveLength(0);
		});
	});
});

