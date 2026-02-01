/**
 * RealtimeAgentService - OpenAI Realtime Voice Agent integration
 *
 * Provides real-time voice conversation capabilities using OpenAI's Realtime API
 * with support for tools, interruptions, and live transcription.
 */

import { App, TFile, Notice } from "obsidian";
import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { handoff } from "@openai/agents";
import { z } from "zod";
import type { McpManager } from "../copilot/McpManager";
import { TaskExecutorService, TaskExecutionCallback, TaskResult } from "./TaskExecutorService";

/** Available voice options for OpenAI Realtime */
export type RealtimeVoice =
	| "alloy"
	| "ash"
	| "ballad"
	| "coral"
	| "echo"
	| "fable"
	| "onyx"
	| "nova"
	| "sage"
	| "shimmer"
	| "verse";

/** Turn detection modes */
export type TurnDetectionMode = "semantic_vad" | "server_vad";

/** Realtime agent state */
export type RealtimeAgentState =
	| "idle"
	| "connecting"
	| "connected"
	| "speaking"
	| "listening"
	| "error";

/** Tool names that can be conditionally enabled/disabled */
export type RealtimeToolName = 
	| "read_note"
	| "search_notes"
	| "get_active_note"
	| "list_notes"
	| "create_note"
	| "append_to_note"
	| "update_note"
	| "replace_note"
	| "mark_tasks_complete"
	| "execute_task"
	| "fetch_web_page"
	| "web_search";

/** Configuration for which tools are enabled */
export interface RealtimeToolConfig {
	/** Enable/disable specific tools. If not specified, tool is enabled by default */
	enabled?: Partial<Record<RealtimeToolName, boolean>>;
	/** Enable all vault read tools (read_note, search_notes, get_active_note, list_notes) */
	vaultRead?: boolean;
	/** Enable all vault write tools (create_note, append_to_note) */
	vaultWrite?: boolean;
	/** Enable web tools (fetch_web_page, web_search) */
	webAccess?: boolean;
	/** Enable MCP tools */
	mcpTools?: boolean;
}

/** Default tool configuration - all enabled */
export const DEFAULT_TOOL_CONFIG: RealtimeToolConfig = {
	vaultRead: true,
	vaultWrite: true,
	webAccess: true,
	mcpTools: true,
};

/** Configuration for RealtimeAgentService */
export interface RealtimeAgentConfig {
	/** OpenAI API key */
	apiKey: string;
	/** Voice to use for responses */
	voice?: RealtimeVoice;
	/** Turn detection mode */
	turnDetection?: TurnDetectionMode;
	/** Instructions for the agent */
	instructions?: string;
	/** Optional MCP Manager for exposing MCP tools */
	mcpManager?: McpManager;
	/** Tool configuration for conditional enabling */
	toolConfig?: RealtimeToolConfig;
	/** Language for speech recognition (e.g., 'en', 'es', 'fr'). Defaults to auto-detect. */
	language?: string;
}

/** History item from conversation */
export interface RealtimeHistoryItem {
	type: "message" | "function_call" | "function_call_output";
	role?: "user" | "assistant" | "system";
	content?: string;
	transcript?: string;
	name?: string;
	arguments?: string;
	output?: string;
}

/** Event types emitted by RealtimeAgentService */
export interface RealtimeAgentEvents {
	stateChange: (state: RealtimeAgentState) => void;
	transcript: (item: RealtimeHistoryItem) => void;
	historyUpdated: (history: RealtimeHistoryItem[]) => void;
	toolExecution: (toolName: string, args: unknown, result: unknown) => void;
	error: (error: Error) => void;
	interrupted: () => void;
}

/** Callback type for tool execution */
type ToolExecutionCallback = (
	toolName: string,
	args: unknown,
	result: unknown
) => void;

export class RealtimeAgentService {
	private app: App;
	private config: RealtimeAgentConfig;
	private agent: RealtimeAgent | null = null;
	private session: RealtimeSession | null = null;
	private state: RealtimeAgentState = "idle";
	private listeners: Map<
		keyof RealtimeAgentEvents,
		Set<(...args: unknown[]) => void>
	> = new Map();
	private onToolExecution: ToolExecutionCallback | null = null;
	private toolConfig: RealtimeToolConfig;
	private taskExecutor: TaskExecutorService | null = null;
	private onTaskExecution: TaskExecutionCallback | null = null;

	constructor(app: App, config: RealtimeAgentConfig) {
		this.app = app;
		this.config = config;
		this.toolConfig = { ...DEFAULT_TOOL_CONFIG, ...config.toolConfig };
		
		// Initialize task executor subagent
		this.taskExecutor = new TaskExecutorService(app, {
			openaiApiKey: config.apiKey,
			mcpManager: config.mcpManager,
			model: "gpt-4o-mini", // Fast model for task execution
		});
	}

	/**
	 * Set callback for task execution updates (for displaying in chat view)
	 */
	setTaskExecutionCallback(callback: TaskExecutionCallback | null): void {
		this.onTaskExecution = callback;
		this.taskExecutor?.setExecutionCallback(callback);
	}

