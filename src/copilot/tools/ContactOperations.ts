/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ContactOperations
 * @description Vault-native contact management operations for Basic AI tool calling.
 *
 * Contacts are stored as Markdown notes with YAML frontmatter inside a
 * configurable folder (default: `"Contacts"`). The frontmatter schema is:
 *
 * ```yaml
 * ---
 * name: Jane Doe
 * email: jane@example.com
 * phone: +1 555-0100
 * company: Acme Corp
 * role: Engineer
 * tags:
 *   - contact
 * created: 2026-03-10
 * ---
 * Optional freeform notes below.
 * ```
 *
 * ## Tools provided
 *
 * - `listContacts`   — List all contact notes in the contacts folder
 * - `getContact`     — Read a specific contact note by name or path
 * - `createContact`  — Create a new contact note with structured frontmatter
 * - `updateContact`  — Patch specific frontmatter fields of an existing contact
 *
 * @since 0.0.44
 */

import { App, TFile } from "obsidian";
import { normalizeVaultPath } from "./VaultOperations";

// ============================================================================
// Shared helpers
// ============================================================================

/** Default folder where contact notes are stored. */
export const DEFAULT_CONTACTS_FOLDER = "Contacts";

/**
 * Build the vault path for a contact note.
 *
 * @param name - Display name of the contact
 * @param folder - Target folder (defaults to {@link DEFAULT_CONTACTS_FOLDER})
 * @returns Vault-relative path, e.g. `"Contacts/Jane Doe.md"`
 */
function contactPath(name: string, folder: string): string {
	return `${folder}/${name}.md`;
}

/**
 * Escape a string for safe embedding inside a YAML scalar.
 * Double-quotes are escaped; the result is wrapped in double quotes.
 */
function yamlScalar(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Render the YAML frontmatter block for a contact, omitting blank fields.
 *
 * @param fields - Frontmatter key/value pairs
 * @returns Frontmatter block including the `---` delimiters
 */
function buildFrontmatter(fields: Record<string, string | undefined>): string {
	const lines: string[] = ["---"];
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined && value.trim() !== "") {
			if (key === "tags") {
				lines.push(`tags:\n  - contact`);
			} else {
				lines.push(`${key}: ${yamlScalar(value)}`);
			}
		}
	}
	lines.push("---");
	return lines.join("\n");
}

/**
 * Parse YAML frontmatter from note content.
 * Returns key/value pairs from the first `---` block, or an empty object if
 * no frontmatter is present.
 */
export function parseFrontmatter(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match || !match[1]) return result;

	for (const line of match[1].split("\n")) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;
		const key = line.slice(0, colonIndex).trim();
		const raw = line.slice(colonIndex + 1).trim();
		// Strip surrounding double quotes if present
		const value = raw.startsWith('"') && raw.endsWith('"')
			? raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
			: raw;
		if (key) result[key] = value;
	}
	return result;
}

/**
 * Replace a specific frontmatter field value inside raw note content.
 * If the field does not yet exist, it is inserted before the closing `---`.
 */
function patchFrontmatterField(
	content: string,
	key: string,
	value: string,
): string {
	const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
	if (!fmMatch) return content;

	const [, open, body, close] = fmMatch;
	const lineRegex = new RegExp(`^${key}:.*$`, "m");
	const newLine = `${key}: ${yamlScalar(value)}`;

	const newBody = lineRegex.test(body)
		? body.replace(lineRegex, newLine)
		: `${body}\n${newLine}`;

	const afterFm = content.slice(open.length + body.length + close.length);
	return `${open}${newBody}${close}${afterFm}`;
}

// ============================================================================
// list_contacts
// ============================================================================

/** A single entry returned by {@link listContacts}. */
export interface ContactSummary {
	/** Vault-relative path of the contact note */
	path: string;
	/** Display name extracted from frontmatter or filename */
	name: string;
	/** Email address from frontmatter, if present */
	email?: string;
	/** Company from frontmatter, if present */
	company?: string;
	/** Phone number from frontmatter, if present */
	phone?: string;
}

export interface ListContactsResult {
	success: boolean;
	folder: string;
	contacts: ContactSummary[];
	total: number;
	error?: string;
}

