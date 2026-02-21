/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationIntegration
 * @description Integration layer between ExtensionManager and AutomationEngine.
 * 
 * This module provides hooks to register/unregister automations when
 * automation extensions are installed/uninstalled through the extension marketplace.
 * 
 * @example
 * ```typescript
 * import { handleAutomationInstall, handleAutomationUninstall } from './AutomationIntegration';
 * 
 * // After installing an automation extension
 * if (manifest.kind === 'automation') {
 *   await handleAutomationInstall(app, plugin, manifest);
 * }
 * 
 * // Before uninstalling an automation extension
 * if (record.kind === 'automation') {
 *   await handleAutomationUninstall(app, plugin, extensionId);
 * }
 * ```
 *
 * @see {@link getAutomationEngine}
 * @see {@link AutomationConfig}
 * 
 * @since 0.1.0
 */

import { App } from 'obsidian';
import type VaultCopilotPlugin from '../main';
import { getAutomationEngine } from './AutomationEngine';
import { AutomationAction, AutomationConfig, AutomationInstance, AutomationTrigger } from './types';
import { MarketplaceExtension } from '../extensions/types';
import { parseFrontmatter } from '../copilot/customization/CustomizationLoader';

/**
 * Handle automation extension installation.
 * Reads the automation manifest and registers it with the AutomationEngine.
 *
 * @param app - Obsidian app instance
 * @param plugin - Plugin instance
 * @param manifest - Extension manifest
 * @returns Resolves when installation registration is complete
 * @throws {Error} If automation configuration is invalid or registration fails
 *
 * @example
 * ```typescript
 * await handleAutomationInstall(app, plugin, manifest);
 * ```
 */
export async function handleAutomationInstall(
	app: App,
	plugin: VaultCopilotPlugin,
	manifest: MarketplaceExtension
): Promise<void> {
	console.log(`AutomationIntegration: Handling installation of automation '${manifest.uniqueId}'`);

	try {
		const engine = getAutomationEngine(app, plugin);

		const configFile = manifest.packageContents.find((file) =>
			file.targetLocation.endsWith('.automation.md')
		);

		if (!configFile) {
			throw new Error('No automation configuration file found in package contents (expected .automation.md)');
		}

		const configContent = await app.vault.adapter.read(configFile.targetLocation);
		const sourceFormat = 'automation-markdown' as const;
		const parsedConfig = parseFrontmatterAutomationConfig(configContent);
		const config = parsedConfig.config;

		validateAutomationConfig(config);

		const automation: AutomationInstance = {
			id: manifest.uniqueId,
			name: parsedConfig.name ?? manifest.displayTitle,
			sourcePath: configFile.targetLocation,
			sourceFormat,
			config,
			enabled: config.enabled ?? false,
			executionCount: 0,
		};

		await engine.registerAutomation(automation);

		if (config.runOnInstall) {
			console.log(`AutomationIntegration: Running automation '${manifest.uniqueId}' on install`);
			await engine.runAutomation(manifest.uniqueId);
		}

		console.log(`AutomationIntegration: Successfully registered automation '${manifest.uniqueId}'`);
	} catch (error) {
		console.error(`AutomationIntegration: Failed to register automation '${manifest.uniqueId}':`, error);
		throw error;
	}
}

/**
 * Parse automation configuration from `.automation.md` frontmatter.
 *
 * @param content - Automation markdown content
 * @returns Parsed automation config and optional display name
 * @throws {Error} If required frontmatter fields are missing
 * @internal
 */
function parseFrontmatterAutomationConfig(content: string): { config: AutomationConfig; name?: string } {
	const { frontmatter } = parseFrontmatter(content);
	const configRoot = isRecord(frontmatter.automation)
		? frontmatter.automation
		: frontmatter;

	const triggers = toTriggerArray(configRoot.triggers);
	const actions = toActionArray(configRoot.actions);
	const enabled = toOptionalBoolean(configRoot.enabled);
	const runOnInstall = toOptionalBoolean(configRoot.runOnInstall)
		?? toOptionalBoolean(configRoot['run-on-install'])
		?? toOptionalBoolean(configRoot.run_on_install);

	const name = typeof configRoot.name === 'string'
		? configRoot.name
		: (typeof frontmatter.name === 'string' ? frontmatter.name : undefined);

	return {
		name,
		config: {
			triggers,
			actions,
			enabled,
			runOnInstall,
		},
	};
}

