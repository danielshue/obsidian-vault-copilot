/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions
 * @description Public API surface for the Vault Copilot extension package system.
 *
 * Re-exports all types, validators, and services related to the zip-based
 * extension package format.
 *
 * @since 0.0.44
 */

export type {
	ExtensionFileType,
	ExtensionFileEntry,
	ExtensionPackageManifest,
	ExtensionPackageValidationResult,
	ExtensionSubmissionRecord,
	ExtensionSubmissionConfig,
	ExtensionRateLimitResult,
} from "./types";

export { ExtensionPackageValidator } from "./ExtensionPackageValidator";
export type { ExtensionPackageValidatorOptions } from "./ExtensionPackageValidator";

export { ExtensionSubmissionService } from "./ExtensionSubmissionService";
