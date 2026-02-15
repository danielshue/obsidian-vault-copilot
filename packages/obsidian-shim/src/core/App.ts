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
import { setIcon } from "../utils/icons.js";

/**
 * Common shape for any settings tab — built-in or plugin.
 */
export interface SettingTabLike {
	id: string;
	name: string;
	icon?: string;
	containerEl: HTMLElement;
	display(): void;
	hide(): void;
}

export class App {
	vault: Vault;
	workspace: Workspace;
	metadataCache: MetadataCache;
	fileManager: FileManager;

	/** Registered setting tabs from plugins. */
	_settingTabs: PluginSettingTab[] = [];

	/** Built-in setting tabs (General, Editor, etc.). */
	_builtInTabs: SettingTabLike[] = [];

	/** Currently active tab in the settings modal. */
	private _activeSettingTab: SettingTabLike | null = null;

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
			openTabById: (id: string) => this._openSettingsModal(id),
		};
	}

	/** Register a built-in (non-plugin) settings tab. */
	registerBuiltInTab(tab: SettingTabLike): void {
		this._builtInTabs.push(tab);
	}

	/** Open a modal overlay with sidebar navigation and all registered tabs. */
	private _openSettingsModal(tabId?: string): void {
		// Gather all tabs: built-in first, then plugin tabs
		const allTabs: SettingTabLike[] = [
			...this._builtInTabs,
			...this._settingTabs.map((t) => ({
				id: (t as any).id || (t as any).plugin?.manifest?.id || "plugin",
				name: (t as any).name || (t as any).plugin?.manifest?.name || "Plugin",
				icon: (t as any).icon,
				containerEl: t.containerEl,
				display: () => t.display(),
				hide: () => t.hide(),
			})),
		];

		if (allTabs.length === 0) {
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
		header.appendChild(closeBtn);
		modal.appendChild(header);

		// Body: sidebar + content
		const body = document.createElement("div");
		body.className = "ws-settings-body";

		// Sidebar
		const sidebar = document.createElement("div");
		sidebar.className = "ws-settings-sidebar";

		// Content area
		const content = document.createElement("div");
		content.className = "ws-settings-content";

		// Build sidebar nav items
		const navItems: HTMLElement[] = [];

		for (const tab of allTabs) {
			const navItem = document.createElement("div");
			navItem.className = "ws-settings-nav-item";

			const iconEl = document.createElement("span");
			iconEl.className = "ws-settings-nav-icon";
			setIcon(iconEl, tab.icon || "circle");
			navItem.appendChild(iconEl);

			const labelEl = document.createElement("span");
			labelEl.className = "ws-settings-nav-label";
			labelEl.textContent = tab.name;
			navItem.appendChild(labelEl);

			navItem.dataset.tabId = tab.id;
			navItems.push(navItem);

			navItem.addEventListener("click", () => {
				this._switchSettingsTab(tab, content, navItems);
			});

			sidebar.appendChild(navItem);
		}

		body.appendChild(sidebar);
		body.appendChild(content);
		modal.appendChild(body);

		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		// Select initial tab
		const initialTab = tabId
			? allTabs.find((t) => t.id === tabId) || allTabs[0]
			: allTabs[0];
		this._switchSettingsTab(initialTab, content, navItems);

		// Shared close logic
		const escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") closeModal();
		};
		const closeModal = () => {
			if (this._activeSettingTab) {
				this._activeSettingTab.hide();
				this._activeSettingTab = null;
			}
			overlay.remove();
			document.removeEventListener("keydown", escHandler);
		};
		closeBtn.addEventListener("click", closeModal);
		backdrop.addEventListener("click", closeModal);
		document.addEventListener("keydown", escHandler);
	}

	/** Switch to a different tab within the open settings modal. */
	private _switchSettingsTab(
		tab: SettingTabLike,
		contentArea: HTMLElement,
		navItems: HTMLElement[],
	): void {
		// Hide previous tab
		if (this._activeSettingTab) {
			this._activeSettingTab.hide();
		}

		// Update nav item active state
		for (const item of navItems) {
			item.classList.toggle("is-active", item.dataset.tabId === tab.id);
		}

		// Clear content area and render new tab
		contentArea.innerHTML = "";
		tab.containerEl.empty();
		tab.display();
		contentArea.appendChild(tab.containerEl);

		this._activeSettingTab = tab;
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
