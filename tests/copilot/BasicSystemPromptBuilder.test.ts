/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/copilot/BasicSystemPromptBuilder
 * @description Unit tests for the Basic vault-copilot system prompt builder.
 *
 * Validates that `buildBasicSystemPrompt()` produces a prompt containing
 * essential context (vault name, date, model, tool names) and that it
 * deliberately excludes Pro-only features.
 *
 * @see {@link BasicSystemPromptBuilder}
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildBasicSystemPrompt } from "../../src/copilot/providers/BasicSystemPromptBuilder";

// ── Helper ─────────────────────────────────────────────────────────────────

function makeApp(vaultName = "My Test Vault") {
	return {
		vault: {
			getName: vi.fn().mockReturnValue(vaultName),
		},
	} as unknown as import("obsidian").App;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("buildBasicSystemPrompt", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns a non-empty string", () => {
		const app = makeApp();
		const result = buildBasicSystemPrompt(app, "gpt-4.1");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("includes the vault name", () => {
		const app = makeApp("My Notes");
		const result = buildBasicSystemPrompt(app, "gpt-4.1");
		expect(result).toContain("My Notes");
	});

	it("includes the model identifier", () => {
		const app = makeApp();
		const result = buildBasicSystemPrompt(app, "claude-3.7-sonnet");
		expect(result).toContain("claude-3.7-sonnet");
	});

	it("includes the current date context", () => {
		const app = makeApp();
		const result = buildBasicSystemPrompt(app, "gpt-4.1");
		// The prompt should include some date-like string
		expect(result).toContain("date");
	});

	it("calls app.vault.getName() exactly once", () => {
		const app = makeApp();
		buildBasicSystemPrompt(app, "gpt-5");
		expect(app.vault.getName).toHaveBeenCalledTimes(1);
	});

	it("includes all 5 Basic tool names in the prompt", () => {
		const app = makeApp();
		const result = buildBasicSystemPrompt(app, "gpt-4.1");
		expect(result).toContain("get_active_note");
		expect(result).toContain("open_note");
		expect(result).toContain("batch_read_notes");
		expect(result).toContain("fetch_web_page");
		expect(result).toContain("web_search");
	});

	it("does NOT include Pro-only tool names", () => {
		const app = makeApp();
		const result = buildBasicSystemPrompt(app, "gpt-4.1");
		expect(result).not.toContain("create_note");
		expect(result).not.toContain("delete_note");
		expect(result).not.toContain("ask_question");
		expect(result).not.toContain("show_markdown");
		expect(result).not.toContain("send_to_chat");
		expect(result).not.toContain("get_tasks");
	});

	it("does NOT include Pro-only prompt features (slash commands, bases)", () => {
		const app = makeApp();
		const result = buildBasicSystemPrompt(app, "gpt-4.1");
		// Slash command instructions (e.g. /summarize, /search) should not appear
		expect(result).not.toMatch(/^\//m);
		// Bases YAML syntax should not appear
		expect(result).not.toContain("```base");
	});

	it("mentions that Pro features are available for advanced use", () => {
		const app = makeApp();
		const result = buildBasicSystemPrompt(app, "gpt-4.1");
		// Should mention Pro upgrade path for features like editing
		expect(result.toLowerCase()).toContain("pro");
	});
});
