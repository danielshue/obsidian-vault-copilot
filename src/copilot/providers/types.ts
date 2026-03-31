/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CopilotProviderTypes
 * @description Shared types, interfaces, and constants for the Basic GitHub Copilot CLI provider.
 *
 * Contains the base `GitHubCopilotCliConfig` (11 fields) and all shared value types
 * (ChatMessage, ModelInfoResult, etc.) used by both Basic and Pro.
 * Pro extends the config with `GitHubCopilotCliProConfig` in the Pro entry point.
 *
 * @since 0.1.0
 */

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Base configuration for the GitHub Copilot CLI service.
 *
 * Contains the minimal fields needed for the Basic plugin's chat-only mode.
 * Pro extends this with `GitHubCopilotCliProConfig` (adds tools, MCP, customization).
 */
export interface GitHubCopilotCliConfig {
	/** The AI model identifier to use for sessions (e.g. 'gpt-4.1', 'claude-sonnet-4') */
	model: string;
	/** Optional explicit path to the Copilot CLI binary. Resolved automatically if omitted. */
	cliPath?: string;
	/** Optional URL for the CLI server when using a remote Copilot instance */
	cliUrl?: string;
	/** Whether to enable streaming responses (default: true) */
	streaming: boolean;
	/** Absolute path to the Obsidian vault root — used as working directory for the CLI */
	vaultPath?: string;
	/** Timeout in milliseconds for individual AI requests */
	requestTimeout?: number;
	/** Context utilization ratio (0.0-1.0) to start background compaction */
	backgroundCompactionThreshold?: number;
	/** Context utilization ratio (0.0-1.0) to block and compact before buffer exhaustion */
	bufferExhaustionThreshold?: number;
	/** Timeout in milliseconds when stopping the CLI client */
	stopTimeout?: number;
	/** Whether to capture SDK diagnostics via TracingService */
	tracingEnabled?: boolean;
	/** SDK log level when tracing is enabled (default: 'info') */
	logLevel?: string;
	/** Optional user token used to scope SDK session listings by session ID prefix */
	sessionUserId?: string;
}

/** Per-session infinite-session compaction options passed at session creation time. */
export interface InfiniteSessionOptions {
	/** Whether infinite sessions are enabled for this session (default: true). */
	enabled?: boolean;
	/** Context utilization ratio (0.0-1.0) to start background compaction. */
	backgroundCompactionThreshold?: number;
	/** Context utilization ratio (0.0-1.0) to block before buffer exhaustion. */
	bufferExhaustionThreshold?: number;
}

/** Optional overrides applied only to a single createSession() call. */
export interface SessionCreateOptions {
	infiniteSessions?: InfiniteSessionOptions;
}

// ── Message History ────────────────────────────────────────────────────────

/**
 * An image attached to a chat message, stored as base64-encoded data.
 *
 * Used by all providers that support vision inputs (OpenAI, Azure OpenAI,
 * and GitHub Copilot CLI). The Copilot CLI provider writes images to OS temp
 * files and passes them as file attachments to the SDK.
 *
 * @example
 * ```typescript
 * const img: ImageAttachment = {
 *   name: "Pasted Image",
 *   mimeType: "image/png",
 *   base64Data: "iVBORw0KGgo...",
 *   sizeBytes: 45000,
 * };
 * ```
 * @since 0.2.0
 */
export interface ImageAttachment {
	/** Display name shown in the attachment chip (e.g. 'Pasted Image') */
	name: string;
	/** MIME type of the image (e.g. 'image/png', 'image/jpeg', 'image/gif') */
	mimeType: string;
	/** Base64-encoded image data without a data URL prefix */
	base64Data: string;
	/** Original file size in bytes (used for size validation) */
	sizeBytes: number;
}

/**
 * A single chat message in the conversation history.
 *
 * Used across all providers (Copilot, OpenAI, Azure) for a uniform
 * message format in the UI and persistence layer.
 */
export interface ChatMessage {
	/** The role of the message sender */
	role: "user" | "assistant" | "system";
	/** The text content of the message */
	content: string;
	/** When the message was created */
	timestamp: Date;
	/** Optional source identifier (e.g. 'obsidian', 'telegram') */
	source?: string;
	/** How the message was input: 'text' (default) or 'voice' */
	inputType?: "text" | "voice";
	/** Optional image attachments for vision-capable providers */
	images?: ImageAttachment[];
}

