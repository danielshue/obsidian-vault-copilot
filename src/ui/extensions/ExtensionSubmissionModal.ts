/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ExtensionSubmissionModal
 * @description Multi-step modal for submitting extensions to the Vault Copilot catalog
 * 
 * Provides a user-friendly interface for:
 * - Selecting and validating extensions
 * - Collecting GitHub repository details
 * - Gathering author information
 * - Previewing and confirming submission details
 * - Automating the GitHub fork, commit, and pull request process
 * 
 * @example
 * ```typescript
 * const modal = new ExtensionSubmissionModal(app);
 * const result = await modal.show();
 * if (result) {
 *   console.log('Extension submitted:', result);
 * }
 * ```
 * 
 * @since 0.1.0
 */

import { App, Modal, ButtonComponent, Setting, Notice, TextComponent } from "obsidian";
import type {
	ExtensionSubmissionData,
	ExtensionType,
	ValidationResult,
	ExtensionManifest,
} from "../../types/extension-submission";
import { FileSuggest } from "../FileSuggest";

/**
 * Multi-step modal for extension submission workflow
 */
export class ExtensionSubmissionModal extends Modal {
	private currentStep = 0;
	private submissionData: Partial<ExtensionSubmissionData> = {};
	private resolve: ((value: ExtensionSubmissionData | null) => void) | null = null;
	
	// Form elements
	private extensionPathInput: TextComponent | null = null;
	private githubUsernameInput: TextComponent | null = null;
	private branchNameInput: TextComponent | null = null;
	
	/**
	 * Creates a new extension submission modal
	 * 
	 * @param app - Obsidian app instance
	 */
	constructor(app: App) {
		super(app);
	}
	
	/**
	 * Shows the modal and returns a promise that resolves with submission data
	 * 
	 * @returns Promise that resolves with submission data or null if cancelled
	 * 
	 * @example
	 * ```typescript
	 * const result = await modal.show();
	 * if (result) {
	 *   // Process submission
	 * }
	 * ```
	 */
	show(): Promise<ExtensionSubmissionData | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
	
	onOpen() {
		this.renderCurrentStep();
	}
	
	onClose() {
		if (this.resolve) {
			this.resolve(null);
			this.resolve = null;
		}
	}
	
	/**
	 * Renders the current step of the submission workflow
	 * 
	 * @internal
	 */
	private renderCurrentStep() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("extension-submission-modal");
		
		// Progress indicator
		this.renderProgressIndicator(contentEl);
		
