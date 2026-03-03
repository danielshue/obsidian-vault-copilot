/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AIProvider (Basic)
 * @description Minimal AI provider types for Basic plugin.
 * 
 * Basic only uses the GitHubCopilotCliService, not the abstract AIProvider class.
 * These types are exported for interface compatibility with code that expects them.
 * 
 * @since 0.1.0
 */

import type { ChatMessage } from "./GitHubCopilotCliService";

/** Supported AI provider types */
export type AIProviderType = "copilot" | "openai" | "azure-openai";

/** Streaming options for message sending */
export interface StreamingOptions {
	onDelta?: (delta: string) => void;
	onComplete?: () => void;
}

/**
 * Abstract AI provider interface.
 * Basic doesn't implement this — it uses GitHubCopilotCliService directly.
 * This interface exists for type compatibility.
 */
export interface AIProvider {
	readonly provider: AIProviderType;
	initialize(): Promise<void>;
	sendMessage(prompt: string): Promise<string>;
	sendMessageStreaming(prompt: string, options?: StreamingOptions): Promise<string>;
	getMessageHistory(): ChatMessage[];
	clearHistory(): void;
	isConnected(): boolean;
}

/** Helper to get OpenAI API key from environment */
export function getOpenAIApiKey(): string | undefined {
	if (typeof process !== "undefined" && process.env) {
		return process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
	}
	return undefined;
}
