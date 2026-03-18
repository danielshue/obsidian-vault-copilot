/**
 * @module VaultOperations (Basic)
 * @description Core vault operation implementations for Basic AI tool calling.
 *
 * This is a standalone version with only the functions needed for Basic:
 * - `getActiveNote()` - Get currently focused note
 * - `openNote()` - Navigate to a note by path
 * - `batchReadNotes()` - Read multiple notes in parallel
 * - `createNote()` - Create a new note in the vault
 * - `updateNote()` - Update/replace note content
 * - `fetchWebPage()` - Fetch and extract web content
 * - `webSearch()` - Search the web via DuckDuckGo
 * - `getBacklinks()` - Get all notes that link to a given note
 * - `getOutgoingLinks()` - Get all notes that a given note links to
 *
 * Pro VaultOperations extends this with additional operations like
 * task management, note creation, periodic notes, etc.
 *
 * @since 0.1.0
 */

import { App, TFile } from "obsidian";

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Normalize a vault path by removing leading slashes and backslashes
 */
export function normalizeVaultPath(path: string): string {
	// Replace backslashes with forward slashes
	let normalized = path.replace(/\\/g, "/");
	// Remove leading slashes
	normalized = normalized.replace(/^\/+/, "");
	// Ensure .md extension if it looks like a note path
	if (!normalized.endsWith(".md") && !normalized.includes(".")) {
		normalized += ".md";
	}
	return normalized;
}

/**
 * Ensure path has .md extension
 */
export function ensureMarkdownExtension(path: string): string {
	let normalized = path.replace(/\\/g, "/").trim();
	if (!normalized.endsWith(".md")) {
		normalized += ".md";
	}
	return normalized;
}

// ============================================================================
// Get Active Note
// ============================================================================

export interface GetActiveNoteResult {
	success: boolean;
	hasActiveNote?: boolean;
	path?: string;
	title?: string;
	content?: string;
}

export async function getActiveNote(app: App): Promise<GetActiveNoteResult> {
	const activeFile = app.workspace.getActiveFile();
	if (!activeFile) {
		return { success: true, hasActiveNote: false };
	}

	try {
		const content = await app.vault.read(activeFile);
		return {
			success: true,
			hasActiveNote: true,
			path: activeFile.path,
			title: activeFile.basename,
			content,
		};
	} catch {
		return {
			success: true,
			hasActiveNote: true,
			path: activeFile.path,
			title: activeFile.basename,
		};
	}
}

// ============================================================================
// Open Note
// ============================================================================

export interface OpenNoteResult {
	success: boolean;
	path?: string;
	error?: string;
}

/**
 * Open a note in the editor by its path
 */