// ── Model Information ──────────────────────────────────────────────────────

/**
 * Capabilities of a model as reported by the SDK.
 *
 * Mapped from the SDK's richer format into a flat, serializable structure
 * for use in the settings UI and model picker.
 */
export interface ModelCapabilitiesInfo {
	/** Whether the model supports image/vision inputs */
	supportsVision?: boolean;
	/** Maximum number of prompt tokens the model accepts */
	maxPromptTokens?: number;
	/** Maximum context window size in tokens */
	maxContextWindowTokens?: number;
	/** MIME types the model accepts for vision inputs */
	supportedMediaTypes?: string[];
	/** Maximum number of images per prompt */
	maxPromptImages?: number;
	/** Maximum size (in bytes) per prompt image */
	maxPromptImageSize?: number;
}

/**
 * Policy information for a model (e.g. availability state, terms).
 */
export interface ModelPolicyInfo {
	/** Availability state of the model (e.g. 'enabled', 'disabled') */
	state?: string;
	/** Terms or conditions for using the model */
	terms?: string;
}

/**
 * Full model info result as returned by {@link GitHubCopilotCliService.listModels}.
 */
export interface ModelInfoResult {
	/** The model identifier (e.g. 'gpt-4.1') */
	id: string;
	/** Human-readable name */
	name: string;
	/** Capability details */
	capabilities: ModelCapabilitiesInfo;
	/** Optional policy restrictions */
	policy?: ModelPolicyInfo;
	/** Billing multiplier relative to the base model */
	billingMultiplier?: number;
}

/**
 * Session-scoped custom agent metadata returned by Copilot CLI RPC APIs.
 */
export interface SessionAgentInfo {
	/** Unique custom agent identifier */
	name: string;
	/** Human-readable display name */
	displayName: string;
	/** Short description of the agent's purpose */
	description: string;
}

/**
 * Result returned by session compaction RPC operations.
 */
export interface SessionCompactionResult {
	/** Whether compaction completed successfully */
	success: boolean;
	/** Number of tokens freed by compaction */
	tokensRemoved: number;
	/** Number of chat messages removed during compaction */
	messagesRemoved: number;
}

// ── Errors ─────────────────────────────────────────────────────────────────

/**
 * Thrown when a streaming request times out due to inactivity.
 * This is a recoverable error — the session can be resumed when the user sends a new message.
 *
 * @since 0.3.0
 */
export class StreamingTimeoutError extends Error {
	constructor(timeoutSeconds: number) {
		super(`Streaming request timed out after ${timeoutSeconds} seconds of inactivity`);
		this.name = "StreamingTimeoutError";
	}
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Default timeout in milliseconds for AI requests (45 minutes / 2700 seconds) */
export const DEFAULT_REQUEST_TIMEOUT = 2700000;

/** Default timeout in milliseconds when stopping the CLI client (5 seconds) */
export const DEFAULT_STOP_TIMEOUT = 5000;

/**
 * SDK idle timeout in milliseconds (~30 min).
 * After this period of inactivity the CLI process tears down the session.
 * Used alongside {@link SESSION_STALE_THRESHOLD_MS} to proactively recreate.
 */
export const SDK_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Threshold in milliseconds after which the service considers the SDK session
 * stale and recreates it proactively (set 5 min before the actual timeout).
 */
export const SESSION_STALE_THRESHOLD_MS = 25 * 60 * 1000;

/**
 * Configuration for a Bring-Your-Own-Key (BYOK) SDK provider.
 * Used to route requests through a custom model endpoint.
 * @since 0.0.44
 */
export interface SdkProviderConfig {
	/** Provider type identifier (e.g., 'openai', 'azure-openai') */
	type: string;
	/** Display name for the provider */
	name?: string;
	/** API key or credential for the provider */
	apiKey?: string;
	/** Bearer token for authentication (alternative to apiKey) */
	bearerToken?: string;
	/** Base URL for the provider's API endpoint */
	baseUrl?: string;
	/** Model identifier to use */
	model?: string;
}
