/**
 * Workaround utilities for handling edge cases in the Realtime API
 * 
 * The realtime model sometimes outputs JSON/code text instead of calling functions.
 * These utilities detect and handle such cases.
 */

import { App, TFile } from "obsidian";
import { Notice } from "obsidian";
import type { RealtimeHistoryItem, ToolExecutionCallback } from "./types";
import { logger } from "./types";

/** Context passed to individual handlers */
interface HandlerContext {
	app: App;
	content: string;
	activeFile: TFile | null;
	onToolExecution: ToolExecutionCallback | null;
}

/**
 * Escape regex special characters in a string
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Execute task completion on a file
 */
export async function executeTaskCompletion(
	app: App,
	file: TFile,
	tasks: string[],
	onToolExecution: ToolExecutionCallback | null
): Promise<void> {
	let content = await app.vault.read(file);
	let modified = false;
	let count = 0;

	for (const task of tasks) {
		if (!task) continue;

		const escapedTask = task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const taskRegex = new RegExp(`- \\[ \\] ${escapedTask}`, "g");
		const newContent = content.replace(taskRegex, `- [x] ${task}`);

		if (newContent !== content) {
			content = newContent;
			modified = true;
			count++;
		}
	}

	if (modified) {
		await app.vault.modify(file, content);
		logger.info(`Workaround: Marked ${count} tasks complete`);
		onToolExecution?.("mark_tasks_complete", { tasks }, { success: true, count });
		new Notice(`Marked ${count} tasks complete`);
	} else {
		logger.warn("Workaround: No matching tasks found");
	}
}

/**
 * Handle function-call-like text output (e.g., "update_checklist(...)")
 */
