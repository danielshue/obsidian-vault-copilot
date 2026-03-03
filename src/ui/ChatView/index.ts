/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ChatView (Basic)
 * @description Exports the base chat view for the Basic plugin.
 * The Basic standalone build uses `BaseCopilotChatView` directly, which provides
 * all core chat functionality without Pro-only features (agents, voice, prompts).
 * @internal
 */

export { BaseCopilotChatView as CopilotChatView, COPILOT_VIEW_TYPE } from "./BaseCopilotChatView";
export { ToolPickerModal } from "./modals/ToolPickerModal";