/**
 * List all contact notes found inside the contacts folder.
 *
 * @param app    - The Obsidian App instance
 * @param folder - Vault-relative folder to scan (default: `"Contacts"`)
 * @param limit  - Maximum number of entries to return (default: 50)
 * @returns {@link ListContactsResult} with summary rows for each contact
 *
 * @example
 * ```typescript
 * const result = await listContacts(app, "Contacts", 20);
 * result.contacts.forEach(c => console.log(c.name, c.email));
 * ```
 */
export async function listContacts(
	app: App,
	folder: string = DEFAULT_CONTACTS_FOLDER,
	limit = 50,
): Promise<ListContactsResult> {
	try {
		const prefix = folder.replace(/\/+$/, "") + "/";
		const allFiles = app.vault.getMarkdownFiles();
		const contactFiles = allFiles
			.filter((f) => f.path.startsWith(prefix))
			.slice(0, limit);

		const contacts: ContactSummary[] = await Promise.all(
			contactFiles.map(async (file) => {
				try {
					const content = await app.vault.read(file);
					const fm = parseFrontmatter(content);
					return {
						path: file.path,
						name: fm["name"] || file.basename,
						email: fm["email"],
						company: fm["company"],
						phone: fm["phone"],
					};
				} catch {
					return { path: file.path, name: file.basename };
				}
			}),
		);

		return { success: true, folder, contacts, total: contacts.length };
	} catch (error) {
		return {
			success: false,
			folder,
			contacts: [],
			total: 0,
			error: `Failed to list contacts: ${error}`,
		};
	}
}

// ============================================================================
// get_contact
// ============================================================================

export interface GetContactResult {
	success: boolean;
	path?: string;
	name?: string;
	email?: string;
	phone?: string;
	company?: string;
	role?: string;
	notes?: string;
	frontmatter?: Record<string, string>;
	error?: string;
}

/**
 * Read a single contact note by vault path or display name.
 *
 * When `pathOrName` does not end with `.md` it is treated as a display name
 * and resolved to `<folder>/<name>.md`.
 *
 * @param app        - The Obsidian App instance
 * @param pathOrName - Vault path (`"Contacts/Jane Doe.md"`) or name (`"Jane Doe"`)
 * @param folder     - Fallback folder used when resolving by name
 * @returns Parsed contact fields plus raw frontmatter
 *
 * @example
 * ```typescript
 * const contact = await getContact(app, "Jane Doe");
 * console.log(contact.email); // "jane@example.com"
 * ```
 */
export async function getContact(
	app: App,
	pathOrName: string,
	folder: string = DEFAULT_CONTACTS_FOLDER,
): Promise<GetContactResult> {
	try {
		const resolvedPath = pathOrName.endsWith(".md")
			? normalizeVaultPath(pathOrName)
			: normalizeVaultPath(contactPath(pathOrName, folder));

		const file = app.vault.getAbstractFileByPath(resolvedPath);
		if (!file || !(file instanceof TFile)) {
			return {
				success: false,
				error: `Contact not found: ${pathOrName}`,
			};
		}

		const content = await app.vault.read(file);
		const fm = parseFrontmatter(content);

		// Extract freeform body (everything after the closing ---)
		const bodyMatch = content.match(/^---[\s\S]*?---\n?([\s\S]*)$/);
		const notes = bodyMatch ? bodyMatch[1].trim() : "";

		return {
			success: true,
			path: file.path,
			name: fm["name"] || file.basename,
			email: fm["email"],
			phone: fm["phone"],
			company: fm["company"],
			role: fm["role"],
			notes: notes || undefined,
			frontmatter: fm,
		};
	} catch (error) {
		return { success: false, error: `Failed to get contact: ${error}` };
	}
}

// ============================================================================
// create_contact
// ============================================================================

export interface CreateContactParams {
	/** Full name of the contact (required) */
	name: string;
	/** Email address */
	email?: string;
	/** Phone number */
	phone?: string;
	/** Company or organisation name */
	company?: string;
	/** Job title or role */
	role?: string;
	/** Freeform notes to appear in the note body */
	notes?: string;
	/** Target folder (default: `"Contacts"`) */
	folder?: string;
}

export interface CreateContactResult {
	success: boolean;
	path?: string;
	error?: string;
}

