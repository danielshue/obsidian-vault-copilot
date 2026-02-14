/**
 * Web shell bootstrap — initializes the shim environment and loads the plugin.
 *
 * Flow:
 * 1. Install DOM prototype extensions
 * 2. Attach moment to window
 * 3. Prompt user to pick a vault folder (or restore from IndexedDB)
 * 4. Create shim App (Vault, Workspace, MetadataCache, FileManager)
 * 5. Instantiate and load the CopilotPlugin
 * 6. Activate the default chat view
 */

import { initDomExtensions } from "@vault-copilot/obsidian-shim/src/dom/dom-extensions.js";
import { App } from "@vault-copilot/obsidian-shim/src/core/App.js";
import { Vault } from "@vault-copilot/obsidian-shim/src/vault/Vault.js";
import { Workspace } from "@vault-copilot/obsidian-shim/src/workspace/Workspace.js";
import { MetadataCache } from "@vault-copilot/obsidian-shim/src/metadata/MetadataCache.js";
import { FileManager } from "@vault-copilot/obsidian-shim/src/metadata/FileManager.js";
import moment from "moment";
import { get, set } from "idb-keyval";

// ---- Step 1: DOM extensions ----
initDomExtensions();

// ---- Step 2: Global moment (Obsidian provides this) ----
(window as any).moment = moment;

// ---- Main bootstrap ----
const DIR_HANDLE_KEY = "vault-copilot-dir-handle";

async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
	// Try restoring a previously picked handle
	const stored: FileSystemDirectoryHandle | undefined =
		await get(DIR_HANDLE_KEY);
	if (stored) {
		const permission = await stored.queryPermission({ mode: "readwrite" });
		if (permission === "granted") return stored;
		// Try requesting permission
		const requested = await stored.requestPermission({ mode: "readwrite" });
		if (requested === "granted") return stored;
	}

	// Fall through to user picker
	throw new Error("NEEDS_PICKER");
}

async function bootstrap(dirHandle: FileSystemDirectoryHandle): Promise<void> {
	// Persist handle for next load
	await set(DIR_HANDLE_KEY, dirHandle);

	// Hide the vault picker UI
	const picker = document.getElementById("vault-picker");
	if (picker) picker.style.display = "none";

	// Show a loading indicator
	const rootSplit = document.querySelector(".mod-root") as HTMLElement;
	if (rootSplit) {
		rootSplit.innerHTML = '<div style="padding: 2em; color: var(--text-muted);">Loading vault...</div>';
	}

	try {
		// ---- Step 4: Create shim instances ----
		console.log("[web-shell] Initializing vault...");
		const vault = new Vault(dirHandle);
		await vault.initialize();
		console.log("[web-shell] Vault initialized:", vault.getFiles().length, "files");

		const workspaceEl = document.querySelector(".workspace") as HTMLElement;
		const workspace = new Workspace(workspaceEl);
		const metadataCache = new MetadataCache(vault);
		const fileManager = new FileManager(vault);

		const app = new App(vault, workspace, metadataCache, fileManager);
		// Workspace needs app reference so leaves can access it
		workspace.app = app;

		// ---- Step 5: Load the plugin ----
		console.log("[web-shell] Loading plugin...");
		const { default: CopilotPlugin } = await import(
			"../../../src/main.js"
		);

		const manifest = {
			id: "obsidian-vault-copilot",
			name: "Vault Copilot",
			version: "0.0.26",
			description: "AI assistant for your vault",
			isDesktopOnly: false,
		};

		const plugin = new CopilotPlugin(app, manifest);
		await plugin.onload();
		console.log("[web-shell] Plugin loaded successfully");

		// ---- Step 6: Activate default view ----
		// Clear loading indicator
		if (rootSplit) rootSplit.innerHTML = "";

		const leaf = workspace.getRightLeaf(false);
		await leaf.setViewState({ type: "copilot-chat-view", active: true });
		workspace.revealLeaf(leaf);
		workspace.layoutReady();
		console.log("[web-shell] Chat view activated");
	} catch (err: any) {
		console.error("[web-shell] Bootstrap failed:", err);
		if (rootSplit) {
			rootSplit.innerHTML = `<div style="padding: 2em; color: var(--text-error, #e93147);">
				<h3>Bootstrap Error</h3>
				<pre style="white-space: pre-wrap; font-size: 0.85em;">${err?.stack || err?.message || err}</pre>
			</div>`;
		}
	}
}

// ---- Wire up the folder picker button ----
document.addEventListener("DOMContentLoaded", async () => {
	try {
		const handle = await getDirectoryHandle();
		await bootstrap(handle);
	} catch (e: any) {
		if (e?.message !== "NEEDS_PICKER") {
			console.error("Failed to restore vault:", e);
		}
		// Show the folder picker UI
		const pickBtn = document.getElementById("pick-folder-btn");
		const errorEl = document.getElementById("picker-error");

		pickBtn?.addEventListener("click", async () => {
			try {
				const handle = await (window as any).showDirectoryPicker({
					mode: "readwrite",
				});
				await bootstrap(handle);
			} catch (err: any) {
				// Ignore user cancellation of the picker dialog
				if (err?.name === "AbortError") return;
				if (errorEl) {
					errorEl.textContent = err?.message || "Failed to open folder.";
					errorEl.style.display = "";
				}
			}
		});
	}
});
