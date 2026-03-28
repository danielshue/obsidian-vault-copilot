/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ConsoleInterceptor
 * @description Intercept console and process.stderr logs to capture SDK diagnostics.
 *
 * Extracted from GitHubCopilotCliService as a standalone function with zero
 * class-field dependencies. Patches `process.stderr.write`, `console.log`,
 * `console.warn`, and `console.error` to route Copilot-related messages
 * into the TracingService.
 *
 * @example
 * ```typescript
 * import { interceptConsoleLogs } from "./ConsoleInterceptor";
 * interceptConsoleLogs();
 * ```
 *
 * @see {@link getTracingService} for trace sink used by intercepted logs
 * @see {@link GitHubCopilotCliService} for the provider that enables interception
 * @since 0.0.35
 */

import { getTracingService } from "../TracingService";
import { flattenLogArgs, LOG_SOURCES } from "../logging/LogTaxonomy";

type StderrWriteCallback = (error?: Error | null) => void;
type StderrWriteEncoding = BufferEncoding | StderrWriteCallback;
type StderrWriteChunk = string | Uint8Array;
type StderrWriter = {
	write: (chunk: StderrWriteChunk, encoding?: StderrWriteEncoding, callback?: StderrWriteCallback) => boolean;
};

let isInterceptorInstalled = false;

/**
 * Intercept console and `process.stderr` writes to capture SDK diagnostics.
 *
 * Patches global console methods and stderr to route Copilot-related
 * log messages into the TracingService for display in the Tracing modal.
 *
 * **Side effects**: Replaces `process.stderr.write`, `console.log`,
 * `console.warn`, and `console.error` with wrapped versions.
 *
 * @remarks
 * Should only be called once when tracing is enabled. Repeated calls
 * will stack interceptors (each wrapping the previous wrapper).
 *
 * @returns Nothing
 *
 * @example
 * ```typescript
 * if (config.tracingEnabled) {
 *   interceptConsoleLogs();
 * }
 * ```
 *
 * @see {@link getTracingService} for how captured logs are persisted
 * @since 0.0.35
 */
export function interceptConsoleLogs(): void {
	if (isInterceptorInstalled) {
		return;
	}
	isInterceptorInstalled = true;

	const tracingService = getTracingService();

	// Log that we're setting up interception
	console.log("[Torqena] Setting up CLI log interception...");
	tracingService.addSdkLog("info", "CLI log interception initialized", LOG_SOURCES.COPILOT_SDK);

	// Intercept process.stderr.write to capture CLI subprocess logs
	// The SDK writes logs with prefix "[CLI subprocess]" to stderr
	const stderrWriter = process.stderr as unknown as StderrWriter;
	const originalStderrWrite = stderrWriter.write.bind(process.stderr) as StderrWriter["write"];
	stderrWriter.write = (chunk: StderrWriteChunk, encoding?: StderrWriteEncoding, callback?: StderrWriteCallback) => {
		const message = typeof chunk === "string" ? chunk : chunk?.toString?.() || "";

		// Capture all CLI subprocess logs (they have the [CLI subprocess] prefix)
		if (message.includes("[CLI subprocess]")) {
			// Extract the actual log content after the prefix
			const logContent = message.replace("[CLI subprocess]", "").trim();
			if (logContent) {
				// Parse log level from content if possible
				let level: "info" | "warning" | "error" | "debug" = "info";
				if (message.toLowerCase().includes("error")) {
					level = "error";
				} else if (message.toLowerCase().includes("warn")) {
					level = "warning";
				} else if (message.toLowerCase().includes("debug")) {
					level = "debug";
				}
				tracingService.addSdkLog(level, logContent, LOG_SOURCES.COPILOT_SDK);
			}
		}

		// Handle the different overload signatures of write()
		if (typeof encoding === "function") {
			return originalStderrWrite(chunk, encoding);
		}
		return originalStderrWrite(chunk, encoding, callback);
	};
	console.log("[Torqena] stderr.write intercepted successfully");

	// Store original console methods
	const originalLog = console.log.bind(console);
	const originalWarn = console.warn.bind(console);
	const originalError = console.error.bind(console);

	// Intercept console.log
	console.log = (...args: unknown[]) => {
		originalLog(...args);
		const message = flattenLogArgs(args);

		// Only capture copilot-related logs
		if (message.includes("[Copilot") || message.includes("copilot") || message.includes("[Torqena]")) {
			tracingService.addSdkLog("info", message, LOG_SOURCES.COPILOT_SDK);
		}
	};

	// Intercept console.warn
	console.warn = (...args: unknown[]) => {
		originalWarn(...args);
		const message = flattenLogArgs(args);

		if (message.includes("[Copilot") || message.includes("copilot") || message.includes("[Torqena]")) {
			tracingService.addSdkLog("warning", message, LOG_SOURCES.COPILOT_SDK);
		}
	};

	// Intercept console.error
	console.error = (...args: unknown[]) => {
		originalError(...args);
		const message = flattenLogArgs(args);

		if (message.includes("[Copilot") || message.includes("copilot") || message.includes("[Torqena]")) {
			tracingService.addSdkLog("error", message, LOG_SOURCES.COPILOT_SDK);
		}
	};
}
