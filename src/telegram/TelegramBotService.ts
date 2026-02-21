/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module TelegramBotService
 * @description Core Telegram Bot service that handles long-polling, message sending,
 * and lifecycle management for the Telegram integration.
 *
 * Uses Obsidian's `requestUrl` for all HTTP calls to the Telegram Bot API,
 * making it cross-platform compatible. The bot uses long-polling (not webhooks)
 * so no public URL is required.
 *
 * ## Architecture
 *
 * ```
 * TelegramBotService
 *   ├── Long-polling loop (getUpdates)
 *   ├── Message sending (sendMessage, sendVoice, sendChatAction)
 *   ├── File download (getFile → download binary)
 *   └── Lifecycle (start/stop)
 * ```
 *
 * ## Desktop Only
 *
 * The polling loop requires a persistent process. This service is only
 * started on desktop platforms. Telegram sessions are still viewable
 * on mobile through the shared session list.
 *
 * @example
 * ```typescript
 * const bot = new TelegramBotService(app, {
 *   botToken: "123456:ABC-DEF...",
 *   onMessage: async (msg) => { ... },
 * });
 * await bot.start();
 * // ... later
 * await bot.stop();
 * ```
 *
 * @see {@link TelegramMessageHandler} for message processing logic
 * @see {@link TelegramSettings} for configuration
 * @since 0.1.0
 */

import { requestUrl } from "obsidian";
import type {
	TelegramUpdate,
	TelegramMessage,
	TelegramGetMeResponse,
	TelegramGetUpdatesResponse,
	TelegramSendMessageResponse,
	TelegramGetFileResponse,
	TelegramUser,
	TelegramBotStatus,
} from "./types";
import {
	TELEGRAM_API_BASE,
	TELEGRAM_MAX_MESSAGE_LENGTH,
	TELEGRAM_POLL_TIMEOUT,
	TELEGRAM_ERROR_BACKOFF_MS,
} from "./types";

/**
 * Configuration for the Telegram bot service.
 */
export interface TelegramBotServiceConfig {
	/** Telegram Bot API token */
	botToken: string;
	/** Callback invoked for each incoming message */
	onMessage: (message: TelegramMessage) => Promise<void>;
	/** Callback invoked when bot status changes */
	onStatusChange?: (status: TelegramBotStatus, error?: string) => void;
}

/**
 * Core Telegram Bot service.
 *
 * Handles:
 * - Long-polling for incoming updates via `getUpdates`
 * - Sending text messages with automatic splitting for long content
 * - Sending voice messages (OGG/Opus)
 * - Sending typing indicators
 * - Downloading files (for voice message transcription)
 * - Graceful start/stop lifecycle
 *
 * @example
 * ```typescript
 * const bot = new TelegramBotService(app, {
 *   botToken: token,
 *   onMessage: async (msg) => {
 *     await bot.sendMessage(msg.chat.id, "Hello from Vault Copilot!");
 *   },
 * });
 *
 * await bot.start();
 * ```
 */
export class TelegramBotService {
	private config: TelegramBotServiceConfig;
	private status: TelegramBotStatus = "stopped";
	private pollOffset = 0;
	private polling = false;
	private abortController: AbortController | null = null;
	private botInfo: TelegramUser | null = null;
	private consecutiveErrors = 0;
	private static readonly MAX_CONSECUTIVE_ERRORS = 10;

