/**
 * @module tests/copilot/GitHubCopilotCliService.start
 * @description Regression tests for GitHubCopilotCliService startup client options.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

it("uses 'copilot' as default cliPath when config cliPath is empty", async () => {
const service = new GitHubCopilotCliService({} as never, {
model: "gpt-5",
streaming: true,
cliPath: "",
});

await service.start();

expect(CopilotClient).toHaveBeenCalledWith(
expect.objectContaining({ cliPath: "copilot" }),
);
});

it("preserves custom cliPath when provided", async () => {
const service = new GitHubCopilotCliService({} as never, {
model: "gpt-5",
streaming: true,
cliPath: "C:/Tools/copilot.exe",
});

await service.start();

expect(CopilotClient).toHaveBeenCalledWith(
expect.objectContaining({ cliPath: "C:/Tools/copilot.exe" }),
);
});
});