	/**
	 * Check if a specific tool is enabled based on configuration
	 */
	private isToolEnabled(toolName: RealtimeToolName): boolean {
		const config = this.toolConfig;
		
		// Check explicit enable/disable first
		if (config.enabled?.[toolName] !== undefined) {
			return config.enabled[toolName]!;
		}
		
		// Check category-level settings
		const vaultReadTools: RealtimeToolName[] = ["read_note", "search_notes", "get_active_note", "list_notes"];
		const vaultWriteTools: RealtimeToolName[] = ["create_note", "append_to_note", "update_note", "replace_note", "mark_tasks_complete", "execute_task"];
		const webTools: RealtimeToolName[] = ["fetch_web_page", "web_search"];
		
		if (vaultReadTools.includes(toolName) && config.vaultRead !== undefined) {
			return config.vaultRead;
		}
		if (vaultWriteTools.includes(toolName) && config.vaultWrite !== undefined) {
			return config.vaultWrite;
		}
		if (webTools.includes(toolName) && config.webAccess !== undefined) {
			return config.webAccess;
		}
		
		// Default to enabled
		return true;
	}

	/**
	 * Update tool configuration at runtime
	 */
	updateToolConfig(config: Partial<RealtimeToolConfig>): void {
		this.toolConfig = { ...this.toolConfig, ...config };
		console.log("[RealtimeAgent] Tool config updated:", this.toolConfig);
	}

	/**
	 * Get current state
	 */
	getState(): RealtimeAgentState {
		return this.state;
	}

	/**
	 * Subscribe to events
	 */
	on<K extends keyof RealtimeAgentEvents>(
		event: K,
		callback: RealtimeAgentEvents[K]
	): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		const callbacks = this.listeners.get(event)!;
		callbacks.add(callback as (...args: unknown[]) => void);

