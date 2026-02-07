/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/SelectExtensionScreen
 * @description Extension selection and type chooser screen
 */

import { Setting } from "obsidian";
import type { ScreenContext, ScreenCallbacks, ExtensionType } from "./types";

/**
 * Renders the extension selection step
 */
export function renderSelectExtensionScreen(
	container: HTMLElement,
	context: ScreenContext,
	callbacks: ScreenCallbacks,
	renderNavigationButtons: (container: HTMLElement, showBack: boolean, showNext: boolean) => void
): void {
	container.createEl("h2", { text: "Select Extension" });
	container.createEl("p", { 
		text: "Choose the extension folder you want to submit to the Vault Copilot catalog."
	});
	
	// Extension type selection
	const getExampleFileName = (type: ExtensionType | undefined): string => {
		switch (type) {
			case "voice-agent":
				return "my-voice-agent.voice-agent.md";
			case "prompt":
				return "my-prompt.prompt.md";
			case "skill":
				return "my-skill.skill.md";
			case "mcp-server":
				return "my-mcp-server.mcp-server.md";
			case "agent":
		default:
				return "my-agent.agent.md";
		}
	};

	const validationContainer = container.createDiv({ cls: "validation-info" });
	const validationHint = validationContainer.createEl("p");
	const updateValidationHint = (type: ExtensionType | undefined): void => {
		const example = getExampleFileName(type);
		validationHint.setText(
			`💡 Provide either a file path (${example}) or folder path. If the folder has manifest.json, it will be used; otherwise, manifest will be generated automatically.`,
		);
	};

	const initialType = (context.submissionData.extensionType || "agent") as ExtensionType;
	context.submissionData.extensionType = context.submissionData.extensionType || initialType;

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
				.setValue(initialType)
				.onChange(value => {
					context.submissionData.extensionType = value as ExtensionType;
					updateValidationHint(context.submissionData.extensionType);
				});
		});
	
	// Extension path (file or folder)
	new Setting(container)
		.setName("Extension Path")
		.setDesc("Path to extension file (my-agent.agent.md) or folder")
		.addText(text => {
			context.extensionPathInput = text;
			text
				.setPlaceholder("extensions/agents/my-agent.agent.md or extensions/agents/my-agent/")
				.setValue(context.submissionData.extensionPath || "")
				.onChange(value => {
					context.submissionData.extensionPath = value;
					// Reset cached state when path changes
					context.hasCompletedInitialValidation = false;
					context.generatedDescription = "";
					context.generatedReadme = "";
					context.generatedImagePath = null;
				});
			// Make the input field longer
			text.inputEl.style.width = "100%";
		});
	
	// AI generation option (checkbox)
	new Setting(container)
		.setName("Generate content and image automatically")
		.setDesc("Use AI to generate description, README, and image. Uncheck if you already have these prepared.")
		.addToggle(toggle => {
			toggle
				.setValue(!context.skipAIGeneration)
				.onChange(value => {
					context.skipAIGeneration = !value;
				});
		});
	
	// Validation info (initial hint based on current type)
	updateValidationHint(context.submissionData.extensionType || "agent");
	
	// Message container for validation feedback
	container.createDiv({ cls: "step-message-container" });
	
	// Navigation buttons
	renderNavigationButtons(container, false, true);
}
