/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/extensions/ExtensionBrowserView
 * @description Main UI for browsing and managing extensions
 * 
 * This view provides a complete interface for discovering, installing, and managing
 * extensions from the marketplace catalog.
 */

import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import type CopilotPlugin from "../../main";
import { ExtensionCatalogService } from "../../extensions/ExtensionCatalogService";
import { ExtensionManager } from "../../extensions/ExtensionManager";
import { MarketplaceExtension, VaultExtensionKind, BrowseFilter } from "../../extensions/types";
import { ExtensionCardComponent } from "./ExtensionCard";

export const EXTENSION_BROWSER_VIEW_TYPE = "extension-browser-view";

/**
 * Extension Browser View - Main UI for the extension marketplace.
 * Extends ItemView to support pop-out windows on desktop.
 */
export class ExtensionBrowserView extends ItemView {
	private plugin: CopilotPlugin;
	private catalogService: ExtensionCatalogService;
	private extensionManager: ExtensionManager;
	
	private containerEl: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private typeSelect: HTMLSelectElement | null = null;
	private categorySelect: HTMLSelectElement | null = null;
	
	private installedSection: HTMLElement | null = null;
	private featuredSection: HTMLElement | null = null;
	private allExtensionsSection: HTMLElement | null = null;
	
	private currentFilter: BrowseFilter = {};
	private allExtensions: MarketplaceExtension[] = [];
	private installedExtensionIds: Set<string> = new Set();
	private availableUpdates: Map<string, string> = new Map(); // extensionId -> new version
	
	constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin) {
		super(leaf);
		this.plugin = plugin;
		
		// Initialize services
		const catalogUrl = plugin.settings.extensionCatalogUrl;
		
		if (!catalogUrl) {
			throw new Error("Extension catalog URL not configured");
		}
		
		this.catalogService = new ExtensionCatalogService(this.app, {
			catalogEndpoint: catalogUrl,
			cacheTTLMillis: 300000, // 5 minutes
		});
		
		this.extensionManager = new ExtensionManager(this.app);
	}
	
	getViewType(): string {
		return EXTENSION_BROWSER_VIEW_TYPE;
	}
	
	getDisplayText(): string {
		return "Extensions";
	}
	
	getIcon(): string {
		return "puzzle";
	}
	
	async onOpen(): Promise<void> {
		await this.extensionManager.initialize();
		this.render();
		await this.loadExtensions();
	}
	
	async onClose(): Promise<void> {
		// Cleanup
		this.containerEl = null;
	}
	
	/**
	 * Renders the main UI structure
	 */
	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("vc-extension-browser");
		this.containerEl = container;
		
		// Header
		const header = container.createDiv({ cls: "vc-extension-browser-header" });
		
		const title = header.createEl("h2", { text: "Extensions" });
		
		const headerActions = header.createDiv({ cls: "vc-extension-browser-header-actions" });
		
		// Refresh button
		const refreshBtn = headerActions.createEl("button", {
			cls: "vc-extension-browser-btn",
			attr: { "aria-label": "Refresh catalog" }
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", () => this.handleRefresh());
		
		// Search and filters bar
		const filtersBar = container.createDiv({ cls: "vc-extension-browser-filters" });
		
		// Search input
		const searchContainer = filtersBar.createDiv({ cls: "vc-extension-browser-search" });
		const searchIcon = searchContainer.createDiv({ cls: "vc-extension-browser-search-icon" });
		setIcon(searchIcon, "search");
		
		this.searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search extensions...",
			cls: "vc-extension-browser-search-input"
		});
		this.searchInput.addEventListener("input", () => this.handleFilterChange());
		
		// Type filter
		this.typeSelect = filtersBar.createEl("select", { cls: "vc-extension-browser-select" });
		this.typeSelect.createEl("option", { text: "All Types", value: "" });
		this.typeSelect.createEl("option", { text: "Agents", value: "agent" });
		this.typeSelect.createEl("option", { text: "Voice Agents", value: "voice-agent" });
		this.typeSelect.createEl("option", { text: "Prompts", value: "prompt" });
		this.typeSelect.createEl("option", { text: "Skills", value: "skill" });
		this.typeSelect.createEl("option", { text: "MCP Servers", value: "mcp-server" });
		this.typeSelect.addEventListener("change", () => this.handleFilterChange());
		
		// Category filter
		this.categorySelect = filtersBar.createEl("select", { cls: "vc-extension-browser-select" });
		this.categorySelect.createEl("option", { text: "All Categories", value: "" });
		this.categorySelect.addEventListener("change", () => this.handleFilterChange());
		
		// Sections container
		const sectionsContainer = container.createDiv({ cls: "vc-extension-browser-sections" });
		
		// Installed section
		this.installedSection = this.createSection(sectionsContainer, "INSTALLED", "installed");
		
		// Featured section
		this.featuredSection = this.createSection(sectionsContainer, "FEATURED", "featured");
		
		// All extensions section
		this.allExtensionsSection = this.createSection(sectionsContainer, "ALL EXTENSIONS", "all");
	}
	
	/**
	 * Creates a collapsible section
	 */
	private createSection(parent: HTMLElement, title: string, id: string): HTMLElement {
		const section = parent.createDiv({ cls: "vc-extension-browser-section" });
		section.setAttribute("data-section-id", id);
		
		const header = section.createDiv({ cls: "vc-extension-browser-section-header" });
		header.addEventListener("click", () => this.toggleSection(section));
		
		const headerTitle = header.createDiv({ cls: "vc-extension-browser-section-title" });
		const icon = headerTitle.createSpan({ cls: "vc-extension-browser-section-icon" });
		setIcon(icon, "chevron-down");
		headerTitle.createSpan({ text: title, cls: "vc-extension-browser-section-text" });
		
		const count = header.createSpan({ cls: "vc-extension-browser-section-count", text: "(0)" });
		
		const content = section.createDiv({ cls: "vc-extension-browser-section-content" });
		
		return section;
	}
	
	/**
	 * Toggles a section's expanded/collapsed state
	 */
	private toggleSection(section: HTMLElement): void {
		section.toggleClass("collapsed");
	}
	
	/**
	 * Loads extensions from the catalog
	 */
	private async loadExtensions(): Promise<void> {
		try {
			// Show loading state
			new Notice("Loading extensions...");
			
			// Fetch catalog
			const catalog = await this.catalogService.fetchCatalog();
			this.allExtensions = catalog.availableExtensions;
			
			// Load categories
			await this.loadCategories(catalog.knownCategories);
			
			// Load installed extensions
			const installed = await this.extensionManager.getInstalledExtensions();
			this.installedExtensionIds = new Set(installed.keys());
			
			// Check for updates
			const updates = await this.extensionManager.checkForUpdates(catalog.availableExtensions);
			this.availableUpdates.clear();
			for (const update of updates) {
				this.availableUpdates.set(update.extensionId, update.availableNewerVersion);
			}
			
			// Render sections
			await this.renderSections();
			
			new Notice("Extensions loaded successfully");
		} catch (error) {
			console.error("Failed to load extensions:", error);
			new Notice("Failed to load extensions. Check console for details.");
		}
	}
	
	/**
	 * Loads categories into the filter dropdown
	 */
	private async loadCategories(categories: string[]): Promise<void> {
		if (!this.categorySelect) return;
		
		// Clear existing options (except "All Categories")
		while (this.categorySelect.options.length > 1) {
			this.categorySelect.remove(1);
		}
		
		// Add category options
		for (const category of categories) {
			this.categorySelect.createEl("option", { text: category, value: category });
		}
	}
	
	/**
	 * Renders all sections based on current filter
	 */
	private async renderSections(): Promise<void> {
		// Get installed extensions
		const installedExtensions = this.allExtensions.filter(ext => 
			this.installedExtensionIds.has(ext.uniqueId)
		);
		
		// Get featured extensions
		const featuredExtensions = await this.catalogService.getFeatured();
		
		// Apply filters to get all extensions
		const filteredExtensions = await this.applyFilters();
		
		// Render each section
		this.renderExtensionList(this.installedSection!, installedExtensions, "installed");
		this.renderExtensionList(this.featuredSection!, featuredExtensions, "featured");
		this.renderExtensionList(this.allExtensionsSection!, filteredExtensions, "all");
	}
	
	/**
	 * Applies current filters to extension list
	 */
	private async applyFilters(): Promise<MarketplaceExtension[]> {
		const filter: BrowseFilter = {};
		
		if (this.searchInput?.value) {
			filter.textQuery = this.searchInput.value;
		}
		
		if (this.typeSelect?.value) {
			filter.filterByKind = this.typeSelect.value as VaultExtensionKind;
		}
		
		if (this.categorySelect?.value) {
			filter.filterByCategories = [this.categorySelect.value];
		}
		
		return await this.catalogService.searchExtensions(filter);
	}
	
	/**
	 * Renders a list of extensions in a section
	 */
	private renderExtensionList(
		section: HTMLElement,
		extensions: MarketplaceExtension[],
		sectionType: string
	): void {
		const content = section.querySelector(".vc-extension-browser-section-content") as HTMLElement;
		if (!content) return;
		
		// Update count
		const countEl = section.querySelector(".vc-extension-browser-section-count");
		if (countEl) {
			countEl.textContent = `(${extensions.length})`;
		}
		
		// Clear content
		content.empty();
		
		// Render cards
		if (extensions.length === 0) {
			content.createDiv({ 
				cls: "vc-extension-browser-empty", 
				text: "No extensions found" 
			});
			return;
		}
		
		for (const ext of extensions) {
			const isInstalled = this.installedExtensionIds.has(ext.uniqueId);
			const hasUpdate = this.availableUpdates.has(ext.uniqueId);
			
			const card = new ExtensionCardComponent({
				extensionData: ext,
				isCurrentlyInstalled: isInstalled,
				hasAvailableUpdate: hasUpdate,
				onCardClick: (ext) => this.handleCardClick(ext),
				onInstallClick: (ext) => this.handleInstall(ext),
				onUpdateClick: (ext) => this.handleUpdate(ext),
				onRemoveClick: (ext) => this.handleRemove(ext),
			});
			
			content.appendChild(card.buildElement());
		}
	}
	
	/**
	 * Handles filter changes
	 */
	private async handleFilterChange(): Promise<void> {
		await this.renderSections();
	}
	
	/**
	 * Handles refresh button click
	 */
	private async handleRefresh(): Promise<void> {
		this.catalogService.clearCache();
		this.availableUpdates.clear();
		await this.loadExtensions();
	}
	
	/**
	 * Handles card click to show details
	 */
	private handleCardClick(ext: MarketplaceExtension): void {
		// TODO: Open detail modal
		new Notice(`Viewing details for ${ext.displayTitle}`);
	}
	
	/**
	 * Handles extension installation
	 */
	private async handleInstall(ext: MarketplaceExtension): Promise<void> {
		try {
			new Notice(`Installing ${ext.displayTitle}...`);
			const result = await this.extensionManager.installExtension(ext);
			
			if (result.operationSucceeded) {
				this.installedExtensionIds.add(ext.uniqueId);
				this.availableUpdates.delete(ext.uniqueId); // Remove from updates if present
				await this.renderSections();
			}
		} catch (error) {
			console.error("Installation failed:", error);
		}
	}
	
	/**
	 * Handles extension update
	 */
	private async handleUpdate(ext: MarketplaceExtension): Promise<void> {
		try {
			new Notice(`Updating ${ext.displayTitle}...`);
			const result = await this.extensionManager.updateExtension(ext.uniqueId, ext);
			
			if (result.operationSucceeded) {
				this.availableUpdates.delete(ext.uniqueId); // Remove from updates after successful update
				await this.renderSections();
			}
		} catch (error) {
			console.error("Update failed:", error);
		}
	}
	
	/**
	 * Handles extension removal
	 */
	private async handleRemove(ext: MarketplaceExtension): Promise<void> {
		try {
			new Notice(`Removing ${ext.displayTitle}...`);
			const result = await this.extensionManager.uninstallExtension(ext.uniqueId);
			
			if (result.operationSucceeded) {
				this.installedExtensionIds.delete(ext.uniqueId);
				this.availableUpdates.delete(ext.uniqueId);
				await this.renderSections();
			}
		} catch (error) {
			console.error("Removal failed:", error);
		}
	}
}
