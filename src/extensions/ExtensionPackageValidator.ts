/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/ExtensionPackageValidator
 * @description Validates extension zip packages against the manifest schema and
 * security constraints before installation.
 *
 * The validator is intentionally stateless and side-effect free so it can be
 * used in unit tests and in UI preview flows without touching the filesystem.
 *
 * @example
 * ```typescript
 * const validator = new ExtensionPackageValidator({ maxZipSizeMb: 10 });
 * const result = validator.validate(rawManifestJson, fileSizeBytes);
 * if (!result.valid) {
 *   console.error(result.errors);
 * }
 * ```
 *
 * @since 0.0.44
 */

import type {
	ExtensionPackageManifest,
	ExtensionPackageValidationResult,
	ExtensionFileEntry,
	ExtensionFileType,
} from "./types";

/** Allowed file types in an extension package. */
const VALID_FILE_TYPES: ReadonlySet<ExtensionFileType> = new Set<ExtensionFileType>([
	"agent",
	"skill",
	"prompt",
	"supporting",
]);

/**
 * Regex for a valid semver string (major.minor.patch, no pre-release suffixes required).
 * @internal
 */
const SEMVER_RE = /^\d+\.\d+\.\d+/;

/**
 * Characters that are not allowed in file paths inside a zip package.
 * Prevents path traversal and other injection attacks.
 * @internal
 */
const UNSAFE_PATH_RE = /\.\.|^\/|^[A-Za-z]:[/\\]/;

/** Minimum manifest fields that must be non-empty strings. */
const REQUIRED_STRING_FIELDS: ReadonlyArray<keyof ExtensionPackageManifest> = [
	"id",
	"name",
	"version",
	"description",
	"author",
];

/** Options for constructing an {@link ExtensionPackageValidator}. */
export interface ExtensionPackageValidatorOptions {
	/**
	 * Maximum allowed zip file size in megabytes.
	 * @default 10
	 */
	maxZipSizeMb?: number;
}

/**
 * Validates an extension package manifest and file-size constraints.
 *
 * Usage:
 * 1. Construct with optional {@link ExtensionPackageValidatorOptions}.
 * 2. Call {@link validate} with the raw manifest JSON string and the zip byte size.
 * 3. Inspect the returned {@link ExtensionPackageValidationResult}.
 */
export class ExtensionPackageValidator {
	private readonly maxZipSizeBytes: number;

	/**
	 * @param options - Validation configuration.
	 * @example
	 * ```typescript
	 * const validator = new ExtensionPackageValidator({ maxZipSizeMb: 5 });
	 * ```
	 */
	constructor(options: ExtensionPackageValidatorOptions = {}) {
		const mb = options.maxZipSizeMb ?? 10;
		this.maxZipSizeBytes = mb * 1024 * 1024;
	}

	/**
	 * Validate a raw manifest JSON string and the corresponding zip size.
	 *
	 * @param manifestJson - Raw JSON string from the `manifest.json` inside the zip.
	 * @param zipSizeBytes - Total size of the zip file in bytes.
	 * @returns A {@link ExtensionPackageValidationResult} with `valid`, `errors`,
	 *   `warnings`, and (on success) the parsed `manifest`.
	 *
	 * @example
	 * ```typescript
	 * const result = validator.validate(jsonString, 2_500_000);
	 * if (result.valid) {
	 *   console.log(result.manifest?.name);
	 * }
	 * ```
	 */
	validate(manifestJson: string, zipSizeBytes: number): ExtensionPackageValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// ── File size check ──────────────────────────────────────────────────
		if (zipSizeBytes > this.maxZipSizeBytes) {
			const limitMb = this.maxZipSizeBytes / (1024 * 1024);
			const actualMb = (zipSizeBytes / (1024 * 1024)).toFixed(2);
			errors.push(
				`Zip file size ${actualMb} MB exceeds the maximum allowed ${limitMb} MB.`,
			);
		}