export async function openNote(app: App, path: string): Promise<OpenNoteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}

		// Open the file in the active leaf
		await app.workspace.getLeaf().openFile(file);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to open note: ${error}` };
	}
}

// ============================================================================
// Batch Read Notes
// ============================================================================

/**
 * Callback signature for AI-based note summarization.
 * Pro provides an implementation; Basic doesn't use summarization.
 */
export type NoteSummarizer = (
	content: string,
	title: string,
	customPrompt?: string,
) => Promise<string>;

export interface BatchReadNotesResult {
	results: Array<{
		path: string;
		success: boolean;
		content?: string;
		summary?: string;
		error?: string;
	}>;
}

/**
 * Read multiple vault notes in parallel, with optional AI summarization.
 *
 * @param app - The Obsidian App instance
 * @param paths - Array of vault-relative note paths to read
 * @param aiSummarize - When true, return a concise AI summary instead of full content
 * @param summaryPrompt - Optional custom prompt forwarded to the summarizer
 * @param summarizer - Provider-specific callback that generates AI summaries
 */
export async function batchReadNotes(
	app: App,
	paths: string[],
	aiSummarize?: boolean,
	summaryPrompt?: string,
	summarizer?: NoteSummarizer,
): Promise<BatchReadNotesResult> {
	const results = await Promise.all(
		paths.map(async (path) => {
			try {
				const normalizedPath = normalizeVaultPath(path);
				const file = app.vault.getAbstractFileByPath(normalizedPath);
				if (!file || !(file instanceof TFile)) {
					return { path, success: false, error: `Note not found: ${path}` };
				}
				const content = await app.vault.read(file);

				if (aiSummarize && summarizer) {
					const summary = await summarizer(content, file.basename, summaryPrompt);
					return { path, success: true, summary };
				}
				return { path, success: true, content };
			} catch (error) {
				return { path, success: false, error: `Failed to read note: ${error}` };
			}
		}),
	);
	return { results };
}

// ============================================================================
// Web Operations
// ============================================================================

export interface FetchWebPageResult {
	success: boolean;
	url?: string;
	title?: string;
	content?: string;
	error?: string;
}

export async function fetchWebPage(url: string): Promise<FetchWebPageResult> {
	try {
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url);
			if (!["http:", "https:"].includes(parsedUrl.protocol)) {
				return {
					success: false,
					error: "Invalid URL protocol. Only http and https are supported.",
				};
			}
		} catch {
			return { success: false, error: `Invalid URL: ${url}` };
		}

		const response = await fetch(url, {
			method: "GET",
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; ObsidianVaultCopilot/1.0)",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
		});

		if (!response.ok) {
			return {
				success: false,
				error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
			};
		}

		const html = await response.text();

		const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
		const title =
			titleMatch && titleMatch[1] ? titleMatch[1].trim() : parsedUrl.hostname;

		let textContent = html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim();

		const maxLength = 8000;
		if (textContent.length > maxLength) {
			textContent = textContent.substring(0, maxLength) + "...";
		}

		return { success: true, url, title, content: textContent };
	} catch (error) {
		return { success: false, error: `Failed to fetch web page: ${error}` };
	}
}

export interface WebSearchResult {
	success: boolean;
	query?: string;
	results: Array<{ title: string; url: string; snippet: string }>;
	error?: string;
}

export async function webSearch(
	query: string,
	limit = 5
): Promise<WebSearchResult> {
	try {
		const encodedQuery = encodeURIComponent(query);
		const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

		const response = await fetch(searchUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			},
		});

		if (!response.ok) {
			return {
				success: false,
				results: [],
				error: `Search request failed: ${response.status}`,
			};
		}

		const html = await response.text();
		const results: Array<{ title: string; url: string; snippet: string }> = [];

		const resultRegex =
			/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/gi;
		let match;

		while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
			const url = match[1] || "";
			const title = (match[2] || "").trim();
			const snippet = (match[3] || "").trim();

			if (title && url) {
				const actualUrl = url.includes("uddg=")
					? decodeURIComponent(url.split("uddg=")[1]?.split("&")[0] || url)
					: url;

				results.push({ title, url: actualUrl, snippet });
			}
		}

		// Fallback: try simpler regex if no results found
		if (results.length === 0) {
			const simpleRegex =
				/<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<a[^>]*class="result__a"[^>]*>([^<]*)<\/a>/gi;
			while ((match = simpleRegex.exec(html)) !== null && results.length < limit) {
				const url = match[1] || "";
				const title = (match[2] || "").trim();
				if (title && url) {
					results.push({ title, url, snippet: "" });
				}
			}
		}

		return { success: true, query, results };
	} catch (error) {
		return { success: false, results: [], error: `Search failed: ${error}` };
	}
}

// ============================================================================
// Write Operations
// ============================================================================

export interface WriteResult {
	success: boolean;
	path?: string;
	error?: string;
}

/**
 * Create a new note in the vault.
 *
 * @param app - The Obsidian App instance
 * @param path - The path for the new note (e.g., 'folder/note.md')
 * @param content - The content of the note in Markdown format
 * @returns WriteResult indicating success or failure
 */
export async function createNote(
	app: App,
	path: string,
	content: string
): Promise<WriteResult> {
	try {
		const normalizedPath = ensureMarkdownExtension(path);

		const existing = app.vault.getAbstractFileByPath(normalizedPath);
		if (existing) {
			return { success: false, error: `Note already exists: ${normalizedPath}` };
		}

		// Create parent folders if needed
		const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
		if (folderPath) {
			const folder = app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				await app.vault.createFolder(folderPath);
			}
		}

		await app.vault.create(normalizedPath, content);
		return { success: true, path: normalizedPath };
	} catch (error) {
		return { success: false, error: `Failed to create note: ${error}` };
	}
}

/**
 * Update/replace the entire content of an existing note.
 *
 * @param app - The Obsidian App instance
 * @param path - The path to the note file
 * @param content - The new content to replace the existing content
 * @returns WriteResult indicating success or failure
 */
export async function updateNote(
	app: App,
	path: string,
	content: string
): Promise<WriteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}
		await app.vault.modify(file, content);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to update note: ${error}` };
	}
}

