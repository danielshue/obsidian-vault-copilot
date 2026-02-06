/**
 * @module ChatView
 * @description Main chat view module for Vault Copilot.
 * 
 * This module contains all components related to the main chat view:
 * 
 * ## Submodules
 * - **modals/** - Modal dialogs (TracingModal, ToolPickerModal, etc.)
 * - **pickers/** - Dropdown pickers (ContextPicker, PromptPicker)
 * - **renderers/** - Rendering utilities (MessageRenderer, WelcomeMessage)
 * 
 * ## Main Components
 * - **CopilotChatView** - The main chat view component
 * - **SessionPanel** - Session management panel
 * - **SessionManager** - Session state management
 * 
 * @since 0.0.14
 */

// Main view component
export { CopilotChatView, COPILOT_VIEW_TYPE } from "./CopilotChatView";

// Session components
export { SessionPanel } from "./SessionPanel";
export type { SessionPanelCallbacks } from "./SessionPanel";
export { SessionManager } from "./SessionManager";
export type { SessionManagerCallbacks } from "./SessionManager";

// No provider placeholder
export { NoProviderPlaceholder } from "./NoProviderPlaceholder";
export type { NoProviderPlaceholderCallbacks } from "./NoProviderPlaceholder";

// Modals
export * from "./modals";

// Pickers
export * from "./pickers";

// Renderers
export * from "./renderers";

// Processing utilities
export { PromptProcessor } from "./PromptProcessor";

// Utilities
export { SLASH_COMMANDS } from "./SlashCommands";
export type { SlashCommand } from "./SlashCommands";

// Icons
export * from "./iconSvgs";
