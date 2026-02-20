/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/copilot/GitHubCopilotCliService.test
 * @description Focused unit tests for GitHubCopilotCliService streaming completion behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubCopilotCliService } from "../../copilot/providers/GitHubCopilotCliService";

vi.mock("../../copilot/TracingService", () => ({
	getTracingService: () => ({
		addSdkLog: vi.fn(),
		startTrace: vi.fn().mockReturnValue("trace-1"),
		addSpan: vi.fn().mockReturnValue("span-1"),
		completeSpan: vi.fn(),
		endTrace: vi.fn(),
	}),
}));

interface MockSession {
	on: ReturnType<typeof vi.fn>;
	send: ReturnType<typeof vi.fn>;
	abort: ReturnType<typeof vi.fn>;
}

describe("GitHubCopilotCliService.sendMessageStreaming", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("uses assistant.message content when no delta events are emitted", async () => {
		let handler: ((event: any) => void) | undefined;
		const unsubscribe = vi.fn();
		const session: MockSession = {
			on: vi.fn((cb: (event: any) => void) => {
				handler = cb;
				return unsubscribe;
			}),
			send: vi.fn(async () => {
				handler?.({
					type: "assistant.message",
					data: { content: "final assistant content" },
				});
				handler?.({ type: "session.idle", data: {} });
			}),
			abort: vi.fn(async () => undefined),
		};

		const service = new GitHubCopilotCliService({} as any, {
			model: "gpt-5",
			streaming: true,
		});
		(service as any).session = session;

		const onDelta = vi.fn();
		const onComplete = vi.fn();

		await service.sendMessageStreaming("hello", onDelta, onComplete, 5000);

		expect(onDelta).not.toHaveBeenCalled();
		expect(onComplete).toHaveBeenCalledWith("final assistant content");
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(service.getMessageHistory()).toEqual([
			expect.objectContaining({ role: "user", content: "hello" }),
			expect.objectContaining({ role: "assistant", content: "final assistant content" }),
		]);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it("prefers longer assistant.message content over shorter delta-assembled content and avoids duplicate completion", async () => {
		let handler: ((event: any) => void) | undefined;
		const unsubscribe = vi.fn();
		const session: MockSession = {
			on: vi.fn((cb: (event: any) => void) => {
				handler = cb;
				return unsubscribe;
			}),
			send: vi.fn(async () => {
				handler?.({
					type: "assistant.message_delta",
					data: { deltaContent: "Hello" },
				});
				handler?.({
					type: "assistant.message",
					data: { content: "Hello world" },
				});
				handler?.({ type: "session.idle", data: {} });
			}),
			abort: vi.fn(async () => undefined),
		};

		const service = new GitHubCopilotCliService({} as any, {
			model: "gpt-5",
			streaming: true,
		});
		(service as any).session = session;

		const onDelta = vi.fn();
		const onComplete = vi.fn();

		await service.sendMessageStreaming("hello", onDelta, onComplete, 5000);

		expect(onDelta).toHaveBeenCalledWith("Hello");
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith("Hello world");
		expect(service.getMessageHistory()).toEqual([
			expect.objectContaining({ role: "user", content: "hello" }),
			expect.objectContaining({ role: "assistant", content: "Hello world" }),
		]);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});
});
