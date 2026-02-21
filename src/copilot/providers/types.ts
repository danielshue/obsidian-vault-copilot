/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CopilotProviderTypes
 * @description Shared types, interfaces, and constants for GitHub Copilot CLI provider.
 *
 * Extracted from GitHubCopilotCliService to enable reuse across provider modules
 * (SessionEventTracer, CopilotToolFactory, SystemPromptBuilder, ConsoleInterceptor)
 * and consumer code that depends on these types.
 *
 * @since 0.0.35
 */

import type { SkillRegistry } from "../customization/SkillRegistry";
import type { McpManager } from "../mcp/McpManager";

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Configuration for the GitHub Copilot CLI service.
 *
 * Controls model selection, timeouts, tracing, and all path/directory
 * settings that affect SDK session behaviour.
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
	/** Timeout in milliseconds when stopping the CLI client */
	stopTimeout?: number;
	/** Whether to capture SDK diagnostics via TracingService */
	tracingEnabled?: boolean;
	/** SDK log level when tracing is enabled (default: 'info') */
	logLevel?: string;
	/** Optional SkillRegistry for runtime-registered tool skills */
	skillRegistry?: SkillRegistry;
	/** Optional MCP manager for Model Context Protocol server tools */
	mcpManager?: McpManager;
	/** Directories to scan for .agent.md files */
	agentDirectories?: string[];
	/** Directories to scan for SKILL.md skill definitions */
	skillDirectories?: string[];
	/** Directories to scan for .instructions.md and AGENTS.md files */
	instructionDirectories?: string[];
	/** Directories to scan for .prompt.md files */
	promptDirectories?: string[];
	/** SDK-level tool filter — if set, only these tools are available to the model */
	availableTools?: string[];
	/** SDK-level skill disabling — skills matching these names are skipped even if discovered */
	disabledSkills?: string[];
	/** IANA timezone identifier (e.g. 'America/New_York'). Falls back to system default when omitted. */
	timezone?: string;
	/** Which day the week starts on — used for date context in the system prompt */
	weekStartDay?: "sunday" | "monday" | "saturday";
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

// ── Constants ──────────────────────────────────────────────────────────────

/** Default timeout in milliseconds for AI requests (2 minutes) */
export const DEFAULT_REQUEST_TIMEOUT = 120000;

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
