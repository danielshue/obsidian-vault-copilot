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

import { EditorManager } from "./editor/EditorManager.js";
import { GeneralSettingTab } from "./settings/GeneralSettingTab.js";
import { EditorSettingTab } from "./settings/EditorSettingTab.js";
import { FilesAndLinksSettingTab } from "./settings/FilesAndLinksSettingTab.js";
import { AppearanceSettingTab } from "./settings/AppearanceSettingTab.js";

// Import plugin styles via JS so Vite processes @import chains correctly
import "../../../src/styles/styles.css";

// ---- Step 1: DOM extensions ----
initDomExtensions();

// ---- Step 2: Global moment (Obsidian provides this) ----
(window as any).moment = moment;

// ---- Main bootstrap ----
const DIR_HANDLE_KEY = "vault-copilot-dir-handle";
const DIR_PATH_KEY = "vault-copilot-dir-path";

/**
 * Try to restore a previously picked directory handle (browser mode).
 * Throws "NEEDS_PICKER" if no valid handle is available.
 */
async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
	// Try restoring a previously picked handle
	try {
		const stored: FileSystemDirectoryHandle | undefined =
			await get(DIR_HANDLE_KEY);
		if (stored) {
			try {
				const permission = await stored.queryPermission({ mode: "readwrite" });
				if (permission === "granted") return stored;
				const requested = await stored.requestPermission({ mode: "readwrite" });
				if (requested === "granted") return stored;
			} catch {
				// Handle may be stale or corrupted — clear it
				await set(DIR_HANDLE_KEY, undefined).catch(() => {});
			}
		}
	} catch {
		// IndexedDB may be unavailable — silently fall through to picker
	}

	// Fall through to user picker
	throw new Error("NEEDS_PICKER");
}

/**
 * Try to restore a previously picked directory path (Electron mode).
 * Returns the path string or null if none stored.
 */
function getStoredDirPath(): string | null {
	return localStorage.getItem(DIR_PATH_KEY);
}

async function bootstrap(dirHandleOrPath: FileSystemDirectoryHandle | string): Promise<void> {
	// Persist for next load
	if (typeof dirHandleOrPath === "string") {
		localStorage.setItem(DIR_PATH_KEY, dirHandleOrPath);
	} else {
		await set(DIR_HANDLE_KEY, dirHandleOrPath).catch(() => {});
	}

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
		const vault = new Vault(dirHandleOrPath);
		await vault.initialize();
		console.log("[web-shell] Vault initialized:", vault.getFiles().length, "files");

		const workspaceEl = document.querySelector(".workspace") as HTMLElement;
		const workspace = new Workspace(workspaceEl);
		const metadataCache = new MetadataCache(vault);
		const fileManager = new FileManager(vault);

		const app = new App(vault, workspace, metadataCache, fileManager);
		// Workspace needs app reference so leaves can access it
		workspace.app = app;

		// Register built-in settings tabs
		app.registerBuiltInTab(new GeneralSettingTab(app));
		app.registerBuiltInTab(new EditorSettingTab(app));
		app.registerBuiltInTab(new FilesAndLinksSettingTab(app));
		app.registerBuiltInTab(new AppearanceSettingTab(app));

		// ---- Step 5: Load the plugin ----
		console.log("[web-shell] Loading plugin...");

		// Pre-configure for web: default to OpenAI provider since
		// GitHub Copilot CLI is not available in the browser.
		const SETTINGS_KEY = "plugin:obsidian-vault-copilot:data";
		const existingData = localStorage.getItem(SETTINGS_KEY);
		if (!existingData) {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiProvider: "openai" }));
		} else {
			try {
				const parsed = JSON.parse(existingData);
				if (parsed.aiProvider === "copilot") {
					parsed.aiProvider = "openai";
					localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
				}
			} catch { /* ignore parse errors */ }
		}

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

		// Populate center pane with tabbed editor (must be created before file explorer wiring)
		let editorManager: EditorManager | null = null;
		if (rootSplit) {
			editorManager = new EditorManager(rootSplit, vault);
		}

		// Populate left pane with file explorer
		const leftSplit = document.querySelector(".mod-left-split") as HTMLElement;
		const leftContent = document.querySelector(".ws-left-content") as HTMLElement || leftSplit;
		if (leftContent) {
			renderFileExplorer(leftContent, vault, app, editorManager);
		}

		// Open chat in the right pane
		const leaf = workspace.getRightLeaf(false);
		await leaf.setViewState({ type: "copilot-chat-view", active: true });
		workspace.revealLeaf(leaf);
		workspace.layoutReady();

		// Wire up resizable panes
		initResizers();

		// Wire up ribbon buttons
		initRibbon(leftContent, vault, app, plugin, workspace, editorManager);

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

