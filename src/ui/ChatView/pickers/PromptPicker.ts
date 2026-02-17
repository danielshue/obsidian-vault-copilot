/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module PromptPicker
 * @description Manages the slash-command dropdown UI that appears when the user types '/'.
 * Shows built-in commands, custom prompts, agents, and skills with type badges.
 * Supports flat (all items with badges) and grouped (section headers) display modes.
 *
 * @see {@link CopilotChatView} for integration
 * @see {@link PromptCache} for prompt data
 * @see {@link AgentCache} for agent data
 * @see {@link SkillRegistry} for skill data
 * @since 0.0.26
 */

import { CachedPromptInfo, SlashMenuItemType } from "../../../copilot/customization/PromptCache";
import { CachedAgentInfo } from "../../../copilot/customization/AgentCache";

/**
 * Minimal skill info needed for display in the prompt picker.
 * Both CachedSkillInfo (file-based) and SkillInfo (runtime) satisfy this.
 */
interface PickerSkillInfo {
	name: string;
	description: string;
}
import { SLASH_COMMANDS } from "../processing/SlashCommands";

/**
 * Display labels for each item type badge
 * @internal
 */
const TYPE_LABELS: Record<SlashMenuItemType, string> = {
	command: 'command',
	prompt: 'prompt',
	agent: 'agent',
	skill: 'skill',
};

/**
 * Order for grouped display mode — determines section ordering
 * @internal
 */
const GROUP_ORDER: SlashMenuItemType[] = ['command', 'prompt', 'agent', 'skill'];

/**
 * Human-readable section headers for grouped mode
 * @internal
 */
const GROUP_HEADERS: Record<SlashMenuItemType, string> = {
	command: 'Commands',
	prompt: 'Prompts',
	agent: 'Agents',
	skill: 'Skills',
};

/**
 * Constructor options for the PromptPicker
 */
export interface PromptPickerOptions {
	/** Container element for the picker dropdown */
	containerEl: HTMLElement;
	/** The contenteditable input div */
	inputEl: HTMLDivElement;
	/** Callback to retrieve custom prompts */
	getPrompts: () => CachedPromptInfo[];
	/** Callback to retrieve custom agents */
	getAgents: () => CachedAgentInfo[];
	/** Callback to retrieve registered skills */
	getSkills: () => PickerSkillInfo[];
	/** Callback to get the current grouping mode setting */
	getGrouping: () => 'flat' | 'grouped';
	/** Callback when a prompt/command is selected */
	onSelect: (prompt: CachedPromptInfo) => Promise<void>;
}

/**
 * Manages the prompt picker dropdown UI that appears when user types '/'.
 *
 * Shows built-in commands, custom prompts (.prompt.md), agents (.agent.md),
 * and registered skills (SKILL.md) in a unified dropdown. Each item displays
 * a colored type badge. Supports flat and grouped display modes.
 *
 * @example
 * ```typescript
 * const picker = new PromptPicker({
 *   containerEl, inputEl,
 *   getPrompts: () => promptCache.getPrompts(),
 *   getAgents: () => agentCache.getAgents(),
 *   getSkills: () => skillRegistry.listSkills(),
 *   getGrouping: () => settings.slashMenuGrouping,
 *   onSelect: (item) => executor.executePrompt(item),
 * });
 * ```
 */
export class PromptPicker {
	private containerEl: HTMLElement;
	private inputEl: HTMLDivElement;  // contenteditable div
	private visible = false;
	private selectedIndex = 0;
	/** All selectable items (excludes group headers) */
	private selectableItems: CachedPromptInfo[] = [];
	private onSelect: (prompt: CachedPromptInfo) => Promise<void>;
	private getPrompts: () => CachedPromptInfo[];
	private getAgents: () => CachedAgentInfo[];
	private getSkills: () => PickerSkillInfo[];
	private getGrouping: () => 'flat' | 'grouped';
	private justSelected = false;  // Flag to prevent Enter auto-submit after selection

	constructor(options: PromptPickerOptions) {
		this.containerEl = options.containerEl;
		this.inputEl = options.inputEl;
		this.getPrompts = options.getPrompts;
		this.getAgents = options.getAgents;
		this.getSkills = options.getSkills;
		this.getGrouping = options.getGrouping;
		this.onSelect = options.onSelect;
	}

