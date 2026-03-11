/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/extensions/ExtensionSubmissionService
 * @description Unit tests for ExtensionSubmissionService — rate limit enforcement,
 * submission recording, and history pruning.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ExtensionSubmissionService } from "../../src/extensions/ExtensionSubmissionService";
import type { ExtensionSubmissionRecord } from "../../src/extensions/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a submission record at a specific ISO timestamp. */
function makeRecord(
	submitterId: string,
	extensionId: string,
	submittedAt: string,
): ExtensionSubmissionRecord {
	return { submitterId, extensionId, submittedAt };
}

const NOW = "2026-06-15T14:30:00.000Z";   // a fixed "now" for deterministic tests
const TODAY_PREFIX = "2026-06-15";
const YESTERDAY_PREFIX = "2026-06-14";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExtensionSubmissionService", () => {
	let service: ExtensionSubmissionService;

	beforeEach(() => {
		service = new ExtensionSubmissionService({ dailyRateLimit: 5, maxZipSizeMb: 10 });
	});

	// ── checkRateLimit ────────────────────────────────────────────────────

	describe("checkRateLimit", () => {
		it("allows submission when history is empty", () => {
			const result = service.checkRateLimit("alice", [], NOW);

			expect(result.allowed).toBe(true);
			expect(result.submissionsToday).toBe(0);
			expect(result.dailyLimit).toBe(5);
		});

		it("counts only today's submissions for the given user", () => {
			const history: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "ext-a", `${TODAY_PREFIX}T08:00:00Z`),
				makeRecord("alice", "ext-b", `${TODAY_PREFIX}T10:00:00Z`),
				makeRecord("bob", "ext-c", `${TODAY_PREFIX}T09:00:00Z`),   // different user
				makeRecord("alice", "ext-d", `${YESTERDAY_PREFIX}T10:00:00Z`), // yesterday
			];

			const result = service.checkRateLimit("alice", history, NOW);

			expect(result.submissionsToday).toBe(2);
			expect(result.allowed).toBe(true);
		});

		it("blocks when user has reached the daily limit", () => {
			const history: ExtensionSubmissionRecord[] = Array.from({ length: 5 }, (_, i) =>
				makeRecord("alice", `ext-${i}`, `${TODAY_PREFIX}T0${i}:00:00Z`),
			);

			const result = service.checkRateLimit("alice", history, NOW);

			expect(result.allowed).toBe(false);
			expect(result.submissionsToday).toBe(5);
		});

		it("allows submission when limit is not reached", () => {
			const history: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "ext-a", `${TODAY_PREFIX}T08:00:00Z`),
				makeRecord("alice", "ext-b", `${TODAY_PREFIX}T09:00:00Z`),
			];

			const result = service.checkRateLimit("alice", history, NOW);

			expect(result.allowed).toBe(true);
			expect(result.submissionsToday).toBe(2);
		});

		it("treats different users independently", () => {
			const history: ExtensionSubmissionRecord[] = Array.from({ length: 5 }, (_, i) =>
				makeRecord("alice", `ext-${i}`, `${TODAY_PREFIX}T0${i}:00:00Z`),
			);

			const aliceResult = service.checkRateLimit("alice", history, NOW);
			const bobResult = service.checkRateLimit("bob", history, NOW);

			expect(aliceResult.allowed).toBe(false);
			expect(bobResult.allowed).toBe(true);
		});

		it("includes a resetsAt timestamp pointing to the next UTC midnight", () => {
			const result = service.checkRateLimit("alice", [], NOW);

			expect(result.resetsAt).toBe("2026-06-16T00:00:00.000Z");
		});

		it("uses a custom dailyRateLimit", () => {
			const strictService = new ExtensionSubmissionService({
				dailyRateLimit: 2,
				maxZipSizeMb: 10,
			});
			const history: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "ext-a", `${TODAY_PREFIX}T08:00:00Z`),
				makeRecord("alice", "ext-b", `${TODAY_PREFIX}T09:00:00Z`),
			];

			const result = strictService.checkRateLimit("alice", history, NOW);

			expect(result.allowed).toBe(false);
			expect(result.dailyLimit).toBe(2);
		});
	});

	// ── recordSubmission ──────────────────────────────────────────────────

	describe("recordSubmission", () => {
		it("appends a new record to the history", () => {
			const existing: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "ext-a", `${TODAY_PREFIX}T08:00:00Z`),
			];

			const updated = service.recordSubmission("alice", "ext-b", existing, NOW);

			expect(updated).toHaveLength(2);
			expect(updated[1].extensionId).toBe("ext-b");
			expect(updated[1].submitterId).toBe("alice");
			expect(updated[1].submittedAt).toBe(NOW);
		});

		it("does not mutate the original history array", () => {
			const original: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "ext-a", `${TODAY_PREFIX}T08:00:00Z`),
			];
			const originalLength = original.length;

			service.recordSubmission("alice", "ext-b", original, NOW);

			expect(original).toHaveLength(originalLength);
		});

		it("works with an empty history", () => {
			const updated = service.recordSubmission("alice", "ext-a", [], NOW);

			expect(updated).toHaveLength(1);
			expect(updated[0].extensionId).toBe("ext-a");
		});

		it("defaults nowIso to the current time when not provided", () => {
			const before = Date.now();
			const updated = service.recordSubmission("alice", "ext-a", []);
			const after = Date.now();

			const recordTime = new Date(updated[0].submittedAt).getTime();
			expect(recordTime).toBeGreaterThanOrEqual(before);
			expect(recordTime).toBeLessThanOrEqual(after);
		});
	});

	// ── pruneHistory ──────────────────────────────────────────────────────

	describe("pruneHistory", () => {
		it("removes records older than retainDays", () => {
			const history: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "old", "2026-06-01T10:00:00Z"),   // 14 days ago
				makeRecord("alice", "recent", "2026-06-14T10:00:00Z"), // 1 day ago
				makeRecord("alice", "today", NOW),
			];

			const pruned = service.pruneHistory(history, 7, NOW);

			expect(pruned.map((r) => r.extensionId)).toEqual(["recent", "today"]);
		});

		it("retains all records when all are within retainDays", () => {
			const history: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "ext-a", "2026-06-14T10:00:00Z"),
				makeRecord("alice", "ext-b", NOW),
			];

			const pruned = service.pruneHistory(history, 7, NOW);

			expect(pruned).toHaveLength(2);
		});

		it("returns empty array when all records are old", () => {
			const history: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "ext-a", "2025-01-01T00:00:00Z"),
			];

			const pruned = service.pruneHistory(history, 7, NOW);

			expect(pruned).toHaveLength(0);
		});

		it("does not mutate the original history array", () => {
			const history: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "old", "2026-06-01T10:00:00Z"),
			];
			const originalLength = history.length;

			service.pruneHistory(history, 7, NOW);

			expect(history).toHaveLength(originalLength);
		});

		it("uses 7-day retention by default", () => {
			const history: ExtensionSubmissionRecord[] = [
				makeRecord("alice", "old", "2026-06-07T10:00:00Z"),  // exactly 8 days ago
				makeRecord("alice", "new", "2026-06-09T10:00:00Z"),  // 6 days ago
			];

			// NOW = 2026-06-15, so cutoff is 2026-06-08T14:30:00.000Z (7 days before)
			const pruned = service.pruneHistory(history, undefined, NOW);

			expect(pruned.map((r) => r.extensionId)).toEqual(["new"]);
		});
	});
});
