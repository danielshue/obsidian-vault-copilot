/**
 * Task Tools Module - Exportable task management tools for realtime agents
 * 
 * This module provides:
 * - Task parsing utilities for Obsidian Tasks syntax
 * - Tool factory functions for creating task-related tools
 * - Support for the full Obsidian Tasks emoji format
 */

import { App } from "obsidian";
import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { ToolExecutionCallback, RealtimeToolName } from "./types";
import * as VaultOps from "../copilot/VaultOperations";

// ============================================================================
// Task Parsing Types
// ============================================================================

/** Task priority levels matching Obsidian Tasks emoji format */
export type TaskPriority = 
	| "highest"    // 🔺
	| "high"       // ⏫
	| "medium"     // 🔼
	| "low"        // 🔽
	| "lowest"     // ⏬
	| "none";

/** Task status character */
export type TaskStatus = " " | "x" | "X" | "/" | "-" | ">" | "<" | "!" | "?" | "*";

/** Parsed task with full Obsidian Tasks metadata */
export interface ParsedTask {
	/** Original full line of text */
	originalLine: string;
	/** The task description text (without checkbox and metadata) */
	description: string;
	/** Task status character (space = incomplete, x = complete, etc.) */
	status: TaskStatus;
	/** Whether the task is completed (status is 'x' or 'X') */
	isComplete: boolean;
	/** Priority level (derived from emoji) */
	priority: TaskPriority;
	/** Due date (📅) - ISO string or undefined */
	dueDate?: string;
	/** Scheduled date (⏳) - ISO string or undefined */
	scheduledDate?: string;
	/** Start date (🛫) - ISO string or undefined */
	startDate?: string;
	/** Created date (➕) - ISO string or undefined */
	createdDate?: string;
	/** Done/Completion date (✅) - ISO string or undefined */
	doneDate?: string;
	/** Cancelled date (❌) - ISO string or undefined */
	cancelledDate?: string;
	/** Recurrence rule (🔁) - e.g., "every day", "every week" */
	recurrence?: string;
	/** Tags found in the task (without #) */
	tags: string[];
	/** Line number in the source file (1-indexed, if known) */
	lineNumber?: number;
	/** Path to the note containing this task */
	notePath?: string;
}

/** Options for creating a new task */
export interface CreateTaskOptions {
	/** Task description text */
	description: string;
	/** Priority level */
	priority?: TaskPriority;
	/** Due date (ISO string or Date) */
	dueDate?: string | Date;
	/** Scheduled date (ISO string or Date) */
	scheduledDate?: string | Date;
	/** Start date (ISO string or Date) */
	startDate?: string | Date;
	/** Recurrence rule */
	recurrence?: string;
	/** Tags to add (without #) */
	tags?: string[];
	/** Initial status (default: " " for incomplete) */
	status?: TaskStatus;
}

/** Filter options for listing tasks */
export interface TaskFilter {
	/** Filter by completion status */
	completed?: boolean;
	/** Filter by priority */
	priority?: TaskPriority | TaskPriority[];
	/** Filter tasks due before this date (inclusive) */
	dueBefore?: string | Date;
	/** Filter tasks due after this date (inclusive) */
	dueAfter?: string | Date;
	/** Filter tasks due on this date */
	dueOn?: string | Date;
	/** Filter by tags (any match) */
	tags?: string[];
	/** Limit number of results */
	limit?: number;
	/** Search query in description */
	query?: string;
}

/** Result from task operations */
export interface TaskOperationResult {
	success: boolean;
	tasks?: ParsedTask[];
	tasksModified?: number;
	path?: string;
	error?: string;
}

// ============================================================================
// Task Emoji Constants
// ============================================================================

/** Obsidian Tasks emoji mappings */
const PRIORITY_EMOJIS: Record<TaskPriority, string> = {
	highest: "🔺",
	high: "⏫",
	medium: "🔼",
	low: "🔽",
	lowest: "⏬",
	none: "",
};

