/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module TelegramVoiceHandler
 * @description Voice message processing for the Telegram bot integration.
 *
 * Handles:
 * - Downloading voice messages from Telegram (OGG/Opus files)
 * - Transcribing audio via OpenAI Whisper API
 * - Generating TTS (Text-to-Speech) audio replies
 * - Sending voice note responses back to Telegram
 *
 * ## Voice Input Flow
 *
 * ```
 * Telegram voice message (OGG/Opus)
 *   → Download via Bot API getFile
 *   → Transcribe via OpenAI Whisper (accepts OGG natively)
 *   → Route transcribed text to TelegramMessageHandler
 *   → AI response
 *   → Optional TTS synthesis → send voice note
 * ```
 *
 * @see {@link TelegramMessageHandler} for text message routing
 * @see {@link TTSService} for text-to-speech synthesis
 * @since 0.1.0
 */

import type CopilotPlugin from "../main";
import type { TelegramMessage } from "./types";
import type { TelegramBotService } from "./TelegramBotService";
import type { TelegramMessageHandler } from "./TelegramMessageHandler";
import { TTSService, type TTSConfig } from "./TTSService";
import { getSecretValue } from "../utils/secrets";
import type { OpenAIProviderProfile, AzureOpenAIProviderProfile } from "../ui/settings/types";

/**
 * Configuration for the voice handler.
 */
export interface TelegramVoiceHandlerConfig {
	/** Reference to the main plugin */
	plugin: CopilotPlugin;
	/** Reference to the bot service for sending messages/voice */
	botService: TelegramBotService;
	/** Reference to the message handler for routing transcribed text */
	messageHandler: TelegramMessageHandler;
}

/**
 * Handles voice message input and TTS output for the Telegram bot.
 *
 * @example
 * ```typescript
 * const voiceHandler = new TelegramVoiceHandler({
 *   plugin,
 *   botService: bot,
 *   messageHandler: handler,
 * });
 *
 * // Called by TelegramMessageHandler when a voice message arrives
 * await voiceHandler.handleVoiceMessage(telegramMessage);
 * ```
 */
export class TelegramVoiceHandler {
	private plugin: CopilotPlugin;
	private botService: TelegramBotService;
	private messageHandler: TelegramMessageHandler;
	private ttsService: TTSService | null = null;

	constructor(config: TelegramVoiceHandlerConfig) {
		this.plugin = config.plugin;
		this.botService = config.botService;
		this.messageHandler = config.messageHandler;
	}

	/**
	 * Process an incoming voice message from Telegram.
	 *
	 * Downloads the OGG/Opus audio, transcribes it via Whisper,
	 * then routes the text through the regular message handler.
	 *
	 * @param message - Telegram message containing a voice note
	 */
	async handleVoiceMessage(message: TelegramMessage): Promise<void> {
		const chatId = message.chat.id;
		const voice = message.voice;

		if (!voice) return;

		// Check if voice transcription is enabled
		if (!this.plugin.settings.telegram?.transcribeVoiceMessages) {
			await this.botService.sendMessage(chatId, "🎤 Voice messages are disabled. Enable them in Vault Copilot Telegram settings.");
			return;
		}

		// Show typing while processing
		await this.botService.sendTypingAction(chatId);

		try {
			// Step 1: Download the voice file from Telegram
			console.log(`[Telegram/Voice] Downloading voice message (${voice.duration}s, ${voice.file_size ?? "?"} bytes)`);
			const audioBuffer = await this.botService.downloadFile(voice.file_id);

			if (!audioBuffer) {
				await this.botService.sendMessage(chatId, "⚠️ Failed to download voice message.");
				return;
			}

			// Step 2: Transcribe with Whisper
			console.log("[Telegram/Voice] Transcribing audio...");
			const transcription = await this.transcribeAudio(audioBuffer);

			if (!transcription || !transcription.trim()) {
				await this.botService.sendMessage(chatId, "⚠️ Could not transcribe voice message. The audio may be too short or unclear.");
				return;
			}

			console.log(`[Telegram/Voice] Transcribed: "${transcription.substring(0, 100)}..."`);

			// Step 3: Show the transcription to the user
			await this.botService.sendMessage(chatId, `🎤 "${transcription}"`);

			// Step 4: Route through message handler as voice input
			await this.messageHandler.processTextMessage(chatId, String(chatId), transcription, "voice");
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error("[Telegram/Voice] Voice processing error:", errorMsg);
			await this.botService.sendMessage(chatId, `⚠️ Voice processing error: ${errorMsg}`);
		}
	}

