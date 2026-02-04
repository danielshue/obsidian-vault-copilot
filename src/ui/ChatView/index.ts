/**
 * ChatView module exports
 * 
 * This module contains all components related to the main chat view:
 * - CopilotChatView: The main chat view component
 * - SessionPanel: Session management panel
 * - ToolPickerModal: Tool selection modal
 * - SlashCommands: Slash command definitions
 * - NoteSuggestModal: Note picker modal
 * - WelcomeMessage: Welcome screen rendering
 * - PromptPicker: Prompt picker dropdown
 * - ContextPicker: Context/file picker dropdown
 * - PromptProcessor: Prompt variable processing
 * - MessageRenderer: Message rendering utilities
 */

// Main view component
export { CopilotChatView, COPILOT_VIEW_TYPE } from "./CopilotChatView";

// Supporting components
export { SessionPanel } from "./SessionPanel";
export type { SessionPanelCallbacks } from "./SessionPanel";

export { ToolPickerModal } from "./ToolPickerModal";
export type { ToolPickerModalOptions } from "./ToolPickerModal";

// Picker components
export { PromptPicker } from "./PromptPicker";
export { ContextPicker } from "./ContextPicker";

// Processing utilities
export { PromptProcessor } from "./PromptProcessor";
export { MessageRenderer } from "./MessageRenderer";

// Session management
export { SessionManager } from "./SessionManager";
export type { SessionManagerCallbacks } from "./SessionManager";

// Tool execution rendering
export { ToolExecutionRenderer } from "./ToolExecutionRenderer";
export type { ToolExecutionCallback } from "./ToolExecutionRenderer";

// Tracing
export { TracingModal, TracingView, TRACING_VIEW_TYPE, openTracingPopout } from "./TracingModal";

// Conversation History
export { ConversationHistoryModal, ConversationHistoryView, VOICE_HISTORY_VIEW_TYPE, openVoiceHistoryPopout } from "./ConversationHistoryModal";

// Utilities
export { SLASH_COMMANDS } from "./SlashCommands";
export type { SlashCommand } from "./SlashCommands";

export { NoteSuggestModal } from "./NoteSuggestModal";

export { 
	renderWelcomeMessage, 
	WELCOME_CAPABILITIES, 
	WELCOME_EXAMPLES 
} from "./WelcomeMessage";
export type { WelcomeExample } from "./WelcomeMessage";

// Icons
export * from "./iconSvgs";
