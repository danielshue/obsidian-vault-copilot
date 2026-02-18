/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import * as nodePath from "path";

/**
 * @module FileLogger
 * @description Writes SDK diagnostic logs to the file system for offline review.
 *
 * Produces two files per day inside `.obsidian/plugins/obsidian-vault-copilot/logs/`:
 * - `sdk-YYYY-MM-DD.log`   — human-readable plain text
 * - `sdk-YYYY-MM-DD.jsonl` — one JSON object per line (machine-parseable)
 *
 * Writes are batched and flushed every {@link FLUSH_INTERVAL_MS} ms to avoid
 * excessive disk I/O during high-throughput streaming.
 *
 * @example
 * ```typescript
 * const logger = new FileLogger("/path/to/vault/.obsidian/plugins/obsidian-vault-copilot/logs");
 * logger.log({ timestamp: Date.now(), level: "info", message: "Hello", source: "sdk" });
 * // …later…
 * logger.destroy(); // flush remaining buffer
 * ```
 *
 * @see {@link TracingService} for the source of SDK log entries
 * @since 0.0.29
 */

import type { SDKLogEntry } from "../copilot/TracingService";

/** How often (ms) the write buffer is flushed to disk */
const FLUSH_INTERVAL_MS = 2_000;

/** Maximum entries to buffer before forcing an immediate flush */
const MAX_BUFFER_SIZE = 100;

/**
 * File-system logger that writes SDK log entries to daily-rotated
 * `.log` (plain text) and `.jsonl` (structured) files.
 *
 * @example
 * ```typescript
 * const logger = new FileLogger(logDir);
 * logger.log(entry);
 * ```
 */
export class FileLogger {
	/** Absolute path to the logs directory */
	private readonly logDir: string;

	/** Buffered entries waiting to be flushed */
	private buffer: SDKLogEntry[] = [];

	/** Handle for the periodic flush timer */
	private flushTimer: ReturnType<typeof setInterval> | null = null;

	/** Whether the directory has been verified/created */
	private dirReady = false;

	/**
	 * Create a new FileLogger.
	 *
	 * @param logDir - Absolute path to the directory where log files are created.
	 *                 The directory is created automatically if it does not exist.
	 *
	 * @example
	 * ```typescript
	 * const logger = new FileLogger("C:/Users/me/vault/.obsidian/plugins/obsidian-vault-copilot/logs");
	 * ```
	 */
	constructor(logDir: string) {
		this.logDir = logDir;
		this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
	}

	/**
	 * Queue a log entry for writing to disk.
	 *
	 * Entries are buffered and flushed periodically. If the buffer exceeds
	 * {@link MAX_BUFFER_SIZE}, an immediate flush is triggered.
	 *
	 * @param entry - The SDK log entry to persist
	 *
	 * @example
	 * ```typescript
	 * logger.log({ timestamp: Date.now(), level: "info", message: "tool started", source: "copilot-event" });
	 * ```
	 */
	log(entry: SDKLogEntry): void {
		this.buffer.push(entry);
		if (this.buffer.length >= MAX_BUFFER_SIZE) {
			this.flush();
		}
	}

	/**
	 * Flush the write buffer to disk immediately.
	 *
	 * Safe to call even when the buffer is empty.
	 *
	 * @internal
	 */
	flush(): void {
		if (this.buffer.length === 0) return;

		// Grab and clear the buffer atomically
		const entries = this.buffer;
		this.buffer = [];

		// Group entries by date for daily rotation
		const byDate = new Map<string, SDKLogEntry[]>();
		for (const entry of entries) {
			const dateKey = this.dateKey(entry.timestamp);
			let group = byDate.get(dateKey);
			if (!group) {
				group = [];
				byDate.set(dateKey, group);
			}
			group.push(entry);
		}

		// Write each date group
		for (const [dateKey, group] of byDate) {
			const textLines = group.map((e) => this.formatText(e)).join("\n") + "\n";
			const jsonLines = group.map((e) => JSON.stringify(e)).join("\n") + "\n";

			this.appendToFile(`sdk-${dateKey}.log`, textLines);
			this.appendToFile(`sdk-${dateKey}.jsonl`, jsonLines);
		}
	}

	/**
	 * Stop the flush timer and write any remaining buffered entries.
	 *
	 * Call this when the plugin unloads.
	 *
	 * @example
	 * ```typescript
	 * // In plugin.onunload()
	 * this.fileLogger.destroy();
	 * ```
	 */
	destroy(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
		this.flush();
	}

	// ── Private helpers ──────────────────────────────────────────────

	/**
	 * Format a log entry as human-readable text.
	 *
	 * Format: `HH:MM:SS.mmm [LEVEL] [source] message`
	 *
	 * @param entry - Log entry to format
	 * @returns Formatted string
	 *
	 * @internal
	 */
	private formatText(entry: SDKLogEntry): string {
		const d = new Date(entry.timestamp);
		const time = [
			d.getHours().toString().padStart(2, "0"),
			d.getMinutes().toString().padStart(2, "0"),
			d.getSeconds().toString().padStart(2, "0"),
		].join(":") + "." + d.getMilliseconds().toString().padStart(3, "0");

		const level = entry.level.toUpperCase().padEnd(7);
		return `${time} [${level}] [${entry.source}] ${entry.message}`;
	}

	/**
	 * Get the date key for daily rotation (YYYY-MM-DD).
	 *
	 * @param ts - Unix timestamp in ms
	 * @returns Date string like `2026-02-17`
	 *
	 * @internal
	 */
	private dateKey(ts: number): string {
		const d = new Date(ts);
		return [
			d.getFullYear(),
			(d.getMonth() + 1).toString().padStart(2, "0"),
			d.getDate().toString().padStart(2, "0"),
		].join("-");
	}

	/**
	 * Append text to a file inside the log directory.
	 *
	 * Creates the log directory on first call if it doesn't exist.
	 * Uses Node.js `fs` (available in Obsidian's Electron environment).
	 *
	 * @param filename - File name (not path) to append to
	 * @param data - Text content to append
	 *
	 * @internal
	 */
	private appendToFile(filename: string, data: string): void {
		try {
			// Ensure directory exists on first write
			if (!this.dirReady) {
				fs.mkdirSync(this.logDir, { recursive: true });
				this.dirReady = true;
			}

			const filePath = nodePath.join(this.logDir, filename);
			fs.appendFileSync(filePath, data, "utf-8");
		} catch (error) {
			// Silently swallow — logging should never crash the plugin
			console.warn("[FileLogger] Write failed:", error);
		}
	}
}
