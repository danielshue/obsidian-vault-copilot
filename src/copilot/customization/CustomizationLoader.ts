/**
 * CustomizationLoader - Loads and parses custom agents, skills, instructions, and prompts
 * from configured directories in the vault.
 * 
 * File formats:
 * - Agents: *.agent.md with frontmatter (name, description, tools)
 * - Skills: <skill-name>/SKILL.md - each skill is a folder containing a SKILL.md file
 *           The SKILL.md can use either:
 *           1. Standard frontmatter at the top
 *           2. A ```skill code block with frontmatter inside
 *           Alternatively, <skill-name>/skill.json (SDK-native format) is also recognized.
 *           skill.json uses: { name, displayName, description, version, author, prompts[], tools[] }
 * - Instructions: *.instructions.md, copilot-instructions.md, or AGENTS.md with optional frontmatter (applyTo)
 * - Prompts: *.prompt.md with frontmatter (name, description, tools, model)
 *
 * **Dual-loading note**: When the GitHub Copilot provider is active, skill directories are
 * also passed to the SDK via `createSession({ skillDirectories })`. The SDK loads its own
 * `skill.json` files natively. This loader independently loads both SKILL.md and skill.json
 * files so that non-SDK providers (OpenAI, Azure OpenAI) also benefit from skill discovery.
 * Duplicate skill names from both loaders are deduplicated by SkillCache.
 */

import { App, TFile, TFolder, FileSystemAdapter } from "obsidian";
import { normalizeVaultPath, isVaultRoot, toVaultRelativePath, expandHomePath } from "../../utils/pathUtils";
import { isDesktop } from "../../utils/platform";

/**
 * Handoff definition for transitioning between agents.
 * When present, handoff buttons render after an assistant response completes,
 * letting the user switch to another agent with context and an optional prompt.
 *
 * @example
 * ```yaml
 * handoffs:
 *   - label: Start Implementation
 *     agent: implementation
 *     prompt: Now implement the plan outlined above.
 *     send: false
 *     model: GPT-5.2
 * ```
 *
 * @see {@link CustomAgent} for the agent definition that contains handoffs
 * @since 0.0.26
 */
export interface AgentHandoff {
	/** Display text shown on the handoff button */
	label: string;
	/** Target agent name to switch to */
	agent: string;
	/** Optional prompt text to send to the target agent */
	prompt?: string;
	/** When true, the prompt auto-submits on handoff (default: false) */
	send?: boolean;
	/** Optional model override for the target agent */
	model?: string;
}

/**
 * Parsed agent from .agent.md file
 */
export interface CustomAgent {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Human-readable description */
	description: string;
	/** Tools the agent can use */
	tools?: string[];
	/** Optional model preference (single or prioritized list) */
	model?: string | string[];
	/** Optional hint text shown in the chat input when this agent is active */
	argumentHint?: string;
	/** Description used by other agents to determine when to hand off to this one */
	handoffDescription?: string;
	/** Handoff definitions for transitioning to other agents */
	handoffs?: AgentHandoff[];
	/** Whether this agent appears in user-facing menus (default: true) */
	userInvokable?: boolean;
	/** Full path to the agent file */
	path: string;
	/** Raw content of the agent file (without frontmatter) */
	instructions: string;
}

/**
 * A resource file discovered within a skill directory.
 * Resources are companion files (scripts, examples, templates, references)
 * that the AI can access on-demand via the read_skill_resource tool.
 *
 * @example
 * ```typescript
 * const resource: SkillResource = {
 *   relativePath: "scripts/helper.js",
 *   name: "helper.js",
 *   type: "script",
 * };
 * ```
 *
 * @since 0.1.1
 */
export interface SkillResource {
	/** Path relative to the skill directory (e.g., "scripts/helper.js") */
	relativePath: string;
	/** File name portion (e.g., "helper.js") */
	name: string;
	/** Resource type inferred from parent subdirectory */
	type: 'script' | 'reference' | 'asset' | 'template' | 'example' | 'other';
}

/**
 * Parsed skill from SKILL.md file
 */
export interface CustomSkill {
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
	/** Raw content of the skill file (without frontmatter) */
	instructions: string;
	/** Discovered resource files in the skill directory (Level 3) */
	resources?: SkillResource[];
}

/**
 * Parsed instruction from .instructions.md file
 */
export interface CustomInstruction {
	/** File name without extension */
	name: string;
	/** Optional path pattern for when to apply */
	applyTo?: string;
	/** Full path to the instruction file */
	path: string;
	/** Raw content of the instruction file (without frontmatter) */
	content: string;
}

/**
 * Parsed prompt from .prompt.md file (VS Code compatible)
 */
export interface CustomPrompt {
	/** Unique identifier from frontmatter name field or filename */
	name: string;
	/** Human-readable description */
	description: string;
	/** Optional tools the prompt can use */
	tools?: string[];
	/** Optional model override for this prompt */
	model?: string;
	/** Optional agent to use when running the prompt */
	agent?: string;
	/** Optional hint text shown in the chat input field */
	argumentHint?: string;
	/** Optional timeout in seconds for this prompt (overrides default) */
	timeout?: number;
	/** Full path to the prompt file */
	path: string;
	/** The prompt template content (without frontmatter) */
	content: string;
}

