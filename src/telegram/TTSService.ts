/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module TTSService
 * @description Text-to-Speech service using OpenAI's audio.speech API.
 *
 * Converts text to audio for:
 * - Telegram voice note replies (OGG/Opus format)
 * - In-app TTS playback (MP3 format)
 *
 * Supports multiple voices, models, and output formats.
 *
 * @example
 * ```typescript
 * const tts = new TTSService({ apiKey: "sk-...", baseUrl: "https://api.openai.com/v1" });
 * const audio = await tts.synthesize("Hello world", { voice: "nova", format: "opus" });
 * ```
 *
 * @see {@link TelegramVoiceHandler} for Telegram voice reply integration
 * @since 0.1.0
 */

/**
 * TTS service configuration.
 */
export interface TTSConfig {
	/** OpenAI API key */
	apiKey: string;
	/** Base URL for the API (default: https://api.openai.com/v1) */
	baseUrl?: string;
}

/**
 * Options for a synthesis request.
 */
export interface TTSSynthesizeOptions {
	/** Voice to use (default: "alloy") */
	voice?: TTSVoice;
	/** TTS model to use (default: "tts-1") */
	model?: TTSModel;
	/** Output format (default: "opus") */
	format?: TTSFormat;
	/** Playback speed (0.25 to 4.0, default: 1.0) */
	speed?: number;
}

/**
 * Available TTS voices from the OpenAI API.
 */
export type TTSVoice = "alloy" | "ash" | "coral" | "echo" | "fable" | "onyx" | "nova" | "sage" | "shimmer";

/**
 * Available TTS models.
 * - tts-1: Standard quality, lower latency
 * - tts-1-hd: Higher quality, higher latency
 */
export type TTSModel = "tts-1" | "tts-1-hd";

/**
 * Available output audio formats.
 * - opus: OGG/Opus — best for Telegram voice notes
 * - mp3: Standard MP3 — best for browser playback
 * - aac: AAC — good for mobile
 * - flac: Lossless — highest quality, largest files
 */
export type TTSFormat = "opus" | "mp3" | "aac" | "flac";

/**
 * Text-to-Speech service using OpenAI's API.
 *
 * @example
 * ```typescript
 * const tts = new TTSService({ apiKey: "sk-..." });
 *
 * // Generate OGG/Opus for Telegram
 * const ogg = await tts.synthesize("Hello", { voice: "nova", format: "opus" });
 *
 * // Generate MP3 for browser playback
 * const mp3 = await tts.synthesize("Hello", { voice: "alloy", format: "mp3" });
 * ```
 */
export class TTSService {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: TTSConfig) {
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
	}

	/**
	 * Synthesize text to audio.
	 *
	 * @param text - Text to synthesize (max 4096 chars)
	 * @param options - Synthesis options (voice, model, format)
	 * @returns ArrayBuffer of audio data, or null on failure
	 *
	 * @example
	 * ```typescript
	 * const audio = await tts.synthesize("Hello world", {
	 *   voice: "nova",
	 *   format: "opus",
	 *   speed: 1.0,
	 * });
	 * ```
	 *
	 * @throws {Error} If the API request fails
	 */
	async synthesize(text: string, options: TTSSynthesizeOptions = {}): Promise<ArrayBuffer | null> {
		if (!text.trim()) return null;

		const voice = options.voice || "alloy";
		const model = options.model || "tts-1";
		const format = options.format || "opus";
		const speed = options.speed || 1.0;

		// Truncate to 4096 chars (OpenAI limit)
		const truncatedText = text.length > 4096 ? text.substring(0, 4093) + "..." : text;

		try {
			const response = await fetch(`${this.baseUrl}/audio/speech`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					input: truncatedText,
					voice,
					response_format: format,
					speed,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`TTS API error (${response.status}): ${errorText}`);
			}

			return await response.arrayBuffer();
		} catch (error) {
			console.error("[TTSService] Synthesis error:", error);
			throw error;
		}
	}

	/**
	 * Synthesize text to audio and play it in the browser.
	 *
	 * Uses MP3 format for broad browser compatibility.
	 *
	 * @param text - Text to speak
	 * @param options - Synthesis options
	 * @returns Promise that resolves when playback completes
	 */
	async speakInBrowser(text: string, options: Omit<TTSSynthesizeOptions, "format"> = {}): Promise<void> {
		const audioBuffer = await this.synthesize(text, { ...options, format: "mp3" });
		if (!audioBuffer) return;

		const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
		const url = URL.createObjectURL(blob);

		return new Promise<void>((resolve, reject) => {
			const audio = new Audio(url);
			audio.onended = () => {
				URL.revokeObjectURL(url);
				resolve();
			};
			audio.onerror = (e) => {
				URL.revokeObjectURL(url);
				reject(new Error(`Audio playback error: ${e}`));
			};
			audio.play().catch((err) => {
				URL.revokeObjectURL(url);
				reject(err);
			});
		});
	}

	/**
	 * Get the content type for a given TTS format.
	 *
	 * @param format - Audio format
	 * @returns MIME type string
	 */
	static getContentType(format: TTSFormat): string {
		switch (format) {
			case "opus":
				return "audio/ogg";
			case "mp3":
				return "audio/mpeg";
			case "aac":
				return "audio/aac";
			case "flac":
				return "audio/flac";
			default:
				return "audio/mpeg";
		}
	}
}