/**
 * Sync the Electron titlebar overlay colors with the current CSS theme.
 * Reads computed CSS variables and updates the native window controls overlay.
 */
function syncTitleBarOverlay() {
	if (!window.electronAPI?.setTitleBarOverlay) return;
	const style = getComputedStyle(document.documentElement);
	const bg = style.getPropertyValue("--background-secondary").trim() || "#f6f6f6";
	const fg = style.getPropertyValue("--text-normal").trim() || "#2e3338";
	window.electronAPI.setTitleBarOverlay({ color: bg, symbolColor: fg }).catch(() => {});
}

// ---- Wire up the folder picker button ----
document.addEventListener("DOMContentLoaded", async () => {
	// Electron mode: try restoring from localStorage, use native dialog for picking
	if (window.electronAPI) {
		// Apply frameless window class if using hidden frame style
		try {
			const frameStyle = await window.electronAPI.getWindowFrame();
			if (frameStyle !== "native") {
				document.body.classList.add("is-frameless");
				// Sync titlebar overlay with current theme
				syncTitleBarOverlay();
				// Watch for theme changes (class changes on <body>) and re-sync
				new MutationObserver(() => syncTitleBarOverlay()).observe(
					document.body,
					{ attributes: true, attributeFilter: ["class"] },
				);
			}
		} catch { /* ignore */ }

		const storedPath = getStoredDirPath();
		if (storedPath) {
			try {
				const exists = await window.electronAPI.exists(storedPath);
				if (exists) {
					await bootstrap(storedPath);
					return;
				}
			} catch {
				// Path no longer valid — show picker
			}
		}
		// Show the folder picker UI
		const pickBtn = document.getElementById("pick-folder-btn");
		const errorEl = document.getElementById("picker-error");

		pickBtn?.addEventListener("click", async () => {
			try {
				const dirPath = await window.electronAPI!.openDirectory();
				if (!dirPath) return; // user cancelled
				await bootstrap(dirPath);
			} catch (err: any) {
				if (errorEl) {
					errorEl.textContent = err?.message || "Failed to open folder.";
					errorEl.style.display = "";
				}
			}
		});
		return;
	}

	// Browser mode: try restoring from IndexedDB, use showDirectoryPicker
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

// ---- File Explorer ----

interface TreeNode {
	name: string;
	path: string;
	isFolder: boolean;
	children: TreeNode[];
}

function buildFileTree(files: { path: string }[]): TreeNode[] {
	const root: TreeNode[] = [];
	const folderMap = new Map<string, TreeNode>();

	const getOrCreateFolder = (folderPath: string): TreeNode => {
		if (folderMap.has(folderPath)) return folderMap.get(folderPath)!;
		const parts = folderPath.split("/");
		const name = parts[parts.length - 1];
		const node: TreeNode = { name, path: folderPath, isFolder: true, children: [] };
		folderMap.set(folderPath, node);

		if (parts.length > 1) {
			const parentPath = parts.slice(0, -1).join("/");
			const parent = getOrCreateFolder(parentPath);
			parent.children.push(node);
		} else {
			root.push(node);
		}
		return node;
	};

	for (const file of files) {
		// Skip dotfiles/dotfolders (e.g. .obsidian, .git)
		const parts = file.path.split("/");
		if (parts.some(p => p.startsWith("."))) continue;
		const name = parts[parts.length - 1];
		const fileNode: TreeNode = { name, path: file.path, isFolder: false, children: [] };

		if (parts.length > 1) {
			const folderPath = parts.slice(0, -1).join("/");
			const folder = getOrCreateFolder(folderPath);
			folder.children.push(fileNode);
		} else {
			root.push(fileNode);
		}
	}

	// Sort: folders first, then alphabetical
	const sortNodes = (nodes: TreeNode[]) => {
		nodes.sort((a, b) => {
			if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const n of nodes) if (n.isFolder) sortNodes(n.children);
	};
	sortNodes(root);
	return root;
}

function renderFileExplorer(container: HTMLElement, vault: any, app: any, editorManager: EditorManager | null): void {
	container.innerHTML = "";
	const explorer = document.createElement("div");
	explorer.className = "ws-file-explorer";

	const list = document.createElement("div");
	list.className = "ws-file-list";
	explorer.appendChild(list);

	const files = vault.getFiles();
	const tree = buildFileTree(files);
	renderTreeNodes(list, tree, editorManager);

	// Vault name footer with gear icon
	const footer = document.createElement("div");
	footer.className = "ws-file-explorer-footer";
	const vaultName = vault._dirHandle?.name || "vault";

	const vaultLabel = document.createElement("span");
	vaultLabel.className = "ws-footer-vault-name";
	vaultLabel.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M12 2v6"/><path d="M2 10h20"/></svg> ${vaultName}`;
	footer.appendChild(vaultLabel);

	const gearBtn = document.createElement("button");
	gearBtn.className = "ws-footer-gear clickable-icon";
	gearBtn.setAttribute("aria-label", "Settings");
	gearBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
	gearBtn.addEventListener("click", () => {
		app?.setting?.open?.();
	});
	footer.appendChild(gearBtn);

	explorer.appendChild(footer);

	container.appendChild(explorer);
}

function renderTreeNodes(container: HTMLElement, nodes: TreeNode[], editorManager: EditorManager | null): void {
	for (const node of nodes) {
		const item = document.createElement("div");
		item.className = "ws-file-item" + (node.isFolder ? " ws-folder-item" : "");

		if (node.isFolder) {
			const chevron = document.createElement("span");
			chevron.className = "ws-tree-chevron";
			chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
			item.appendChild(chevron);
			item.appendChild(document.createTextNode(node.name));
			container.appendChild(item);

			const childContainer = document.createElement("div");
			childContainer.className = "ws-file-children";
			childContainer.style.display = "none";
			container.appendChild(childContainer);

			item.addEventListener("click", () => {
				const isOpen = childContainer.style.display !== "none";
				childContainer.style.display = isOpen ? "none" : "";
				chevron.classList.toggle("is-open", !isOpen);
			});

			// Folder right-click context menu
			item.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				showFolderContextMenu(e, node, editorManager);
			});

			renderTreeNodes(childContainer, node.children, editorManager);
		} else {
			// Add indent spacer to align with folder text
			const spacer = document.createElement("span");
			spacer.className = "ws-tree-spacer";
			item.appendChild(spacer);
			// Hide .md extension
			const displayName = node.name.replace(/\.md$/, "");
			item.appendChild(document.createTextNode(displayName));
			item.addEventListener("click", () => {
				if (editorManager) {
					editorManager.openFile(node.path);
				}
			});

			// File right-click context menu
			item.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				showFileContextMenu(e, node, editorManager);
			});

			container.appendChild(item);
		}
	}
}

