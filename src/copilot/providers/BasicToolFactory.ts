/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BasicToolFactory
 * @description Factory for creating the 8 Basic vault-copilot tools.
 *
 * Produces `defineTool()` instances for the tools
 * available in the Basic (free) plugin tier:
 *
 * - `get_active_note` — returns metadata + content of the open note
 * - `open_note` — navigate the editor to a note by path
 * - `batch_read_notes` — read multiple notes in one call
 * - `list_notes` — list notes in a folder with optional recursive/pattern filtering
 * - `create_note` — create a new note in the vault
 * - `update_note` — update/replace the content of an existing note
 * - `fetch_web_page` — fetch and extract text from a URL
 * - `web_search` — search the web via DuckDuckGo
 *
 * All Pro-only imports (`customization/`, `mcp/`, `bases/`, callbacks, etc.)
 * are intentionally absent from this module.
 *
 * @example
 * ```typescript
 * import { createBasicTools } from './BasicToolFactory';
 *
 * const tools = createBasicTools(app, service.batchReadNotes.bind(service));
 * // Pass `tools` to the SDK createSession() call.
 * ```
 *
 * @see {@link BasicSystemPromptBuilder} for the companion prompt module
 * @since 0.1.0
 */

import { App } from "obsidian";
import { defineTool } from "@github/copilot-sdk";
import {
	TOOL_NAMES,
	TOOL_DESCRIPTIONS,
	TOOL_JSON_SCHEMAS,
} from "../tools/ToolDefinitions";
import {
	getActiveNote,
	openNote,
	listNotes,
	createNote,
	updateNote,
	fetchWebPage,
	webSearch,
} from "../tools/VaultOperations";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Result structure returned by the `batch_read_notes` tool handler.
 * Mirrors the shape produced by the `batchReadNotes` service method.
 */
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
 * Signature of the batch-read function injected into the Basic tool factory.
 *
 * The base `GitHubCopilotCliService.batchReadNotes` fulfils this contract;
 * the Pro service provides an AI-summarizer-enabled override.
 */
export type BatchReadNotesFn = (
	paths: string[],
	aiSummarize?: boolean,
	summaryPrompt?: string
) => Promise<BatchReadNotesResult>;

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create the 8 Basic SDK tool definitions.
 *
 * This factory returns an array ready to be spread into the SDK
 * `createSession()` tools list. The `batchReadNotes` function is
 * injected so the factory itself has no service dependency.
 *
 * @param app - The Obsidian `App` instance (for vault/workspace access)
 * @param batchReadNotes - Bound batch-read implementation from the service
 * @returns Array of 8 SDK `defineTool()` results
 *
 * @example
 * ```typescript
 * const tools = createBasicTools(this.app, this.batchReadNotes.bind(this));
 * ```
 */
export function createBasicTools(
	app: App,
	batchReadNotes: BatchReadNotesFn
) {
	return [
		defineTool(TOOL_NAMES.GET_ACTIVE_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_ACTIVE_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_ACTIVE_NOTE],
			handler: async () => {
				return await getActiveNote(app);
			},
		}),

		defineTool(TOOL_NAMES.OPEN_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.OPEN_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.OPEN_NOTE],
			handler: async (args: { path: string }) => {
				return await openNote(app, args.path);
			},
		}),

		defineTool(TOOL_NAMES.BATCH_READ_NOTES, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.BATCH_READ_NOTES],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.BATCH_READ_NOTES],
			handler: async (args: {
				paths: string[];
				aiSummarize?: boolean;
				summaryPrompt?: string;
			}) => {
				return await batchReadNotes(
					args.paths,
					args.aiSummarize,
					args.summaryPrompt
				);
			},
		}),

		defineTool(TOOL_NAMES.LIST_NOTES, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES],
			handler: async (args: {
				folder?: string;
				recursive?: boolean;
				pattern?: string;
			}) => {
				return await listNotes(app, args.folder, args.recursive, args.pattern);
			},
		}),

		defineTool(TOOL_NAMES.CREATE_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.CREATE_NOTE],
			handler: async (args: { path: string; content: string }) => {
				return await createNote(app, args.path, args.content);
			},
		}),

		defineTool(TOOL_NAMES.UPDATE_NOTE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.UPDATE_NOTE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.UPDATE_NOTE],
			handler: async (args: { path: string; content: string }) => {
				return await updateNote(app, args.path, args.content);
			},
		}),

		defineTool(TOOL_NAMES.FETCH_WEB_PAGE, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.FETCH_WEB_PAGE],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.FETCH_WEB_PAGE],
			handler: async (args: { url: string }) => {
				return await fetchWebPage(args.url);
			},
		}),

		defineTool(TOOL_NAMES.WEB_SEARCH, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.WEB_SEARCH],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.WEB_SEARCH],
			handler: async (args: { query: string; limit?: number }) => {
				return await webSearch(args.query, args.limit ?? 5);
			},
		}),
	];
}
