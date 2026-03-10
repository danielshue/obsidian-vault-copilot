/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/copilot/ContactOperations
 * @description Unit tests for vault-native contact management operations.
 *
 * Validates the four contact tools:
 * - `listContacts`   — enumerate contact notes in a folder
 * - `getContact`     — read a contact note by name or path
 * - `createContact`  — create a structured contact note
 * - `updateContact`  — patch fields in an existing contact note
 *
 * Also validates the `parseFrontmatter` helper.
 *
 * @see {@link ContactOperations}
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	listContacts,
	getContact,
	createContact,
	updateContact,
	parseFrontmatter,
	DEFAULT_CONTACTS_FOLDER,
} from "../../src/copilot/tools/ContactOperations";
import { App } from "obsidian";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Cast to the mocked Vault type that exposes _setFile / _getFile helpers. */
type MockVault = import("../../src/__mocks__/obsidian").Vault;

// ── parseFrontmatter ────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
	it("parses quoted values correctly", () => {
		const content = `---\nname: "Jane Doe"\nemail: "jane@example.com"\n---\nBody`;
		const fm = parseFrontmatter(content);
		expect(fm["name"]).toBe("Jane Doe");
		expect(fm["email"]).toBe("jane@example.com");
	});

	it("parses unquoted values", () => {
		const content = `---\nname: Jane\nphone: 555-1234\n---`;
		const fm = parseFrontmatter(content);
		expect(fm["name"]).toBe("Jane");
		expect(fm["phone"]).toBe("555-1234");
	});

	it("returns empty object when there is no frontmatter", () => {
		const fm = parseFrontmatter("No frontmatter here");
		expect(fm).toEqual({});
	});

	it("handles escaped double-quotes inside values", () => {
		const content = `---\nname: "O\\"Brien"\n---`;
		const fm = parseFrontmatter(content);
		expect(fm["name"]).toBe('O"Brien');
	});
});

// ── listContacts ────────────────────────────────────────────────────────────

describe("listContacts", () => {
	let app: App;
	let vault: MockVault;

	beforeEach(() => {
		app = new App();
		vault = app.vault as unknown as MockVault;
	});

	it("returns empty list when no files are in the contacts folder", async () => {
		const result = await listContacts(app);

		expect(result.success).toBe(true);
		expect(result.contacts).toHaveLength(0);
		expect(result.total).toBe(0);
	});

	it("returns empty list when only files outside the contacts folder exist", async () => {
		vault._setFile("Notes/other.md", "---\nname: Unrelated\n---\n");

		const result = await listContacts(app);

		expect(result.success).toBe(true);
		expect(result.contacts).toHaveLength(0);
	});

	it("extracts name, email, company, phone from frontmatter", async () => {
		const content = `---\nname: "Jane Doe"\nemail: "jane@example.com"\ncompany: "Acme"\nphone: "555-0100"\n---\nNotes`;
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`, content);

		const result = await listContacts(app);

		expect(result.success).toBe(true);
		expect(result.contacts).toHaveLength(1);
		expect(result.contacts[0].name).toBe("Jane Doe");
		expect(result.contacts[0].email).toBe("jane@example.com");
		expect(result.contacts[0].company).toBe("Acme");
		expect(result.contacts[0].phone).toBe("555-0100");
	});

	it("respects the limit parameter", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Alice.md`, `---\nname: "Alice"\n---\n`);
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Bob.md`, `---\nname: "Bob"\n---\n`);
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Carol.md`, `---\nname: "Carol"\n---\n`);

		const result = await listContacts(app, DEFAULT_CONTACTS_FOLDER, 2);

		expect(result.contacts).toHaveLength(2);
	});

	it("uses a custom folder", async () => {
		vault._setFile("People/Alice.md", `---\nname: "Alice"\n---\n`);
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Bob.md`, `---\nname: "Bob"\n---\n`);

		const result = await listContacts(app, "People");

		expect(result.contacts).toHaveLength(1);
		expect(result.contacts[0].name).toBe("Alice");
	});
});

// ── getContact ──────────────────────────────────────────────────────────────

describe("getContact", () => {
	let app: App;
	let vault: MockVault;
	const contactContent = `---\nname: "Jane Doe"\nemail: "jane@example.com"\nphone: "555-0100"\ncompany: "Acme Corp"\nrole: "Engineer"\n---\nSome notes here`;

	beforeEach(() => {
		app = new App();
		vault = app.vault as unknown as MockVault;
	});

	it("resolves by display name when pathOrName has no .md extension", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`, contactContent);

		const result = await getContact(app, "Jane Doe");

		expect(result.success).toBe(true);
		expect(result.name).toBe("Jane Doe");
		expect(result.email).toBe("jane@example.com");
		expect(result.company).toBe("Acme Corp");
		expect(result.role).toBe("Engineer");
		expect(result.notes).toBe("Some notes here");
	});

	it("resolves by full path when pathOrName ends with .md", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`, contactContent);

		const result = await getContact(app, `${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`);

		expect(result.success).toBe(true);
		expect(result.name).toBe("Jane Doe");
	});

	it("returns failure when contact note does not exist", async () => {
		const result = await getContact(app, "Nonexistent Contact");

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/not found/i);
	});

	it("uses a custom folder for name resolution", async () => {
		vault._setFile("People/Bob.md", `---\nname: "Bob"\nemail: "bob@example.com"\n---\n`);

		const result = await getContact(app, "Bob", "People");

		expect(result.success).toBe(true);
		expect(result.email).toBe("bob@example.com");
	});

	it("returns notes as undefined when only frontmatter is present", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/NoBody.md`, `---\nname: "NoBody"\n---\n`);

		const result = await getContact(app, "NoBody");

		expect(result.success).toBe(true);
		expect(result.notes).toBeUndefined();
	});
});

