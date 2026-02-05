import { App, Modal } from "obsidian";

export interface PromptInputVariable {
	name: string;
	description: string;
	options: string[];
}

/**
 * Modal to collect additional input for prompts with ${input:...} variables
 */
export class PromptInputModal extends Modal {
	private variables: PromptInputVariable[];
	private onSubmit: (values: Map<string, string>) => void;
	private values: Map<string, string> = new Map();

	constructor(app: App, variables: PromptInputVariable[], onSubmit: (values: Map<string, string>) => void) {
		super(app);
		this.variables = variables;
		this.onSubmit = onSubmit;
		
		// Initialize with first option as default
		for (const v of variables) {
			const firstOption = v.options[0];
			if (firstOption) {
				this.values.set(v.name, firstOption);
			}
		}
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		
		titleEl.setText("Prompt Options");
		this.modalEl.addClass("vc-prompt-input-modal");
		contentEl.addClass("vc-prompt-input-content");
		
		this.renderContent();
	}

	private renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		for (const variable of this.variables) {
			const group = contentEl.createDiv({ cls: "vc-pi-group" });
			
			// Label
			group.createEl("label", { 
				text: variable.description,
				cls: "vc-pi-label"
			});
			
			// Options as buttons
			const optionsContainer = group.createDiv({ cls: "vc-pi-options" });
			
			for (const option of variable.options) {
				const btn = optionsContainer.createEl("button", {
					text: option,
					cls: "vc-pi-option"
				});
				
				if (this.values.get(variable.name) === option) {
					btn.addClass("vc-pi-option-selected");
				}
				
				btn.addEventListener("click", () => {
					this.values.set(variable.name, option);
					// Update selection UI
					optionsContainer.querySelectorAll(".vc-pi-option").forEach(el => {
						el.removeClass("vc-pi-option-selected");
					});
					btn.addClass("vc-pi-option-selected");
				});
			}
		}

		// Submit button
		const footer = contentEl.createDiv({ cls: "vc-pi-footer" });
		const submitBtn = footer.createEl("button", {
			text: "Start",
			cls: "vc-pi-submit"
		});
		submitBtn.addEventListener("click", () => {
			this.onSubmit(this.values);
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Parse ${input:name:desc|opt1|opt2} variables from prompt content
 */
export function parseInputVariables(content: string): PromptInputVariable[] {
	const regex = /\$\{input:([^:}]+):([^}]+)\}/g;
	const variables: PromptInputVariable[] = [];
	const seen = new Set<string>();
	
	let match;
	while ((match = regex.exec(content)) !== null) {
		const name = match[1];
		const descAndOptions = match[2];
		
		// Skip if capture groups are undefined
		if (!name || !descAndOptions) continue;
		
		// Skip duplicates
		if (seen.has(name)) continue;
		seen.add(name);
		
		const parts = descAndOptions.split("|");
		const description = parts[0]?.trim() || name;
		const options = parts.slice(1).map(opt => opt.trim()).filter(opt => opt);
		
		// Only include variables that have options (selection required)
		if (options.length > 0) {
			variables.push({ name, description, options });
		}
	}
	
	return variables;
}
