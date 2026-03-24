/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/utils/AppLogger
 * @description Unit tests for the unified singleton logger (AppLogger).
 *
 * Tests singleton pattern (initialization, reuse, cleanup), static method fallback
 * behavior before initialization, instance method functionality, format reconfiguration,
 * log level changes, and proper cleanup to prevent test interference.
 *
 * @see {@link AppLogger}
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Logger, transport } from "winston";

// ── Mocks (must be declared before imports) ────────────────────────────────

// Mock Winston logger and transports
vi.mock("winston", () => {
	const mockLogger = {
		log: vi.fn(),
		close: vi.fn(),
		level: "debug",
	};

	return {
		createLogger: vi.fn().mockReturnValue(mockLogger),
		format: {
			printf: vi.fn((fn) => ({ fn, type: "printf" })),
		},
		transport: {} as unknown as typeof transport,
	};
});

// Mock winston-daily-rotate-file
vi.mock("winston-daily-rotate-file", () => {
	const MockDailyRotateFile = vi.fn(function (this: any, options: any) {
		this.name = "daily-rotate-file";
		this.dirname = options?.dirname || "";
		this.filename = options?.filename || "";
	});

	return {
		default: MockDailyRotateFile,
	};
});

// Mock LogTaxonomy functions
vi.mock("../../src/copilot/logging/LogTaxonomy", () => ({
	normalizeLogSource: vi.fn((source: string) => {
		// Simple mock: just lowercase and trim
		const normalized = (source || "").trim().toLowerCase();
		return normalized || "unknown";
	}),
	normalizeLogMessage: vi.fn((message: string) => {
		// Simple mock: trim and return as-is or "(no details)" if empty
		const trimmed = (message || "").trim();
		return trimmed || "(no details)";
	}),
}));

// ── Import under test (after vi.mock declarations) ─────────────────────────

import { AppLogger } from "../../src/utils/AppLogger";
import { createLogger, format } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { normalizeLogSource, normalizeLogMessage } from "../../src/copilot/logging/LogTaxonomy";

// ── Helper functions ───────────────────────────────────────────────────────

/**
 * Clear the singleton instance for test isolation.
 * This resets AppLogger.instance to null so each test can start fresh.
 */
function resetSingleton(): void {
	// Access private static via type assertion
	const AppLoggerType = AppLogger as any;
	AppLoggerType.instance = null;
}

/**
 * Get the current instance (if any) for assertions.
 */
