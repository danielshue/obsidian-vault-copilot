/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationDetailsModal
 * @description Modal for displaying detailed information about an automation.
 * 
 * Shows triggers, actions, execution history, and configuration details.
 * 
 * @since 0.1.0
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import type { AutomationInstance } from '../../../automation/types';

export class AutomationDetailsModal extends Modal {
	private automation: AutomationInstance;
	private isRunning: boolean;

	constructor(app: App, automation: AutomationInstance, isRunning: boolean = false) {
		super(app);
		this.automation = automation;
		this.isRunning = isRunning;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('vc-automation-details-modal');

		// Header — vertical layout: status pill, name, description
		const header = contentEl.createDiv({ cls: 'vc-details-header' });

		const badges = header.createDiv({ cls: 'vc-details-badges' });
		badges.createEl('span', {
			cls: `vc-pill ${this.automation.enabled ? 'vc-pill-active' : 'vc-pill-inactive'}`,
			text: this.automation.enabled ? 'Active' : 'Inactive',
		});
		if (this.isRunning) {
			badges.createEl('span', {
				cls: 'vc-pill vc-pill-running',
				text: 'Executing',
			});
		}

		header.createEl('h2', { text: this.automation.name, cls: 'vc-details-title' });
		if (this.automation.description) {
			header.createEl('p', { text: this.automation.description, cls: 'vc-details-desc' });
		}

		// Overview cards
		const overview = contentEl.createDiv({ cls: 'vc-details-cards' });
		this.addCard(overview, 'Automation ID', this.automation.id);
		this.addCard(overview, 'Runs', String(this.automation.executionCount));

		if (this.automation.lastRun) {
			this.addCard(overview, 'Last run', new Date(this.automation.lastRun).toLocaleString());
		}
		if (this.automation.nextRun) {
			this.addCard(overview, 'Next run', new Date(this.automation.nextRun).toLocaleString());
		}

		// Source file
		if (this.automation.sourcePath) {
			const sourceCard = overview.createDiv({ cls: 'vc-detail-card vc-detail-card-wide' });
			sourceCard.createDiv({ text: 'Source', cls: 'vc-detail-card-label' });
			const sourceLink = sourceCard.createEl('a', {
				text: this.automation.sourcePath,
				cls: 'vc-detail-card-value vc-detail-source-link',
				href: '#',
			});
			sourceLink.onclick = async (e) => { e.preventDefault(); await this.openSourceFile(); };
		}

		// Triggers section
		const triggersSection = contentEl.createDiv({ cls: 'vc-details-section' });
		triggersSection.createEl('h3', { text: 'Triggers' });

		for (const trigger of this.automation.config.triggers) {
			const item = triggersSection.createDiv({ cls: 'vc-details-item' });
			const label = item.createEl('span', { cls: 'vc-details-item-type' });
			label.textContent = trigger.type;

			let details = '';
			if (trigger.type === 'schedule' && 'schedule' in trigger) {
				details = trigger.schedule;
			} else if ((trigger.type === 'file-created' || trigger.type === 'file-modified' || trigger.type === 'file-deleted') && 'pattern' in trigger) {
				details = `Pattern: ${trigger.pattern}`;
			} else if (trigger.type === 'tag-added' && 'tag' in trigger) {
				details = `Tag: ${trigger.tag}`;
			}

			if (details) {
				item.createEl('code', { text: details, cls: 'vc-details-item-value' });
			}

			if (trigger.delay && trigger.delay > 0) {
				item.createEl('span', { text: `${trigger.delay}ms delay`, cls: 'vc-details-item-meta' });
			}
		}

		// Actions section
		const actionsSection = contentEl.createDiv({ cls: 'vc-details-section' });
		actionsSection.createEl('h3', { text: 'Actions' });

		for (const action of this.automation.config.actions) {
			const item = actionsSection.createDiv({ cls: 'vc-details-item' });
			const label = item.createEl('span', { cls: 'vc-details-item-type' });
			label.textContent = action.type;

			let details = '';
			if (action.type === 'run-agent' && 'agentId' in action) {
				details = `Agent: ${action.agentId}`;
			} else if (action.type === 'run-prompt' && 'promptId' in action) {
				details = `Prompt: ${action.promptId}`;
			} else if (action.type === 'run-skill' && 'skillId' in action) {
				details = `Skill: ${action.skillId}`;
			}

			if (details) {
				item.createEl('code', { text: details, cls: 'vc-details-item-value' });
			}

			if (action.input && Object.keys(action.input).length > 0) {
				const paramCount = Object.keys(action.input).length;
				item.createEl('span', {
					text: `${paramCount} parameter${paramCount > 1 ? 's' : ''}`,
					cls: 'vc-details-item-meta',
				});
			}
		}

		// Last execution result
		if (this.automation.lastResult) {
			const resultSection = contentEl.createDiv({ cls: 'vc-details-section' });
			resultSection.createEl('h3', { text: 'Last execution' });

			const resultCards = resultSection.createDiv({ cls: 'vc-details-cards' });
			this.addCard(resultCards, 'Result',
				this.automation.lastResult.success ? '✓ Success' : '✗ Failed');
			this.addCard(resultCards, 'Timestamp',
				new Date(this.automation.lastResult.timestamp).toLocaleString());
			this.addCard(resultCards, 'Trigger',
				this.automation.lastResult.trigger.type);

			if (this.automation.lastResult.error) {
				const errorDiv = resultSection.createDiv({ cls: 'vc-details-error' });
				errorDiv.createEl('span', { text: this.automation.lastResult.error });
			}

			if (this.automation.lastResult.actionResults.length > 0) {
				for (let i = 0; i < this.automation.lastResult.actionResults.length; i++) {
					const ar = this.automation.lastResult.actionResults[i];
					if (!ar) continue;
					const item = resultSection.createDiv({ cls: 'vc-details-item' });
					const icon = ar.success ? '✓' : '✗';
					const statusCls = ar.success ? 'vc-result-success' : 'vc-result-failure';
					item.createEl('span', { text: icon, cls: statusCls });
					item.createEl('span', { text: `Action ${i + 1} (${ar.action.type})` });
					if (ar.error) {
						item.createEl('span', { text: ar.error, cls: 'vc-text-error' });
					} else {
						item.createEl('span', { text: `${ar.duration}ms`, cls: 'vc-details-item-meta' });
					}
				}
			}
		}

		// Footer — right-aligned via shared modal style
		const footer = contentEl.createDiv({ cls: 'vc-modal-footer' });
		const closeBtn = footer.createEl('button', { text: 'Close', cls: 'mod-cta' });
		closeBtn.onclick = () => this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private addCard(container: HTMLElement, label: string, value: string): void {
		const card = container.createDiv({ cls: 'vc-detail-card' });
		card.createDiv({ text: label, cls: 'vc-detail-card-label' });
		card.createDiv({ text: value, cls: 'vc-detail-card-value' });
	}

	private async openSourceFile(): Promise<void> {
		if (!this.automation.sourcePath) {
			new Notice('No source file available for this automation');
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(this.automation.sourcePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(true).openFile(file);
			return;
		}

		new Notice(`Could not find source file: ${this.automation.sourcePath}`);
	}
}
