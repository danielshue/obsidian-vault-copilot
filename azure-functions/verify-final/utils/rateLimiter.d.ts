/**
 * Check whether a request from the given user hash should be rate-limited.
 *
 * @param userHash - The SHA-256 hash identifying the user.
 * @returns `true` if the request is **allowed**, `false` if the user has
 *          exceeded the rate limit.
 *
 * @example
 * ```typescript
 * if (!checkRateLimit(userHash)) {
 *     return { status: 429, body: "Too many requests" };
 * }
 * ```
 */
export declare function checkRateLimit(userHash: string): boolean;
/**
 * Start a periodic cleanup job that evicts stale entries from the store.
 *
 * Call this once during application startup. The cleanup runs every 5 minutes.
 *
 * @example
 * ```typescript
 * startCleanup();
 * ```
 */
export declare function startCleanup(): void;
/**
 * Reset the rate limiter. Primarily used for testing.
 *
 * @internal
 */
export declare function resetRateLimiter(): void;
//# sourceMappingURL=rateLimiter.d.ts.map