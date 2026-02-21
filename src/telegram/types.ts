/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module TelegramTypes
 * @description Type definitions for the Telegram Bot integration.
 *
 * This module contains all TypeScript interfaces and types for the Telegram
 * integration, including Bot API types, settings, and configuration.
 *
 * ## Telegram Bot API
 *
 * The types here model the subset of the Telegram Bot API used by Vault Copilot.
 * Full API reference: https://core.telegram.org/bots/api
 *
 * @see {@link TelegramBotService} for the bot service implementation
 * @see {@link TelegramMessageHandler} for message processing
 * @since 0.1.0
 */

// ============================================================================
// Telegram Bot API Types
// ============================================================================

/**
 * Telegram Bot API base URL.
 * All API calls are made to `https://api.telegram.org/bot<token>/<method>`.
 */
export const TELEGRAM_API_BASE = "https://api.telegram.org";

/** Maximum message length for Telegram text messages */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Default long-polling timeout in seconds */
export const TELEGRAM_POLL_TIMEOUT = 30;

/** Default backoff delay on error (ms) */
export const TELEGRAM_ERROR_BACKOFF_MS = 5000;

/**
 * Represents a Telegram user or bot account.
 *
 * @see https://core.telegram.org/bots/api#user
 */
export interface TelegramUser {
	/** Unique identifier for the user */
	id: number;
	/** True if this user is a bot */
	is_bot: boolean;
	/** User's first name */
	first_name: string;
	/** User's last name (optional) */
	last_name?: string;
	/** User's username (optional) */
	username?: string;
	/** IETF language tag (optional) */
	language_code?: string;
}

/**
 * Represents a Telegram chat (private, group, supergroup, or channel).
 *
 * @see https://core.telegram.org/bots/api#chat
 */
export interface TelegramChat {
	/** Unique identifier for the chat */
	id: number;
	/** Type of chat */
	type: "private" | "group" | "supergroup" | "channel";
	/** Title for groups, supergroups, and channels (optional) */
	title?: string;
	/** Username for private chats, supergroups, and channels (optional) */
	username?: string;
	/** First name of the other party in a private chat (optional) */
	first_name?: string;
	/** Last name of the other party in a private chat (optional) */
	last_name?: string;
}

/**
 * Represents a voice message in Telegram.
 *
 * @see https://core.telegram.org/bots/api#voice
 */
export interface TelegramVoice {
	/** Identifier for this file, which can be used to download or reuse the file */
	file_id: string;
	/** Unique identifier for this file (stable across different bots) */
	file_unique_id: string;
	/** Duration of the audio in seconds */
	duration: number;
	/** MIME type of the file (optional) */
	mime_type?: string;
	/** File size in bytes (optional) */
	file_size?: number;
}

/**
 * Represents a Telegram message.
 *
 * @see https://core.telegram.org/bots/api#message
 */
export interface TelegramMessage {
	/** Unique message identifier inside the chat */
	message_id: number;
	/** Sender of the message (optional for channels) */
	from?: TelegramUser;
	/** Chat the message belongs to */
	chat: TelegramChat;
	/** Date the message was sent (Unix timestamp) */
	date: number;
	/** Text of the message (for text messages) */
	text?: string;
	/** Voice message (if the message is a voice note) */
	voice?: TelegramVoice;
	/** Caption for media messages (optional) */
	caption?: string;
}

/**
 * Represents an incoming update from Telegram.
 *
 * @see https://core.telegram.org/bots/api#update
 */
export interface TelegramUpdate {
	/** The update's unique identifier */
	update_id: number;
	/** New incoming message (optional) */
	message?: TelegramMessage;
}

/**
 * Response from the Telegram Bot API `getMe` method.
 *
 * @see https://core.telegram.org/bots/api#getme
 */
export interface TelegramGetMeResponse {
	ok: boolean;
	result?: TelegramUser;
	description?: string;
}

/**
 * Response from the Telegram Bot API `getUpdates` method.
 *
 * @see https://core.telegram.org/bots/api#getupdates
 */
export interface TelegramGetUpdatesResponse {
	ok: boolean;
	result?: TelegramUpdate[];
	description?: string;
}

/**
 * Response from the Telegram Bot API `sendMessage` method.
 *
 * @see https://core.telegram.org/bots/api#sendmessage
 */
export interface TelegramSendMessageResponse {
	ok: boolean;
	result?: TelegramMessage;
	description?: string;
}

/**
 * Response from the Telegram Bot API `getFile` method.
 *
 * @see https://core.telegram.org/bots/api#getfile
 */
export interface TelegramGetFileResponse {
	ok: boolean;
	result?: {
		file_id: string;
		file_unique_id: string;
		file_size?: number;
		file_path?: string;
	};
	description?: string;
}

// ============================================================================
// Telegram Settings Types
// ============================================================================

/**
 * Controls when the bot sends voice message replies.
 *
 * - `"always"` — Every response is sent as both voice note + text
 * - `"voice-only"` — Only reply with voice when the user sent a voice message
 * - `"never"` — Text responses only
 */
export type VoiceReplyMode = "always" | "voice-only" | "never";

