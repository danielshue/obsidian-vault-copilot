/**
 * @module ContextPicker (Basic)
 * @description Context picker for Basic Vault Copilot chat.
 * 
 * This is a standalone version without SkillCache (Pro-only).
 * Basic only supports file attachments, not skills.
 * 
 * @since 0.1.0
 */

import { TFile } from "obsidian";

// Skill stub for Basic (skills are Pro-only)
type CachedSkillInfo = { name: string; description?: string; path?: string };

/**
 * Unified picker item that can be a file or skill
 */
export type PickerItemType = 'file' | 'skill';

export interface PickerItem {
	type: PickerItemType;
	/** Unique identifier - file path or skill path */
	id: string;
	/** Display name */
	name: string;
	/** Secondary info - folder path for files, description for skills */
	secondary: string;
	/** Original file reference (for files) */
	file?: TFile;
	/** Original skill reference (for skills) */
	skill?: CachedSkillInfo;
}

/**
 * Constructor options for the ContextPicker
 */
export interface ContextPickerOptions {
	containerEl: HTMLElement;
	inputEl: HTMLDivElement;
	getFiles: () => TFile[];
	getSkills: () => CachedSkillInfo[];
	onSelectFile: (file: TFile) => void;
	onSelectSkill: (skill: CachedSkillInfo) => void;
}

/**
 * Manages the context picker dropdown UI that appears when user types '#'
 * Allows users to quickly attach notes as context or select skills to execute
 */
export class ContextPicker {
	private containerEl: HTMLElement;
	private inputEl: HTMLDivElement;  // contenteditable div
	private visible = false;
	private selectedIndex = 0;
	private filteredItems: PickerItem[] = [];
	private getFiles: () => TFile[];
	private getSkills: () => CachedSkillInfo[];
	private onSelectFile: (file: TFile) => void;
	private onSelectSkill: (skill: CachedSkillInfo) => void;
	private hashRange: Range | null = null;  // Track the # and query text position

	constructor(options: ContextPickerOptions) {
		this.containerEl = options.containerEl;
		this.inputEl = options.inputEl;
		this.getFiles = options.getFiles;
		this.getSkills = options.getSkills;
		this.onSelectFile = options.onSelectFile;
		this.onSelectSkill = options.onSelectSkill;
	}

	/**
	 * Check if the picker is currently visible
	 */
	isVisible(): boolean {
		return this.visible;
	}