// ---- Center Pane Placeholder ----

/** Dismiss any active context menu */
let activeContextMenu: HTMLElement | null = null;
let activeContextMenuCleanup: (() => void) | null = null;

function dismissContextMenu(): void {
	if (activeContextMenu) {
		activeContextMenu.remove();
		activeContextMenu = null;
	}
	if (activeContextMenuCleanup) {
		activeContextMenuCleanup();
		activeContextMenuCleanup = null;
	}
}

/** SVG icons used in context menus */
const ctxIcons = {
	newNote: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
	newFolder: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>`,
	canvas: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
	base: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>`,
	openTab: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
	openRight: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
	openWindow: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>`,
	copy: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
	move: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/></svg>`,
	bookmark: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`,
	merge: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`,
	copyPath: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
	openApp: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
	showExplorer: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
	rename: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
	deleteIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
	template: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
	search: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
	chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
};

interface ContextMenuItem {
	label: string;
	icon: string;
	action?: () => void;
	hasSubmenu?: boolean;
	danger?: boolean;
	disabled?: boolean;
}

function createContextMenu(x: number, y: number, sections: ContextMenuItem[][]): void {
	dismissContextMenu();

	const menu = document.createElement("div");
	menu.className = "menu ws-context-menu";
	menu.style.position = "fixed";
	menu.style.zIndex = "10001";
	document.body.appendChild(menu);

	for (let si = 0; si < sections.length; si++) {
		if (si > 0) {
			const sep = document.createElement("div");
			sep.className = "menu-separator";
			menu.appendChild(sep);
		}
		for (const item of sections[si]) {
			const el = document.createElement("div");
			el.className = "menu-item" + (item.disabled ? " is-disabled" : "");
			el.innerHTML = `<span class="menu-item-icon">${item.icon}</span><span class="menu-item-title">${item.label}</span>${item.hasSubmenu ? `<span class="menu-item-submenu">${ctxIcons.chevronRight}</span>` : ""}`;
			if (item.danger) {
				el.querySelector(".menu-item-icon")!.setAttribute("style", "color: var(--text-error)");
				el.querySelector(".menu-item-title")!.setAttribute("style", "color: var(--text-error)");
			}
			if (item.action && !item.disabled) {
				el.addEventListener("click", () => {
					dismissContextMenu();
					item.action!();
				});
			}
			menu.appendChild(el);
		}
	}

	// Position: keep menu within viewport
	const menuRect = menu.getBoundingClientRect();
	const maxX = window.innerWidth - menuRect.width - 4;
	const maxY = window.innerHeight - menuRect.height - 4;
	menu.style.left = `${Math.min(x, maxX)}px`;
	menu.style.top = `${Math.min(y, maxY)}px`;

	// Click outside to dismiss
	const dismiss = (ev: MouseEvent) => {
		if (!menu.contains(ev.target as Node)) {
			dismissContextMenu();
		}
	};
	setTimeout(() => document.addEventListener("click", dismiss), 0);
	activeContextMenu = menu;
	activeContextMenuCleanup = () => document.removeEventListener("click", dismiss);
}

