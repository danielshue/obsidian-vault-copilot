/**
 * App — top-level container wiring together all subsystems.
 *
 * Replicates Obsidian's App object which is passed to Plugin, ItemView,
 * Modal, and many other classes.
 */

import type { Vault } from "../vault/Vault.js";
import type { Workspace } from "../workspace/Workspace.js";
import type { MetadataCache } from "../metadata/MetadataCache.js";
import type { FileManager } from "../metadata/FileManager.js";

export class App {
	vault: Vault;
	workspace: Workspace;
	metadataCache: MetadataCache;
	fileManager: FileManager;

	/**
	 * Stub for Obsidian's app.setting (settings dialog manager).
	 * Plugin code accesses this to open settings dialogs.
	 */
	setting: {
		open(): void;
		openTabById(id: string): void;
	};

	constructor(
		vault: Vault,
		workspace: Workspace,
		metadataCache?: MetadataCache,
		fileManager?: FileManager,
	) {
		this.vault = vault;
		this.workspace = workspace;
		// These are set lazily if not provided, since they depend on vault
		this.metadataCache = metadataCache as MetadataCache;
		this.fileManager = fileManager as FileManager;
		// Settings dialog stub
		this.setting = {
			open: () => console.log("[obsidian-shim] app.setting.open() — not implemented"),
			openTabById: (id: string) => console.log(`[obsidian-shim] app.setting.openTabById("${id}") — not implemented`),
		};
	}

	/**
	 * Load a secret value. In Obsidian this uses internal encrypted storage.
	 * In the web shim we fall back to localStorage with a prefix.
	 */
	async loadSecret(key: string): Promise<string | undefined> {
		const val = localStorage.getItem(`vc-secret:${key}`);
		return val ?? undefined;
	}

	/**
	 * Save a secret value. In Obsidian this uses internal encrypted storage.
	 * In the web shim we fall back to localStorage with a prefix.
	 */
	async saveSecret(key: string, value: string): Promise<void> {
		localStorage.setItem(`vc-secret:${key}`, value);
	}
}
