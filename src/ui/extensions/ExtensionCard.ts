/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/extensions/ExtensionCard
 * @description Reusable card component for displaying extension metadata in lists
 * 
 * This component renders a compact card showing key information about an extension,
 * including its icon, name, description, categories, and action buttons.
 */

import { setIcon } from "obsidian";
import { MarketplaceExtension, VaultExtensionKind } from "../../extensions/types";
import { ExtensionHoverPopup } from "./ExtensionHoverPopup";

/**
 * Configuration for rendering an extension card.
 */
export interface ExtensionCardConfig {
	/** The extension data to display */
	extensionData: MarketplaceExtension;
	
	/** Whether this extension is currently installed */
	isCurrentlyInstalled: boolean;
	
	/** Whether an update is available for this extension */
	hasAvailableUpdate: boolean;
	
	/** Callback when user clicks the card body */
	onCardClick: (ext: MarketplaceExtension) => void;
	
	/** Callback when user clicks install button */
	onInstallClick: (ext: MarketplaceExtension) => void;
	
	/** Callback when user clicks update button */
	onUpdateClick: (ext: MarketplaceExtension) => void;
	
	/** Callback when user clicks remove button */
	onRemoveClick: (ext: MarketplaceExtension) => void;
	
	/** Callback when user clicks the rate button */
	onRateClick?: (ext: MarketplaceExtension) => void;
}

/**
 * Extension card component for the marketplace browser.
 * Creates a visually appealing card with metadata and action buttons.
 * 
 * @example
 * ```typescript
 * const card = new ExtensionCardComponent({
 *   extensionData: myExtension,
 *   isCurrentlyInstalled: false,
 *   hasAvailableUpdate: false,
 *   onCardClick: (ext) => showDetailModal(ext),
 *   onInstallClick: (ext) => installExtension(ext),
 *   onUpdateClick: (ext) => updateExtension(ext),
 *   onRemoveClick: (ext) => removeExtension(ext)
 * });
 * 
 * const element = card.buildElement();
 * containerEl.appendChild(element);
 * ```
 */
export class ExtensionCardComponent {
	private config: ExtensionCardConfig;
	private hoverPopup: ExtensionHoverPopup | null = null;
	private hoverTimeout: number | null = null;
	
	constructor(config: ExtensionCardConfig) {
		this.config = config;
		
		// Create hover popup
		this.hoverPopup = new ExtensionHoverPopup({
			extension: config.extensionData,
			isInstalled: config.isCurrentlyInstalled,
			hasUpdate: config.hasAvailableUpdate
		});
	}
	
	/**
	 * Builds the DOM element for this card.
	 * Returns a fully interactive card element ready to be inserted into the DOM.
	 */
	public buildElement(): HTMLElement {
		const cardContainer = document.createElement("div");
		cardContainer.addClass("vc-extension-card");
		
		// Add installed state class if applicable
		if (this.config.isCurrentlyInstalled) {
			cardContainer.addClass("vc-extension-card--installed");
		}
		
		// Add update available class if applicable
		if (this.config.hasAvailableUpdate) {
			cardContainer.addClass("vc-extension-card--has-update");
		}
		
		// Make card clickable
		cardContainer.addEventListener("click", (evt) => {
			// Don't trigger if clicking action buttons
			if ((evt.target as HTMLElement).closest(".vc-extension-card__actions")) {
				return;
			}
			this.config.onCardClick(this.config.extensionData);
		});
		
		// Add hover handlers
		cardContainer.addEventListener("mouseenter", (evt) => {
			// Delay showing popup slightly to avoid flickering
			this.hoverTimeout = window.setTimeout(() => {
				this.hoverPopup?.show(cardContainer, evt);
			}, 400);
		});
		
		cardContainer.addEventListener("mouseleave", () => {
			// Cancel pending show
			if (this.hoverTimeout !== null) {
				window.clearTimeout(this.hoverTimeout);
				this.hoverTimeout = null;
			}
			// Hide popup
			this.hoverPopup?.hide();
		});
		
		// Build header section
		const headerSection = this.createHeaderSection();
		cardContainer.appendChild(headerSection);
		
		// Build description section
		const descSection = this.createDescriptionSection();
		cardContainer.appendChild(descSection);
		
		// Build metrics section (ratings + installs)
		const metricsSection = this.createMetricsSection();
		cardContainer.appendChild(metricsSection);
		
		// Build footer with metadata and actions
		const footerSection = this.createFooterSection();
		cardContainer.appendChild(footerSection);
		
		return cardContainer;
	}
	
