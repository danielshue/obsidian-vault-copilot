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

import { App, TFile, Notice } from 'obsidian';
import CronExpressionParser from 'cron-parser';
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
} from './types';

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
	 * Loads state, registers vault listeners, and starts eligible triggers.
	 *
	 * @returns Resolves when initialization is complete
	 * @example
	 * ```typescript
	 * await engine.initialize();
	 * ```
	 */
	async initialize(): Promise<void> {
		console.log('AutomationEngine: Initializing...');
		await this.loadState();
		this.setupVaultListeners();
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
		this.runningExecutionCounts.clear();
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
		new Notice(`Automation '${automation.name}' registered`);
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
		new Notice(`Automation '${automation.name}' unregistered`);
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
			new Notice(`Automation '${automation.name}' enabled`);
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
			new Notice(`Automation '${automation.name}' disabled`);
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
			new Notice(`Failed to schedule automation: Invalid cron expression`);
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

			if (overallSuccess) {
				new Notice(`Automation '${automation.name}' completed successfully`);
			} else {
				new Notice(`Automation '${automation.name}' failed: ${overallError}`);
			}

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
				case 'create-note':
					result = await this.executeCreateNote(action, context);
					break;
				case 'update-note':
					result = await this.executeUpdateNote(action, context);
					break;
				case 'run-command':
					result = await this.executeRunCommand(action, context);
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
			throw new Error(`Agent '${agentId}' not found in AgentCache`);
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
	 * Execute `create-note` action.
	 *
	 * @param action - Create-note action config
	 * @param context - Execution context
	 * @returns Created note path
	 * @throws {Error} If note already exists
	 * @internal
	 */
	private async executeCreateNote(action: Extract<AutomationAction, { type: 'create-note' }>, context: AutomationExecutionContext): Promise<string> {
		const { path, template } = action;
		console.log(`AutomationEngine: Creating note at '${path}'`);
		
		// Check if file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(path);
		if (existingFile) {
			throw new Error(`Note already exists at ${path}`);
		}

		// Create the note
		const content = template || '';
		const file = await this.app.vault.create(path, content);
		
		return file.path;
	}

	/**
	 * Execute `update-note` action.
	 *
	 * @param action - Update-note action config
	 * @param context - Execution context
	 * @returns Updated note path
	 * @throws {Error} If note is not found
	 * @internal
	 */
	private async executeUpdateNote(action: Extract<AutomationAction, { type: 'update-note' }>, context: AutomationExecutionContext): Promise<string> {
		const { path, template } = action;
		console.log(`AutomationEngine: Updating note at '${path}'`);
		
		// Get the file
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`Note not found at ${path}`);
		}

		// Update the note
		if (template) {
			await this.app.vault.modify(file, template);
		}
		
		return file.path;
	}

	/**
	 * Execute `run-command` action.
	 *
	 * @param action - Run-command action config
	 * @param context - Execution context
	 * @returns `true` when command execution succeeds
	 * @throws {Error} If command execution fails
	 * @internal
	 */
	private async executeRunCommand(action: Extract<AutomationAction, { type: 'run-command' }>, context: AutomationExecutionContext): Promise<boolean> {
		const { commandId } = action;
		console.log(`AutomationEngine: Running command '${commandId}'`);
		
		// Execute the command
		const success = (this.app as any).commands.executeCommandById(commandId);
		
		if (!success) {
			throw new Error(`Command '${commandId}' failed or not found`);
		}
		
		return true;
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
