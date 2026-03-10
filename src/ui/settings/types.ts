/**
 * @module settings/types (Basic)
 * @description Type definitions and interfaces for Basic Vault Copilot settings.
 *
 * This is a standalone version with only the types needed for Basic functionality.
 * Pro extends these types with additional fields for voice, telegram, MCP, etc.
 *
 * @since 0.1.0
 */

import type { ChatMessage } from "../../copilot/providers/GitHubCopilotCliService";
import type { AIProviderType } from "../../copilot/providers/AIProvider";
import type { CliStatus } from "../../copilot/providers/GitHubCopilotCliManager";

// ============================================================================
// Session Types
// ============================================================================

/**
 * Represents a saved chat session with conversation history.
 */
export interface CopilotSession {
	/** Unique identifier for the session */
	id: string;
	/** Display name for the session */
	name: string;
	/** Timestamp when the session was created */
	createdAt: number;
	/** Timestamp when the session was last used */
	lastUsedAt: number;
	/** Timestamp when the session was completed (if applicable) */
	completedAt?: number;
	/** Duration of the session in milliseconds */
	durationMs?: number;
	/** Whether the session is archived */
	archived: boolean;
	/** Chat message history for the session */
	messages: ChatMessage[];
	/** Per-session tool overrides (enabled tools list, or undefined for defaults) */
	toolOverrides?: {
		/** If set, only these tools are enabled for this session */
		enabled?: string[];
		/** If set, these tools are disabled for this session */
		disabled?: string[];
	};
	/** SDK conversation ID backing this session (server-assigned by Copilot CLI) */
	conversationId?: string;
	/** Origin of this session: 'obsidian' (default) or 'telegram' (Pro) */
	source?: "obsidian" | "telegram";
	/** Telegram chat ID linked to this session (Pro only) */
	telegramChatId?: string;
}

// ============================================================================
// Voice Types (stub for compatibility)
// ============================================================================

/** Voice conversation for realtime agent history (Pro-only, stub for type compat) */
export interface VoiceConversation {
	id: string;
	name: string;
	createdAt: number;
	messages: VoiceMessage[];
}

/** Message in a voice conversation (Pro-only, stub for type compat) */
export interface VoiceMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	timestamp: number;
	type?: 'message' | 'function_call' | 'function_call_output';
	toolName?: string;
	toolArgs?: string;
	toolOutput?: string;
}

// ============================================================================
// OpenAI Settings (Pro-only, stub for type compat)
// ============================================================================

export interface OpenAISettings {
	/** Whether OpenAI is enabled */
	enabled: boolean;
	/** Secret ID referencing the OpenAI API key stored in SecretStorage */
	apiKeySecretId?: string | null;
	/** OpenAI model to use */
	model: string;
	/** Base URL for OpenAI API (optional, for Azure or custom endpoints) */
	baseURL: string;
	/** Organization ID (optional) */
	organization: string;
	/** Max tokens for completion */
	maxTokens: number;
	/** Temperature (0-2) */
	temperature: number;
}

// ============================================================================
// AI Provider Profile Types (Pro-only, stubs for type compat)
// ============================================================================

/** AI Provider Profile Types */
export type AIProviderProfileType = 'copilot' | 'openai' | 'azure-openai' | 'local';

/** Base interface for all AI Provider profiles */
export interface AIProviderProfileBase {
	id: string;
	name: string;
	type: AIProviderProfileType;
	readonly?: boolean;
}

/** GitHub Copilot CLI provider profile */
export interface CopilotProviderProfile extends AIProviderProfileBase {
	type: 'copilot';
	readonly: true;
}

/** OpenAI provider profile configuration */
export interface OpenAIProviderProfile extends AIProviderProfileBase {
	type: 'openai';
	apiKeySecretId?: string | null;
	baseURL?: string;
	model?: string;
}

/** Azure OpenAI provider profile configuration */
export interface AzureOpenAIProviderProfile extends AIProviderProfileBase {
	type: 'azure-openai';
	apiKeySecretId?: string | null;
	endpoint: string;
	deploymentName: string;
	apiVersion?: string;
	model?: string;
}

/** Local Whisper server profile configuration */
export interface LocalProviderProfile extends AIProviderProfileBase {
	type: 'local';
	serverUrl: string;
}

/** Union type for all AI Provider profiles */
export type AIProviderProfile = CopilotProviderProfile | OpenAIProviderProfile | AzureOpenAIProviderProfile | LocalProviderProfile;

/** Configuration for VoiceChatService derived from a profile (Pro-only, stub for compat) */
export interface VoiceServiceConfigFromProfile {
	backend: 'openai-whisper' | 'azure-whisper' | 'local-whisper';
	openaiApiKeySecretId?: string;
	openaiBaseUrl?: string;
	azureApiKeySecretId?: string;
	azureEndpoint?: string;
	azureDeploymentName?: string;
	azureApiVersion?: string;
	whisperServerUrl?: string;
}

// ============================================================================
// Periodic Notes Types
// ============================================================================

/** Periodic note granularity */
export type PeriodicNoteGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** Configuration for a single periodic note type */
export interface PeriodicNoteConfig {
	enabled: boolean;
	format: string;
	folder: string;
	templatePath?: string;
}

/** Periodic notes settings - compatible with obsidian-periodic-notes plugin */
export interface PeriodicNotesSettings {
	daily: PeriodicNoteConfig;
	weekly: PeriodicNoteConfig;
	monthly: PeriodicNoteConfig;
	quarterly: PeriodicNoteConfig;
	yearly: PeriodicNoteConfig;
}

// ============================================================================
// Main Settings Interface
// ============================================================================

/** Supported timezone identifiers (IANA Time Zone Database) */
export type TimezoneId = string;