	/**
	 * Destroys the card and cleans up resources.
	 */
	public destroy(): void {
		if (this.hoverTimeout !== null) {
			window.clearTimeout(this.hoverTimeout);
			this.hoverTimeout = null;
		}
		
		this.hoverPopup?.destroy();
		this.hoverPopup = null;
	}
	
	/**
	 * Creates the header section with icon, title, and version.
	 */
	private createHeaderSection(): HTMLElement {
		const header = document.createElement("div");
		header.addClass("vc-extension-card__header");
		
		// Icon
		const iconWrapper = document.createElement("div");
		iconWrapper.addClass("vc-extension-card__icon");
		iconWrapper.setAttribute("data-kind", this.config.extensionData.kind);
		const iconName = this.getIconForExtensionKind(this.config.extensionData.kind);
		setIcon(iconWrapper, iconName);
		header.appendChild(iconWrapper);
		
		// Title and version container
		const titleContainer = document.createElement("div");
		titleContainer.addClass("vc-extension-card__title-container");
		
		const titleText = document.createElement("div");
		titleText.addClass("vc-extension-card__title");
		titleText.textContent = this.config.extensionData.displayTitle;
		titleContainer.appendChild(titleText);
		
		const versionBadge = document.createElement("div");
		versionBadge.addClass("vc-extension-card__version");
		versionBadge.textContent = `v${this.config.extensionData.semanticVersion}`;
		titleContainer.appendChild(versionBadge);
		
		header.appendChild(titleContainer);
		
		// Update badge if applicable
		if (this.config.hasAvailableUpdate) {
			const updateBadge = document.createElement("div");
			updateBadge.addClass("vc-extension-card__update-badge");
			updateBadge.textContent = "Update Available";
			header.appendChild(updateBadge);
		}
		
		return header;
	}
	
	/**
	 * Creates the description section.
	 */
	private createDescriptionSection(): HTMLElement {
		const descSection = document.createElement("div");
		descSection.addClass("vc-extension-card__description");
		descSection.textContent = this.config.extensionData.briefSummary;
		return descSection;
	}
	
