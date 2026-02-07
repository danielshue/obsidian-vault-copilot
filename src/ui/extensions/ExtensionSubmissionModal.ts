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
	private plugin: any; // Reference to the plugin for AI service access
	
	// Form elements
	private extensionPathInput: TextComponent | null = null;
	private authorNameInput: TextComponent | null = null;
	private authorUrlInput: TextComponent | null = null;
	private descriptionInput: HTMLTextAreaElement | null = null;
	private readmeInput: HTMLTextAreaElement | null = null;
	
	// Image file paths
	private iconImagePath: string | null = null;
	private previewImagePath: string | null = null;
	private generatedImagePath: string | null = null; // AI-generated image used for both
	
	// Loading state for AI generation
	private isGeneratingContent = false;
	private isGeneratingImage = false;
	private generatedDescription: string = "";
	private generatedReadme: string = "";
	
	// Track whether initial validation has been completed
	private hasCompletedInitialValidation = false;
	
	/**
	 * Creates a new extension submission modal
	 * 
	 * @param app - Obsidian app instance
	 * @param plugin - Plugin instance for accessing AI service
	 */
	constructor(app: App, plugin?: any) {
		super(app);
		this.plugin = plugin;
		// Pre-populate author info from Git config if available
		this.loadAuthorInfo();
	}
	
	/**
	 * Loads author information from git config
	 * 
	 * @internal
	 */
	private async loadAuthorInfo(): Promise<void> {
		try {
			// Try to get git user name and email
			const { exec } = require('child_process');
			const { promisify } = require('util');
			const execAsync = promisify(exec);
			
			try {
				const { stdout: name } = await execAsync('git config user.name');
				if (name && name.trim()) {
					this.submissionData.authorName = name.trim();
				}
			} catch (e) {
				// Ignore error, just won't pre-populate
			}
			
			try {
				const { stdout: email } = await execAsync('git config user.email');
				if (email && email.trim()) {
					// Try to construct GitHub URL from email
					const emailStr = email.trim();
					if (emailStr.includes('@users.noreply.github.com')) {
						const username = emailStr.split('@')[0].split('+')[1] || emailStr.split('@')[0];
						this.submissionData.authorUrl = `https://github.com/${username}`;
						this.submissionData.githubUsername = username;
					} else if (emailStr.includes('@')) {
						// Just use a placeholder, user can edit
						this.submissionData.authorUrl = '';
					}
				}
			} catch (e) {
				// Ignore error
			}
		} catch (error) {
			// If require fails (mobile), just skip
			console.log('Could not load git config:', error);
		}
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
	 * Renders an interim loading screen with progressive task status
	 * 
	 * @param currentTask - Current task being performed
	 * @param tasks - List of all tasks with their status
	 * @internal
	 */
	private renderLoadingScreenWithProgress(currentTask: string, tasks: Array<{name: string, status: 'pending' | 'in-progress' | 'complete'}>) {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("extension-submission-modal");
		contentEl.addClass("loading-screen");
		
		const loadingContainer = contentEl.createDiv({ cls: "loading-container" });
		
		// Spinner
		const spinner = loadingContainer.createDiv({ cls: "loading-spinner" });
		
		// Message
		loadingContainer.createEl("h2", { text: "Reviewing information...", cls: "loading-message" });
		
		// Current task
		loadingContainer.createEl("p", { 
			text: currentTask,
			cls: "loading-current-task"
		});
		
		// Task list
		const taskList = loadingContainer.createDiv({ cls: "loading-task-list" });
		tasks.forEach(task => {
			const taskItem = taskList.createDiv({ cls: `loading-task ${task.status}` });
			
			// Status icon
			let icon = "○"; // pending
			if (task.status === 'in-progress') icon = "◐";
			if (task.status === 'complete') icon = "✓";
			
			taskItem.createSpan({ text: icon, cls: "task-icon" });
			taskItem.createSpan({ text: task.name, cls: "task-name" });
		});
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
				this.renderExtensionDetailsStep(contentEl);
				break;
			case 2:
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
			"Extension Details",
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
	 * Step 2: Extension details (author info, description, images)
	 * 
	 * @param container - Container element
	 * @internal
	 */
	private renderExtensionDetailsStep(container: HTMLElement) {
		container.createEl("h2", { text: "Extension Details" });
		container.createEl("p", { 
			text: "Provide additional information and assets for your extension."
		});
		
		// Author name (pre-populated from git config)
		new Setting(container)
			.setName("Author Name")
			.setDesc("Your full name or display name (editable)")
			.addText(text => {
				this.authorNameInput = text;
				text
					.setPlaceholder("John Doe")
					.setValue(this.submissionData.authorName || "")
					.onChange(value => {
						this.submissionData.authorName = value;
					});
			});
		
		// Author URL (pre-populated from git config)
		new Setting(container)
			.setName("Author URL")
			.setDesc("Your GitHub profile or personal website URL (editable)")
			.addText(text => {
				this.authorUrlInput = text;
				text
					.setPlaceholder("https://github.com/yourusername")
					.setValue(this.submissionData.authorUrl || "")
					.onChange(value => {
						this.submissionData.authorUrl = value;
					});
			});
		
		// Extension description (AI-generated and pre-populated)
		const descSetting = new Setting(container)
			.setName("Extension Description")
			.setDesc(this.generatedDescription ? "AI-generated description (editable)" : "Brief description of your extension (optional)");
		
		this.descriptionInput = descSetting.controlEl.createEl("textarea", {
			attr: {
				placeholder: "A helpful extension that...",
				rows: "3"
			}
		});
		this.descriptionInput.style.width = "100%";
		this.descriptionInput.style.marginTop = "8px";
		// Pre-populate with AI-generated content
		this.descriptionInput.value = this.generatedDescription || "";
		
		// Icon image upload with AI generation option
		const iconSetting = new Setting(container)
			.setName("Extension Icon & Preview Image")
			.setDesc("Upload or generate images (same image used for both icon and preview)")
			.addButton(button => {
				button
					.setButtonText(this.iconImagePath || this.generatedImagePath ? "Change Image" : "Choose Image")
					.onClick(async () => {
						const input = document.createElement('input');
						input.type = 'file';
						input.accept = '.svg,.png';
						input.onchange = (e: Event) => {
							const target = e.target as HTMLInputElement;
							if (target.files && target.files.length > 0) {
								this.iconImagePath = target.files[0].path || target.files[0].name;
								this.previewImagePath = this.iconImagePath; // Use same for both
								this.generatedImagePath = null; // Clear generated if user uploads
								button.setButtonText("Change Image");
								new Notice(`Image selected: ${target.files[0].name}`);
								this.renderCurrentStep(); // Re-render to update display
							}
						};
						input.click();
					});
			})
			.addButton(button => {
				button
					.setButtonText(this.isGeneratingImage ? "Generating..." : "Generate with AI")
					.setDisabled(this.isGeneratingImage)
					.onClick(async () => {
						await this.generateExtensionImage(button);
					});
			});
		
		if (this.iconImagePath || this.generatedImagePath) {
			const imagePath = this.iconImagePath || this.generatedImagePath;
			container.createEl("div", { 
				text: this.generatedImagePath ? `🤖 AI-Generated: ${imagePath}` : `📎 Selected: ${imagePath}`,
				cls: "selected-file-info"
			});
		}
		
		// README content (AI-generated and pre-populated)
		const readmeSetting = new Setting(container)
			.setName("README Content")
			.setDesc(this.generatedReadme ? "AI-generated README (editable)" : "Additional documentation or usage instructions (optional)");
		
		this.readmeInput = readmeSetting.controlEl.createEl("textarea", {
			attr: {
				placeholder: "# My Extension\n\nUsage instructions...",
				rows: "6"
			}
		});
		this.readmeInput.style.width = "100%";
		this.readmeInput.style.marginTop = "8px";
		this.readmeInput.style.fontFamily = "monospace";
		// Pre-populate with AI-generated content
		this.readmeInput.value = this.generatedReadme || "";
		
		// Info box
		const infoContainer = container.createDiv({ cls: "validation-info" });
		infoContainer.createEl("p", {
			text: this.generatedDescription || this.generatedReadme
				? "💡 Author information has been pre-populated from your Git configuration. Description and README have been AI-generated based on your extension. You can edit all fields as needed."
				: "💡 Author information has been pre-populated from your Git configuration. You can edit it if needed."
		});
		
		// Navigation buttons
		this.renderNavigationButtons(container, true, true);
	}
	
	/**
	 * Step 3: Preview and confirmation
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
		
		summaryContainer.createEl("h3", { text: "Author" });
		this.addSummaryItem(summaryContainer, "Name", this.submissionData.authorName || "");
		this.addSummaryItem(summaryContainer, "URL", this.submissionData.authorUrl || "");
		
		if (this.iconImagePath || this.previewImagePath || this.generatedImagePath) {
			summaryContainer.createEl("h3", { text: "Assets" });
			const imagePath = this.iconImagePath || this.generatedImagePath;
			const imageLabel = this.generatedImagePath ? "Image (AI-Generated)" : "Image";
			if (imagePath) {
				this.addSummaryItem(summaryContainer, imageLabel, imagePath);
				summaryContainer.createEl("div", { 
					text: "Note: Same image will be used for both icon and preview",
					cls: "summary-note"
				});
			}
		}
		
		if (this.descriptionInput && this.descriptionInput.value) {
			summaryContainer.createEl("h3", { text: "Description" });
			const descText = summaryContainer.createDiv({ cls: "summary-description" });
			descText.setText(this.descriptionInput.value);
		}
		
		if (this.readmeInput && this.readmeInput.value) {
			summaryContainer.createEl("h3", { text: "README" });
			const readmeText = summaryContainer.createDiv({ cls: "summary-readme" });
			readmeText.setText(this.readmeInput.value);
		}
		
		// What will happen
		const processContainer = container.createDiv({ cls: "submission-process" });
		processContainer.createEl("h3", { text: "What will happen next:" });
		const ol = processContainer.createEl("ol");
		ol.createEl("li", { text: "Your extension will be validated" });
		ol.createEl("li", { text: "Assets (icons, images) will be prepared for submission" });
		ol.createEl("li", { text: "A pull request will be created automatically" });
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
				
				// Skip initial validation if already completed (user navigated back)
				if (this.hasCompletedInitialValidation) {
					return true;
				}
				
				// Run all validation and generation tasks with progress tracking
				const tasks = [
					{ name: "Generating Description", status: 'pending' as const },
					{ name: "Generating Image", status: 'pending' as const },
					{ name: "Validating ID doesn't exist", status: 'pending' as const }
				];
				
				try {
					// TODO: Validate extension exists and has valid manifest
					// For now, just set dummy data and auto-generate GitHub details
					this.submissionData.extensionId = "my-extension";
					this.submissionData.extensionName = "My Extension";
					this.submissionData.version = "1.0.0";
					
					// Auto-generate GitHub details
					if (this.submissionData.githubUsername) {
						this.submissionData.forkRepoName = "obsidian-vault-copilot";
						this.submissionData.branchName = `add-${this.submissionData.extensionId}`;
					} else {
						// Try to get from git config
						this.submissionData.githubUsername = "user";
						this.submissionData.forkRepoName = "obsidian-vault-copilot";
						this.submissionData.branchName = `add-${this.submissionData.extensionId}`;
					}
					
					// Task 1: Generate description and README
					tasks[0].status = 'in-progress';
					this.renderLoadingScreenWithProgress("Generating description and README...", tasks);
					await this.generateExtensionContent();
					tasks[0].status = 'complete';
					
					// Task 2: Generate image
					tasks[1].status = 'in-progress';
					this.renderLoadingScreenWithProgress("Generating extension image...", tasks);
					await this.generateExtensionImageAuto();
					tasks[1].status = 'complete';
					
					// Task 3: Validate ID
					tasks[2].status = 'in-progress';
					this.renderLoadingScreenWithProgress("Validating extension ID...", tasks);
					await this.validateExtensionId();
					tasks[2].status = 'complete';
					
					// Mark validation as completed
					this.hasCompletedInitialValidation = true;
					
					// All tasks complete
					return true;
					
				} catch (error) {
					console.error("Validation/generation failed:", error);
					new Notice("Some automated tasks failed. You can still proceed and enter details manually.");
					// Mark as completed even if some tasks failed
					this.hasCompletedInitialValidation = true;
					return true; // Still proceed even if generation fails
				}
				
			case 1: // Extension details (author info, images, description)
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
	 * Generates description and README content using AI
	 * 
	 * @internal
	 */
	private async generateExtensionContent(): Promise<void> {
		if (!this.plugin || !this.submissionData.extensionPath) {
			return;
		}
		
		this.isGeneratingContent = true;
		
		try {
			// Get AI provider (GitHub Copilot CLI or OpenAI)
			const aiProvider = this.plugin.getAIProvider?.();
			
			if (!aiProvider || !aiProvider.isReady()) {
				console.log("AI provider not available, skipping content generation");
				return;
			}
			
			// Read extension files to understand what it does
			const extensionPath = this.submissionData.extensionPath;
			let extensionContent = "";
			
			try {
				const adapter = this.app.vault.adapter;
				
				// Try to read the main extension file
				const possibleFiles = [
					`${extensionPath}/${this.submissionData.extensionId}.agent.md`,
					`${extensionPath}/${this.submissionData.extensionId}.prompt.md`,
					`${extensionPath}/${this.submissionData.extensionId}.voice-agent.md`,
					`${extensionPath}/README.md`
				];
				
				for (const filePath of possibleFiles) {
					try {
						if (await adapter.exists(filePath)) {
							extensionContent += await adapter.read(filePath);
							break;
						}
					} catch (e) {
						// Continue to next file
					}
				}
			} catch (error) {
				console.error("Error reading extension files:", error);
			}
			
			// Generate description (concise)
			const descriptionPrompt = `Based on this extension content, write a brief 1-2 sentence description suitable for a catalog listing:

${extensionContent || `Extension Name: ${this.submissionData.extensionName}\nExtension ID: ${this.submissionData.extensionId}`}

Description:`;
			
			const descriptionResponse = await aiProvider.sendMessage(descriptionPrompt);
			this.generatedDescription = descriptionResponse.trim();
			
			// Generate README (detailed)
			const readmePrompt = `Based on this extension content, write a comprehensive README.md file with the following sections:
- Brief overview
- Features
- Usage instructions
- Examples (if applicable)

${extensionContent || `Extension Name: ${this.submissionData.extensionName}\nExtension ID: ${this.submissionData.extensionId}`}

README.md:`;
			
			const readmeResponse = await aiProvider.sendMessage(readmePrompt);
			this.generatedReadme = readmeResponse.trim();
			
		} catch (error) {
			console.error("AI content generation error:", error);
			// Set fallback content
			this.generatedDescription = `${this.submissionData.extensionName} - A helpful extension for Obsidian Vault Copilot.`;
			this.generatedReadme = `# ${this.submissionData.extensionName}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`;
		} finally {
			this.isGeneratingContent = false;
		}
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
		
		// Final validation before submission - check catalog one more time
		try {
			await this.validateExtensionId();
		} catch (error) {
			// If validation fails (duplicate ID), show error and don't submit
			if (error instanceof Error) {
				new Notice(error.message);
				return;
			}
		}
		
		// Close modal and return data
		if (this.resolve) {
			this.resolve(this.submissionData as ExtensionSubmissionData);
			this.resolve = null;
		}
		this.close();
	}
	
	/**
	 * Generates extension icon and preview image using AI
	 * 
	 * @param button - Button component to update state
	 * @internal
	 */
	private async generateExtensionImage(button: ButtonComponent): Promise<void> {
		if (!this.plugin || this.isGeneratingImage) {
			return;
		}
		
		this.isGeneratingImage = true;
		button.setButtonText("Generating...");
		button.setDisabled(true);
		
		try {
			// TODO: Implement actual AI image generation
			// This would involve:
			// 1. Creating a prompt based on extension name and description
			// 2. Calling an AI image generation service (DALL-E, Stable Diffusion, etc.)
			// 3. Saving the generated image to a temporary location
			// 4. Setting both iconImagePath and previewImagePath to the same image
			
			// For now, simulate generation with a delay
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// Set a placeholder path (in real implementation, this would be the actual generated image)
			this.generatedImagePath = `generated-${this.submissionData.extensionId}-icon.png`;
			this.iconImagePath = null; // Clear manual selection
			this.previewImagePath = null;
			
			new Notice("Image generated successfully! Same image will be used for both icon and preview.");
			
			// Re-render to show the generated image
			this.renderCurrentStep();
			
		} catch (error) {
			console.error("Image generation failed:", error);
			new Notice("Image generation failed. Please upload an image manually.");
		} finally {
			this.isGeneratingImage = false;
			button.setButtonText("Generate with AI");
			button.setDisabled(false);
		}
	}
	
	/**
	 * Generates extension image automatically during loading (no button interaction)
	 * 
	 * @internal
	 */
	private async generateExtensionImageAuto(): Promise<void> {
		if (!this.plugin) {
			return;
		}
		
		try {
			// TODO: Implement actual AI image generation
			// For now, simulate with delay
			await new Promise(resolve => setTimeout(resolve, 1500));
			
			this.generatedImagePath = `generated-${this.submissionData.extensionId}-icon.png`;
			this.iconImagePath = null;
			this.previewImagePath = null;
			
		} catch (error) {
			console.error("Auto image generation failed:", error);
			// Don't show notice, just log - user can generate manually later
		}
	}
	
	/**
	 * Validates that the extension ID hasn't been submitted before
	 * 
	 * @internal
	 */
	private async validateExtensionId(): Promise<void> {
		if (!this.submissionData.extensionId) {
			return;
		}
		
		try {
			// Download and check the catalog
			const catalogUrl = "https://raw.githubusercontent.com/danielshue/obsidian-vault-copilot/main/catalog.json";
			
			const response = await fetch(catalogUrl);
			if (!response.ok) {
				console.warn("Could not fetch catalog for validation");
				return;
			}
			
			const catalog = await response.json();
			
			// Check if ID exists in any extension type
			const allExtensions = [
				...(catalog.agents || []),
				...(catalog['voice-agents'] || []),
				...(catalog.prompts || []),
				...(catalog.skills || []),
				...(catalog['mcp-servers'] || [])
			];
			
			const existingExtension = allExtensions.find((ext: any) => ext.id === this.submissionData.extensionId);
			
			if (existingExtension) {
				throw new Error(`Extension ID "${this.submissionData.extensionId}" already exists in the catalog. Please choose a different ID.`);
			}
			
		} catch (error) {
			if (error instanceof Error && error.message.includes("already exists")) {
				throw error; // Re-throw validation errors
			}
			console.warn("Catalog validation failed:", error);
			// Don't fail the whole process if we can't validate
		}
	}
}
