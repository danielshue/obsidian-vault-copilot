/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BasicToolFactory
 * @description Factory for creating the Basic vault-copilot tools.
 *
 * Produces `defineTool()` instances for the tools
 * available in the Basic (free) plugin tier:
 *
 * **Vault note tools (7):**
 * - `get_active_note` — returns metadata + content of the open note
 * - `open_note` — navigate the editor to a note by path
 * - `batch_read_notes` — read multiple notes in one call
 * - `create_note` — create a new note in the vault
 * - `update_note` — update/replace the content of an existing note
 * - `fetch_web_page` — fetch and extract text from a URL
 * - `web_search` — search the web via DuckDuckGo
 *
 * **Contact tools (4):**
 * - `list_contacts` — list all contact notes in the contacts folder
 * - `get_contact` — read a contact note by name or path
 * - `create_contact` — create a new contact note with structured frontmatter
 * - `update_contact` — patch specific fields of an existing contact note
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
	createNote,
	updateNote,
	fetchWebPage,
	webSearch,
} from "../tools/VaultOperations";
import {
	listContacts,
	getContact,
	createContact,
	updateContact,
} from "../tools/ContactOperations";

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
 * Create the Basic SDK tool definitions (7 vault tools + 4 contact tools).
 *
 * This factory returns an array ready to be spread into the SDK
 * `createSession()` tools list. The `batchReadNotes` function is
 * injected so the factory itself has no service dependency.
 *
 * @param app - The Obsidian `App` instance (for vault/workspace access)
 * @param batchReadNotes - Bound batch-read implementation from the service
 * @returns Array of 11 SDK `defineTool()` results
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

		defineTool(TOOL_NAMES.LIST_CONTACTS, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_CONTACTS],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_CONTACTS],
			handler: async (args: { folder?: string; limit?: number }) => {
				return await listContacts(app, args.folder, args.limit);
			},
		}),

		defineTool(TOOL_NAMES.GET_CONTACT, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_CONTACT],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_CONTACT],
			handler: async (args: { pathOrName: string; folder?: string }) => {
				return await getContact(app, args.pathOrName, args.folder);
			},
		}),

		defineTool(TOOL_NAMES.CREATE_CONTACT, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_CONTACT],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.CREATE_CONTACT],
			handler: async (args: {
				name: string;
				email?: string;
				phone?: string;
				company?: string;
				role?: string;
				notes?: string;
				folder?: string;
			}) => {
				return await createContact(app, args);
			},
		}),

		defineTool(TOOL_NAMES.UPDATE_CONTACT, {
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.UPDATE_CONTACT],
			parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.UPDATE_CONTACT],
			handler: async (args: {
				pathOrName: string;
				email?: string;
				phone?: string;
				company?: string;
				role?: string;
				notes?: string;
				folder?: string;
			}) => {
				return await updateContact(app, args);
			},
		}),
	];
}
