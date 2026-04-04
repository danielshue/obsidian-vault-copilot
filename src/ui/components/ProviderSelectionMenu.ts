/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ProviderSelectionMenu
 * @description Reusable provider picker menu for chat surfaces.
 *
 * @since 0.1.0
 */

import { Menu } from "obsidian";

/**
 * One provider option shown in the picker.
 */
export interface ProviderSelectionOption {
	/** Stable provider profile ID. */
	id: string;
	/** Display name shown in the menu. */
	name: string;
	/** Pre-rendered icon HTML. */
	iconHtml: string;
}

/**
 * Configuration for building a provider picker menu.
 */
export interface BuildProviderSelectionMenuOptions {
	/** Available provider options. */
	providers: ProviderSelectionOption[];
	/** Active provider profile ID. */
	selectedProviderId: string;
	/** Called when user picks a provider. */
	onSelectProvider: (providerId: string) => void | Promise<void>;
}

/**
 * Build a provider picker menu with consistent checkmark + icon rendering.
 *
 * @param options - Menu configuration
 * @returns Configured Obsidian {@link Menu}
 */
export function buildProviderSelectionMenu(options: BuildProviderSelectionMenuOptions): Menu {
	const menu = new Menu();

	for (const provider of options.providers) {
		menu.addItem((item) => {
			const isSelected = provider.id === options.selectedProviderId;
			item.setTitle(provider.name).onClick(() => options.onSelectProvider(provider.id));
			const itemEl = (item as unknown as { dom: HTMLElement }).dom;
			const titleEl = itemEl?.querySelector(".menu-item-title") as HTMLElement | null;
			if (titleEl) {
				const check = isSelected ? "✓ " : "&nbsp;&nbsp;&nbsp; ";
				titleEl.innerHTML = `${check}<span class="vc-provider-menu-icon">${provider.iconHtml}</span> ${provider.name}`;
			}
		});
	}

	return menu;
}