	/**
	 * Handle input changes to detect context picker trigger (#)
	 * Works with contenteditable div
	 */
	handleInput(): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			this.hide();
			return;
		}
		
		const range = selection.getRangeAt(0);
		if (!this.inputEl.contains(range.commonAncestorContainer)) {
			this.hide();
			return;
		}
		
		// Get text before cursor in the current text node
		const node = range.startContainer;
		if (node.nodeType !== Node.TEXT_NODE) {
			this.hide();
			return;
		}
		
		const textBeforeCursor = node.textContent?.slice(0, range.startOffset) || "";
		const hashMatch = textBeforeCursor.match(/(^|\s)#([^\s]*)$/);
		
		if (hashMatch) {
			// Store the range of the # and query for later removal
			const hashIndex = textBeforeCursor.lastIndexOf('#');
			this.hashRange = document.createRange();
			this.hashRange.setStart(node, hashIndex);
			this.hashRange.setEnd(node, range.startOffset);
			
			this.show();
			this.update(hashMatch[2] || ""); // The text after #
		} else {
			this.hashRange = null;
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
				this.filteredItems.length - 1
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
	 * Show the context picker dropdown
	 */
	show(): void {
		this.visible = true;
		this.selectedIndex = 0;
		this.containerEl.style.display = "block";
	}

	/**
	 * Hide the context picker dropdown
	 */
	hide(): void {
		this.visible = false;
		this.containerEl.style.display = "none";
	}

	/**
	 * Update the context picker with filtered files and skills matching the query
	 */
	update(query: string): void {
		const searchTerm = query.toLowerCase();
		this.filteredItems = [];
		
		// Get all markdown files from the vault
		const allFiles = this.getFiles();
		
		// Filter files by search term (match on file name or path)
		// Exclude SKILL.md files as they're shown in the skills section
		const matchedFiles = allFiles.filter(f => 
			!f.path.includes('/SKILL.md') &&
			(f.basename.toLowerCase().includes(searchTerm) ||
			f.path.toLowerCase().includes(searchTerm))
		).slice(0, 8); // Limit to 8 file results
		
		// Convert files to PickerItems
		for (const file of matchedFiles) {
			this.filteredItems.push({
				type: 'file',
				id: file.path,
				name: file.basename,
				secondary: file.parent?.path || "",
				file,
			});
		}
		
		// Get skills and filter
		const allSkills = this.getSkills();
		const matchedSkills = allSkills.filter(s =>
			s.name.toLowerCase().includes(searchTerm) ||
			(s.description?.toLowerCase().includes(searchTerm) ?? false)
		).slice(0, 5); // Limit to 5 skill results
		
		// Convert skills to PickerItems
		for (const skill of matchedSkills) {
			this.filteredItems.push({
				type: 'skill',
				id: skill.path ?? skill.name,
				name: skill.name,
				secondary: skill.description ?? '',
				skill,
			});
		}
		
		// Ensure selected index is within bounds
		this.selectedIndex = Math.min(
			this.selectedIndex,
			Math.max(0, this.filteredItems.length - 1)
		);
		
		// Render the picker
		this.render();
	}

	/**
	 * Render the context picker dropdown with grouped sections
	 */
	private render(): void {
		this.containerEl.empty();
		
		if (this.filteredItems.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: "vc-context-picker-empty" });
			emptyEl.setText("No files or skills found");
			return;
		}
		
		// Group items by type
		const files = this.filteredItems.filter(i => i.type === 'file');
		const skills = this.filteredItems.filter(i => i.type === 'skill');
		
		let itemIndex = 0;
		
		// Render files section
		if (files.length > 0) {
			const headerEl = this.containerEl.createDiv({ cls: "vc-context-picker-header" });
			headerEl.setText("Files");
			
			for (const item of files) {
				this.renderItem(item, itemIndex);
				itemIndex++;
			}
		}
		
		// Render skills section
		if (skills.length > 0) {
			const headerEl = this.containerEl.createDiv({ cls: "vc-context-picker-header" });
			headerEl.setText("Skills");
			
			for (const item of skills) {
				this.renderItem(item, itemIndex);
				itemIndex++;
			}
		}
	}
	
	/**
	 * Render a single picker item
	 */
	private renderItem(item: PickerItem, index: number): void {
		const itemEl = this.containerEl.createDiv({ 
			cls: `vc-context-picker-item ${index === this.selectedIndex ? 'vc-selected' : ''}`
		});
		itemEl.dataset.index = String(index);
		
		// Icon based on type
		const iconEl = itemEl.createDiv({ cls: "vc-context-picker-icon" });
		if (item.type === 'file') {
			// Document icon
			iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
		} else {
			// Lightning/zap icon for skills
			iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
		}
		
		// Name on the left
		const nameEl = itemEl.createDiv({ cls: "vc-context-picker-name" });
		nameEl.setText(item.name);
		
		// Secondary info on the right (path for files, truncated description for skills)
		const secondaryEl = itemEl.createDiv({ cls: "vc-context-picker-path" });
		if (item.type === 'skill') {
			// Truncate description for skills
			const desc = item.secondary.length > 40 
				? item.secondary.slice(0, 40) + "…" 
				: item.secondary;
			secondaryEl.setText(desc);
			secondaryEl.setAttribute("title", item.secondary);
		} else {
			secondaryEl.setText(item.secondary);
		}
		
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
	 * Highlight the currently selected context picker item
	 */
	private highlightItem(): void {
		const items = this.containerEl.querySelectorAll(".vc-context-picker-item");
		items.forEach((item, index) => {
			if (index === this.selectedIndex) {
				item.addClass("vc-selected");
				(item as HTMLElement).scrollIntoView({ block: "nearest" });
			} else {
				item.removeClass("vc-selected");
			}
		});
	}

	/**
	 * Select the currently highlighted item from the context picker
	 * Calls appropriate callback and removes the #query text
	 */
	private selectCurrent(): void {
		const selectedItem = this.filteredItems[this.selectedIndex];
		if (!selectedItem) {
			this.hide();
			return;
		}
		
		// Hide the picker
		this.hide();
		
		// Remove the #query text from contenteditable using stored range
		if (this.hashRange) {
			const selection = window.getSelection();
			if (selection) {
				// Delete the # and query text
				this.hashRange.deleteContents();
				
				// Place cursor at the deletion point
				selection.removeAllRanges();
				selection.addRange(this.hashRange);
			}
			this.hashRange = null;
		}
		
		// Call appropriate callback based on item type
		if (selectedItem.type === 'file' && selectedItem.file) {
			this.onSelectFile(selectedItem.file);
		} else if (selectedItem.type === 'skill' && selectedItem.skill) {
			this.onSelectSkill(selectedItem.skill);
		}
		
		this.inputEl.focus();
	}
}
