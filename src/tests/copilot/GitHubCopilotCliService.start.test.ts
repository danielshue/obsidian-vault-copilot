/**
 * @module tests/copilot/GitHubCopilotCliService.start
 * @description Regression tests for GitHubCopilotCliService startup client options.
 * Tests the Windows cmd.exe wrapper and CLI path resolution logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubCopilotCliService } from "../../copilot/providers/GitHubCopilotCliService";
import { CopilotClient } from "@github/copilot-sdk";

vi.mock("../../copilot/TracingService", () => ({
	getTracingService: () => ({
		addSdkLog: vi.fn(),
		startTrace: vi.fn().mockReturnValue("trace-1"),
		addSpan: vi.fn().mockReturnValue("span-1"),
		completeSpan: vi.fn(),
		endTrace: vi.fn(),
	}),
}));

vi.mock("@github/copilot-sdk", () => {
	const CopilotClientMock = vi.fn(function (this: { start: () => Promise<void>; stop: () => Promise<void> }, _options: unknown) {
		this.start = async () => undefined;
		this.stop = async () => undefined;
	});

	return {
		CopilotClient: CopilotClientMock,
		CopilotSession: class {},
		SessionEvent: class {},
		defineTool: <T>(tool: T): T => tool,
	};
});

describe("GitHubCopilotCliService.start", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves a usable CLI configuration when config cliPath is empty", async () => {
		const service = new GitHubCopilotCliService({} as never, {
			model: "gpt-5",
			streaming: true,
			cliPath: "",
		});

		await service.start();

		const clientOptions = (CopilotClient as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as {
			cliPath?: string;
			cliArgs?: string[];
		};

		// On Windows with a .cmd/.bat CLI, cliPath is cmd.exe and cliArgs starts with /c
		// On other platforms, cliPath is "copilot" directly
		if (process.platform === "win32" && clientOptions?.cliArgs?.[0] === "/c") {
			// Windows cmd.exe wrapper mode
			expect(clientOptions.cliPath).toMatch(/cmd\.exe/i);
			expect(clientOptions.cliArgs[1]).toMatch(/copilot(\.cmd|\.bat)$/i);
		} else {
			// Direct mode (non-Windows or copilot found as executable)
			expect(typeof clientOptions?.cliPath).toBe("string");
			expect(clientOptions?.cliPath).toMatch(/copilot(\.cmd|\.bat|\.exe)?$/i);
		}
	});

	it("preserves custom cliPath when provided (no .cmd extension)", async () => {
		const service = new GitHubCopilotCliService({} as never, {
			model: "gpt-5",
			streaming: true,
			cliPath: "C:/Tools/copilot.exe",
		});

		await service.start();

		// .exe does not match .cmd/.bat, so it's passed through directly
		expect(CopilotClient).toHaveBeenCalledWith(
			expect.objectContaining({ cliPath: "C:/Tools/copilot.exe" }),
		);
	});

	it("wraps custom .cmd path with cmd.exe on Windows", async () => {
		if (process.platform !== "win32") return; // Skip on non-Windows

		const service = new GitHubCopilotCliService({} as never, {
			model: "gpt-5",
			streaming: true,
			cliPath: "C:/Tools/copilot.cmd",
		});

		await service.start();

		const clientOptions = (CopilotClient as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as {
			cliPath?: string;
			cliArgs?: string[];
		};

		expect(clientOptions?.cliPath).toMatch(/cmd\.exe/i);
		expect(clientOptions?.cliArgs).toContain("/c");
		expect(clientOptions?.cliArgs).toContain("C:/Tools/copilot.cmd");
	});
});
