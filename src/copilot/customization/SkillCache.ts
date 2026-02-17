/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SkillCache
 * @description Caches custom skills from configured directories for fast access.
 * Loads skills on startup and watches for changes to skill directories.
 * Works alongside SkillRegistry — this cache handles file-based skills (.SKILL.md),
 * while SkillRegistry handles runtime-registered skills from other plugins.
 *
 * @example
 * ```typescript
 * const cache = new SkillCache(app);
 * await cache.initialize(['Reference/Skills', '~/.copilot/skills']);
 * const skills = cache.getSkills(); // CachedSkillInfo[]
 * ```
 *
 * @see {@link SkillRegistry} for runtime-registered skills
 * @see {@link AgentCache} for the equivalent agent caching
 * @see {@link PromptCache} for the equivalent prompt caching
 * @since 0.0.28
 */

import { App, TFile, TFolder, TAbstractFile, EventRef } from "obsidian";
import { CustomizationLoader, CustomSkill, parseFrontmatter } from "./CustomizationLoader";

/**
 * Lightweight skill info for caching (excludes the full instructions)
 *
 * @example
 * ```typescript
 * const skill: CachedSkillInfo = {
 *   name: "json-canvas",
 *   description: "Create and edit JSON Canvas files",
 *   path: "Reference/Skills/json-canvas",
 * };
 * ```
 */
export interface CachedSkillInfo {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Description of when to use the skill */
	description: string;
	/** Optional license */
	license?: string;
	/** Whether this skill appears in user-facing slash menus (default: true) */
	userInvokable?: boolean;
	/** When true, prevents model from auto-activating this skill (default: false) */
	disableModelInvocation?: boolean;
	/** Optional hint text shown in the chat input when this skill is invoked */
	argumentHint?: string;
	/** Full path to the skill directory */
	path: string;
}

/**
 * Event types for skill cache changes
 */
export type SkillCacheEvent =
	| { type: 'loaded'; skills: CachedSkillInfo[] }
	| { type: 'added'; skill: CachedSkillInfo }
	| { type: 'updated'; skill: CachedSkillInfo }
	| { type: 'removed'; path: string };

/**
 * Listener callback for cache changes
 */
export type SkillCacheListener = (event: SkillCacheEvent) => void;

/**
 * SkillCache manages a cached list of available file-based skills for quick access.
 * It loads skills on initialization and watches for file changes in skill directories.
 *
 * Skills are expected in subdirectories containing a SKILL.md file:
 * ```
 * <skill-directory>/
 *   <skill-name>/
 *     SKILL.md
 * ```
 *
 * @see {@link SkillRegistry} for runtime-registered skills from other plugins
 */
export class SkillCache {
	private app: App;
	private loader: CustomizationLoader;
	private cachedSkills: Map<string, CachedSkillInfo> = new Map();
	private skillDirectories: string[] = [];
	private listeners: Set<SkillCacheListener> = new Set();
	private fileWatcherRef: EventRef | null = null;
	private isLoading = false;

	constructor(app: App) {
		this.app = app;
		this.loader = new CustomizationLoader(app);
	}

	/**
	 * Initialize the cache by loading skills from the given directories.
	 * Call this when the plugin loads.
	 *
	 * @param directories - Array of vault-relative or absolute paths to scan
	 */
	async initialize(directories: string[]): Promise<void> {
		this.skillDirectories = directories;
		await this.refreshCache();
		this.setupFileWatcher();
	}

	/**
	 * Update the skill directories and refresh the cache.
	 * Call this when the user changes the skill directory settings.
	 *
	 * @param directories - New array of directories to scan
	 */
	async updateDirectories(directories: string[]): Promise<void> {
		// Normalize paths for comparison (trim whitespace, normalize slashes)
		const normalize = (paths: string[]) => paths.map(p => p.trim().replace(/\\/g, '/'));
		const normalizedNew = normalize(directories);
		const normalizedOld = normalize(this.skillDirectories);

		const changed = JSON.stringify(normalizedNew) !== JSON.stringify(normalizedOld);

		console.log(`[VC] Skill directories update - changed: ${changed}`, {
			old: this.skillDirectories,
			new: directories
		});

		this.skillDirectories = directories;

		if (changed) {
			await this.refreshCache();
		}
	}

