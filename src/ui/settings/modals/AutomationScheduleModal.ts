/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationScheduleModal
 * @description Modal for creating or editing an automation's schedule.
 *
 * Provides friendly frequency / day / time dropdowns that map to cron expressions,
 * plus an action-type selector when creating a new automation.
 *
 * @since 0.1.0
 */

import { App, Modal, Setting } from 'obsidian';
import type { AutomationInstance, AutomationConfig, ScheduleTrigger, AutomationAction } from '../../../automation/types';
import type CopilotPlugin from '../../../main';

/** Frequency presets exposed in the UI */
type Frequency = 'hour' | 'day' | 'week' | 'month';

/** Parsed friendly-schedule representation */
interface ScheduleFields {
	frequency: Frequency;
	dayOfWeek: number;   // 0-6 (Sun-Sat), used for "week"
	dayOfMonth: number;  // 1-31, used for "month"
	hour: number;        // 0-23
	minute: number;      // 0-59
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIME_OPTIONS: { label: string; hour: number; minute: number }[] = (() => {
	const opts: { label: string; hour: number; minute: number }[] = [];
	for (let h = 0; h < 24; h++) {
		for (const m of [0, 30]) {
			const suffix = h < 12 ? 'AM' : 'PM';
			const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
			const minStr = m === 0 ? '00' : String(m);
			opts.push({ label: `${display}:${minStr} ${suffix}`, hour: h, minute: m });
		}
	}
	return opts;
})();

const MINUTE_OPTIONS = [0, 15, 30, 45];

/**
 * Modal for creating a new automation or editing the schedule of an existing one.
 *
 * @example
 * ```typescript
 * // Edit mode
 * const modal = new AutomationScheduleModal(app, existingAutomation, (id, config) => { ... });
 * modal.open();
 *
 * // Create mode
 * const modal = new AutomationScheduleModal(app, null, (id, config) => { ... });
 * modal.open();
 * ```
 */
export class AutomationScheduleModal extends Modal {
	private plugin: CopilotPlugin;
	private existingAutomation: AutomationInstance | null;
	private onSave: (id: string | null, name: string, config: AutomationConfig) => void;

	// Form state
	private name = '';
	private actionType: AutomationAction['type'] = 'run-command';
	private actionValue = '';
	private inputParams: { key: string; value: string }[] = [];
	private schedule: ScheduleFields = {
		frequency: 'week',
		dayOfWeek: 1,
		dayOfMonth: 1,
		hour: 9,
		minute: 0,
	};

	private conditionalContainer: HTMLElement | null = null;
	private actionContainer: HTMLElement | null = null;
	private paramsContainer: HTMLElement | null = null;