// ── createContact ───────────────────────────────────────────────────────────

describe("createContact", () => {
	let app: App;
	let vault: MockVault;

	beforeEach(() => {
		app = new App();
		vault = app.vault as unknown as MockVault;
	});

	it("creates a note with frontmatter at the expected path", async () => {
		const result = await createContact(app, {
			name: "John Smith",
			email: "john@example.com",
			company: "WidgetCo",
		});

		expect(result.success).toBe(true);
		expect(result.path).toBe(`${DEFAULT_CONTACTS_FOLDER}/John Smith.md`);

		const stored = vault._getFile(`${DEFAULT_CONTACTS_FOLDER}/John Smith.md`);
		expect(stored).toBeDefined();
		expect(stored).toContain('name: "John Smith"');
		expect(stored).toContain('email: "john@example.com"');
		expect(stored).toContain('company: "WidgetCo"');
		expect(stored).toContain("tags:\n  - contact");
	});

	it("returns failure when name is empty", async () => {
		const result = await createContact(app, { name: "" });
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/name is required/i);
	});

	it("returns failure when contact already exists", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`, "---\nname: Jane Doe\n---\n");

		const result = await createContact(app, { name: "Jane Doe" });

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/already exists/i);
	});

	it("uses a custom folder when specified", async () => {
		const result = await createContact(app, { name: "Bob", folder: "People" });

		expect(result.success).toBe(true);
		expect(result.path).toBe("People/Bob.md");
	});

	it("includes freeform notes in the body", async () => {
		await createContact(app, { name: "Alice", notes: "Met at conference 2026" });

		const stored = vault._getFile(`${DEFAULT_CONTACTS_FOLDER}/Alice.md`);
		expect(stored).toContain("Met at conference 2026");
	});

	it("omits optional fields that are not provided", async () => {
		await createContact(app, { name: "Minimal" });

		const stored = vault._getFile(`${DEFAULT_CONTACTS_FOLDER}/Minimal.md`);
		expect(stored).not.toContain("email:");
		expect(stored).not.toContain("phone:");
		expect(stored).not.toContain("company:");
		expect(stored).not.toContain("role:");
	});

	it("includes a created date in frontmatter", async () => {
		await createContact(app, { name: "Dated" });

		const stored = vault._getFile(`${DEFAULT_CONTACTS_FOLDER}/Dated.md`);
		expect(stored).toMatch(/created: "\d{4}-\d{2}-\d{2}"/);
	});
});

// ── updateContact ───────────────────────────────────────────────────────────

describe("updateContact", () => {
	let app: App;
	let vault: MockVault;
	const originalContent = `---\nname: "Jane Doe"\nemail: "jane@example.com"\ncompany: "OldCorp"\n---\nOriginal notes`;

	beforeEach(() => {
		app = new App();
		vault = app.vault as unknown as MockVault;
	});

	it("patches a single field without touching others", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`, originalContent);

		const result = await updateContact(app, {
			pathOrName: `${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`,
			company: "NewCorp",
		});

		expect(result.success).toBe(true);
		const stored = vault._getFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`);
		expect(stored).toContain('"NewCorp"');
		expect(stored).toContain('"jane@example.com"');
	});

	it("resolves contact by display name when no .md extension", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`, originalContent);

		const result = await updateContact(app, {
			pathOrName: "Jane Doe",
			email: "jane.new@example.com",
		});

		expect(result.success).toBe(true);
		const stored = vault._getFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`);
		expect(stored).toContain('"jane.new@example.com"');
	});

	it("replaces the body when notes is provided", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`, originalContent);

		await updateContact(app, {
			pathOrName: "Jane Doe",
			notes: "Updated notes content",
		});

		const stored = vault._getFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`);
		expect(stored).toContain("Updated notes content");
		expect(stored).not.toContain("Original notes");
	});

	it("returns failure when contact does not exist", async () => {
		const result = await updateContact(app, {
			pathOrName: "Ghost Contact",
			email: "ghost@example.com",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/not found/i);
	});

	it("patches multiple fields in one call", async () => {
		vault._setFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`, originalContent);

		await updateContact(app, {
			pathOrName: "Jane Doe",
			phone: "555-9999",
			role: "Director",
		});

		const stored = vault._getFile(`${DEFAULT_CONTACTS_FOLDER}/Jane Doe.md`);
		expect(stored).toContain('"555-9999"');
		expect(stored).toContain('"Director"');
	});
});

