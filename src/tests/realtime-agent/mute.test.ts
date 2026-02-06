import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseVoiceAgent } from "../../copilot/realtime-agent/BaseVoiceAgent";
import type { RealtimeSession } from "@openai/agents/realtime";
import type { App } from "obsidian";

// Mock BaseVoiceAgent with minimal implementation for testing
class TestVoiceAgent extends BaseVoiceAgent {
	getInstructions(): string {
		return "Test instructions";
	}
}

describe("Realtime Agent Mute Functionality", () => {
	let mockApp: App;
	let agent: TestVoiceAgent;
	let mockSession: Partial<RealtimeSession>;

	beforeEach(() => {
		// Create minimal app mock
		mockApp = {} as App;

		// Create agent instance
		agent = new TestVoiceAgent("Test Agent", mockApp, {
			apiKey: "test-key",
		});

		// Create mock session with mute functionality
		mockSession = {
			mute: vi.fn(),
			muted: false,
		};

		// Set the session on the agent (using internal property)
		(agent as any).session = mockSession;
	});

	describe("mute()", () => {
		it("should call session.mute(true) when mute is called", () => {
			agent.mute();

			expect(mockSession.mute).toHaveBeenCalledWith(true);
		});

		it("should not throw if session is null", () => {
			(agent as any).session = null;

			expect(() => agent.mute()).not.toThrow();
		});
	});

	describe("unmute()", () => {
		it("should call session.mute(false) when unmute is called", () => {
			agent.unmute();

			expect(mockSession.mute).toHaveBeenCalledWith(false);
		});

		it("should not throw if session is null", () => {
			(agent as any).session = null;

			expect(() => agent.unmute()).not.toThrow();
		});
	});

	describe("isMuted()", () => {
		it("should return false when session is not muted", () => {
			mockSession.muted = false;

			expect(agent.isMuted()).toBe(false);
		});

		it("should return true when session is muted", () => {
			mockSession.muted = true;

			expect(agent.isMuted()).toBe(true);
		});

		it("should return false when session is null", () => {
			(agent as any).session = null;

			expect(agent.isMuted()).toBe(false);
		});

		it("should return false when session.muted is null", () => {
			mockSession.muted = null as any;

			expect(agent.isMuted()).toBe(false);
		});
	});
});
