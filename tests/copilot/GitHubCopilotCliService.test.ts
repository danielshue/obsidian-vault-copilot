/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/copilot/GitHubCopilotCliService
 * @description Unit tests for the base `GitHubCopilotCliService` class (Basic tier).
 *
 * Tests the template hooks, initial state, config management, and event-handler
 * wiring WITHOUT spawning a real Copilot CLI process. All SDK and Pro-side
 * dependencies are mocked.
 *
 * @see {@link GitHubCopilotCliService}
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks (must be declared before imports) ────────────────────────────────

vi.mock("@github/copilot-sdk", () => ({
	CopilotClient: vi.fn().mockImplementation(() => ({
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		forceStop: vi.fn().mockResolvedValue(undefined),
		createSession: vi.fn().mockResolvedValue({
			sessionId: "sess_test",
			on: vi.fn().mockReturnValue(vi.fn()),
			destroy: vi.fn().mockResolvedValue(undefined),
			abort: vi.fn().mockResolvedValue(undefined),
			getMessages: vi.fn().mockResolvedValue([]),
			sendAndWait: vi.fn().mockResolvedValue({ data: { content: "reply" } }),
			send: vi.fn().mockResolvedValue(undefined),
			rpc: { compaction: { compact: vi.fn().mockResolvedValue({ success: true, tokensRemoved: 0, messagesRemoved: 0 }) } },
		}),
		resumeSession: vi.fn().mockResolvedValue({
			sessionId: "sess_test",
			on: vi.fn().mockReturnValue(vi.fn()),
			destroy: vi.fn().mockResolvedValue(undefined),
			getMessages: vi.fn().mockResolvedValue([]),
		}),
		listSessions: vi.fn().mockResolvedValue([]),
		deleteSession: vi.fn().mockResolvedValue(undefined),
		listModels: vi.fn().mockResolvedValue([]),
	})),
	CopilotSession: vi.fn(),
	approveAll: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn().mockReturnValue(false),
}));

// Mock Pro-side TracingService (path from test to Pro src; relative to test file)
vi.mock("../../../src/copilot/TracingService", () => ({
	getTracingService: vi.fn().mockReturnValue({
		addSdkLog: vi.fn(),
	}),
}));

// Mock vault-copilot-local modules (relative from vault-copilot/tests/copilot/ to vault-copilot/src/)
vi.mock("../../src/copilot/providers/BasicToolFactory", () => ({
	createBasicTools: vi.fn().mockReturnValue([
		{ name: "get_active_note" },
		{ name: "open_note" },
		{ name: "batch_read_notes" },
		{ name: "fetch_web_page" },
		{ name: "web_search" },
	]),
}));

vi.mock("../../src/copilot/providers/BasicSystemPromptBuilder", () => ({
	buildBasicSystemPrompt: vi.fn().mockReturnValue("Base system prompt content"),
}));

vi.mock("../../src/copilot/providers/SessionEventTracer", () => {
	class SessionEventTracer {
		handleEvent = vi.fn();
	}
	return { SessionEventTracer };
});

vi.mock("../../src/copilot/providers/ConsoleInterceptor", () => ({
	interceptConsoleLogs: vi.fn(),
}));

vi.mock("../../src/copilot/logging/LogTaxonomy", () => ({
	LOG_SOURCES: {
		SESSION_LIFECYCLE: "session-lifecycle",
		COPILOT_PROMPT: "copilot-prompt",
		COPILOT_RESPONSE: "copilot-response",
		COPILOT_ERROR: "copilot-error",
		COPILOT_EVENT: "copilot-event",
	},
}));

// ── Import under test (after vi.mock declarations) ─────────────────────────

import { GitHubCopilotCliService } from "../../src/copilot/providers/GitHubCopilotCliService";
import type { GitHubCopilotCliConfig } from "../../src/copilot/providers/GitHubCopilotCliService";
import { createBasicTools } from "../../src/copilot/providers/BasicToolFactory";
import { buildBasicSystemPrompt } from "../../src/copilot/providers/BasicSystemPromptBuilder";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Minimal Obsidian App mock for tests. */
function makeApp() {
	return {
		vault: {
			getName: vi.fn().mockReturnValue("TestVault"),
			adapter: { getBasePath: vi.fn().mockReturnValue("/vault") },
		},
		workspace: {
			getActiveFile: vi.fn().mockReturnValue(null),
		},
	} as unknown as import("obsidian").App;
}

/** Minimal config for Basic tier. */
function makeConfig(overrides: Partial<GitHubCopilotCliConfig> = {}): GitHubCopilotCliConfig {
	return {
		model: "gpt-4.1",
		streaming: true,
		vaultPath: "/test/vault",
		...overrides,
	};
}

/**
 * Test subclass that exposes the protected template hooks for direct assertions.
 * @internal
 */
class TestableService extends GitHubCopilotCliService {
	/** Expose buildTools() for testing the Base implementation. */
	exposeBuildTools(): object[] {
		return this.buildTools();
	}

	/** Expose buildSystemPrompt() for testing the Base implementation. */
	exposeBuildSystemPrompt(): string {
		return this.buildSystemPrompt();
	}