function getInstance(): any {
	const AppLoggerType = AppLogger as any;
	return AppLoggerType.instance;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AppLogger", () => {
	beforeEach(() => {
		// Clear mocks before each test
		vi.clearAllMocks();
		// Reset singleton to ensure test isolation
		resetSingleton();
		// Clear console mocks
		vi.spyOn(console, "debug").mockImplementation(() => {});
		vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		// Clean up singleton after each test
		resetSingleton();
		vi.restoreAllMocks();
	});

	// ────────────────────────────────────────────────────────────────────────
	// getInstance tests
	// ────────────────────────────────────────────────────────────────────────

	describe("getInstance", () => {
		it("creates instance on first call", () => {
			const logger = AppLogger.getInstance("/logs", "text");

			expect(logger).toBeDefined();
			expect(logger).not.toBeNull();
			expect(getInstance()).toBe(logger);
		});

		it("reuses same instance on subsequent calls", () => {
			const logger1 = AppLogger.getInstance("/logs1", "text");
			const logger2 = AppLogger.getInstance("/logs2", "json");

			expect(logger1).toBe(logger2);
			expect(createLogger).toHaveBeenCalledOnce();
		});

		it("accepts custom log directory on first call", () => {
			const logger = AppLogger.getInstance("/custom/logs", "both");

			expect(logger).toBeDefined();
			// The log directory is stored, and DailyRotateFile should be called with it
			expect(DailyRotateFile).toHaveBeenCalled();
		});

		it("ignores logDir and format parameters on subsequent calls", () => {
			AppLogger.getInstance("/logs1", "text");
			vi.clearAllMocks();

			// Second call with different parameters
			const logger = AppLogger.getInstance("/logs2", "json");

			// Should still be the first instance
			expect(getInstance()).toBeDefined();
			// createLogger should not be called again
			expect(createLogger).not.toHaveBeenCalled();
		});

		it("defaults to 'both' format when not specified", () => {
			const logger = AppLogger.getInstance("/logs");

			expect(logger).toBeDefined();
			// DailyRotateFile should be called twice for "both" format
			expect(DailyRotateFile).toHaveBeenCalledTimes(2);
		});

		it("creates text transport for 'text' format", () => {
			AppLogger.getInstance("/logs", "text");

			// DailyRotateFile called once for text format
			expect(DailyRotateFile).toHaveBeenCalledTimes(1);
			// Verify the call included the text filename pattern
			const calls = (DailyRotateFile as any).mock.calls;
			expect(calls[0][0].filename).toContain("vault-copilot-%DATE%.log");
		});

		it("creates json transport for 'json' format", () => {
			AppLogger.getInstance("/logs", "json");

			// DailyRotateFile called once for json format
			expect(DailyRotateFile).toHaveBeenCalledTimes(1);
			// Verify the call included the json filename pattern
			const calls = (DailyRotateFile as any).mock.calls;
			expect(calls[0][0].filename).toContain("vault-copilot-%DATE%.jsonl");
		});

		it("creates both transports for 'both' format", () => {
			AppLogger.getInstance("/logs", "both");

			// DailyRotateFile called twice for both format
			expect(DailyRotateFile).toHaveBeenCalledTimes(2);
			const calls = (DailyRotateFile as any).mock.calls;
			// First call should be text
			expect(calls[0][0].filename).toContain(".log");
			// Second call should be json
			expect(calls[1][0].filename).toContain(".jsonl");
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// getInstanceOrNull tests
	// ────────────────────────────────────────────────────────────────────────

	describe("getInstanceOrNull", () => {
		it("returns null when not initialized", () => {
			const result = AppLogger.getInstanceOrNull();
			expect(result).toBeNull();
		});

		it("returns instance after initialization", () => {
			const logger = AppLogger.getInstance("/logs", "text");
			const result = AppLogger.getInstanceOrNull();

			expect(result).toBe(logger);
			expect(result).not.toBeNull();
		});

		it("returns same instance on multiple calls", () => {
			AppLogger.getInstance("/logs", "text");
			const result1 = AppLogger.getInstanceOrNull();
			const result2 = AppLogger.getInstanceOrNull();

			expect(result1).toBe(result2);
		});

		it("returns null after destroy", () => {
			const logger = AppLogger.getInstance("/logs", "text");
			logger.destroy();

			const result = AppLogger.getInstanceOrNull();
			expect(result).toBeNull();
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Static logging methods - before initialization (console fallback)
	// ────────────────────────────────────────────────────────────────────────

	describe("Static methods before initialization - console fallback", () => {
		it("debug falls back to console.debug when not initialized", () => {
			AppLogger.debug("TestSource", "test message");

			expect(console.debug).toHaveBeenCalledWith(
				"[TestSource]",
				"test message"
			);
		});

		it("info falls back to console.info when not initialized", () => {
			AppLogger.info("TestSource", "test message");

			expect(console.info).toHaveBeenCalledWith(
				"[TestSource]",
				"test message"
			);
		});

		it("warn falls back to console.warn when not initialized", () => {
			AppLogger.warn("TestSource", "test message");

			expect(console.warn).toHaveBeenCalledWith(
				"[TestSource]",
				"test message"
			);
		});

		it("error falls back to console.error when not initialized", () => {
			AppLogger.error("TestSource", "test message");

			expect(console.error).toHaveBeenCalledWith(
				"[TestSource]",
				"test message"
			);
		});

		it("debug with multiple args joins them in message", () => {
			AppLogger.debug("Source", "msg", "arg1", "arg2");

			expect(console.debug).toHaveBeenCalledWith(
				"[Source]",
				'msg arg1 arg2'
			);
		});

		it("info with object args stringifies them", () => {
			const obj = { key: "value" };
			AppLogger.info("Source", "msg", obj);

			expect(console.info).toHaveBeenCalledWith(
				"[Source]",
				expect.stringContaining("msg")
			);
			expect(console.info).toHaveBeenCalledWith(
				"[Source]",
				expect.stringContaining("key")
			);
		});

		it("warn with string and non-string args formats correctly", () => {
			AppLogger.warn("Source", "message", "string", 123);

			expect(console.warn).toHaveBeenCalledWith(
				"[Source]",
				expect.stringMatching(/message.*string.*123/)
			);
		});

		it("error with multiple args of mixed types", () => {
			const error = new Error("test");
			AppLogger.error("Source", "failed", error, { count: 0 });

			expect(console.error).toHaveBeenCalledWith(
				"[Source]",
				expect.stringContaining("failed")
			);
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Static logging methods - after initialization (instance delegation)
	// ────────────────────────────────────────────────────────────────────────

	describe("Static methods after initialization - instance delegation", () => {
		beforeEach(() => {
			AppLogger.getInstance("/logs", "both");
		});

		it("debug delegates to instance.logSimple after initialization", () => {
			const instance = getInstance();
			vi.spyOn(instance, "logSimple");

			AppLogger.debug("Source", "test message");

			expect(instance.logSimple).toHaveBeenCalledWith(
				"debug",
				"test message",
				"Source"
			);
			expect(console.debug).not.toHaveBeenCalled();
		});

		it("info delegates to instance.logSimple after initialization", () => {
			const instance = getInstance();
			vi.spyOn(instance, "logSimple");

			AppLogger.info("Source", "test message");

			expect(instance.logSimple).toHaveBeenCalledWith(
				"info",
				"test message",
				"Source"
			);
			expect(console.info).not.toHaveBeenCalled();
		});

		it("warn delegates to instance.logSimple (using 'warning' level)", () => {
			const instance = getInstance();
			vi.spyOn(instance, "logSimple");

			AppLogger.warn("Source", "test message");

			expect(instance.logSimple).toHaveBeenCalledWith(
				"warning",
				"test message",
				"Source"
			);
		});

		it("error delegates to instance.logSimple after initialization", () => {
			const instance = getInstance();
			vi.spyOn(instance, "logSimple");

			AppLogger.error("Source", "test message");

			expect(instance.logSimple).toHaveBeenCalledWith(
				"error",
				"test message",
				"Source"
			);
			expect(console.error).not.toHaveBeenCalled();
		});

		it("debug with multiple args joins them before delegation", () => {
			const instance = getInstance();
			vi.spyOn(instance, "logSimple");

			AppLogger.debug("Source", "msg", "arg1", "arg2");

			expect(instance.logSimple).toHaveBeenCalledWith(
				"debug",
				"msg arg1 arg2",
				"Source"
			);
		});

		it("info with object args JSON.stringifies them", () => {
			const instance = getInstance();
			vi.spyOn(instance, "logSimple");
			const obj = { key: "value" };

			AppLogger.info("Source", "msg", obj);

			const call = (instance.logSimple as any).mock.calls[0];
			expect(call[0]).toBe("info");
			expect(call[1]).toContain("msg");
			expect(call[1]).toContain("key");
			expect(call[2]).toBe("Source");
		});

		it("static methods do not use console after initialization", () => {
			AppLogger.debug("S", "msg1");
			AppLogger.info("S", "msg2");
			AppLogger.warn("S", "msg3");
			AppLogger.error("S", "msg4");

			expect(console.debug).not.toHaveBeenCalled();
			expect(console.info).not.toHaveBeenCalled();
			expect(console.warn).not.toHaveBeenCalled();
			expect(console.error).not.toHaveBeenCalled();
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Instance method: log
	// ────────────────────────────────────────────────────────────────────────

	describe("Instance method: log", () => {
		let instance: any;

		beforeEach(() => {
			instance = AppLogger.getInstance("/logs", "both");
		});

		it("logs structured SDKLogEntry via winston logger", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.log({
				timestamp: 1000,
				level: "info",
				message: "test msg",
				source: "test-src",
			});

			expect(mockLogger.log).toHaveBeenCalledWith({
				level: "info",
				message: "test msg",
				ts: 1000,
				source: "test-src",
			});
		});

		it("normalizes source via normalizeLogSource", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.log({
				timestamp: 2000,
				level: "debug",
				message: "msg",
				source: "TestSource",
			});

			expect(normalizeLogSource).toHaveBeenCalledWith("TestSource");
			// Normalized source should be in the logged entry
			const call = mockLogger.log.mock.calls[0];
			expect(call[0].source).toBe("testsource");
		});

		it("normalizes message via normalizeLogMessage", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.log({
				timestamp: 3000,
				level: "warning",
				message: "  test  ",
				source: "src",
			});

			expect(normalizeLogMessage).toHaveBeenCalledWith("  test  ", "src");
			// Normalized message should be in the logged entry
			const call = mockLogger.log.mock.calls[0];
			expect(call[0].message).toBe("test");
		});

		it("handles empty message by using normalization result", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.log({
				timestamp: 4000,
				level: "error",
				message: "",
				source: "src",
			});

			expect(normalizeLogMessage).toHaveBeenCalledWith("", "src");
			const call = mockLogger.log.mock.calls[0];
			expect(call[0].message).toBe("(no details)");
		});

		it("preserves timestamp from SDKLogEntry", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;
			const timestamp = Date.now();

			instance.log({
				timestamp,
				level: "info",
				message: "msg",
				source: "src",
			});

			const call = mockLogger.log.mock.calls[0];
			expect(call[0].ts).toBe(timestamp);
		});

		it("handles all log levels", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			const levels: Array<"debug" | "info" | "warning" | "error"> = [
				"debug",
				"info",
				"warning",
				"error",
			];

			levels.forEach((level) => {
				instance.log({
					timestamp: 5000,
					level,
					message: `${level} msg`,
					source: "src",
				});
			});

			expect(mockLogger.log).toHaveBeenCalledTimes(4);
			levels.forEach((level, idx) => {
				const call = mockLogger.log.mock.calls[idx];
				expect(call[0].level).toBe(level);
			});
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Instance method: logSimple
	// ────────────────────────────────────────────────────────────────────────

	describe("Instance method: logSimple", () => {
		let instance: any;
		let mockLogger: any;

		beforeEach(() => {
			instance = AppLogger.getInstance("/logs", "both");
			mockLogger = (createLogger as any).mock.results[0].value;
		});

		it("creates SDKLogEntry with current timestamp", () => {
			const before = Date.now();

			instance.logSimple("info", "message", "source");

			const after = Date.now();
			const call = mockLogger.log.mock.calls[0];
			const ts = call[0].ts;

			expect(ts).toBeGreaterThanOrEqual(before);
			expect(ts).toBeLessThanOrEqual(after);
		});

		it("delegates to log method", () => {
			vi.spyOn(instance, "log");

			instance.logSimple("debug", "msg", "src");

			expect(instance.log).toHaveBeenCalledWith({
				timestamp: expect.any(Number),
				level: "debug",
				message: "msg",
				source: "src",
			});
		});

		it("accepts all valid log levels", () => {
			const levels: Array<"debug" | "info" | "warning" | "error"> = [
				"debug",
				"info",
				"warning",
				"error",
			];

			levels.forEach((level, idx) => {
				instance.logSimple(level, "msg", "src");

				const call = mockLogger.log.mock.calls[idx];
				expect(call[0].level).toBe(level);
			});
		});

		it("preserves message without modification (delegated to log)", () => {
			instance.logSimple("info", "exact message text", "source");

			const call = mockLogger.log.mock.calls[0];
			expect(call[0].message).toBe("exact message text");
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Instance method: reconfigure
	// ────────────────────────────────────────────────────────────────────────

	describe("Instance method: reconfigure", () => {
		let instance: any;
		let mockLogger: any;

		beforeEach(() => {
			instance = AppLogger.getInstance("/logs", "text");
			mockLogger = (createLogger as any).mock.results[0].value;
		});

		it("does nothing if format is unchanged", () => {
			vi.clearAllMocks();

			instance.reconfigure("text");

			expect(mockLogger.close).not.toHaveBeenCalled();
			expect(createLogger).not.toHaveBeenCalled();
		});

		it("closes old logger when changing format", () => {
			instance.reconfigure("json");

			expect(mockLogger.close).toHaveBeenCalledOnce();
		});

		it("creates new logger with new format", () => {
			instance.reconfigure("json");

			// createLogger called twice: once in getInstance, once in reconfigure
			expect(createLogger).toHaveBeenCalledTimes(2);
		});

		it("transitions from text to json", () => {
			vi.clearAllMocks();
			instance.reconfigure("json");

			expect(DailyRotateFile).toHaveBeenCalledTimes(1);
			const call = (DailyRotateFile as any).mock.calls[0];
			expect(call[0].filename).toContain(".jsonl");
		});

		it("transitions from json to both", () => {
			resetSingleton();
			instance = AppLogger.getInstance("/logs", "json");
			vi.clearAllMocks();

			instance.reconfigure("both");

			// Should create 2 transports (text + json)
			expect(DailyRotateFile).toHaveBeenCalledTimes(2);
		});

		it("transitions from both to text", () => {
			resetSingleton();
			instance = AppLogger.getInstance("/logs", "both");
			vi.clearAllMocks();

			instance.reconfigure("text");

			// Should create 1 transport (text only)
			expect(DailyRotateFile).toHaveBeenCalledTimes(1);
			const call = (DailyRotateFile as any).mock.calls[0];
			expect(call[0].filename).toContain(".log");
		});

		it("allows logging after reconfiguration", () => {
			instance.reconfigure("json");
			const newMockLogger = (createLogger as any).mock.results[1].value;

			instance.logSimple("info", "post-reconfig", "src");

			expect(newMockLogger.log).toHaveBeenCalled();
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Instance method: setLogLevel
	// ────────────────────────────────────────────────────────────────────────

	describe("Instance method: setLogLevel", () => {
		let instance: any;

		beforeEach(() => {
			instance = AppLogger.getInstance("/logs", "both");
		});

		it("sets logger level to specified value", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.setLogLevel("error");

			expect(mockLogger.level).toBe("error");
		});

		it("updates level to debug", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.setLogLevel("debug");

			expect(mockLogger.level).toBe("debug");
		});

		it("updates level to warning", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.setLogLevel("warning");

			expect(mockLogger.level).toBe("warning");
		});

		it("updates level to info", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.setLogLevel("info");

			expect(mockLogger.level).toBe("info");
		});

		it("allows changing level multiple times", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.setLogLevel("debug");
			expect(mockLogger.level).toBe("debug");

			instance.setLogLevel("error");
			expect(mockLogger.level).toBe("error");

			instance.setLogLevel("info");
			expect(mockLogger.level).toBe("info");
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Instance method: destroy
	// ────────────────────────────────────────────────────────────────────────

	describe("Instance method: destroy", () => {
		let instance: any;

		beforeEach(() => {
			instance = AppLogger.getInstance("/logs", "both");
		});

		it("closes logger transports", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			instance.destroy();

			expect(mockLogger.close).toHaveBeenCalledOnce();
		});

		it("clears singleton reference", () => {
			instance.destroy();

			expect(AppLogger.getInstanceOrNull()).toBeNull();
		});

		it("allows creating new instance after destroy", () => {
			instance.destroy();
			vi.clearAllMocks();

			const newInstance = AppLogger.getInstance("/logs2", "json");

			expect(newInstance).toBeDefined();
			expect(newInstance).not.toBe(instance);
			expect(createLogger).toHaveBeenCalled();
		});

		it("does not interfere with other code if instance was already cleared", () => {
			const mockLogger = (createLogger as any).mock.results[0].value;

			// Manually clear singleton (simulating another destroy)
			resetSingleton();

			// Should not throw
			expect(() => instance.destroy()).not.toThrow();
			expect(mockLogger.close).toHaveBeenCalled();
		});

		it("prevents logging via static methods after destroy", () => {
			instance.destroy();
			vi.clearAllMocks();

			AppLogger.info("Source", "msg");

			// Should use console fallback, not instance
			expect(console.info).toHaveBeenCalled();
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Singleton pattern: initialization and idempotency
	// ────────────────────────────────────────────────────────────────────────

	describe("Singleton pattern - initialization and idempotency", () => {
		it("initializes exactly once per process", () => {
			AppLogger.getInstance("/logs1", "text");
			AppLogger.getInstance("/logs2", "json");
			AppLogger.getInstance("/logs3", "both");

			// createLogger should be called only once
			expect(createLogger).toHaveBeenCalledOnce();
		});

		it("ignores subsequent logDir parameters", () => {
			const instance1 = AppLogger.getInstance("/logs1", "text");

			// Clear DailyRotateFile calls from init
			vi.clearAllMocks();

			const instance2 = AppLogger.getInstance("/logs999", "json");

			// Should not create new transports
			expect(DailyRotateFile).not.toHaveBeenCalled();
			expect(instance1).toBe(instance2);
		});

		it("ignores subsequent format parameters", () => {
			const instance1 = AppLogger.getInstance("/logs", "text");
			const callsBeforeSecond = (DailyRotateFile as any).mock.calls.length;

			const instance2 = AppLogger.getInstance("/logs", "json");

			// DailyRotateFile count should not change after second call
			const callsAfterSecond = (DailyRotateFile as any).mock.calls.length;
			expect(callsAfterSecond).toBe(callsBeforeSecond);
			expect(instance1).toBe(instance2);
		});

		it("maintains state across static method calls", () => {
			AppLogger.getInstance("/logs", "both");
			const instance1 = AppLogger.getInstanceOrNull();

			AppLogger.info("Source", "message");

			const instance2 = AppLogger.getInstanceOrNull();
			expect(instance1).toBe(instance2);
		});

		it("state persists through multiple logging operations", () => {
			const instance1 = AppLogger.getInstance("/logs", "both");

			instance1.logSimple("info", "msg1", "src");
			instance1.logSimple("debug", "msg2", "src");

			const instance2 = AppLogger.getInstanceOrNull();
			expect(instance1).toBe(instance2);
		});
	});

	// ────────────────────────────────────────────────────────────────────────
	// Integration tests
	// ────────────────────────────────────────────────────────────────────────

	describe("Integration tests", () => {
		it("full lifecycle: init, log, reconfigure, change level, destroy", () => {
			const logger = AppLogger.getInstance("/logs", "text");
			const mockLogger = (createLogger as any).mock.results[0].value;

			// Log something
			logger.logSimple("info", "initial", "src");
			expect(mockLogger.log).toHaveBeenCalled();

			// Reconfigure
			logger.reconfigure("json");
			expect(createLogger).toHaveBeenCalledTimes(2);

			// Change level - get the new logger created during reconfigure
			const newMockLogger = (createLogger as any).mock.results[1].value;
			logger.setLogLevel("error");
			expect(newMockLogger.level).toBe("error");

			// Log after changes
			logger.logSimple("error", "final", "src");
			expect(newMockLogger.log).toHaveBeenCalled();

			// Cleanup
			logger.destroy();
			expect(AppLogger.getInstanceOrNull()).toBeNull();
		});

		it("static fallback before init, then delegated after init", () => {
			// Before init
			AppLogger.debug("Src", "before");
			expect(console.debug).toHaveBeenCalledWith(
				"[Src]",
				expect.stringContaining("before")
			);

			// Init
			const logger = AppLogger.getInstance("/logs", "both");
			const mockLogger = (createLogger as any).mock.results[0].value;
			vi.clearAllMocks();

			// After init
			AppLogger.debug("Src", "after");
			expect(console.debug).not.toHaveBeenCalled();
			expect(mockLogger.log).toHaveBeenCalled();

			// Cleanup
			logger.destroy();
		});

		it("multiple instances created and destroyed independently", () => {
			// Create first instance
			const logger1 = AppLogger.getInstance("/logs1", "text");
			expect(AppLogger.getInstanceOrNull()).toBe(logger1);

			// Destroy first instance
			logger1.destroy();
			expect(AppLogger.getInstanceOrNull()).toBeNull();

			// Create second instance
			const logger2 = AppLogger.getInstance("/logs2", "json");
			expect(AppLogger.getInstanceOrNull()).toBe(logger2);
			expect(logger2).not.toBe(logger1);

			// Cleanup
			logger2.destroy();
		});

		it("format reconfiguration followed by multiple log operations", () => {
			const logger = AppLogger.getInstance("/logs", "text");
			const initialLogger = (createLogger as any).mock.results[0].value;

			logger.logSimple("info", "msg1", "src");
			expect(initialLogger.log).toHaveBeenCalledTimes(1);

			// Reconfigure
			initialLogger.log.mockClear();
			logger.reconfigure("both");
			const newLogger = (createLogger as any).mock.results[1].value;
			newLogger.log.mockClear();

			// Log multiple times
			logger.logSimple("debug", "msg2", "src");
			logger.logSimple("warning", "msg3", "src");

			expect(newLogger.log).toHaveBeenCalledTimes(2);

			// Cleanup
			logger.destroy();
		});

		it("static methods work correctly through full initialization cycle", () => {
			// Before init - uses console
			AppLogger.info("Src1", "msg1");
			expect(console.info).toHaveBeenCalledOnce();

			// Init
			const logger = AppLogger.getInstance("/logs", "both");
			const mockLogger = (createLogger as any).mock.results[0].value;
			vi.clearAllMocks();

			// After init - uses instance
			AppLogger.warn("Src2", "msg2");
			AppLogger.error("Src3", "msg3", "extra");

			expect(mockLogger.log).toHaveBeenCalledTimes(2);
			expect(console.info).not.toHaveBeenCalled();
			expect(console.warn).not.toHaveBeenCalled();

			// Cleanup
			logger.destroy();

			// After destroy - uses console again
			vi.clearAllMocks();
			AppLogger.debug("Src4", "msg4");
			expect(console.debug).toHaveBeenCalledOnce();
		});
	});
});
