/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationEngine
 * @description Core automation engine for managing scheduled and event-triggered workflows.
 * 
 * The AutomationEngine handles:
 * - Registration and unregistration of automations
 * - Schedule-based triggers using cron expressions
 * - Event-based triggers (file events, vault events, tag events)
 * - Action execution (agents, prompts, skills, note operations)
 * - State persistence and history tracking
 * - Error handling and retry logic
 * 
 * @example
 * ```typescript
 * const engine = new AutomationEngine(app, plugin);
 * await engine.initialize();
 * 
 * // Register an automation
 * await engine.registerAutomation({
 *   id: 'daily-note',
 *   name: 'Daily Note Creator',
 *   config: {
 *     triggers: [{ type: 'schedule', schedule: '0 9 * * *' }],
 *     actions: [{ type: 'run-agent', agentId: 'daily-journal' }]
 *   },
 *   enabled: true,
 *   executionCount: 0
 * });
 * ```
 *
 * @see {@link AutomationIntegration}
 * @see {@link AutomationEngineState}
 * 
 * @since 0.1.0
 */

import { App, TFile, TFolder, EventRef } from 'obsidian';
import { CronExpressionParser } from 'cron-parser';
import type VaultCopilotPlugin from '../main';
import {
	AutomationInstance,
	AutomationEngineState,
	AutomationTrigger,
	AutomationAction,
	AutomationExecutionContext,
	AutomationExecutionResult,
	ActionExecutionResult,
	AutomationHistoryEntry,
	ScheduleTrigger,
	FileTrigger,
	TagAddedTrigger,
} from './types';
import { parseFrontmatterAutomationConfig, validateAutomationConfig } from './AutomationIntegration';

/**
 * Core automation engine for runtime registration, scheduling, and execution.
 *
 * Manages automation lifecycle, trigger routing, action execution, and
 * persistent execution history.
 *
 * @example
 * ```typescript
 * const engine = new AutomationEngine(app, plugin);
 * await engine.initialize();
 * ```
 */
export class AutomationEngine {
	/** Obsidian app instance. @internal */
	private app: App;
	/** Plugin instance used for service integrations. @internal */
	private plugin: VaultCopilotPlugin;
	/** In-memory engine state. @internal */
	private state: AutomationEngineState;
	/** Active schedule timers keyed by automation ID. @internal */
	private scheduledTimers: Map<string, NodeJS.Timeout> = new Map();
	/** Event cleanup registrations. @internal */
	private eventRegistrations: Map<string, () => void> = new Map();
	/** In-flight execution counts keyed by automation ID. @internal */
	private runningExecutionCounts: Map<string, number> = new Map();
	/** Maximum retained history entries. @internal */
	private maxHistoryEntries = 100;
	/** Persistent state file path. @internal */
	private stateFilePath = '.obsidian/vault-copilot-automations.json';
	/** Directories to scan for vault-based .automation.md files. @internal */
	private automationDirectories: string[] = [];
	/** File watcher event references for cleanup. @internal */
	private fileWatcherRefs: EventRef[] = [];
	/** Cached tag state per file for tag-added detection. @internal */
	private tagCache: Map<string, Set<string>> = new Map();

	/**
	 * Create a new automation engine instance.
	 *
	 * @param app - Obsidian app instance
	 * @param plugin - Vault Copilot plugin instance
	 */
	constructor(app: App, plugin: VaultCopilotPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.state = {
			automations: {},
			history: [],
		};
	}

	/**
	 * Initialize the automation engine.
	 * Loads state, scans vault directories for .automation.md files,
	 * registers vault listeners, and starts eligible triggers.
	 *
	 * @param directories - Directories to scan for vault-based .automation.md files
	 * @returns Resolves when initialization is complete
	 * @example
	 * ```typescript
	 * await engine.initialize(['automations']);
	 * ```
	 */
	async initialize(directories: string[] = []): Promise<void> {
		console.log('AutomationEngine: Initializing...');
		this.automationDirectories = directories;
		await this.loadState();
		await this.scanVaultAutomations();
		this.setupVaultListeners();
		this.setupAutomationFileWatchers();
		this.startScheduledAutomations();
		this.runStartupAutomations();
		console.log(`AutomationEngine: Initialized with ${Object.keys(this.state.automations).length} automations`);
	}

	/**
	 * Shutdown the automation engine.
	 * Stops active timers/listeners and persists state.
	 *
	 * @returns Resolves when shutdown is complete
	 * @example
	 * ```typescript
	 * await engine.shutdown();
	 * ```
	 */
	async shutdown(): Promise<void> {
		console.log('AutomationEngine: Shutting down...');
		this.stopAllScheduledAutomations();
		this.cleanupEventListeners();
		this.cleanupFileWatchers();
		this.runningExecutionCounts.clear();
		this.tagCache.clear();
		await this.saveState();
		console.log('AutomationEngine: Shutdown complete');
	}

	/**
	 * Register a new automation.
	 *
	 * @param automation - Automation instance to register
	 * @returns Resolves when registration is persisted
	 * @throws {Error} If automation with same ID already exists
	 * @example
	 * ```typescript
	 * await engine.registerAutomation(automation);
	 * ```
	 */
	async registerAutomation(automation: AutomationInstance): Promise<void> {
		if (this.state.automations[automation.id]) {
			throw new Error(`Automation with ID ${automation.id} already exists`);
		}

		console.log(`AutomationEngine: Registering automation '${automation.name}' (${automation.id})`);
		this.state.automations[automation.id] = automation;

		if (automation.enabled) {
			await this.activateAutomation(automation.id);
		}

		await this.saveState();
	}