async function handleFunctionCallSyntax(ctx: HandlerContext): Promise<boolean> {
	const { content, activeFile, app, onToolExecution } = ctx;
	
	if (!content.match(/^\w+\s*\(/)) {
		return false;
	}
	
	logger.debug("Detected function-call-like text output, attempting to parse");
	const completedTaskMatches = content.matchAll(
		/["']([^"']+)["']\s*[,:]\s*(?:completed|done|True|true)/gi
	);
	const tasks: string[] = [];
	for (const match of completedTaskMatches) {
		if (match[1]) {
			tasks.push(match[1]);
		}
	}

	if (tasks.length > 0 && activeFile) {
		logger.debug("Extracted tasks to complete:", tasks);
		await executeTaskCompletion(app, activeFile, tasks, onToolExecution);
		return true;
	}
	return false;
}

/**
 * Handle replace_note JSON format: { path: string, content: string }
 */
async function handleReplaceNoteJson(
	ctx: HandlerContext,
	parsed: { path?: string; content?: string }
): Promise<boolean> {
	const { app, onToolExecution } = ctx;
	
	if (!parsed.path || !parsed.content) {
		return false;
	}
	
	logger.debug("Detected JSON tool output, executing replace_note workaround");

	let normalizedPath = parsed.path.replace(/\\/g, "/").trim();
	if (!normalizedPath.endsWith(".md")) {
		normalizedPath += ".md";
	}

	const file = app.vault.getAbstractFileByPath(normalizedPath);
	if (file && file instanceof TFile) {
		await app.vault.modify(file, parsed.content);
		logger.info("Workaround: Successfully updated note via JSON intercept");
		onToolExecution?.(
			"replace_note",
			{ path: normalizedPath },
			{ success: true }
		);
		new Notice(`Updated note: ${file.basename}`);
		return true;
	} else {
		logger.warn("Workaround: Note not found:", normalizedPath);
		return false;
	}
}

/**
 * Handle updates array JSON format: { path?: string, updates: Array<{pattern, replacement} | {target, content}> }
 */
async function handleUpdatesArrayJson(
	ctx: HandlerContext,
	parsed: { path?: string; updates?: unknown[] }
): Promise<boolean> {
	const { app, activeFile, onToolExecution } = ctx;
	
	if (!parsed.updates || !Array.isArray(parsed.updates)) {
		return false;
	}
	
	logger.debug("Detected JSON update operation, executing workaround");

	let file: TFile | null = null;

	if (parsed.path) {
		let normalizedPath = parsed.path.replace(/\\/g, "/").trim();
		if (!normalizedPath.endsWith(".md")) {
			normalizedPath += ".md";
		}
		const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
		if (abstractFile instanceof TFile) {
			file = abstractFile;
		}
	} else if (activeFile) {
		file = activeFile;
		logger.debug("No path in JSON, using active note:", file.path);
	}

	if (!file) {
		return false;
	}

	let noteContent = await app.vault.read(file);
	let modified = false;

	for (const update of parsed.updates as Record<string, string>[]) {
		// Handle pattern/replacement format (regex-style)
		if (update.pattern && update.replacement !== undefined) {
			try {
				const patternStr = update.pattern
					.replace(/\\\[/g, "\\[")
					.replace(/\\\]/g, "\\]");
				const regex = new RegExp(patternStr, "g");
				const newContent = noteContent.replace(regex, update.replacement);
				if (newContent !== noteContent) {
					noteContent = newContent;
					modified = true;
					logger.debug("Applied pattern replacement:", update.pattern.substring(0, 50));
				}
			} catch {
				const literal = update.pattern
					.replace(/\\\[/g, "[")
					.replace(/\\\]/g, "]")
					.replace(/\\\s/g, " ");
				if (noteContent.includes(literal)) {
					noteContent = noteContent.replace(literal, update.replacement);
					modified = true;
					logger.debug("Applied literal replacement:", literal.substring(0, 50));
				}
			}
		}
		// Handle target/content format (section-based)
		else if (update.target && update.content) {
			const headingRegex = new RegExp(
				`^(#{1,6})\\s+${escapeRegex(update.target.replace(/^#+\s*/, ""))}\\s*$`,
				"m"
			);
			const match = noteContent.match(headingRegex);

			if (match && match.index !== undefined && match[1]) {
				const headingLevel = match[1].length;
				const headingEnd = match.index + match[0].length;

				const restContent = noteContent.slice(headingEnd);
				const nextHeadingRegex = new RegExp(
					`^#{1,${headingLevel}}\\s+`,
					"m"
				);
				const nextMatch = restContent.match(nextHeadingRegex);
				const sectionEnd =
					nextMatch && nextMatch.index !== undefined
						? headingEnd + nextMatch.index
						: noteContent.length;

				noteContent =
					noteContent.slice(0, headingEnd) +
					"\n\n" +
					update.content +
					"\n\n" +
					noteContent.slice(sectionEnd);
				modified = true;
			}
		}
	}

	if (modified) {
		await app.vault.modify(file, noteContent);
		logger.info("Workaround: Successfully updated note via JSON intercept (updates array)");
		onToolExecution?.(
			"update_note",
			{ path: file.path },
			{ success: true }
		);
		new Notice(`Updated: ${file.basename}`);
		return true;
	} else {
		logger.warn("Workaround: No patterns matched in note");
		return false;
	}
}

/**
 * Handle checklist JSON format: { checklist: Array<{task, completed}> }
 */
async function handleChecklistJson(
	ctx: HandlerContext,
	parsed: { checklist?: Array<{ task?: string; completed?: boolean }> }
): Promise<boolean> {
	const { app, activeFile, onToolExecution } = ctx;
	
	if (!parsed.checklist || !Array.isArray(parsed.checklist) || !activeFile) {
		return false;
	}
	
	logger.debug("Detected checklist update JSON, executing workaround");
	const tasks = parsed.checklist
		.filter((item) => item.completed === true)
		.map((item) => item.task || "");

	if (tasks.length > 0) {
		await executeTaskCompletion(app, activeFile, tasks, onToolExecution);
		return true;
	}
	return false;
}

/**
 * Handle JSON or function-call-like output that looks like a tool call
 * The realtime model sometimes outputs text instead of calling functions
 */
export async function handlePossibleJsonToolCall(
	app: App,
	content: string,
	onToolExecution: ToolExecutionCallback | null
): Promise<void> {
	const trimmedContent = content.trim();
	const activeFile = app.workspace.getActiveFile();
	
	const ctx: HandlerContext = {
		app,
		content: trimmedContent,
		activeFile,
		onToolExecution,
	};

	// Try function-call syntax first (e.g., "update_checklist(...)")
	if (await handleFunctionCallSyntax(ctx)) {
		return;
	}

	// Try to parse as JSON
	try {
		const parsed = JSON.parse(trimmedContent);
		
		// Try each JSON format handler in order
		if (await handleReplaceNoteJson(ctx, parsed)) return;
		if (await handleUpdatesArrayJson(ctx, parsed)) return;
		if (await handleChecklistJson(ctx, parsed)) return;
		
	} catch {
		// Not valid JSON - check if it looked like it should be
		if (trimmedContent.startsWith("{") || trimmedContent.startsWith("[")) {
			logger.debug("JSON parse or execution error");
		}
	}
}

/**
 * Check if a history item might contain a JSON tool call that needs handling
 */
export function mightBeJsonToolCall(item: RealtimeHistoryItem): boolean {
	const content = item.content || item.transcript || "";
	const trimmed = content.trim();
	return (
		item.role === "assistant" &&
		(trimmed.startsWith("{") ||
			trimmed.startsWith("[") ||
			Boolean(trimmed.match(/^\w+\s*\(/)))
	);
}
