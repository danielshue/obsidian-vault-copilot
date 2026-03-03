/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Settings Types (Basic)
 * @description Exports settings types used by vault-copilot (Basic).
 *
 * `BasicCopilotPluginSettings` is the minimal settings surface that the Basic
 * plugin and all vault-copilot UI components depend on.  Pro's full
 * `CopilotPluginSettings` is a structural superset — every Pro settings object
 * satisfies this type without any explicit inheritance relationship.
 *
 * Pro-only fields (telegram, vaults, pinnedCommands, analytics, etc.) are
 * intentionally omitted here; they live in `src/ui/settings/types.ts`.
 *
 * @since 0.1.0
 */

export type {
	CopilotPluginSettings,
	CopilotSession,
	OpenAIProviderProfile,
	AzureOpenAIProviderProfile,
	AIProviderProfile,
	PeriodicNotesSettings,
	VoiceConversation,
	OpenAISettings,
} from "../../../../src/ui/settings/types";

import type { CopilotPluginSettings } from "../../../../src/ui/settings/types";

/**
 * The minimal settings surface required by the vault-copilot (Basic) package.
 *
 * This Pick type is derived from the full `CopilotPluginSettings` so that:
 * - vault-copilot UI components only declare a dependency on fields they actually use.
 * - Pro's full settings object is always structurally assignable here (it is a superset).
 * - A lightweight test-double only needs to supply these fields.
 *
 * @example
 * ```typescript
 * // Constructing a minimal test double
 * const settings: BasicCopilotPluginSettings = {
 *   aiProvider: 'copilot',
 *   model: 'gpt-4o',
 *   sessions: [],
 *   activeSessionId: null,
 *   // ... etc.
 * };
 * ```
 *
 * @since 0.1.0
 */
export type BasicCopilotPluginSettings = Pick<
	CopilotPluginSettings,
	// ── Provider / connection ─────────────────────────────────────
	| 'aiProvider'
	| 'model'
	| 'cliPath'
	| 'cliUrl'
	| 'streaming'
	| 'requestTimeout'
	| 'backgroundCompactionThreshold'
	| 'bufferExhaustionThreshold'
	// ── Session management ────────────────────────────────────────
	| 'sessions'
	| 'activeSessionId'
	// ── UI preferences ────────────────────────────────────────────
	| 'displayWelcomeMessage'
	| 'showInStatusBar'
	| 'slashMenuGrouping'
	| 'timezone'
	| 'weekStartDay'
	// ── Logging / tracing ─────────────────────────────────────────
	| 'tracingEnabled'
	| 'logLevel'
	| 'fileLoggingEnabled'
	| 'logFormat'
	// ── Tool configuration ────────────────────────────────────────
	| 'defaultEnabledTools'
	| 'defaultDisabledTools'
	// ── Directory configuration ───────────────────────────────────
	| 'skillDirectories'
	| 'agentDirectories'
	| 'instructionDirectories'
	| 'promptDirectories'
	| 'automationDirectories'
	| 'disabledSkills'
	// ── AI provider profiles ──────────────────────────────────────
	| 'aiProviderProfiles'
	| 'chatProviderProfileId'
	| 'voiceInputProfileId'
	| 'realtimeAgentProfileId'
	| 'realtimeAgentModel'
	// ── Voice settings ────────────────────────────────────────────
	| 'voice'
	// ── CLI status ────────────────────────────────────────────────
	| 'availableModels'
	| 'cliStatusChecked'
	| 'cliLastKnownStatus'
	// ── OpenAI / periodic notes ───────────────────────────────────
	| 'openai'
	| 'periodicNotes'
>;