// ============================================================================
// Backlinks
// ============================================================================

/** A single backlink entry: a file that links TO the target note. */
export interface BacklinkEntry {
	/** Path of the source file that contains the link */
	sourcePath: string;
	/** Number of times the target is linked from the source */
	count: number;
}

/** A single unlinked mention entry. */
export interface UnlinkedMentionEntry {
	/** Path of the file that mentions the target note's title */
	sourcePath: string;
	/** Number of occurrences of the mention */
	count: number;
}

export interface GetBacklinksResult {
	success: boolean;
	/** Path of the note whose backlinks were queried */
	targetPath?: string;
	/** Files that explicitly link to the target */
	linkedMentions?: BacklinkEntry[];
	/** Files that mention the target title without a formal link */
	unlinkedMentions?: UnlinkedMentionEntry[];
	error?: string;
}

/**
 * Get all backlinks for a note — both resolved (linked) and unlinked mentions.
 *
 * Resolved backlinks are discovered by scanning `metadataCache.resolvedLinks`;
 * unlinked mentions are found by scanning `metadataCache.unresolvedLinks` for
 * entries whose key matches the target file's basename (case-insensitive).
 *
 * @param app - The Obsidian App instance
 * @param path - Vault-relative path of the target note; uses the active note if omitted
 * @returns GetBacklinksResult with linked and unlinked mention lists
 *
 * @example
 * ```typescript
 * const result = await getBacklinks(app, 'Projects/Alpha.md');
 * // { linkedMentions: [...], unlinkedMentions: [...] }
 * ```
 */