/**
 * Convert unknown trigger value into a typed trigger array.
 *
 * @param value - Raw frontmatter trigger value
 * @returns Trigger array
 * @internal
 */
function toTriggerArray(value: unknown): AutomationTrigger[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(isRecord).map((item) => item as unknown as AutomationTrigger);
}

/**
 * Convert unknown action value into a typed action array.
 *
 * @param value - Raw frontmatter action value
 * @returns Action array
 * @internal
 */
function toActionArray(value: unknown): AutomationAction[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(isRecord).map((item) => item as unknown as AutomationAction);
}

/**
 * Parse an optional boolean from frontmatter values.
 *
 * @param value - Input value
 * @returns Boolean when parseable, otherwise undefined
 * @internal
 */
function toOptionalBoolean(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'string') {
		if (value.toLowerCase() === 'true') return true;
		if (value.toLowerCase() === 'false') return false;
	}
	return undefined;
}

/**
 * Check whether value is a plain object record.
 *
 * @param value - Unknown input value
 * @returns True when value is a non-null object record
 * @internal
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Handle automation extension uninstallation.
 * Unregisters the automation from the AutomationEngine.
 *
 * @param app - Obsidian app instance
 * @param plugin - Plugin instance
 * @param extensionId - ID of extension being uninstalled
 * @returns Resolves when uninstall cleanup completes
 *
 * @example
 * ```typescript
 * await handleAutomationUninstall(app, plugin, "daily-note-automation");
 * ```
 */
export async function handleAutomationUninstall(
	app: App,
	plugin: VaultCopilotPlugin,
	extensionId: string
): Promise<void> {
	console.log(`AutomationIntegration: Handling uninstallation of automation '${extensionId}'`);

	try {
		// Get the automation engine
		const engine = getAutomationEngine(app, plugin);

		// Unregister the automation
		await engine.unregisterAutomation(extensionId);

		console.log(`AutomationIntegration: Successfully unregistered automation '${extensionId}'`);
	} catch (error) {
		console.error(`AutomationIntegration: Failed to unregister automation '${extensionId}':`, error);
		// Don't throw - allow uninstall to proceed even if unregistration fails
	}
}

/**
 * Validate automation configuration.
 *
 * @param config - Automation configuration to validate
 * @returns Nothing
 * @throws {Error} If configuration is invalid
 * @internal
 */
function validateAutomationConfig(config: AutomationConfig): void {
	if (!config.triggers || config.triggers.length === 0) {
		throw new Error('Automation must have at least one trigger');
	}

	if (!config.actions || config.actions.length === 0) {
		throw new Error('Automation must have at least one action');
	}

	// Validate each trigger
	for (const trigger of config.triggers) {
		if (!trigger.type) {
			throw new Error('Trigger must have a type');
		}

		if (trigger.type === 'schedule' && !(trigger as any).schedule) {
			throw new Error('Schedule trigger must have a schedule property');
		}

		if (
			(trigger.type === 'file-created' || trigger.type === 'file-modified' || trigger.type === 'file-deleted') &&
			!(trigger as any).pattern
		) {
			throw new Error(`${trigger.type} trigger must have a pattern property`);
		}

		if (trigger.type === 'tag-added' && !(trigger as any).tag) {
			throw new Error('Tag-added trigger must have a tag property');
		}
	}

	// Validate each action
	for (const action of config.actions) {
		if (!action.type) {
			throw new Error('Action must have a type');
		}

		switch (action.type) {
			case 'run-agent':
				if (!(action as any).agentId) {
					throw new Error('run-agent action must have an agentId');
				}
				break;
			case 'run-prompt':
				if (!(action as any).promptId) {
					throw new Error('run-prompt action must have a promptId');
				}
				break;
			case 'run-skill':
				if (!(action as any).skillId) {
					throw new Error('run-skill action must have a skillId');
				}
				break;
			case 'create-note':
			case 'update-note':
				if (!(action as any).path) {
					throw new Error(`${action.type} action must have a path`);
				}
				break;
			case 'run-command':
				if (!(action as any).commandId) {
					throw new Error('run-command action must have a commandId');
				}
				break;
		}
	}
}
