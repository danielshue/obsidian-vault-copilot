/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/PreviewScreen
 * @description Preview and confirmation screen before submission
 */

import type { ScreenContext } from "./types";
import { addSummaryItem } from "./utils";

/**
 * Renders the preview step
 */
export function renderPreviewScreen(
	container: HTMLElement,
	context: ScreenContext,
	renderNavigationButtons: (container: HTMLElement, showBack: boolean, showNext: boolean, showSubmit?: boolean) => void
): void {
	container.createEl("h2", { text: "Preview & Confirm" });
	container.createEl("p", { 
		text: "Review your submission details before proceeding."
	});
	
	// Summary
	const summaryContainer = container.createDiv({ cls: "submission-summary" });
	
	summaryContainer.createEl("h3", { text: "Extension Details" });
	// Capitalize extension type for display
	const displayType = context.submissionData.extensionType 
		? context.submissionData.extensionType.charAt(0).toUpperCase() + context.submissionData.extensionType.slice(1)
		: "";
	addSummaryItem(summaryContainer, "Type", displayType);
	addSummaryItem(summaryContainer, "Path", context.submissionData.extensionPath || "");
	addSummaryItem(summaryContainer, "ID", context.submissionData.extensionId || "");
	addSummaryItem(summaryContainer, "Name", context.submissionData.extensionName || "");
	addSummaryItem(summaryContainer, "Version", context.submissionData.version || "");
	
	summaryContainer.createEl("h3", { text: "Author" });
	addSummaryItem(summaryContainer, "Name", context.submissionData.authorName || "");
	addSummaryItem(summaryContainer, "URL", context.submissionData.authorUrl || "");
	
	if (context.iconImagePath || context.previewImagePath || context.generatedImagePath) {
		summaryContainer.createEl("h3", { text: "Assets" });
		const imagePath = context.iconImagePath || context.generatedImagePath;
		const imageLabel = context.generatedImagePath ? "Image (AI-Generated)" : "Image";
		if (imagePath) {
			addSummaryItem(summaryContainer, imageLabel, imagePath);
			
			// Show image preview for AI-generated images
			if (context.generatedImagePath) {
				const previewBox = summaryContainer.createEl("div", {
					cls: "image-preview-box"
				});
				previewBox.createEl("div", {
					text: "🖼️ AI-Generated Image Preview",
					cls: "image-preview-placeholder"
				});
				previewBox.createEl("div", {
					text: "Image will be generated and included in the PR submission",
					cls: "image-preview-note"
				});
			}
			
			summaryContainer.createEl("div", { 
				text: "Note: Same image will be used for both icon and preview",
				cls: "summary-note"
			});
		}
	}
	
	if (context.descriptionInput && context.descriptionInput.value) {
		summaryContainer.createEl("h3", { text: "Description" });
		const descText = summaryContainer.createDiv({ cls: "summary-description" });
		descText.setText(context.descriptionInput.value);
	}
	
	if (context.readmeInput && context.readmeInput.value) {
		summaryContainer.createEl("h3", { text: "README" });
		const readmeText = summaryContainer.createDiv({ cls: "summary-readme" });
		readmeText.setText(context.readmeInput.value);
	}
	
	// What will happen
	const processContainer = container.createDiv({ cls: "submission-process" });
	processContainer.createEl("h3", { text: "What will happen next:" });
	const ol = processContainer.createEl("ol");
	ol.createEl("li", { text: "Your extension will be validated" });
	ol.createEl("li", { text: "Assets (icons, images) will be prepared for submission" });
	ol.createEl("li", { text: "A pull request will be created automatically" });
	ol.createEl("li", { text: "Maintainers will review your submission" });
	
	// Message container for validation feedback
	container.createDiv({ cls: "step-message-container" });
	
	// Navigation buttons
	renderNavigationButtons(container, true, false, true);
}
