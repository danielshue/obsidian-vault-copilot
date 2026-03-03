/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/copilot/BasicToolFactory
 * @description Unit tests for the Basic vault-copilot tool factory.
 *
 * Validates that `createBasicTools()` returns exactly the 5 read-only/web tools
 * defined for the Basic tier, with correct tool names and handler wiring.
 *
 * @see {@link BasicToolFactory}
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBasicTools, type BatchReadNotesFn } from "../../src/copilot/providers/BasicToolFactory";

// Inline the 5 Basic tool name strings to avoid cross-project relative path issues
const BASIC_TOOL_NAMES = {
	GET_ACTIVE_NOTE: "get_active_note",
	OPEN_NOTE: "open_note",
	BATCH_READ_NOTES: "batch_read_notes",
	FETCH_WEB_PAGE: "fetch_web_page",
	WEB_SEARCH: "web_search",
} as const;

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@github/copilot-sdk", () => ({
	defineTool: vi.fn((name: string, _opts: unknown) => ({ toolName: name })),
}));

vi.mock("../../../../src/copilot/tools/VaultOperations", () => ({
	getActiveNote: vi.fn().mockResolvedValue({ content: "active note content" }),
	openNote: vi.fn().mockResolvedValue({ opened: true }),
	fetchWebPage: vi.fn().mockResolvedValue({ text: "page text" }),
	webSearch: vi.fn().mockResolvedValue({ results: [] }),
}));

// Mock ToolDefinitions so the Pro constants file doesn't need to load transitively
vi.mock("../../../../src/copilot/tools/ToolDefinitions", () => ({
	TOOL_NAMES: {
		GET_ACTIVE_NOTE: "get_active_note",
		OPEN_NOTE: "open_note",
		BATCH_READ_NOTES: "batch_read_notes",
		FETCH_WEB_PAGE: "fetch_web_page",
		WEB_SEARCH: "web_search",
	},
	TOOL_DESCRIPTIONS: new Proxy({}, { get: (_t, name) => String(name) }),
	TOOL_JSON_SCHEMAS: new Proxy({}, { get: (_t, _name) => ({ type: "object", properties: {} }) }),
}));

import { defineTool } from "@github/copilot-sdk";

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

// ── Tests ──────────────────────────────────────────────────────────────────

describe("createBasicTools", () => {
	let app: ReturnType<typeof makeApp>;
	let batchReadNotes: BatchReadNotesFn;

	beforeEach(() => {
		app = makeApp();
		batchReadNotes = vi.fn().mockResolvedValue({
			results: [{ path: "note.md", success: true, content: "note content" }],
		}) as unknown as BatchReadNotesFn;
		vi.clearAllMocks();
	});

	it("returns exactly 5 tools", () => {
		const tools = createBasicTools(app, batchReadNotes);
		expect(tools).toHaveLength(5);
	});

	it("returns tools with the 5 Basic tool names", () => {
		createBasicTools(app, batchReadNotes);

		const calledNames = vi.mocked(defineTool).mock.calls.map((c) => c[0]);

		expect(calledNames).toContain(BASIC_TOOL_NAMES.GET_ACTIVE_NOTE);
		expect(calledNames).toContain(BASIC_TOOL_NAMES.OPEN_NOTE);
		expect(calledNames).toContain(BASIC_TOOL_NAMES.BATCH_READ_NOTES);
		expect(calledNames).toContain(BASIC_TOOL_NAMES.FETCH_WEB_PAGE);
		expect(calledNames).toContain(BASIC_TOOL_NAMES.WEB_SEARCH);
	});

	it("does NOT include Pro-only tool names", () => {
		createBasicTools(app, batchReadNotes);

		const calledNames = vi.mocked(defineTool).mock.calls.map((c) => c[0]);

		// Pro-only tools must not appear in Basic
		expect(calledNames).not.toContain("create_note");
		expect(calledNames).not.toContain("update_note");
		expect(calledNames).not.toContain("delete_note");
		expect(calledNames).not.toContain("get_tasks");
		expect(calledNames).not.toContain("ask_question");
		expect(calledNames).not.toContain("show_markdown");
		expect(calledNames).not.toContain("speak");
		expect(calledNames).not.toContain("send_to_chat");
	});

	it("wires the injected batchReadNotes function into the batch_read_notes handler", async () => {
		// Capture handlers via mock implementation
		const capturedHandlers = new Map<string, (args: unknown) => Promise<unknown>>();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		vi.mocked(defineTool).mockImplementation((name: string, opts: any) => {
			capturedHandlers.set(name, opts.handler);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return { name, handler: opts.handler } as any;
		});

		createBasicTools(app, batchReadNotes);

		const handler = capturedHandlers.get(BASIC_TOOL_NAMES.BATCH_READ_NOTES);
		expect(handler).toBeDefined();

		await handler!({ paths: ["note.md"], aiSummarize: false });

		expect(batchReadNotes).toHaveBeenCalledWith(["note.md"], false, undefined);
	});
});
