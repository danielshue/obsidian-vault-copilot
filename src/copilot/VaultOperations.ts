/**
 * VaultOperations - Shared vault operation functions
 *
 * These functions provide the core implementation for vault operations
 * and can be used by multiple services (CopilotService, RealtimeAgentService, etc.)
 */

import { App, TFile } from "obsidian";

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

/**
 * Escape regex special characters
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Vault Read Operations
// ============================================================================

export interface ReadNoteResult {
	success: boolean;
	content?: string;
	path?: string;
	error?: string;
}

export async function readNote(app: App, path: string): Promise<ReadNoteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}
		const content = await app.vault.read(file);
		return { success: true, content, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to read note: ${error}` };
	}
}

export interface SearchNotesResult {
	success: boolean;
	results: Array<{ path: string; title: string; excerpt: string }>;
}

export async function searchNotes(
	app: App,
	query: string,
	limit = 10
): Promise<SearchNotesResult> {
	const files = app.vault.getMarkdownFiles();
	const results: Array<{ path: string; title: string; excerpt: string }> = [];
	const lowerQuery = query.toLowerCase();

	for (const file of files) {
		if (results.length >= limit) break;

		const titleMatch = file.basename.toLowerCase().includes(lowerQuery);
		let contentMatch = false;
		let excerpt = "";

		try {
			const content = await app.vault.cachedRead(file);
			const lowerContent = content.toLowerCase();
			const queryIndex = lowerContent.indexOf(lowerQuery);

			if (queryIndex !== -1) {
				contentMatch = true;
				const start = Math.max(0, queryIndex - 50);
				const end = Math.min(content.length, queryIndex + query.length + 50);
				excerpt =
					(start > 0 ? "..." : "") +
					content.slice(start, end) +
					(end < content.length ? "..." : "");
			}
		} catch {
			// Skip files that can't be read
		}

		if (titleMatch || contentMatch) {
			results.push({
				path: file.path,
				title: file.basename,
				excerpt: excerpt || file.basename,
			});
		}
	}

	return { success: true, results };
}

export interface GetActiveNoteResult {
	success: boolean;
	hasActiveNote: boolean;
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

export interface ListNotesResult {
	success: boolean;
	notes: Array<{ path: string; title: string }>;
}

export async function listNotes(
	app: App,
	folder?: string,
	limit = 100
): Promise<ListNotesResult> {
	const files = app.vault.getMarkdownFiles();
	const normalizedFolder = folder
		? folder.replace(/\\/g, "/").replace(/\/+$/, "")
		: undefined;

	const notes = files
		.filter((file) => !normalizedFolder || file.path.startsWith(normalizedFolder))
		.slice(0, limit)
		.map((file) => ({
			path: file.path,
			title: file.basename,
		}));

	return { success: true, notes };
}

// ============================================================================
// Vault Write Operations
// ============================================================================

export interface WriteResult {
	success: boolean;
	path?: string;
	error?: string;
}

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

export async function appendToNote(
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
		await app.vault.append(file, "\n" + content);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to append to note: ${error}` };
	}
}

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

export interface FindReplaceResult {
	success: boolean;
	path?: string;
	error?: string;
}

export async function findAndReplaceInNote(
	app: App,
	path: string,
	find: string,
	replace: string
): Promise<FindReplaceResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}

		const content = await app.vault.read(file);

		if (!content.includes(find)) {
			return {
				success: false,
				error: `Text not found in note: "${find.substring(0, 50)}${find.length > 50 ? "..." : ""}"`,
			};
		}

		const updatedContent = content.replace(find, replace);
		await app.vault.modify(file, updatedContent);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to update note: ${error}` };
	}
}

export interface MarkTasksResult {
	success: boolean;
	path?: string;
	tasksMarked?: number;
	error?: string;
}

export async function markTasksComplete(
	app: App,
	taskList: string[],
	exceptions: string[] = [],
	notePath?: string
): Promise<MarkTasksResult> {
	try {
		let file: TFile | null = null;
		
		if (notePath) {
			const normalizedPath = normalizeVaultPath(notePath);
			const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
			if (abstractFile instanceof TFile) {
				file = abstractFile;
			}
		} else {
			file = app.workspace.getActiveFile();
		}

		if (!file) {
			return { success: false, error: "No note specified or active" };
		}

		let content = await app.vault.read(file);
		let modified = false;
		let tasksMarked = 0;

		for (const task of taskList) {
			if (exceptions.includes(task)) continue;

			const escapedTask = escapeRegex(task);
			const taskRegex = new RegExp(`- \\[ \\] ${escapedTask}`, "g");
			const newContent = content.replace(taskRegex, `- [x] ${task}`);

			if (newContent !== content) {
				content = newContent;
				modified = true;
				tasksMarked++;
			}
		}

		if (modified) {
			await app.vault.modify(file, content);
			return { success: true, path: file.path, tasksMarked };
		} else {
			return { success: false, error: "No matching unchecked tasks found" };
		}
	} catch (error) {
		return { success: false, error: `Failed to mark tasks: ${error}` };
	}
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