/**
 * Create a new contact note in the contacts folder.
 *
 * The note is created with YAML frontmatter populated from the supplied fields.
 * Empty fields are omitted. Parent folders are created automatically.
 *
 * @param app    - The Obsidian App instance
 * @param params - Contact fields — see {@link CreateContactParams}
 * @returns {@link CreateContactResult} indicating success or failure
 *
 * @example
 * ```typescript
 * const result = await createContact(app, {
 *   name: "Jane Doe",
 *   email: "jane@example.com",
 *   company: "Acme Corp",
 * });
 * console.log(result.path); // "Contacts/Jane Doe.md"
 * ```
 */
export async function createContact(
	app: App,
	params: CreateContactParams,
): Promise<CreateContactResult> {
	const { name, email, phone, company, role, notes, folder = DEFAULT_CONTACTS_FOLDER } = params;

	if (!name || name.trim() === "") {
		return { success: false, error: "Contact name is required." };
	}

	try {
		const today = new Date().toISOString().slice(0, 10);
		const frontmatter = buildFrontmatter({
			name,
			email,
			phone,
			company,
			role,
			tags: "contact",
			created: today,
		});

		const body = notes ? `\n${notes}` : "";
		const content = `${frontmatter}\n${body}`.trimEnd() + "\n";

		const notePath = contactPath(name.trim(), folder);

		const existing = app.vault.getAbstractFileByPath(notePath);
		if (existing) {
			return { success: false, error: `Contact already exists: ${notePath}` };
		}

		// Ensure the contacts folder exists
		const folderAbstract = app.vault.getAbstractFileByPath(folder);
		if (!folderAbstract) {
			await app.vault.createFolder(folder);
		}

		await app.vault.create(notePath, content);
		return { success: true, path: notePath };
	} catch (error) {
		return { success: false, error: `Failed to create contact: ${error}` };
	}
}

// ============================================================================
// update_contact
// ============================================================================

export interface UpdateContactParams {
	/** Vault path or display name of the contact to update */
	pathOrName: string;
	/** New email address */
	email?: string;
	/** New phone number */
	phone?: string;
	/** New company */
	company?: string;
	/** New job title / role */
	role?: string;
	/** Replace the entire freeform notes body */
	notes?: string;
	/** Fallback folder used when resolving by name */
	folder?: string;
}

export interface UpdateContactResult {
	success: boolean;
	path?: string;
	error?: string;
}

/**
 * Patch one or more fields of an existing contact note.
 *
 * Only the supplied fields are changed; omitted fields are left untouched.
 * Passing `notes` replaces the entire freeform body below the frontmatter.
 *
 * @param app    - The Obsidian App instance
 * @param params - Fields to update — see {@link UpdateContactParams}
 * @returns {@link UpdateContactResult} indicating success or failure
 *
 * @example
 * ```typescript
 * const result = await updateContact(app, {
 *   pathOrName: "Jane Doe",
 *   email: "jane.doe@newcorp.com",
 *   company: "NewCorp",
 * });
 * ```
 */
export async function updateContact(
	app: App,
	params: UpdateContactParams,
): Promise<UpdateContactResult> {
	const {
		pathOrName,
		email,
		phone,
		company,
		role,
		notes,
		folder = DEFAULT_CONTACTS_FOLDER,
	} = params;

	try {
		const resolvedPath = pathOrName.endsWith(".md")
			? normalizeVaultPath(pathOrName)
			: normalizeVaultPath(contactPath(pathOrName, folder));

		const file = app.vault.getAbstractFileByPath(resolvedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Contact not found: ${pathOrName}` };
		}

		let content = await app.vault.read(file);

		// Patch each supplied field into the frontmatter
		const patches: Record<string, string | undefined> = { email, phone, company, role };
		for (const [key, value] of Object.entries(patches)) {
			if (value !== undefined) {
				content = patchFrontmatterField(content, key, value);
			}
		}

		// Replace body if notes is provided.
		// Start the search at offset 4 ("---\n".length) to skip the opening
		// delimiter and only match the *closing* "\n---\n" of the frontmatter block.
		if (notes !== undefined) {
			const fmEnd = content.indexOf("\n---\n", "---\n".length);
			if (fmEnd !== -1) {
				const fmSection = content.slice(0, fmEnd + 5); // include closing ---\n
				content = `${fmSection}${notes}\n`;
			}
		}

		await app.vault.modify(file, content);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to update contact: ${error}` };
	}
}