/** Day of the week for week start configuration */
export type WeekStartDay = 'sunday' | 'monday' | 'saturday';

/** Supported managed property types for centralized property metadata */
export type ManagedPropertyType =
	| 'text'
	| 'list'
	| 'number'
	| 'checkbox'
	| 'date'
	| 'date-time'
	| 'tags';

/**
 * Main plugin settings interface for Basic Vault Copilot.
 *
 * Pro extends this with additional fields for voice, MCP, telegram, etc.
 */
export interface CopilotPluginSettings {
	/** AI provider to use: 'copilot' only in Basic */
	aiProvider: AIProviderType;
	model: string;
	cliPath: string;
	cliUrl: string;
	streaming: boolean;
	/** Request timeout in milliseconds (default: 120000 = 2 minutes) */
	requestTimeout: number;
	/** Context utilization ratio (0.0-1.0) at which background compaction begins */
	backgroundCompactionThreshold: number;
	/** Context utilization ratio (0.0-1.0) at which foreground compaction blocks */
	bufferExhaustionThreshold: number;
	/** Preferred timezone (IANA identifier) - Basic uses system default */
	timezone: TimezoneId;
	/** First day of the week for calendar calculations - Basic uses defaults */
	weekStartDay: WeekStartDay;
	/** Enable tracing to capture agent execution details */
	tracingEnabled: boolean;
	/** Log level for SDK logging when tracing is enabled */
	logLevel: 'debug' | 'info' | 'warn' | 'error';
	/** Write SDK logs to disk (desktop only) */
	fileLoggingEnabled: boolean;
	/** File log output format for diagnostics */
	logFormat: 'text' | 'json' | 'both';
	showInStatusBar: boolean;
	/** Show ribbon icon in the left sidebar */
	showRibbonIcon: boolean;
	/** Central property type assignments keyed by property name */
	propertyTypeAssignments?: Record<string, ManagedPropertyType>;
	/** Show welcome screen in empty chats and new sessions */
	displayWelcomeMessage: boolean;
	sessions: CopilotSession[];
	activeSessionId: string | null;
	/** Directories containing skill definition files */
	skillDirectories: string[];
	/** Skill names to disable in the SDK session */
	disabledSkills: string[];
	/** Directories containing custom agent definition files */
	agentDirectories: string[];
	/** Directories containing instruction files */
	instructionDirectories: string[];
	/** Directories containing prompt files */
	promptDirectories: string[];
	/** Directories containing automation definition files (.automation.md) */
	automationDirectories: string[];
	/** How to display items in the slash command menu: 'flat' (badges) or 'grouped' (section headers) */
	slashMenuGrouping: 'flat' | 'grouped';
	/** Default enabled tools (builtin tools enabled by default) */
	defaultEnabledTools?: string[];
	/** Default disabled tools */
	defaultDisabledTools?: string[];
	/** AI Provider profiles for voice and chat services (Pro-only in practice) */
	aiProviderProfiles?: AIProviderProfile[];
	/** Selected profile ID for Chat (Pro-only) */
	chatProviderProfileId?: string | null;
	/** Selected profile ID for Voice Input (Pro-only) */
	voiceInputProfileId?: string | null;
	/** Selected profile ID for Realtime Voice Agent (Pro-only) */
	realtimeAgentProfileId?: string | null;
	/** Selected model for Realtime Agent (Pro-only) */
	realtimeAgentModel?: string;
	/** OpenAI settings (Pro-only, stub for compat) */
	openai: OpenAISettings;
	/** Periodic notes settings (Pro-only; optional in Basic) */
	periodicNotes?: PeriodicNotesSettings;
	/** Dynamically discovered available models from CLI */
	availableModels?: string[];
	/** Billing multipliers by model ID, fetched from the CLI after connecting */
	modelMultipliers?: Record<string, number>;
	/** Whether the CLI status check has run at least once */
	cliStatusChecked?: boolean;
	/** Last known CLI status from a successful check */
	cliLastKnownStatus?: CliStatus | null;
	/** Extension marketplace catalog URL */
	extensionCatalogUrl?: string;
	/** Enable anonymous extension analytics (install tracking, ratings) */
	enableAnalytics?: boolean;
	/** Custom analytics API endpoint URL */
	analyticsEndpoint?: string;
	/** GitHub username for rating attribution (hashed for privacy) */
	githubUsername?: string;
	/** Generated anonymous ID for users without GitHub username */
	anonymousId?: string;
}

/**
 * The minimal settings surface required by the vault-copilot (Basic) package.
 * This is a subset of CopilotPluginSettings that Basic UI components depend on.
 */
export type BasicCopilotPluginSettings = Pick<
	CopilotPluginSettings,
	| 'aiProvider'
	| 'model'
	| 'cliPath'
	| 'cliUrl'
	| 'streaming'
	| 'requestTimeout'
	| 'backgroundCompactionThreshold'
	| 'bufferExhaustionThreshold'
	| 'timezone'
	| 'weekStartDay'
	| 'tracingEnabled'
	| 'logLevel'
	| 'fileLoggingEnabled'
	| 'logFormat'
	| 'showInStatusBar'
	| 'showRibbonIcon'
	| 'displayWelcomeMessage'
	| 'sessions'
	| 'activeSessionId'
	| 'skillDirectories'
	| 'disabledSkills'
	| 'agentDirectories'
	| 'instructionDirectories'
	| 'promptDirectories'
	| 'automationDirectories'
	| 'slashMenuGrouping'
	| 'defaultEnabledTools'
	| 'defaultDisabledTools'
	| 'availableModels'
	| 'modelMultipliers'
	| 'cliStatusChecked'
	| 'cliLastKnownStatus'
	| 'periodicNotes'
>;