	/** Expose buildSummarizer() for testing the Base implementation. */
	exposeBuildSummarizer(): unknown {
		return this.buildSummarizer();
	}

	/** Expose computeAvailableToolAllowList() for testing dedup/filter logic. */
	exposeComputeAllowList(tools: Array<{ name?: string }>): string[] {
		return this.computeAvailableToolAllowList(tools);
	}
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GitHubCopilotCliService — initial state", () => {
	let svc: GitHubCopilotCliService;

	beforeEach(() => {
		svc = new GitHubCopilotCliService(makeApp(), makeConfig());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("is not connected before start() is called", () => {
		expect(svc.isConnected()).toBe(false);
	});

	it("has no active session before createSession() is called", () => {
		expect(svc.getSessionId()).toBeNull();
	});

	it("returns an empty message history initially", () => {
		expect(svc.getMessageHistory()).toEqual([]);
	});

	it("getSessionState() returns empty messages initially", () => {
		expect(svc.getSessionState()).toEqual({ messages: [] });
	});
});

describe("GitHubCopilotCliService — template hooks (base behavior)", () => {
	let svc: TestableService;

	beforeEach(() => {
		svc = new TestableService(makeApp(), makeConfig());
		vi.clearAllMocks();
	});

	it("buildTools() delegates to createBasicTools and returns 5 tools", () => {
		const tools = svc.exposeBuildTools();
		expect(vi.mocked(createBasicTools)).toHaveBeenCalledOnce();
		expect(tools).toHaveLength(5);
	});

	it("buildSystemPrompt() delegates to buildBasicSystemPrompt and returns a string", () => {
		const prompt = svc.exposeBuildSystemPrompt();
		expect(vi.mocked(buildBasicSystemPrompt)).toHaveBeenCalledOnce();
		expect(typeof prompt).toBe("string");
		expect(prompt.length).toBeGreaterThan(0);
	});

	it("buildSummarizer() returns undefined (no AI summarizer in Basic tier)", () => {
		const summarizer = svc.exposeBuildSummarizer();
		expect(summarizer).toBeUndefined();
	});
});

describe("GitHubCopilotCliService — updateConfig()", () => {
	it("merges partial config updates into the current config", () => {
		const svc = new TestableService(makeApp(), makeConfig({ model: "gpt-4.1" }));
		// Verify initial model via buildSystemPrompt call
		svc.updateConfig({ model: "claude-sonnet-4" });

		// Trigger buildSystemPrompt so we can verify the model was passed
		svc.exposeBuildSystemPrompt();
		expect(vi.mocked(buildBasicSystemPrompt)).toHaveBeenCalledWith(
			expect.anything(),
			"claude-sonnet-4"
		);
	});
});

describe("GitHubCopilotCliService — computeAvailableToolAllowList()", () => {
	let svc: TestableService;

	beforeEach(() => {
		svc = new TestableService(makeApp(), makeConfig());
	});

	it("extracts tool names from the tools array", () => {
		const result = svc.exposeComputeAllowList([
			{ name: "tool_a" },
			{ name: "tool_b" },
		]);
		expect(result).toContain("tool_a");
		expect(result).toContain("tool_b");
	});

	it("deduplicates repeated tool names", () => {
		const result = svc.exposeComputeAllowList([
			{ name: "tool_a" },
			{ name: "tool_a" },
			{ name: "tool_b" },
		]);
		expect(result).toHaveLength(2);
		expect(result.filter(n => n === "tool_a")).toHaveLength(1);
	});

	it("filters out tools without a name", () => {
		const result = svc.exposeComputeAllowList([
			{ name: "tool_a" },
			{} as { name?: string },
			{ name: "" },
		]);
		expect(result).toHaveLength(1);
		expect(result[0]).toBe("tool_a");
	});
});

describe("GitHubCopilotCliService — event handlers", () => {
	let svc: GitHubCopilotCliService;

	beforeEach(() => {
		svc = new GitHubCopilotCliService(makeApp(), makeConfig());
	});

	it("onEvent() registers a handler that receives dispatched events via unsubscribe return", () => {
		const handler = vi.fn();
		const unsub = svc.onEvent(handler);
		expect(typeof unsub).toBe("function");
		unsub();
		// After unsubscribe the returned function should be callable without throwing
	});

	it("onEvent() returns a working unsubscribe function (idempotent)", () => {
		const handler = vi.fn();
		const unsub = svc.onEvent(handler);
		expect(() => { unsub(); unsub(); }).not.toThrow();
	});
});

describe("GitHubCopilotCliService — setSessionReconnectCallback()", () => {
	it("accepts a callback without throwing", () => {
		const svc = new GitHubCopilotCliService(makeApp(), makeConfig());
		expect(() => svc.setSessionReconnectCallback(() => {})).not.toThrow();
	});

	it("accepts null to clear the callback", () => {
		const svc = new GitHubCopilotCliService(makeApp(), makeConfig());
		svc.setSessionReconnectCallback(() => {});
		expect(() => svc.setSessionReconnectCallback(null)).not.toThrow();
	});
});