	/**
	 * Refresh the cache by reloading all skills from the configured directories.
	 */
	async refreshCache(): Promise<void> {
		if (this.isLoading) return;

		this.isLoading = true;
		try {
			const skills = await this.loader.loadSkills(this.skillDirectories);

			this.cachedSkills.clear();
			for (const skill of skills) {
				this.cachedSkills.set(skill.path, {
					name: skill.name,
					description: skill.description,
					license: skill.license,
					userInvokable: skill.userInvokable,
					disableModelInvocation: skill.disableModelInvocation,
					argumentHint: skill.argumentHint,
					path: skill.path,
				});
			}

			this.notifyListeners({ type: 'loaded', skills: this.getSkills() });
			console.log(`[VC] Skill cache refreshed: ${this.cachedSkills.size} skills loaded`);
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * Get all cached skills.
	 *
	 * @returns Array of cached skill info objects
	 */
	getSkills(): CachedSkillInfo[] {
		return Array.from(this.cachedSkills.values());
	}

	/**
	 * Get a cached skill by name.
	 *
	 * @param name - The skill name to look up
	 * @returns The cached skill info, or undefined if not found
	 */
	getSkillByName(name: string): CachedSkillInfo | undefined {
		for (const skill of this.cachedSkills.values()) {
			if (skill.name === name) {
				return skill;
			}
		}
		return undefined;
	}

	/**
	 * Get a cached skill by path.
	 *
	 * @param path - The full path to the skill directory
	 * @returns The cached skill info, or undefined if not found
	 */
	getSkillByPath(path: string): CachedSkillInfo | undefined {
		return this.cachedSkills.get(path);
	}

	/**
	 * Load the full skill details (including instructions) for a specific skill.
	 *
	 * @param name - The skill name to load
	 * @returns The full CustomSkill with instructions, or undefined
	 */
	async getFullSkill(name: string): Promise<CustomSkill | undefined> {
		const skills = await this.loader.loadSkills(this.skillDirectories);
		return skills.find(s => s.name === name);
	}

	/**
	 * Check if there are any cached skills.
	 */
	hasSkills(): boolean {
		return this.cachedSkills.size > 0;
	}

	/**
	 * Get the number of cached skills.
	 */
	get count(): number {
		return this.cachedSkills.size;
	}

	/**
	 * Subscribe to cache change events.
	 * Returns an unsubscribe function.
	 *
	 * @param listener - Callback for cache change events
	 * @returns Unsubscribe function
	 */
	onCacheChange(listener: SkillCacheListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Clean up resources when the plugin unloads.
	 */
	destroy(): void {
		if (this.fileWatcherRef) {
			this.app.vault.offref(this.fileWatcherRef);
			this.fileWatcherRef = null;
		}
		this.listeners.clear();
		this.cachedSkills.clear();
	}

	/**
	 * Set up file watchers for skill directories to detect changes.
	 * Only watches vault-internal paths (external paths require manual refresh).
	 * @internal
	 */
	private setupFileWatcher(): void {
		// Clean up existing watcher
		if (this.fileWatcherRef) {
			this.app.vault.offref(this.fileWatcherRef);
		}

		// Watch for file changes
		this.fileWatcherRef = this.app.vault.on('modify', (file) => {
			this.handleFileChange(file, 'modify');
		});

		// Also watch for create/delete/rename
		this.app.vault.on('create', (file) => {
			this.handleFileChange(file, 'create');
		});

		this.app.vault.on('delete', (file) => {
			this.handleFileChange(file, 'delete');
		});

		this.app.vault.on('rename', (file, oldPath) => {
			this.handleFileRename(file, oldPath);
		});
	}

	/**
	 * Handle file change events (create, modify, delete).
	 * @internal
	 */
	private async handleFileChange(file: TAbstractFile, eventType: 'create' | 'modify' | 'delete'): Promise<void> {
		if (!(file instanceof TFile)) return;
		if (!this.isSkillFile(file.path)) return;

		console.log(`[VC] Skill file ${eventType}: ${file.path}`);

		if (eventType === 'delete') {
			// Skill path is the parent directory
			const skillPath = file.path.replace(/\/SKILL\.md$/, '');
			if (this.cachedSkills.has(skillPath)) {
				this.cachedSkills.delete(skillPath);
				this.notifyListeners({ type: 'removed', path: skillPath });
			}
			return;
		}

		// For create or modify, load/reload the skill
		try {
			const content = await this.app.vault.read(file);
			const skillPath = file.path.replace(/\/SKILL\.md$/, '');
			const skill = this.parseSkillFile(skillPath, content);

			if (skill) {
				const isNew = !this.cachedSkills.has(skillPath);
				this.cachedSkills.set(skillPath, skill);
				this.notifyListeners({
					type: isNew ? 'added' : 'updated',
					skill
				});
			}
		} catch (error) {
			console.error(`[VC] Failed to process skill file ${file.path}:`, error);
		}
	}

	/**
	 * Handle file rename events.
	 * @internal
	 */
	private async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
		// Check if the old path was a skill file
		const oldSkillPath = oldPath.replace(/\/SKILL\.md$/, '');
		if (this.cachedSkills.has(oldSkillPath)) {
			this.cachedSkills.delete(oldSkillPath);
			this.notifyListeners({ type: 'removed', path: oldSkillPath });
		}

		// Check if the new path is a skill file
		if (file instanceof TFile && this.isSkillFile(file.path)) {
			await this.handleFileChange(file, 'create');
		}
	}

	/**
	 * Check if a file path is a SKILL.md within one of the skill directories.
	 * @internal
	 */
	private isSkillFile(filePath: string): boolean {
		if (!filePath.endsWith('SKILL.md')) return false;

		for (const dir of this.skillDirectories) {
			if (filePath.startsWith(dir + '/') || filePath === dir) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Parse a SKILL.md file and extract the cached info.
	 * Uses the shared parseFrontmatter from CustomizationLoader.
	 * @internal
	 */
	private parseSkillFile(path: string, content: string): CachedSkillInfo | null {
		// Try parsing as code block first (```skill ... ```)
		const codeBlockMatch = content.trim().match(/^```skill\r?\n([\s\S]*?)\r?\n```\s*$/);
		let frontmatter: Record<string, unknown>;

		if (codeBlockMatch) {
			const blockContent = codeBlockMatch[1] || '';
			const parsed = parseFrontmatter(blockContent);
			frontmatter = parsed.frontmatter;
		} else {
			const parsed = parseFrontmatter(content);
			frontmatter = parsed.frontmatter;
		}

		if (!frontmatter.name || !frontmatter.description) return null;

		return {
			name: String(frontmatter.name),
			description: String(frontmatter.description),
			license: frontmatter.license ? String(frontmatter.license) : undefined,
			path,
		};
	}

	/**
	 * Notify all listeners of a cache change event.
	 * @internal
	 */
	private notifyListeners(event: SkillCacheEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('[VC] Error in skill cache listener:', error);
			}
		}
	}
}