export async function getBacklinks(app: App, path?: string): Promise<GetBacklinksResult> {
	try {
		let targetFile: TFile | null = null;

		if (path) {
			const normalizedPath = normalizeVaultPath(path);
			const f = app.vault.getAbstractFileByPath(normalizedPath);
			if (!f || !(f instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			targetFile = f;
		} else {
			targetFile = app.workspace.getActiveFile();
			if (!targetFile) {
				return { success: false, error: "No active note. Please open a note first." };
			}
		}

		const targetPath = targetFile.path;
		const targetBasename = targetFile.basename.toLowerCase();
		const linkedMentions: BacklinkEntry[] = [];
		const unlinkedMentions: UnlinkedMentionEntry[] = [];

		// Resolved backlinks: scan resolvedLinks for files that point to targetPath
		const resolvedLinks: Record<string, Record<string, number>> =
			(app.metadataCache as unknown as { resolvedLinks: Record<string, Record<string, number>> })
				.resolvedLinks ?? {};
		for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
			if (sourcePath === targetPath) continue;
			const count = links[targetPath];
			if (count && count > 0) {
				linkedMentions.push({ sourcePath, count });
			}
		}

		// Unlinked mentions: scan unresolvedLinks for keys matching basename
		const unresolvedLinks: Record<string, Record<string, number>> =
			(app.metadataCache as unknown as { unresolvedLinks: Record<string, Record<string, number>> })
				.unresolvedLinks ?? {};
		for (const [sourcePath, links] of Object.entries(unresolvedLinks)) {
			if (sourcePath === targetPath) continue;
			let count = 0;
			for (const [linkText, linkCount] of Object.entries(links)) {
				if (linkText.toLowerCase() === targetBasename) {
					count += linkCount;
				}
			}
			if (count > 0) {
				unlinkedMentions.push({ sourcePath, count });
			}
		}

		// Sort by count descending
		linkedMentions.sort((a, b) => b.count - a.count);
		unlinkedMentions.sort((a, b) => b.count - a.count);

		return { success: true, targetPath, linkedMentions, unlinkedMentions };
	} catch (error) {
		return { success: false, error: `Failed to get backlinks: ${error}` };
	}
}

// ============================================================================
// Outgoing Links
// ============================================================================

/** A single resolved outgoing link entry. */
export interface OutgoingLinkEntry {
	/** Vault path of the linked note */
	targetPath: string;
	/** Number of times the link appears in the source */
	count: number;
}

/** A single unresolved outgoing link (the target note does not exist). */
export interface UnresolvedLinkEntry {
	/** The raw link text as written in the source */
	linkText: string;
	/** Number of occurrences */
	count: number;
}

export interface GetOutgoingLinksResult {
	success: boolean;
	/** Path of the note whose outgoing links were queried */
	sourcePath?: string;
	/** Links to notes that exist in the vault */
	resolvedLinks?: OutgoingLinkEntry[];
	/** Links to notes that do not yet exist (potential links to create) */
	unresolvedLinks?: UnresolvedLinkEntry[];
	error?: string;
}

/**
 * Get all outgoing links from a note — both resolved and unresolved.
 *
 * Resolved links point to existing vault notes; unresolved links reference
 * note names that do not yet have a corresponding file.
 *
 * @param app - The Obsidian App instance
 * @param path - Vault-relative path of the source note; uses the active note if omitted
 * @returns GetOutgoingLinksResult with resolved and unresolved link lists
 *
 * @example
 * ```typescript
 * const result = await getOutgoingLinks(app, 'Projects/Alpha.md');
 * // { resolvedLinks: [...], unresolvedLinks: [...] }
 * ```
 */
export async function getOutgoingLinks(app: App, path?: string): Promise<GetOutgoingLinksResult> {
	try {
		let sourceFile: TFile | null = null;

		if (path) {
			const normalizedPath = normalizeVaultPath(path);
			const f = app.vault.getAbstractFileByPath(normalizedPath);
			if (!f || !(f instanceof TFile)) {
				return { success: false, error: `Note not found: ${path}` };
			}
			sourceFile = f;
		} else {
			sourceFile = app.workspace.getActiveFile();
			if (!sourceFile) {
				return { success: false, error: "No active note. Please open a note first." };
			}
		}

		const sourcePath = sourceFile.path;
		const resolvedLinks: OutgoingLinkEntry[] = [];
		const unresolvedLinks: UnresolvedLinkEntry[] = [];

		// Resolved outgoing links from this file
		const allResolved: Record<string, Record<string, number>> =
			(app.metadataCache as unknown as { resolvedLinks: Record<string, Record<string, number>> })
				.resolvedLinks ?? {};
		const fileResolvedLinks = allResolved[sourcePath] ?? {};
		for (const [targetPath, count] of Object.entries(fileResolvedLinks)) {
			if (count > 0) {
				resolvedLinks.push({ targetPath, count });
			}
		}

		// Unresolved outgoing links from this file
		const allUnresolved: Record<string, Record<string, number>> =
			(app.metadataCache as unknown as { unresolvedLinks: Record<string, Record<string, number>> })
				.unresolvedLinks ?? {};
		const fileUnresolvedLinks = allUnresolved[sourcePath] ?? {};
		for (const [linkText, count] of Object.entries(fileUnresolvedLinks)) {
			if (count > 0) {
				unresolvedLinks.push({ linkText, count });
			}
		}

		// Sort by count descending
		resolvedLinks.sort((a, b) => b.count - a.count);
		unresolvedLinks.sort((a, b) => b.count - a.count);

		return { success: true, sourcePath, resolvedLinks, unresolvedLinks };
	} catch (error) {
		return { success: false, error: `Failed to get outgoing links: ${error}` };
	}
}
