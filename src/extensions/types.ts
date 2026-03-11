/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/types
 * @description Core type definitions for the Vault Copilot extension package format.
 *
 * Extension packages are distributed as `.zip` files containing a `manifest.json`
 * descriptor and one or more component directories (agents, skills, prompts, supporting).
 *
 * ## Zip file structure
 * ```
 * my-extension.zip
 * ├── manifest.json          ← Required — describes the package
 * ├── agents/
 * │   └── *.md               ← Agent definition files
 * ├── skills/
 * │   └── *.md               ← Skill files
 * ├── prompts/
 * │   └── *.md               ← Prompt template files
 * └── supporting/
 *     └── *                  ← Additional supporting files
 * ```
 *
 * @since 0.0.44
 */

// ---------------------------------------------------------------------------
// File entry types
// ---------------------------------------------------------------------------

/**
 * Category of a file within an extension package.
 *
 * Controls which vault directory the file is extracted to on install:
 * - `agent` → plugin `agentDirectories[0]` (default: `Reference/Agents`)
 * - `skill` → plugin `skillDirectories[0]` (default: none configured)
 * - `prompt` → plugin `promptDirectories[0]` (default: `Reference/Prompts`)
 * - `supporting` → the same directory as the closest parent agent/skill/prompt
 */
export type ExtensionFileType = "agent" | "skill" | "prompt" | "supporting";

/**
 * Describes a single file within an extension package.
 *
 * Each entry in {@link ExtensionPackageManifest.files} corresponds to one
 * file that will be extracted from the zip and installed into the vault.
 */
export interface ExtensionFileEntry {
	/**
	 * Path of the file inside the zip archive.
	 * Must not contain `..` segments (path traversal is rejected).
	 *
	 * @example `"agents/my-agent.md"`
	 */
	path: string;

	/**
	 * Logical type of the file — controls the target vault directory.
	 */
	type: ExtensionFileType;

	/**
	 * Optional override for the destination path within the vault.
	 * When omitted the relative path from the zip is preserved.
	 *
	 * @example `"My Custom Agent.md"`
	 */
	destination?: string;

	/** Optional human-readable description of the file's purpose. */
	description?: string;
}

// ---------------------------------------------------------------------------
// Package manifest
// ---------------------------------------------------------------------------

/**
 * The `manifest.json` file at the root of an extension zip package.
 *
 * This schema is validated by {@link ExtensionPackageValidator} before any
 * files are extracted or installed.
 *
 * @example
 * ```json
 * {
 *   "id": "my-research-agent",
 *   "name": "Research Agent",
 *   "version": "1.0.0",
 *   "description": "A comprehensive research and note-taking agent.",
 *   "author": "Jane Doe",
 *   "files": [
 *     { "path": "agents/research-agent.md", "type": "agent" },
 *     { "path": "skills/web-search.md", "type": "skill" },
 *     { "path": "prompts/research-prompt.md", "type": "prompt" }
 *   ]
 * }
 * ```
 */
export interface ExtensionPackageManifest {
	/**
	 * Unique identifier for the extension package (kebab-case recommended).
	 * Used as the key in the marketplace catalog and for conflict detection.
	 */
	id: string;

	/** Human-readable display name of the extension. */
	name: string;

	/**
	 * Semantic version string (`major.minor.patch`).
	 * @example `"1.2.3"`
	 */
	version: string;

	/** Brief description of what the extension provides. */
	description: string;

	/** Author's display name. */
	author: string;

	/** Author's contact email (optional). */
	authorEmail?: string;

	/** SPDX license identifier (e.g. `"MIT"`, `"Apache-2.0"`). */
	license?: string;

	/**
	 * URL to the extension's homepage, repository, or documentation.
	 * @example `"https://github.com/user/my-extension"`
	 */
	homepage?: string;

	/**
	 * Minimum Vault Copilot version required to use this extension.
	 * @example `"0.0.44"`
	 */
	minVaultCopilotVersion?: string;

	/**
	 * Files to install from the zip archive.
	 * At least one file entry is required.
	 */
	files: ExtensionFileEntry[];

	/**
	 * Optional tags for marketplace categorisation and search.
	 * @example `["research", "productivity", "web"]`
	 */
	tags?: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Result returned by {@link ExtensionPackageValidator.validate}.
 */
export interface ExtensionPackageValidationResult {
	/** `true` when the package passed all validation checks. */
	valid: boolean;

	/**
	 * List of human-readable error messages.
	 * Empty when `valid` is `true`.
	 */
	errors: string[];

	/**
	 * List of non-fatal warnings.
	 * Present even when `valid` is `true`.
	 */
	warnings: string[];

	/** The parsed and validated manifest, available when `valid` is `true`. */
	manifest?: ExtensionPackageManifest;
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

/**
 * A recorded submission event used for rate-limit tracking.
 */
export interface ExtensionSubmissionRecord {
	/** ISO-8601 timestamp of when the submission was made. */
	submittedAt: string;

	/** The manifest `id` that was submitted. */
	extensionId: string;

	/** Identifier of the submitting user (GitHub username or anonymous ID). */
	submitterId: string;
}

/**
 * Configuration for extension submission constraints.
 *
 * These values are surfaced in the admin settings section so operators can
 * tune them without code changes.
 */
export interface ExtensionSubmissionConfig {
	/**
	 * Maximum allowed zip file size in megabytes.
	 * @default 10
	 */
	maxZipSizeMb: number;

	/**
	 * Maximum number of submissions a single user may make per calendar day.
	 * @default 5
	 */
	dailyRateLimit: number;
}

/**
 * Result returned by {@link ExtensionSubmissionService.checkRateLimit}.
 */
export interface ExtensionRateLimitResult {
	/** `true` when the user is allowed to make another submission today. */
	allowed: boolean;

	/** Number of submissions made today by this user. */
	submissionsToday: number;

	/** Configured daily limit. */
	dailyLimit: number;

	/** ISO-8601 timestamp when the rate limit resets (next UTC midnight). */
	resetsAt: string;
}