	/**
	 * Creates the footer section with categories and action buttons.
	 */
	private createFooterSection(): HTMLElement {
		const footer = document.createElement("div");
		footer.addClass("vc-extension-card__footer");
		
		// Category tags
		const categoriesContainer = document.createElement("div");
		categoriesContainer.addClass("vc-extension-card__categories");
		
		for (const category of this.config.extensionData.classificationTags.slice(0, 2)) {
			const badge = document.createElement("span");
			badge.addClass("vc-extension-card__category-badge");
			badge.setAttribute("data-category", category);
			badge.textContent = category;
			categoriesContainer.appendChild(badge);
		}
		
		// Show "+N more" if there are additional categories
		if (this.config.extensionData.classificationTags.length > 2) {
			const moreBadge = document.createElement("span");
			moreBadge.addClass("vc-extension-card__category-badge");
			moreBadge.addClass("vc-extension-card__category-badge--more");
			const remaining = this.config.extensionData.classificationTags.length - 2;
			moreBadge.textContent = `+${remaining}`;
			categoriesContainer.appendChild(moreBadge);
		}
		
		footer.appendChild(categoriesContainer);
		
		// Action buttons
		const actionsContainer = document.createElement("div");
		actionsContainer.addClass("vc-extension-card__actions");
		
		if (this.config.hasAvailableUpdate) {
			// Show update button
			const updateBtn = this.createActionButton("Update", "sync");
			updateBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.config.onUpdateClick(this.config.extensionData);
			});
			actionsContainer.appendChild(updateBtn);
		} else if (this.config.isCurrentlyInstalled) {
			// Show rate button
			if (this.config.onRateClick) {
				const rateBtn = this.createActionButton("Rate", "star");
				rateBtn.addEventListener("click", (evt) => {
					evt.stopPropagation();
					this.config.onRateClick!(this.config.extensionData);
				});
				actionsContainer.appendChild(rateBtn);
			}
			
			// Show remove button
			const removeBtn = this.createActionButton("Remove", "trash");
			removeBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.config.onRemoveClick(this.config.extensionData);
			});
			actionsContainer.appendChild(removeBtn);
		} else {
			// Show install button
			const installBtn = this.createActionButton("Install", "download");
			installBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.config.onInstallClick(this.config.extensionData);
			});
			actionsContainer.appendChild(installBtn);
		}
		
		footer.appendChild(actionsContainer);
		
		return footer;
	}
	
	/**
	 * Creates an action button with icon.
	 */
	private createActionButton(label: string, iconName: string): HTMLElement {
		const button = document.createElement("button");
		button.addClass("vc-extension-card__action-btn");
		button.setAttribute("aria-label", label);
		button.setAttribute("data-action", label.toLowerCase());
		
		const iconEl = document.createElement("span");
		setIcon(iconEl, iconName);
		button.appendChild(iconEl);
		
		const labelEl = document.createElement("span");
		labelEl.textContent = label;
		button.appendChild(labelEl);
		
		return button;
	}
	
	/**
	 * Creates the metrics section showing ratings and install counts.
	 * Always displays the star rating row (empty stars when no ratings exist).
	 */
	private createMetricsSection(): HTMLElement {
		const ext = this.config.extensionData;
		
		const metrics = document.createElement("div");
		metrics.addClass("vc-extension-card__metrics");
		
		// Rating display — always shown
		const rating = ext.communityRating ?? 0;
		const ratingContainer = document.createElement("span");
		ratingContainer.addClass("vc-extension-card__rating");
		
		const starsEl = document.createElement("span");
		starsEl.addClass("vc-extension-card__stars");
		starsEl.textContent = this.getStarString(rating);
		starsEl.setAttribute("aria-label", rating > 0
			? `${rating.toFixed(1)} out of 5 stars`
			: "No ratings yet");
		ratingContainer.appendChild(starsEl);
		
		const scoreEl = document.createElement("span");
		scoreEl.addClass("vc-extension-card__score");
		scoreEl.textContent = rating > 0 ? rating.toFixed(1) : "No ratings";
		ratingContainer.appendChild(scoreEl);
		
		if (rating > 0) {
			const ratingCountEl = document.createElement("span");
			ratingCountEl.addClass("vc-extension-card__rating-count");
			ratingCountEl.textContent = `(${(ext as any).ratingCount || 0})`;
			ratingContainer.appendChild(ratingCountEl);
		}
		
		metrics.appendChild(ratingContainer);
		
		// Install count
		if (ext.downloadMetrics && ext.downloadMetrics > 0) {
			const installsEl = document.createElement("span");
			installsEl.addClass("vc-extension-card__installs");
			installsEl.textContent = `📥 ${this.formatCount(ext.downloadMetrics)} installs`;
			metrics.appendChild(installsEl);
		}
		
		return metrics;
	}
	
	/**
	 * Converts a numeric rating (0-5) to a star string using ★ and ☆.
	 * @param rating - The numeric rating value
	 * @returns A string of filled and empty star characters
	 */
	private getStarString(rating: number): string {
		const fullStars = Math.floor(rating);
		const hasHalf = rating % 1 >= 0.25 && rating % 1 < 0.75;
		const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
		return '★'.repeat(fullStars) + (hasHalf ? '★' : '') + '☆'.repeat(Math.max(0, emptyStars));
	}
	
	/**
	 * Formats a count number with K/M suffixes for compact display.
	 * @param count - The raw count number
	 * @returns Formatted string (e.g., "1.2K", "3.5M")
	 */
	private formatCount(count: number): string {
		if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
		if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
		return count.toString();
	}
	
	/**
	 * Returns the appropriate icon name for an extension kind.
	 */
	private getIconForExtensionKind(kind: VaultExtensionKind): string {
		const iconMapping: Record<VaultExtensionKind, string> = {
			"agent": "bot",
			"voice-agent": "microphone",
			"prompt": "file-text",
			"skill": "zap",
			"mcp-server": "plug"
		};
		
		return iconMapping[kind] || "file";
	}
}
