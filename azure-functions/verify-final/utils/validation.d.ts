/**
 * @module Validation
 * @description Input validation utilities for the analytics API.
 *
 * Provides functions to validate extension IDs, user hashes, ratings,
 * semantic versions, and platform identifiers before they reach storage.
 *
 * @since 1.0.0
 */
/** Result of a validation check. */
export interface ValidationResult {
    /** Whether the value passed validation. */
    valid: boolean;
    /** Human-readable error message when `valid` is false. */
    error?: string;
}
/**
 * Validate an extension identifier.
 *
 * Must be 1-100 characters consisting of alphanumeric characters, hyphens,
 * underscores, and dots.
 *
 * @param id - The extension identifier to validate.
 * @returns A {@link ValidationResult} indicating success or the reason for failure.
 *
 * @example
 * ```typescript
 * const result = validateExtensionId("my-cool-extension");
 * // { valid: true }
 * ```
 */
export declare function validateExtensionId(id: unknown): ValidationResult;
/**
 * Validate a user hash.
 *
 * Must be a 64-character lowercase hexadecimal string (SHA-256 digest).
 *
 * @param hash - The user hash to validate.
 * @returns A {@link ValidationResult}.
 *
 * @example
 * ```typescript
 * const result = validateUserHash("a".repeat(64));
 * // { valid: true }
 * ```
 */
export declare function validateUserHash(hash: unknown): ValidationResult;
/**
 * Validate a rating value.
 *
 * Must be an integer between 1 and 5 inclusive.
 *
 * @param rating - The rating value to validate.
 * @returns A {@link ValidationResult}.
 *
 * @example
 * ```typescript
 * const result = validateRating(4);
 * // { valid: true }
 * ```
 */
export declare function validateRating(rating: unknown): ValidationResult;
/**
 * Validate a semantic version string.
 *
 * Accepts versions like `1.0.0`, `0.1.0-beta.1`, etc.
 *
 * @param version - The version string to validate.
 * @returns A {@link ValidationResult}.
 *
 * @example
 * ```typescript
 * const result = validateVersion("1.2.3");
 * // { valid: true }
 * ```
 */
export declare function validateVersion(version: unknown): ValidationResult;
/**
 * Validate a platform identifier.
 *
 * Must be either `"desktop"` or `"mobile"`.
 *
 * @param platform - The platform string to validate.
 * @returns A {@link ValidationResult}.
 *
 * @example
 * ```typescript
 * const result = validatePlatform("desktop");
 * // { valid: true }
 * ```
 */
export declare function validatePlatform(platform: unknown): ValidationResult;
//# sourceMappingURL=validation.d.ts.map