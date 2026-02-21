/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AgentCache
 * @description Caches custom agents from configured directories for fast access.
 *
 * Loads agents on startup and keeps the cache in sync with vault file changes
 * for `.agent.md` files.
 *
 * @example
 * ```typescript
 * const cache = new AgentCache(app);
 * await cache.initialize(["Reference/Agents", "~/.copilot/agents"]);
 * const agents = cache.getAgents();
 * ```
 *
 * @see {@link CustomizationLoader} for underlying file parsing
 * @since 0.0.28
 */

import { App, TFile, TAbstractFile, EventRef } from "obsidian";
import { CustomizationLoader, CustomAgent, AgentHandoff, parseFrontmatter } from "./CustomizationLoader";

/**
 * Lightweight agent info for caching (excludes the full instructions)
 */
export interface CachedAgentInfo {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Human-readable description */
	description: string;
	/** Tools the agent can use */
	tools?: string[];
	/** Optional model preference */
	model?: string | string[];
	/** Handoff definitions for transitioning to other agents */
	handoffs?: AgentHandoff[];
	/** Whether this agent appears in user-facing menus (default: true) */
	userInvokable?: boolean;
	/** Optional hint text shown in the chat input when this agent is invoked */
	argumentHint?: string;
	/** Full path to the agent file */
	path: string;
}

/**
 * Event types for agent cache changes
 */
export type AgentCacheEvent = 
	| { type: 'loaded'; agents: CachedAgentInfo[] }
	| { type: 'added'; agent: CachedAgentInfo }
	| { type: 'updated'; agent: CachedAgentInfo }
	| { type: 'removed'; path: string };

/**
 * Listener callback for cache changes
 */
export type AgentCacheListener = (event: AgentCacheEvent) => void;

/**
 * AgentCache manages a cached list of available agents for quick access.
 * It loads agents on initialization and watches for file changes in agent directories.
 *
 * @see {@link PromptCache} for prompt caching counterpart
 * @see {@link SkillCache} for skill caching counterpart
 */
export class AgentCache {
	/** Obsidian app instance. @internal */
	private app: App;
	/** Loader for parsing agent files. @internal */
	private loader: CustomizationLoader;
	/** Path-indexed cache of lightweight agent metadata. @internal */
	private cachedAgents: Map<string, CachedAgentInfo> = new Map();
	/** Configured agent directories to scan. @internal */
	private agentDirectories: string[] = [];
	/** Cache-change event listeners. @internal */
	private listeners: Set<AgentCacheListener> = new Set();
	/** Vault file watcher reference for modify events. @internal */
	private fileWatcherRef: EventRef | null = null;
	/** Guard to prevent overlapping refreshes. @internal */
	private isLoading = false;

	/**
	 * Create a new agent cache.
	 *
	 * @param app - Obsidian app instance
	 *
	 * @example
	 * ```typescript
	 * const cache = new AgentCache(app);
	 * ```
	 */
	constructor(app: App) {
		this.app = app;
		this.loader = new CustomizationLoader(app);
	}

	/**
	 * Initialize the cache by loading agents from the given directories.
	 * Call this when the plugin loads.
	 *
	 * @param directories - Directory paths to scan for `.agent.md` files
	 * @returns Resolves when initial cache load and watchers are set up
	 *
	 * @example
	 * ```typescript
	 * await cache.initialize(["Reference/Agents"]);
	 * ```
	 */
	async initialize(directories: string[]): Promise<void> {
		this.agentDirectories = directories;
		await this.refreshCache();
		this.setupFileWatcher();
	}