/**
 * Configuration for the Telegram bot integration.
 *
 * Stored as `telegram` field in {@link CopilotPluginSettings}.
 *
 * @example
 * ```typescript
 * const telegramSettings: TelegramSettings = {
 *   enabled: true,
 *   botTokenSecretId: "telegram-bot-token",
 *   authorizedChatIds: ["123456789"],
 *   saveConversations: true,
 *   maxSessionMessages: 100,
 *   voiceReplies: "voice-only",
 *   ttsVoice: "alloy",
 *   ttsModel: "tts-1",
 *   transcribeVoiceMessages: true,
 * };
 * ```
 *
 * @see {@link TelegramBotService} for the service that uses these settings
 */
export interface TelegramSettings {
	/** Whether the Telegram bot is enabled */
	enabled: boolean;
	/** Secret ID referencing the Telegram Bot Token stored in SecretStorage */
	botTokenSecretId?: string | null;
	/** List of authorized Telegram chat IDs that can interact with the bot */
	authorizedChatIds: string[];
	/** Whether to persist Telegram conversations as sessions */
	saveConversations: boolean;
	/** Maximum number of messages to keep per Telegram session */
	maxSessionMessages: number;
	/** When to send voice message replies */
	voiceReplies: VoiceReplyMode;
	/** TTS voice for audio replies (same options as realtime agent) */
	ttsVoice: string;
	/** TTS model quality: tts-1 (fast) or tts-1-hd (high quality) */
	ttsModel: "tts-1" | "tts-1-hd";
	/** Whether to transcribe incoming voice messages */
	transcribeVoiceMessages: boolean;
	/** Custom system prompt for Telegram conversations (overrides the default) */
	systemPrompt?: string;
}

/**
 * Default Telegram settings.
 */
/**
 * Template variables available in the Telegram system prompt.
 *
 * These are resolved at runtime by {@link TelegramMessageHandler.resolveSystemPromptVariables}.
 * Each variable is replaced with a dynamically-generated list of the
 * corresponding items available in the current vault.
 *
 * @example
 * ```
 * "Available tools: {{tools}}"
 * // → "Available tools: read_note, search_notes, create_note, …"
 * ```
 */
export const TELEGRAM_PROMPT_VARIABLES: { variable: string; label: string; description: string }[] = [
	{ variable: "{{tools}}", label: "Tools", description: "List of vault tools (read_note, search_notes, etc.)" },
	{ variable: "{{skills}}", label: "Skills", description: "Available skills from .github/skills/" },
	{ variable: "{{prompts}}", label: "Prompts", description: "Available prompt templates from .github/prompts/" },
	{ variable: "{{agents}}", label: "Agents", description: "Available agents from .github/agents/" },
	{ variable: "{{commands}}", label: "Commands", description: "Telegram slash commands" },
	{ variable: "{{time}}", label: "Time", description: "Current date/time in configured timezone" },
];

/**
 * Default Telegram system prompt.
 *
 * Provides formatting guidelines and behavioral rules for the AI when
 * responding via Telegram. Users can customise this from
 * Settings → Telegram → System prompt.
 */
export const DEFAULT_TELEGRAM_SYSTEM_PROMPT = [
	"You are Vault Copilot, an AI assistant connected to the user's Obsidian vault, responding via Telegram.",
	"",
	"IMPORTANT RULES:",
	"- You are chatting through Telegram. Keep responses concise and mobile-friendly.",
	"- Use Telegram-compatible formatting: *bold*, _italic_, `code`, ```code blocks```.",
	"- Do NOT invent or suggest slash commands beyond the ones listed below.",
	"- Available Telegram commands: {{commands}}",
	"- If the user wants to read, search, create, or manage notes, use your tools directly.",
	"- You have full access to vault tools: {{tools}}",
	"- When the user asks about their vault, proactively use your tools to look up the answer.",
	"- You can also search the web with web_search and fetch pages with fetch_web_page.",
	"- Do NOT use markdown headers (#, ##, ###) — they look like comments in Telegram. Use *bold* for section titles instead.",
	"- Keep responses under 4000 characters when possible to fit Telegram's message limits.",
	"- When tool results are large, summarize the key points rather than dumping raw data.",
].join("\n");

export const DEFAULT_TELEGRAM_SETTINGS: TelegramSettings = {
	enabled: false,
	botTokenSecretId: null,
	authorizedChatIds: [],
	saveConversations: true,
	maxSessionMessages: 100,
	voiceReplies: "voice-only",
	ttsVoice: "alloy",
	ttsModel: "tts-1",
	transcribeVoiceMessages: true,
	systemPrompt: undefined,
};

// ============================================================================
// Telegram Bot Service Types
// ============================================================================

/**
 * Bot connection status.
 */
export type TelegramBotStatus = "stopped" | "connecting" | "polling" | "error";

/**
 * Event types emitted by the Telegram bot service.
 */
export interface TelegramBotEvents {
	/** Bot status changed */
	statusChange: (status: TelegramBotStatus, error?: string) => void;
	/** Incoming message received (after auth check) */
	messageReceived: (message: TelegramMessage) => void;
	/** Message sent to a chat */
	messageSent: (chatId: number, text: string) => void;
}
