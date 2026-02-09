"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableStorageService = void 0;
/**
 * @module TableStorageService
 * @description Azure Table Storage service for the analytics API.
 *
 * Manages three tables — **Installs**, **Ratings**, and **MetricsCache** — and
 * exposes high-level CRUD helpers consumed by the HTTP function handlers.
 *
 * Authentication uses `DefaultAzureCredential` (Managed Identity / AZ CLI)
 * because the storage account has `allowSharedKeyAccess: false`.
 *
 * @example
 * ```typescript
 * const svc = TableStorageService.getInstance();
 * await svc.ensureTablesExist();
 * await svc.trackInstall({ extensionId: "my-ext", ... });
 * ```
 *
 * @since 1.0.0
 */
const data_tables_1 = require("@azure/data-tables");
const identity_1 = require("@azure/identity");
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
/**
 * Singleton service that wraps Azure Table Storage operations.
 *
 * All public methods are `async` and throw on unrecoverable errors; callers
 * are expected to catch and map to HTTP responses.
 */
class TableStorageService {
    static instance = null;
    installsClient;
    ratingsClient;
    metricsCacheClient;
    /**
     * Construct a new service instance.
     *
     * @internal – use {@link getInstance} instead.
     */
    constructor() {
        const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        if (!accountName) {
            throw new Error("AZURE_STORAGE_ACCOUNT_NAME environment variable is not set");
        }
        const endpoint = `https://${accountName}.table.core.windows.net`;
        const credential = new identity_1.DefaultAzureCredential();
        this.installsClient = new data_tables_1.TableClient(endpoint, "Installs", credential);
        this.ratingsClient = new data_tables_1.TableClient(endpoint, "Ratings", credential);
        this.metricsCacheClient = new data_tables_1.TableClient(endpoint, "MetricsCache", credential);
    }
    /**
     * Return the singleton instance, creating it on first call.
     *
     * @returns The shared {@link TableStorageService}.
     *
     * @example
     * ```typescript
     * const svc = TableStorageService.getInstance();
     * ```
     */
    static getInstance() {
        if (!TableStorageService.instance) {
            TableStorageService.instance = new TableStorageService();
        }
        return TableStorageService.instance;
    }
    /**
     * Reset the singleton (for testing purposes).
     * @internal
     */
    static resetInstance() {
        TableStorageService.instance = null;
    }
    // -----------------------------------------------------------------------
    // Table bootstrapping
    // -----------------------------------------------------------------------
    /**
     * Create the backing tables if they do not already exist.
     *
     * Safe to call multiple times — Azure Table Storage ignores duplicate
     * create requests.
     *
     * @example
     * ```typescript
     * await svc.ensureTablesExist();
     * ```
     */
    async ensureTablesExist() {
        await Promise.all([
            this.installsClient.createTable(),
            this.ratingsClient.createTable(),
            this.metricsCacheClient.createTable(),
        ]);
    }
    // -----------------------------------------------------------------------
    // Installs
    // -----------------------------------------------------------------------
    /**
     * Record a new extension installation.
     *
     * Inserts a row into the **Installs** table and refreshes the metrics
     * cache for the extension.
     *
     * @param event - The install event payload.
     *
     * @example
     * ```typescript
     * await svc.trackInstall({
     *     extensionId: "my-ext",
     *     userHash: "abc...def",
     *     version: "1.0.0",
     *     platform: "desktop",
     *     vaultCopilotVersion: "0.1.0",
     * });
     * ```
     */
    async trackInstall(event) {
        const now = new Date().toISOString();
        const sanitizedTimestamp = now.replace(/:/g, "-");
        const entity = {
            partitionKey: event.extensionId,
            rowKey: `${event.userHash}_${sanitizedTimestamp}`,
            UserHash: event.userHash,
            Version: event.version,
            Platform: event.platform,
            VaultCopilotVersion: event.vaultCopilotVersion,
            InstallDate: now,
            IsActive: true,
        };
        await this.installsClient.createEntity(entity);
        await this.refreshMetricsCache(event.extensionId);
    }
    /**
     * Mark the most recent active install for a user as inactive (uninstall).
     *
     * Scans the Installs partition for the extension, finds the latest
     * active row for the given user, and updates it.
     *
     * @param extensionId - The extension being uninstalled.
     * @param userHash    - The user performing the uninstall.
     *
     * @example
     * ```typescript
     * await svc.trackUninstall("my-ext", "abc...def");
     * ```
     */
    async trackUninstall(extensionId, userHash) {
        const now = new Date().toISOString();
        // Find all installs for this user+extension
        const entities = [];
        const query = this.installsClient.listEntities({
            queryOptions: {
                filter: (0, data_tables_1.odata) `PartitionKey eq ${extensionId} and IsActive eq true and UserHash eq ${userHash}`,
            },
        });
        for await (const entity of query) {
            entities.push(entity);
        }
        if (entities.length === 0) {
            return; // nothing to uninstall
        }
        // Sort by InstallDate descending, mark the latest one inactive
        entities.sort((a, b) => (b.InstallDate ?? "").localeCompare(a.InstallDate ?? ""));
        const latest = entities[0];
        await this.installsClient.updateEntity({
            partitionKey: latest.partitionKey,
            rowKey: latest.rowKey,
            IsActive: false,
            UninstallDate: now,
        }, "Merge");
        await this.refreshMetricsCache(extensionId);
    }
    // -----------------------------------------------------------------------
    // Ratings
    // -----------------------------------------------------------------------
    /**
     * Submit or update a rating for an extension.
     *
     * Uses an upsert so each user can have at most one rating per extension.
     * After writing, the metrics cache is refreshed.
     *
     * @param submission - The rating payload.
     * @returns The updated aggregate rating and count.
     *
     * @example
     * ```typescript
     * const { averageRating, ratingCount } = await svc.submitRating({
     *     extensionId: "my-ext",
     *     userHash: "abc...def",
     *     rating: 5,
     *     comment: "Great!",
     *     version: "1.0.0",
     * });
     * ```
     */
    async submitRating(submission) {
        const now = new Date().toISOString();
        // Check if rating already exists to preserve SubmittedDate
        let submittedDate = now;
        try {
            const existing = await this.ratingsClient.getEntity(submission.extensionId, submission.userHash);
            submittedDate = existing.SubmittedDate ?? now;
        }
        catch {
            // Entity doesn't exist yet — first rating
        }
        const entity = {
            partitionKey: submission.extensionId,
            rowKey: submission.userHash,
            Rating: submission.rating,
            Comment: submission.comment ?? "",
            Version: submission.version,
            SubmittedDate: submittedDate,
            UpdatedDate: now,
        };
        await this.ratingsClient.upsertEntity(entity, "Replace");
        await this.refreshMetricsCache(submission.extensionId);
        const metrics = await this.getMetrics(submission.extensionId);
        return {
            averageRating: metrics.averageRating,
            ratingCount: metrics.ratingCount,
        };
    }
    /**
     * Delete a specific rating for an extension from a user.
     *
     * @param extensionId - The extension whose rating should be removed.
     * @param userHash    - The user whose rating should be removed.
     *
     * @example
     * ```typescript
     * await svc.deleteRating("my-ext", "abc...def");
     * ```
     */
    async deleteRating(extensionId, userHash) {
        try {
            await this.ratingsClient.deleteEntity(extensionId, userHash);
        }
        catch (err) {
            const status = err.statusCode;
            if (status !== 404) {
                throw err;
            }
        }
        await this.refreshMetricsCache(extensionId);
    }
    /**
     * Retrieve all ratings (with comments) for an extension, sorted by most
     * recent first.
     *
     * @param extensionId - The extension to query.
     * @returns Array of rating objects with user hash, rating, comment, and dates.
     *
     * @example
     * ```typescript
     * const reviews = await svc.getExtensionRatings("my-ext");
     * ```
     */
    async getExtensionRatings(extensionId) {
        const ratings = [];
        const query = this.ratingsClient.listEntities({
            queryOptions: {
                filter: (0, data_tables_1.odata) `PartitionKey eq ${extensionId}`,
            },
        });
        for await (const entity of query) {
            ratings.push({
                rating: entity.Rating,
                comment: entity.Comment ?? "",
                version: entity.Version ?? "",
                submittedDate: entity.SubmittedDate ?? "",
                updatedDate: entity.UpdatedDate ?? "",
            });
        }
        // Sort by most recently updated first
        ratings.sort((a, b) => b.updatedDate.localeCompare(a.updatedDate));
        return ratings;
    }
    // -----------------------------------------------------------------------
    // Metrics
    // -----------------------------------------------------------------------
    /**
     * Retrieve cached metrics for a single extension.
     *
     * If the cache row does not yet exist the metrics are computed from raw
     * data and persisted for future reads.
     *
     * @param extensionId - The extension to query.
     * @returns Aggregated {@link ExtensionMetrics}.
     *
     * @example
     * ```typescript
     * const metrics = await svc.getMetrics("my-ext");
     * ```
     */
    async getMetrics(extensionId) {
        try {
            const cached = await this.metricsCacheClient.getEntity(extensionId, "summary");
            return {
                extensionId,
                totalInstalls: cached.TotalInstalls,
                activeInstalls: cached.ActiveInstalls,
                averageRating: cached.AverageRating,
                ratingCount: cached.RatingCount,
                lastUpdated: cached.LastUpdated,
            };
        }
        catch {
            // Cache miss — compute from source data
            await this.refreshMetricsCache(extensionId);
            return this.getMetrics(extensionId);
        }
    }
    /**
     * Retrieve cached metrics for multiple extensions in one call.
     *
     * @param extensionIds - Array of extension identifiers (max 50).
     * @returns A map of extensionId → {@link ExtensionMetrics}.
     *
     * @example
     * ```typescript
     * const batch = await svc.getBatchMetrics(["ext-a", "ext-b"]);
     * ```
     */
    async getBatchMetrics(extensionIds) {
        const results = {};
        await Promise.all(extensionIds.map(async (id) => {
            try {
                results[id] = await this.getMetrics(id);
            }
            catch {
                // Extension has no data yet — return zeroes
                results[id] = {
                    extensionId: id,
                    totalInstalls: 0,
                    activeInstalls: 0,
                    averageRating: 0,
                    ratingCount: 0,
                    lastUpdated: new Date().toISOString(),
                };
            }
        }));
        return results;
    }
    // -----------------------------------------------------------------------
    // User data (GDPR)
    // -----------------------------------------------------------------------
    /**
     * Retrieve all data associated with a user hash.
     *
     * Queries both the Installs and Ratings tables. Used to fulfil GDPR
     * data-export (right of access) requests.
     *
     * @param userHash - The SHA-256 user hash.
     * @returns A {@link UserData} object containing all matching rows.
     *
     * @example
     * ```typescript
     * const data = await svc.getUserData("abc...def");
     * ```
     */
    async getUserData(userHash) {
        const installs = [];
        const ratings = [];
        // Installs — UserHash is a column, not the partition key, so we
        // need a table-wide filter.
        const installQuery = this.installsClient.listEntities({
            queryOptions: {
                filter: (0, data_tables_1.odata) `UserHash eq ${userHash}`,
            },
        });
        for await (const entity of installQuery) {
            installs.push(entity);
        }
        // Ratings — RowKey is the userHash, so we query across all partitions.
        const ratingQuery = this.ratingsClient.listEntities({
            queryOptions: {
                filter: (0, data_tables_1.odata) `RowKey eq ${userHash}`,
            },
        });
        for await (const entity of ratingQuery) {
            ratings.push(entity);
        }
        return { userHash, installs, ratings };
    }
    /**
     * Delete all data associated with a user hash (GDPR right to erasure).
     *
     * Removes matching rows from both the Installs and Ratings tables, then
     * refreshes the metrics cache for every affected extension.
     *
     * @param userHash - The SHA-256 user hash whose data should be purged.
     *
     * @example
     * ```typescript
     * await svc.deleteUserData("abc...def");
     * ```
     */
    async deleteUserData(userHash) {
        const affectedExtensions = new Set();
        // Delete installs
        const installQuery = this.installsClient.listEntities({
            queryOptions: {
                filter: (0, data_tables_1.odata) `UserHash eq ${userHash}`,
            },
        });
        for await (const entity of installQuery) {
            affectedExtensions.add(entity.partitionKey);
            await this.installsClient.deleteEntity(entity.partitionKey, entity.rowKey);
        }
        // Delete ratings
        const ratingQuery = this.ratingsClient.listEntities({
            queryOptions: {
                filter: (0, data_tables_1.odata) `RowKey eq ${userHash}`,
            },
        });
        for await (const entity of ratingQuery) {
            affectedExtensions.add(entity.partitionKey);
            await this.ratingsClient.deleteEntity(entity.partitionKey, entity.rowKey);
        }
        // Refresh caches for all affected extensions
        await Promise.all([...affectedExtensions].map((id) => this.refreshMetricsCache(id)));
    }
    // -----------------------------------------------------------------------
    // Cache refresh
    // -----------------------------------------------------------------------
    /**
     * Recompute the MetricsCache row for an extension from raw Installs and
     * Ratings data.
     *
     * @param extensionId - The extension to recalculate.
     *
     * @example
     * ```typescript
     * await svc.refreshMetricsCache("my-ext");
     * ```
     */
    async refreshMetricsCache(extensionId) {
        let totalInstalls = 0;
        let activeInstalls = 0;
        let ratingSum = 0;
        let ratingCount = 0;
        // Count installs
        const installQuery = this.installsClient.listEntities({
            queryOptions: {
                filter: (0, data_tables_1.odata) `PartitionKey eq ${extensionId}`,
            },
        });
        for await (const entity of installQuery) {
            totalInstalls++;
            if (entity.IsActive) {
                activeInstalls++;
            }
        }
        // Aggregate ratings
        const ratingQuery = this.ratingsClient.listEntities({
            queryOptions: {
                filter: (0, data_tables_1.odata) `PartitionKey eq ${extensionId}`,
            },
        });
        for await (const entity of ratingQuery) {
            ratingSum += entity.Rating;
            ratingCount++;
        }
        const averageRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : 0;
        const cacheEntity = {
            partitionKey: extensionId,
            rowKey: "summary",
            TotalInstalls: totalInstalls,
            ActiveInstalls: activeInstalls,
            AverageRating: averageRating,
            RatingCount: ratingCount,
            LastUpdated: new Date().toISOString(),
        };
        await this.metricsCacheClient.upsertEntity(cacheEntity, "Replace");
    }
}
exports.TableStorageService = TableStorageService;
//# sourceMappingURL=TableStorageService.js.map