function showFileContextMenu(e: MouseEvent, node: TreeNode, editorManager: EditorManager | null): void {
	const sections: ContextMenuItem[][] = [
		[
			{ label: "Open in new tab", icon: ctxIcons.openTab, action: () => editorManager?.openFile(node.path) },
			{ label: "Open to the right", icon: ctxIcons.openRight, action: () => editorManager?.openFile(node.path) },
			{ label: "Open in new window", icon: ctxIcons.openWindow, disabled: true },
		],
		[
			{ label: "Make a copy", icon: ctxIcons.copy, disabled: true },
			{ label: "Move file to...", icon: ctxIcons.move, disabled: true },
			{ label: "Bookmark...", icon: ctxIcons.bookmark, disabled: true },
			{ label: "Merge entire file with...", icon: ctxIcons.merge, disabled: true },
		],
		[
			{ label: "Copy path", icon: ctxIcons.copyPath, hasSubmenu: true, action: () => navigator.clipboard.writeText(node.path) },
		],
		[
			{ label: "Open in default app", icon: ctxIcons.openApp, disabled: true },
			{ label: "Show in system explorer", icon: ctxIcons.showExplorer, disabled: true },
		],
		[
			{ label: "Rename...", icon: ctxIcons.rename, disabled: true },
			{ label: "Delete", icon: ctxIcons.deleteIcon, danger: true, disabled: true },
		],
	];
	createContextMenu(e.clientX, e.clientY, sections);
}

function showFolderContextMenu(e: MouseEvent, node: TreeNode, editorManager: EditorManager | null): void {
	const sections: ContextMenuItem[][] = [
		[
			{ label: "New note", icon: ctxIcons.newNote, disabled: true },
			{ label: "New folder", icon: ctxIcons.newFolder, disabled: true },
			{ label: "New canvas", icon: ctxIcons.canvas, disabled: true },
			{ label: "New base", icon: ctxIcons.base, disabled: true },
		],
		[
			{ label: "Make a copy", icon: ctxIcons.copy, disabled: true },
			{ label: "Move folder to...", icon: ctxIcons.move, disabled: true },
			{ label: "Bookmark...", icon: ctxIcons.bookmark, disabled: true },
		],
		[
			{ label: "Copy path", icon: ctxIcons.copyPath, hasSubmenu: true, action: () => navigator.clipboard.writeText(node.path) },
		],
		[
			{ label: "Show in system explorer", icon: ctxIcons.showExplorer, disabled: true },
		],
		[
			{ label: "Create new note from template", icon: ctxIcons.template, disabled: true },
		],
		[
			{ label: "Rename...", icon: ctxIcons.rename, disabled: true },
			{ label: "Delete", icon: ctxIcons.deleteIcon, danger: true, disabled: true },
		],
		[
			{ label: "Search in folder", icon: ctxIcons.search, disabled: true },
		],
	];
	createContextMenu(e.clientX, e.clientY, sections);
}

// ---- Center Pane Placeholder ----

function renderCenterPlaceholder(container: HTMLElement): void {
	container.innerHTML = "";
	const placeholder = document.createElement("div");
	placeholder.className = "ws-center-placeholder";
	placeholder.innerHTML = `
		<a class="ws-empty-action" data-action="new-note">Create new note (Ctrl + N)</a>
		<a class="ws-empty-action" data-action="go-to-file">Go to file (Ctrl + O)</a>
		<a class="ws-empty-action" data-action="close">Close</a>
	`;
	container.appendChild(placeholder);
}

