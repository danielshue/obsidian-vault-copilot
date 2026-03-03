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
}

// ── Message History ────────────────────────────────────────────────────────

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
