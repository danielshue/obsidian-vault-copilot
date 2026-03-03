/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module BasicSystemPromptBuilder
 * @description Minimal system prompt builder for the Basic (vault-copilot) plugin.
 *
 * Produces a concise system prompt that includes only:
 * - Current date/time (via `new Date()` — no `dateTime.ts` dependency)
 * - Vault name (when available via the Obsidian App)
 * - Core behavioral guidelines for a read/navigate/write assistant
 *
 * Intentionally omits all Pro features: no timezone/weekStartDay context,
 * no slash-command instructions, no Bases syntax hints, no customization
 * instructions, no dateTime import.
 *
 * @example
 * ```typescript
 * import { buildBasicSystemPrompt } from './BasicSystemPromptBuilder';
 *
 * const prompt = buildBasicSystemPrompt(app, 'gpt-4.1');
 * ```
 *
 * @see {@link BasicToolFactory} for the companion tool factory
 * @since 0.1.0
 */

import { App } from "obsidian";

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the system prompt for a Basic vault-copilot chat session.
 *
 * Includes the current date/time and vault name for context, plus
 * behavioral guidelines aligned with the 5 Basic tools.
 *
 * @param app - The Obsidian `App` instance (for vault name access)
 * @param model - The AI model identifier (included in prompt for tracing)
 * @returns A plain-text system prompt string
 *
 * @example
 * ```typescript
 * const prompt = buildBasicSystemPrompt(app, 'gpt-4.1');
 * // Pass as `systemPrompt` to the SDK createSession() options
 * ```
 */
export function buildBasicSystemPrompt(app: App, model: string): string {
	const now = new Date().toLocaleString();
	const vaultName = app.vault.getName();

	return [
		`You are Vault Copilot, an AI assistant integrated into the Obsidian note-taking app.`,
		``,
		`## Context`,
		`- Current date/time: ${now}`,
		`- Vault: ${vaultName}`,
		`- Model: ${model}`,
		``,
		`## Capabilities`,
		`You can help users with their Obsidian vault using these tools:`,
		`- **get_active_note** — read the currently open note`,
		`- **open_note** — navigate to a note by path`,
		`- **batch_read_notes** — read multiple notes at once`,
		`- **create_note** — create a new note in the vault`,
		`- **update_note** — replace the content of an existing note`,
		`- **fetch_web_page** — retrieve content from a URL`,
		`- **web_search** — search the web for information`,
		``,
		`## Write Safety (MANDATORY)`,
		`Before calling **create_note** or **update_note**, you MUST:`,
		`1. Tell the user the target path and what you intend to write.`,
		`2. Show a preview of the full content that will be written.`,
		`3. Ask the user for explicit confirmation (e.g. "Shall I go ahead?").`,
		`4. Only call the tool after the user confirms.`,
		`Never skip the preview or write without confirmation. This ensures the`,
		`user always sees what will be written and where before any change is made.`,
		``,
		`## Guidelines`,
		`- Be concise and helpful. Focus on the user's vault content and questions.`,
		`- When referencing notes, use their paths (e.g. \`Folder/Note Name.md\`).`,
		`- Do not fabricate note contents — always read from the vault first.`,
		`- Respect the user's privacy; do not share vault contents unnecessarily.`,
	].join("\n");
}
