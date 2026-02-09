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
import { ExtensionWebView, EXTENSION_WEB_VIEW_TYPE } from "./ExtensionWebView";
import { RatingModal } from "./RatingModal";

export const EXTENSION_BROWSER_VIEW_TYPE = "extension-browser-view";

/**
 * Extension Browser View - Main UI for the extension marketplace.
 * Extends ItemView to support pop-out windows on desktop.
 */
export class ExtensionBrowserView extends ItemView {
	private plugin: CopilotPlugin;
	private catalogService: ExtensionCatalogService;
	private extensionManager: ExtensionManager;
	private catalogUrl: string;
	
	private searchInput: HTMLInputElement | null = null;
	private categoryBtn: HTMLElement | null = null;
	private typeBtn: HTMLElement | null = null;
	private categoryMenu: HTMLElement | null = null;
	private typeMenu: HTMLElement | null = null;
	private refreshBtn: HTMLElement | null = null;
	
	private selectedCategory: string = "";
	private selectedType: string = "";
	
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
		this.catalogUrl = plugin.settings.extensionCatalogUrl || 
			"https://danielshue.github.io/obsidian-vault-copilot/catalog/catalog.json";
		
		this.catalogService = new ExtensionCatalogService(this.app, {
			catalogEndpoint: this.catalogUrl,
			cacheTTLMillis: 300000, // 5 minutes
		});
		