const EMOJI_TO_PRIORITY: Record<string, TaskPriority> = {
	"🔺": "highest",
	"⏫": "high",
	"🔼": "medium",
	"🔽": "low",
	"⏬": "lowest",
};

const DATE_EMOJIS = {
	due: "📅",
	scheduled: "⏳",
	start: "🛫",
	created: "➕",
	done: "✅",
	cancelled: "❌",
	recurrence: "🔁",
} as const;

// ============================================================================
// Task Parsing Functions
// ============================================================================

/**
 * Parse a date string from Obsidian Tasks format (YYYY-MM-DD)
 */
function parseDateString(dateStr: string): string | undefined {
	const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
	return match?.[1];
}

/**
 * Format a date for Obsidian Tasks (YYYY-MM-DD)
 */
function formatDate(date: string | Date): string {
	if (typeof date === "string") {
		// Already formatted or extract date portion
		const match = date.match(/(\d{4}-\d{2}-\d{2})/);
		return match?.[1] ?? date;
	}
	return date.toISOString().split("T")[0] ?? "";
}

/**
 * Parse a single task line into structured data
 * 
 * @param line - The markdown line containing the task
 * @param lineNumber - Optional 1-indexed line number
 * @param notePath - Optional path to the source note
 * @returns ParsedTask or null if line is not a valid task
 */
