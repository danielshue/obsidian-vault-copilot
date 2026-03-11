/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/ExtensionSubmissionService
 * @description Manages extension package submission rate limiting and history.
 *
 * Rate limits are tracked per-user per calendar day (UTC). The daily limit and
 * the maximum zip size are both configurable via plugin settings and exposed in
 * the Extension Admin settings section.
 *
 * @example
 * ```typescript
 * const service = new ExtensionSubmissionService({
 *   dailyRateLimit: 5,
 *   maxZipSizeMb: 10,
 * });
 *
 * const check = service.checkRateLimit("gh:alice", submissionHistory);
 * if (!check.allowed) {
 *   console.warn(`Rate limit reached (${check.submissionsToday}/${check.dailyLimit})`);
 * }
 *
 * const updated = service.recordSubmission("gh:alice", "my-agent", submissionHistory);
 * await plugin.saveSettings();
 * ```
 *
 * @since 0.0.44
 */

import type {
	ExtensionSubmissionRecord,
	ExtensionRateLimitResult,
	ExtensionSubmissionConfig,
} from "./types";

/**
 * Service that enforces per-user daily submission rate limits and maintains
 * an append-only history of accepted submissions.
 *
 * The service is stateless — all mutable state lives in the caller-provided
 * `submissionHistory` array (persisted as part of plugin settings).
 */
export class ExtensionSubmissionService {
	private readonly config: Required<ExtensionSubmissionConfig>;

	/**
	 * @param config - Submission constraints.
	 * @example
	 * ```typescript
	 * const svc = new ExtensionSubmissionService({ dailyRateLimit: 5, maxZipSizeMb: 10 });
	 * ```
	 */
	constructor(config: ExtensionSubmissionConfig) {
		this.config = {
			maxZipSizeMb: config.maxZipSizeMb,
			dailyRateLimit: config.dailyRateLimit,
		};
	}

	/**
	 * Check whether the given user is permitted to make another submission today.
	 *
	 * @param submitterId - Opaque user identifier (GitHub username or anonymous ID).
	 * @param history - All historical submission records (read-only).
	 * @param nowIso - Optional ISO-8601 timestamp for the current time (defaults to now). Used for testing.
	 * @returns A {@link ExtensionRateLimitResult} describing the current state.
	 *
	 * @example
	 * ```typescript
	 * const result = svc.checkRateLimit("gh:alice", plugin.settings.extensionSubmissionHistory ?? []);
	 * if (!result.allowed) {
	 *   new Notice(`You have reached your daily submission limit (${result.dailyLimit}/day).`);
	 * }
	 * ```
	 */
	checkRateLimit(
		submitterId: string,
		history: readonly ExtensionSubmissionRecord[],
		nowIso?: string,
	): ExtensionRateLimitResult {
		const now = nowIso ? new Date(nowIso) : new Date();
		const todayUtc = this.toUtcDateString(now);
		const resetsAt = this.nextMidnightUtcIso(now);

		const submissionsToday = history.filter((record) => {
			if (record.submitterId !== submitterId) return false;
			const recordDate = this.toUtcDateString(new Date(record.submittedAt));
			return recordDate === todayUtc;
		}).length;

		return {
			allowed: submissionsToday < this.config.dailyRateLimit,
			submissionsToday,
			dailyLimit: this.config.dailyRateLimit,
			resetsAt,
		};
	}

	/**
	 * Record a new submission in the history array.
	 *
	 * Returns a **new array** — the caller must persist it (e.g. assign to
	 * `plugin.settings.extensionSubmissionHistory` and call `saveSettings()`).
	 *
	 * @param submitterId - Opaque user identifier.
	 * @param extensionId - The manifest `id` of the submitted extension.
	 * @param history - Existing submission history.
	 * @param nowIso - Optional ISO-8601 timestamp (defaults to now). Used for testing.
	 * @returns New history array with the new record appended.
	 *
	 * @example
	 * ```typescript
	 * plugin.settings.extensionSubmissionHistory = svc.recordSubmission(
	 *   userId, extensionId, plugin.settings.extensionSubmissionHistory ?? []
	 * );
	 * await plugin.saveSettings();
	 * ```
	 */
	recordSubmission(
		submitterId: string,
		extensionId: string,
		history: readonly ExtensionSubmissionRecord[],
		nowIso?: string,
	): ExtensionSubmissionRecord[] {
		const submittedAt = nowIso ?? new Date().toISOString();
		const record: ExtensionSubmissionRecord = {
			submittedAt,
			extensionId,
			submitterId,
		};
		return [...history, record];
	}

	/**
	 * Remove submission records older than the given number of days.
	 *
	 * This is a maintenance helper to prevent the history from growing
	 * unboundedly. It returns a **new array**; the caller must persist it.
	 *
	 * @param history - Existing submission history.
	 * @param retainDays - Keep records from the past N days (default: 7).
	 * @param nowIso - Optional ISO-8601 timestamp (defaults to now). Used for testing.
	 * @returns Pruned history array.
	 *
	 * @example
	 * ```typescript
	 * plugin.settings.extensionSubmissionHistory = svc.pruneHistory(
	 *   plugin.settings.extensionSubmissionHistory ?? [], 7
	 * );
	 * ```
	 */
	pruneHistory(
		history: readonly ExtensionSubmissionRecord[],
		retainDays = 7,
		nowIso?: string,
	): ExtensionSubmissionRecord[] {
		const now = nowIso ? new Date(nowIso) : new Date();
		const cutoff = new Date(now.getTime() - retainDays * 24 * 60 * 60 * 1000);
		return history.filter((record) => new Date(record.submittedAt) >= cutoff);
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	/**
	 * Return the ISO date string (YYYY-MM-DD) in UTC for a given Date object.
	 * @internal
	 */
	private toUtcDateString(date: Date): string {
		return date.toISOString().slice(0, 10);
	}

	/**
	 * Return the ISO-8601 timestamp for the next UTC midnight after `date`.
	 * @internal
	 */
	private nextMidnightUtcIso(date: Date): string {
		const midnight = new Date(date);
		midnight.setUTCHours(24, 0, 0, 0);
		return midnight.toISOString();
	}
}