		// Render step-specific content
		switch (this.currentStep) {
			case 0:
				this.renderExtensionSelectionStep(contentEl);
				break;
			case 1:
				this.renderGitHubDetailsStep(contentEl);
				break;
			case 2:
				this.renderAuthorInformationStep(contentEl);
				break;
			case 3:
				this.renderPreviewStep(contentEl);
				break;
		}
	}
	
	/**
	 * Renders the progress indicator showing current step
	 * 
	 * @param container - Container element
	 * @internal
	 */
	private renderProgressIndicator(container: HTMLElement) {
		const steps = [
			"Select Extension",
			"GitHub Details",
			"Author Info",
			"Preview & Submit"
		];
		
		const progressContainer = container.createDiv({ cls: "submission-progress" });
		
		steps.forEach((stepName, index) => {
			const stepEl = progressContainer.createDiv({ cls: "progress-step" });
			
			if (index < this.currentStep) {
				stepEl.addClass("complete");
			} else if (index === this.currentStep) {
				stepEl.addClass("active");
			}
			
			const stepNumber = stepEl.createDiv({ cls: "step-number", text: `${index + 1}` });
			const stepLabel = stepEl.createDiv({ cls: "step-label", text: stepName });
		});
	}
	
	/**
	 * Step 1: Extension selection and validation
	 * 
	 * @param container - Container element
	 * @internal
	 */
	private renderExtensionSelectionStep(container: HTMLElement) {
		container.createEl("h2", { text: "Select Extension" });
		container.createEl("p", { 
			text: "Choose the extension folder you want to submit to the Vault Copilot catalog."
		});
		
		// Extension type selection
		new Setting(container)
			.setName("Extension Type")
			.setDesc("What type of extension are you submitting?")
			.addDropdown(dropdown => {
				dropdown
					.addOption("agent", "Agent")
					.addOption("voice-agent", "Voice Agent")
					.addOption("prompt", "Prompt")
					.addOption("skill", "Skill")
					.addOption("mcp-server", "MCP Server")
					.setValue(this.submissionData.extensionType || "agent")
					.onChange(value => {
						this.submissionData.extensionType = value as ExtensionType;
					});
			});
		
		// Extension path
		new Setting(container)
			.setName("Extension Folder Path")
			.setDesc("Path to your extension folder (e.g., extensions/agents/my-agent)")
			.addText(text => {
				this.extensionPathInput = text;
				text
					.setPlaceholder("extensions/agents/my-agent")
					.setValue(this.submissionData.extensionPath || "")
					.onChange(value => {
						this.submissionData.extensionPath = value;
					});
			});
		
		// Validation info
		const validationContainer = container.createDiv({ cls: "validation-info" });
		validationContainer.createEl("p", {
			text: "💡 Your extension will be validated before submission. Make sure your manifest.json is complete."
		});
		
		// Navigation buttons
		this.renderNavigationButtons(container, false, true);
	}
	
	/**
	 * Step 2: GitHub repository details
	 * 
	 * @param container - Container element
	 * @internal
	 */
	private renderGitHubDetailsStep(container: HTMLElement) {
		container.createEl("h2", { text: "GitHub Details" });
		container.createEl("p", { 
			text: "Provide your GitHub information for creating the pull request."
		});
		
		// GitHub username
		new Setting(container)
			.setName("GitHub Username")
			.setDesc("Your GitHub username (e.g., octocat)")
			.addText(text => {
				this.githubUsernameInput = text;
				text
					.setPlaceholder("octocat")
					.setValue(this.submissionData.githubUsername || "")
					.onChange(value => {
						this.submissionData.githubUsername = value;
						// Auto-generate branch name if not set
						if (!this.submissionData.branchName && this.submissionData.extensionId) {
							this.submissionData.branchName = `add-${this.submissionData.extensionId}`;
							if (this.branchNameInput) {
								this.branchNameInput.setValue(this.submissionData.branchName);
							}
						}
					});
			});
		
		// Fork repository name (usually obsidian-vault-copilot)
		new Setting(container)
			.setName("Fork Repository Name")
			.setDesc("Name of your forked repository")
			.addText(text => {
				text
					.setPlaceholder("obsidian-vault-copilot")
					.setValue(this.submissionData.forkRepoName || "obsidian-vault-copilot")
					.onChange(value => {
						this.submissionData.forkRepoName = value;
					});
			});
		
		// Branch name
		new Setting(container)
			.setName("Branch Name")
			.setDesc("Branch name for your submission (will be auto-generated)")
			.addText(text => {
				this.branchNameInput = text;
				text
					.setPlaceholder("add-my-extension")
					.setValue(this.submissionData.branchName || "")
					.onChange(value => {
						this.submissionData.branchName = value;
					});
			});
		
		// Info box
		const infoContainer = container.createDiv({ cls: "github-info" });
		infoContainer.createEl("h3", { text: "Before you continue:" });
		const ul = infoContainer.createEl("ul");
		ul.createEl("li", { text: "Make sure you have forked the obsidian-vault-copilot repository" });
		ul.createEl("li", { text: "Ensure GitHub CLI (gh) is installed and authenticated" });
		ul.createEl("li", { text: "Your fork should be up-to-date with the main repository" });
		
		// Navigation buttons
		this.renderNavigationButtons(container, true, true);
	}
	
	/**
	 * Step 3: Author information
	 * 
	 * @param container - Container element
	 * @internal
	 */
	private renderAuthorInformationStep(container: HTMLElement) {
		container.createEl("h2", { text: "Author Information" });
		container.createEl("p", { 
			text: "Provide information about yourself as the extension author."
		});
		
		// Author name
		new Setting(container)
			.setName("Author Name")
			.setDesc("Your full name or display name")
			.addText(text => {
				text
					.setPlaceholder("John Doe")
					.setValue(this.submissionData.authorName || "")
					.onChange(value => {
						this.submissionData.authorName = value;
					});
			});
		
		// Author URL
		new Setting(container)
			.setName("Author URL")
			.setDesc("Your GitHub profile or personal website URL")
			.addText(text => {
				text
					.setPlaceholder("https://github.com/yourusername")
					.setValue(this.submissionData.authorUrl || "")
					.onChange(value => {
						this.submissionData.authorUrl = value;
					});
			});
		
		// Navigation buttons
		this.renderNavigationButtons(container, true, true);
	}
	
	/**
	 * Step 4: Preview and confirmation
	 * 
	 * @param container - Container element
	 * @internal
	 */
	private renderPreviewStep(container: HTMLElement) {
		container.createEl("h2", { text: "Preview & Confirm" });
		container.createEl("p", { 
			text: "Review your submission details before proceeding."
		});
		
		// Summary
		const summaryContainer = container.createDiv({ cls: "submission-summary" });
		
		summaryContainer.createEl("h3", { text: "Extension Details" });
		this.addSummaryItem(summaryContainer, "Type", this.submissionData.extensionType || "");
		this.addSummaryItem(summaryContainer, "Path", this.submissionData.extensionPath || "");
		this.addSummaryItem(summaryContainer, "ID", this.submissionData.extensionId || "");
		this.addSummaryItem(summaryContainer, "Name", this.submissionData.extensionName || "");
		this.addSummaryItem(summaryContainer, "Version", this.submissionData.version || "");
		
		summaryContainer.createEl("h3", { text: "GitHub Details" });
		this.addSummaryItem(summaryContainer, "Username", this.submissionData.githubUsername || "");
		this.addSummaryItem(summaryContainer, "Repository", this.submissionData.forkRepoName || "");
		this.addSummaryItem(summaryContainer, "Branch", this.submissionData.branchName || "");
		
		summaryContainer.createEl("h3", { text: "Author" });
		this.addSummaryItem(summaryContainer, "Name", this.submissionData.authorName || "");
		this.addSummaryItem(summaryContainer, "URL", this.submissionData.authorUrl || "");
		
		// What will happen
		const processContainer = container.createDiv({ cls: "submission-process" });
		processContainer.createEl("h3", { text: "What will happen next:" });
		const ol = processContainer.createEl("ol");
		ol.createEl("li", { text: "Your extension will be validated" });
		ol.createEl("li", { text: "A new branch will be created in your fork" });
		ol.createEl("li", { text: "Extension files will be committed to the branch" });
		ol.createEl("li", { text: "A pull request will be created to the main repository" });
		ol.createEl("li", { text: "Maintainers will review your submission" });
		
		// Navigation buttons
		this.renderNavigationButtons(container, true, false, true);
	}
	
	/**
	 * Adds a summary item to the preview
	 * 
	 * @param container - Container element
	 * @param label - Item label
	 * @param value - Item value
	 * @internal
	 */
	private addSummaryItem(container: HTMLElement, label: string, value: string) {
		const item = container.createDiv({ cls: "summary-item" });
		item.createEl("span", { cls: "summary-label", text: `${label}:` });
		item.createEl("span", { cls: "summary-value", text: value });
	}
	
	/**
	 * Renders navigation buttons (Back/Next/Submit)
	 * 
	 * @param container - Container element
	 * @param showBack - Whether to show the back button
	 * @param showNext - Whether to show the next button
	 * @param showSubmit - Whether to show the submit button
	 * @internal
	 */
	private renderNavigationButtons(
		container: HTMLElement,
		showBack = false,
		showNext = false,
		showSubmit = false
	) {
		const buttonContainer = container.createDiv({ cls: "navigation-buttons" });
		
		if (showBack) {
			new ButtonComponent(buttonContainer)
				.setButtonText("← Back")
				.onClick(() => {
					this.currentStep--;
					this.renderCurrentStep();
				});
		}
		
		if (showNext) {
			new ButtonComponent(buttonContainer)
				.setButtonText("Next →")
				.setCta()
				.onClick(async () => {
					if (await this.validateCurrentStep()) {
						this.currentStep++;
						this.renderCurrentStep();
					}
				});
		}
		
		if (showSubmit) {
			new ButtonComponent(buttonContainer)
				.setButtonText("Submit Extension")
				.setCta()
				.onClick(async () => {
					await this.submitExtension();
				});
		}
		
		// Cancel button (always show)
		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				this.close();
			});
	}
	
	/**
	 * Validates the current step before proceeding
	 * 
	 * @returns True if validation passed
	 * @internal
	 */
	private async validateCurrentStep(): Promise<boolean> {
		switch (this.currentStep) {
			case 0: // Extension selection
				if (!this.submissionData.extensionPath) {
					new Notice("Please provide an extension folder path");
					return false;
				}
				// TODO: Validate extension exists and has valid manifest
				// For now, just set dummy data
				this.submissionData.extensionId = "my-extension";
				this.submissionData.extensionName = "My Extension";
				this.submissionData.version = "1.0.0";
				return true;
				
			case 1: // GitHub details
				if (!this.submissionData.githubUsername) {
					new Notice("Please provide your GitHub username");
					return false;
				}
				if (!this.submissionData.branchName) {
					new Notice("Please provide a branch name");
					return false;
				}
				return true;
				
			case 2: // Author information
				if (!this.submissionData.authorName) {
					new Notice("Please provide your author name");
					return false;
				}
				if (!this.submissionData.authorUrl) {
					new Notice("Please provide your author URL");
					return false;
				}
				return true;
		}
		
		return true;
	}
	
	/**
	 * Submits the extension
	 * 
	 * @internal
	 */
	private async submitExtension() {
		// Validate all required fields
		if (!this.submissionData.extensionPath ||
			!this.submissionData.githubUsername ||
			!this.submissionData.branchName ||
			!this.submissionData.authorName ||
			!this.submissionData.authorUrl) {
			new Notice("Please fill in all required fields");
			return;
		}
		
		// Close modal and return data
		if (this.resolve) {
			this.resolve(this.submissionData as ExtensionSubmissionData);
			this.resolve = null;
		}
		this.close();
	}
}
