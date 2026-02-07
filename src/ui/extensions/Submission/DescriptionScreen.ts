/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/DescriptionScreen
 * @description Extension description and image upload/generation screen
 */

import { Setting, ButtonComponent } from "obsidian";
import type { ScreenContext, ScreenCallbacks } from "./types";
import { generateDescriptionWithAI } from "./utils";

/**
 * Renders the description step
 */
export function renderDescriptionScreen(
	container: HTMLElement,
	context: ScreenContext,
	callbacks: ScreenCallbacks,
	renderNavigationButtons: (container: HTMLElement, showBack: boolean, showNext: boolean) => void,
	onGenerateImage: (button: ButtonComponent) => Promise<void>
): void {
	container.createEl("h2", { text: "Extension Description" });
	container.createEl("p", { 
		text: "Provide a description and image for your extension."
	});
	
	// Extension description (AI-generated and pre-populated)
	const descWrapper = container.createDiv({ cls: "setting-item-stacked" });
	new Setting(descWrapper)
		.setName("Extension Description")
		.setDesc(context.generatedDescription ? "AI-generated description (editable)" : "Brief description of your extension (optional)")
		.addButton(button => {
			button
				.setButtonText(context.isGeneratingContent ? "Generating..." : "Generate with AI")
				.setClass("btn-ai")
				.setDisabled(context.isGeneratingContent)
				.onClick(async () => {
					context.isGeneratingContent = true;
					callbacks.onRender();
					
					const description = await generateDescriptionWithAI(
						context.app,
						context.plugin,
						context.submissionData.extensionPath || "",
						context.submissionData.extensionId,
						context.submissionData.extensionName,
						context.descriptionInput,
						container.querySelector('.step-message-container') as HTMLElement,
						callbacks.showInlineMessage
					);
					
					context.generatedDescription = description;
					context.submissionData.description = description;
					context.isGeneratingContent = false;
					callbacks.onRender();
				});
		});
	
	context.descriptionInput = descWrapper.createEl("textarea", {
		cls: "stacked-textarea",
		attr: {
			placeholder: "A helpful extension that...",
			rows: "3"
		}
	});
	// Pre-populate with AI-generated content or previously entered value
	context.descriptionInput.value = context.submissionData.description || context.generatedDescription || "";
	// Persist user changes to submissionData
	context.descriptionInput.addEventListener("input", () => {
		context.submissionData.description = context.descriptionInput?.value ?? "";
	});
	
	// Icon image upload with AI generation option
	new Setting(container)
		.setName("Extension Icon & Preview Image")
		.setDesc("Upload or generate an image for your extension (used as both icon and preview)")
		.addButton(button => {
			button
				.setButtonText(context.iconImagePath || context.generatedImagePath ? "Change Image" : "Choose Image")
				.onClick(async () => {
					const input = document.createElement('input');
					input.type = 'file';
					input.accept = '.svg,.png';
					input.onchange = (e: Event) => {
						const target = e.target as HTMLInputElement;
						if (target.files && target.files.length > 0) {
							const selectedFile = target.files[0];
							if (!selectedFile) return;
							context.iconImagePath = (selectedFile as unknown as {path?: string}).path || selectedFile.name;
							context.previewImagePath = context.iconImagePath;
							context.generatedImagePath = null;
							button.setButtonText("Change Image");
							callbacks.onRender();
						}
					};
					input.click();
				});
		})
		.addButton(button => {
			button
				.setButtonText(context.isGeneratingImage ? "Generating..." : "Generate with AI")
				.setClass("btn-ai")
				.setDisabled(context.isGeneratingImage)
				.onClick(async () => {
					await onGenerateImage(button);
				});
		});
	
	if (context.iconImagePath || context.generatedImagePath) {
		const imagePath = context.iconImagePath || context.generatedImagePath;
		container.createEl("div", { 
			text: context.generatedImagePath ? `🤖 AI-Generated Image` : `📎 Selected: ${imagePath}`,
			cls: "selected-file-info"
		});
		
		// Show actual image preview if it exists
		if (context.generatedImagePath) {
			const previewBox = container.createEl("div", {
				cls: "image-preview-box"
			});
			previewBox.createEl("div", {
				text: "🖼️ AI-Generated Image Preview",
				cls: "image-preview-placeholder"
			});
			previewBox.createEl("div", {
				text: "Note: Image will be generated and included in the PR submission",
				cls: "image-preview-note"
			});
		}
	}
	
	// Info box
	const infoContainer = container.createDiv({ cls: "validation-info" });
	infoContainer.createEl("p", {
		text: context.generatedDescription 
			? "💡 Description has been AI-generated based on your extension. You can edit it as needed."
			: "💡 Provide a brief description of your extension to help users understand its purpose."
	});
	
	// Message container for validation feedback
	container.createDiv({ cls: "step-message-container" });
	
	// Navigation buttons
	renderNavigationButtons(container, true, true);
}