	constructor(config: TelegramBotServiceConfig) {
		this.config = config;
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	/**
	 * Start the bot polling loop.
	 *
	 * Validates the bot token via `getMe`, then begins long-polling.
	 *
	 * @throws {Error} If the bot token is invalid
	 */
	async start(): Promise<void> {
		if (this.polling) {
			console.log("[Telegram] Bot already polling, skipping start");
			return;
		}

		this.setStatus("connecting");
		console.log("[Telegram] Starting bot...");

		try {
			// Validate token by calling getMe
			this.botInfo = await this.getMe();
			console.log(`[Telegram] Connected as @${this.botInfo.username} (${this.botInfo.first_name})`);

			this.polling = true;
			this.consecutiveErrors = 0;
			this.setStatus("polling");

			// Start polling loop (non-blocking)
			this.pollLoop();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error("[Telegram] Failed to start bot:", errorMsg);
			this.setStatus("error", errorMsg);
			throw error;
		}
	}

	/**
	 * Stop the bot polling loop gracefully.
	 */
	async stop(): Promise<void> {
		if (!this.polling) return;

		console.log("[Telegram] Stopping bot...");
		this.polling = false;
		this.abortController?.abort();
		this.abortController = null;
		this.setStatus("stopped");
		console.log("[Telegram] Bot stopped");
	}

	/**
	 * Get the current bot status.
	 */
	getStatus(): TelegramBotStatus {
		return this.status;
	}

	/**
	 * Get bot info (available after start).
	 */
	getBotInfo(): TelegramUser | null {
		return this.botInfo;
	}

	// ========================================================================
	// Telegram Bot API Methods
	// ========================================================================

	/**
	 * Call the Telegram Bot API `getMe` to validate the token and get bot info.
	 *
	 * @returns Bot user information
	 * @throws {Error} If the token is invalid or API call fails
	 */
	async getMe(): Promise<TelegramUser> {
		const response = await this.apiCall<TelegramGetMeResponse>("getMe");
		if (!response.ok || !response.result) {
			throw new Error(`getMe failed: ${response.description || "Unknown error"}`);
		}
		return response.result;
	}

	/**
	 * Send a text message to a Telegram chat.
	 *
	 * Automatically splits messages longer than 4096 characters at paragraph
	 * or sentence boundaries.
	 *
	 * @param chatId - Target chat ID
	 * @param text - Message text (supports Telegram MarkdownV2)
	 * @param parseMode - Parse mode ('MarkdownV2', 'HTML', or undefined for plain text)
	 *
	 * @example
	 * ```typescript
	 * await bot.sendMessage(123456789, "Hello from *Vault Copilot*!", "MarkdownV2");
	 * ```
	 */
	async sendMessage(chatId: number, text: string, parseMode?: string): Promise<void> {
		if (!text.trim()) return;

		// Split long messages
		const chunks = this.splitMessage(text);

		for (const chunk of chunks) {
			const params: Record<string, unknown> = {
				chat_id: chatId,
				text: chunk,
			};
			if (parseMode) {
				params.parse_mode = parseMode;
			}

			try {
				const response = await this.apiCall<TelegramSendMessageResponse>("sendMessage", params);
				if (!response.ok) {
					// If MarkdownV2 fails, retry without parse mode
					if (parseMode) {
						console.warn(`[Telegram] Markdown send failed, retrying as plain text: ${response.description}`);
						await this.apiCall<TelegramSendMessageResponse>("sendMessage", {
							chat_id: chatId,
							text: chunk,
						});
					} else {
						console.error(`[Telegram] sendMessage failed: ${response.description}`);
					}
				}
			} catch (error) {
				console.error("[Telegram] sendMessage error:", error);
			}
		}
	}

	/**
	 * Send a voice message (OGG/Opus) to a Telegram chat.
	 *
	 * @param chatId - Target chat ID
	 * @param audioBuffer - OGG/Opus audio data as ArrayBuffer
	 */
	async sendVoice(chatId: number, audioBuffer: ArrayBuffer): Promise<void> {
		const url = `${TELEGRAM_API_BASE}/bot${this.config.botToken}/sendVoice`;

		try {
			// Build multipart form data
			const boundary = `----TelegramBoundary${Date.now()}`;
			const encoder = new TextEncoder();

			const parts: Uint8Array[] = [];

			// chat_id field
			parts.push(encoder.encode(
				`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`
			));

			// voice field (binary file)
			parts.push(encoder.encode(
				`--${boundary}\r\nContent-Disposition: form-data; name="voice"; filename="voice.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`
			));
			parts.push(new Uint8Array(audioBuffer));
			parts.push(encoder.encode("\r\n"));

			// End boundary
			parts.push(encoder.encode(`--${boundary}--\r\n`));

			// Concatenate parts
			const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
			const body = new Uint8Array(totalLength);
			let offset = 0;
			for (const part of parts) {
				body.set(part, offset);
				offset += part.length;
			}

			await requestUrl({
				url,
				method: "POST",
				headers: {
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
				},
				body: body.buffer,
				throw: false,
			});
		} catch (error) {
			console.error("[Telegram] sendVoice error:", error);
		}
	}

	/**
	 * Send a typing indicator to show the bot is processing.
	 *
	 * @param chatId - Target chat ID
	 */
	async sendTypingAction(chatId: number): Promise<void> {
		try {
			await this.apiCall("sendChatAction", {
				chat_id: chatId,
				action: "typing",
			});
		} catch {
			// Typing indicator is best-effort, don't throw
		}
	}

	/**
	 * Download a file from Telegram servers.
	 *
	 * Use with voice messages: get the file_id from the voice object,
	 * then download the binary content.
	 *
	 * @param fileId - Telegram file identifier
	 * @returns ArrayBuffer containing the file data, or null on failure
	 *
	 * @example
	 * ```typescript
	 * if (message.voice) {
	 *   const audio = await bot.downloadFile(message.voice.file_id);
	 *   // audio is an OGG/Opus ArrayBuffer
	 * }
	 * ```
	 */
	async downloadFile(fileId: string): Promise<ArrayBuffer | null> {
		try {
			// Step 1: Get file path
			const fileInfo = await this.apiCall<TelegramGetFileResponse>("getFile", {
				file_id: fileId,
			});

			if (!fileInfo.ok || !fileInfo.result?.file_path) {
				console.error("[Telegram] getFile failed:", fileInfo.description);
				return null;
			}

			// Step 2: Download file binary
			const downloadUrl = `${TELEGRAM_API_BASE}/file/bot${this.config.botToken}/${fileInfo.result.file_path}`;
			const response = await requestUrl({
				url: downloadUrl,
				method: "GET",
				throw: false,
			});

			if (response.status !== 200) {
				console.error(`[Telegram] File download failed: HTTP ${response.status}`);
				return null;
			}

			return response.arrayBuffer;
		} catch (error) {
			console.error("[Telegram] downloadFile error:", error);
			return null;
		}
	}

	// ========================================================================
	// Internal: Polling Loop
	// ========================================================================

	/**
	 * Main long-polling loop. Runs until `stop()` is called.
	 * @internal
	 */
	private async pollLoop(): Promise<void> {
		while (this.polling) {
			try {
				this.abortController = new AbortController();
				const updates = await this.getUpdates();

				if (!this.polling) break; // Check again after await

				this.consecutiveErrors = 0; // Reset on success

				for (const update of updates) {
					if (!this.polling) break;

					// Track offset for next poll
					this.pollOffset = update.update_id + 1;

					if (update.message) {
						try {
							await this.config.onMessage(update.message);
						} catch (error) {
							console.error("[Telegram] Message handler error:", error);
						}
					}
				}
			} catch (error) {
				if (!this.polling) break; // Expected abort on stop

				this.consecutiveErrors++;
				const errorMsg = error instanceof Error ? error.message : String(error);
				console.error(`[Telegram] Poll error (${this.consecutiveErrors}/${TelegramBotService.MAX_CONSECUTIVE_ERRORS}):`, errorMsg);

				if (this.consecutiveErrors >= TelegramBotService.MAX_CONSECUTIVE_ERRORS) {
					console.error("[Telegram] Too many consecutive errors, stopping bot");
					this.setStatus("error", "Too many consecutive poll errors");
					this.polling = false;
					break;
				}

				// Exponential backoff
				const backoff = Math.min(
					TELEGRAM_ERROR_BACKOFF_MS * Math.pow(2, this.consecutiveErrors - 1),
					60000 // Max 60s backoff
				);
				console.log(`[Telegram] Backing off for ${backoff}ms`);
				await this.sleep(backoff);
			}
		}
	}

	/**
	 * Fetch updates from Telegram using long-polling.
	 * @internal
	 */
	private async getUpdates(): Promise<TelegramUpdate[]> {
		const response = await this.apiCall<TelegramGetUpdatesResponse>("getUpdates", {
			offset: this.pollOffset,
			timeout: TELEGRAM_POLL_TIMEOUT,
			allowed_updates: ["message"],
		});

		if (!response.ok) {
			throw new Error(`getUpdates failed: ${response.description || "Unknown error"}`);
		}

		return response.result || [];
	}

	// ========================================================================
	// Internal: API Call Helper
	// ========================================================================

	/**
	 * Make a Telegram Bot API call using Obsidian's requestUrl.
	 *
	 * @param method - API method name (e.g., "sendMessage", "getUpdates")
	 * @param params - Optional parameters to send as JSON body
	 * @returns Parsed JSON response
	 * @internal
	 */
	private async apiCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
		const url = `${TELEGRAM_API_BASE}/bot${this.config.botToken}/${method}`;

		const response = await requestUrl({
			url,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: params ? JSON.stringify(params) : undefined,
			throw: false,
		});

		if (response.status >= 400 && response.status !== 409) {
			throw new Error(`Telegram API ${method} failed: HTTP ${response.status}`);
		}

		return response.json as T;
	}