	/**
	 * @param app - Obsidian app
	 * @param plugin - Plugin instance for accessing agent/prompt/skill registries
	 * @param automation - Existing automation to edit (null = create mode)
	 * @param onSave - Callback with (existingId | null, name, config)
	 */
	constructor(
		app: App,
		plugin: CopilotPlugin,
		automation: AutomationInstance | null,
		onSave: (id: string | null, name: string, config: AutomationConfig) => void,
	) {
		super(app);
		this.plugin = plugin;
		this.existingAutomation = automation;
		this.onSave = onSave;

		if (automation) {
			this.name = automation.name;
			this.schedule = this.parseCronToFields(automation.config);
			// Preserve existing action info
			const firstAction = automation.config.actions[0];
			if (firstAction) {
				this.actionType = firstAction.type;
				this.actionValue = this.getActionValue(firstAction);
				// Load existing input params
				if (firstAction.input) {
					this.inputParams = Object.entries(firstAction.input).map(
						([key, value]) => ({ key, value: String(value) })
					);
				}
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('vc-schedule-modal');

		const isEdit = !!this.existingAutomation;
		contentEl.createEl('h2', { text: isEdit ? 'Edit schedule' : 'Create automation' });

		// ── Name ──
		if (!isEdit) {
			new Setting(contentEl)
				.setName('Name')
				.setDesc('A short name for this automation')
				.addText(text => {
					text.setPlaceholder('e.g. Weekly review')
						.setValue(this.name)
						.onChange(v => { this.name = v; });
				});
		}

		// ── Frequency ──
		contentEl.createEl('h3', { text: 'Frequency', cls: 'vc-schedule-section-heading' });
		contentEl.createEl('p', { text: 'How often should this automation run?', cls: 'vc-schedule-desc' });

		new Setting(contentEl)
			.setName('Every')
			.addDropdown(dropdown => {
				dropdown.addOption('hour', 'Hour');
				dropdown.addOption('day', 'Day');
				dropdown.addOption('week', 'Week');
				dropdown.addOption('month', 'Month');
				dropdown.setValue(this.schedule.frequency);
				dropdown.onChange((v) => {
					this.schedule.frequency = v as Frequency;
					this.renderConditionalFields();
				});
			});

		// Container for fields that change based on frequency
		this.conditionalContainer = contentEl.createDiv({ cls: 'vc-schedule-conditional' });
		this.renderConditionalFields();

		// ── Action ──
		contentEl.createEl('h3', { text: 'Action', cls: 'vc-schedule-section-heading' });
		contentEl.createEl('p', { text: 'What should this automation do?', cls: 'vc-schedule-desc' });

		new Setting(contentEl)
			.setName('Action type')
			.addDropdown(dropdown => {
				dropdown.addOption('run-command', 'Run command');
				dropdown.addOption('run-agent', 'Run agent');
				dropdown.addOption('run-prompt', 'Run prompt');
				dropdown.addOption('run-skill', 'Run skill');
				dropdown.addOption('create-note', 'Create note');
				dropdown.addOption('update-note', 'Update note');
				dropdown.setValue(this.actionType);
				dropdown.onChange(v => {
					this.actionType = v as AutomationAction['type'];
					this.actionValue = '';
					this.renderActionValueField();
				});
			});

		this.actionContainer = contentEl.createDiv({ cls: 'vc-schedule-conditional' });
		this.renderActionValueField();

		// ── Parameters ──
		contentEl.createEl('h3', { text: 'Parameters', cls: 'vc-schedule-section-heading' });
		contentEl.createEl('p', {
			text: 'Key-value pairs passed to the action at execution time.',
			cls: 'vc-schedule-desc',
		});
		this.paramsContainer = contentEl.createDiv({ cls: 'vc-params-container' });
		this.renderParamsEditor();

		// ── Buttons ──
		const buttonRow = contentEl.createDiv({ cls: 'vc-modal-buttons' });
		const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonRow.createEl('button', { text: isEdit ? 'Save' : 'Create', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => this.submit());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ─── Conditional fields ──────────────────────────────────────────────

	/**
	 * Re-render the day-of-week / day-of-month / time fields based on the
	 * currently selected frequency.
	 *
	 * @internal
	 */
	private renderConditionalFields(): void {
		if (!this.conditionalContainer) return;
		this.conditionalContainer.empty();

		const freq = this.schedule.frequency;

		// Day of week (weekly)
		if (freq === 'week') {
			new Setting(this.conditionalContainer)
				.setName('On')
				.setDesc('Day of the week')
				.addDropdown(dropdown => {
					DAY_NAMES.forEach((name, i) => dropdown.addOption(String(i), name));
					dropdown.setValue(String(this.schedule.dayOfWeek));
					dropdown.onChange(v => { this.schedule.dayOfWeek = Number(v); });
				});
		}

		// Day of month (monthly)
		if (freq === 'month') {
			new Setting(this.conditionalContainer)
				.setName('On day')
				.setDesc('Day of the month')
				.addDropdown(dropdown => {
					for (let d = 1; d <= 31; d++) {
						dropdown.addOption(String(d), String(d));
					}
					dropdown.setValue(String(this.schedule.dayOfMonth));
					dropdown.onChange(v => { this.schedule.dayOfMonth = Number(v); });
				});
		}

		// Time (not shown for "hour")
		if (freq !== 'hour') {
			new Setting(this.conditionalContainer)
				.setName('At')
				.setDesc('Time of day')
				.addDropdown(dropdown => {
					for (const opt of TIME_OPTIONS) {
						dropdown.addOption(`${opt.hour}:${opt.minute}`, opt.label);
					}
					dropdown.setValue(`${this.schedule.hour}:${this.schedule.minute}`);
					dropdown.onChange(v => {
						const [h, m] = v.split(':').map(Number);
						this.schedule.hour = h ?? 9;
						this.schedule.minute = m ?? 0;
					});
				});
		}

		// Minute selector (hourly only)
		if (freq === 'hour') {
			new Setting(this.conditionalContainer)
				.setName('At minute')
				.setDesc('Minute past the hour')
				.addDropdown(dropdown => {
					for (const m of MINUTE_OPTIONS) {
						dropdown.addOption(String(m), `:${String(m).padStart(2, '0')}`);
					}
					dropdown.setValue(String(this.schedule.minute));
					dropdown.onChange(v => { this.schedule.minute = Number(v); });
				});
		}
	}

	// ─── Action value field ──────────────────────────────────────────────

	/**
	 * Render the action value field based on the selected action type.
	 * Shows a dynamic dropdown for agents/prompts/skills/commands, or a
	 * text input for note paths.
	 *
	 * @internal
	 */
	private renderActionValueField(): void {
		if (!this.actionContainer) return;
		this.actionContainer.empty();

		switch (this.actionType) {
			case 'run-agent': {
				const agents = this.plugin.agentCache?.getAgents() ?? [];
				new Setting(this.actionContainer)
					.setName('Agent')
					.setDesc(agents.length ? 'Select which agent to run' : 'No agents found — add .agent.md files to your agent directories')
					.addDropdown(dropdown => {
						if (agents.length === 0) {
							dropdown.addOption('', '(none available)');
						}
						for (const a of agents) {
							dropdown.addOption(a.name, a.description ? `${a.name} — ${a.description}` : a.name);
						}
						if (this.actionValue && agents.some(a => a.name === this.actionValue)) {
							dropdown.setValue(this.actionValue);
						} else if (agents.length > 0 && agents[0]) {
							this.actionValue = agents[0].name;
							dropdown.setValue(this.actionValue);
						}
						dropdown.onChange(v => { this.actionValue = v; });
					});
				break;
			}

			case 'run-prompt': {
				const prompts = this.plugin.promptCache?.getPrompts() ?? [];
				new Setting(this.actionContainer)
					.setName('Prompt')
					.setDesc(prompts.length ? 'Select which prompt to run' : 'No prompts found — add .prompt.md files to your prompt directories')
					.addDropdown(dropdown => {
						if (prompts.length === 0) {
							dropdown.addOption('', '(none available)');
						}
						for (const p of prompts) {
							dropdown.addOption(p.name, p.description ? `${p.name} — ${p.description}` : p.name);
						}
						if (this.actionValue && prompts.some(p => p.name === this.actionValue)) {
							dropdown.setValue(this.actionValue);
						} else if (prompts.length > 0 && prompts[0]) {
							this.actionValue = prompts[0].name;
							dropdown.setValue(this.actionValue);
						}
						dropdown.onChange(v => { this.actionValue = v; });
					});
				break;
			}

			case 'run-skill': {
				const skills = this.plugin.skillRegistry?.listSkills() ?? [];
				new Setting(this.actionContainer)
					.setName('Skill')
					.setDesc(skills.length ? 'Select which skill to run' : 'No skills registered')
					.addDropdown(dropdown => {
						if (skills.length === 0) {
							dropdown.addOption('', '(none available)');
						}
						for (const s of skills) {
							dropdown.addOption(s.name, s.description ? `${s.name} — ${s.description}` : s.name);
						}
						if (this.actionValue && skills.some(s => s.name === this.actionValue)) {
							dropdown.setValue(this.actionValue);
						} else if (skills.length > 0 && skills[0]) {
							this.actionValue = skills[0].name;
							dropdown.setValue(this.actionValue);
						}
						dropdown.onChange(v => { this.actionValue = v; });
					});
				break;
			}

			case 'run-command': {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const commands: Record<string, { id: string; name: string }> = (this.app as any).commands?.commands ?? {};
				const commandList = Object.values(commands).sort((a, b) => a.name.localeCompare(b.name));
				new Setting(this.actionContainer)
					.setName('Command')
					.setDesc('Select an Obsidian command to run')
					.addDropdown(dropdown => {
						for (const cmd of commandList) {
							dropdown.addOption(cmd.id, cmd.name);
						}
						if (this.actionValue && commandList.some(c => c.id === this.actionValue)) {
							dropdown.setValue(this.actionValue);
						} else if (commandList.length > 0 && commandList[0]) {
							this.actionValue = commandList[0].id;
							dropdown.setValue(this.actionValue);
						}
						dropdown.onChange(v => { this.actionValue = v; });
					});
				break;
			}

			case 'create-note':
			case 'update-note':
				new Setting(this.actionContainer)
					.setName('Note path')
					.setDesc('Path to the note (e.g. Daily Notes/{{date}}.md)')
					.addText(text => {
						text.setPlaceholder('e.g. Daily Notes/{{date}}.md')
							.setValue(this.actionValue)
							.onChange(v => { this.actionValue = v; });
					});
				break;
		}
	}

	// ─── Parameters editor ───────────────────────────────────────────────

	/**
	 * Render the key-value parameter editor for action input.
	 *
	 * @internal
	 */
	private renderParamsEditor(): void {
		if (!this.paramsContainer) return;
		this.paramsContainer.empty();

		// Render existing params
		for (let i = 0; i < this.inputParams.length; i++) {
			const param = this.inputParams[i]!;
			const row = this.paramsContainer.createDiv({ cls: 'vc-param-row' });

			const keyInput = row.createEl('input', {
				type: 'text',
				cls: 'vc-param-key',
				placeholder: 'key',
				value: param.key,
			});
			keyInput.addEventListener('input', () => { param.key = keyInput.value; });

			const valInput = row.createEl('input', {
				type: 'text',
				cls: 'vc-param-value',
				placeholder: 'value',
				value: param.value,
			});
			valInput.addEventListener('input', () => { param.value = valInput.value; });

			const removeBtn = row.createEl('button', {
				cls: 'vc-btn-icon vc-btn-remove',
				attr: { 'aria-label': 'Remove parameter' },
			});
			removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
			removeBtn.addEventListener('click', () => {
				this.inputParams.splice(i, 1);
				this.renderParamsEditor();
			});
		}

		// Add button
		const addBtn = this.paramsContainer.createEl('button', {
			text: '+ Add parameter',
			cls: 'vc-btn-secondary vc-btn-sm',
		});
		addBtn.addEventListener('click', () => {
			this.inputParams.push({ key: '', value: '' });
			this.renderParamsEditor();
		});
	}

	// ─── Submit ──────────────────────────────────────────────────────────

	/**
	 * Validate input and invoke the onSave callback.
	 *
	 * @internal
	 */
	private submit(): void {
		const isEdit = !!this.existingAutomation;

		if (!isEdit && !this.name.trim()) {
			const existing = this.contentEl.querySelector('.vc-schedule-error');
			if (!existing) {
				const err = this.contentEl.createDiv({ cls: 'vc-schedule-error' });
				err.setText('Please enter a name.');
			}
			return;
		}

		if (!this.actionValue.trim()) {
			const existing = this.contentEl.querySelector('.vc-schedule-error');
			if (!existing) {
				const err = this.contentEl.createDiv({ cls: 'vc-schedule-error' });
				err.setText('Please select an action.');
			}
			return;
		}

		const cron = this.fieldsToCron(this.schedule);
		const trigger: ScheduleTrigger = { type: 'schedule', schedule: cron };
		const action = this.buildAction();

		let config: AutomationConfig;
		if (isEdit && this.existingAutomation) {
			const otherTriggers = this.existingAutomation.config.triggers.filter(t => t.type !== 'schedule');
			config = {
				...this.existingAutomation.config,
				triggers: [...otherTriggers, trigger],
				actions: [action],
			};
		} else {
			config = {
				triggers: [trigger],
				actions: [action],
				enabled: true,
			};
		}

		this.onSave(
			isEdit ? this.existingAutomation!.id : null,
			isEdit ? this.existingAutomation!.name : this.name.trim(),
			config,
		);
		this.close();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────

	/**
	 * Build an `AutomationAction` from the form state.
	 *
	 * @internal
	 */
	private buildAction(): AutomationAction {
		const val = this.actionValue.trim();
		// Collect non-empty params into input object
		const input: Record<string, unknown> = {};
		for (const p of this.inputParams) {
			const key = p.key.trim();
			if (key) input[key] = p.value;
		}
		const hasInput = Object.keys(input).length > 0;

		switch (this.actionType) {
			case 'run-agent':
				return { type: 'run-agent', agentId: val, ...(hasInput && { input }) };
			case 'run-prompt':
				return { type: 'run-prompt', promptId: val, ...(hasInput && { input }) };
			case 'run-skill':
				return { type: 'run-skill', skillId: val, ...(hasInput && { input }) };
			case 'create-note':
				return { type: 'create-note', path: val, ...(hasInput && { input }) };
			case 'update-note':
				return { type: 'update-note', path: val, ...(hasInput && { input }) };
			case 'run-command':
			default:
				return { type: 'run-command', commandId: val, ...(hasInput && { input }) };
		}
	}

	/**
	 * Convert friendly schedule fields to a 5-field cron expression.
	 *
	 * @param fields - Schedule fields
	 * @returns Cron string (minute hour day month weekday)
	 *
	 * @internal
	 */
	private fieldsToCron(fields: ScheduleFields): string {
		switch (fields.frequency) {
			case 'hour':
				return `${fields.minute} * * * *`;
			case 'day':
				return `${fields.minute} ${fields.hour} * * *`;
			case 'week':
				return `${fields.minute} ${fields.hour} * * ${fields.dayOfWeek}`;
			case 'month':
				return `${fields.minute} ${fields.hour} ${fields.dayOfMonth} * *`;
		}
	}

	/**
	 * Reverse-parse an automation's schedule trigger into friendly fields.
	 *
	 * Falls back to sensible defaults if the cron cannot be mapped to one of
	 * the four preset frequencies.
	 *
	 * @param config - Automation config to parse
	 * @returns Parsed schedule fields
	 *
	 * @internal
	 */
	private parseCronToFields(config: AutomationConfig): ScheduleFields {
		const defaults: ScheduleFields = { frequency: 'week', dayOfWeek: 1, dayOfMonth: 1, hour: 9, minute: 0 };
		const scheduleTrigger = config.triggers.find(t => t.type === 'schedule') as ScheduleTrigger | undefined;
		if (!scheduleTrigger) return defaults;

		const parts = scheduleTrigger.schedule.trim().split(/\s+/);
		if (parts.length < 5) return defaults;

		const [minStr, hourStr, dayStr, , dowStr] = parts;
		const minute = this.parseField(minStr, 0);
		const hour   = this.parseField(hourStr, 9);
		const day    = this.parseField(dayStr, 1);
		const dow    = this.parseField(dowStr, 1);

		// Determine frequency from cron shape
		if (hourStr === '*') return { frequency: 'hour', dayOfWeek: 1, dayOfMonth: 1, hour: 0, minute };
		if (dayStr !== '*' && dowStr === '*') return { frequency: 'month', dayOfWeek: 1, dayOfMonth: day, hour, minute };
		if (dowStr !== '*') return { frequency: 'week', dayOfWeek: dow, dayOfMonth: 1, hour, minute };
		return { frequency: 'day', dayOfWeek: 1, dayOfMonth: 1, hour, minute };
	}

	/**
	 * Parse a single cron field. Returns `fallback` for wildcards or non-numeric values.
	 *
	 * @internal
	 */
	private parseField(value: string | undefined, fallback: number): number {
		if (!value || value === '*') return fallback;
		const n = Number(value);
		return Number.isNaN(n) ? fallback : n;
	}

	/**
	 * Extract the primary value string from an action for display.
	 *
	 * @internal
	 */
	private getActionValue(action: AutomationAction): string {
		switch (action.type) {
			case 'run-agent': return action.agentId;
			case 'run-prompt': return action.promptId;
			case 'run-skill': return action.skillId;
			case 'create-note':
			case 'update-note': return action.path;
			case 'run-command': return action.commandId;
			default: return '';
		}
	}
}
