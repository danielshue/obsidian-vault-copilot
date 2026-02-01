/**
 * Realtime Agent Service - OpenAI Realtime Voice Agent integration
 * 
 * This module provides real-time voice conversation capabilities using OpenAI's Realtime API
 * with support for tools, interruptions, and live transcription.
 */

export { RealtimeAgentService } from "./RealtimeAgentService";

export {
	// Types
	type RealtimeVoice,
	type TurnDetectionMode,
	type RealtimeAgentState,
	type RealtimeToolName,
	type RealtimeToolConfig,
	type RealtimeAgentConfig,
	type RealtimeHistoryItem,
	type RealtimeAgentEvents,
	type ToolExecutionCallback,
	type ToolApprovalRequest,
	type LogLevel,
	// Constants
	DEFAULT_TOOL_CONFIG,
	VAULT_READ_TOOLS,
	VAULT_WRITE_TOOLS,
	WEB_TOOLS,
	TASK_TOOLS,
	REALTIME_MODEL,
	// Logger utilities
	logger,
	setLogLevel,
	getLogLevel,
} from "./types";

// Re-export tool creation functions for advanced use cases
export { createVaultTools } from "./vault-tools";
export { createWebTools } from "./web-tools";
export { createMcpTools } from "./mcp-tools";
export { createAllTools, isToolEnabled, getToolNames } from "./tool-manager";

// Re-export task tools and utilities
export {
	// Task tool factories
	createAllTaskTools,
	createGetTasksTool,
	createMarkTasksTool,
	createCreateTaskTool,
	createListTasksTool,
	// Task parsing utilities
	parseTaskLine,
	parseTasksFromContent,
	buildTaskLine,
	filterTasks,
	// Task types
	type ParsedTask,
	type TaskPriority,
	type TaskStatus,
	type TaskFilter,
	type TaskOperationResult,
	type CreateTaskOptions,
	type TaskToolName,
	// Constants
	TASK_TOOL_NAMES,
} from "./task-tools";
