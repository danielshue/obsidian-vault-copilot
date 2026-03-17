/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AppLogger
 * @description Unified singleton logger for Torqena diagnostics.
 *
 * Writes daily-rotated log files in one of three formats:
 * - `text`: human-readable `.log`
 * - `json`: structured `.jsonl`
 * - `both`: writes both `.log` and `.jsonl`
 *
 * The logger uses {@link SDKLogEntry} as the canonical log payload shape,
 * so all producers (bootstrap, SDK, tracing, voice) share one timeline.
 *
 * @example
 * ```typescript
 * const logger = AppLogger.getInstance("/path/to/logs", "both");
 * logger.logSimple("info", "Bootstrap started", "bootstrap");
 * logger.log({ timestamp: Date.now(), level: "debug", message: "details", source: "copilot-sdk" });
 * ```
 *
 * @see {@link SDKLogEntry}
 * @since 0.0.14
 */

import { createLogger, format, Logger, transport } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import type { SDKLogEntry } from "../copilot/TracingService";
import { normalizeLogMessage, normalizeLogSource } from "../copilot/logging/LogTaxonomy";

/** Supported file output formats for the unified logger. */
export type LogFormat = "text" | "json" | "both";

/** Custom Winston levels matching {@link SDKLogEntry.level}. */
const SDK_LOG_LEVELS = { error: 0, warning: 1, info: 2, debug: 3 };

/** Unified singleton logger for bootstrap + SDK + tracing file output. */
export class AppLogger {
	private static instance: AppLogger | null = null;

	/** Return the existing singleton instance if initialized, otherwise null. */
	static getInstanceOrNull(): AppLogger | null {
		return AppLogger.instance;
	}

	/**
	 * Get or create the singleton logger.
	 *
	 * The first caller initializes the logger directory; subsequent callers reuse
	 * the same instance and ignore `logDir`.
	 */
	static getInstance(logDir: string, format: LogFormat = "both"): AppLogger {
		if (!AppLogger.instance) {
			AppLogger.instance = new AppLogger(logDir, format);
		}
		return AppLogger.instance;
	}

	/**
	 * Static convenience: log a debug-level message.
	 * Falls back to console.debug if the singleton is not yet initialized.
	 * @param source - Source tag (e.g., `ActionExecutors`, `McpManager`)
	 * @param message - Message to log
	 * @param args - Additional values to append to the message
	 */
	static debug(source: string, message: string, ...args: unknown[]): void {
		const full = args.length ? `${message} ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}` : message;
		const inst = AppLogger.instance;
		if (inst) {
			inst.logSimple("debug", full, source);
		} else {
			console.debug(`[${source}]`, full);
		}
	}

	/**
	 * Static convenience: log an info-level message.
	 * Falls back to console.info if the singleton is not yet initialized.
	 */
	static info(source: string, message: string, ...args: unknown[]): void {
		const full = args.length ? `${message} ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}` : message;
		const inst = AppLogger.instance;
		if (inst) {
			inst.logSimple("info", full, source);
		} else {
			console.info(`[${source}]`, full);
		}
	}

	/**
	 * Static convenience: log a warning-level message.
	 * Falls back to console.warn if the singleton is not yet initialized.
	 */
	static warn(source: string, message: string, ...args: unknown[]): void {
		const full = args.length ? `${message} ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}` : message;
		const inst = AppLogger.instance;
		if (inst) {
			inst.logSimple("warning", full, source);
		} else {
			console.warn(`[${source}]`, full);
		}
	}

	/**
	 * Static convenience: log an error-level message.
	 * Falls back to console.error if the singleton is not yet initialized.
	 */
	static error(source: string, message: string, ...args: unknown[]): void {
		const full = args.length ? `${message} ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}` : message;
		const inst = AppLogger.instance;
		if (inst) {
			inst.logSimple("error", full, source);
		} else {
			console.error(`[${source}]`, full);
		}
	}

	private logger: Logger;
	private readonly logDir: string;
	private currentFormat: LogFormat;

	private constructor(logDir: string, format: LogFormat = "both") {
		this.logDir = logDir;
		this.currentFormat = format;
		this.logger = this.createLoggerForFormat(format);
	}

	/** Write a structured SDK log entry to configured transports. */
	log(entry: SDKLogEntry): void {
		const normalizedSource = normalizeLogSource(entry.source);
		const normalizedMessage = normalizeLogMessage(entry.message, normalizedSource);

		this.logger.log({
			level: entry.level,
			message: normalizedMessage,
			ts: entry.timestamp,
			source: normalizedSource,
		});
	}

	/**
	 * Convenience wrapper for simple text logging.
	 *
	 * @param level - Severity level matching SDK log levels
	 * @param message - Message to log
	 * @param source - Source tag (e.g., `bootstrap`, `trace`, `voice-chat`)
	 */
	logSimple(level: SDKLogEntry["level"], message: string, source: string): void {
		this.log({
			timestamp: Date.now(),
			level,
			message,
			source,
		});
	}

	/**
	 * Reconfigure output format at runtime.
	 *
	 * Closes current transports and recreates them with the requested format.
	 */
	reconfigure(format: LogFormat): void {
		if (this.currentFormat === format) {
			return;
		}

		this.logger.close();
		this.currentFormat = format;
		this.logger = this.createLoggerForFormat(format);
	}

	/**
	 * Set the minimum log level for all transports.
	 * @param level - The minimum level to log (e.g., 'debug', 'info', 'warning', 'error')
	 */
	setLogLevel(level: string): void {
		this.logger.level = level;
	}

	/** Close logger transports and clear the singleton reference. */
	destroy(): void {
		this.logger.close();
		if (AppLogger.instance === this) {
			AppLogger.instance = null;
		}
	}

	/** Build Winston logger and transports for the requested format. @internal */
	private createLoggerForFormat(formatName: LogFormat): Logger {
		const transports: transport[] = [];

		if (formatName === "text" || formatName === "both") {
			transports.push(this.createTextTransport());
		}

		if (formatName === "json" || formatName === "both") {
			transports.push(this.createJsonTransport());
		}

		return createLogger({
			levels: SDK_LOG_LEVELS,
			level: "debug",
			transports,
			exitOnError: false,
		});
	}

	/** Create human-readable daily-rotated `.log` transport. @internal */
	private createTextTransport(): DailyRotateFile {
		return new DailyRotateFile({
			dirname: this.logDir,
			filename: "vault-copilot-%DATE%.log",
			datePattern: "YYYY-MM-DD",
			maxFiles: "14d",
			format: format.printf((info) => {
				const d = new Date(info["ts"] as number);
				const time = [
					d.getHours().toString().padStart(2, "0"),
					d.getMinutes().toString().padStart(2, "0"),
					d.getSeconds().toString().padStart(2, "0"),
				].join(":") + "." + d.getMilliseconds().toString().padStart(3, "0");
				const lvl = (info.level as string).toUpperCase().padEnd(7);
				return `${time} [${lvl}] [${info["source"]}] ${info.message}`;
			}),
		});
	}

	/** Create structured daily-rotated `.jsonl` transport. @internal */
	private createJsonTransport(): DailyRotateFile {
		return new DailyRotateFile({
			dirname: this.logDir,
			filename: "vault-copilot-%DATE%.jsonl",
			datePattern: "YYYY-MM-DD",
			maxFiles: "14d",
			format: format.printf((info) => {
				return JSON.stringify({
					timestamp: info["ts"],
					level: info.level,
					message: info.message,
					source: info["source"],
				});
			}),
		});
	}
}
