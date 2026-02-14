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
import type { PluginSettingTab } from "../ui/PluginSettingTab.js";

export class App {
	vault: Vault;
	workspace: Workspace;
	metadataCache: MetadataCache;
	fileManager: FileManager;

	/** Registered setting tabs from plugins. */
	_settingTabs: PluginSettingTab[] = [];

	/**
	 * Settings dialog manager.
	 * Opens registered PluginSettingTab instances in a modal overlay.
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

		// Settings dialog — renders registered tabs in a modal
		this.setting = {
			open: () => this._openSettingsModal(),
			openTabById: (id: string) => this._openSettingsModal(),
		};
	}

	/** Open a modal overlay showing the first registered settings tab. */
	private _openSettingsModal(): void {
		const tab = this._settingTabs[0];
		if (!tab) {
			console.warn("[obsidian-shim] No setting tabs registered");
			return;
		}

		// Remove any existing settings modal
		document.querySelector(".ws-settings-overlay")?.remove();

		// Build overlay
		const overlay = document.createElement("div");
		overlay.className = "ws-settings-overlay";

		const backdrop = document.createElement("div");
		backdrop.className = "ws-settings-backdrop";
		backdrop.addEventListener("click", () => {
			tab.hide();
			overlay.remove();
		});
		overlay.appendChild(backdrop);

		const modal = document.createElement("div");
		modal.className = "ws-settings-modal";

		// Header
		const header = document.createElement("div");
		header.className = "ws-settings-header";
		const title = document.createElement("span");
		title.textContent = "Settings";
		header.appendChild(title);
		const closeBtn = document.createElement("button");
		closeBtn.className = "ws-settings-close clickable-icon";
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		closeBtn.addEventListener("click", () => {
			tab.hide();
			overlay.remove();
		});
		header.appendChild(closeBtn);
		modal.appendChild(header);

		// Content — render the tab's containerEl
		tab.containerEl.empty();
		tab.display();
		modal.appendChild(tab.containerEl);

		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		// ESC to close
		const escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				tab.hide();
				overlay.remove();
				document.removeEventListener("keydown", escHandler);
			}
		};
		document.addEventListener("keydown", escHandler);
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
