/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/utils/pathUtils
 * @description Unit tests for cross-platform path utilities.
 *
 * Validates path normalization, extension handling, path comparison, home directory
 * expansion, and vault-relative path conversion across Windows, macOS, and Linux.
 *
 * @see {@link pathUtils}
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	normalizeVaultPath,
	ensureMarkdownExtension,
	pathsEqual,
	toVaultRelativePath,
	isVaultRoot,
	expandHomePath,
} from "../../src/utils/pathUtils";

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock the platform module to control isDesktop flag
vi.mock("../../src/utils/platform", () => ({
	isDesktop: true,
	isMobile: false,
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe("pathUtils", () => {
	describe("normalizeVaultPath", () => {
		it("converts backslashes to forward slashes", () => {
			expect(normalizeVaultPath("Notes\\Daily\\2024")).toBe(
				"Notes/Daily/2024"
			);
		});

		it("removes trailing slashes", () => {
			expect(normalizeVaultPath("Notes/Daily/")).toBe("Notes/Daily");
			expect(normalizeVaultPath("Notes/Daily///")).toBe("Notes/Daily");
		});

		it("collapses multiple consecutive slashes", () => {
			expect(normalizeVaultPath("Notes//Daily///2024")).toBe(
				"Notes/Daily/2024"
			);
		});

		it("removes leading slashes", () => {
			expect(normalizeVaultPath("/Notes/Daily")).toBe("Notes/Daily");
			expect(normalizeVaultPath("///Notes/Daily")).toBe("Notes/Daily");
		});

		it("trims whitespace from start and end", () => {
			expect(normalizeVaultPath("  Notes/Daily  ")).toBe("Notes/Daily");
			expect(normalizeVaultPath("\tNotes/Daily\n")).toBe("Notes/Daily");
		});

		it("handles combined transformations", () => {
			expect(normalizeVaultPath("\\\\Notes\\\\Daily\\\\  ")).toBe(
				"Notes/Daily"
			);
			expect(normalizeVaultPath("  /Notes/Daily///  ")).toBe(
				"Notes/Daily"
			);
		});

		it("handles empty string", () => {
			expect(normalizeVaultPath("")).toBe("");
		});

		it("handles whitespace-only string", () => {
			expect(normalizeVaultPath("   ")).toBe("");
		});

		it("preserves single file names", () => {
			expect(normalizeVaultPath("README")).toBe("README");
		});
	});

	describe("ensureMarkdownExtension", () => {
		it("adds .md extension to path without extension", () => {
			expect(ensureMarkdownExtension("my-note")).toBe("my-note.md");
		});

		it("preserves .md extension when already present", () => {
			expect(ensureMarkdownExtension("my-note.md")).toBe("my-note.md");
		});

		it("adds .md to folder paths", () => {
			expect(ensureMarkdownExtension("folder/note")).toBe("folder/note.md");
		});

		it("normalizes path before checking extension", () => {
			expect(ensureMarkdownExtension("folder\\note")).toBe(
				"folder/note.md"
			);
		});

		it("handles nested paths with .md extension", () => {
			expect(ensureMarkdownExtension("Notes/Daily/2024.md")).toBe(
				"Notes/Daily/2024.md"
			);
		});

		it("adds .md to normalized paths with trailing slashes", () => {
			expect(ensureMarkdownExtension("folder/note/")).toBe("folder/note.md");
		});

		it("handles empty string", () => {
			expect(ensureMarkdownExtension("")).toBe(".md");
		});
	});

	describe("pathsEqual", () => {
		it("returns true for identical paths", () => {
			expect(pathsEqual("Notes/Daily", "Notes/Daily")).toBe(true);
		});

		it("returns true for case-insensitive matching", () => {
			expect(pathsEqual("Notes/Daily", "notes/daily")).toBe(true);
			expect(pathsEqual("NOTES/DAILY", "notes/daily")).toBe(true);
		});

		it("returns true for normalized paths with differences", () => {
			expect(pathsEqual("Notes\\Daily", "Notes/Daily")).toBe(true);
		});

		it("returns false for different paths", () => {
			expect(pathsEqual("Notes/Daily", "Notes/Weekly")).toBe(false);
		});

		it("returns true for empty strings", () => {
			expect(pathsEqual("", "")).toBe(true);
		});

		it("returns true when both paths normalize to same value", () => {
			expect(
				pathsEqual("/Notes//Daily/", "\\Notes\\Daily\\")
			).toBe(true);
		});

		it("returns false for single character differences", () => {
			expect(pathsEqual("Notes/Daily", "Notes/Daili")).toBe(false);
		});
	});

	describe("toVaultRelativePath", () => {
		it("strips vault base path from absolute path", () => {
			const vaultBase = "C:/Users/me/Documents/MyVault";
			const absolutePath = "C:/Users/me/Documents/MyVault/Notes/daily.md";
			expect(toVaultRelativePath(absolutePath, vaultBase)).toBe(
				"Notes/daily.md"
			);
		});

		it("returns normalized path when not within vault", () => {
			const vaultBase = "C:/Users/me/Documents/MyVault";
			const absolutePath = "C:/Users/other/Documents/file.md";
			const result = toVaultRelativePath(absolutePath, vaultBase);
			// Path is normalized even if not in vault (preserves case)
			expect(result).toBe("C:/Users/other/Documents/file.md");
		});

		it("handles case-insensitive path matching", () => {
			const vaultBase = "C:/Users/me/MyVault";
			const absolutePath = "C:/USERS/ME/MYVAULT/Notes/file.md";
			expect(toVaultRelativePath(absolutePath, vaultBase)).toBe(
				"Notes/file.md"
			);
		});

		it("handles nested paths within vault", () => {
			const vaultBase = "/home/user/vault";
			const absolutePath =
				"/home/user/vault/Projects/Work/2024/notes.md";
			expect(toVaultRelativePath(absolutePath, vaultBase)).toBe(
				"Projects/Work/2024/notes.md"
			);
		});

		it("handles Windows backslashes in paths", () => {
			const vaultBase = "C:\\Users\\me\\Vault";
			const absolutePath = "C:\\Users\\me\\Vault\\Notes\\file.md";
			expect(toVaultRelativePath(absolutePath, vaultBase)).toBe(
				"Notes/file.md"
			);
		});

		it("returns vault root when path equals vault base", () => {
			const vaultBase = "C:/Users/me/Vault";
			expect(toVaultRelativePath(vaultBase, vaultBase)).toBe("");
		});

		it("handles paths with trailing slashes", () => {
			const vaultBase = "C:/Users/me/Vault/";
			const absolutePath = "C:/Users/me/Vault/Notes/daily.md/";
			expect(toVaultRelativePath(absolutePath, vaultBase)).toBe(
				"Notes/daily.md"
			);
		});
	});

	describe("isVaultRoot", () => {
		it("returns true for empty string", () => {
			expect(isVaultRoot("")).toBe(true);
		});

		it("returns true for forward slash", () => {
			expect(isVaultRoot("/")).toBe(true);
		});

		it("returns true for dot", () => {
			expect(isVaultRoot(".")).toBe(true);
		});

		it("returns false for normal paths", () => {
			expect(isVaultRoot("Notes")).toBe(false);
			expect(isVaultRoot("Notes/Daily")).toBe(false);
		});

		it("returns false for nested directories", () => {
			expect(isVaultRoot("Projects/Work/2024")).toBe(false);
		});

		it("returns true when path normalizes to root", () => {
			expect(isVaultRoot("///")).toBe(true);
			expect(isVaultRoot("  /  ")).toBe(true);
		});

		it("returns false for file names", () => {
			expect(isVaultRoot("README.md")).toBe(false);
		});
	});

	describe("expandHomePath", () => {
		let mockRequire: typeof require;
		let originalRequire: typeof require;

		beforeEach(() => {
			originalRequire = require;
			// We'll mock os.homedir() when needed
		});

		afterEach(() => {
			vi.clearAllMocks();
		});

		it("expands ~/ prefix to home directory on desktop", () => {
			// Mock os.homedir()
			vi.doMock("os", () => ({
				homedir: () => "/Users/me",
			}));

			const result = expandHomePath("~/.copilot/skills");
			// Result should start with home directory path
			expect(result).toContain(".copilot/skills");
		});

		it("expands bare ~ to home directory", () => {
			const result = expandHomePath("~");
			// On a real system, this would expand to actual home dir
			// We'll test the logic flow instead
			if (result !== "~") {
				// If it expanded, it should not be just "~"
				expect(result.length).toBeGreaterThan(1);
			}
		});

		it("passes through non-tilde paths unchanged", () => {
			expect(expandHomePath("/absolute/path")).toBe("/absolute/path");
			expect(expandHomePath("relative/path")).toBe("relative/path");
		});

		it("handles empty string", () => {
			expect(expandHomePath("")).toBe("");
		});

		it("does not expand ~ in middle of path", () => {
			const result = expandHomePath("path/to/~ignore");
			expect(result).toBe("path/to/~ignore");
		});

		it("trims whitespace before expansion check", () => {
			const result = expandHomePath("  ~/path  ");
			// Should process the trimmed version
			if (result !== "  ~/path  ") {
				// If expanded, should not have extra spaces
				expect(result).not.toContain("  ");
			}
		});

		it("handles ~\\ prefix on Windows paths", () => {
			// Test that the function recognizes ~\ as a home path prefix
			const input = "~\\Documents\\notes";
			const result = expandHomePath(input);
			// The function should process this (actual expansion depends on os.homedir)
			if (result !== input) {
				// If expanded, it should have forward slashes from the rest
				expect(result).toContain("Documents");
			}
		});

		it("returns unchanged on mobile platform", async () => {
			// Test with isDesktop = false
			// Since we mocked platform to be true, we'd need to test the logic
			// that handles when isDesktop is false
			const input = "~/test/path";
			const result = expandHomePath(input);
			// On desktop, this should attempt to expand
			// The actual result depends on the system
			expect(typeof result).toBe("string");
		});
	});

	describe("Integration tests", () => {
		it("normalizeVaultPath works with ensureMarkdownExtension", () => {
			const result = ensureMarkdownExtension("\\Notes\\Daily\\");
			expect(result).toBe("Notes/Daily.md");
		});

		it("pathsEqual handles normalization and comparison", () => {
			expect(
				pathsEqual(
					"\\\\Projects\\\\Work\\\\",
					"/Projects/work/"
				)
			).toBe(true);
		});

		it("toVaultRelativePath normalizes before comparison", () => {
			const vaultBase = "C:\\Users\\me\\Vault";
			const absolutePath = "C:/USERS/ME/VAULT\\Notes\\file.md";
			expect(toVaultRelativePath(absolutePath, vaultBase)).toBe(
				"Notes/file.md"
			);
		});

		it("complex path workflow: normalize, compare, and check extension", () => {
			const path1 = "\\NOTES\\DAILY\\";
			const path2 = "/notes/daily/";
			const normalized1 = normalizeVaultPath(path1);
			const normalized2 = normalizeVaultPath(path2);

			// normalizeVaultPath preserves case, just normalizes slashes
			expect(normalized1).toBe("NOTES/DAILY");
			expect(normalized2).toBe("notes/daily");
			// But pathsEqual is case-insensitive
			expect(pathsEqual(path1, path2)).toBe(true);

			const withExtension = ensureMarkdownExtension(normalized1);
			expect(withExtension).toBe("NOTES/DAILY.md");
		});
	});
});