/**
 * Voice agent definition from .voice-agent.md file
 * Used for realtime voice agents with handoff support
 */
export interface VoiceAgentDefinition {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Human-readable description */
	description: string;
	/** Description for when other agents should hand off to this one */
	handoffDescription: string;
	/** Voice to use (alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse) */
	voice?: string;
	/** Tools this agent can use */
	tools: string[];
	/** Names of other voice agents this agent can hand off to */
	handoffs: string[];
	/** Full path to the voice agent file */
	path: string;
	/** Raw instructions content (without frontmatter) */
	instructions: string;
}

/**
 * Simple YAML key-value parser.
 * Supports:
 * - Inline arrays: `tools: ["read", "search"]` or `tools: ['read', 'search']`
 * - Block arrays: `tools:\n  - read\n  - search`
 * - Block arrays of objects: `handoffs:\n  - label: Go\n    agent: impl`
 * - Quoted strings (single or double)
 * - Numeric values (integer and float)
 * - Boolean values (true/false)
 *
 * @param yamlStr - Raw YAML string (without --- delimiters)
 * @returns Parsed key-value record
 * @internal
 */
export function parseYamlKeyValues(yamlStr: string): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};
	const lines = yamlStr.split(/\r?\n/);
	
	let currentKey: string | null = null;
	let currentArray: unknown[] | null = null;
	/** When inside a `- key: val` block, accumulates the current object */
	let currentObj: Record<string, unknown> | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		// --- Detect a YAML block array item starting with "  - " ---
		const arrayItemMatch = line.match(/^(\s+)-\s+(.*)$/);
		if (arrayItemMatch && currentKey) {
			const rawValue = arrayItemMatch[2]!.trim();

			// Check if this array item is a key-value pair (object item)
			const kvMatch = rawValue.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
			if (kvMatch) {
				// Flush any previous object in the array
				if (currentObj) {
					if (!currentArray) currentArray = [];
					currentArray.push(currentObj);
				}
				currentObj = {};
				currentObj[kvMatch[1]!] = parseScalarValue(kvMatch[2]!.trim());
			} else {
				// Simple scalar array item — flush any pending object first
				if (currentObj) {
					if (!currentArray) currentArray = [];
					currentArray.push(currentObj);
					currentObj = null;
				}
				if (!currentArray) currentArray = [];
				let itemValue = rawValue;
				// Strip quotes
				if ((itemValue.startsWith('"') && itemValue.endsWith('"')) || (itemValue.startsWith("'") && itemValue.endsWith("'"))) {
					itemValue = itemValue.slice(1, -1);
				}
				currentArray.push(itemValue);
			}
			continue;
		}

		// --- Continuation keys inside object items (indented key: value without leading -) ---
		if (currentKey && currentObj && line.match(/^\s{4,}[A-Za-z_]/)) {
			const kvMatch = line.trim().match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
			if (kvMatch) {
				currentObj[kvMatch[1]!] = parseScalarValue(kvMatch[2]!.trim());
				continue;
			}
		}

		// --- If we hit a non-indented line, flush any pending array/object ---
		if (currentKey && (currentArray || currentObj)) {
			if (currentObj) {
				if (!currentArray) currentArray = [];
				currentArray.push(currentObj);
				currentObj = null;
			}
			if (currentArray) {
				frontmatter[currentKey] = currentArray;
			}
			currentKey = null;
			currentArray = null;
		}

		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		// Skip indented lines that happen to contain colons (not top-level keys)
		if (key !== line.slice(0, colonIndex) && line.match(/^\s/)) continue;
		
		let value: unknown = line.slice(colonIndex + 1).trim();

		// Empty value after colon — may be followed by block array items
		if (value === '') {
			currentKey = key;
			currentArray = null;
			currentObj = null;
			continue;
		}

		value = parseScalarValue(value as string);

		currentKey = key;
		currentArray = null;
		currentObj = null;
		frontmatter[key] = value;
	}
	
	// Flush any trailing array/object
	if (currentKey && (currentArray || currentObj)) {
		if (currentObj) {
			if (!currentArray) currentArray = [];
			currentArray.push(currentObj);
		}
		if (currentArray) {
			frontmatter[currentKey] = currentArray;
		}
	}

	return frontmatter;
}

/**
 * Parse a scalar YAML value (string, number, boolean, inline array).
 * @param raw - Trimmed string value from YAML
 * @returns Parsed value
 * @internal
 */