	/**
	 * Send a TTS voice reply to Telegram.
	 *
	 * Synthesizes the text to OGG/Opus audio and sends it as a Telegram voice note.
	 *
	 * @param chatId - Target chat ID
	 * @param text - Text to synthesize
	 */
	async sendVoiceReply(chatId: number, text: string): Promise<void> {
		try {
			const tts = this.getTTSService();
			if (!tts) {
				console.log("[Telegram/Voice] TTS not available, skipping voice reply");
				return;
			}

			const settings = this.plugin.settings.telegram;
			const audioBuffer = await tts.synthesize(text, {
				voice: (settings?.ttsVoice || "alloy") as import("./TTSService").TTSVoice,
				model: settings?.ttsModel || "tts-1",
				format: "opus",
			});

			if (audioBuffer) {
				await this.botService.sendVoice(chatId, audioBuffer);
			}
		} catch (error) {
			console.error("[Telegram/Voice] TTS error:", error);
			// Don't send error to user — text was already sent
		}
	}

	// ========================================================================
	// Internal: Audio Transcription
	// ========================================================================

	/**
	 * Transcribe audio using the configured Whisper backend.
	 *
	 * OGG/Opus is natively supported by the OpenAI Whisper API,
	 * so no format conversion is needed.
	 *
	 * @param audioBuffer - Raw audio data (OGG/Opus from Telegram)
	 * @returns Transcribed text, or null on failure
	 * @internal
	 */
	private async transcribeAudio(audioBuffer: ArrayBuffer): Promise<string | null> {
		// Get API key from the voice input profile or chat provider profile
		const apiKey = this.getWhisperApiKey();
		if (!apiKey) {
			throw new Error("No API key available for Whisper transcription. Configure an OpenAI or Azure OpenAI profile.");
		}

		// Use OpenAI Whisper API directly (it accepts OGG natively)
		const language = this.plugin.settings.voice?.language;

		try {
			// Build FormData for the API call
			const blob = new Blob([audioBuffer], { type: "audio/ogg" });
			const formData = new FormData();
			formData.append("file", blob, "voice.ogg");
			formData.append("model", "whisper-1");
			formData.append("response_format", "json");
			if (language && language !== "auto") {
				formData.append("language", language);
			}

			// Determine the API base URL
			const baseUrl = this.getWhisperBaseUrl();

			const response = await fetch(`${baseUrl}/audio/transcriptions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Whisper API error (${response.status}): ${errorText}`);
			}

			const result = await response.json() as { text: string };
			return result.text?.trim() || null;
		} catch (error) {
			console.error("[Telegram/Voice] Whisper transcription error:", error);
			throw error;
		}
	}

	/**
	 * Get the API key for Whisper transcription.
	 *
	 * Tries (in order):
	 * 1. Voice input profile API key
	 * 2. Chat provider profile API key
	 * 3. Environment variable OPENAI_API_KEY
	 *
	 * @returns API key string or undefined
	 * @internal
	 */
	private getWhisperApiKey(): string | undefined {
		const app = this.plugin.app;
		const settings = this.plugin.settings;

		// Try voice input profile
		if (settings.voiceInputProfileId) {
			const profiles = settings.aiProviderProfiles ?? [];
			const profile = profiles.find((p) => p.id === settings.voiceInputProfileId);
			if (profile?.type === "openai") {
				const key = getSecretValue(app, (profile as OpenAIProviderProfile).apiKeySecretId);
				if (key) return key;
			}
			if (profile?.type === "azure-openai") {
				const key = getSecretValue(app, (profile as AzureOpenAIProviderProfile).apiKeySecretId);
				if (key) return key;
			}
		}

		// Try chat provider profile
		if (settings.chatProviderProfileId) {
			const profiles = settings.aiProviderProfiles ?? [];
			const profile = profiles.find((p) => p.id === settings.chatProviderProfileId);
			if (profile?.type === "openai") {
				const key = getSecretValue(app, (profile as OpenAIProviderProfile).apiKeySecretId);
				if (key) return key;
			}
		}

		// Try environment variable
		try {
			return process.env.OPENAI_API_KEY;
		} catch {
			return undefined;
		}
	}

	/**
	 * Get the base URL for the Whisper API.
	 * @internal
	 */
	private getWhisperBaseUrl(): string {
		const settings = this.plugin.settings;

		// Check voice input profile for custom base URL
		if (settings.voiceInputProfileId) {
			const profiles = settings.aiProviderProfiles ?? [];
			const profile = profiles.find((p) => p.id === settings.voiceInputProfileId);
			if (profile?.type === "openai" && (profile as OpenAIProviderProfile).baseURL) {
				return (profile as OpenAIProviderProfile).baseURL!;
			}
		}

		return "https://api.openai.com/v1";
	}

	// ========================================================================
	// Internal: TTS Service
	// ========================================================================

	/**
	 * Get or create the TTS service instance.
	 * @internal
	 */
	private getTTSService(): TTSService | null {
		if (this.ttsService) return this.ttsService;

		const apiKey = this.getWhisperApiKey(); // Same key works for TTS
		if (!apiKey) return null;

		const config: TTSConfig = {
			apiKey,
			baseUrl: this.getWhisperBaseUrl(),
		};

		this.ttsService = new TTSService(config);
		return this.ttsService;
	}

	/**
	 * Clean up resources.
	 */
	destroy(): void {
		this.ttsService = null;
	}
}
