"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
exports.startCleanup = startCleanup;
exports.resetRateLimiter = resetRateLimiter;
/** Map of user hashes to their rate-limit entries. */
const store = new Map();
/** Interval handle for periodic cleanup. */
let cleanupInterval = null;
/**
 * Get the current rate-limiter configuration from environment variables.
 *
 * @returns A {@link RateLimiterConfig} with values from `RATE_LIMIT_PER_USER`
 *          (defaults to 100 requests per 15-minute window).
 *
 * @internal
 */
function getConfig() {
    const maxRequests = parseInt(process.env.RATE_LIMIT_PER_USER ?? "100", 10);
    return {
        maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 100,
        windowMs: 15 * 60 * 1000, // 15 minutes
    };
}
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
function checkRateLimit(userHash) {
    const config = getConfig();
    const now = Date.now();
    const windowStart = now - config.windowMs;
    let entry = store.get(userHash);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(userHash, entry);
    }
    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
    if (entry.timestamps.length >= config.maxRequests) {
        return false;
    }
    entry.timestamps.push(now);
    return true;
}
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
function startCleanup() {
    if (cleanupInterval) {
        return;
    }
    cleanupInterval = setInterval(() => {
        const config = getConfig();
        const cutoff = Date.now() - config.windowMs;
        for (const [key, entry] of store) {
            entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
            if (entry.timestamps.length === 0) {
                store.delete(key);
            }
        }
    }, 5 * 60 * 1000);
}
/**
 * Reset the rate limiter. Primarily used for testing.
 *
 * @internal
 */
function resetRateLimiter() {
    store.clear();
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}
//# sourceMappingURL=rateLimiter.js.map