	// ========================================================================
	// Internal: Utilities
	// ========================================================================

	/**
	 * Split a long message into chunks that fit within Telegram's 4096-char limit.
	 * Splits at paragraph boundaries, then sentence boundaries, then hard-cuts.
	 * @internal
	 */
	private splitMessage(text: string): string[] {
		if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
			return [text];
		}

		const chunks: string[] = [];
		let remaining = text;

		while (remaining.length > 0) {
			if (remaining.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
				chunks.push(remaining);
				break;
			}

			// Try to split at paragraph boundary
			let splitIdx = remaining.lastIndexOf("\n\n", TELEGRAM_MAX_MESSAGE_LENGTH);

			// Try single newline
			if (splitIdx <= 0) {
				splitIdx = remaining.lastIndexOf("\n", TELEGRAM_MAX_MESSAGE_LENGTH);
			}

			// Try sentence boundary
			if (splitIdx <= 0) {
				splitIdx = remaining.lastIndexOf(". ", TELEGRAM_MAX_MESSAGE_LENGTH);
				if (splitIdx > 0) splitIdx += 1; // Include the period
			}

			// Hard cut
			if (splitIdx <= 0) {
				splitIdx = TELEGRAM_MAX_MESSAGE_LENGTH;
			}

			chunks.push(remaining.substring(0, splitIdx).trim());
			remaining = remaining.substring(splitIdx).trim();
		}

		return chunks;
	}

	/**
	 * Update the bot status and notify listeners.
	 * @internal
	 */
	private setStatus(status: TelegramBotStatus, error?: string): void {
		this.status = status;
		this.config.onStatusChange?.(status, error);
	}

	/**
	 * Sleep for the specified duration.
	 * @internal
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