function parseScalarValue(raw: string): unknown {
	if (raw === '') return '';

	// Handle inline arrays like ["read", "search"] or ['read', 'search']
	if (raw.startsWith('[') && raw.endsWith(']')) {
		try {
			return JSON.parse(raw.replace(/'/g, '"'));
		} catch {
			return raw;
		}
	}
	// Handle quoted strings
	if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
		return raw.slice(1, -1);
	}
	// Handle boolean values
	if (raw === 'true' || raw === 'false') {
		return raw === 'true';
	}
	// Handle numeric values
	if (/^-?\d+(\.\d+)?$/.test(raw)) {
		return Number(raw);
	}
	return raw;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Extracts frontmatter between `---` delimiters and parses key-value pairs.
 *
 * @param content - Full markdown content with optional frontmatter
 * @returns Object with parsed frontmatter record and body text
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const yamlStr = match[1] || '';
	const body = match[2] || '';

	return { frontmatter: parseYamlKeyValues(yamlStr), body: body.trim() };
}

/**
 * Parse content from a code block (e.g., ```skill ... ```)
 * The code block may contain frontmatter inside it.
 */
function parseCodeBlockContent(content: string, blockType: string): { frontmatter: Record<string, unknown>; body: string } | null {
	// Match code block with specific type: ```skill\n...\n```
	const codeBlockRegex = new RegExp('^```' + blockType + '\\r?\\n([\\s\\S]*?)\\r?\\n```\\s*$');
	const match = content.trim().match(codeBlockRegex);
	
	if (!match) {
		return null;
	}
	
	const blockContent = match[1] || '';
	
	// Now parse frontmatter from within the code block
	return parseFrontmatter(blockContent);
}

/**
 * Loader class for custom agents, skills, and instructions
 */
export class CustomizationLoader {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Get the vault base path if available (desktop only)
	 */
	private getVaultBasePath(): string | undefined {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath().replace(/\\/g, '/');
		}
		return undefined;
	}

	/**
 * Convert a directory path to a vault-relative path and get the folder
 * Handles absolute paths, vault root (.), and relative paths
 * Cross-platform compatible (Windows, Mac, Linux)
 */
private getFolderFromPath(dir: string): TFolder | null {
	// Expand ~/... to user home directory (cross-platform)
	dir = expandHomePath(dir);

	const vaultBasePath = this.getVaultBasePath();
	
	// Handle vault root cases first
	if (isVaultRoot(dir)) {
		return this.app.vault.getRoot();
	}
	
	// Normalize the path
	let relativePath = normalizeVaultPath(dir);
	
	// Handle absolute paths ending with /. (vault root with trailing .)
	if (vaultBasePath && (relativePath.endsWith('/.') || relativePath === '.')) {
		const withoutDot = relativePath.replace(/\/?\.$/, '');
		const normalizedVaultPath = normalizeVaultPath(vaultBasePath);
		if (withoutDot === normalizedVaultPath || withoutDot === '') {
			return this.app.vault.getRoot();
		}
	}
	
	// Convert absolute path to relative path
	if (vaultBasePath) {
		relativePath = toVaultRelativePath(relativePath, vaultBasePath);
	}
	
	// Handle empty string after processing (vault root)
	if (isVaultRoot(relativePath)) {
		return this.app.vault.getRoot();
	}
	
	// Obsidian's getAbstractFileByPath expects vault-relative paths with forward slashes
	const folder = this.app.vault.getAbstractFileByPath(relativePath);
	if (folder && folder instanceof TFolder) {
		return folder;
	}
	
	console.log(`[VC] Could not find folder: ${dir} (resolved to: ${relativePath})`);
	return null;
}

	/**
	 * Check if a path is an absolute path outside the vault.
	 * Used to determine when to fall back to Node.js fs for reading files.
	 *
	 * @param dir - The original directory path (before expansion)
	 * @returns The expanded absolute path if external, or null if it's a vault path
	 * @internal
	 */
	private getExternalAbsolutePath(dir: string): string | null {
		if (!isDesktop) return null;

		const expanded = expandHomePath(dir.trim());
		// Check if it's an absolute path (Unix or Windows)
		const isAbsolute = expanded.startsWith('/') || /^[A-Za-z]:[\\/]/.test(expanded);
		if (!isAbsolute) return null;

		// Check if it's inside the vault
		const vaultBasePath = this.getVaultBasePath();
		if (vaultBasePath) {
			const normalizedExpanded = expanded.replace(/\\/g, '/');
			const normalizedVault = vaultBasePath.replace(/\\/g, '/');
			if (normalizedExpanded.startsWith(normalizedVault + '/') || normalizedExpanded === normalizedVault) {
				return null; // Inside vault, use normal vault API
			}
		}

		return expanded;
	}

	/**
	 * Read files from an external directory using Node.js fs.
	 * Used as fallback when directory is outside the vault.
	 *
	 * @param absDir - Absolute path to the directory
	 * @param filter - Function to filter file names (e.g., check extension)
	 * @returns Array of { name, content } for matching files
	 * @internal
	 */
	private readExternalFiles(absDir: string, filter: (name: string) => boolean): { name: string; path: string; content: string }[] {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require("fs") as typeof import("fs");
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const path = require("path") as typeof import("path");

			if (!fs.existsSync(absDir)) {
				console.log(`[VC] External directory does not exist: ${absDir}`);
				return [];
			}

			const entries = fs.readdirSync(absDir, { withFileTypes: true });
			const results: { name: string; path: string; content: string }[] = [];

			for (const entry of entries) {
				if (entry.isFile() && filter(entry.name)) {
					const fullPath = path.join(absDir, entry.name);
					try {
						const content = fs.readFileSync(fullPath, 'utf-8');
						results.push({ name: entry.name, path: fullPath.replace(/\\/g, '/'), content });
					} catch (err) {
						console.error(`[VC] Failed to read external file: ${fullPath}`, err);
					}
				}
			}

			return results;
		} catch (err) {
			console.error(`[VC] Failed to read external directory: ${absDir}`, err);
			return [];
		}
	}

	/**
	 * List subdirectories in an external directory.
	 * Used for skill loading where skills are in subdirectories.
	 *
	 * @param absDir - Absolute path to the parent directory
	 * @returns Array of { name, absPath } for subdirectories
	 * @internal
	 */
	private listExternalSubdirs(absDir: string): { name: string; absPath: string }[] {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require("fs") as typeof import("fs");
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const path = require("path") as typeof import("path");

			if (!fs.existsSync(absDir)) return [];

			const entries = fs.readdirSync(absDir, { withFileTypes: true });
			return entries
				.filter(e => e.isDirectory())
				.map(e => ({ name: e.name, absPath: path.join(absDir, e.name).replace(/\\/g, '/') }));
		} catch (err) {
			console.error(`[VC] Failed to list external subdirectories: ${absDir}`, err);
			return [];
		}
	}

	/**
	 * Read a single file from an external path.
	 *
	 * @param absPath - Absolute path to the file
	 * @returns File content as string, or null if not found
	 * @internal
	 */
	private readExternalFile(absPath: string): string | null {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require("fs") as typeof import("fs");
			if (!fs.existsSync(absPath)) return null;
			return fs.readFileSync(absPath, 'utf-8');
		} catch (err) {
			console.error(`[VC] Failed to read external file: ${absPath}`, err);
			return null;
		}
	}

	/**
	 * Infer the resource type from its path within the skill directory.
	 * Maps well-known subdirectory names to resource types.
	 *
	 * @param relativePath - Path relative to the skill directory
	 * @returns The inferred resource type
	 * @internal
	 */
	private inferResourceType(relativePath: string): SkillResource['type'] {
		const normalized = relativePath.replace(/\\/g, '/');
		const firstSegment = normalized.split('/')[0]?.toLowerCase();
		switch (firstSegment) {
			case 'scripts': return 'script';
			case 'references': return 'reference';
			case 'assets': return 'asset';
			case 'templates': return 'template';
			case 'examples': return 'example';
			default: return 'other';
		}
	}

	/**
	 * Discover resource files in a vault-internal skill directory.
	 * Returns all files except SKILL.md itself.
	 *
	 * @param skillFolder - The TFolder for the skill directory
	 * @returns Array of discovered SkillResource objects
	 * @internal
	 */
	private discoverVaultResources(skillFolder: TFolder): SkillResource[] {
		const resources: SkillResource[] = [];
		const basePath = skillFolder.path;

		const walk = (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFile) {
					if (child.name === 'SKILL.md') continue;
					const relativePath = child.path.slice(basePath.length + 1);
					resources.push({
						relativePath,
						name: child.name,
						type: this.inferResourceType(relativePath),
					});
				} else if (child instanceof TFolder) {
					walk(child);
				}
			}
		};

		walk(skillFolder);
		return resources;
	}

	/**
	 * Discover resource files in an external skill directory.
	 * Returns all files except SKILL.md itself.
	 *
	 * @param absDir - Absolute path to the skill directory
	 * @returns Array of discovered SkillResource objects
	 * @internal
	 */
	private discoverExternalResources(absDir: string): SkillResource[] {
		if (!isDesktop) return [];
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require("fs") as typeof import("fs");
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const path = require("path") as typeof import("path");

			const resources: SkillResource[] = [];
			const walk = (dir: string, prefix: string) => {
				if (!fs.existsSync(dir)) return;
				const entries = fs.readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
					if (entry.isFile()) {
						if (entry.name === 'SKILL.md') continue;
						resources.push({
							relativePath,
							name: entry.name,
							type: this.inferResourceType(relativePath),
						});
					} else if (entry.isDirectory()) {
						walk(path.join(dir, entry.name), relativePath);
					}
				}
			};

			walk(absDir, '');
			return resources;
		} catch (err) {
			console.error(`[VC] Failed to discover external resources: ${absDir}`, err);
			return [];
		}
	}

	/**
	 * Read a resource file from a skill directory.
	 * Supports both vault-internal and external (absolute) skill paths.
	 * Validates that the resource path doesn't escape the skill directory.
	 *
	 * @param skillPath - The skill directory path (as stored in CustomSkill.path)
	 * @param resourcePath - Relative path within the skill directory
	 * @returns File content as string, or null if not found or access denied
	 *
	 * @example
	 * ```typescript
	 * const content = await loader.readSkillResource(
	 *   'Reference/Skills/webapp-testing',
	 *   'scripts/test-template.js'
	 * );
	 * ```
	 *
	 * @since 0.1.1
	 */
	async readSkillResource(skillPath: string, resourcePath: string): Promise<string | null> {
		// Security: prevent path traversal
		const normalized = resourcePath.replace(/\\/g, '/');
		if (normalized.includes('..') || normalized.startsWith('/')) {
			console.error(`[VC] Blocked path traversal attempt in skill resource: ${resourcePath}`);
			return null;
		}

		// Try vault-internal first
		const vaultFilePath = `${skillPath}/${normalized}`;
		const file = this.app.vault.getAbstractFileByPath(vaultFilePath);
		if (file && file instanceof TFile) {
			try {
				return await this.app.vault.read(file);
			} catch (err) {
				console.error(`[VC] Failed to read vault skill resource: ${vaultFilePath}`, err);
				return null;
			}
		}

		// Try external path (desktop only)
		if (isDesktop) {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const nodePath = require("path") as typeof import("path");
			const absPath = nodePath.join(skillPath, normalized).replace(/\\/g, '/');
			// Verify the resolved path is still within the skill directory
			const resolvedSkill = nodePath.resolve(skillPath).replace(/\\/g, '/');
			const resolvedResource = nodePath.resolve(absPath).replace(/\\/g, '/');
			if (!resolvedResource.startsWith(resolvedSkill + '/')) {
				console.error(`[VC] Resource path escaped skill directory: ${resourcePath}`);
				return null;
			}
			return this.readExternalFile(absPath);
		}

		return null;
	}

	/**
	 * Load all agents from the configured agent directories
	 */
	async loadAgents(directories: string[]): Promise<CustomAgent[]> {
		const agents: CustomAgent[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				// Try external fs fallback for absolute paths outside the vault
				const extPath = this.getExternalAbsolutePath(dir);
				if (extPath) {
					const extAgents = this.loadAgentsFromExternal(extPath);
					agents.push(...extAgents);
				} else {
					console.log(`[VC] Agent directory not found: "${dir}"`);
				}
				continue;
			}

			console.log(`[VC] Scanning agent directory: "${dir}" with ${folder.children.length} children`);

			// Find all .agent.md files in this directory
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name.endsWith('.agent.md')) {
					try {
						const content = await this.app.vault.read(child);
						const { frontmatter, body } = parseFrontmatter(content);

						if (frontmatter.name && frontmatter.description) {
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

							// Parse model (string or array)
							let model: string | string[] | undefined;
							if (Array.isArray(frontmatter.model)) {
								model = frontmatter.model.map(String);
							} else if (frontmatter.model) {
								model = String(frontmatter.model);
							}

							agents.push({
								name: String(frontmatter.name),
								description: String(frontmatter.description),
								tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
								model,
								argumentHint: frontmatter['argument-hint'] ? String(frontmatter['argument-hint']) : undefined,
								handoffDescription: frontmatter.handoffDescription ? String(frontmatter.handoffDescription) : undefined,
								handoffs,
								userInvokable: typeof frontmatter.userInvokable === 'boolean' ? frontmatter.userInvokable : undefined,
								path: child.path,
								instructions: body,
							});
						}
					} catch (error) {
						console.error(`Failed to load agent from ${child.path}:`, error);
					}
				}
			}
		}

		return agents;
	}

	/**
	 * Load all skills from the configured skill directories
	 */
	async loadSkills(directories: string[]): Promise<CustomSkill[]> {
		const skills: CustomSkill[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				// Try external fs fallback for absolute paths outside the vault
				const extPath = this.getExternalAbsolutePath(dir);
				if (extPath) {
					const extSkills = this.loadSkillsFromExternal(extPath);
					skills.push(...extSkills);
				} else {
					console.log(`[VC] Skill directory not found: "${dir}"`);
				}
				continue;
			}

			// Skills are in subdirectories with SKILL.md or skill.json files
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					// Look for SKILL.md in this subdirectory
					const skillFile = this.app.vault.getAbstractFileByPath(`${child.path}/SKILL.md`);
					if (skillFile && skillFile instanceof TFile) {
						try {
							const content = await this.app.vault.read(skillFile);
							
							// Try parsing as code block first (```skill ... ```)
							let parsed = parseCodeBlockContent(content, 'skill');
							
							// Fall back to regular frontmatter if not a code block
							if (!parsed) {
								parsed = parseFrontmatter(content);
							}
							
							const { frontmatter, body } = parsed;

							if (frontmatter.name && frontmatter.description) {
								// Discover resources (Level 3)
								const resources = this.discoverVaultResources(child);

								// Parse invocation control fields (kebab-case first, then camelCase)
								const rawUserInvokable = frontmatter['user-invokable'] ?? frontmatter.userInvokable;
								const rawDisableModel = frontmatter['disable-model-invocation'] ?? frontmatter.disableModelInvocation;
								const rawArgHint = frontmatter['argument-hint'] ?? frontmatter.argumentHint;

								skills.push({
									name: String(frontmatter.name),
									description: String(frontmatter.description),
									license: frontmatter.license ? String(frontmatter.license) : undefined,
									userInvokable: typeof rawUserInvokable === 'boolean' ? rawUserInvokable : undefined,
									disableModelInvocation: typeof rawDisableModel === 'boolean' ? rawDisableModel : undefined,
									argumentHint: rawArgHint ? String(rawArgHint) : undefined,
									path: child.path,
									instructions: body,
									resources: resources.length > 0 ? resources : undefined,
								});
							}
						} catch (error) {
							console.error(`Failed to load skill from ${skillFile.path}:`, error);
						}
					} else {
						// Fallback: look for skill.json (SDK-native format)
						const jsonFile = this.app.vault.getAbstractFileByPath(`${child.path}/skill.json`);
						if (jsonFile && jsonFile instanceof TFile) {
							try {
								const skill = await this.loadSkillFromJson(jsonFile, child);
								if (skill) skills.push(skill);
							} catch (error) {
								console.error(`Failed to load skill from ${jsonFile.path}:`, error);
							}
						}
					}
				}
			}
		}

		return skills;
	}

	/**
	 * Load a skill from a vault-internal skill.json file (SDK-native format).
	 *
	 * The SDK skill.json schema uses:
	 * ```json
	 * { "name": "id", "displayName": "...", "description": "...", "version": "...",
	 *   "author": "...", "prompts": [{ "type": "...", "ref": "..." }],
	 *   "tools": [{ "name": "...", "path": "..." }] }
	 * ```
	 *
	 * We map this to our CustomSkill interface for uniform consumption across all providers.
	 *
	 * @param file - The TFile for skill.json
	 * @param folder - The parent TFolder containing the skill
	 * @returns A CustomSkill or null if parsing fails
	 * @internal
	 */
	private async loadSkillFromJson(file: TFile, folder: TFolder): Promise<CustomSkill | null> {
		const raw = await this.app.vault.read(file);
		return this.parseSkillJson(raw, folder.path);
	}

	/**
	 * Parse a skill.json string (SDK-native format) into a CustomSkill.
	 *
	 * Works for both vault-internal and external (fs-based) skill directories.
	 *
	 * @param raw - Raw JSON string content of skill.json
	 * @param skillPath - Path to the skill directory (vault-relative or absolute)
	 * @returns A CustomSkill or null if the JSON is invalid or missing required fields
	 * @internal
	 */
	private parseSkillJson(raw: string, skillPath: string): CustomSkill | null {
		const json = JSON.parse(raw);

		const name = json.name || json.displayName;
		const description = json.description;
		if (!name || !description) return null;

		// Build instructions from prompts array if present
		let instructions = '';
		if (Array.isArray(json.prompts)) {
			const promptRefs = json.prompts
				.map((p: { type?: string; ref?: string }) => p.ref || '')
				.filter(Boolean);
			if (promptRefs.length > 0) {
				instructions = `Prompts: ${promptRefs.join(', ')}`;
			}
		}

		// Surface tools info if present
		if (Array.isArray(json.tools) && json.tools.length > 0) {
			const toolNames = json.tools
				.map((t: { name?: string }) => t.name || '')
				.filter(Boolean);
			if (toolNames.length > 0) {
				instructions += (instructions ? '\n' : '') + `Tools: ${toolNames.join(', ')}`;
			}
		}

		return {
			name: String(name),
			description: String(description),
			license: json.license ? String(json.license) : undefined,
			path: skillPath,
			instructions: instructions || description,
		};
	}

	/**
	 * Load all instructions from the configured instruction directories
	 */
	async loadInstructions(directories: string[]): Promise<CustomInstruction[]> {
		const instructions: CustomInstruction[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				continue;
			}

			// Find all .instructions.md files, copilot-instructions.md, or AGENTS.md
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md') {
					const isInstructionFile = child.name.endsWith('.instructions.md') || 
						child.name === 'copilot-instructions.md' ||
						child.name === 'AGENTS.md';
					
					if (isInstructionFile) {
						try {
							const content = await this.app.vault.read(child);
							const { frontmatter, body } = parseFrontmatter(content);

							// Extract name from filename
							let name = child.basename;
							if (name.endsWith('.instructions')) {
								name = name.replace('.instructions', '');
							}

							instructions.push({
								name,
								applyTo: frontmatter.applyTo ? String(frontmatter.applyTo) : undefined,
								path: child.path,
								content: body,
							});
						} catch (error) {
							console.error(`Failed to load instruction from ${child.path}:`, error);
						}
					}
				}
			}
		}

		return instructions;
	}

	/**
	 * Load all prompts from the configured prompt directories
	 */
	async loadPrompts(directories: string[]): Promise<CustomPrompt[]> {
		const prompts: CustomPrompt[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				// Try external fs fallback for absolute paths outside the vault
				const extPath = this.getExternalAbsolutePath(dir);
				if (extPath) {
					const extPrompts = this.loadPromptsFromExternal(extPath);
					prompts.push(...extPrompts);
				} else {
					console.log(`[VC] Prompt directory not found: "${dir}"`);
				}
				continue;
			}

			console.log(`[VC] Scanning prompt directory: "${dir}" with ${folder.children.length} children`);

			// Find all .prompt.md files in this directory
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name.endsWith('.prompt.md')) {
					try {
						const content = await this.app.vault.read(child);
						const { frontmatter, body } = parseFrontmatter(content);

						// Extract name from frontmatter or filename
						let name = frontmatter.name ? String(frontmatter.name) : child.basename;
						if (name.endsWith('.prompt')) {
							name = name.replace('.prompt', '');
						}

						// Description is required, but we'll use a default if not provided
						const description = frontmatter.description 
							? String(frontmatter.description) 
							: `Prompt from ${child.name}`;

						prompts.push({
							name,
							description,
							tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
							model: frontmatter.model ? String(frontmatter.model) : undefined,
							agent: frontmatter.agent ? String(frontmatter.agent) : undefined,
							argumentHint: frontmatter['argument-hint'] ? String(frontmatter['argument-hint']) : (frontmatter.argumentHint ? String(frontmatter.argumentHint) : undefined),
							timeout: typeof frontmatter.timeout === 'number' ? frontmatter.timeout : undefined,
							path: child.path,
							content: body,
						});
					} catch (error) {
						console.error(`Failed to load prompt from ${child.path}:`, error);
					}
				}
			}
		}

		return prompts;
	}

	/**
	 * Load agents from an external directory using Node.js fs.
	 * Desktop-only fallback for directories outside the vault.
	 *
	 * @param absDir - Absolute path to the agent directory
	 * @returns Array of parsed CustomAgent objects
	 * @internal
	 */
	private loadAgentsFromExternal(absDir: string): CustomAgent[] {
		const agents: CustomAgent[] = [];
		const files = this.readExternalFiles(absDir, name => name.endsWith('.agent.md'));

		console.log(`[VC] Scanning external agent directory: "${absDir}" with ${files.length} agent files`);

		for (const file of files) {
			try {
				const { frontmatter, body } = parseFrontmatter(file.content);
				if (frontmatter.name && frontmatter.description) {
					// Parse handoffs
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

					agents.push({
						name: String(frontmatter.name),
						description: String(frontmatter.description),
						tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
						model,
						argumentHint: frontmatter['argument-hint'] ? String(frontmatter['argument-hint']) : (frontmatter.argumentHint ? String(frontmatter.argumentHint) : undefined),
						handoffDescription: frontmatter.handoffDescription ? String(frontmatter.handoffDescription) : undefined,
						handoffs,
						userInvokable: (() => { const v = frontmatter['user-invokable'] ?? frontmatter.userInvokable; return typeof v === 'boolean' ? v : undefined; })(),
						path: file.path,
						instructions: body,
					});
				}
			} catch (error) {
				console.error(`[VC] Failed to load external agent from ${file.path}:`, error);
			}
		}
		return agents;
	}

	/**
	 * Load skills from an external directory using Node.js fs.
	 * Desktop-only fallback for directories outside the vault.
	 * Skills are expected in subdirectories containing a SKILL.md file.
	 *
	 * @param absDir - Absolute path to the skills directory
	 * @returns Array of parsed CustomSkill objects
	 * @internal
	 */
	private loadSkillsFromExternal(absDir: string): CustomSkill[] {
		const skills: CustomSkill[] = [];
		const subdirs = this.listExternalSubdirs(absDir);

		console.log(`[VC] Scanning external skill directory: "${absDir}" with ${subdirs.length} subdirectories`);

		for (const subdir of subdirs) {
			const skillFilePath = subdir.absPath + '/SKILL.md';
			const content = this.readExternalFile(skillFilePath);
			if (!content) {
				// Fallback: try skill.json (SDK-native format)
				const jsonPath = subdir.absPath + '/skill.json';
				const jsonContent = this.readExternalFile(jsonPath);
				if (jsonContent) {
					try {
						const skill = this.parseSkillJson(jsonContent, subdir.absPath);
						if (skill) skills.push(skill);
					} catch (error) {
						console.error(`[VC] Failed to load external skill.json from ${jsonPath}:`, error);
					}
				}
				continue;
			}

			try {
				// Try parsing as code block first
				let parsed = parseCodeBlockContent(content, 'skill');
				if (!parsed) {
					parsed = parseFrontmatter(content);
				}

				const { frontmatter, body } = parsed;

				if (frontmatter.name && frontmatter.description) {
					// Read user-invokable: check kebab-case first, then camelCase
					const rawUserInvokable = frontmatter['user-invokable'] ?? frontmatter.userInvokable;
					const rawDisableModel = frontmatter['disable-model-invocation'] ?? frontmatter.disableModelInvocation;
					const rawArgHint = frontmatter['argument-hint'] ?? frontmatter.argumentHint;

					// Discover resources (Level 3)
					const resources = this.discoverExternalResources(subdir.absPath);

					skills.push({
						name: String(frontmatter.name),
						description: String(frontmatter.description),
						license: frontmatter.license ? String(frontmatter.license) : undefined,
						userInvokable: typeof rawUserInvokable === 'boolean' ? rawUserInvokable : undefined,
						disableModelInvocation: typeof rawDisableModel === 'boolean' ? rawDisableModel : undefined,
						argumentHint: rawArgHint ? String(rawArgHint) : undefined,
						path: subdir.absPath,
						instructions: body,
						resources: resources.length > 0 ? resources : undefined,
					});
				}
			} catch (error) {
				console.error(`[VC] Failed to load external skill from ${skillFilePath}:`, error);
			}
		}
		return skills;
	}

	/**
	 * Load prompts from an external directory using Node.js fs.
	 * Desktop-only fallback for directories outside the vault.
	 *
	 * @param absDir - Absolute path to the prompt directory
	 * @returns Array of parsed CustomPrompt objects
	 * @internal
	 */
	private loadPromptsFromExternal(absDir: string): CustomPrompt[] {
		const prompts: CustomPrompt[] = [];
		const files = this.readExternalFiles(absDir, name => name.endsWith('.prompt.md'));

		console.log(`[VC] Scanning external prompt directory: "${absDir}" with ${files.length} prompt files`);

		for (const file of files) {
			try {
				const { frontmatter, body } = parseFrontmatter(file.content);

				let name = frontmatter.name ? String(frontmatter.name) : file.name.replace(/\.prompt\.md$/, '');
				if (name.endsWith('.prompt')) {
					name = name.replace('.prompt', '');
				}

				const description = frontmatter.description
					? String(frontmatter.description)
					: `Prompt from ${file.name}`;

				prompts.push({
					name,
					description,
					tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
					model: frontmatter.model ? String(frontmatter.model) : undefined,
					agent: frontmatter.agent ? String(frontmatter.agent) : undefined,
					argumentHint: frontmatter['argument-hint'] ? String(frontmatter['argument-hint']) : (frontmatter.argumentHint ? String(frontmatter.argumentHint) : undefined),
					timeout: typeof frontmatter.timeout === 'number' ? frontmatter.timeout : undefined,
					path: file.path,
					content: body,
				});
			} catch (error) {
				console.error(`[VC] Failed to load external prompt from ${file.path}:`, error);
			}
		}
		return prompts;
	}

	/**
	 * Get a single agent by name
	 */
	async getAgent(directories: string[], name: string): Promise<CustomAgent | undefined> {
		const agents = await this.loadAgents(directories);
		return agents.find(a => a.name === name);
	}

	/**
	 * Get a single prompt by name
	 */
	async getPrompt(directories: string[], name: string): Promise<CustomPrompt | undefined> {
		const prompts = await this.loadPrompts(directories);
		return prompts.find(p => p.name === name);
	}

	/**
	 * Load all voice agents from the configured directories
	 * Voice agents use the .voice-agent.md extension
	 */
	async loadVoiceAgents(directories: string[]): Promise<VoiceAgentDefinition[]> {
		const voiceAgents: VoiceAgentDefinition[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				console.log(`[VC] Voice agent directory not found: "${dir}"`);
				continue;
			}

			console.log(`[VC] Scanning voice agent directory: "${dir}" with ${folder.children.length} children`);

			// Find all .voice-agent.md files in this directory
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name.endsWith('.voice-agent.md')) {
					try {
						const content = await this.app.vault.read(child);
						const { frontmatter, body } = parseFrontmatter(content);

						if (frontmatter.name) {
							voiceAgents.push({
								name: String(frontmatter.name),
								description: frontmatter.description ? String(frontmatter.description) : '',
								handoffDescription: frontmatter.handoffDescription ? String(frontmatter.handoffDescription) : '',
								voice: frontmatter.voice ? String(frontmatter.voice) : undefined,
								tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : [],
								handoffs: Array.isArray(frontmatter.handoffs) ? frontmatter.handoffs : [],
								path: child.path,
								instructions: body,
							});
							console.log(`[VC] Loaded voice agent: ${frontmatter.name} from ${child.path}`);
						}
					} catch (error) {
						console.error(`Failed to load voice agent from ${child.path}:`, error);
					}
				}
			}
		}

		return voiceAgents;
	}

	/**
	 * Get a single voice agent by name
	 */
	async getVoiceAgent(directories: string[], name: string): Promise<VoiceAgentDefinition | undefined> {
		const voiceAgents = await this.loadVoiceAgents(directories);
		return voiceAgents.find(a => a.name === name);
	}

	/**
	 * Load a voice agent definition from a specific file path
	 */
	async loadVoiceAgentFromFile(filePath: string): Promise<VoiceAgentDefinition | null> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				console.log(`[VC] Voice agent file not found: "${filePath}"`);
				return null;
			}

			const content = await this.app.vault.read(file);
			const { frontmatter, body } = parseFrontmatter(content);

			if (frontmatter.name) {
				const definition: VoiceAgentDefinition = {
					name: String(frontmatter.name),
					description: frontmatter.description ? String(frontmatter.description) : '',
					handoffDescription: frontmatter.handoffDescription ? String(frontmatter.handoffDescription) : '',
					voice: frontmatter.voice ? String(frontmatter.voice) : undefined,
					tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : [],
					handoffs: Array.isArray(frontmatter.handoffs) ? frontmatter.handoffs : [],
					path: file.path,
					instructions: body,
				};
				console.log(`[VC] Loaded voice agent: ${frontmatter.name} from ${file.path}`);
				return definition;
			}

			console.log(`[VC] Voice agent file missing 'name' in frontmatter: "${filePath}"`);
			return null;
		} catch (error) {
			console.error(`[VC] Failed to load voice agent from ${filePath}:`, error);
			return null;
		}
	}
}