	/**
	 * Update the agent directories and refresh the cache.
	 * Call this when the user changes the agent directory settings.
	 *
	 * @param directories - New directories to monitor for agent files
	 * @returns Resolves after refresh when directories changed
	 */
	async updateDirectories(directories: string[]): Promise<void> {
		// Normalize paths for comparison (trim whitespace, normalize slashes)
		const normalize = (paths: string[]) => paths.map(p => p.trim().replace(/\\/g, '/'));
		const normalizedNew = normalize(directories);
		const normalizedOld = normalize(this.agentDirectories);
		
		const changed = JSON.stringify(normalizedNew) !== JSON.stringify(normalizedOld);
		
		console.log(`[VC] Agent directories update - changed: ${changed}`, { 
			old: this.agentDirectories, 
			new: directories 
		});
		
		this.agentDirectories = directories;
		
		if (changed) {
			await this.refreshCache();
		}
	}

	/**
	 * Refresh the cache by reloading all agents from the configured directories.
	 *
	 * @returns Resolves when cache refresh completes
	 */
	async refreshCache(): Promise<void> {
		if (this.isLoading) return;
		
		this.isLoading = true;
		try {
			const agents = await this.loader.loadAgents(this.agentDirectories);
			
			this.cachedAgents.clear();
			for (const agent of agents) {
				this.cachedAgents.set(agent.path, {
					name: agent.name,
					description: agent.description,
					tools: agent.tools,
					model: agent.model,
					handoffs: agent.handoffs,
					userInvokable: agent.userInvokable,
					argumentHint: agent.argumentHint,
					path: agent.path,
				});
			}
			
			this.notifyListeners({ type: 'loaded', agents: this.getAgents() });
			console.log(`[VC] Agent cache refreshed: ${this.cachedAgents.size} agents loaded`);
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * Get all cached agents.
	 *
	 * @returns Array of cached agent metadata
	 */
	getAgents(): CachedAgentInfo[] {
		return Array.from(this.cachedAgents.values());
	}

	/**
	 * Get a cached agent by name.
	 *
	 * @param name - Agent name to find
	 * @returns Matching cached agent or `undefined`
	 */
	getAgentByName(name: string): CachedAgentInfo | undefined {
		for (const agent of this.cachedAgents.values()) {
			if (agent.name === name) {
				return agent;
			}
		}
		return undefined;
	}

	/**
	 * Get a cached agent by path.
	 *
	 * @param path - Full path to the agent file
	 * @returns Matching cached agent or `undefined`
	 */
	getAgentByPath(path: string): CachedAgentInfo | undefined {
		return this.cachedAgents.get(path);
	}

	/**
	 * Load the full agent details (including instructions) for a specific agent.
	 *
	 * @param name - Agent name
	 * @returns Parsed full agent definition or `undefined`
	 */
	async getFullAgent(name: string): Promise<CustomAgent | undefined> {
		return await this.loader.getAgent(this.agentDirectories, name);
	}

	/**
	 * Check if there are any cached agents.
	 *
	 * @returns `true` when at least one agent is cached
	 */
	hasAgents(): boolean {
		return this.cachedAgents.size > 0;
	}

	/**
	 * Get the number of cached agents.
	 *
	 * @returns Number of cached agents
	 */
	get count(): number {
		return this.cachedAgents.size;
	}

	/**
	 * Subscribe to cache change events.
	 * Returns an unsubscribe function.
	 *
	 * @param listener - Callback invoked on cache updates
	 * @returns Unsubscribe function
	 */
	onCacheChange(listener: AgentCacheListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Clean up resources when the plugin unloads.
	 *
	 * @returns Nothing
	 */
	destroy(): void {
		if (this.fileWatcherRef) {
			this.app.vault.offref(this.fileWatcherRef);
			this.fileWatcherRef = null;
		}
		this.listeners.clear();
		this.cachedAgents.clear();
	}

	/**
	 * Set up file watchers for agent directories to detect changes.
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
	 *
	 * @param file - Changed vault file
	 * @param eventType - Type of file event
	 * @returns Resolves when cache update handling completes
	 * @internal
	 */
	private async handleFileChange(file: TAbstractFile, eventType: 'create' | 'modify' | 'delete'): Promise<void> {
		if (!(file instanceof TFile)) return;
		if (!this.isAgentFile(file.path)) return;

		console.log(`[VC] Agent file ${eventType}: ${file.path}`);

		if (eventType === 'delete') {
			if (this.cachedAgents.has(file.path)) {
				this.cachedAgents.delete(file.path);
				this.notifyListeners({ type: 'removed', path: file.path });
			}
			return;
		}

		// For create or modify, load/reload the agent
		try {
			const content = await this.app.vault.read(file);
			const agent = this.parseAgentFile(file.path, content);
			
			if (agent) {
				const isNew = !this.cachedAgents.has(file.path);
				this.cachedAgents.set(file.path, agent);
				this.notifyListeners({ 
					type: isNew ? 'added' : 'updated', 
					agent 
				});
			}
		} catch (error) {
			console.error(`[VC] Failed to process agent file ${file.path}:`, error);
		}
	}

	/**
	 * Handle file rename events.
	 *
	 * @param file - Renamed file
	 * @param oldPath - Previous file path
	 * @returns Resolves when rename handling completes
	 * @internal
	 */
	private async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
		// Check if the old path was an agent file
		if (this.cachedAgents.has(oldPath)) {
			this.cachedAgents.delete(oldPath);
			this.notifyListeners({ type: 'removed', path: oldPath });
		}

		// Check if the new path is an agent file
		if (file instanceof TFile && this.isAgentFile(file.path)) {
			await this.handleFileChange(file, 'create');
		}
	}

	/**
	 * Check if a file path is within one of the agent directories and is an .agent.md file.
	 *
	 * @param filePath - File path to test
	 * @returns `true` when file should be handled as an agent definition
	 * @internal
	 */
	private isAgentFile(filePath: string): boolean {
		if (!filePath.endsWith('.agent.md')) return false;
		
		for (const dir of this.agentDirectories) {
			if (filePath.startsWith(dir + '/') || filePath === dir) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Parse an agent file and extract the cached info.
	 * Uses the shared parseFrontmatter/parseYamlKeyValues for consistency.
	 *
	 * @param path - Agent file path
	 * @param content - Agent file content
	 * @returns Parsed cached agent info or `null` when required fields are missing
	 * @internal
	 */
	private parseAgentFile(path: string, content: string): CachedAgentInfo | null {
		const { frontmatter } = parseFrontmatter(content);

		if (!frontmatter.name || !frontmatter.description) return null;

		// Parse handoffs (array of objects)
		let handoffs: AgentHandoff[] | undefined;
		if (Array.isArray(frontmatter.handoffs)) {
			handoffs = (frontmatter.handoffs as Record<string, unknown>[])
				.filter(h => typeof h === 'object' && h !== null && h.label && h.agent)
				.map(h => ({
					label: String(h.label),
					agent: String(h.agent),
					prompt: h.prompt ? String(h.prompt) : undefined,
					send: typeof h.send === 'boolean' ? h.send : false,
					model: h.model ? String(h.model) : undefined,
				}));
			if (handoffs.length === 0) handoffs = undefined;
		}

		// Parse model
		let model: string | string[] | undefined;
		if (Array.isArray(frontmatter.model)) {
			model = frontmatter.model.map(String);
		} else if (frontmatter.model) {
			model = String(frontmatter.model);
		}

		return {
			name: String(frontmatter.name),
			description: String(frontmatter.description),
			tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
			model,
			handoffs,
			userInvokable: (() => { const v = frontmatter['user-invokable'] ?? frontmatter.userInvokable; return typeof v === 'boolean' ? v : undefined; })(),
			argumentHint: frontmatter['argument-hint'] ? String(frontmatter['argument-hint']) : (frontmatter.argumentHint ? String(frontmatter.argumentHint) : undefined),
			path,
		};
	}

	/**
	 * Notify all listeners of a cache change event.
	 *
	 * @param event - Cache change event payload
	 * @returns Nothing
	 * @internal
	 */
	private notifyListeners(event: AgentCacheEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('[VC] Error in agent cache listener:', error);
			}
		}
	}
}
