/**
 * Realtime Agent Service - OpenAI Realtime Voice Agent integration
 * 
 * This module provides real-time voice conversation capabilities using OpenAI's Realtime API
 * with support for tools, interruptions, and live transcription.
 * 
 * Primary exports:
 * - MainVaultAssistant: Entry point voice agent with handoff support
 * - BaseVoiceAgent: Abstract base class for custom voice agents
 * - VoiceAgentRegistry: Central registry for voice agent discovery and registration
 * - TaskManagementAgent: Specialist agent for task operations (via task-agent module)
 */

// Primary voice agents
export { BaseVoiceAgent } from "./BaseVoiceAgent";
export { MainVaultAssistant, MAIN_ASSISTANT_DEFINITION_FILE } from "./MainVaultAssistant";

// Voice agent registry for third-party agent registration
export {
	VoiceAgentRegistry,
	getVoiceAgentRegistry,
	type VoiceAgentFactory,
	type VoiceAgentRegistration,
	type VoiceAgentRegistryEvents,
} from "./VoiceAgentRegistry";

export {
	// Types
	type RealtimeVoice,
	type TurnDetectionMode,
	type RealtimeAgentState,
	type RealtimeToolName,
	type RealtimeToolConfig,
	type BaseVoiceAgentConfig,
	type MainVaultAssistantConfig,
	type RealtimeAgentConfig,
	type RealtimeHistoryItem,
	type RealtimeAgentEvents,
	type ToolExecutionCallback,
	type ToolApprovalRequest,
	type ChatOutputCallback,
	type LogLevel,
	// Constants
	DEFAULT_TOOL_CONFIG,
	VAULT_READ_TOOLS,
	VAULT_WRITE_TOOLS,
	WEB_TOOLS,
	TASK_TOOLS,
	OUTPUT_TOOLS,
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
export { createOutputTools } from "./output-tools";
export { createAllTools, isToolEnabled, getToolNames, createToolsForAgent } from "./tool-manager";

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
