/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VaultCopilotCoreAPI
 * @description Public API surface for the Vault Copilot Basic package.
 *
 * This is the canonical entry point that Pro (and third-party plugins) import from
 * when Basic is consumed as an npm package (`@vault-copilot/core`).
 *
 * ## Hook contract
 *
 * Pro can extend Basic through two mechanisms:
 *
 * ### 1. Extension API (runtime — co-installed scenario)
 * When both plugins are installed in Obsidian:
 * ```typescript
 * const basic = app.plugins.getPlugin('obsidian-vault-copilot') as BasicCopilotPlugin;
 *
 * // Register Pro tools so they appear in the CLI session
 * const unsubTools = basic.api.registerToolProvider({ id: 'pro', tools: [...], handler });
 *
 * // Register Pro commands/views/settings sections
 * const unsubCmd = basic.api.registerCommand({ id: 'pro-cmd', name: 'Pro Action', callback });
 *
 * // Inject Pro's GitHubCopilotCliProService instead of the base service
 * const unsubSvc = basic.setCliServiceFactory((app, config) =>
 *   new GitHubCopilotCliProService(app, config as GitHubCopilotCliProConfig)
 * );
 *
 * // On Pro unload:
 * unsubTools(); unsubCmd(); unsubSvc();
 * ```
 *
 * ### 2. Package dependency (standalone scenario — post split)
 * Pro bundles vault-copilot as an npm dependency:
 * ```typescript
 * import { GitHubCopilotCliService, BasicCopilotPlugin } from '@vault-copilot/core';
 *
 * class GitHubCopilotCliProService extends GitHubCopilotCliService {
 *   protected buildTools() { return [...super.buildTools(), ...proTools]; }
 *   protected buildSystemPrompt() { return buildProSystemPrompt(); }
 * }
 * ```
 *
 * ## Shim note (monorepo phase)
 * During the monorepo phase some exports in this package still re-export from Pro's
 * `src/` via shims (e.g. `AppLogger`, settings types). When Basic moves to its own
 * repository those shims become real implementations here.
 *
 * @since 0.1.0
 */

// ── Plugin entry point ────────────────────────────────────────────────────

export { default as BasicCopilotPlugin, COPILOT_VIEW_TYPE } from "./main";

// ── Core chat view ────────────────────────────────────────────────────────

export { CopilotChatView } from "./ui/ChatView";
export type { BaseCopilotChatView } from "./ui/ChatView/BaseCopilotChatView";

// ── Extension API ─────────────────────────────────────────────────────────
// Full API surface: registries, types, and the implementation class.

export * from "./api/index";

// ── GitHub Copilot CLI service (base class — extend in Pro) ───────────────

export { GitHubCopilotCliService } from "./copilot/providers/GitHubCopilotCliService";
export type {
	GitHubCopilotCliConfig,
	ChatMessage,
	ModelInfoResult,
	SessionCompactionResult,
	SessionAgentInfo,
	DEFAULT_REQUEST_TIMEOUT,
	DEFAULT_STOP_TIMEOUT,
} from "./copilot/providers/GitHubCopilotCliService";

// ── Provider base types ───────────────────────────────────────────────────

export type { GitHubCopilotCliConfig as CliConfig } from "./copilot/providers/types";

// ── Log taxonomy ─────────────────────────────────────────────────────────

export { LOG_SOURCES } from "./copilot/logging/LogTaxonomy";

// ── Platform utilities ────────────────────────────────────────────────────

export { isMobile, isDesktop, supportsLocalProcesses } from "./utils/platform";

// ── Extension package system ──────────────────────────────────────────────

export type {
	ExtensionFileType,
	ExtensionFileEntry,
	ExtensionPackageManifest,
	ExtensionPackageValidationResult,
	ExtensionSubmissionRecord,
	ExtensionSubmissionConfig,
	ExtensionRateLimitResult,
} from "./extensions/types";

export { ExtensionPackageValidator } from "./extensions/ExtensionPackageValidator";
export type { ExtensionPackageValidatorOptions } from "./extensions/ExtensionPackageValidator";

export { ExtensionSubmissionService } from "./extensions/ExtensionSubmissionService";
