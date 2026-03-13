/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module providerAvailability (Basic)
 * @description Simplified provider availability check for Basic plugin.
 * 
 * Basic only supports GitHub Copilot CLI, so this module only checks if CLI is installed.
 * Pro has the full implementation that also checks OpenAI/Azure API keys.
 * 
 * @since 0.1.0
 */

import type { App } from "obsidian";
import type { GitHubCopilotCliManager } from "../copilot/providers/GitHubCopilotCliManager";
import { isDesktop } from "./platform";

/** Result of provider availability check */
export interface ProviderAvailabilityStatus {
	available: boolean;
	providers: {
		copilot: {
			available: boolean;
			installed: boolean;
			platformSupported: boolean;
		};
		openai: {
			available: boolean;
			hasApiKey: boolean;
			profileCount: number;
		};
		azureOpenai: {
			available: boolean;
			hasApiKey: boolean;
			profileCount: number;
		};
	};
}

/**
 * Check if any AI provider is available.
 * In Basic, only checks GitHub Copilot CLI status.
 */
export async function checkAnyProviderAvailable(
	_app: App,
	_settings: unknown,
	cliManager?: GitHubCopilotCliManager | null
): Promise<ProviderAvailabilityStatus> {
	// Check Copilot CLI (desktop only)
	let copilotInstalled = false;
	if (isDesktop && cliManager) {
		try {
			// Force-refresh to avoid stale cached status from early plugin init
			const status = await cliManager.getStatus(true);
			copilotInstalled = status.installed;
		} catch {
			copilotInstalled = false;
		}
	}

	return {
		available: isDesktop && copilotInstalled,
		providers: {
			copilot: {
				available: isDesktop && copilotInstalled,
				installed: copilotInstalled,
				platformSupported: isDesktop,
			},
			// Basic doesn't support OpenAI/Azure
			openai: {
				available: false,
				hasApiKey: false,
				profileCount: 0,
			},
			azureOpenai: {
				available: false,
				hasApiKey: false,
				profileCount: 0,
			},
		},
	};
}

/**
 * Synchronous check for provider availability.
 * In Basic, always returns false (no API key support).
 */
export function hasAnyApiKeyConfigured(_app: App, _settings: unknown): boolean {
	return false;
}