		this.extensionManager = new ExtensionManager(this.app, {
			enableAnalytics: plugin.settings.enableAnalytics !== false,
			analyticsEndpoint: plugin.settings.analyticsEndpoint || 'https://vault-copilot-api.azurewebsites.net',
			githubUsername: plugin.settings.githubUsername || '',
			anonymousId: plugin.settings.anonymousId || '',
			pluginVersion: plugin.manifest.version,
		});
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
		// Cleanup handled by parent class
	}
	
	/**
	 * Renders the main UI structure
	 */
	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("vc-extension-browser");
		
		// Header
		const header = container.createDiv({ cls: "vc-extension-browser-header" });
		
		const title = header.createEl("h2", { text: "Extensions" });
		
		// Search and filters bar
		const filtersBar = container.createDiv({ cls: "vc-extension-browser-filters" });
		
		// Search input
		const searchContainer = filtersBar.createDiv({ cls: "vc-extension-browser-search" });
		const searchIcon = searchContainer.createDiv({ cls: "vc-extension-browser-search-icon" });
		setIcon(searchIcon, "search");
		
		this.searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search Extensions in Marketplace",
			cls: "vc-extension-browser-search-input"
		});
		this.searchInput.addEventListener("input", () => this.handleFilterChange());
		
		// Filter dropdowns container
		const filterDropdowns = filtersBar.createDiv({ cls: "vc-extension-browser-filter-dropdowns" });
		
		// Category filter
		this.createCascadingFilter(filterDropdowns, "Category", "filter");
		
		// Type filter
		this.createCascadingFilter(filterDropdowns, "Type", "layers");
		
		// Sections container
		const sectionsContainer = container.createDiv({ cls: "vc-extension-browser-sections" });
		
		// Sections header with refresh button
		const sectionsHeader = sectionsContainer.createDiv({ cls: "vc-extension-browser-sections-header" });
		sectionsHeader.createEl("h3", { text: "Browse Extensions" });
		
		const sectionsActions = sectionsHeader.createDiv({ cls: "vc-extension-browser-sections-actions" });
		
		// Refresh button
		this.refreshBtn = sectionsActions.createEl("button", {
			cls: "vc-extension-browser-btn",
			attr: { "aria-label": "Refresh catalog" }
		});
		setIcon(this.refreshBtn, "refresh-cw");
		this.refreshBtn.addEventListener("click", () => this.handleRefresh());
		
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
		const isCollapsed = section.hasClass("collapsed");
		section.toggleClass("collapsed", !isCollapsed);
	}
	
	/**
	 * Creates a cascading filter menu
	 */
	private createCascadingFilter(
		parent: HTMLElement,
		label: string,
		iconName: string
	): void {
		const wrapper = parent.createDiv({ cls: "vc-extension-browser-filter-wrapper" });
		
		// Filter button
		const button = wrapper.createDiv({ cls: "vc-extension-browser-filter-btn" });
		
		const icon = button.createDiv({ cls: "vc-extension-browser-filter-icon" });
		setIcon(icon, iconName);
		
		const text = button.createSpan({ cls: "vc-extension-browser-filter-text", text: label });
		
		const chevron = button.createDiv({ cls: "vc-extension-browser-filter-chevron" });
		setIcon(chevron, "chevron-right");
		
		// Store references
		if (label === "Category") {
			this.categoryBtn = button;
		} else if (label === "Type") {
			this.typeBtn = button;
		}
		
		// Cascading menu
		const menu = wrapper.createDiv({ cls: "vc-extension-browser-cascading-menu" });
		menu.style.display = "none";
		
		// Store menu reference
		if (label === "Category") {
			this.categoryMenu = menu;
		} else if (label === "Type") {
			this.typeMenu = menu;
		}
		
		// Populate menu based on type
		if (label === "Type") {
			this.populateTypeMenu(menu);
		}
		// Category menu will be populated after catalog loads
		
		// Toggle menu on click
		button.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleCascadingMenu(menu);
		});
		
		// Close menu when clicking outside
		this.registerDomEvent(document, "click", () => {
			if (menu.style.display === "block") {
				menu.style.display = "none";
				wrapper.removeClass("active");
			}
		});
	}
	
	/**
	 * Populates the type filter menu
	 */
	private populateTypeMenu(menu: HTMLElement): void {
		const types = [
			{ label: "All Types", value: "" },
			{ label: "Agents", value: "agent" },
			{ label: "Voice Agents", value: "voice-agent" },
			{ label: "Prompts", value: "prompt" },
			{ label: "Skills", value: "skill" },
			{ label: "MCP Servers", value: "mcp-server" }
		];
		
		types.forEach(type => {
			const item = menu.createDiv({ cls: "vc-extension-browser-menu-item" });
			item.textContent = type.label;
			item.dataset.value = type.value;
			
			if (type.value === this.selectedType) {
				item.addClass("active");
			}
			
			item.addEventListener("click", (e) => {
				e.stopPropagation();
				// Update active state
				menu.querySelectorAll(".vc-extension-browser-menu-item").forEach(i => i.removeClass("active"));
				item.addClass("active");
				
				// Update selection
				this.selectedType = type.value;
				this.updateTypeButton();
				this.handleFilterChange();
				
				// Close menu
				menu.style.display = "none";
				if (this.typeBtn) {
					this.typeBtn.parentElement?.removeClass("active");
				}
			});
		});
	}
	
	/**
	 * Populates the category filter menu
	 */
	private populateCategoryMenu(categories: string[]): void {
		if (!this.categoryMenu) return;
		
		this.categoryMenu.empty();
		
		const allItem = this.categoryMenu.createDiv({ cls: "vc-extension-browser-menu-item" });
		allItem.textContent = "All Categories";
		allItem.dataset.value = "";
		
		if (this.selectedCategory === "") {
			allItem.addClass("active");
		}
		
		allItem.addEventListener("click", (e) => {
			e.stopPropagation();
			this.categoryMenu?.querySelectorAll(".vc-extension-browser-menu-item").forEach(i => i.removeClass("active"));
			allItem.addClass("active");
			this.selectedCategory = "";
			this.updateCategoryButton();
			this.handleFilterChange();
			this.categoryMenu!.style.display = "none";
			if (this.categoryBtn) {
				this.categoryBtn.parentElement?.removeClass("active");
			}
		});
		
		categories.forEach(category => {
			const item = this.categoryMenu!.createDiv({ cls: "vc-extension-browser-menu-item" });
			item.textContent = category;
			item.dataset.value = category;
			
			if (category === this.selectedCategory) {
				item.addClass("active");
			}
			
			item.addEventListener("click", (e) => {
				e.stopPropagation();
				this.categoryMenu?.querySelectorAll(".vc-extension-browser-menu-item").forEach(i => i.removeClass("active"));
				item.addClass("active");
				this.selectedCategory = category;
				this.updateCategoryButton();
				this.handleFilterChange();
				this.categoryMenu!.style.display = "none";
				if (this.categoryBtn) {
					this.categoryBtn.parentElement?.removeClass("active");
				}
			});
		});
	}
	
	/**
	 * Toggles a cascading menu's visibility
	 */
	private toggleCascadingMenu(menu: HTMLElement): void {
		// Close other menus
		if (this.categoryMenu && this.categoryMenu !== menu) {
			this.categoryMenu.style.display = "none";
			this.categoryBtn?.parentElement?.removeClass("active");
		}
		if (this.typeMenu && this.typeMenu !== menu) {
			this.typeMenu.style.display = "none";
			this.typeBtn?.parentElement?.removeClass("active");
		}
		
		// Toggle this menu
		const isVisible = menu.style.display === "block";
		menu.style.display = isVisible ? "none" : "block";
		
		if (!isVisible) {
			menu.parentElement?.addClass("active");
		} else {
			menu.parentElement?.removeClass("active");
		}
	}
	
	/**
	 * Updates the category button text
	 */
	private updateCategoryButton(): void {
		if (!this.categoryBtn) return;
		const textEl = this.categoryBtn.querySelector(".vc-extension-browser-filter-text");
		if (textEl) {
			textEl.textContent = this.selectedCategory || "Category";
		}
	}
	
	/**
	 * Updates the type button text
	 */
	private updateTypeButton(): void {
		if (!this.typeBtn) return;
		const textEl = this.typeBtn.querySelector(".vc-extension-browser-filter-text");
		if (textEl) {
			// Map values to display names
			const typeNames: Record<string, string> = {
				"": "Type",
				"agent": "Agents",
				"voice-agent": "Voice Agents",
				"prompt": "Prompts",
				"skill": "Skills",
				"mcp-server": "MCP Servers"
			};
			textEl.textContent = typeNames[this.selectedType] || "Type";
		}
	}
	
	/**
	 * Loads extensions from the catalog
	 */
	private async loadExtensions(): Promise<void> {
		try {
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
			
			// Clear any error messages on success
			const sectionsContainer = this.contentEl.querySelector(".vc-extension-browser-sections") as HTMLElement;
			if (sectionsContainer) {
				const existingErrors = sectionsContainer.querySelectorAll(".vc-extension-browser-error");
				existingErrors.forEach(el => el.remove());
			}
			
			// Render sections
			await this.renderSections();
		} catch (error) {
			console.error("Failed to load extensions:", error);
			
			// Show user-friendly error in the UI
			this.showCatalogError(error);
			
			// Still try to show installed extensions
			try {
				const installed = await this.extensionManager.getInstalledExtensions();
				this.installedExtensionIds = new Set(installed.keys());
				await this.renderSections();
			} catch (e) {
				console.error("Failed to load installed extensions:", e);
			}
		}
	}
	
	/**
	 * Display a friendly error message when catalog is unavailable
	 */
	private showCatalogError(error: unknown): void {
		// Find sections container
		const sectionsContainer = this.contentEl.querySelector(".vc-extension-browser-sections") as HTMLElement;
		
		if (!sectionsContainer) {
			// If no sections container exists, something is wrong with initialization
			return;
		}
		
		// Remove any existing error messages
		const existingErrors = sectionsContainer.querySelectorAll(".vc-extension-browser-error");
		existingErrors.forEach(el => el.remove());
		
		// Create error display at the top of sections container
		const errorContainer = sectionsContainer.createDiv({ cls: "vc-extension-browser-error" });
		
		// Move error to the top
		sectionsContainer.insertBefore(errorContainer, sectionsContainer.firstChild);
		
		const iconEl = errorContainer.createDiv({ cls: "vc-extension-browser-error-icon" });
		setIcon(iconEl, "cloud-off");
		
		const titleEl = errorContainer.createEl("h3", { 
			text: "Extension Catalog Unavailable",
			cls: "vc-extension-browser-error-title"
		});
		
		const messageEl = errorContainer.createEl("p", { 
			text: "The extension marketplace is not yet available.",
			cls: "vc-extension-browser-error-message"
		});
		
		// Show the URL being accessed
		const urlEl = errorContainer.createEl("p", {
			cls: "vc-extension-browser-error-url"
		});
		urlEl.createSpan({ text: "Catalog URL: ", cls: "vc-extension-browser-error-url-label" });
		urlEl.createEl("code", { text: this.catalogUrl });
		
		const detailsEl = errorContainer.createEl("p", {
			text: "You can still manage any installed extensions below.",
			cls: "vc-extension-browser-error-details"
		});
		
		if (error instanceof Error && error.message.includes("not valid JSON")) {
			const technicalEl = errorContainer.createEl("details", { cls: "vc-extension-browser-error-technical" });
			const summaryEl = technicalEl.createEl("summary", { text: "Technical details" });
			const codeEl = technicalEl.createEl("code", { 
				text: `The catalog URL returned HTML instead of JSON. This usually means the endpoint doesn't exist yet or returned an error page.`
			});
		}
	}
	
	/**
	 * Loads categories into the filter dropdown
	 */
	private async loadCategories(categories: string[]): Promise<void> {
		// Populate the category cascading menu
		this.populateCategoryMenu(categories);
	}
	
	/**
	 * Renders all sections based on current filter
	 */
	private async renderSections(): Promise<void> {
		// Apply filters to get all extensions
		const filteredExtensions = await this.applyFilters();
		
		// Get installed extensions (filtered)
		const installedExtensions = filteredExtensions.filter(ext => 
			this.installedExtensionIds.has(ext.uniqueId)
		);
		
		// Get featured extensions (filtered)
		const allFeatured = await this.catalogService.getFeatured();
		const featuredExtensions = filteredExtensions.filter(ext =>
			allFeatured.some(f => f.uniqueId === ext.uniqueId)
		);
		
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
		
		if (this.selectedType) {
			filter.filterByKind = this.selectedType as VaultExtensionKind;
		}
		
		if (this.selectedCategory) {
			filter.filterByCategories = [this.selectedCategory];
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
				onRateClick: this.extensionManager.isAnalyticsEnabled()
					? (ext) => this.handleRate(ext)
					: undefined,
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
		// Add refreshing class for animation
		if (this.refreshBtn) {
			this.refreshBtn.addClass("refreshing");
			this.refreshBtn.setAttribute("disabled", "true");
		}
		
		try {
			this.catalogService.clearCache();
			this.availableUpdates.clear();
			await this.loadExtensions();
		} finally {
			// Remove refreshing class after a minimum animation duration
			setTimeout(() => {
				if (this.refreshBtn) {
					this.refreshBtn.removeClass("refreshing");
					this.refreshBtn.removeAttribute("disabled");
				}
			}, 500); // Ensure at least half a rotation completes
		}
	}
	
	/**
	 * Handles card click to show details
	 */
	private async handleCardClick(ext: MarketplaceExtension): Promise<void> {
		// Open extension's detail page in Obsidian web view
		if (ext.webDetailPage) {
			const leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({
				type: EXTENSION_WEB_VIEW_TYPE,
				active: true,
				state: {
					url: ext.webDetailPage,
					extensionName: ext.displayTitle
				}
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}
	
	/**
	 * Handles extension installation
	 */
	private async handleInstall(ext: MarketplaceExtension): Promise<void> {
		try {
			const result = await this.extensionManager.installExtension(ext);
			
			if (result.operationSucceeded) {
				new Notice(`Extension "${ext.displayTitle}" installed successfully`);
				this.installedExtensionIds.add(ext.uniqueId);
				this.availableUpdates.delete(ext.uniqueId); // Remove from updates if present
				await this.renderSections();
			} else {
				new Notice(`Installation failed: ${result.errorDetails || 'Unknown error'}`, 5000);
			}
		} catch (error) {
			console.error("Installation failed:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`Installation failed: ${errorMsg}`, 5000);
		}
	}
	
	/**
	 * Handles extension update
	 */
	private async handleUpdate(ext: MarketplaceExtension): Promise<void> {
		try {
			const result = await this.extensionManager.updateExtension(ext.uniqueId, ext);
			
			if (result.operationSucceeded) {
				// Note: updateExtension already shows success notice
				this.availableUpdates.delete(ext.uniqueId); // Remove from updates after successful update
				await this.renderSections();
			} else {
				new Notice(`Update failed: ${result.errorDetails || 'Unknown error'}`, 5000);
			}
		} catch (error) {
			console.error("Update failed:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`Update failed: ${errorMsg}`, 5000);
		}
	}
	
	/**
	 * Handles extension removal
	 */
	private async handleRemove(ext: MarketplaceExtension): Promise<void> {
		try {
			const result = await this.extensionManager.uninstallExtension(ext.uniqueId);
			
			if (result.operationSucceeded) {
				new Notice(`Extension "${ext.displayTitle}" removed successfully`);
				this.installedExtensionIds.delete(ext.uniqueId);
				this.availableUpdates.delete(ext.uniqueId);
				await this.renderSections();
			} else {
				new Notice(`Removal failed: ${result.errorDetails || 'Unknown error'}`, 5000);
			}
		} catch (error) {
			console.error("Removal failed:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`Removal failed: ${errorMsg}`, 5000);
		}
	}
	
	/**
	 * Handles rating an extension via the RatingModal.
	 */
	private async handleRate(ext: MarketplaceExtension): Promise<void> {
		const analyticsService = this.extensionManager.getAnalyticsService();
		const userHash = this.extensionManager.getUserHash();
		
		if (!analyticsService || !userHash) {
			new Notice('Analytics is not enabled. Enable it in Settings → Extension Analytics.', 5000);
			return;
		}
		
		RatingModal.show({
			app: this.app,
			extensionId: ext.uniqueId,
			extensionName: ext.displayTitle,
			extensionVersion: ext.semanticVersion,
			userHash,
			analyticsService,
			onRatingSubmitted: async (_rating, _comment) => {
				new Notice(`Rating submitted for "${ext.displayTitle}"`);
				await this.renderSections();
			},
		});
	}
}
