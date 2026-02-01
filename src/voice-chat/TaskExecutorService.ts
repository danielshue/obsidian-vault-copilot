/**
 * TaskExecutorService - A subagent for executing vault operations
 * 
 * This service acts as a tool-execution subagent that the voice agent can delegate to.
 * It uses the standard (non-realtime) agent run to execute complex operations.
 */

import { App, TFile } from "obsidian";
import { Agent, run, tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";
import { z } from "zod";
import { McpManager } from "../copilot/McpManager";

export interface TaskExecutorConfig {
	/** OpenAI API key */
	openaiApiKey: string;
	/** MCP Manager for MCP tools */
	mcpManager?: McpManager;
	/** Model to use (default: gpt-4o-mini for fast execution) */
	model?: string;
}

export interface TaskResult {
	success: boolean;
	message: string;
	details?: unknown;
}

/**
 * Callback for task execution updates
 */
export type TaskExecutionCallback = (
	phase: "started" | "tool_call" | "completed" | "error",
	details: {
		task?: string;
		toolName?: string;
		toolArgs?: unknown;
		result?: TaskResult;
		error?: string;
	}
) => void;

export class TaskExecutorService {
	private app: App;
	private config: TaskExecutorConfig;
	private onExecution: TaskExecutionCallback | null = null;

	constructor(app: App, config: TaskExecutorConfig) {
		this.app = app;
		this.config = config;
	}

	/**
	 * Set callback for execution updates
	 */
	setExecutionCallback(callback: TaskExecutionCallback | null): void {
		this.onExecution = callback;
	}

	/**
	 * Execute a task using the subagent
	 */
	async executeTask(task: string, context?: string): Promise<TaskResult> {
		this.onExecution?.("started", { task });

		try {
			const tools = this.createTools();
			
			const systemMessage = `You are a task execution agent for an Obsidian vault.
Your job is to execute specific tasks using the available tools.

RULES:
1. Execute the requested task using the appropriate tools
2. Be precise and efficient - don't do more than asked
3. Return a brief confirmation of what was done
4. If you can't complete the task, explain why

${context ? `CURRENT CONTEXT:\n${context}` : ""}`;

			// Create a task executor agent
			const taskAgent = new Agent({
				name: "TaskExecutor",
				model: this.config.model || "gpt-4o-mini",
				instructions: systemMessage,
				tools,
			});

			// Run the agent with the task
			const result = await run(taskAgent, task);

			// Extract the final output
			const output = result.finalOutput || "Task completed";
			
			this.onExecution?.("completed", {
				task,
				result: { success: true, message: output },
			});

			return {
				success: true,
				message: output,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			
			this.onExecution?.("error", {
				task,
				error: errorMessage,
			});

			return {
				success: false,
				message: `Failed to execute task: ${errorMessage}`,
			};
		}
	}

	/**
	 * Create the tools available to the task executor
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private createTools(): FunctionTool<any, any>[] {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const tools: FunctionTool<any, any>[] = [];

		// Read note tool
		tools.push(tool({
			name: "read_note",
			description: "Read the content of a note from the vault by its path",
			parameters: z.object({
				path: z.string().describe('The path to the note file (e.g., "folder/note.md" or "note")'),
			}),
			execute: async ({ path }) => {
				try {
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({ success: false, error: `Note not found: ${path}` });
					}

					const content = await this.app.vault.read(file);
					this.emitToolCall("read_note", { path }, { success: true });
					return JSON.stringify({
						success: true,
						path: file.path,
						content: content.length > 8000 ? content.substring(0, 8000) + "\n...[truncated]" : content,
					});
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		}));

		// Search notes tool
		tools.push(tool({
			name: "search_notes",
			description: "Search for notes containing specific text",
			parameters: z.object({
				query: z.string().describe("The text to search for in notes"),
				limit: z.number().optional().describe("Maximum number of results (default 5)"),
			}),
			execute: async ({ query, limit = 5 }) => {
				try {
					const files = this.app.vault.getMarkdownFiles();
					const results: { path: string; snippet: string }[] = [];

					for (const file of files) {
						if (results.length >= limit) break;
						
						const content = await this.app.vault.cachedRead(file);
						const lowerContent = content.toLowerCase();
						const lowerQuery = query.toLowerCase();
						
						if (lowerContent.includes(lowerQuery)) {
							const index = lowerContent.indexOf(lowerQuery);
							const start = Math.max(0, index - 50);
							const end = Math.min(content.length, index + query.length + 50);
							results.push({
								path: file.path,
								snippet: "..." + content.substring(start, end) + "...",
							});
						}
					}

					this.emitToolCall("search_notes", { query, limit }, { count: results.length });
					return JSON.stringify({ success: true, results });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		}));

		// List notes tool
		tools.push(tool({
			name: "list_notes",
			description: "List notes in a specific folder",
			parameters: z.object({
				folder: z.string().optional().describe("Folder path to list (empty for root)"),
			}),
			execute: async ({ folder = "" }) => {
				try {
					const files = this.app.vault.getMarkdownFiles();
					const normalizedFolder = folder.replace(/\\/g, "/").replace(/^\/|\/$/g, "");
					
					const matchingFiles = files.filter((f) => {
						if (!normalizedFolder) return true;
						return f.path.startsWith(normalizedFolder + "/") || f.parent?.path === normalizedFolder;
					});

					const notes = matchingFiles.slice(0, 20).map((f) => ({
						path: f.path,
						name: f.basename,
					}));

					this.emitToolCall("list_notes", { folder }, { count: notes.length });
					return JSON.stringify({ success: true, notes, total: matchingFiles.length });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		}));

		// Create note tool
		tools.push(tool({
			name: "create_note",
			description: "Create a new note in the vault",
			parameters: z.object({
				path: z.string().describe('Path for the new note (e.g., "folder/new-note.md")'),
				content: z.string().describe("Content to write to the note"),
			}),
			execute: async ({ path, content }) => {
				try {
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (existing) {
						return JSON.stringify({ success: false, error: `Note already exists: ${normalizedPath}` });
					}

					const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
					if (folderPath) {
						const folder = this.app.vault.getAbstractFileByPath(folderPath);
						if (!folder) {
							await this.app.vault.createFolder(folderPath);
						}
					}

					await this.app.vault.create(normalizedPath, content);
					this.emitToolCall("create_note", { path: normalizedPath }, { success: true });
					return JSON.stringify({ success: true, path: normalizedPath });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		}));

		// Append to note tool
		tools.push(tool({
			name: "append_to_note",
			description: "Append content to the end of an existing note",
			parameters: z.object({
				path: z.string().describe("Path to the note"),
				content: z.string().describe("Content to append"),
			}),
			execute: async ({ path, content }) => {
				try {
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({ success: false, error: `Note not found: ${path}` });
					}

					await this.app.vault.append(file, "\n" + content);
					this.emitToolCall("append_to_note", { path: normalizedPath }, { success: true });
					return JSON.stringify({ success: true, path: normalizedPath });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		}));

		// Update note tool (pattern-based)
		tools.push(tool({
			name: "update_note",
			description: "Update specific content in a note using pattern matching",
			parameters: z.object({
				path: z.string().describe("Path to the note"),
				pattern: z.string().describe("Text or regex pattern to find"),
				replacement: z.string().describe("Text to replace the pattern with"),
				isRegex: z.boolean().optional().describe("Whether pattern is a regex (default false)"),
			}),
			execute: async ({ path, pattern, replacement, isRegex = false }) => {
				try {
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({ success: false, error: `Note not found: ${path}` });
					}

					const content = await this.app.vault.read(file);
					const regex = isRegex ? new RegExp(pattern, "g") : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
					const newContent = content.replace(regex, replacement);

					if (newContent === content) {
						return JSON.stringify({ success: false, error: "Pattern not found in note" });
					}

					await this.app.vault.modify(file, newContent);
					this.emitToolCall("update_note", { path: normalizedPath, pattern }, { success: true });
					return JSON.stringify({ success: true, path: normalizedPath });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		}));

		// Replace note tool (full content replacement)
		tools.push(tool({
			name: "replace_note",
			description: "Replace the entire content of a note",
			parameters: z.object({
				path: z.string().describe("Path to the note"),
				content: z.string().describe("New content for the note"),
			}),
			execute: async ({ path, content }) => {
				try {
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({ success: false, error: `Note not found: ${path}` });
					}

					await this.app.vault.modify(file, content);
					this.emitToolCall("replace_note", { path: normalizedPath }, { success: true });
					return JSON.stringify({ success: true, path: normalizedPath });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		}));

		// Mark tasks complete tool
		tools.push(tool({
			name: "mark_tasks_complete",
			description: "Mark specific tasks as complete in a note. Changes [ ] to [x] for matching tasks.",
			parameters: z.object({
				path: z.string().describe("Path to the note containing the tasks"),
				task_descriptions: z.array(z.string()).describe("List of task descriptions to mark complete"),
				exceptions: z.array(z.string()).optional().describe("Tasks to leave unchecked"),
			}),
			execute: async ({ path, task_descriptions, exceptions = [] }) => {
				try {
					let normalizedPath = path.replace(/\\/g, "/").trim();
					if (!normalizedPath.endsWith(".md")) {
						normalizedPath += ".md";
					}

					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return JSON.stringify({ success: false, error: `Note not found: ${path}` });
					}

					let content = await this.app.vault.read(file);
					let updatedCount = 0;

					// Process each task description
					for (const taskDesc of task_descriptions) {
						// Skip if in exceptions
						if (exceptions.some((e) => taskDesc.toLowerCase().includes(e.toLowerCase()))) {
							continue;
						}

						// Find and update matching unchecked tasks
						const escapedDesc = taskDesc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						const taskRegex = new RegExp(`(- \\[ \\].*${escapedDesc}.*)`, "gi");
						const newContent = content.replace(taskRegex, (match) => {
							updatedCount++;
							return match.replace("- [ ]", "- [x]");
						});
						content = newContent;
					}

					if (updatedCount === 0) {
						return JSON.stringify({ success: false, error: "No matching tasks found" });
					}

					await this.app.vault.modify(file, content);
					this.emitToolCall("mark_tasks_complete", { path: normalizedPath, count: updatedCount }, { success: true });
					return JSON.stringify({ success: true, path: normalizedPath, tasksMarked: updatedCount });
				} catch (error) {
					return JSON.stringify({ success: false, error: String(error) });
				}
			},
		}));

		return tools;
	}

	/**
	 * Emit a tool call event
	 */
	private emitToolCall(toolName: string, args: unknown, result: unknown): void {
		this.onExecution?.("tool_call", {
			toolName,
			toolArgs: args,
			result: { success: true, message: "ok", details: result },
		});
	}
}
