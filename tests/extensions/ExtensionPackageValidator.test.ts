/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/extensions/ExtensionPackageValidator
 * @description Unit tests for ExtensionPackageValidator — manifest parsing, schema
 * validation, path safety checks, and file-size enforcement.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ExtensionPackageValidator } from "../../src/extensions/ExtensionPackageValidator";
import type { ExtensionPackageManifest } from "../../src/extensions/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a valid minimal manifest JSON string. */
function validManifest(overrides: Partial<ExtensionPackageManifest> = {}): string {
	const base: ExtensionPackageManifest = {
		id: "test-extension",
		name: "Test Extension",
		version: "1.0.0",
		description: "A test extension package.",
		author: "Test Author",
		license: "MIT",
		files: [
			{ path: "agents/test-agent.md", type: "agent" },
		],
		...overrides,
	};
	return JSON.stringify(base);
}

const ONE_MB = 1024 * 1024;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExtensionPackageValidator", () => {
	let validator: ExtensionPackageValidator;

	beforeEach(() => {
		// 10 MB limit (default)
		validator = new ExtensionPackageValidator({ maxZipSizeMb: 10 });
	});

	// ── Happy path ────────────────────────────────────────────────────────

	it("validates a fully correct manifest", () => {
		const json = validManifest({
			files: [
				{ path: "agents/my-agent.md", type: "agent", description: "Main agent" },
				{ path: "skills/web.md", type: "skill" },
				{ path: "prompts/search.md", type: "prompt" },
				{ path: "supporting/config.json", type: "supporting" },
			],
			tags: ["research", "web"],
			authorEmail: "author@example.com",
			homepage: "https://github.com/user/ext",
		});

		const result = validator.validate(json, ONE_MB);

		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
		expect(result.manifest?.id).toBe("test-extension");
	});

	it("warns but succeeds when license is omitted", () => {
		const manifest: Partial<ExtensionPackageManifest> = {
			id: "no-license",
			name: "No License",
			version: "0.1.0",
			description: "Missing license",
			author: "Author",
			files: [{ path: "agents/agent.md", type: "agent" }],
		};
		// Remove license key entirely
		const json = JSON.stringify(manifest);

		const result = validator.validate(json, 500 * 1024);

		expect(result.valid).toBe(true);
		expect(result.warnings.some((w) => w.includes("license"))).toBe(true);
	});

	// ── File size ─────────────────────────────────────────────────────────

	it("rejects a zip that exceeds the configured size limit", () => {
		const result = validator.validate(validManifest(), 11 * ONE_MB); // over 10 MB limit

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("exceeds the maximum"))).toBe(true);
	});

	it("accepts a zip exactly at the size limit", () => {
		const result = validator.validate(validManifest(), 10 * ONE_MB);

		expect(result.valid).toBe(true);
	});

	it("respects a custom maxZipSizeMb option", () => {
		const smallValidator = new ExtensionPackageValidator({ maxZipSizeMb: 2 });

		expect(smallValidator.validate(validManifest(), 3 * ONE_MB).valid).toBe(false);
		expect(smallValidator.validate(validManifest(), 1 * ONE_MB).valid).toBe(true);
	});

	// ── JSON parse errors ─────────────────────────────────────────────────

	it("returns invalid for malformed JSON", () => {
		const result = validator.validate("{not valid json", ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("not valid JSON"))).toBe(true);
	});

	it("returns invalid for a JSON array (not an object)", () => {
		const result = validator.validate("[]", ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("must be a JSON object"))).toBe(true);
	});

	// ── Required string fields ────────────────────────────────────────────

	it.each(["id", "name", "version", "description", "author"] as const)(
		'rejects manifest when required field "%s" is missing',
		(field) => {
			const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
			delete manifest[field];
			const result = validator.validate(JSON.stringify(manifest), ONE_MB);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes(`"${field}"`))).toBe(true);
		},
	);

	it.each(["id", "name", "version", "description", "author"] as const)(
		'rejects manifest when required field "%s" is empty string',
		(field) => {
			const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
			manifest[field] = "   ";
			const result = validator.validate(JSON.stringify(manifest), ONE_MB);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes(`"${field}"`))).toBe(true);
		},
	);

	// ── Version format ────────────────────────────────────────────────────

	it("rejects a version that does not match semver", () => {
		const result = validator.validate(validManifest({ version: "not-a-version" }), ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("semver"))).toBe(true);
	});

	it("accepts a pre-release semver string", () => {
		const result = validator.validate(validManifest({ version: "1.0.0-beta.1" }), ONE_MB);

		expect(result.valid).toBe(true);
	});

	// ── Files array ───────────────────────────────────────────────────────

	it("rejects when files is not an array", () => {
		const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
		manifest.files = "agent.md";
		const result = validator.validate(JSON.stringify(manifest), ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('"files"'))).toBe(true);
	});

	it("rejects when files array is empty", () => {
		const result = validator.validate(validManifest({ files: [] }), ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("at least one"))).toBe(true);
	});

	// ── File entry validation ─────────────────────────────────────────────

	it("rejects a file entry with an invalid type", () => {
		const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
		(manifest.files as Array<Record<string, unknown>>)[0].type = "unknown-type";
		const result = validator.validate(JSON.stringify(manifest), ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('"type"'))).toBe(true);
	});

	it("rejects a file entry with an empty path", () => {
		const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
		(manifest.files as Array<Record<string, unknown>>)[0].path = "";
		const result = validator.validate(JSON.stringify(manifest), ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('"path"'))).toBe(true);
	});

	// ── Path traversal prevention ─────────────────────────────────────────

	it.each([
		"../../../etc/passwd",
		"agents/../../secret.md",
		"/absolute/path.md",
		"C:\\Windows\\system32\\file.txt",
	])("rejects path traversal attempt: %s", (dangerousPath) => {
		const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
		(manifest.files as Array<Record<string, unknown>>)[0].path = dangerousPath;
		const result = validator.validate(JSON.stringify(manifest), ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("unsafe segments"))).toBe(true);
	});

	it("rejects path traversal in destination field", () => {
		const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
		(manifest.files as Array<Record<string, unknown>>)[0].destination = "../secret.md";
		const result = validator.validate(JSON.stringify(manifest), ONE_MB);

		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("unsafe segments"))).toBe(true);
	});

	it("accepts all valid file types", () => {
		for (const type of ["agent", "skill", "prompt", "supporting"] as const) {
			const result = validator.validate(
				validManifest({ files: [{ path: `${type}s/file.md`, type }] }),
				ONE_MB,
			);
			expect(result.valid).toBe(true);
		}
	});

	// ── Optional field type checks ────────────────────────────────────────

	it("rejects non-array tags", () => {
		const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
		manifest.tags = "research";
		const result = validator.validate(JSON.stringify(manifest), ONE_MB);

		expect(result.valid).toBe(false);
	});

	it("rejects tags array with non-string entries", () => {
		const manifest = JSON.parse(validManifest()) as Record<string, unknown>;
		manifest.tags = ["valid", 42];
		const result = validator.validate(JSON.stringify(manifest), ONE_MB);

		expect(result.valid).toBe(false);
	});
});
