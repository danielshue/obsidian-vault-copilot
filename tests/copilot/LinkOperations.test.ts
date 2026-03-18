/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/copilot/LinkOperations
 * @description Unit tests for getBacklinks() and getOutgoingLinks() vault operations.
 *
 * Validates backlink discovery (linked + unlinked mentions) and outgoing link
 * discovery (resolved + unresolved links) using the mock Obsidian App.
 *
 * @see {@link getBacklinks}
 * @see {@link getOutgoingLinks}
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBacklinks, getOutgoingLinks } from "../../src/copilot/tools/VaultOperations";
import { App, TFile } from "obsidian";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeApp(): App {
	return new App();
}

// ── getBacklinks tests ─────────────────────────────────────────────────────

describe("getBacklinks", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
		vi.clearAllMocks();
	});

	it("returns error when no active note and no path given", async () => {
		const result = await getBacklinks(app);
		expect(result.success).toBe(false);
		expect(result.error).toContain("No active note");
	});

	it("returns error when specified path does not exist", async () => {
		const result = await getBacklinks(app, "nonexistent.md");
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("returns empty linked and unlinked mentions for a note with no backlinks", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("target.md", "# Target");
		(app.workspace as unknown as { _setActiveFile: (f: TFile) => void })._setActiveFile(new TFile("target.md"));

		const result = await getBacklinks(app, "target.md");
		expect(result.success).toBe(true);
		expect(result.targetPath).toBe("target.md");
		expect(result.linkedMentions).toEqual([]);
		expect(result.unlinkedMentions).toEqual([]);
	});

	it("returns linked mentions when resolvedLinks contains a reference to the target", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("target.md", "# Target");
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("source.md", "see [[target]]");

		// Set up resolvedLinks: source.md → target.md
		(app.metadataCache as unknown as { _setResolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setResolvedLinks({
				"source.md": { "target.md": 2 },
			});

		const result = await getBacklinks(app, "target.md");
		expect(result.success).toBe(true);
		expect(result.linkedMentions).toHaveLength(1);
		expect(result.linkedMentions![0]).toEqual({ sourcePath: "source.md", count: 2 });
	});

	it("returns unlinked mentions when unresolvedLinks contains the target basename", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("target.md", "# Target");
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("source.md", "see target");

		// unresolvedLinks: source.md mentions "target" (without brackets)
		(app.metadataCache as unknown as { _setUnresolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setUnresolvedLinks({
				"source.md": { "target": 1 },
			});

		const result = await getBacklinks(app, "target.md");
		expect(result.success).toBe(true);
		expect(result.unlinkedMentions).toHaveLength(1);
		expect(result.unlinkedMentions![0]).toEqual({ sourcePath: "source.md", count: 1 });
	});

	it("excludes the target file itself from backlinks", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("target.md", "[[target]]");

		(app.metadataCache as unknown as { _setResolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setResolvedLinks({
				"target.md": { "target.md": 1 },   // self-link — should be excluded
				"other.md":  { "target.md": 3 },
			});

		const result = await getBacklinks(app, "target.md");
		expect(result.success).toBe(true);
		expect(result.linkedMentions).toHaveLength(1);
		expect(result.linkedMentions![0].sourcePath).toBe("other.md");
	});

	it("sorts linked mentions by count descending", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("target.md", "");

		(app.metadataCache as unknown as { _setResolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setResolvedLinks({
				"a.md": { "target.md": 1 },
				"b.md": { "target.md": 5 },
				"c.md": { "target.md": 3 },
			});

		const result = await getBacklinks(app, "target.md");
		expect(result.success).toBe(true);
		expect(result.linkedMentions!.map(m => m.sourcePath)).toEqual(["b.md", "c.md", "a.md"]);
	});

	it("uses the active note when no path is provided", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("active.md", "");
		(app.workspace as unknown as { _setActiveFile: (f: TFile) => void })._setActiveFile(new TFile("active.md"));

		(app.metadataCache as unknown as { _setResolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setResolvedLinks({
				"linker.md": { "active.md": 1 },
			});

		const result = await getBacklinks(app);
		expect(result.success).toBe(true);
		expect(result.targetPath).toBe("active.md");
		expect(result.linkedMentions).toHaveLength(1);
	});
});

// ── getOutgoingLinks tests ─────────────────────────────────────────────────

describe("getOutgoingLinks", () => {
	let app: App;

	beforeEach(() => {
		app = makeApp();
		vi.clearAllMocks();
	});

	it("returns error when no active note and no path given", async () => {
		const result = await getOutgoingLinks(app);
		expect(result.success).toBe(false);
		expect(result.error).toContain("No active note");
	});

	it("returns error when specified path does not exist", async () => {
		const result = await getOutgoingLinks(app, "nonexistent.md");
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("returns empty lists when the note has no outgoing links", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("source.md", "# No links");

		const result = await getOutgoingLinks(app, "source.md");
		expect(result.success).toBe(true);
		expect(result.sourcePath).toBe("source.md");
		expect(result.resolvedLinks).toEqual([]);
		expect(result.unresolvedLinks).toEqual([]);
	});

	it("returns resolved links from the source note", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("source.md", "[[alpha]] [[beta]]");

		(app.metadataCache as unknown as { _setResolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setResolvedLinks({
				"source.md": { "alpha.md": 1, "beta.md": 2 },
			});

		const result = await getOutgoingLinks(app, "source.md");
		expect(result.success).toBe(true);
		expect(result.resolvedLinks).toHaveLength(2);
		const paths = result.resolvedLinks!.map(l => l.targetPath);
		expect(paths).toContain("alpha.md");
		expect(paths).toContain("beta.md");
	});

	it("returns unresolved links (potential notes to create)", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("source.md", "[[missing-note]]");

		(app.metadataCache as unknown as { _setUnresolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setUnresolvedLinks({
				"source.md": { "missing-note": 1 },
			});

		const result = await getOutgoingLinks(app, "source.md");
		expect(result.success).toBe(true);
		expect(result.unresolvedLinks).toHaveLength(1);
		expect(result.unresolvedLinks![0]).toEqual({ linkText: "missing-note", count: 1 });
	});

	it("sorts resolved links by count descending", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("source.md", "");

		(app.metadataCache as unknown as { _setResolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setResolvedLinks({
				"source.md": { "a.md": 1, "b.md": 4, "c.md": 2 },
			});

		const result = await getOutgoingLinks(app, "source.md");
		expect(result.success).toBe(true);
		expect(result.resolvedLinks!.map(l => l.targetPath)).toEqual(["b.md", "c.md", "a.md"]);
	});

	it("uses the active note when no path is provided", async () => {
		(app.vault as unknown as { _setFile: (p: string, c: string) => void })._setFile("active.md", "[[other]]");
		(app.workspace as unknown as { _setActiveFile: (f: TFile) => void })._setActiveFile(new TFile("active.md"));

		(app.metadataCache as unknown as { _setResolvedLinks: (l: Record<string, Record<string, number>>) => void })
			._setResolvedLinks({
				"active.md": { "other.md": 1 },
			});

		const result = await getOutgoingLinks(app);
		expect(result.success).toBe(true);
		expect(result.sourcePath).toBe("active.md");
		expect(result.resolvedLinks).toHaveLength(1);
	});
});
