/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/WelcomeScreen
 * @description Welcome screen for extension submission wizard
 */

import { ButtonComponent } from "obsidian";
import type { ScreenCallbacks } from "./types";

/**
 * Renders the welcome screen
 */
export function renderWelcomeScreen(container: HTMLElement, callbacks: ScreenCallbacks): void {
	container.createEl("h1", { text: "Welcome to Extension Submission" });
	container.createEl("p", { 
		text: "This wizard will guide you through submitting your extension to the Vault Copilot catalog.",
		cls: "welcome-subtitle"
	});
	
	// What this wizard does
	const stepsSection = container.createDiv({ cls: "welcome-section" });
	stepsSection.createEl("h3", { text: "📋 What This Wizard Will Do:" });
	
	const stepsList = stepsSection.createEl("ol", { cls: "welcome-steps-list" });
	
	const steps = [
		{
			title: "Gather Extension Information",
			description: "Collect details about your extension from the markdown file or folder"
		},
		{
			title: "Generate Required Content (Optional)",
			description: "Use AI to automatically create description, README, and image—or provide your own"
		},
		{
			title: "Collect Author Information",
			description: "Auto-populate your name and GitHub profile from git config (editable)"
		},
		{
			title: "Review & Edit",
			description: "Review all generated content in large preview boxes and make any changes"
		},
		{
			title: "Package Files Together",
			description: "Prepare extension files, manifest.json, README, and images for submission"
		},
		{
			title: "Create Pull Request on GitHub",
			description: "Automatically fork the repository, create a branch, commit files, and submit a PR"
		}
	];
	
	steps.forEach((step) => {
		const stepItem = stepsList.createEl("li", { cls: "welcome-step-item" });
		stepItem.createEl("strong", { text: step.title });
		stepItem.createSpan({ text: ": " });
		stepItem.createSpan({ text: step.description });
	});
	
	// Key benefits
	const benefitsSection = container.createDiv({ cls: "welcome-section" });
	benefitsSection.createEl("h3", { text: "✨ Key Benefits:" });
	
	const benefitsList = benefitsSection.createEl("ul", { cls: "welcome-benefits-list" });
	
	const benefits = [
		"Complete automation from extension to pull request in 2-3 minutes",
		"Optional AI-powered content generation saves manual work",
		"Smart defaults from git config—minimal data entry required",
		"Transparent progress tracking at every step",
		"Full control—all generated content is editable",
		"Duplicate prevention to avoid wasted effort"
	];
	
	benefits.forEach(benefit => {
		benefitsList.createEl("li", { text: benefit });
	});
	
	// Privacy & permissions
	const privacySection = container.createDiv({ cls: "welcome-section welcome-privacy" });
	privacySection.createEl("h3", { text: "🔒 Privacy & Permissions:" });
	privacySection.createEl("p", { text: "This wizard will:" });
	
	const privacyList = privacySection.createEl("ul");
	privacyList.createEl("li", { text: "Use your GitHub credentials to create a fork and pull request" });
	privacyList.createEl("li", { text: "Read extension files from your vault to generate content (if AI enabled)" });
	privacyList.createEl("li", { text: "Access git config for author information (name and email)" });
	
	privacySection.createEl("p", { 
		text: "All operations require your confirmation. You'll review everything before submission.",
		cls: "privacy-note"
	});
	
	// Buttons
	const buttonContainer = container.createDiv({ cls: "modal-button-container" });
	
	new ButtonComponent(buttonContainer)
		.setButtonText("Get Started →")
		.setCta()
		.onClick(() => callbacks.onNext());
	
	new ButtonComponent(buttonContainer)
		.setButtonText("Cancel")
		.onClick(() => callbacks.onClose());
}
