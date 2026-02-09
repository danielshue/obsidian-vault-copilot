/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/extensions/ExtensionAnalyticsService.test
 * @description Unit tests for ExtensionAnalyticsService
 *
 * Tests cover all public methods: trackInstall, trackUninstall, submitRating,
 * deleteRating, getMetrics, getBatchMetrics, getUserRatings, getUserData,
 * and deleteUserData. HTTP requests are mocked via Obsidian's requestUrl.
 *
 * @since 0.1.0
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	ExtensionAnalyticsService,
	InstallTrackingEvent,
	RatingSubmission,
} from "../../extensions/ExtensionAnalyticsService";
import { requestUrl, type RequestUrlResponse } from "obsidian";

// Use the mock from __mocks__/obsidian.ts (resolved via vitest alias)
const mockRequestUrl = vi.mocked(requestUrl);

/** Build a complete mock RequestUrlResponse with sensible defaults. */
function mockResponse(partial: { status: number; json: any; text: string }): RequestUrlResponse {
	return {
		...partial,
		headers: {},
		arrayBuffer: new ArrayBuffer(0),
	};
}

describe("ExtensionAnalyticsService", () => {
	let service: ExtensionAnalyticsService;
	const BASE_URL = "https://vault-copilot-api.azurewebsites.net/api";

	beforeEach(() => {
		service = new ExtensionAnalyticsService(BASE_URL);
		mockRequestUrl.mockReset();
	});

	/* -------------------------------------------------------------- */
	/*  Constructor                                                    */
	/* -------------------------------------------------------------- */

	describe("constructor", () => {
		it("should strip trailing slashes from base URL", () => {
			const svc = new ExtensionAnalyticsService("https://example.com/api///");
			// We can't inspect private property directly; test via request URL
			mockRequestUrl.mockResolvedValue(mockResponse({ status: 200, json: { extensionId: "test" }, text: "{}" }));
			svc.getMetrics("test");
			// The URL should not have triple slashes
			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: "https://example.com/api/api/metrics/test",
				}),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  trackInstall                                                   */
	/* -------------------------------------------------------------- */

	describe("trackInstall", () => {
		const event: InstallTrackingEvent = {
			extensionId: "daily-journal",
			version: "1.0.0",
			userHash: "a".repeat(64),
			platform: "desktop",
			vaultCopilotVersion: "0.0.20",
			timestamp: "2026-02-08T12:00:00Z",
		};

		it("should POST to /api/installs with correct payload", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({ status: 201, json: { success: true }, text: "" }));

			await service.trackInstall(event);

			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: `${BASE_URL}/api/installs`,
					method: "POST",
					body: JSON.stringify(event),
					headers: expect.objectContaining({
						"Content-Type": "application/json",
					}),
				}),
			);
		});

		it("should throw on HTTP 400 response", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 400,
				json: { error: "Invalid extensionId" },
				text: '{"error":"Invalid extensionId"}',
			}));

			await expect(service.trackInstall(event)).rejects.toThrow("Invalid extensionId");
		});

		it("should throw generic message on non-JSON error", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({ status: 500, json: null, text: "" }));

			await expect(service.trackInstall(event)).rejects.toThrow("HTTP 500");
		});
	});

	/* -------------------------------------------------------------- */
	/*  trackUninstall                                                 */
	/* -------------------------------------------------------------- */

	describe("trackUninstall", () => {
		it("should POST to /api/uninstalls", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({ status: 200, json: { success: true }, text: "" }));

			await service.trackUninstall({
				extensionId: "daily-journal",
				userHash: "b".repeat(64),
				timestamp: "2026-02-08T14:00:00Z",
			});

			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: `${BASE_URL}/api/uninstalls`,
					method: "POST",
				}),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  submitRating                                                   */
	/* -------------------------------------------------------------- */

	describe("submitRating", () => {
		const submission: RatingSubmission = {
			extensionId: "daily-journal",
			rating: 5,
			userHash: "c".repeat(64),
			comment: "Excellent extension!",
			version: "1.0.0",
		};

		it("should POST to /api/ratings and return aggregate data", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 200,
				json: {
					success: true,
					message: "Rating submitted",
					aggregateRating: 4.8,
					ratingCount: 89,
				},
				text: "{}",
			}));

			const result = await service.submitRating(submission);

			expect(result.aggregateRating).toBe(4.8);
			expect(result.ratingCount).toBe(89);
			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: `${BASE_URL}/api/ratings`,
					method: "POST",
					body: JSON.stringify(submission),
				}),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  deleteRating                                                   */
	/* -------------------------------------------------------------- */

	describe("deleteRating", () => {
		it("should send DELETE to /api/ratings/{extensionId}/{userHash}", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({ status: 204, json: null, text: "" }));

			await service.deleteRating("daily-journal", "d".repeat(64));

			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: `${BASE_URL}/api/ratings/daily-journal/${"d".repeat(64)}`,
					method: "DELETE",
				}),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  getMetrics                                                     */
	/* -------------------------------------------------------------- */

	describe("getMetrics", () => {
		it("should GET /api/metrics/{extensionId}", async () => {
			const metricsResponse = {
				extensionId: "daily-journal",
				totalInstalls: 405,
				activeInstalls: 371,
				averageRating: 4.8,
				ratingCount: 89,
				lastUpdated: "2026-02-08T15:00:00Z",
			};
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 200,
				json: metricsResponse,
				text: JSON.stringify(metricsResponse),
			}));

			const result = await service.getMetrics("daily-journal");

			expect(result.totalInstalls).toBe(405);
			expect(result.activeInstalls).toBe(371);
			expect(result.averageRating).toBe(4.8);
		});

		it("should URL-encode special characters in extensionId", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 200,
				json: { extensionId: "my ext" },
				text: "{}",
			}));

			await service.getMetrics("my ext");

			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: `${BASE_URL}/api/metrics/my%20ext`,
				}),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  getBatchMetrics                                                */
	/* -------------------------------------------------------------- */

	describe("getBatchMetrics", () => {
		it("should GET /api/metrics?ids=... with comma-separated IDs", async () => {
			const batchResponse = {
				"ext-a": { totalInstalls: 100 },
				"ext-b": { totalInstalls: 200 },
			};
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 200,
				json: batchResponse,
				text: JSON.stringify(batchResponse),
			}));

			const result = await service.getBatchMetrics(["ext-a", "ext-b"]);

			expect(result["ext-a"]!.totalInstalls).toBe(100);
			expect(result["ext-b"]!.totalInstalls).toBe(200);
			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: `${BASE_URL}/api/metrics?ids=ext-a,ext-b`,
				}),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  getUserRatings                                                 */
	/* -------------------------------------------------------------- */

	describe("getUserRatings", () => {
		it("should GET /api/user/{userHash}/ratings", async () => {
			const ratings = [
				{ extensionId: "ext-a", rating: 5, submittedDate: "2026-01-01T00:00:00Z", updatedDate: "2026-01-01T00:00:00Z" },
			];
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 200,
				json: ratings,
				text: JSON.stringify(ratings),
			}));

			const result = await service.getUserRatings("e".repeat(64));

			expect(result).toHaveLength(1);
			expect(result[0]!.rating).toBe(5);
		});
	});

	/* -------------------------------------------------------------- */
	/*  getUserData                                                    */
	/* -------------------------------------------------------------- */

	describe("getUserData", () => {
		it("should GET /api/user/{userHash}/data", async () => {
			const data = {
				installs: [{ extensionId: "ext-a", version: "1.0.0", installDate: "2026-01-01", isActive: true }],
				ratings: [],
			};
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 200,
				json: data,
				text: JSON.stringify(data),
			}));

			const result = await service.getUserData("f".repeat(64));

			expect(result.installs).toHaveLength(1);
			expect(result.ratings).toHaveLength(0);
		});
	});

	/* -------------------------------------------------------------- */
	/*  deleteUserData                                                 */
	/* -------------------------------------------------------------- */

	describe("deleteUserData", () => {
		it("should DELETE /api/user/{userHash}", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({ status: 204, json: null, text: "" }));

			await service.deleteUserData("g".repeat(64));

			expect(mockRequestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: `${BASE_URL}/api/user/${"g".repeat(64)}`,
					method: "DELETE",
				}),
			);
		});

		it("should throw on 404 response", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 404,
				json: { error: "User not found" },
				text: '{"error":"User not found"}',
			}));

			await expect(service.deleteUserData("z".repeat(64))).rejects.toThrow("User not found");
		});
	});

	/* -------------------------------------------------------------- */
	/*  Error handling edge-cases                                      */
	/* -------------------------------------------------------------- */

	describe("error handling", () => {
		it("should handle 204 No Content gracefully for void endpoints", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({ status: 204, json: null, text: "" }));

			// Should not throw
			await expect(service.trackInstall({
				extensionId: "test",
				version: "1.0.0",
				userHash: "h".repeat(64),
				platform: "mobile",
				vaultCopilotVersion: "0.0.20",
				timestamp: new Date().toISOString(),
			})).resolves.toBeUndefined();
		});

		it("should handle 429 rate limit errors", async () => {
			mockRequestUrl.mockResolvedValue(mockResponse({
				status: 429,
				json: { error: "Rate limit exceeded" },
				text: '{"error":"Rate limit exceeded"}',
			}));

			await expect(service.trackInstall({
				extensionId: "test",
				version: "1.0.0",
				userHash: "i".repeat(64),
				platform: "desktop",
				vaultCopilotVersion: "0.0.20",
				timestamp: new Date().toISOString(),
			})).rejects.toThrow("Rate limit exceeded");
		});
	});
});
