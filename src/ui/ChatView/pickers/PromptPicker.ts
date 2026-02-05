import { CachedPromptInfo } from "../../../copilot/customization/PromptCache";
import { SLASH_COMMANDS, SlashCommand } from "../SlashCommands";

/**
 * Manages the prompt picker dropdown UI that appears when user types '/'
 */
export class PromptPicker {
	private containerEl: HTMLElement;
	private inputEl: HTMLDivElement;  // contenteditable div
	private visible = false;
	private selectedIndex = 0;
	private filteredPrompts: CachedPromptInfo[] = [];
	private onSelect: (prompt: CachedPromptInfo) => Promise<void>;
	private getPrompts: () => CachedPromptInfo[];
	private justSelected = false;  // Flag to prevent Enter auto-submit after selection

	constructor(options: {
		containerEl: HTMLElement;
		inputEl: HTMLDivElement;
		getPrompts: () => CachedPromptInfo[];
		onSelect: (prompt: CachedPromptInfo) => Promise<void>;
	}) {
		this.containerEl = options.containerEl;
		this.inputEl = options.inputEl;
		this.getPrompts = options.getPrompts;
		this.onSelect = options.onSelect;
	}

	/**
	 * Check if the picker is currently visible
	 */
	isVisible(): boolean {
		return this.visible;
	}

	/**
	 * Check if a selection just happened (and clear the flag)
	 * Used to prevent Enter from auto-submitting right after selection
	 */
	checkAndClearJustSelected(): boolean {
		if (this.justSelected) {
			this.justSelected = false;
			return true;
		}
		return false;
	}

	/**
	 * Handle input changes to detect prompt picker trigger
	 * Works with contenteditable div
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
	 * @returns true if the key was handled, false otherwise
	 */
	handleKeyDown(e: KeyboardEvent): boolean {
		if (!this.visible) return false;
		
		if (e.key === "ArrowDown") {
			e.preventDefault();
			this.selectedIndex = Math.min(
				this.selectedIndex + 1,
				this.filteredPrompts.length - 1
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
	 * Update the prompt picker with filtered prompts matching the query
	 */
	update(query: string): void {
		// Get the search term (remove the leading /)
		const searchTerm = query.slice(1).toLowerCase();
		
		// Get prompts from cache
		const allPrompts = this.getPrompts();
		
		// Also include built-in slash commands as "prompts"
		const builtInItems: CachedPromptInfo[] = SLASH_COMMANDS.map(cmd => ({
			name: cmd.name,
			description: cmd.description,
			path: `builtin:${cmd.name}`,
		}));
		
		// Combine and filter
		const allItems = [...builtInItems, ...allPrompts];
		this.filteredPrompts = allItems.filter(p => 
			p.name.toLowerCase().includes(searchTerm) ||
			p.description.toLowerCase().includes(searchTerm)
		);
		
		// Ensure selected index is within bounds
		this.selectedIndex = Math.min(
			this.selectedIndex,
			Math.max(0, this.filteredPrompts.length - 1)
		);
		
		// Render the picker
		this.render();
	}

	/**
	 * Render the prompt picker dropdown
	 */
	private render(): void {
		this.containerEl.empty();
		
		if (this.filteredPrompts.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: "vc-prompt-picker-empty" });
			emptyEl.setText("No prompts found");
			return;
		}
		
		// Add items (VS Code style: command on left, description on right)
		this.filteredPrompts.forEach((prompt, index) => {
			const itemEl = this.containerEl.createDiv({ 
				cls: `vc-prompt-picker-item ${index === this.selectedIndex ? 'vc-selected' : ''}`
			});
			
			// Command name on the left
			const nameEl = itemEl.createDiv({ cls: "vc-prompt-picker-name" });
			nameEl.setText(`/${prompt.name}`);
			
			// Description on the right
			const descEl = itemEl.createDiv({ cls: "vc-prompt-picker-desc" });
			descEl.setText(prompt.description);
			
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
		});
	}

	/**
	 * Highlight the currently selected prompt picker item
	 */
	private highlightItem(): void {
		const items = this.containerEl.querySelectorAll(".vc-prompt-picker-item");
		items.forEach((item, index) => {
			if (index === this.selectedIndex) {
				item.addClass("vc-selected");
				// Scroll into view if needed
				(item as HTMLElement).scrollIntoView({ block: "nearest" });
			} else {
				item.removeClass("vc-selected");
			}
		});
	}

	/**
	 * Select the currently highlighted prompt from the picker
	 */
	private async selectCurrent(): Promise<void> {
		const selectedPrompt = this.filteredPrompts[this.selectedIndex];
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
