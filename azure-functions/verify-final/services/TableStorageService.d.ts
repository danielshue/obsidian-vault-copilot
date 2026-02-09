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
import { TableEntity } from "@azure/data-tables";
/** Shape of a row in the Installs table. */
export interface InstallEntity extends TableEntity {
    partitionKey: string;
    rowKey: string;
    UserHash: string;
    Version: string;
    Platform: string;
    VaultCopilotVersion: string;
    InstallDate: string;
    IsActive: boolean;
    UninstallDate?: string;
}
/** Shape of a row in the Ratings table. */
export interface RatingEntity extends TableEntity {
    partitionKey: string;
    rowKey: string;
    Rating: number;
    Comment?: string;
    Version: string;
    SubmittedDate: string;
    UpdatedDate: string;
}
/** Shape of a row in the MetricsCache table. */
export interface MetricsCacheEntity extends TableEntity {
    partitionKey: string;
    rowKey: string;
    TotalInstalls: number;
    ActiveInstalls: number;
    AverageRating: number;
    RatingCount: number;
    LastUpdated: string;
}
/** Payload accepted by {@link TableStorageService.trackInstall}. */
export interface TrackInstallEvent {
    extensionId: string;
    userHash: string;
    version: string;
    platform: string;
    vaultCopilotVersion: string;
}
/** Payload accepted by {@link TableStorageService.submitRating}. */
export interface RatingSubmission {
    extensionId: string;
    userHash: string;
    rating: number;
    comment?: string;
    version: string;
}
/** Aggregated metrics returned to the client. */
export interface ExtensionMetrics {
    extensionId: string;
    totalInstalls: number;
    activeInstalls: number;
    averageRating: number;
    ratingCount: number;
    lastUpdated: string;
}
/** Data belonging to a single user (for GDPR export). */
export interface UserData {
    userHash: string;
    installs: InstallEntity[];
    ratings: RatingEntity[];
}
/**
 * Singleton service that wraps Azure Table Storage operations.
 *
 * All public methods are `async` and throw on unrecoverable errors; callers
 * are expected to catch and map to HTTP responses.
 */
export declare class TableStorageService {
    private static instance;
    private readonly installsClient;
    private readonly ratingsClient;
    private readonly metricsCacheClient;
    /**
     * Construct a new service instance.
     *
     * @internal – use {@link getInstance} instead.
     */
    private constructor();
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
    static getInstance(): TableStorageService;
    /**
     * Reset the singleton (for testing purposes).
     * @internal
     */
    static resetInstance(): void;
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
    ensureTablesExist(): Promise<void>;
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
    trackInstall(event: TrackInstallEvent): Promise<void>;
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
    trackUninstall(extensionId: string, userHash: string): Promise<void>;
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
    submitRating(submission: RatingSubmission): Promise<{
        averageRating: number;
        ratingCount: number;
    }>;
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
    deleteRating(extensionId: string, userHash: string): Promise<void>;
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
    getExtensionRatings(extensionId: string): Promise<Array<{
        rating: number;
        comment: string;
        version: string;
        submittedDate: string;
        updatedDate: string;
    }>>;
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
    getMetrics(extensionId: string): Promise<ExtensionMetrics>;
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
    getBatchMetrics(extensionIds: string[]): Promise<Record<string, ExtensionMetrics>>;
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
    getUserData(userHash: string): Promise<UserData>;
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
    deleteUserData(userHash: string): Promise<void>;
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
    refreshMetricsCache(extensionId: string): Promise<void>;
}
//# sourceMappingURL=TableStorageService.d.ts.map