	/**
	 * Update an existing automation's config while preserving runtime state.
	 *
	 * Used when a vault `.automation.md` file is modified — the config (triggers,
	 * actions) is re-read from the file, but runtime state like `lastRun`,
	 * `executionCount`, and `enabled` is preserved.
	 *
	 * @param automation - Updated automation instance (runtime state fields are ignored)
	 * @returns Resolves when update is persisted
	 * @example
	 * ```typescript
	 * await engine.updateAutomation(updatedAutomation);
	 * ```
	 */
	async updateAutomation(automation: AutomationInstance): Promise<void> {
		const existing = this.state.automations[automation.id];
		if (!existing) {
			// Not yet registered — treat as new registration
			return this.registerAutomation(automation);
		}

		console.log(`AutomationEngine: Updating automation '${automation.name}' (${automation.id})`);

		// Deactivate before updating triggers
		await this.deactivateAutomation(automation.id);

		// Update config-derived fields, preserve runtime state
		existing.name = automation.name;
		existing.config = automation.config;
		existing.sourcePath = automation.sourcePath;
		existing.sourceFormat = automation.sourceFormat;
		existing.origin = automation.origin;

		// Re-apply enabled from file if automation hasn't been toggled by user
		// (keep user's enabled preference if they've manually toggled it)

		// Reactivate if enabled
		if (existing.enabled) {
			await this.activateAutomation(automation.id);
		}

		await this.saveState();
	}

	/**
	 * Update automation directories and rescan.
	 *
	 * Called when the user changes automation directories in settings.
	 *
	 * @param directories - New list of directories to scan
	 * @returns Resolves when rescan is complete
	 * @example
	 * ```typescript
	 * await engine.updateDirectories(['automations', 'workflows']);
	 * ```
	 */
	async updateDirectories(directories: string[]): Promise<void> {
		const normalized = directories.map(d => d.replace(/\\/g, '/').replace(/\/+$/, ''));
		const oldNormalized = this.automationDirectories.map(d => d.replace(/\\/g, '/').replace(/\/+$/, ''));

		if (JSON.stringify(normalized) === JSON.stringify(oldNormalized)) {
			return; // No change
		}

		console.log('AutomationEngine: Automation directories changed, rescanning...');
		this.automationDirectories = directories;

		// Remove vault-origin automations that are no longer in configured directories
		for (const automation of Object.values(this.state.automations)) {
			if (automation.origin === 'vault' && automation.sourcePath) {
				if (!this.isAutomationFile(automation.sourcePath)) {
					console.log(`AutomationEngine: Removing automation '${automation.name}' — no longer in configured directories`);
					await this.deactivateAutomation(automation.id);
					delete this.state.automations[automation.id];
				}
			}
		}

		// Rescan to pick up new automations
		await this.scanVaultAutomations();

		// Re-setup file watchers for new directories
		this.cleanupFileWatchers();
		this.setupAutomationFileWatchers();

		// Restart schedules for newly discovered automations
		this.startScheduledAutomations();

		await this.saveState();
	}

