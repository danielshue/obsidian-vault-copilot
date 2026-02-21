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
	const tracingService = getTracingService();

	// Log that we're setting up interception
	console.log("[Vault Copilot] Setting up CLI log interception...");
	tracingService.addSdkLog("info", "CLI log interception initialized", "copilot-sdk");

	// Intercept process.stderr.write to capture CLI subprocess logs
	// The SDK writes logs with prefix "[CLI subprocess]" to stderr
	if (process?.stderr?.write) {
		const originalStderrWrite = process.stderr.write.bind(process.stderr);
		(process.stderr as any).write = (chunk: any, encoding?: any, callback?: any) => {
			const message = typeof chunk === "string" ? chunk : chunk?.toString?.() || "";

			// Debug: Log all stderr writes to see what we're getting
			if (message.trim()) {
				console.log("[Vault Copilot DEBUG] stderr:", message.substring(0, 200));
			}

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
					tracingService.addSdkLog(level, logContent, "copilot-cli");
				}
			}

			// Handle the different overload signatures of write()
			if (typeof encoding === "function") {
				return originalStderrWrite(chunk, encoding);
			}
			return originalStderrWrite(chunk, encoding, callback);
		};
		console.log("[Vault Copilot] stderr.write intercepted successfully");
	} else {
		console.warn("[Vault Copilot] process.stderr.write not available - CLI logs will not be captured");
		tracingService.addSdkLog("warning", "process.stderr.write not available - CLI logs cannot be captured", "copilot-sdk");
	}

	// Store original console methods
	const originalLog = console.log.bind(console);
	const originalWarn = console.warn.bind(console);
	const originalError = console.error.bind(console);

	// Intercept console.log
	console.log = (...args: unknown[]) => {
		originalLog(...args);
		const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ");

		// Only capture copilot-related logs
		if (message.includes("[Copilot") || message.includes("copilot") || message.includes("[Vault Copilot]")) {
			tracingService.addSdkLog("info", message, "copilot-sdk");
		}
	};

	// Intercept console.warn
	console.warn = (...args: unknown[]) => {
		originalWarn(...args);
		const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ");

		if (message.includes("[Copilot") || message.includes("copilot") || message.includes("[Vault Copilot]")) {
			tracingService.addSdkLog("warning", message, "copilot-sdk");
		}
	};

	// Intercept console.error
	console.error = (...args: unknown[]) => {
		originalError(...args);
		const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ");

		if (message.includes("[Copilot") || message.includes("copilot") || message.includes("[Vault Copilot]")) {
			tracingService.addSdkLog("error", message, "copilot-sdk");
		}
	};
}