	/**
	 * Check if the picker is currently visible
	 */
	isVisible(): boolean {
		return this.visible;
	}

	/**
	 * Check if a selection just happened (and clear the flag).
	 * Used to prevent Enter from auto-submitting right after selection.
	 */
	checkAndClearJustSelected(): boolean {
		if (this.justSelected) {
			this.justSelected = false;
			return true;
		}
		return false;
	}

	/**
	 * Handle input changes to detect prompt picker trigger.
	 * Works with contenteditable div.
	 */
	handleInput(): void {
		const value = this.inputEl.innerText || "";
		
		// Check if the user is typing a prompt command (starts with /)
		if (value.startsWith('/') && !value.includes(' ')) {
			this.show();
			this.update(value);
		} else {
			this.hide();
		}
	}

	/**
	 * Handle keyboard navigation
	 * @param e - The keyboard event
	 * @returns true if the key was handled, false otherwise
	 */
	handleKeyDown(e: KeyboardEvent): boolean {
		if (!this.visible) return false;
		
		if (e.key === "ArrowDown") {
			e.preventDefault();
			this.selectedIndex = Math.min(
				this.selectedIndex + 1,
				this.selectableItems.length - 1
			);
			this.highlightItem();
			return true;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
			this.highlightItem();
			return true;
		}
		if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			this.selectCurrent();
			return true;
		}
		if (e.key === "Escape") {
			e.preventDefault();
			this.hide();
			return true;
		}
		return false;
	}

	/**
	 * Show the prompt picker dropdown
	 */
	show(): void {
		this.visible = true;
		this.selectedIndex = 0;
		this.containerEl.style.display = "block";
	}

	/**
	 * Hide the prompt picker dropdown
	 */
	hide(): void {
		this.visible = false;
		this.containerEl.style.display = "none";
	}

	/**
	 * Update the prompt picker with filtered items matching the query.
	 * Collects built-in commands, prompts, agents, and skills into a unified list.
	 *
	 * @param query - The current input value (including leading /)
	 */
	update(query: string): void {
		// Get the search term (remove the leading /)
		const searchTerm = query.slice(1).toLowerCase();
		
		// Built-in slash commands
		const builtInItems: CachedPromptInfo[] = SLASH_COMMANDS.map(cmd => ({
			name: cmd.name,
			description: cmd.description,
			path: `builtin:${cmd.name}`,
			type: 'command' as SlashMenuItemType,
		}));
		
		// Custom prompts from cache
		const promptItems: CachedPromptInfo[] = this.getPrompts().map(p => ({
			...p,
			type: 'prompt' as SlashMenuItemType,
		}));
		
		// Agents from cache
		const agentItems: CachedPromptInfo[] = this.getAgents().filter(a => a.userInvokable !== false).map(a => ({
			name: a.name,
			description: a.description,
			tools: a.tools,
			path: `agent:${a.name}`,
			type: 'agent' as SlashMenuItemType,
		}));
		
		// Skills from registry
		const skillItems: CachedPromptInfo[] = this.getSkills().map(s => ({
			name: s.name,
			description: s.description,
			path: `skill:${s.name}`,
			type: 'skill' as SlashMenuItemType,
		}));
		
		// Combine all items
		const allItems = [...builtInItems, ...promptItems, ...agentItems, ...skillItems];
		
		// Filter by search term
		this.selectableItems = allItems.filter(p => 
			p.name.toLowerCase().includes(searchTerm) ||
			p.description.toLowerCase().includes(searchTerm)
		);
		
		// Ensure selected index is within bounds
		this.selectedIndex = Math.min(
			this.selectedIndex,
			Math.max(0, this.selectableItems.length - 1)
		);
		
		// Render the picker
		this.render();
	}

	/**
	 * Render the prompt picker dropdown.
	 * Supports two display modes: flat (all items with type badges) and
	 * grouped (items organized under section headers by type).
	 * @internal
	 */
	private render(): void {
		this.containerEl.empty();
		
		if (this.selectableItems.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: "vc-prompt-picker-empty" });
			emptyEl.setText("No commands found");
			return;
		}

		const grouping = this.getGrouping();

		if (grouping === 'grouped') {
			this.renderGrouped();
		} else {
			this.renderFlat();
		}
	}

	/**
	 * Render items in flat mode — all items in one list with type badges
	 * @internal
	 */
	private renderFlat(): void {
		this.selectableItems.forEach((item, index) => {
			this.renderItem(item, index);
		});
	}

	/**
	 * Render items in grouped mode — items organized under section headers
	 * @internal
	 */
	private renderGrouped(): void {
		// Group items by type
		const groups = new Map<SlashMenuItemType, CachedPromptInfo[]>();
		for (const item of this.selectableItems) {
			const type = item.type || 'prompt';
			if (!groups.has(type)) {
				groups.set(type, []);
			}
			groups.get(type)!.push(item);
		}

		// Track the overall selectable index across groups
		let selectableIndex = 0;

		// Render each group in defined order
		for (const groupType of GROUP_ORDER) {
			const groupItems = groups.get(groupType);
			if (!groupItems || groupItems.length === 0) continue;

			// Section header (non-selectable)
			const headerEl = this.containerEl.createDiv({ cls: "vc-prompt-picker-group-header" });
			headerEl.setText(GROUP_HEADERS[groupType]);

			// Render items in this group
			for (const item of groupItems) {
				this.renderItem(item, selectableIndex);
				selectableIndex++;
			}
		}
	}

	/**
	 * Render a single selectable item row with name, type badge, and description
	 *
	 * @param item - The menu item to render
	 * @param index - The selectable index for keyboard navigation
	 * @internal
	 */
	private renderItem(item: CachedPromptInfo, index: number): void {
		const itemEl = this.containerEl.createDiv({ 
			cls: `vc-prompt-picker-item ${index === this.selectedIndex ? 'vc-selected' : ''}`
		});
		// Store the selectable index for keyboard navigation
		itemEl.dataset.selectableIndex = String(index);

		// Left column: name + badge (fixed-width for alignment)
		const leftEl = itemEl.createDiv({ cls: "vc-prompt-picker-left" });

		const nameEl = leftEl.createDiv({ cls: "vc-prompt-picker-name" });
		nameEl.setText(`/${item.name}`);

		// Type badge
		const type = item.type || 'prompt';
		const badgeEl = leftEl.createSpan({ cls: `vc-prompt-picker-badge vc-badge-${type}` });
		badgeEl.setText(TYPE_LABELS[type]);

		// Description (right column, left-aligned)
		const descEl = itemEl.createDiv({ cls: "vc-prompt-picker-desc" });
		descEl.setText(item.description);

		// Click handler
		itemEl.addEventListener("click", () => {
			this.selectedIndex = index;
			this.selectCurrent();
		});

		// Hover handler
		itemEl.addEventListener("mouseenter", () => {
			this.selectedIndex = index;
			this.highlightItem();
		});
	}

	/**
	 * Highlight the currently selected prompt picker item
	 * @internal
	 */
	private highlightItem(): void {
		const items = this.containerEl.querySelectorAll(".vc-prompt-picker-item");
		items.forEach((item) => {
			const el = item as HTMLElement;
			const idx = parseInt(el.dataset.selectableIndex || "-1", 10);
			if (idx === this.selectedIndex) {
				el.addClass("vc-selected");
				// Scroll into view if needed
				el.scrollIntoView({ block: "nearest" });
			} else {
				el.removeClass("vc-selected");
			}
		});
	}

	/**
	 * Select the currently highlighted item from the picker
	 * @internal
	 */
	private async selectCurrent(): Promise<void> {
		const selectedPrompt = this.selectableItems[this.selectedIndex];
		if (!selectedPrompt) {
			this.hide();
			return;
		}
		
		// Hide the picker
		this.hide();
		
		// Set flag to prevent Enter from auto-submitting
		this.justSelected = true;
		
		// Insert the prompt/command name into the input field
		// Replace spaces with hyphens for slash command compatibility
		// User can then add additional content before submitting
		const normalizedName = selectedPrompt.name.replace(/\s+/g, '-');
		this.inputEl.innerText = `/${normalizedName} `;
		this.inputEl.focus();
		
		// Move cursor to end so user can type additional content
		const range = document.createRange();
		range.selectNodeContents(this.inputEl);
		range.collapse(false);
		const sel = window.getSelection();
		if (sel) {
			sel.removeAllRanges();
			sel.addRange(range);
		}
		
		// Trigger input event to update any listeners
		this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
	}
}
