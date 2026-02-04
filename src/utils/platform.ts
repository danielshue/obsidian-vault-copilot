/**
 * Platform utilities for cross-platform compatibility
 * Provides platform detection and capability checking for Obsidian
 */

import { Platform } from "obsidian";

/**
 * Detect if running on mobile platform (iOS or Android)
 */
export const isMobile = Platform.isMobile || Platform.isMobileApp;

/**
 * Detect if running on desktop platform
 */
export const isDesktop = Platform.isDesktop || Platform.isDesktopApp;

/**
 * Supported AI provider types
 */
export type SupportedAIProvider = "copilot" | "openai" | "azure-openai";

/**
 * Get list of AI providers available on current platform
 * - Desktop: All providers (Copilot CLI, OpenAI, Azure OpenAI)
 * - Mobile: HTTP-only providers (OpenAI, Azure OpenAI)
 */
export function getAvailableProviders(): SupportedAIProvider[] {
	if (isMobile) {
		return ["openai", "azure-openai"];
	}
	return ["copilot", "openai", "azure-openai"];
}

/**
 * Check if a specific provider is available on current platform
 */
export function isProviderAvailable(provider: SupportedAIProvider): boolean {
	return getAvailableProviders().includes(provider);
}

/**
 * Get list of supported MCP transport types for current platform
 * - Desktop: stdio (local processes) and HTTP (remote servers)
 * - Mobile: HTTP only (no local process spawning)
 */
export function getMcpTransports(): ("stdio" | "http")[] {
	if (isMobile) {
		return ["http"];
	}
	return ["stdio", "http"];
}

/**
 * Check if platform supports spawning local processes
 * - Desktop: Yes (can use child_process)
 * - Mobile: No (no Node.js APIs)
 */
export function supportsLocalProcesses(): boolean {
	return isDesktop;
}
