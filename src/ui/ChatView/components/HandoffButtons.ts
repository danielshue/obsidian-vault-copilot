/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module HandoffButtons
 * @description Renders handoff buttons after an assistant response completes.
 *
 * When the active agent defines `handoffs` in its frontmatter, this component
 * renders interactive suggestion buttons below the response. Clicking a button
 * switches to the target agent with an optional pre-filled (and optionally
 * auto-submitted) prompt — enabling guided, sequential agent workflows.
 *
 * @example
 * ```typescript
 * const handoffs = new HandoffButtons({
 *   onHandoff: (handoff) => {
 *     toolbarManager.selectAgentByName(handoff.agent);
 *     inputEl.textContent = handoff.prompt ?? '';
 *     if (handoff.send) sendMessage();
 *   },
 * });
 * handoffs.render(messagesContainer, activeAgent.handoffs);
 * ```
 *
 * @see {@link AgentHandoff} for the handoff data structure
 * @see {@link ToolbarManager} for agent selection
 * @since 0.0.26
 */

import { AgentHandoff } from "../../../copilot/customization/CustomizationLoader";

/**
 * Callback signature for when a user clicks a handoff button.
 *
 * @param handoff - The selected handoff definition
 */
export type HandoffCallback = (handoff: AgentHandoff) => void;

/**
 * Configuration for the HandoffButtons component.
 */
export interface HandoffButtonsConfig {
	/** Called when the user clicks a handoff button */
	onHandoff: HandoffCallback;
}

/**
 * Renders handoff suggestion buttons below assistant responses.
 *
 * Handoff buttons appear as interactive pill-shaped suggestions that let users
 * transition to a different agent with relevant context. They implement the
 * VS Code custom agent handoff pattern.
 */
export class HandoffButtons {
	private config: HandoffButtonsConfig;

	constructor(config: HandoffButtonsConfig) {
		this.config = config;
	}

	/**
	 * Render handoff buttons into the given container.
	 *
	 * @param container - The parent element (typically the messages container)
	 * @param handoffs - Array of handoff definitions to render as buttons
	 * @returns The wrapper element containing the buttons, or null if no handoffs
	 *
	 * @example
	 * ```typescript
	 * const el = handoffButtons.render(messagesContainer, agent.handoffs);
	 * ```
	 */
	render(container: HTMLElement, handoffs: AgentHandoff[]): HTMLElement | null {
		if (!handoffs || handoffs.length === 0) return null;

		const wrapper = container.createDiv({ cls: "vc-handoff-buttons" });

		for (const handoff of handoffs) {
			const btn = wrapper.createEl("button", {
				cls: "vc-handoff-btn",
				attr: {
					"aria-label": `Switch to ${handoff.agent} agent`,
					"data-agent": handoff.agent,
				},
			});

			// Arrow icon
			const iconSpan = btn.createSpan({ cls: "vc-handoff-icon" });
			iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;

			btn.createSpan({ cls: "vc-handoff-label", text: handoff.label });

			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.config.onHandoff(handoff);
			});
		}

		return wrapper;
	}

	/**
	 * Remove all handoff buttons from the container.
	 *
	 * @param container - The parent element to search for handoff button wrappers
	 */
	static removeAll(container: HTMLElement): void {
		const existing = container.querySelectorAll(".vc-handoff-buttons");
		existing.forEach(el => el.remove());
	}
}