export function parseTaskLine(
	line: string,
	lineNumber?: number,
	notePath?: string
): ParsedTask | null {
	// Match task checkbox pattern: - [ ], - [x], - [/], etc.
	const taskMatch = line.match(/^(\s*[-*]\s*)\[(.)\]\s*(.*)$/);
	if (!taskMatch) {
		return null;
	}

	const statusChar = taskMatch[2] as TaskStatus;
	let content = taskMatch[3] || "";
	const originalLine = line;

	// Extract priority
	let priority: TaskPriority = "none";
	for (const [emoji, p] of Object.entries(EMOJI_TO_PRIORITY)) {
		if (content.includes(emoji)) {
			priority = p;
			content = content.replace(emoji, "").trim();
			break;
		}
	}

	// Extract dates
	let dueDate: string | undefined;
	let scheduledDate: string | undefined;
	let startDate: string | undefined;
	let createdDate: string | undefined;
	let doneDate: string | undefined;
	let cancelledDate: string | undefined;
	let recurrence: string | undefined;

	// Due date: 📅 YYYY-MM-DD
	const dueMatch = content.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
	if (dueMatch?.[1]) {
		dueDate = parseDateString(dueMatch[1]);
		content = content.replace(dueMatch[0], "").trim();
	}

	// Scheduled date: ⏳ YYYY-MM-DD
	const scheduledMatch = content.match(/⏳\s*(\d{4}-\d{2}-\d{2})/);
	if (scheduledMatch?.[1]) {
		scheduledDate = parseDateString(scheduledMatch[1]);
		content = content.replace(scheduledMatch[0], "").trim();
	}

	// Start date: 🛫 YYYY-MM-DD
	const startMatch = content.match(/🛫\s*(\d{4}-\d{2}-\d{2})/);
	if (startMatch?.[1]) {
		startDate = parseDateString(startMatch[1]);
		content = content.replace(startMatch[0], "").trim();
	}

	// Created date: ➕ YYYY-MM-DD
	const createdMatch = content.match(/➕\s*(\d{4}-\d{2}-\d{2})/);
	if (createdMatch?.[1]) {
		createdDate = parseDateString(createdMatch[1]);
		content = content.replace(createdMatch[0], "").trim();
	}

	// Done date: ✅ YYYY-MM-DD
	const doneMatch = content.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
	if (doneMatch?.[1]) {
		doneDate = parseDateString(doneMatch[1]);
		content = content.replace(doneMatch[0], "").trim();
	}

	// Cancelled date: ❌ YYYY-MM-DD
	const cancelledMatch = content.match(/❌\s*(\d{4}-\d{2}-\d{2})/);
	if (cancelledMatch?.[1]) {
		cancelledDate = parseDateString(cancelledMatch[1]);
		content = content.replace(cancelledMatch[0], "").trim();
	}

	// Recurrence: 🔁 every day/week/month/year
	const recurrenceMatch = content.match(/🔁\s*([^📅⏳🛫➕✅❌🔺⏫🔼🔽⏬#]+)/);
	if (recurrenceMatch?.[1]) {
		recurrence = recurrenceMatch[1].trim();
		content = content.replace(recurrenceMatch[0], "").trim();
	}

	// Extract tags
	const tags: string[] = [];
	const tagMatches = content.matchAll(/#([^\s#]+)/g);
	for (const match of tagMatches) {
		if (match[1]) tags.push(match[1]);
	}
	// Remove tags from description for cleaner output
	const description = content.replace(/#[^\s#]+/g, "").trim();

	return {
		originalLine,
		description,
		status: statusChar,
		isComplete: statusChar === "x" || statusChar === "X",
		priority,
		dueDate,
		scheduledDate,
		startDate,
		createdDate,
		doneDate,
		cancelledDate,
		recurrence,
		tags,
		lineNumber,
		notePath,
	};
}

/**
 * Parse all tasks from note content
 * 
 * @param content - The markdown content of a note
 * @param notePath - Optional path to the source note
 * @returns Array of parsed tasks
 */
export function parseTasksFromContent(
	content: string,
	notePath?: string
): ParsedTask[] {
	const tasks: ParsedTask[] = [];
	const lines = content.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line !== undefined) {
			const task = parseTaskLine(line, i + 1, notePath);
			if (task) {
				tasks.push(task);
			}
		}
	}

	return tasks;
}

/**
 * Build a task line from options
 * 
 * @param options - Options for creating the task
 * @returns Formatted task markdown line
 */
export function buildTaskLine(options: CreateTaskOptions): string {
	const status = options.status || " ";
	let line = `- [${status}] ${options.description}`;

	// Add priority emoji
	if (options.priority && options.priority !== "none") {
		line += ` ${PRIORITY_EMOJIS[options.priority]}`;
	}

	// Add due date
	if (options.dueDate) {
		line += ` ${DATE_EMOJIS.due} ${formatDate(options.dueDate)}`;
	}

	// Add scheduled date
	if (options.scheduledDate) {
		line += ` ${DATE_EMOJIS.scheduled} ${formatDate(options.scheduledDate)}`;
	}

	// Add start date
	if (options.startDate) {
		line += ` ${DATE_EMOJIS.start} ${formatDate(options.startDate)}`;
	}

	// Add recurrence
	if (options.recurrence) {
		line += ` ${DATE_EMOJIS.recurrence} ${options.recurrence}`;
	}

	// Add tags
	if (options.tags && options.tags.length > 0) {
		for (const tag of options.tags) {
			line += ` #${tag}`;
		}
	}

	// Add created date
	const today = new Date().toISOString().split("T")[0];
	line += ` ${DATE_EMOJIS.created} ${today}`;

	return line;
}

/**
 * Filter tasks based on criteria
 */
export function filterTasks(
	tasks: ParsedTask[],
	filter: TaskFilter
): ParsedTask[] {
	let result = [...tasks];

	// Filter by completion status
	if (filter.completed !== undefined) {
		result = result.filter((t) => t.isComplete === filter.completed);
	}

	// Filter by priority
	if (filter.priority !== undefined) {
		const priorities = Array.isArray(filter.priority)
			? filter.priority
			: [filter.priority];
		result = result.filter((t) => priorities.includes(t.priority));
	}

	// Filter by due date
	if (filter.dueBefore) {
		const before = formatDate(filter.dueBefore);
		result = result.filter((t) => t.dueDate && t.dueDate <= before);
	}
	if (filter.dueAfter) {
		const after = formatDate(filter.dueAfter);
		result = result.filter((t) => t.dueDate && t.dueDate >= after);
	}
	if (filter.dueOn) {
		const on = formatDate(filter.dueOn);
		result = result.filter((t) => t.dueDate === on);
	}

	// Filter by tags
	if (filter.tags && filter.tags.length > 0) {
		result = result.filter((t) =>
			filter.tags!.some((tag) => t.tags.includes(tag))
		);
	}

	// Filter by query in description
	if (filter.query) {
		const lowerQuery = filter.query.toLowerCase();
		result = result.filter((t) =>
			t.description.toLowerCase().includes(lowerQuery)
		);
	}

	// Apply limit
	if (filter.limit && filter.limit > 0) {
		result = result.slice(0, filter.limit);
	}

	return result;
}

// ============================================================================
// Tool Names Constant
// ============================================================================

/** Tool names for task tools */
export const TASK_TOOL_NAMES = [
	"get_tasks",
	"mark_tasks",
	"create_task",
	"list_tasks",
] as const;

export type TaskToolName = (typeof TASK_TOOL_NAMES)[number];

// ============================================================================
// Tool Factory Functions
// ============================================================================

/**
 * Create the get_tasks tool for parsing all tasks with metadata
 */
export function createGetTasksTool(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	needsApproval = false
): ReturnType<typeof tool> {
	return tool({
		name: "get_tasks",
		description:
			"Get all tasks from a note with full Obsidian Tasks metadata including priorities, dates, recurrence, and tags. Returns structured task data for analysis.",
		parameters: z.object({
			path: z
				.string()
				.optional()
				.describe(
					"Path to the note (e.g., 'Daily Notes/2026-01-31.md'). If not provided, uses the active note."
				),
		}),
		needsApproval,
		execute: async ({ path }) => {
			const result = await VaultOps.getTasksFromNote(app, path);
			onToolExecution?.("get_tasks", { path }, {
				count: result.tasks?.length ?? 0,
				success: result.success,
			});
			return JSON.stringify(result);
		},
	});
}

/**
 * Create the mark_tasks tool for marking tasks complete or incomplete
 */
export function createMarkTasksTool(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	needsApproval = false
): ReturnType<typeof tool> {
	return tool({
		name: "mark_tasks",
		description:
			"Mark tasks as complete or incomplete. Can check off tasks ([ ] → [x]) or uncheck them ([x] → [ ]). Supports marking multiple tasks at once.",
		parameters: z.object({
			tasks: z
				.array(z.string())
				.describe(
					"Array of task description text strings to modify (text after the checkbox)"
				),
			complete: z
				.boolean()
				.default(true)
				.describe(
					"true to mark tasks complete ([x]), false to mark incomplete ([ ]). Default: true"
				),
			exceptions: z
				.array(z.string())
				.optional()
				.describe("Task text strings to exclude from the operation"),
			path: z
				.string()
				.optional()
				.describe(
					"Path to the note. If not provided, uses the active note."
				),
		}),
		needsApproval,
		execute: async ({ tasks, complete, exceptions = [], path }) => {
			const result = await VaultOps.updateTaskStatus(
				app,
				tasks,
				complete,
				exceptions,
				path
			);
			onToolExecution?.("mark_tasks", { tasks, complete, exceptions, path }, result);
			return JSON.stringify(result);
		},
	});
}

/**
 * Create the create_task tool for creating new tasks with full syntax support
 */
export function createCreateTaskTool(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	needsApproval = false
): ReturnType<typeof tool> {
	return tool({
		name: "create_task",
		description:
			"Create a new task with full Obsidian Tasks syntax support. Supports priorities (highest/high/medium/low/lowest), due dates, scheduled dates, start dates, recurrence rules, and tags.",
		parameters: z.object({
			path: z
				.string()
				.describe(
					"Path to the note where the task should be added (e.g., 'Daily Notes/2026-01-31.md')"
				),
			description: z.string().describe("The task description text"),
			priority: z
				.enum(["highest", "high", "medium", "low", "lowest", "none"])
				.optional()
				.describe("Priority level (default: none)"),
			dueDate: z
				.string()
				.optional()
				.describe("Due date in YYYY-MM-DD format (📅)"),
			scheduledDate: z
				.string()
				.optional()
				.describe("Scheduled date in YYYY-MM-DD format (⏳)"),
			startDate: z
				.string()
				.optional()
				.describe("Start date in YYYY-MM-DD format (🛫)"),
			recurrence: z
				.string()
				.optional()
				.describe(
					"Recurrence rule (e.g., 'every day', 'every week', 'every month on the 1st')"
				),
			tags: z
				.array(z.string())
				.optional()
				.describe("Tags to add (without # prefix)"),
		}),
		needsApproval,
		execute: async ({
			path,
			description,
			priority,
			dueDate,
			scheduledDate,
			startDate,
			recurrence,
			tags,
		}) => {
			const result = await VaultOps.createTask(app, {
				path,
				description,
				priority: priority as TaskPriority | undefined,
				dueDate,
				scheduledDate,
				startDate,
				recurrence,
				tags,
			});
			onToolExecution?.(
				"create_task",
				{ path, description, priority, dueDate, tags },
				result
			);
			return JSON.stringify(result);
		},
	});
}

/**
 * Create the list_tasks tool for filtered task queries
 */
export function createListTasksTool(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	needsApproval = false
): ReturnType<typeof tool> {
	return tool({
		name: "list_tasks",
		description:
			"Query and filter tasks across notes. Filter by completion status, priority, due dates, tags, or search query. Returns matching tasks with full metadata.",
		parameters: z.object({
			path: z
				.string()
				.optional()
				.describe(
					"Path to a specific note. If not provided, searches the active note."
				),
			completed: z
				.boolean()
				.optional()
				.describe("Filter by completion status (true=completed, false=pending)"),
			priority: z
				.enum(["highest", "high", "medium", "low", "lowest", "none"])
				.optional()
				.describe("Filter by priority level"),
			dueBefore: z
				.string()
				.optional()
				.describe("Filter tasks due before this date (YYYY-MM-DD, inclusive)"),
			dueAfter: z
				.string()
				.optional()
				.describe("Filter tasks due after this date (YYYY-MM-DD, inclusive)"),
			dueOn: z
				.string()
				.optional()
				.describe("Filter tasks due on this exact date (YYYY-MM-DD)"),
			tags: z
				.array(z.string())
				.optional()
				.describe("Filter by tags (without # prefix, matches any)"),
			query: z
				.string()
				.optional()
				.describe("Search query to match in task descriptions"),
			limit: z
				.number()
				.optional()
				.describe("Maximum number of tasks to return (default: 50)"),
		}),
		needsApproval,
		execute: async ({
			path,
			completed,
			priority,
			dueBefore,
			dueAfter,
			dueOn,
			tags,
			query,
			limit,
		}) => {
			const result = await VaultOps.listTasks(app, {
				path,
				completed,
				priority: priority as TaskPriority | undefined,
				dueBefore,
				dueAfter,
				dueOn,
				tags,
				query,
				limit: limit ?? 50,
			});
			onToolExecution?.(
				"list_tasks",
				{ path, completed, priority, dueBefore, dueAfter, tags, query, limit },
				{ count: result.tasks?.length ?? 0, success: result.success }
			);
			return JSON.stringify(result);
		},
	});
}

/**
 * Create all task tools as a bundle
 * 
 * @param app - Obsidian App instance
 * @param onToolExecution - Optional callback for tool execution events
 * @param requiresApproval - Set of tool names that require user approval
 * @returns Array of all task tools
 */
export function createAllTaskTools(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	requiresApproval: Set<RealtimeToolName> = new Set()
): ReturnType<typeof tool>[] {
	return [
		createGetTasksTool(
			app,
			onToolExecution,
			requiresApproval.has("get_tasks" as RealtimeToolName)
		),
		createMarkTasksTool(
			app,
			onToolExecution,
			requiresApproval.has("mark_tasks" as RealtimeToolName)
		),
		createCreateTaskTool(
			app,
			onToolExecution,
			requiresApproval.has("create_task" as RealtimeToolName)
		),
		createListTasksTool(
			app,
			onToolExecution,
			requiresApproval.has("list_tasks" as RealtimeToolName)
		),
	];
}
