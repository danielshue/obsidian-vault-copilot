/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module LogTaxonomy
 * @description Canonical logging taxonomy for Vault Copilot.
 *
 * Provides a single source of truth for:
 * - canonical source names
 * - source alias normalization
 * - source grouping for SDK log filtering UI
 * - message normalization and argument serialization
 *
 * @example
 * ```typescript
 * const source = normalizeLogSource("sdk-debug"); // "copilot-sdk"
 * const group = getLogSourceGroup(source); // "cli"
 * const message = normalizeLogMessage("[VaultCopilot] Started", source); // "Started"
 * ```
 *
 * @since 0.0.35
 */

/** Canonical source identifiers used in SDK/file logs. */
export const LOG_SOURCES = {
	UNKNOWN: "unknown",
	BOOTSTRAP: "bootstrap",
	COPILOT_SDK: "copilot-sdk",
	TRACE: "trace",
	SDK_EVENT: "sdk-event",
	SESSION_STATE: "session-state",
	USER_EVENT: "user-event",
	ASSISTANT_EVENT: "assistant-event",
	TOOL_EVENT: "tool-event",
	SUBAGENT_EVENT: "subagent-event",
	HOOK_EVENT: "hook-event",
	SYSTEM_EVENT: "system-event",
	REALTIME_AGENT: "realtime-agent",
	VOICE_CHAT: "voice-chat",
	WHISPER_OPENAI: "whisper-openai",
	WHISPER_AZURE: "whisper-azure",
	WHISPER_LOCAL: "whisper-local",
	WHISPER_CPP: "whisper-cpp",
	SESSION_LIFECYCLE: "session-lifecycle",
	COPILOT_PROMPT: "copilot-prompt",
	COPILOT_RESPONSE: "copilot-response",
	COPILOT_ERROR: "copilot-error",
	COPILOT_EVENT: "copilot-event",
	TOOL_CONTEXT: "tool-context",
} as const;

/** Canonical source union type. */
export type CanonicalLogSource = (typeof LOG_SOURCES)[keyof typeof LOG_SOURCES];

/** Filter-rail source groups used by TracingModal. */
export type LogSourceGroup = "voice" | "cli" | "service";

const SOURCE_ALIASES: Record<string, CanonicalLogSource> = {
	sdk: LOG_SOURCES.COPILOT_SDK,
	"sdk-log": LOG_SOURCES.COPILOT_SDK,
	"sdk-debug": LOG_SOURCES.COPILOT_SDK,
	"copilot-cli": LOG_SOURCES.COPILOT_SDK,
};

const VOICE_SOURCES: ReadonlySet<string> = new Set([
	LOG_SOURCES.REALTIME_AGENT,
	LOG_SOURCES.VOICE_CHAT,
	LOG_SOURCES.WHISPER_OPENAI,
	LOG_SOURCES.WHISPER_AZURE,
	LOG_SOURCES.WHISPER_LOCAL,
	LOG_SOURCES.WHISPER_CPP,
]);

const CLI_SOURCES: ReadonlySet<string> = new Set([
	LOG_SOURCES.COPILOT_SDK,
	LOG_SOURCES.COPILOT_PROMPT,
	LOG_SOURCES.COPILOT_RESPONSE,
	LOG_SOURCES.COPILOT_ERROR,
	LOG_SOURCES.COPILOT_EVENT,
]);

const SOURCE_PREFIX_PATTERNS: RegExp[] = [
	/^\[(?:vault\s?copilot(?:\sdiag)?)\]\s*/i,
	/^\[(?:main\s?vault\sassistant|mainvaultassistant)\]\s*/i,
	/^\[(?:copilot(?:-sdk|-cli)?)\]\s*/i,
];

/**
 * Normalize any source string into canonical form where possible.
 *
 * @param source - Raw source tag
 * @returns Canonical source if known; otherwise normalized lowercase source
 */
export function normalizeLogSource(source: string): string {
	const normalized = (source || "").trim().toLowerCase();
	if (!normalized) {
		return LOG_SOURCES.UNKNOWN;
	}

	return SOURCE_ALIASES[normalized] ?? normalized;
}

/**
 * Map a source to TracingModal grouping buckets.
 *
 * @param source - Raw or normalized source
 * @returns `voice`, `cli`, or `service`
 */
export function getLogSourceGroup(source: string): LogSourceGroup {
	const normalized = normalizeLogSource(source);
	if (VOICE_SOURCES.has(normalized)) {
		return "voice";
	}
	if (CLI_SOURCES.has(normalized)) {
		return "cli";
	}
	return "service";
}

/**
 * Normalize message text for consistent on-disk rendering.
 *
 * Removes duplicate leading tags that repeat source context.
 *
 * @param message - Original message text
 * @param source - Source tag (raw or normalized)
 * @returns Trimmed normalized text or `(no details)`
 */
export function normalizeLogMessage(message: string, source: string): string {
	const original = (message || "").replace(/\r\n/g, "\n").trim();
	if (!original) {
		return "(no details)";
	}

	let normalized = original;
	const sourceNormalized = normalizeLogSource(source);

	for (let i = 0; i < 4; i++) {
		let changed = false;
		for (const pattern of SOURCE_PREFIX_PATTERNS) {
			if (sourceNormalized === LOG_SOURCES.TRACE && pattern.source.includes("main")) {
				continue;
			}

			const next = normalized.replace(pattern, "").trimStart();
			if (next !== normalized) {
				normalized = next;
				changed = true;
			}
		}
		if (!changed) {
			break;
		}
	}

	return normalized.trim() || "(no details)";
}

/**
 * Serialize a single value for log message output.
 *
 * @param value - Value to serialize
 * @returns Stable string representation
 */
export function serializeLogValue(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (value instanceof Error) {
		return value.stack || `${value.name}: ${value.message}`;
	}
	try {
		const serialized = JSON.stringify(value);
		return serialized === undefined ? String(value) : serialized;
	} catch {
		return String(value);
	}
}

/**
 * Flatten an arbitrary argument array into one log message string.
 *
 * @param args - Values to flatten
 * @returns Joined serialized message text
 */
export function flattenLogArgs(args: unknown[]): string {
	return args.map((value) => serializeLogValue(value)).join(" ");
}