// ---- Resizable Panes ----

function initResizers(): void {
	const resizers = document.querySelectorAll<HTMLElement>(".workspace-resizer");
	for (const resizer of resizers) {
		const target = resizer.dataset.resize;
		const pane = target === "left"
			? document.querySelector<HTMLElement>(".mod-left-split")
			: document.querySelector<HTMLElement>(".mod-right-split");
		if (!pane) continue;

		let startX = 0;
		let startWidth = 0;

		const onMouseMove = (e: MouseEvent) => {
			const delta = e.clientX - startX;
			const newWidth = target === "left"
				? startWidth + delta
				: startWidth - delta;
			const clamped = Math.max(180, Math.min(newWidth, window.innerWidth * 0.5));
			pane.style.width = clamped + "px";
		};

		const onMouseUp = () => {
			resizer.classList.remove("is-dragging");
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		resizer.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			startX = e.clientX;
			startWidth = pane.getBoundingClientRect().width;
			resizer.classList.add("is-dragging");
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}
}

/**
 * Wire up the left ribbon icon strip: collapse toggle, file explorer, extensions.
 */
function initRibbon(leftSplit: HTMLElement, vault: any, app: any, plugin: any, workspace: any, editorManager: EditorManager | null): void {
	const toggleBtn = document.querySelector(".ws-ribbon-toggle") as HTMLElement;
	const filesBtn = document.querySelector(".ws-ribbon-files") as HTMLElement;
	const extBtn = document.querySelector(".ws-ribbon-extensions") as HTMLElement;
	const resizer = document.querySelector('.workspace-resizer[data-resize="left"]') as HTMLElement;

	if (!toggleBtn || !filesBtn || !extBtn) return;

	// Set icons
	// Sidebar toggle (left/right panel icon)
	toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
	// Folder icon
	filesBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`;
	// Extensions / puzzle piece icon
	extBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.39 4.39a1 1 0 0 0-1.68-.474l-.07.084-2.12 2.12a4.007 4.007 0 0 0-5.4.24l-.18.18a4 4 0 0 0 .24 5.4l2.12 2.12.084.07a1 1 0 0 0 .474-1.68l-.084-.07-2.12-2.12"/><path d="M13.5 2.5a2.5 2.5 0 0 1 0 5"/><path d="M6 12a6 6 0 0 0 12 0"/><path d="M12 2a10 10 0 1 0 10 10"/></svg>`;

	let leftCollapsed = false;
	let activeView: "files" | "extensions" = "files";
	let savedWidth = leftSplit.style.width || "250px";

	// Toggle collapse
	toggleBtn.addEventListener("click", () => {
		leftCollapsed = !leftCollapsed;
		if (leftCollapsed) {
			savedWidth = leftSplit.style.width || leftSplit.getBoundingClientRect().width + "px";
			leftSplit.style.display = "none";
			if (resizer) resizer.style.display = "none";
		} else {
			leftSplit.style.display = "";
			leftSplit.style.width = savedWidth;
			if (resizer) resizer.style.display = "";
		}
	});

	const setActiveRibbonButton = (active: "files" | "extensions") => {
		filesBtn.classList.toggle("is-active", active === "files");
		extBtn.classList.toggle("is-active", active === "extensions");
	};

	// Files view
	filesBtn.addEventListener("click", () => {
		if (activeView === "files" && !leftCollapsed) return;
		activeView = "files";
		setActiveRibbonButton("files");
		if (leftCollapsed) {
			leftCollapsed = false;
			leftSplit.style.display = "";
			leftSplit.style.width = savedWidth;
			if (resizer) resizer.style.display = "";
		}
		// Clear any leaf content (extension browser) and show file explorer
		leftSplit.innerHTML = "";
		renderFileExplorer(leftSplit, vault, app, editorManager);
	});

	// Extensions view
	extBtn.addEventListener("click", async () => {
		if (activeView === "extensions" && !leftCollapsed) return;
		activeView = "extensions";
		setActiveRibbonButton("extensions");
		if (leftCollapsed) {
			leftCollapsed = false;
			leftSplit.style.display = "";
			leftSplit.style.width = savedWidth;
			if (resizer) resizer.style.display = "";
		}
		// Clear file explorer and open extension browser in the left pane
		leftSplit.innerHTML = "";
		await plugin.activateExtensionBrowser();
	});
}