		// ── JSON parse ───────────────────────────────────────────────────────
		let raw: unknown;
		try {
			raw = JSON.parse(manifestJson);
		} catch {
			errors.push("manifest.json is not valid JSON.");
			return { valid: false, errors, warnings };
		}

		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			errors.push("manifest.json must be a JSON object.");
			return { valid: false, errors, warnings };
		}

		const manifest = raw as Record<string, unknown>;

		// ── Required string fields ───────────────────────────────────────────
		for (const field of REQUIRED_STRING_FIELDS) {
			const value = manifest[field];
			if (typeof value !== "string" || value.trim() === "") {
				errors.push(`manifest.json: "${field}" must be a non-empty string.`);
			}
		}

		// ── Version format ───────────────────────────────────────────────────
		if (typeof manifest.version === "string" && !SEMVER_RE.test(manifest.version)) {
			errors.push(
				`manifest.json: "version" must follow semver format (e.g. "1.0.0"), got "${manifest.version}".`,
			);
		}

		// ── Files array ──────────────────────────────────────────────────────
		if (!Array.isArray(manifest.files)) {
			errors.push('manifest.json: "files" must be a non-empty array.');
		} else if (manifest.files.length === 0) {
			errors.push('manifest.json: "files" must contain at least one entry.');
		} else {
			manifest.files.forEach((entry: unknown, index: number) => {
				this.validateFileEntry(entry, index, errors, warnings);
			});
		}

		// ── Optional homepage URL ────────────────────────────────────────────
		if (manifest.homepage !== undefined && typeof manifest.homepage !== "string") {
			errors.push('manifest.json: "homepage" must be a string URL when provided.');
		}

		// ── Optional email ───────────────────────────────────────────────────
		if (manifest.authorEmail !== undefined && typeof manifest.authorEmail !== "string") {
			errors.push('manifest.json: "authorEmail" must be a string when provided.');
		}

		// ── Optional tags ────────────────────────────────────────────────────
		if (manifest.tags !== undefined) {
			if (!Array.isArray(manifest.tags)) {
				errors.push('manifest.json: "tags" must be an array of strings when provided.');
			} else if (manifest.tags.some((t: unknown) => typeof t !== "string")) {
				errors.push('manifest.json: every entry in "tags" must be a string.');
			}
		}

		// ── No-license warning ───────────────────────────────────────────────
		if (!manifest.license || typeof manifest.license !== "string") {
			warnings.push(
				'manifest.json: "license" is not specified. Consider adding an SPDX license identifier.',
			);
		}

		if (errors.length > 0) {
			return { valid: false, errors, warnings };
		}

		return {
			valid: true,
			errors,
			warnings,
			manifest: manifest as unknown as ExtensionPackageManifest,
		};
	}

	/**
	 * Validate a single file entry within the manifest's `files` array.
	 *
	 * @param entry - Raw entry from the parsed JSON.
	 * @param index - Zero-based position in the `files` array (for error messages).
	 * @param errors - Mutable error list to push failures into.
	 * @param warnings - Mutable warning list to push advisories into.
	 * @internal
	 */
	private validateFileEntry(
		entry: unknown,
		index: number,
		errors: string[],
		warnings: string[],
	): void {
		const prefix = `manifest.json: files[${index}]`;

		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			errors.push(`${prefix} must be an object.`);
			return;
		}

		const e = entry as Partial<ExtensionFileEntry>;

		// path
		if (typeof e.path !== "string" || e.path.trim() === "") {
			errors.push(`${prefix}: "path" must be a non-empty string.`);
		} else if (UNSAFE_PATH_RE.test(e.path)) {
			errors.push(
				`${prefix}: "path" "${e.path}" contains unsafe segments. ` +
					`Paths must be relative and must not contain "..".`,
			);
		}

		// type
		if (typeof e.type !== "string" || !VALID_FILE_TYPES.has(e.type as ExtensionFileType)) {
			errors.push(
				`${prefix}: "type" must be one of ${[...VALID_FILE_TYPES].map(t => `"${t}"`).join(", ")}.`,
			);
		}

		// destination (optional)
		if (e.destination !== undefined) {
			if (typeof e.destination !== "string" || e.destination.trim() === "") {
				errors.push(`${prefix}: "destination" must be a non-empty string when provided.`);
			} else if (UNSAFE_PATH_RE.test(e.destination)) {
				errors.push(
					`${prefix}: "destination" "${e.destination}" contains unsafe segments.`,
				);
			}
		}

		// description (optional)
		if (e.description !== undefined && typeof e.description !== "string") {
			warnings.push(`${prefix}: "description" should be a string when provided.`);
		}
	}
}
