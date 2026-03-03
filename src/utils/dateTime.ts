/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module dateTime (Basic)
 * @description Minimal date/time utilities for Basic plugin.
 * 
 * Basic uses simplified date formatting without timezone/weekStartDay settings.
 * Pro has the full implementation with timezone support.
 * 
 * @since 0.1.0
 */

/** Options for date/time formatting (Basic ignores these but keeps the interface) */
export interface DateTimeOptions {
	timezone?: string;
	weekStartDay?: "sunday" | "monday" | "saturday";
}

/** Structured date/time parts */
export interface DateTimeParts {
	formattedDate: string;
	isoDate: string;
	weekStartLabel: string;
	resolvedTimezone: string;
}

/**
 * Format date/time parts using system defaults.
 * Basic ignores timezone/weekStartDay options.
 */
export function formatDateTimeParts(_options: DateTimeOptions = {}): DateTimeParts {
	const now = new Date();
	
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
	
	return {
		formattedDate,
		isoDate,
		weekStartLabel: "Sunday",
		resolvedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	};
}

/**
 * Get a Markdown date/time context block for system prompts.
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
