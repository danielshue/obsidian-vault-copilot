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
 * const modal = new ExtensionSubmissionModal(app, plugin);
 * const result = await modal.show();
 * if (result) {
 *   console.log('Extension submitted:', result);
 * }
 * ```
 * 
 * @since 0.1.0
 */

import { App, Modal, ButtonComponent, TextComponent } from "obsidian";
import type { ExtensionSubmissionData } from "../../types/extension-submission";
import type VaultCopilotPlugin from "../../main";
import { GitHubSubmissionService } from "../../extensions/GitHubSubmissionService";

// Import screen components
import { renderWelcomeScreen } from "./Submission/WelcomeScreen";
import { renderSelectExtensionScreen } from "./Submission/SelectExtensionScreen";
import { renderGeneratingContentScreen } from "./Submission/GeneratingContentScreen";
import { renderAuthorDetailsScreen } from "./Submission/AuthorDetailsScreen";
import { renderDescriptionScreen } from "./Submission/DescriptionScreen";
import { renderReadmeScreen } from "./Submission/ReadmeScreen";
import { renderPreviewScreen } from "./Submission/PreviewScreen";
import { renderSubmissionProgressScreen } from "./Submission/SubmissionProgressScreen";
import { renderSuccessScreen } from "./Submission/SuccessScreen";

// Import utilities
import {
	loadAuthorInfo,
	showInlineMessage,
	parseOrDeriveExtensionInfo,
	validateExtensionId,
	generateExtensionContent,
	generateExtensionImageAuto,
	generateExtensionImage
} from "./Submission/utils";

import type { ScreenContext, ScreenCallbacks, LoadingTask } from "./Submission/types";

/**
 * Multi-step modal for extension submission workflow
 */
export class ExtensionSubmissionModal extends Modal {
	private currentStep = -1; // Start at -1 for Welcome screen
	private submissionData: Partial<ExtensionSubmissionData> = {};
	private resolve: ((value: ExtensionSubmissionData | null) => void) | null = null;
	private plugin: VaultCopilotPlugin | undefined;
	
	// Form elements
	private extensionPathInput: TextComponent | null = null;
	private authorNameInput: TextComponent | null = null;
	private authorUrlInput: TextComponent | null = null;
	private descriptionInput: HTMLTextAreaElement | null = null;
	private readmeInput: HTMLTextAreaElement | null = null;
	
	// Image file paths
	private iconImagePath: string | null = null;
	private previewImagePath: string | null = null;
	private generatedImagePath: string | null = null;
	
	// Loading state for AI generation
	private isGeneratingContent = false;
	private isGeneratingImage = false;
	private generatedDescription = "";
	private generatedReadme = "";
	
	// Track whether initial validation has been completed
	private hasCompletedInitialValidation = false;
	
	// Track whether user wants AI generation
	private skipAIGeneration = false;
	
	/**
	 * Creates a new extension submission modal
	 */
	constructor(app: App, plugin?: VaultCopilotPlugin) {
		super(app);
		this.plugin = plugin;
		this.loadAuthorInfoAsync();
	}
	
	/**
	 * Loads author information from git config
	 */
	private async loadAuthorInfoAsync(): Promise<void> {
		const authorInfo = await loadAuthorInfo();
		if (authorInfo.authorName) {
			this.submissionData.authorName = authorInfo.authorName;
		}
		if (authorInfo.authorUrl) {
			this.submissionData.authorUrl = authorInfo.authorUrl;
		}
		if (authorInfo.githubUsername) {
			this.submissionData.githubUsername = authorInfo.githubUsername;
		}
	}
	
	/**
	 * Shows the modal and returns a promise that resolves with submission data
	 */
	public show(): Promise<ExtensionSubmissionData | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
	
	public onOpen(): void {
		this.renderCurrentStep();
	}
	
	public onClose(): void {
		// Don't resolve or show notice - user explicitly closed modal
		// Clear resolve to prevent double resolution
		this.resolve = null;
	}
	
	/**
	 * Gets the screen context
	 */
	private getContext(): ScreenContext {
		return {
			app: this.app,
			plugin: this.plugin,
			submissionData: this.submissionData,
			extensionPathInput: this.extensionPathInput,
			authorNameInput: this.authorNameInput,
			authorUrlInput: this.authorUrlInput,
			descriptionInput: this.descriptionInput,
			readmeInput: this.readmeInput,
			iconImagePath: this.iconImagePath,
			previewImagePath: this.previewImagePath,
			generatedImagePath: this.generatedImagePath,
			isGeneratingContent: this.isGeneratingContent,
			isGeneratingImage: this.isGeneratingImage,
			generatedDescription: this.generatedDescription,
			generatedReadme: this.generatedReadme,
			hasCompletedInitialValidation: this.hasCompletedInitialValidation,
			skipAIGeneration: this.skipAIGeneration
		};
	}
	
	/**
	 * Gets the screen callbacks
	 */
	private getCallbacks(): ScreenCallbacks {
		return {
			onNext: async () => {
				if (await this.validateCurrentStep()) {
					this.currentStep++;
					this.renderCurrentStep();
				}
			},
			onBack: () => {
				this.currentStep--;
				this.renderCurrentStep();
			},
			onClose: () => this.close(),
			onSubmit: async () => await this.submitExtension(),
			onRender: () => this.renderCurrentStep(),
			showInlineMessage: (container, message, type) => showInlineMessage(container, message, type)
		};
	}
	
	/**
	 * Renders the current step
	 */
	private renderCurrentStep(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.removeClass("loading-screen");
		contentEl.addClass("extension-submission-modal");
		
		const context = this.getContext();
		const callbacks = this.getCallbacks();
		
		switch (this.currentStep) {
			case -1:
				// Welcome screen
				renderWelcomeScreen(contentEl, callbacks);
				break;
			case 0:
				// Select Extension
				this.renderProgressIndicator(contentEl);
				renderSelectExtensionScreen(contentEl, context, callbacks, this.renderNavigationButtons.bind(this));
				break;
			case 1:
				// Author Details
				this.renderProgressIndicator(contentEl);
				renderAuthorDetailsScreen(contentEl, context, this.renderNavigationButtons.bind(this));
				break;
			case 2:
				// Description
				this.renderProgressIndicator(contentEl);
				renderDescriptionScreen(
					contentEl,
					context,
					callbacks,
					this.renderNavigationButtons.bind(this),
					async (button) => {
						this.isGeneratingImage = true;
						this.renderCurrentStep();
						
						const result = await generateExtensionImage(
							this.plugin,
							this.submissionData.extensionId,
							button,
							contentEl.querySelector('.step-message-container') as HTMLElement,
							showInlineMessage
						);
						
						if (result.imagePath) {
							this.generatedImagePath = result.imagePath;
							this.iconImagePath = null;
							this.previewImagePath = null;
						}
						
						this.isGeneratingImage = result.isGenerating;
						this.renderCurrentStep();
					}
				);
				break;
			case 3:
				// README
				this.renderProgressIndicator(contentEl);
				renderReadmeScreen(contentEl, context, callbacks, this.renderNavigationButtons.bind(this));
				break;
			case 4:
				// Preview & Submit
				this.renderProgressIndicator(contentEl);
				renderPreviewScreen(contentEl, context, this.renderNavigationButtons.bind(this));
				break;
		}
	}
	
	/**
	 * Renders the progress indicator
	 */
	private renderProgressIndicator(container: HTMLElement): void {
		const steps = [
			"Select Extension",
			"Author Details",
			"Description",
			"README",
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
			
			stepEl.createDiv({ cls: "step-number", text: `${index + 1}` });
			stepEl.createDiv({ cls: "step-label", text: stepName });
		});
	}
	
	/**
	 * Renders navigation buttons
	 */
	private renderNavigationButtons(
		container: HTMLElement,
		showBack = false,
		showNext = false,
		showSubmit = false
	): void {
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
					const callbacks = this.getCallbacks();
					await callbacks.onNext();
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
		
		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => this.close());
	}
	
	/**
	 * Validates the current step before proceeding
	 */
	private async validateCurrentStep(): Promise<boolean> {
		const messageContainer = this.contentEl.querySelector('.step-message-container') as HTMLElement;
		
		switch (this.currentStep) {
			case 0: // Extension selection
				if (!this.submissionData.extensionPath) {
					if (messageContainer) {
						showInlineMessage(messageContainer, "Please provide an extension folder path", 'error');
					}
					return false;
				}
				
				// Skip initial validation if already completed
				if (this.hasCompletedInitialValidation) {
					return true;
				}
				
				// If user opted to skip AI generation
				if (this.skipAIGeneration) {
					try {
						const manifest = await parseOrDeriveExtensionInfo(
							this.app,
							this.submissionData.extensionPath,
							this.submissionData.extensionType
						);
						
						if (!manifest) {
							if (messageContainer) {
								showInlineMessage(messageContainer, "Could not read extension info. Please check your path points to a valid extension file or folder.", 'error');
							}
							return false;
						}
						
						this.submissionData.extensionId = manifest.id;
						this.submissionData.extensionName = manifest.name;
						this.submissionData.version = manifest.version;
						
						if (this.submissionData.githubUsername) {
							this.submissionData.forkRepoName = "obsidian-vault-copilot";
							this.submissionData.branchName = `add-${manifest.id}`;
						} else {
							this.submissionData.githubUsername = "user";
							this.submissionData.forkRepoName = "obsidian-vault-copilot";
							this.submissionData.branchName = `add-${manifest.id}`;
						}
						
						this.hasCompletedInitialValidation = true;
						return true;
						
					} catch (error) {
						console.error("Basic validation failed:", error);
						if (messageContainer) {
							showInlineMessage(messageContainer, "Validation failed. Please check your extension path and manifest.json.", 'error');
						}
						return false;
					}
				}
				
				// Run all validation and generation tasks
				const tasks: LoadingTask[] = [
					{ name: "Generating Description", status: 'pending' },
					{ name: "Generating Image", status: 'pending' },
					{ name: "Validating ID doesn't exist", status: 'pending' }
				];
				
				try {
					const manifest = await parseOrDeriveExtensionInfo(
						this.app,
						this.submissionData.extensionPath,
						this.submissionData.extensionType
					);
					
					if (!manifest) {
						if (messageContainer) {
							showInlineMessage(messageContainer, "Could not read extension info. Please check your path points to a valid extension file or folder.", 'error');
						}
						return false;
					}
					
					this.submissionData.extensionId = manifest.id;
					this.submissionData.extensionName = manifest.name;
					this.submissionData.version = manifest.version;
					
					if (this.submissionData.githubUsername) {
						this.submissionData.forkRepoName = "obsidian-vault-copilot";
						this.submissionData.branchName = `add-${manifest.id}`;
					} else {
						this.submissionData.githubUsername = "user";
						this.submissionData.forkRepoName = "obsidian-vault-copilot";
						this.submissionData.branchName = `add-${manifest.id}`;
					}
					
					// Task 1: Generate description and README
					tasks[0]!.status = 'in-progress';
					renderGeneratingContentScreen(this.contentEl, "Generating description and README...", tasks);
					const content = await generateExtensionContent(
						this.app,
						this.plugin,
						this.submissionData.extensionPath,
						this.submissionData.extensionId,
						this.submissionData.extensionName
					);
					this.generatedDescription = content.description;
					this.generatedReadme = content.readme;
					tasks[0]!.status = 'complete';
					
					// Task 2: Generate image
					tasks[1]!.status = 'in-progress';
					renderGeneratingContentScreen(this.contentEl, "Generating extension image...", tasks);
					const imagePath = await generateExtensionImageAuto(
						this.app,
						this.plugin,
						this.submissionData.extensionPath!,
						this.submissionData.extensionId,
						this.submissionData.extensionName,
						this.generatedReadme
					);
					if (imagePath) {
						this.generatedImagePath = imagePath;
					}
					tasks[1]!.status = 'complete';
					
					// Task 3: Validate ID
					tasks[2]!.status = 'in-progress';
					renderGeneratingContentScreen(this.contentEl, "Validating extension ID...", tasks);
					await validateExtensionId(this.submissionData.extensionId);
					tasks[2]!.status = 'complete';
					
					this.hasCompletedInitialValidation = true;
					return true;
					
				} catch (error) {
					console.error("Validation/generation failed:", error);
					if (messageContainer) {
						showInlineMessage(messageContainer, "Some automated tasks failed. You can still proceed and enter details manually.", 'warning');
					}
					this.hasCompletedInitialValidation = true;
					return true;
				}
				
			case 1: // Author Details
				if (!this.submissionData.authorName) {
					if (messageContainer) {
						showInlineMessage(messageContainer, "Please provide your author name", 'error');
					}
					return false;
				}
				if (!this.submissionData.authorUrl) {
					if (messageContainer) {
						showInlineMessage(messageContainer, "Please provide your author URL", 'error');
					}
					return false;
				}
				return true;
			
			case 2:
			case 3:
				return true;
		}
		
		return true;
	}
	
	/**
	 * Submits the extension via the GitHubSubmissionService.
	 *
	 * This method currently:
	 * - Derives the absolute extension folder path from the vault path
	 * - Initializes GitHubSubmissionService
	 * - Executes the submission workflow (validation + PR creation via tools)
	 * - Renders the success screen with the resulting PR URL
	 */
	private async submitExtension(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("submission-progress-screen");

		const progressContainer = container.createDiv({ cls: "loading-container" });
		progressContainer.createEl("h2", {
			text: "Submitting Extension...",
			cls: "submission-progress-title",
		});
		progressContainer.createDiv({ cls: "loading-spinner" });
		const messageContainer = progressContainer.createDiv({ cls: "step-message-container" });

		// Ensure we have a plugin instance and desktop vault path
		if (!this.plugin) {
			showInlineMessage(
				messageContainer,
				"Extension submission requires the Vault Copilot plugin instance.",
				"error"
			);
			return;
		}

		const adapter: any = this.app.vault.adapter;
		const vaultBasePath: string | undefined =
			typeof adapter.getBasePath === "function"
				? adapter.getBasePath()
				: typeof adapter.basePath === "string"
					? adapter.basePath
					: undefined;

		if (!vaultBasePath) {
			showInlineMessage(
				messageContainer,
				"Extension submission is only supported for local vaults on desktop.",
				"error"
			);
			return;
		}

		const data = this.submissionData as ExtensionSubmissionData;
		if (!data.extensionPath || !data.extensionId || !data.version || !data.extensionType) {
			showInlineMessage(
				messageContainer,
				"Missing required extension details. Please complete all steps before submitting.",
				"error"
			);
			return;
		}

		// Build absolute path to the extension directory on disk
		const normalizedVaultBase = vaultBasePath.replace(/\\/g, "/");
		const relativePath = data.extensionPath.replace(/^\/+/, "");
		const extensionPathFs = `${normalizedVaultBase}/${relativePath}`.replace(/\\/g, "/");

		const service = new GitHubSubmissionService({
			upstreamOwner: "danielshue",
			upstreamRepo: "obsidian-vault-copilot",
			targetBranch: "master",
			forkOwner: data.githubUsername || undefined,
		});

		try {
			await service.initialize();

			const result = await service.submitExtension({
				extensionPath: extensionPathFs,
				extensionId: data.extensionId,
				extensionType: data.extensionType,
				version: data.version,
				branchName: data.branchName,
				commitMessage: undefined,
				prTitle: data.prTitle,
				prDescription: data.prDescription,
			});

			await service.cleanup();

			if (result.success && result.pullRequestUrl) {
				// Show success screen with actual PR URL from the service
				renderSuccessScreen(this.contentEl, result.pullRequestUrl, () => {
					if (this.resolve) {
						this.resolve(data);
						this.resolve = null;
					}
					this.close();
				});
			} else {
				console.error("Extension submission failed:", result);
				const errorMessage =
					result.error ||
					(result.validationErrors && result.validationErrors.length
							? result.validationErrors.join("; ")
							: "Extension submission failed. Check the console for details.");
				showInlineMessage(messageContainer, errorMessage, "error");
			}
		} catch (error) {
			console.error("Extension submission failed:", error);
			showInlineMessage(
				messageContainer,
				`Extension submission failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
				"error"
			);
		} finally {
			// Best-effort cleanup if initialization partially succeeded
			try {
				await service.cleanup();
			} catch {
				// ignore
			}
		}
	}
}
