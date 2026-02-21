/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module dateTime
 * @description Shared date/time context utilities for generating timezone-aware
 * date, time, and ISO-date strings used across the plugin.
 *
 * Both the Copilot SDK system prompt, voice agent instructions, and the
 * OpenAI/Azure message context builder use the same temporal awareness block.
 * This module provides a single source of truth so formatting stays consistent.
 *
 * @example
 * ```typescript
 * import { getDateTimeContext, formatDateTimeParts } from "../utils/dateTime";
 *
 * // Full Markdown section for system prompts
 * const block = getDateTimeContext({ timezone: "America/New_York", weekStartDay: "monday" });
 *
 * // Structured parts for custom formatting
 * const parts = formatDateTimeParts({ timezone: "Europe/London" });
 * console.log(parts.formattedDate); // "Friday, February 21, 2026, 11:54 AM GMT"
 * ```
 *
 * @since 0.0.35
 */

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Options for date/time context generation.
 *
 * Both fields are optional — when omitted the system locale / default
 * timezone are used and the week start defaults to Sunday.
 */
export interface DateTimeOptions {
	/** IANA timezone identifier (e.g. 'America/New_York'). System default when omitted. */
	timezone?: string;
	/** Which day the week starts on — used for calendar context. Defaults to "sunday". */
	weekStartDay?: "sunday" | "monday" | "saturday";
}

/**
 * Structured date/time parts returned by {@link formatDateTimeParts}.
 *
 * Callers that need finer control over layout can use these individual
 * pieces instead of the pre-formatted Markdown block.
 */
export interface DateTimeParts {
	/** Human-readable date string, e.g. "Saturday, February 21, 2026, 06:54 AM EST" */
	formattedDate: string;
	/** ISO-format date in the configured timezone, e.g. "2026-02-21" */
	isoDate: string;
	/** Capitalised week-start label, e.g. "Sunday" */
	weekStartLabel: string;
	/** Resolved IANA timezone name, e.g. "America/New_York" (or system default) */
	resolvedTimezone: string;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a Markdown date/time context block suitable for injection into
 * system prompts and agent instructions.
 *
 * The output looks like:
 * ```
 * ## Current Date & Time
 * Today is Saturday, February 21, 2026, 06:54 AM EST.
 * For tools and daily notes, use the date format: 2026-02-21
 * Week starts on: Sunday
 * ```
 *
 * @param options - Timezone and week-start preferences (both optional)
 * @returns Formatted Markdown string (always ends with a trailing newline)
 *
 * @example
 * ```typescript
 * const block = getDateTimeContext({ timezone: "America/New_York", weekStartDay: "monday" });
 * const systemPrompt = block + restOfPrompt;
 * ```
 */
export function getDateTimeContext(options: DateTimeOptions = {}): string {
	const { formattedDate, isoDate, weekStartLabel } = formatDateTimeParts(options);

	return (
		`## Current Date & Time\n` +
		`Today is ${formattedDate}.\n` +
		`For tools and daily notes, use the date format: ${isoDate}\n` +
		`Week starts on: ${weekStartLabel}\n`
	);
}

/**
 * Compute the individual date/time components without any Markdown wrapper.
 *
 * Useful when the caller needs a different layout (e.g. the bracketed
 * `[Current Date & Time]` format used by OpenAI/Azure message context).
 *
 * Falls back to system defaults when a timezone is invalid.
 *
 * @param options - Timezone and week-start preferences (both optional)
 * @returns Structured {@link DateTimeParts}
 *
 * @example
 * ```typescript
 * const parts = formatDateTimeParts({ timezone: "Europe/London" });
 * console.log(parts.isoDate); // "2026-02-21"
 * ```
 */
export function formatDateTimeParts(options: DateTimeOptions = {}): DateTimeParts {
	const now = new Date();
	const timezone = options.timezone || undefined;
	const weekStartDay = options.weekStartDay || "sunday";
	const weekStartLabel = weekStartDay.charAt(0).toUpperCase() + weekStartDay.slice(1);

	try {
		const formattedDate = now.toLocaleDateString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			timeZoneName: "short",
			...(timezone ? { timeZone: timezone } : {}),
		});

		let isoDate: string;
		if (timezone) {
			// en-CA locale gives YYYY-MM-DD format directly
			isoDate = new Intl.DateTimeFormat("en-CA", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				timeZone: timezone,
			}).format(now);
		} else {
			const isoParts = now.toISOString().split("T");
			isoDate = isoParts[0] || now.toISOString().substring(0, 10);
		}

		const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

		return { formattedDate, isoDate, weekStartLabel, resolvedTimezone };
	} catch {
		// Fallback to system default if timezone is invalid
		const formattedDate = now.toLocaleDateString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			timeZoneName: "short",
		});
		const isoParts = now.toISOString().split("T");
		const isoDate = isoParts[0] || now.toISOString().substring(0, 10);
		const resolvedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

		return { formattedDate, isoDate, weekStartLabel, resolvedTimezone };
	}
}
