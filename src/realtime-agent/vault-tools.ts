/**
 * Vault-related tools for the Realtime Agent
 *
 * Uses shared VaultOperations for the actual implementation.
 */

import { App } from "obsidian";
import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { ToolExecutionCallback } from "./types";
import * as VaultOps from "../copilot/VaultOperations";

/**
 * Create vault read/write tools for the realtime agent
 */
export function createVaultTools(
	app: App,
	onToolExecution: ToolExecutionCallback | null
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];

	// Read note tool
	tools.push(
		tool({
			name: "read_note",
			description: "Read the content of a note from the vault by its path",
			parameters: z.object({
				path: z
					.string()
					.describe(
						'The path to the note file (e.g., "folder/note.md" or "note")'
					),
			}),
			execute: async ({ path }) => {
				const result = await VaultOps.readNote(app, path);
				onToolExecution?.("read_note", { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Search notes tool
	tools.push(
		tool({
			name: "search_notes",
			description: "Search for notes in the vault by keyword",
			parameters: z.object({
				query: z
					.string()
					.describe("Search query to find in note titles or content"),
				limit: z
					.number()
					.optional()
					.describe("Maximum number of results (default: 5)"),
			}),
			execute: async ({ query, limit = 5 }) => {
				const result = await VaultOps.searchNotes(app, query, limit);
				onToolExecution?.("search_notes", { query, limit }, { count: result.results.length });
				return JSON.stringify(result);
			},
		})
	);

	// Get active note tool
	tools.push(
		tool({
			name: "get_active_note",
			description: "Get the currently active/open note in the editor",
			parameters: z.object({}),
			execute: async () => {
				const result = await VaultOps.getActiveNote(app);
				onToolExecution?.("get_active_note", {}, { path: result.path });
				return JSON.stringify(result);
			},
		})
	);

	// List notes tool
	tools.push(
		tool({
			name: "list_notes",
			description: "List notes in a folder or the entire vault",
			parameters: z.object({
				folder: z
					.string()
					.optional()
					.describe("Folder path to list (empty for all notes)"),
				limit: z
					.number()
					.optional()
					.describe("Maximum number of results (default: 20)"),
			}),
			execute: async ({ folder, limit = 20 }) => {
				const result = await VaultOps.listNotes(app, folder, limit);
				onToolExecution?.("list_notes", { folder, limit }, { count: result.notes.length });
				return JSON.stringify(result);
			},
		})
	);

	// Create note tool
	tools.push(
		tool({
			name: "create_note",
			description:
				"Create a new note in the vault with the specified content. Use this to create daily notes, meeting notes, or any new notes the user requests.",
			parameters: z.object({
				path: z
					.string()
					.describe(
						'The path for the new note (e.g., "Daily Notes/2026-01-31.md" or "Meeting Notes/standup.md"). Include .md extension.'
					),
				content: z
					.string()
					.describe("The content to write to the note (markdown format)"),
			}),
			execute: async ({ path, content }) => {
				const result = await VaultOps.createNote(app, path, content);
				onToolExecution?.("create_note", { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Append to note tool
	tools.push(
		tool({
			name: "append_to_note",
			description:
				"Append content to an existing note. Use this to add entries to daily notes or add content to existing notes.",
			parameters: z.object({
				path: z
					.string()
					.describe(
						'The path to the existing note (e.g., "Daily Notes/2026-01-31.md")'
					),
				content: z.string().describe("The content to append to the note"),
			}),
			execute: async ({ path, content }) => {
				const result = await VaultOps.appendToNote(app, path, content);
				onToolExecution?.("append_to_note", { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Update note tool - find and replace text in a note
	tools.push(
		tool({
			name: "update_note",
			description:
				"Update content in an existing note by finding and replacing text. Use this to mark tasks complete, update text, or make changes to existing notes.",
			parameters: z.object({
				path: z
					.string()
					.describe('The path to the note (e.g., "Daily Notes/2026-01-31.md")'),
				find: z.string().describe("The exact text to find in the note"),
				replace: z.string().describe("The text to replace it with"),
			}),
			execute: async ({ path, find, replace }) => {
				const result = await VaultOps.findAndReplaceInNote(app, path, find, replace);
				onToolExecution?.("update_note", { path, find, replace }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Replace note content tool - replaces entire note content
	tools.push(
		tool({
			name: "replace_note",
			description:
				"Replace the entire content of an existing note. Use this when you need to rewrite or completely update a note's content.",
			parameters: z.object({
				path: z
					.string()
					.describe('The path to the note (e.g., "Daily Notes/2026-01-31.md")'),
				content: z
					.string()
					.describe("The new content to replace the entire note with"),
			}),
			execute: async ({ path, content }) => {
				const result = await VaultOps.updateNote(app, path, content);
				onToolExecution?.("replace_note", { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Mark tasks complete tool - specifically for marking checkbox tasks as done
	tools.push(
		tool({
			name: "mark_tasks_complete",
			description:
				"Mark specific tasks as complete in a note. Provide the list of tasks to mark complete (change [ ] to [x]) and optionally tasks to exclude.",
			parameters: z.object({
				task_list: z
					.array(z.string())
					.describe(
						"List of task text strings to mark as complete (the text after '- [ ] ')"
					),
				exceptions: z
					.array(z.string())
					.optional()
					.describe(
						"Optional list of task text strings to NOT mark as complete (keep as [ ])"
					),
			}),
			execute: async ({ task_list, exceptions = [] }) => {
				const result = await VaultOps.markTasksComplete(app, task_list, exceptions);
				onToolExecution?.("mark_tasks_complete", { task_list, exceptions }, result);
				return JSON.stringify(result);
			},
		})
	);

	return tools;
}