	/**
	 * Unregister an automation.
	 *
	 * @param automationId - ID of automation to unregister
	 * @returns Resolves when unregistration is complete
	 * @example
	 * ```typescript
	 * await engine.unregisterAutomation("daily-note");
	 * ```
	 */
	async unregisterAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			console.warn(`AutomationEngine: Automation ${automationId} not found`);
			return;
		}

		console.log(`AutomationEngine: Unregistering automation '${automation.name}' (${automationId})`);
		await this.deactivateAutomation(automationId);
		this.runningExecutionCounts.delete(automationId);
		delete this.state.automations[automationId];
		await this.saveState();
	}

	/**
	 * Enable an automation.
	 *
	 * @param automationId - ID of automation to enable
	 * @returns Resolves when enable flow is complete
	 * @throws {Error} If automation is not found
	 * @example
	 * ```typescript
	 * await engine.enableAutomation("daily-note");
	 * ```
	 */
	async enableAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			throw new Error(`Automation ${automationId} not found`);
		}

		if (!automation.enabled) {
			automation.enabled = true;
			await this.activateAutomation(automationId);
			await this.saveState();
		}
	}

	/**
	 * Disable an automation.
	 *
	 * @param automationId - ID of automation to disable
	 * @returns Resolves when disable flow is complete
	 * @throws {Error} If automation is not found
	 * @example
	 * ```typescript
	 * await engine.disableAutomation("daily-note");
	 * ```
	 */
	async disableAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			throw new Error(`Automation ${automationId} not found`);
		}

		if (automation.enabled) {
			automation.enabled = false;
			await this.deactivateAutomation(automationId);
			await this.saveState();
		}
	}

	/**
	 * Manually run an automation.
	 *
	 * @param automationId - ID of automation to run
	 * @param trigger - Optional trigger to use (defaults to manual trigger)
	 * @returns Execution result payload
	 * @throws {Error} If automation or trigger configuration is missing
	 * @example
	 * ```typescript
	 * const result = await engine.runAutomation("daily-note");
	 * ```
	 */
	async runAutomation(automationId: string, trigger?: AutomationTrigger): Promise<AutomationExecutionResult> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			throw new Error(`Automation ${automationId} not found`);
		}

		// Use first trigger if not specified
		const executionTrigger = trigger || automation.config.triggers[0];
		if (!executionTrigger) {
			throw new Error(`Automation ${automationId} has no triggers defined`);
		}

		return await this.executeAutomation(automation, executionTrigger);
	}

	/**
	 * Get all registered automations.
	 *
	 * @returns Registered automation instances
	 * @example
	 * ```typescript
	 * const automations = engine.getAllAutomations();
	 * ```
	 */
	getAllAutomations(): AutomationInstance[] {
		return Object.values(this.state.automations);
	}

	/**
	 * Check whether an automation currently has in-flight executions.
	 *
	 * @param automationId - Automation identifier
	 * @returns True when currently running
	 */
	isAutomationRunning(automationId: string): boolean {
		return (this.runningExecutionCounts.get(automationId) ?? 0) > 0;
	}

	/**
	 * Get IDs of all automations that are currently running.
	 *
	 * @returns Automation IDs with active executions
	 */
	getRunningAutomationIds(): string[] {
		const runningIds: string[] = [];
		for (const [automationId, executionCount] of this.runningExecutionCounts.entries()) {
			if (executionCount > 0) {
				runningIds.push(automationId);
			}
		}
		return runningIds;
	}

	/**
	 * Get automation by ID.
	 *
	 * @param automationId - Automation identifier
	 * @returns Automation instance or `undefined`
	 * @example
	 * ```typescript
	 * const automation = engine.getAutomation("daily-note");
	 * ```
	 */
	getAutomation(automationId: string): AutomationInstance | undefined {
		return this.state.automations[automationId];
	}

	/**
	 * Get execution history.
	 *
	 * @param limit - Optional maximum number of entries
	 * @returns History entries (most recent first)
	 * @example
	 * ```typescript
	 * const recent = engine.getHistory(20);
	 * ```
	 */
	getHistory(limit?: number): AutomationHistoryEntry[] {
		const history = [...this.state.history].reverse(); // Most recent first
		return limit ? history.slice(0, limit) : history;
	}

	/**
	 * Clear execution history.
	 *
	 * @returns Resolves when history is persisted
	 * @example
	 * ```typescript
	 * await engine.clearHistory();
	 * ```
	 */
	async clearHistory(): Promise<void> {
		this.state.history = [];
		await this.saveState();
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	/**
	 * Activate an automation (schedule timers/listeners as needed).
	 *
	 * @param automationId - Automation identifier
	 * @returns Resolves when activation steps complete
	 * @internal
	 */
	private async activateAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) return;

		console.log(`AutomationEngine: Activating automation '${automation.name}'`);

		for (const trigger of automation.config.triggers) {
			if (trigger.type === 'schedule') {
				this.scheduleAutomation(automationId, trigger);
			}
			// Event-based triggers are handled globally via vault listeners
		}
	}

	/**
	 * Deactivate an automation (clear timers/listeners).
	 *
	 * @param automationId - Automation identifier
	 * @returns Resolves when deactivation completes
	 * @internal
	 */
	private async deactivateAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) return;

		console.log(`AutomationEngine: Deactivating automation '${automation.name}'`);

		// Clear scheduled timers
		const timerKey = this.getTimerKey(automationId);
		const timer = this.scheduledTimers.get(timerKey);
		if (timer) {
			clearTimeout(timer);
			this.scheduledTimers.delete(timerKey);
		}
	}

	/**
	 * Schedule an automation using a cron expression.
	 *
	 * @param automationId - Automation identifier
	 * @param trigger - Schedule trigger configuration
	 * @returns Nothing
	 * @internal
	 */
	private scheduleAutomation(automationId: string, trigger: ScheduleTrigger): void {
		try {
			const interval = CronExpressionParser.parse(trigger.schedule);
			const nextRun = interval.next().toDate();
			const automation = this.state.automations[automationId];
			
			if (automation) {
				automation.nextRun = nextRun.getTime();
			}

			const delay = nextRun.getTime() - Date.now();
			console.log(`AutomationEngine: Scheduling '${automation?.name}' to run at ${nextRun.toISOString()}`);

			const timerKey = this.getTimerKey(automationId);
			const timer = setTimeout(async () => {
				await this.executeAutomation(automation!, trigger);
				// Reschedule for next occurrence
				this.scheduleAutomation(automationId, trigger);
			}, delay);

			this.scheduledTimers.set(timerKey, timer);
		} catch (error) {
			console.error(`AutomationEngine: Failed to schedule automation ${automationId}:`, error);
		}
	}

	/**
	 * Execute an automation end-to-end.
	 *
	 * @param automation - Automation instance
	 * @param trigger - Trigger used for this execution
	 * @returns Execution result payload
	 * @internal
	 */
	private async executeAutomation(
		automation: AutomationInstance,
		trigger: AutomationTrigger
	): Promise<AutomationExecutionResult> {
		console.log(`AutomationEngine: Executing automation '${automation.name}' (trigger: ${trigger.type})`);
		this.incrementRunningExecutionCount(automation.id);

		try {
			const context: AutomationExecutionContext = {
				automation,
				trigger,
				startTime: Date.now(),
			};

			const actionResults: ActionExecutionResult[] = [];
			let overallSuccess = true;
			let overallError: string | undefined;

			if (trigger.delay && trigger.delay > 0) {
				await this.sleep(trigger.delay);
			}

			for (const action of automation.config.actions) {
				try {
					const result = await this.executeAction(action, context);
					actionResults.push(result);
					if (!result.success) {
						overallSuccess = false;
					}
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					console.error(`AutomationEngine: Action execution failed:`, error);
					actionResults.push({
						action,
						success: false,
						error: errorMsg,
						duration: 0,
					});
					overallSuccess = false;
					overallError = errorMsg;
					break;
				}
			}

			const result: AutomationExecutionResult = {
				success: overallSuccess,
				timestamp: Date.now(),
				trigger,
				actionResults,
				error: overallError,
			};

			automation.lastRun = result.timestamp;
			automation.lastResult = result;
			automation.executionCount++;

			this.addToHistory({
				automationId: automation.id,
				result,
				timestamp: result.timestamp,
			});

			await this.saveState();



			return result;
		} finally {
			this.decrementRunningExecutionCount(automation.id);
		}
	}

	/**
	 * Increment in-flight execution counter for an automation.
	 *
	 * @param automationId - Automation identifier
	 * @returns Nothing
	 * @internal
	 */
	private incrementRunningExecutionCount(automationId: string): void {
		const currentCount = this.runningExecutionCounts.get(automationId) ?? 0;
		this.runningExecutionCounts.set(automationId, currentCount + 1);
	}

	/**
	 * Decrement in-flight execution counter for an automation.
	 *
	 * @param automationId - Automation identifier
	 * @returns Nothing
	 * @internal
	 */
	private decrementRunningExecutionCount(automationId: string): void {
		const currentCount = this.runningExecutionCounts.get(automationId) ?? 0;
		if (currentCount <= 1) {
			this.runningExecutionCounts.delete(automationId);
			return;
		}
		this.runningExecutionCounts.set(automationId, currentCount - 1);
	}

	/**
	 * Execute a single automation action.
	 *
	 * @param action - Action configuration
	 * @param context - Execution context
	 * @returns Action execution result
	 * @internal
	 */
	private async executeAction(
		action: AutomationAction,
		context: AutomationExecutionContext
	): Promise<ActionExecutionResult> {
		const startTime = Date.now();

		try {
			let result: unknown;

			switch (action.type) {
				case 'run-agent':
					result = await this.executeRunAgent(action, context);
					break;
				case 'run-prompt':
					result = await this.executeRunPrompt(action, context);
					break;
				case 'run-skill':
					result = await this.executeRunSkill(action, context);
					break;
				default:
					throw new Error(`Unknown action type: ${(action as AutomationAction).type}`);
			}

			return {
				action,
				success: true,
				result,
				duration: Date.now() - startTime,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			return {
				action,
				success: false,
				error: errorMsg,
				duration: Date.now() - startTime,
			};
		}
	}

	/**
	 * Execute run-agent action.
	 *
	 * Loads the full agent definition from AgentCache and sends its instructions
	 * along with any user input to the active AI provider.
	 *
	 * @param action - The run-agent action with agentId and optional input
	 * @param context - The execution context with automation metadata
	 * @returns The agent execution result
	 * @throws {Error} If the agent is not found or no AI provider is available
	 * @internal
	 *
	 * @since 0.1.1
	 */
	private async executeRunAgent(action: Extract<AutomationAction, { type: 'run-agent' }>, context: AutomationExecutionContext): Promise<unknown> {
		const { agentId, input } = action;
		console.log(`AutomationEngine: Running agent '${agentId}' with input:`, input);

		const fullAgent = await this.plugin.agentCache.getFullAgent(agentId);
		if (!fullAgent) {
			const available = this.plugin.agentCache.getAgents().map(a => a.name).join(', ');
			throw new Error(`Agent '${agentId}' not found in AgentCache. Available agents: [${available}]`);
		}

		const inputStr = input ? Object.entries(input).map(([k, v]) => `${k}: ${String(v)}`).join('\n') : '';
		const prompt = `You are acting as the agent "${fullAgent.name}": ${fullAgent.description}\n\n${fullAgent.instructions}${inputStr ? `\n\nUser input:\n${inputStr}` : ''}`;

		const provider = this.plugin.getActiveService?.();
		if (provider && 'isReady' in provider && (provider as { isReady(): boolean }).isReady()) {
			const response = await provider.sendMessage(prompt);
			return { agentId, source: 'file', response };
		}

		return { agentId, source: 'file', instructions: fullAgent.instructions, note: 'No AI provider available to execute agent' };
	}

	/**
	 * Execute run-prompt action.
	 *
	 * Loads the full prompt definition from PromptCache and sends its content
	 * along with any user input to the active AI provider.
	 *
	 * @param action - The run-prompt action with promptId and optional input
	 * @param context - The execution context with automation metadata
	 * @returns The prompt execution result
	 * @throws {Error} If the prompt is not found or no AI provider is available
	 * @internal
	 *
	 * @since 0.1.1
	 */
	private async executeRunPrompt(action: Extract<AutomationAction, { type: 'run-prompt' }>, context: AutomationExecutionContext): Promise<unknown> {
		const { promptId, input } = action;
		console.log(`AutomationEngine: Running prompt '${promptId}' with input:`, input);

		const fullPrompt = await this.plugin.promptCache.getFullPrompt(promptId);
		if (!fullPrompt) {
			throw new Error(`Prompt '${promptId}' not found in PromptCache`);
		}

		const inputStr = input ? Object.entries(input).map(([k, v]) => `${k}: ${String(v)}`).join('\n') : '';
		const prompt = `${fullPrompt.content}${inputStr ? `\n\nUser input:\n${inputStr}` : ''}`;

		const provider = this.plugin.getActiveService?.();
		if (provider && 'isReady' in provider && (provider as { isReady(): boolean }).isReady()) {
			const response = await provider.sendMessage(prompt);
			return { promptId, source: 'file', response };
		}

		return { promptId, source: 'file', content: fullPrompt.content, note: 'No AI provider available to execute prompt' };
	}

	/**
	 * Execute run-skill action.
	 *
	 * Checks the SkillRegistry first for runtime-registered skills with a handler.
	 * Falls back to file-based skills from SkillCache, loading the full instructions
	 * and sending them to the active AI provider for execution.
	 *
	 * @param action - The run-skill action with skillId and optional input
	 * @param context - The execution context with automation metadata
	 * @returns The skill execution result
	 * @throws {Error} If the skill is not found in either registry or cache
	 *
	 * @example
	 * ```typescript
	 * // Runtime skill with handler
	 * await engine.executeRunSkill(
	 *   { type: 'run-skill', skillId: 'my-skill', input: { key: 'value' } },
	 *   context
	 * );
	 * ```
	 *
	 * @since 0.1.1
	 * @internal
	 */
	private async executeRunSkill(action: Extract<AutomationAction, { type: 'run-skill' }>, context: AutomationExecutionContext): Promise<unknown> {
		const { skillId, input } = action;
		console.log(`AutomationEngine: Running skill '${skillId}' with input:`, input);

		// 1. Try runtime skills first (they have direct handlers)
		const runtimeSkill = this.plugin.skillRegistry.getSkill(skillId);
		if (runtimeSkill) {
			console.log(`AutomationEngine: Executing runtime skill '${skillId}' via handler`);
			const result = await this.plugin.skillRegistry.executeSkill(skillId, input || {});
			return result;
		}

		// 2. Fall back to file-based skills from SkillCache
		const fullSkill = await this.plugin.skillCache.getFullSkill(skillId);
		if (fullSkill) {
			console.log(`AutomationEngine: Executing file-based skill '${skillId}' via AI provider`);
			const inputStr = input ? Object.entries(input).map(([k, v]) => `${k}: ${String(v)}`).join('\n') : '';
			const prompt = `Execute the following skill instructions:\n\n${fullSkill.instructions}${inputStr ? `\n\nUser input:\n${inputStr}` : ''}`;

			// Send to AI provider via the plugin's chat service if available
			const provider = this.plugin.getActiveService?.();
			if (provider && 'isReady' in provider && (provider as { isReady(): boolean }).isReady()) {
				const response = await provider.sendMessage(prompt);
				return { skillId, source: 'file', response };
			}

			// If no provider is available, return the instructions as-is
			return { skillId, source: 'file', instructions: fullSkill.instructions, note: 'No AI provider available to execute skill' };
		}

		throw new Error(`Skill '${skillId}' not found in SkillRegistry or SkillCache`);
	}



	/**
	 * Set up vault event listeners for trigger routing.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private setupVaultListeners(): void {
		// File created
		this.plugin.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.handleFileEvent('file-created', file.path);
				}
			})
		);

		// File modified
		this.plugin.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.handleFileEvent('file-modified', file.path);
				}
			})
		);

		// File deleted
		this.plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.handleFileEvent('file-deleted', file.path);
				}
			})
		);

		// Vault opened (use app ready event)
		this.app.workspace.onLayoutReady(() => {
			this.handleVaultOpened();
		});

		// Tag-added detection via metadata cache
		this.plugin.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				if (file instanceof TFile) {
					this.handleMetadataChanged(file);
				}
			})
		);

		// Initialize tag cache for existing files
		this.initializeTagCache();
	}

	/**
	 * Handle file events and trigger matching automations.
	 *
	 * @param eventType - File event type
	 * @param filePath - Affected file path
	 * @returns Nothing
	 * @internal
	 */
	private handleFileEvent(eventType: 'file-created' | 'file-modified' | 'file-deleted', filePath: string): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === eventType) {
					const fileTrigger = trigger as FileTrigger;
					if (this.matchesPattern(filePath, fileTrigger.pattern)) {
						console.log(`AutomationEngine: File event ${eventType} matched automation '${automation.name}'`);
						this.executeAutomation(automation, trigger).catch((error) => {
							console.error(`AutomationEngine: Failed to execute automation:`, error);
						});
					}
				}
			}
		}
	}

	/**
	 * Handle vault-opened trigger dispatch.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private handleVaultOpened(): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === 'vault-opened') {
					console.log(`AutomationEngine: Vault opened, triggering automation '${automation.name}'`);
					this.executeAutomation(automation, trigger).catch((error) => {
						console.error(`AutomationEngine: Failed to execute automation:`, error);
					});
				}
			}
		}
	}

	/**
	 * Run startup-trigger automations.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private runStartupAutomations(): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === 'startup') {
					console.log(`AutomationEngine: Plugin startup, triggering automation '${automation.name}'`);
					this.executeAutomation(automation, trigger).catch((error) => {
						console.error(`AutomationEngine: Failed to execute automation:`, error);
					});
				}
			}
		}
	}

	/**
	 * Initialize the tag cache from current vault metadata.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private initializeTagCache(): void {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = new Set<string>();
			if (cache?.tags) {
				for (const t of cache.tags) {
					tags.add(t.tag);
				}
			}
			if (cache?.frontmatter?.tags) {
				const fmTags: string[] = Array.isArray(cache.frontmatter.tags) ? cache.frontmatter.tags : [];
				for (const t of fmTags) {
					tags.add(t.startsWith('#') ? t : `#${t}`);
				}
			}
			if (tags.size > 0) {
				this.tagCache.set(file.path, tags);
			}
		}
		console.log(`AutomationEngine: Initialized tag cache for ${this.tagCache.size} files`);
	}

	/**
	 * Handle metadata changed events and detect newly added tags.
	 *
	 * @param file - File whose metadata changed
	 * @returns Nothing
	 * @internal
	 */
	private handleMetadataChanged(file: TFile): void {
		const cache = this.app.metadataCache.getFileCache(file);
		const newTags = new Set<string>();

		if (cache?.tags) {
			for (const t of cache.tags) {
				newTags.add(t.tag);
			}
		}
		if (cache?.frontmatter?.tags) {
			const fmTags: string[] = Array.isArray(cache.frontmatter.tags) ? cache.frontmatter.tags : [];
			for (const t of fmTags) {
				newTags.add(t.startsWith('#') ? t : `#${t}`);
			}
		}

		const oldTags = this.tagCache.get(file.path) || new Set<string>();
		const addedTags = new Set([...newTags].filter(t => !oldTags.has(t)));

		// Update cache
		this.tagCache.set(file.path, newTags);

		// Dispatch tag-added triggers
		if (addedTags.size > 0) {
			this.handleTagsAdded(file.path, addedTags);
		}
	}

	/**
	 * Handle newly added tags by dispatching matching automations.
	 *
	 * @param filePath - File where tags were added
	 * @param addedTags - Set of newly added tags
	 * @returns Nothing
	 * @internal
	 */
	private handleTagsAdded(filePath: string, addedTags: Set<string>): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === 'tag-added') {
					const tagTrigger = trigger as TagAddedTrigger;
					const normalizedTriggerTag = tagTrigger.tag.startsWith('#') ? tagTrigger.tag : `#${tagTrigger.tag}`;
					if (addedTags.has(normalizedTriggerTag)) {
						console.log(`AutomationEngine: Tag '${normalizedTriggerTag}' added to '${filePath}', triggering automation '${automation.name}'`);
						this.executeAutomation(automation, trigger).catch((error) => {
							console.error(`AutomationEngine: Failed to execute tag-added automation '${automation.name}':`, error);
						});
					}
				}
			}
		}
	}

	/**
	 * Start all enabled scheduled automations.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private startScheduledAutomations(): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === 'schedule') {
					this.scheduleAutomation(automation.id, trigger as ScheduleTrigger);
				}
			}
		}
	}

	/**
	 * Stop all scheduled automations.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private stopAllScheduledAutomations(): void {
		for (const timer of this.scheduledTimers.values()) {
			clearTimeout(timer);
		}
		this.scheduledTimers.clear();
	}

	/**
	 * Cleanup registered event listeners.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private cleanupEventListeners(): void {
		for (const cleanup of this.eventRegistrations.values()) {
			cleanup();
		}
		this.eventRegistrations.clear();
	}

	/**
	 * Check whether a file path matches a glob-like pattern.
	 *
	 * @param filePath - Candidate file path
	 * @param pattern - Trigger pattern
	 * @returns `true` when the path matches
	 * @internal
	 */
	private matchesPattern(filePath: string, pattern: string): boolean {
		// Convert glob pattern to regex
		const regexPattern = pattern
			.replace(/\*\*/g, '.*')  // ** matches any number of directories
			.replace(/\*/g, '[^/]*')  // * matches anything except /
			.replace(/\?/g, '.');     // ? matches single character
		
		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(filePath);
	}

	/**
	 * Add an entry to execution history with bounded retention.
	 *
	 * @param entry - History entry
	 * @returns Nothing
	 * @internal
	 */
	private addToHistory(entry: AutomationHistoryEntry): void {
		this.state.history.push(entry);
		
		// Limit history size
		if (this.state.history.length > this.maxHistoryEntries) {
			this.state.history = this.state.history.slice(-this.maxHistoryEntries);
		}
	}

	/**
	 * Get the timer key for an automation.
	 *
	 * @param automationId - Automation identifier
	 * @returns Timer map key
	 * @internal
	 */
	private getTimerKey(automationId: string): string {
		return `automation-${automationId}`;
	}

	/**
	 * Sleep utility for trigger delays.
	 *
	 * @param ms - Delay in milliseconds
	 * @returns Promise resolving after delay
	 * @internal
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// =========================================================================
	// Vault Automation Scanning & File Watchers
	// =========================================================================

	/**
	 * Derive an automation ID from a vault file path.
	 *
	 * @param filePath - Vault-relative path to a `.automation.md` file
	 * @returns Prefixed automation ID (e.g., `vault:daily-planning-brief`)
	 * @internal
	 */
	private deriveAutomationId(filePath: string): string {
		const basename = filePath.split('/').pop() || filePath;
		const name = basename.replace(/\.automation\.md$/i, '');
		return `vault:${name}`;
	}

	/**
	 * Check whether a file path is an automation definition file within
	 * a configured automation directory.
	 *
	 * @param filePath - Vault-relative file path to check
	 * @returns `true` when the path is an `.automation.md` file inside a configured directory
	 * @internal
	 */
	private isAutomationFile(filePath: string): boolean {
		if (!filePath.endsWith('.automation.md')) {
			return false;
		}
		return this.automationDirectories.some(dir => {
			const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
			const normalizedPath = filePath.replace(/\\/g, '/');
			return normalizedPath.startsWith(normalizedDir + '/');
		});
	}

	/**
	 * Scan configured vault directories for `.automation.md` files and
	 * register/update them in the engine.
	 *
	 * For new vault automations, registers them. For existing ones (persisted
	 * from a previous session), re-reads config from the file (source of truth)
	 * while preserving runtime state.
	 *
	 * Also removes vault-origin automations whose source file no longer exists.
	 *
	 * @returns Resolves when scanning is complete
	 * @internal
	 */
	private async scanVaultAutomations(): Promise<void> {
		if (this.automationDirectories.length === 0) {
			return;
		}

		console.log(`AutomationEngine: Scanning vault directories for .automation.md files: ${this.automationDirectories.join(', ')}`);
		const discoveredIds = new Set<string>();

		for (const dir of this.automationDirectories) {
			const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
			const folder = this.app.vault.getAbstractFileByPath(normalizedDir);
			if (!folder || !(folder instanceof TFolder)) {
				console.log(`AutomationEngine: Directory '${normalizedDir}' not found, skipping`);
				continue;
			}

			// Recursively find .automation.md files
			const automationFiles = this.findAutomationFiles(folder);
			console.log(`AutomationEngine: Found ${automationFiles.length} .automation.md file(s) in '${normalizedDir}'`);

			for (const file of automationFiles) {
				try {
					const automationId = this.deriveAutomationId(file.path);
					discoveredIds.add(automationId);

					// Check for ID collision with extension-installed automations
					const existing = this.state.automations[automationId];
					if (existing && existing.origin === 'extension') {
						console.warn(`AutomationEngine: Vault file '${file.path}' produces ID '${automationId}' which conflicts with extension automation — skipping`);
						continue;
					}

					const content = await this.app.vault.read(file);
					const parsed = parseFrontmatterAutomationConfig(content);
					validateAutomationConfig(parsed.config);

					const automation: AutomationInstance = {
						id: automationId,
						name: parsed.name || file.basename.replace(/\.automation$/, ''),
						description: parsed.description,
						sourcePath: file.path,
						sourceFormat: 'automation-markdown',
						origin: 'vault',
						config: parsed.config,
						enabled: parsed.config.enabled ?? true,
						executionCount: 0,
					};

					if (existing && existing.origin === 'vault') {
						// Update existing vault automation — preserve runtime state
						await this.updateAutomation(automation);
					} else {
						// New vault automation — register
						this.state.automations[automation.id] = automation;
						if (automation.enabled) {
							await this.activateAutomation(automation.id);
						}
						// Honor run-on-install for new vault automations
						if (parsed.config.runOnInstall && automation.enabled && automation.config.triggers[0]) {
							console.log(`AutomationEngine: Running on install for vault automation '${automation.name}'`);
							this.executeAutomation(automation, automation.config.triggers[0]).catch((error) => {
								console.error(`AutomationEngine: run-on-install failed for '${automation.name}':`, error);
							});
						}
					}
				} catch (error) {
					console.warn(`AutomationEngine: Failed to load automation from '${file.path}':`, error);
				}
			}
		}

		// Remove vault-origin automations whose source files no longer exist
		for (const [id, automation] of Object.entries(this.state.automations)) {
			if (automation.origin === 'vault' && !discoveredIds.has(id)) {
				console.log(`AutomationEngine: Removing stale vault automation '${automation.name}' (${id}) — source file no longer exists`);
				await this.deactivateAutomation(id);
				delete this.state.automations[id];
			}
		}

		await this.saveState();
	}

	/**
	 * Recursively find `.automation.md` files within a folder.
	 *
	 * @param folder - Vault folder to search
	 * @returns Array of TFile instances matching the `.automation.md` pattern
	 * @internal
	 */
	private findAutomationFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.path.endsWith('.automation.md')) {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.findAutomationFiles(child));
			}
		}
		return files;
	}

	/**
	 * Set up file watchers for `.automation.md` files in configured directories.
	 *
	 * Watches for create, modify, delete, and rename events to keep vault automations
	 * in sync with their source files.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private setupAutomationFileWatchers(): void {
		if (this.automationDirectories.length === 0) {
			return;
		}

		// Watch for new automation files
		const createRef = this.app.vault.on('create', async (file) => {
			if (file instanceof TFile && this.isAutomationFile(file.path)) {
				console.log(`AutomationEngine: Detected new automation file '${file.path}'`);
				try {
					const content = await this.app.vault.read(file);
					const parsed = parseFrontmatterAutomationConfig(content);
					validateAutomationConfig(parsed.config);

					const automationId = this.deriveAutomationId(file.path);
					const existing = this.state.automations[automationId];
					if (existing && existing.origin === 'extension') {
						console.warn(`AutomationEngine: Vault file '${file.path}' conflicts with extension automation '${automationId}' — skipping`);
						return;
					}

					const automation: AutomationInstance = {
						id: automationId,
						name: parsed.name || file.basename.replace(/\.automation$/, ''),
						description: parsed.description,
						sourcePath: file.path,
						sourceFormat: 'automation-markdown',
						origin: 'vault',
						config: parsed.config,
						enabled: parsed.config.enabled ?? true,
						executionCount: 0,
					};

					if (existing) {
						await this.updateAutomation(automation);
					} else {
						await this.registerAutomation(automation);
					}
				} catch (error) {
					console.warn(`AutomationEngine: Failed to register automation from '${file.path}':`, error);
				}
			}
		});
		this.fileWatcherRefs.push(createRef);
		this.plugin.registerEvent(createRef);

		// Watch for modified automation files
		const modifyRef = this.app.vault.on('modify', async (file) => {
			if (file instanceof TFile && this.isAutomationFile(file.path)) {
				const automationId = this.deriveAutomationId(file.path);
				const existing = this.state.automations[automationId];
				if (!existing || existing.origin !== 'vault') {
					return; // Only re-read vault-origin automations
				}

				console.log(`AutomationEngine: Detected modification to automation file '${file.path}'`);
				try {
					const content = await this.app.vault.read(file);
					const parsed = parseFrontmatterAutomationConfig(content);
					validateAutomationConfig(parsed.config);

					const automation: AutomationInstance = {
						id: automationId,
						name: parsed.name || file.basename.replace(/\.automation$/, ''),
						description: parsed.description,
						sourcePath: file.path,
						sourceFormat: 'automation-markdown',
						origin: 'vault',
						config: parsed.config,
						enabled: parsed.config.enabled ?? true,
						executionCount: 0,
					};

					await this.updateAutomation(automation);
				} catch (error) {
					console.warn(`AutomationEngine: Failed to update automation from '${file.path}':`, error);
				}
			}
		});
		this.fileWatcherRefs.push(modifyRef);
		this.plugin.registerEvent(modifyRef);

		// Watch for deleted automation files
		const deleteRef = this.app.vault.on('delete', async (file) => {
			if (file instanceof TFile && file.path.endsWith('.automation.md')) {
				const automationId = this.deriveAutomationId(file.path);
				const existing = this.state.automations[automationId];
				if (existing && existing.origin === 'vault') {
					console.log(`AutomationEngine: Automation file '${file.path}' deleted, unregistering '${automationId}'`);
					await this.deactivateAutomation(automationId);
					this.runningExecutionCounts.delete(automationId);
					delete this.state.automations[automationId];
					await this.saveState();
				}
			}
		});
		this.fileWatcherRefs.push(deleteRef);
		this.plugin.registerEvent(deleteRef);

		// Watch for renamed automation files (treat as delete + create)
		const renameRef = this.app.vault.on('rename', async (file, oldPath) => {
			// Handle old path removal
			if (oldPath.endsWith('.automation.md')) {
				const oldId = this.deriveAutomationId(oldPath);
				const existing = this.state.automations[oldId];
				if (existing && existing.origin === 'vault') {
					console.log(`AutomationEngine: Automation file renamed from '${oldPath}', unregistering '${oldId}'`);
					await this.deactivateAutomation(oldId);
					this.runningExecutionCounts.delete(oldId);
					delete this.state.automations[oldId];
				}
			}

			// Handle new path addition
			if (file instanceof TFile && this.isAutomationFile(file.path)) {
				console.log(`AutomationEngine: Automation file renamed to '${file.path}', registering`);
				try {
					const content = await this.app.vault.read(file);
					const parsed = parseFrontmatterAutomationConfig(content);
					validateAutomationConfig(parsed.config);

					const newId = this.deriveAutomationId(file.path);
					const automation: AutomationInstance = {
						id: newId,
						name: parsed.name || file.basename.replace(/\.automation$/, ''),
						description: parsed.description,
						sourcePath: file.path,
						sourceFormat: 'automation-markdown',
						origin: 'vault',
						config: parsed.config,
						enabled: parsed.config.enabled ?? true,
						executionCount: 0,
					};

					await this.registerAutomation(automation);
				} catch (error) {
					console.warn(`AutomationEngine: Failed to register renamed automation '${file.path}':`, error);
				}
			}

			await this.saveState();
		});
		this.fileWatcherRefs.push(renameRef);
		this.plugin.registerEvent(renameRef);

		console.log(`AutomationEngine: File watchers set up for ${this.automationDirectories.length} director(ies)`);
	}

	/**
	 * Clean up file watcher event references.
	 *
	 * @returns Nothing
	 * @internal
	 */
	private cleanupFileWatchers(): void {
		for (const ref of this.fileWatcherRefs) {
			this.app.vault.offref(ref);
		}
		this.fileWatcherRefs = [];
	}

	/**
	 * Load persistent automation state from disk.
	 *
	 * @returns Resolves when load attempt completes
	 * @internal
	 */
	private async loadState(): Promise<void> {
		try {
			const data = await this.app.vault.adapter.read(this.stateFilePath);
			this.state = JSON.parse(data);
			console.log(`AutomationEngine: Loaded state with ${Object.keys(this.state.automations).length} automations`);
		} catch (error) {
			// File doesn't exist or is invalid, use default state
			console.log('AutomationEngine: No existing state found, using defaults');
		}
	}

	/**
	 * Persist automation state to disk.
	 *
	 * @returns Resolves when save attempt completes
	 * @internal
	 */
	private async saveState(): Promise<void> {
		try {
			const data = JSON.stringify(this.state, null, 2);
			await this.app.vault.adapter.write(this.stateFilePath, data);
		} catch (error) {
			console.error('AutomationEngine: Failed to save state:', error);
		}
	}
}

/**
 * Global automation engine instance.
 * @internal
 */
let automationEngineInstance: AutomationEngine | null = null;

/**
 * Get the global automation engine instance.
 *
 * @param app - Obsidian app instance
 * @param plugin - Plugin instance
 * @returns Automation engine instance
 * @throws {Error} If engine is not initialized and dependencies are not provided
 *
 * @example
 * ```typescript
 * const engine = getAutomationEngine(app, plugin);
 * ```
 */
export function getAutomationEngine(app?: App, plugin?: VaultCopilotPlugin): AutomationEngine {
	if (!automationEngineInstance && app && plugin) {
		automationEngineInstance = new AutomationEngine(app, plugin);
	}
	if (!automationEngineInstance) {
		throw new Error('AutomationEngine not initialized');
	}
	return automationEngineInstance;
}

/**
 * Reset the global automation engine instance (for testing).
 *
 * @returns Nothing
 *
 * @example
 * ```typescript
 * resetAutomationEngine();
 * ```
 */
export function resetAutomationEngine(): void {
	automationEngineInstance = null;
}