		return () => {
			callbacks.delete(callback as (...args: unknown[]) => void);
		};
	}

	/**
	 * Emit an event
	 */
	private emit<K extends keyof RealtimeAgentEvents>(
		event: K,
		...args: Parameters<RealtimeAgentEvents[K]>
	): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach((cb) => {
				try {
					cb(...args);
				} catch (e) {
					console.error(`[RealtimeAgent] Error in ${event} callback:`, e);
				}
			});
		}
	}

	/**
	 * Update state and emit change event
	 */
	private setState(newState: RealtimeAgentState): void {
		if (this.state !== newState) {
			this.state = newState;
			this.emit("stateChange", newState);
		}
	}

	/**
	 * Create tools for the realtime agent
	 */
	private createTools() {
		const tools: ReturnType<typeof tool>[] = [];

		// Add MCP tools if McpManager is available and mcpTools is enabled
		if (this.toolConfig.mcpTools !== false && this.config.mcpManager?.hasConnectedServers()) {
			const mcpTools = this.createMcpTools();
			if (mcpTools.length > 0) {
				console.log(`[RealtimeAgent] Added ${mcpTools.length} MCP tools to voice agent`);
				tools.push(...mcpTools);
			}
		}

		// Read note tool
		const readNote = tool({
			name: "read_note",
			description: "Read the content of a note from the vault by its path",
			parameters: z.object({
				path: z
					.string()
					.describe(
						'The path to the note file (e.g., "folder/note.md" or "note")'
					),
			}),
			execute: async ({ path }) => {
				try {
					// Normalize path
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({
							success: false,
							error: `Note not found: ${path}`,
						});
					}

					const content = await this.app.vault.read(file);
					this.onToolExecution?.(
						"read_note",
						{ path },
						{ success: true, length: content.length }
					);
					return JSON.stringify({ success: true, content, path: file.path });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Search notes tool
		const searchNotes = tool({
			name: "search_notes",
			description: "Search for notes in the vault by keyword",
			parameters: z.object({
				query: z
					.string()
					.describe("Search query to find in note titles or content"),
				limit: z
					.number()
					.optional()
					.describe("Maximum number of results (default: 5)"),
			}),
			execute: async ({ query, limit = 5 }) => {
				try {
					const files = this.app.vault.getMarkdownFiles();
					const results: Array<{
						path: string;
						title: string;
						excerpt: string;
					}> = [];
					const lowerQuery = query.toLowerCase();

					for (const file of files) {
						if (results.length >= limit) break;

						const titleMatch = file.basename.toLowerCase().includes(lowerQuery);
						let contentMatch = false;
						let excerpt = "";

						try {
							const content = await this.app.vault.cachedRead(file);
							const lowerContent = content.toLowerCase();
							const queryIndex = lowerContent.indexOf(lowerQuery);

							if (queryIndex !== -1) {
								contentMatch = true;
								const start = Math.max(0, queryIndex - 50);
								const end = Math.min(
									content.length,
									queryIndex + query.length + 50
								);
								excerpt =
									(start > 0 ? "..." : "") +
									content.slice(start, end) +
									(end < content.length ? "..." : "");
							}
						} catch {
							// Skip files that can't be read
						}

						if (titleMatch || contentMatch) {
							results.push({
								path: file.path,
								title: file.basename,
								excerpt: excerpt || file.basename,
							});
						}
					}

					this.onToolExecution?.(
						"search_notes",
						{ query, limit },
						{ count: results.length }
					);
					return JSON.stringify({ success: true, results });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Get active note tool
		const getActiveNote = tool({
			name: "get_active_note",
			description: "Get the currently active/open note in the editor",
			parameters: z.object({}),
			execute: async () => {
				try {
					const activeFile = this.app.workspace.getActiveFile();
					if (!activeFile) {
						return JSON.stringify({ success: true, hasActiveNote: false });
					}

					const content = await this.app.vault.read(activeFile);
					this.onToolExecution?.(
						"get_active_note",
						{},
						{ path: activeFile.path }
					);
					return JSON.stringify({
						success: true,
						hasActiveNote: true,
						path: activeFile.path,
						title: activeFile.basename,
						content,
					});
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// List notes tool
		const listNotes = tool({
			name: "list_notes",
			description: "List notes in a folder or the entire vault",
			parameters: z.object({
				folder: z
					.string()
					.optional()
					.describe("Folder path to list (empty for all notes)"),
				limit: z
					.number()
					.optional()
					.describe("Maximum number of results (default: 20)"),
			}),
			execute: async ({ folder, limit = 20 }) => {
				try {
					const files = this.app.vault.getMarkdownFiles();
					const normalizedFolder = folder
						?.replace(/\\/g, "/")
						.replace(/\/+$/, "");

					const notes = files
						.filter(
							(file) =>
								!normalizedFolder || file.path.startsWith(normalizedFolder)
						)
						.slice(0, limit)
						.map((file) => ({
							path: file.path,
							title: file.basename,
						}));

					this.onToolExecution?.(
						"list_notes",
						{ folder, limit },
						{ count: notes.length }
					);
					return JSON.stringify({ success: true, notes });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Fetch web page tool
		const fetchWebPage = tool({
			name: "fetch_web_page",
			description: "Fetch and extract text content from a web page URL",
			parameters: z.object({
				url: z.string().describe("The URL of the web page to fetch"),
			}),
			execute: async ({ url }) => {
				try {
					// Validate URL
					let parsedUrl: URL;
					try {
						parsedUrl = new URL(url);
						if (!["http:", "https:"].includes(parsedUrl.protocol)) {
							return JSON.stringify({
								success: false,
								error:
									"Invalid URL protocol. Only http and https are supported.",
							});
						}
					} catch {
						return JSON.stringify({
							success: false,
							error: `Invalid URL: ${url}`,
						});
					}

					// Fetch the page
					const response = await fetch(url, {
						method: "GET",
						headers: {
							"User-Agent":
								"Mozilla/5.0 (compatible; ObsidianVaultCopilot/1.0)",
							Accept:
								"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
						},
					});

					if (!response.ok) {
						return JSON.stringify({
							success: false,
							error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
						});
					}

					const html = await response.text();

					// Extract title
					const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
					const title =
						titleMatch && titleMatch[1]
							? titleMatch[1].trim()
							: parsedUrl.hostname;

					// Extract text content (simplified)
					let textContent = html
						.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
						.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
						.replace(/<[^>]+>/g, " ")
						.replace(/\s+/g, " ")
						.trim();

					// Limit content length
					const maxLength = 8000;
					if (textContent.length > maxLength) {
						textContent = textContent.substring(0, maxLength) + "...";
					}

					this.onToolExecution?.(
						"fetch_web_page",
						{ url },
						{ title, length: textContent.length }
					);
					return JSON.stringify({
						success: true,
						url,
						title,
						content: textContent,
					});
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Create note tool
		const createNote = tool({
			name: "create_note",
			description: "Create a new note in the vault with the specified content. Use this to create daily notes, meeting notes, or any new notes the user requests.",
			parameters: z.object({
				path: z
					.string()
					.describe(
						'The path for the new note (e.g., "Daily Notes/2026-01-31.md" or "Meeting Notes/standup.md"). Include .md extension.'
					),
				content: z
					.string()
					.describe("The content to write to the note (markdown format)"),
			}),
			execute: async ({ path, content }) => {
				try {
					// Normalize path
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					// Check if file already exists
					const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (existing) {
						return JSON.stringify({
							success: false,
							error: `A note already exists at: ${normalizedPath}`,
						});
					}

					// Create parent folders if needed
					const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
					if (folderPath) {
						const folder = this.app.vault.getAbstractFileByPath(folderPath);
						if (!folder) {
							await this.app.vault.createFolder(folderPath);
						}
					}

					// Create the file
					const file = await this.app.vault.create(normalizedPath, content);
					
					this.onToolExecution?.(
						"create_note",
						{ path: normalizedPath },
						{ success: true, created: file.path }
					);
					
					return JSON.stringify({
						success: true,
						message: `Created note at ${file.path}`,
						path: file.path,
					});
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Append to note tool
		const appendToNote = tool({
			name: "append_to_note",
			description: "Append content to an existing note. Use this to add entries to daily notes or add content to existing notes.",
			parameters: z.object({
				path: z
					.string()
					.describe('The path to the existing note (e.g., "Daily Notes/2026-01-31.md")'),
				content: z
					.string()
					.describe("The content to append to the note"),
			}),
			execute: async ({ path, content }) => {
				try {
					// Normalize path
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({
							success: false,
							error: `Note not found: ${normalizedPath}`,
						});
					}

					// Append content
					await this.app.vault.append(file, "\n" + content);
					
					this.onToolExecution?.(
						"append_to_note",
						{ path: normalizedPath },
						{ success: true }
					);
					
					return JSON.stringify({
						success: true,
						message: `Appended content to ${file.path}`,
						path: file.path,
					});
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Update note tool - find and replace text in a note
		const updateNote = tool({
			name: "update_note",
			description: "Update content in an existing note by finding and replacing text. Use this to mark tasks complete, update text, or make changes to existing notes.",
			parameters: z.object({
				path: z
					.string()
					.describe('The path to the note (e.g., "Daily Notes/2026-01-31.md")'),
				find: z
					.string()
					.describe("The exact text to find in the note"),
				replace: z
					.string()
					.describe("The text to replace it with"),
			}),
			execute: async ({ path, find, replace }) => {
				try {
					// Normalize path
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({
							success: false,
							error: `Note not found: ${normalizedPath}`,
						});
					}

					// Read current content
					const content = await this.app.vault.read(file);
					
					// Check if the text exists
					if (!content.includes(find)) {
						return JSON.stringify({
							success: false,
							error: `Text not found in note: "${find.substring(0, 50)}${find.length > 50 ? '...' : ''}"`,
						});
					}

					// Replace the text
					const updatedContent = content.replace(find, replace);
					
					// Write updated content
					await this.app.vault.modify(file, updatedContent);
					
					this.onToolExecution?.(
						"update_note",
						{ path: normalizedPath, find, replace },
						{ success: true }
					);
					
					return JSON.stringify({
						success: true,
						message: `Updated note at ${file.path}`,
						path: file.path,
					});
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Replace note content tool - replaces entire note content
		const replaceNote = tool({
			name: "replace_note",
			description: "Replace the entire content of an existing note. Use this when you need to rewrite or completely update a note's content.",
			parameters: z.object({
				path: z
					.string()
					.describe('The path to the note (e.g., "Daily Notes/2026-01-31.md")'),
				content: z
					.string()
					.describe("The new content to replace the entire note with"),
			}),
			execute: async ({ path, content }) => {
				try {
					// Normalize path
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({
							success: false,
							error: `Note not found: ${normalizedPath}`,
						});
					}

					// Write new content
					await this.app.vault.modify(file, content);
					
					this.onToolExecution?.(
						"replace_note",
						{ path: normalizedPath },
						{ success: true }
					);
					
					return JSON.stringify({
						success: true,
						message: `Replaced content of ${file.path}`,
						path: file.path,
					});
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Mark tasks complete tool - specifically for marking checkbox tasks as done
		const markTasksComplete = tool({
			name: "mark_tasks_complete",
			description: "Mark specific tasks as complete in a note. Provide the list of tasks to mark complete (change [ ] to [x]) and optionally tasks to exclude.",
			parameters: z.object({
				task_list: z
					.array(z.string())
					.describe("List of task text strings to mark as complete (the text after '- [ ] ')"),
				exceptions: z
					.array(z.string())
					.optional()
					.describe("Optional list of task text strings to NOT mark as complete (keep as [ ])"),
			}),
			execute: async ({ task_list, exceptions = [] }) => {
				try {
					// Get the active note
					const activeFile = this.app.workspace.getActiveFile();
					if (!activeFile) {
						return JSON.stringify({
							success: false,
							error: "No active note open",
						});
					}

					let content = await this.app.vault.read(activeFile);
					let modified = false;

					for (const task of task_list) {
						if (exceptions.includes(task)) continue;
						
						// Match the unchecked task
						const escapedTask = task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
						const taskRegex = new RegExp(`- \\[ \\] ${escapedTask}`, 'g');
						const newContent = content.replace(taskRegex, `- [x] ${task}`);
						
						if (newContent !== content) {
							content = newContent;
							modified = true;
						}
					}

					if (modified) {
						await this.app.vault.modify(activeFile, content);
						this.onToolExecution?.(
							"mark_tasks_complete",
							{ task_list, exceptions },
							{ success: true, tasksMarked: task_list.length - exceptions.length }
						);
						
						return JSON.stringify({
							success: true,
							message: `Marked ${task_list.length - exceptions.length} tasks complete in ${activeFile.basename}`,
							path: activeFile.path,
						});
					} else {
						return JSON.stringify({
							success: false,
							error: "No matching unchecked tasks found",
						});
					}
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Execute task tool - delegates complex operations to the task executor subagent
		// This is the primary tool for vault modifications - it runs a separate agent
		// that has all vault tools and can reason about complex multi-step operations
		const executeTask = tool({
			name: "execute_task",
			description: `Execute a complex task using a specialized subagent. Use this for:
- Creating, updating, or modifying notes
- Multi-step operations that require reasoning
- Tasks that need to read content and then modify based on it
The subagent has access to all vault tools and can complete complex operations.
Simply describe what needs to be done in natural language.`,
			parameters: z.object({
				task: z
					.string()
					.describe("Description of the task to execute (e.g., 'Create a new meeting note with today's date', 'Mark all tasks complete in the daily note')"),
				context: z
					.string()
					.optional()
					.describe("Additional context to help the subagent (e.g., current note content, user preferences)"),
			}),
			execute: async ({ task, context }) => {
				try {
					if (!this.taskExecutor) {
						return JSON.stringify({
							success: false,
							error: "Task executor not initialized",
						});
					}

					// Get current active note context if not provided
					let fullContext = context || "";
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && !fullContext.includes(activeFile.path)) {
						try {
							const content = await this.app.vault.read(activeFile);
							fullContext = `Current note: ${activeFile.path}\n\nContent:\n${content}\n\n${fullContext}`;
						} catch {
							fullContext = `Current note: ${activeFile.path}\n\n${fullContext}`;
						}
					}

					console.log(`[RealtimeAgent] Delegating task to subagent: ${task}`);
					const result = await this.taskExecutor.executeTask(task, fullContext);
					
					this.onToolExecution?.("execute_task", { task }, result);
					
					return JSON.stringify(result);
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Web search tool - performs a search query using DuckDuckGo
		const webSearch = tool({
			name: "web_search",
			description: "Search the web for information. Use this to look up current events, facts, or any information not in the vault. Returns search results with titles, URLs, and snippets.",
			parameters: z.object({
				query: z
					.string()
					.describe("The search query to look up on the web"),
				limit: z
					.number()
					.optional()
					.describe("Maximum number of results to return (default: 5)"),
			}),
			execute: async ({ query, limit = 5 }) => {
				try {
					// Use DuckDuckGo HTML search (no API key required)
					const encodedQuery = encodeURIComponent(query);
					const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
					
					const response = await fetch(searchUrl, {
						headers: {
							"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
						},
					});
					
					if (!response.ok) {
						return JSON.stringify({
							success: false,
							error: `Search request failed: ${response.status}`,
						});
					}
					
					const html = await response.text();
					
					// Parse search results from DuckDuckGo HTML
					const results: Array<{ title: string; url: string; snippet: string }> = [];
					
					// Match result blocks - DuckDuckGo HTML format
					const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/gi;
					let match;
					
					while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
						const url = match[1] || "";
						const title = (match[2] || "").trim();
						const snippet = (match[3] || "").trim();
						
						if (title && url) {
							// DuckDuckGo redirects through uddg parameter
							const actualUrl = url.includes("uddg=") 
								? decodeURIComponent(url.split("uddg=")[1]?.split("&")[0] || url)
								: url;
							
							results.push({ title, url: actualUrl, snippet });
						}
					}
					
					// Fallback: try simpler regex if no results found
					if (results.length === 0) {
						const simpleRegex = /<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<a[^>]*class="result__a"[^>]*>([^<]*)<\/a>/gi;
						while ((match = simpleRegex.exec(html)) !== null && results.length < limit) {
							const url = match[1] || "";
							const title = (match[2] || "").trim();
							if (title && url) {
								results.push({ title, url, snippet: "" });
							}
						}
					}
					
					this.onToolExecution?.(
						"web_search",
						{ query, limit },
						{ resultCount: results.length }
					);
					
					return JSON.stringify({
						success: true,
						query,
						results,
						resultCount: results.length,
					});
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		});

		// Add built-in tools based on configuration
		const toolMap: Array<{ name: RealtimeToolName; tool: ReturnType<typeof tool> }> = [
			{ name: "read_note", tool: readNote },
			{ name: "search_notes", tool: searchNotes },
			{ name: "get_active_note", tool: getActiveNote },
			{ name: "list_notes", tool: listNotes },
			{ name: "fetch_web_page", tool: fetchWebPage },
			{ name: "web_search", tool: webSearch },
			{ name: "create_note", tool: createNote },
			{ name: "append_to_note", tool: appendToNote },
			{ name: "update_note", tool: updateNote },
			{ name: "replace_note", tool: replaceNote },
			{ name: "mark_tasks_complete", tool: markTasksComplete },
			{ name: "execute_task", tool: executeTask },
		];
		
		for (const { name, tool: t } of toolMap) {
			if (this.isToolEnabled(name)) {
				tools.push(t);
			}
		}
		
		console.log(`[RealtimeAgent] Enabled ${tools.length} built-in tools`);

		return tools;
	}

	/**
	 * Create tools from connected MCP servers
	 */
	private createMcpTools(): ReturnType<typeof tool>[] {
		const mcpManager = this.config.mcpManager;
		if (!mcpManager) return [];

		const mcpToolDefs = mcpManager.getSdkToolDefinitions();
		const tools: ReturnType<typeof tool>[] = [];

		for (const def of mcpToolDefs) {
			try {
				// Convert JSON schema to a basic Zod object
				// The MCP tools have JSON Schema format, we need to handle them
				const inputSchema = def.parameters as Record<string, unknown>;
				const properties = (inputSchema.properties || {}) as Record<string, unknown>;
				const required = (inputSchema.required || []) as string[];

				// Build Zod schema dynamically from JSON Schema properties
				const zodShape: Record<string, z.ZodTypeAny> = {};
				
				for (const [key, prop] of Object.entries(properties)) {
					const propSchema = prop as { type?: string; description?: string };
					let zodType: z.ZodTypeAny;

					switch (propSchema.type) {
						case "string":
							zodType = z.string();
							break;
						case "number":
						case "integer":
							zodType = z.number();
							break;
						case "boolean":
							zodType = z.boolean();
							break;
						case "array":
							zodType = z.array(z.unknown());
							break;
						case "object":
							zodType = z.record(z.string(), z.unknown());
							break;
						default:
							zodType = z.unknown();
					}

					if (propSchema.description) {
						zodType = zodType.describe(propSchema.description);
					}

					if (!required.includes(key)) {
						zodType = zodType.optional();
					}

					zodShape[key] = zodType;
				}

				const serverId = def.serverId;
				// Extract original tool name (remove mcp_<servername>_ prefix)
				const originalToolName = def.name.replace(/^mcp_[^_]+_/, "");

				const mcpTool = tool({
					name: def.name,
					description: def.description,
					parameters: z.object(zodShape),
					execute: async (args) => {
						try {
							const result = await mcpManager.callTool(
								serverId,
								originalToolName,
								args as Record<string, unknown>
							);
							this.onToolExecution?.(
								def.name,
								args,
								result
							);
							return typeof result === "string" 
								? result 
								: JSON.stringify(result);
						} catch (error) {
							return JSON.stringify({ 
								success: false, 
								error: String(error) 
							});
						}
					},
				});

				tools.push(mcpTool);
				console.log(`[RealtimeAgent] Added MCP tool: ${def.name}`);
			} catch (error) {
				console.warn(`[RealtimeAgent] Failed to create MCP tool ${def.name}:`, error);
			}
		}

		return tools;
	}

	/**
	 * Generate an ephemeral key for WebRTC connection
	 */
	private async getEphemeralKey(): Promise<string> {
		const response = await fetch(
			"https://api.openai.com/v1/realtime/client_secrets",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					session: {
						type: "realtime",
						model: "gpt-4o-realtime-preview",
					},
				}),
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get ephemeral key: ${response.status} ${error}`);
		}

		const data = await response.json();
		return data.client_secret?.value || data.value;
	}

	/**
	 * Connect to the realtime session
	 */
	async connect(): Promise<void> {
		if (this.state !== "idle") {
			throw new Error(`Cannot connect: agent is in ${this.state} state`);
		}

		try {
			this.setState("connecting");

			// Create all tools for the agent
			const allTools = this.createTools();

			// Log tools being registered for debugging
			console.log(`[RealtimeAgent] Creating agent with ${allTools.length} tools:`, 
				allTools.map(t => t.name)
			);

			// Create a single agent with all tools (simpler, more reliable than handoffs)
			// Build a list of tool names for the instructions
			const toolNames = allTools.map(t => t.name).join(', ');
			
			this.agent = new RealtimeAgent({
				name: "Vault Assistant",
				instructions:
					this.config.instructions ||
					`You are a helpful voice assistant for an Obsidian knowledge vault.

YOUR AVAILABLE TOOLS (use these EXACT names):
${toolNames}

CRITICAL RULES:
1. To mark tasks complete, call the "mark_tasks_complete" tool with the note path
2. To modify notes, call "update_note" or "append_to_note" 
3. To delegate complex work, call "execute_task" with a description
4. NEVER output text that looks like code, JSON, or function calls
5. NEVER invent tool names - only use the tools listed above
6. When you need to take an action, USE A TOOL - don't describe what you would do

WRONG: Saying "update_checklist(...)" or outputting JSON
RIGHT: Actually calling the mark_tasks_complete tool

When [INTERNAL CONTEXT UPDATE] messages arrive, note them silently - do not speak about them.

Be conversational. After using a tool, briefly confirm what you did.`,
				tools: allTools,
				voice: this.config.voice || "alloy",
			});

			// Create session with configuration
			this.session = new RealtimeSession(this.agent, {
				model: "gpt-4o-realtime-preview",
				config: {
					toolChoice: "auto",  // Ensure tools can be called
					voice: this.config.voice || "alloy",
					inputAudioTranscription: {
						model: "whisper-1",
						...(this.config.language ? { language: this.config.language } : {}),
					},
					turnDetection: {
						type: this.config.turnDetection || "server_vad",
						threshold: 0.5,
						prefix_padding_ms: 300,
						silence_duration_ms: 500,
						create_response: true,
					},
				},
			});

			// Debug: Log the session config that will be sent
			const sessionConfig = await this.session.getInitialSessionConfig();
			console.log('[RealtimeAgent] Session config tools count:', sessionConfig.tools?.length || 0);
			console.log('[RealtimeAgent] Session config toolChoice:', sessionConfig.toolChoice);
			if (sessionConfig.tools && sessionConfig.tools.length > 0) {
				console.log('[RealtimeAgent] First tool in session:', sessionConfig.tools[0]);
			}

			// Set up event handlers
			this.setupEventHandlers();

			// Get ephemeral key and connect
			const ephemeralKey = await this.getEphemeralKey();
			await this.session.connect({ apiKey: ephemeralKey });

			this.setState("connected");
			new Notice("Realtime agent connected");
		} catch (error) {
			this.setState("error");
			this.emit("error", error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Set up event handlers for the session
	 */
	private setupEventHandlers(): void {
		if (!this.session) return;

		// Handle history updates (transcripts)
		this.session.on("history_updated", (history) => {
			// Debug: Check for function_call items in history
			const functionCalls = history.filter(item => item.type === 'function_call');
			if (functionCalls.length > 0) {
				console.log('[RealtimeAgent] Function calls in history:', functionCalls);
			}
			
			// Convert to our format and emit
			const items: RealtimeHistoryItem[] = history.map((item) => {
				// item is a RealtimeItem from the SDK
				const result: RealtimeHistoryItem = {
					type: item.type as RealtimeHistoryItem["type"],
				};

				// Extract role and content from message items
				if ("role" in item) {
					result.role = item.role as RealtimeHistoryItem["role"];
				}

				// Extract text content or transcript from message content array
				if ("content" in item && Array.isArray(item.content)) {
					for (const contentItem of item.content) {
						if ("text" in contentItem && contentItem.text) {
							result.content = contentItem.text;
						}
						if ("transcript" in contentItem && contentItem.transcript) {
							result.transcript = contentItem.transcript;
						}
					}
				}

				// Extract function call details
				if (item.type === "function_call") {
					if ("name" in item) result.name = item.name as string;
					if ("arguments" in item) result.arguments = item.arguments as string;
					if ("output" in item) result.output = item.output as string | undefined;
				}

				return result;
			});
			this.emit("historyUpdated", items);

			// Emit individual transcript items for messages with content
			const lastItem = items[items.length - 1];
			if (lastItem && (lastItem.content || lastItem.transcript)) {
				this.emit("transcript", lastItem);
				
				// WORKAROUND: Detect structured output that looks like a tool call and execute it
				// The realtime model sometimes outputs JSON/code text instead of calling functions
				const content = lastItem.content || lastItem.transcript || '';
				const trimmed = content.trim();
				if (lastItem.role === 'assistant' && 
					(trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.match(/^\w+\s*\(/))) {
					this.handlePossibleJsonToolCall(content);
				}
			}
		});

		// Handle audio interruption
		this.session.on("audio_interrupted", () => {
			this.emit("interrupted");
		});

		// Handle agent audio start (speaking)
		this.session.on("audio_start", () => {
			this.setState("speaking");
		});

		// Handle agent audio stop
		this.session.on("audio_stopped", () => {
			if (this.state === "speaking") {
				this.setState("connected");
			}
		});

		// Handle agent tool calls
		this.session.on("agent_tool_start", (_context, _agent, tool, details) => {
			console.log('[RealtimeAgent] Tool call STARTED:', tool.name, details.toolCall);
		});
		
		this.session.on("agent_tool_end", (_context, _agent, tool, result, details) => {
			console.log('[RealtimeAgent] Tool call COMPLETED:', tool.name, 'result:', result?.substring(0, 200));
			this.emit("toolExecution", tool.name, details.toolCall, result);
		});

		// Debug: Log raw transport events to see what's coming from the API
		this.session.on("transport_event", (event) => {
			// Only log relevant events
			const eventType = (event as Record<string, unknown>).type as string;
			if (eventType?.includes('function') || eventType?.includes('tool')) {
				console.log('[RealtimeAgent] Transport event (tool-related):', event);
			}
		});

		// Handle errors
		this.session.on("error", (error) => {
			this.emit("error", new Error(String(error.error)));
		});
	}

	/**
	 * Disconnect from the session
	 */
	async disconnect(): Promise<void> {
		try {
			if (this.session) {
				this.session.close();
				this.session = null;
			}
			this.agent = null;
			this.setState("idle");
		} catch (error) {
			console.error("[RealtimeAgent] Error disconnecting:", error);
			this.setState("idle");
		}
	}

	/**
	 * Manually interrupt the agent
	 */
	interrupt(): void {
		if (this.session && this.state === "speaking") {
			this.session.interrupt();
		}
	}

	/**
	 * Send a text message to the agent
	 */
	sendMessage(text: string): void {
		if (
			this.session &&
			(this.state === "connected" || this.state === "listening")
		) {
			this.session.sendMessage(text);
		}
	}

	/**
	 * Send context silently without triggering a response or showing in transcript
	 * This adds context to the conversation that the agent can use but isn't displayed
	 */
	sendContext(context: string): void {
		if (
			this.session &&
			(this.state === "connected" || this.state === "listening")
		) {
			// Send as a system-style context message with strong instruction not to respond
			this.session.sendMessage(`[INTERNAL CONTEXT UPDATE - IMPORTANT: Do NOT speak or respond to this message. Simply note this information silently for reference. No acknowledgment needed.]\n\n${context}`);
			console.log('[RealtimeAgent] Context shared silently');
		}
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<RealtimeAgentConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * WORKAROUND: Handle JSON or function-call-like output that looks like a tool call
	 * The realtime model sometimes outputs text instead of calling functions
	 */
	private async handlePossibleJsonToolCall(content: string): Promise<void> {
		const trimmedContent = content.trim();
		
		// Get active file for cases where no path is provided
		const activeFile = this.app.workspace.getActiveFile();
		
		// Check for Python-like function call syntax (e.g., "update_checklist(...)")
		if (trimmedContent.match(/^\w+\s*\(/)) {
			console.log('[RealtimeAgent] Detected function-call-like text output, attempting to parse');
			// Try to extract task completion info from the text
			const completedTaskMatches = trimmedContent.matchAll(/["']([^"']+)["']\s*[,:]\s*(?:completed|done|True|true)/gi);
			const tasks: string[] = [];
			for (const match of completedTaskMatches) {
				if (match[1]) {
					tasks.push(match[1]);
				}
			}
			
			if (tasks.length > 0 && activeFile) {
				console.log('[RealtimeAgent] Extracted tasks to complete:', tasks);
				await this.executeTaskCompletion(activeFile, tasks);
				return;
			}
		}
		
		try {
			const parsed = JSON.parse(trimmedContent);
			
			// Check if this looks like a replace_note call
			if (parsed.path && parsed.content) {
				console.log('[RealtimeAgent] Detected JSON tool output, executing replace_note workaround');
				
				// Normalize path
				let normalizedPath = parsed.path.replace(/\\/g, "/").trim();
				if (!normalizedPath.endsWith(".md")) {
					normalizedPath += ".md";
				}
				
				const file = this.app.vault.getAbstractFileByPath(normalizedPath);
				if (file && file instanceof TFile) {
					await this.app.vault.modify(file, parsed.content);
					console.log('[RealtimeAgent] Workaround: Successfully updated note via JSON intercept');
					this.onToolExecution?.("replace_note", { path: normalizedPath }, { success: true });
					new Notice(`Updated note: ${file.basename}`);
				} else {
					console.warn('[RealtimeAgent] Workaround: Note not found:', normalizedPath);
				}
			}
			// Check for updates array (with or without path - use active note if no path)
			else if (parsed.updates && Array.isArray(parsed.updates)) {
				console.log('[RealtimeAgent] Detected JSON update operation, executing workaround');
				
				let file: TFile | null = null;
				let filePath: string;
				
				if (parsed.path) {
					let normalizedPath = parsed.path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}
					const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (abstractFile instanceof TFile) {
						file = abstractFile;
						filePath = normalizedPath;
					}
				} else if (activeFile) {
					// No path provided - use active note
					file = activeFile;
					filePath = activeFile.path;
					console.log('[RealtimeAgent] No path in JSON, using active note:', filePath);
				}
				
				if (file) {
					let noteContent = await this.app.vault.read(file);
					let modified = false;
					
					for (const update of parsed.updates) {
						// Handle pattern/replacement format (regex-style)
						if (update.pattern && update.replacement !== undefined) {
							try {
								// The model escapes [ ] as \[ \], convert to literal match
								const patternStr = update.pattern.replace(/\\\[/g, '\\[').replace(/\\\]/g, '\\]');
								const regex = new RegExp(patternStr, 'g');
								const newContent = noteContent.replace(regex, update.replacement);
								if (newContent !== noteContent) {
									noteContent = newContent;
									modified = true;
									console.log('[RealtimeAgent] Applied pattern replacement:', update.pattern.substring(0, 50));
								}
							} catch (e) {
								// If regex fails, try literal replacement
								const literal = update.pattern.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\\s/g, ' ');
								if (noteContent.includes(literal)) {
									noteContent = noteContent.replace(literal, update.replacement);
									modified = true;
									console.log('[RealtimeAgent] Applied literal replacement:', literal.substring(0, 50));
								}
							}
						}
						// Handle target/content format (section-based)
						else if (update.target && update.content) {
							// Proper section replacement logic
							const headingRegex = new RegExp(`^(#{1,6})\\s+${this.escapeRegex(update.target.replace(/^#+\s*/, ''))}\\s*$`, "m");
							const match = noteContent.match(headingRegex);
							
							if (match && match.index !== undefined && match[1]) {
								const headingLevel = match[1].length;
								const headingEnd = match.index + match[0].length;
								
								// Find the end of this section (next heading of same or higher level, or EOF)
								const restContent = noteContent.slice(headingEnd);
								const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}}\\s+`, "m");
								const nextMatch = restContent.match(nextHeadingRegex);
								const sectionEnd = nextMatch && nextMatch.index !== undefined 
									? headingEnd + nextMatch.index 
									: noteContent.length;
								
								// Replace the section content (keep heading)
								noteContent = noteContent.slice(0, headingEnd) + "\n\n" + update.content + "\n\n" + noteContent.slice(sectionEnd);
								modified = true;
							}
						}
					}
					
					if (modified) {
						await this.app.vault.modify(file, noteContent);
						console.log('[RealtimeAgent] Workaround: Successfully updated note via JSON intercept (updates array)');
						this.onToolExecution?.("update_note", { path: file.path }, { success: true });
						new Notice(`Updated: ${file.basename}`);
					} else {
						console.warn('[RealtimeAgent] Workaround: No patterns matched in note');
					}
				}
			}
			// Check for checklist/task array format
			else if (parsed.checklist && Array.isArray(parsed.checklist) && activeFile) {
				console.log('[RealtimeAgent] Detected checklist update JSON, executing workaround');
				const tasks = parsed.checklist
					.filter((item: {task?: string; completed?: boolean}) => item.completed === true)
					.map((item: {task?: string}) => item.task || '');
				
				if (tasks.length > 0) {
					await this.executeTaskCompletion(activeFile, tasks);
				}
			}
		} catch (e) {
			// Not valid JSON or not a tool call - ignore
			// Only log if it started with { or [ which suggested it might be JSON
			if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
				console.log('[RealtimeAgent] JSON parse or execution error:', e);
			}
		}
	}
	
	/**
	 * Execute task completion on a file
	 */
	private async executeTaskCompletion(file: TFile, tasks: string[]): Promise<void> {
		let content = await this.app.vault.read(file);
		let modified = false;
		let count = 0;
		
		for (const task of tasks) {
			if (!task) continue;
			
			// Match the unchecked task (try various formats)
			const escapedTask = task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const taskRegex = new RegExp(`- \\[ \\] ${escapedTask}`, 'g');
			const newContent = content.replace(taskRegex, `- [x] ${task}`);
			
			if (newContent !== content) {
				content = newContent;
				modified = true;
				count++;
			}
		}
		
		if (modified) {
			await this.app.vault.modify(file, content);
			console.log(`[RealtimeAgent] Workaround: Marked ${count} tasks complete`);
			this.onToolExecution?.("mark_tasks_complete", { tasks }, { success: true, count });
			new Notice(`Marked ${count} tasks complete`);
		} else {
			console.warn('[RealtimeAgent] Workaround: No matching tasks found');
		}
	}

	/**
	 * Set tool execution callback
	 */
	setToolExecutionCallback(callback: ToolExecutionCallback | null): void {
		this.onToolExecution = callback;
	}

	/**
	 * Get current history
	 */
	getHistory(): RealtimeHistoryItem[] {
		if (!this.session) return [];

		const history = this.session.history || [];
		return history.map((item: unknown) => {
			const h = item as Record<string, unknown>;
			return {
				type: h.type as RealtimeHistoryItem["type"],
				role: h.role as RealtimeHistoryItem["role"],
				content: h.content as string | undefined,
				transcript: h.transcript as string | undefined,
				name: h.name as string | undefined,
				arguments: h.arguments as string | undefined,
				output: h.output as string | undefined,
			};
		});
	}

	/**
	 * Escape regex special characters
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.state !== "idle" && this.state !== "error";
	}

	/**
	 * Destroy the service
	 */
	async destroy(): Promise<void> {
		await this.disconnect();
		this.listeners.clear();
	}
}
