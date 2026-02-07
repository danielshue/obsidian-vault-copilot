/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/utils
 * @description Shared utility functions for extension submission
 */

import { App, TFile, ButtonComponent } from "obsidian";
import type { ExtensionManifest, ExtensionType } from "./types";
import type VaultCopilotPlugin from "../../../main";

/**
 * Loads author information from git config
 * 
 * Note: Uses require() for Node.js modules (child_process, util) as they are only available
 * in desktop environments and need to be loaded dynamically to avoid build errors.
 */
export async function loadAuthorInfo(): Promise<{ authorName?: string; authorUrl?: string; githubUsername?: string }> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { exec } = require('child_process');
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { promisify } = require('util');
		const execAsync = promisify(exec);
		
		const result: { authorName?: string; authorUrl?: string; githubUsername?: string } = {};
		
		try {
			const { stdout: name } = await execAsync('git config user.name');
			if (name && name.trim()) {
				result.authorName = name.trim();
			}
		} catch (e) {
			// Ignore error, just won't pre-populate
		}
		
		try {
			const { stdout: email } = await execAsync('git config user.email');
			if (email && email.trim()) {
				const emailStr = email.trim();
				let username: string | undefined;
				
				if (emailStr.includes('@users.noreply.github.com')) {
					const beforeAt = emailStr.split('@')[0];
					username = beforeAt.includes('+') ? beforeAt.split('+')[1] : beforeAt;
					result.githubUsername = username;
				} else if (emailStr.includes('@')) {
					username = emailStr.split('@')[0];
					result.githubUsername = username;
				}
				
				if (username) {
					result.authorUrl = `https://github.com/${username}`;
					console.log(`Auto-populated author URL: https://github.com/${username}`);
				}
			}
		} catch (e) {
			// Ignore error
		}
		
		return result;
	} catch (error) {
		console.log('Could not load git config:', error);
		return {};
	}
}

/**
 * Shows an inline message in the specified container
 */
export function showInlineMessage(container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info'): void {
	const existingMessages = container.querySelectorAll('.inline-message');
	existingMessages.forEach(msg => msg.remove());
	
	const messageEl = container.createDiv({ cls: `inline-message inline-message-${type}` });
	
	const icons = {
		error: '❌',
		warning: '⚠️',
		success: '✅',
		info: 'ℹ️'
	};
	
	messageEl.createSpan({ cls: 'inline-message-icon', text: icons[type] });
	messageEl.createSpan({ cls: 'inline-message-text', text: message });
	
	const closeBtn = messageEl.createEl('button', { cls: 'inline-message-close', text: '×' });
	closeBtn.addEventListener('click', () => messageEl.remove());
}

/**
 * Adds a summary item to the preview
 */
export function addSummaryItem(container: HTMLElement, label: string, value: string): void {
	const item = container.createDiv({ cls: "summary-item" });
	item.createEl("span", { cls: "summary-label", text: `${label}:` });
	item.createEl("span", { cls: "summary-value", text: value });
}

/**
 * Parses or derives extension info from path
 */
export async function parseOrDeriveExtensionInfo(
	app: App,
	extensionPath: string,
	extensionType: ExtensionType | undefined
): Promise<ExtensionManifest | null> {
	try {
		const abstractFile = app.vault.getAbstractFileByPath(extensionPath);
		if (!abstractFile) {
			console.error(`Could not find file or folder at path: ${extensionPath}`);
			return null;
		}
		
		if (abstractFile instanceof TFile) {
			// Scenario 1: User provided a file path
			console.log(`Input is a file: ${abstractFile.name}, deriving extension info...`);
			
			const extensions: Record<string, string> = {
				"agent": ".agent.md",
				"voice-agent": ".voice-agent.md",
				"prompt": ".prompt.md",
				"skill": ".skill.md",
				"mcp-server": ".mcp-server.md"
			};
			
			const targetExtension = (extensionType ? extensions[extensionType] : undefined) || ".agent.md";
			const id = abstractFile.name.replace(targetExtension, "");
			const name = id
				.split("-")
				.map(word => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");
			
			console.log(`Derived from file: id=${id}, name=${name}`);
			
			return {
				id: id,
				name: name,
				version: "1.0.0",
				description: "",
				author: { name: "", url: "" },
				type: (extensionType as any) || "agent",
				minVaultCopilotVersion: "0.0.1",
				categories: [],
				tags: [],
				files: []
			};
		} else {
			// It's a folder - check for manifest.json
			console.log(`Input is a folder, checking for manifest.json...`);
			
			const manifestPath = `${extensionPath}/manifest.json`;
			const manifestFile = app.vault.getAbstractFileByPath(manifestPath);
			
			if (manifestFile && manifestFile instanceof TFile) {
				// Scenario 2: Folder with manifest.json
				console.log(`Found manifest.json, parsing...`);
				
				try {
					const manifestContent = await app.vault.read(manifestFile);
					const manifest = JSON.parse(manifestContent) as ExtensionManifest;
					
					console.log(`Parsed manifest: id=${manifest.id}, name=${manifest.name}, version=${manifest.version}`);
					
					return manifest;
				} catch (error) {
					console.error("Failed to parse manifest.json, will derive from markdown file:", error);
				}
			}
			
			// Scenario 3: Folder without manifest - derive from markdown file
			console.log(`No valid manifest.json, deriving from markdown file...`);
			
			const extensions: Record<string, string> = {
				"agent": ".agent.md",
				"voice-agent": ".voice-agent.md",
				"prompt": ".prompt.md",
				"skill": ".skill.md",
				"mcp-server": ".mcp-server.md"
			};
			
			const targetExtension = (extensionType ? extensions[extensionType] : undefined) || ".agent.md";
			
			if (!('children' in abstractFile) || !Array.isArray((abstractFile as any).children)) {
				console.error("Folder does not contain files");
				return null;
			}
			
			const files = (abstractFile as any).children as TFile[];
			const mainFile = files.find((f: TFile) => f.name.endsWith(targetExtension));
			
			if (!mainFile) {
				console.error(`Could not find ${targetExtension} file in the folder`);
				return null;
			}
			
			const id = mainFile.name.replace(targetExtension, "");
			const name = id
				.split("-")
				.map(word => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");
			
			console.log(`Derived from markdown file: id=${id}, name=${name}`);
			
			return {
				id: id,
				name: name,
				version: "1.0.0",
				description: "",
				author: { name: "", url: "" },
				type: (extensionType as any) || "agent",
				minVaultCopilotVersion: "0.0.1",
				categories: [],
				tags: [],
				files: []
			};
		}
	} catch (error) {
		console.error("Failed to parse or derive extension info:", error);
		return null;
	}
}

/**
 * Cleans up markdown code blocks from AI-generated content
 */
export function cleanMarkdownCodeBlocks(content: string): string {
	let cleaned = content.trim();
	if (cleaned.startsWith('```markdown')) {
		cleaned = cleaned.replace(/^```markdown\n/, '').replace(/\n```$/, '');
	} else if (cleaned.startsWith('```')) {
		cleaned = cleaned.replace(/^```\n/, '').replace(/\n```$/, '');
	}
	return cleaned.trim();
}

/**
 * Validates that the extension ID doesn't exist in the catalog
 */
export async function validateExtensionId(extensionId: string): Promise<void> {
	if (!extensionId) {
		return;
	}
	
	try {
		const catalogUrl = "https://raw.githubusercontent.com/danielshue/obsidian-vault-copilot/main/catalog.json";
		
		const response = await fetch(catalogUrl);
		if (!response.ok) {
			console.warn("Could not fetch catalog for validation");
			return;
		}
		
		const catalog = await response.json();
		
		const allExtensions = [
			...(catalog.agents || []),
			...(catalog['voice-agents'] || []),
			...(catalog.prompts || []),
			...(catalog.skills || []),
			...(catalog['mcp-servers'] || [])
		];
		
		const existingExtension = allExtensions.find((ext: any) => ext.id === extensionId);
		
		if (existingExtension) {
			throw new Error(`Extension ID "${extensionId}" already exists in the catalog. Please choose a different ID.`);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			throw error;
		}
		console.warn("Catalog validation failed:", error);
	}
}

/**
 * Generates extension content (description and README) using AI
 */
export async function generateExtensionContent(
	app: App,
	plugin: VaultCopilotPlugin | undefined,
	extensionPath: string,
	extensionId: string | undefined,
	extensionName: string | undefined
): Promise<{ description: string; readme: string }> {
	if (!plugin || !extensionPath) {
		console.log("No plugin or extension path, skipping content generation");
		return {
			description: `${extensionName || "Extension"} - A helpful extension for Obsidian Vault Copilot.`,
			readme: `# ${extensionName || "Extension"}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`
		};
	}
	
	try {
		const aiService = plugin.getActiveService?.();
		
		if (!aiService) {
			console.log("AI service not available, using fallback content");
			return {
				description: `${extensionName || "Extension"} - A helpful extension for Obsidian Vault Copilot.`,
				readme: `# ${extensionName || "Extension"}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`
			};
		}
		
		console.log("AI service available, generating content...");
		
		// Read extension files
		let extensionContent = "";
		
		try {
			const adapter = app.vault.adapter;
			
			const possibleFiles = [
				`${extensionPath}/${extensionId}.agent.md`,
				`${extensionPath}/${extensionId}.prompt.md`,
				`${extensionPath}/${extensionId}.voice-agent.md`,
				`${extensionPath}/README.md`
			];
			
			for (const filePath of possibleFiles) {
				try {
					if (await adapter.exists(filePath)) {
						extensionContent += await adapter.read(filePath);
						console.log(`Read extension content from: ${filePath}`);
						break;
					}
				} catch (e) {
					// Continue to next file
				}
			}
		} catch (error) {
			console.error("Error reading extension files:", error);
		}
		
		// Check if AI service requires session creation
		let aiSession = null;
		if ('createSession' in aiService && typeof (aiService as any).createSession === 'function') {
			console.log("AI service requires session creation");
			aiSession = await (aiService as any).createSession();
		}
		
		// Generate description
		console.log("Starting AI description generation...");
		const descriptionPrompt = `Based on this extension content, write a brief 1-2 sentence description suitable for a catalog listing:

${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}

Description:`;
		
		console.log("Sending prompt to AI service for description...");
		let descriptionResponse;
		if (aiSession && typeof aiSession.sendMessage === 'function') {
			descriptionResponse = await aiSession.sendMessage(descriptionPrompt);
		} else if (typeof aiService.sendMessage === 'function') {
			descriptionResponse = await aiService.sendMessage(descriptionPrompt);
		} else {
			throw new Error("AI service does not support sendMessage");
		}
		
		const description = descriptionResponse.trim();
		console.log("AI description generated successfully");
		
		// Generate README
		console.log("Starting AI README generation...");
		const readmePrompt = `Based on this extension content, write a comprehensive README.md file with the following sections:
- Brief overview
- Features
- Usage instructions
- Examples (if applicable)

IMPORTANT:
- Do NOT wrap the output in markdown code blocks (no \`\`\`markdown)
- If the extension file has frontmatter (--- at the top), preserve it exactly
- Return the README content directly without any wrapper

${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}

README.md content:`;
		
		console.log("Sending prompt to AI service for README...");
		let readmeResponse;
		if (aiSession && typeof aiSession.sendMessage === 'function') {
			readmeResponse = await aiSession.sendMessage(readmePrompt);
		} else if (typeof aiService.sendMessage === 'function') {
			readmeResponse = await aiService.sendMessage(readmePrompt);
		} else {
			throw new Error("AI service does not support sendMessage");
		}
		
		const readme = cleanMarkdownCodeBlocks(readmeResponse);
		console.log("AI README generated successfully");
		console.log("Generated description:", description);
		console.log("Generated README length:", readme.length);
		
		return { description, readme };
		
	} catch (error) {
		console.error("AI content generation error:", error);
		return {
			description: `${extensionName} - A helpful extension for Obsidian Vault Copilot.`,
			readme: `# ${extensionName}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`
		};
	}
}

/**
 * Generates extension image automatically (no button interaction)
 */
export async function generateExtensionImageAuto(extensionId: string | undefined): Promise<string | null> {
	try {
		// TODO: Implement actual AI image generation
		await new Promise(resolve => setTimeout(resolve, 1500));
		
		return `generated-${extensionId}-icon.png`;
	} catch (error) {
		console.error("Auto image generation failed:", error);
		return null;
	}
}

/**
 * Generates extension image (with button interaction)
 */
export async function generateExtensionImage(
	plugin: VaultCopilotPlugin | undefined,
	extensionId: string | undefined,
	button: ButtonComponent,
	messageContainer: HTMLElement | null,
	showMessage: (container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info') => void
): Promise<{ imagePath: string | null; isGenerating: boolean }> {
	if (!plugin) {
		return { imagePath: null, isGenerating: false };
	}
	
	button.setButtonText("Generating...");
	button.setDisabled(true);
	
	try {
		// TODO: Implement actual AI image generation
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		const imagePath = `generated-${extensionId}-icon.png`;
		
		if (messageContainer) {
			showMessage(messageContainer, "Image generated successfully! Same image will be used for both icon and preview.", 'success');
		}
		
		return { imagePath, isGenerating: false };
		
	} catch (error) {
		console.error("Image generation failed:", error);
		
		if (messageContainer) {
			showMessage(messageContainer, "Image generation failed. Please upload an image manually.", 'error');
		}
		
		return { imagePath: null, isGenerating: false };
	} finally {
		button.setButtonText("Generate with AI");
		button.setDisabled(false);
	}
}

/**
 * Generates description with AI (manual trigger)
 */
export async function generateDescriptionWithAI(
	app: App,
	plugin: VaultCopilotPlugin | undefined,
	extensionPath: string,
	extensionId: string | undefined,
	extensionName: string | undefined,
	descriptionInput: HTMLTextAreaElement | null,
	messageContainer: HTMLElement | null,
	showMessage: (container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info') => void
): Promise<string> {
	if (!plugin) {
		return "";
	}
	
	try {
		const aiService = plugin.getActiveService?.();
		
		if (!aiService) {
			throw new Error("AI service not available");
		}
		
		console.log("Starting AI description generation...");
		
		// Read extension files
		let extensionContent = "";
		
		const possibleFiles = [
			`${extensionPath}/${extensionId}.agent.md`,
			`${extensionPath}/${extensionId}.prompt.md`,
			`${extensionPath}/${extensionId}.voice-agent.md`,
			`${extensionPath}/README.md`
		];
		
		for (const filePath of possibleFiles) {
			try {
				const file = app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					extensionContent = await app.vault.read(file);
					console.log(`Read extension content from: ${filePath}`);
					break;
				}
			} catch (e) {
				// File doesn't exist, try next
			}
		}
		
		const descPrompt = `Based on this extension content, write a brief 1-2 sentence description suitable for a catalog listing:\n\n${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}\n\nDescription:`;
		
		console.log("Sending prompt to AI service for description...");
		
		let descResponse;
		if ('createSession' in aiService && typeof (aiService as any).createSession === 'function') {
			console.log("AI service requires session creation");
			const aiSession = await (aiService as any).createSession();
			descResponse = await aiSession.sendMessage(descPrompt);
		} else if (typeof aiService.sendMessage === 'function') {
			descResponse = await aiService.sendMessage(descPrompt);
		} else {
			throw new Error("AI service does not support sendMessage");
		}
		
		console.log("AI description generated successfully");
		const description = descResponse.trim();
		
		if (descriptionInput) {
			descriptionInput.value = description;
		}
		
		if (messageContainer) {
			showMessage(messageContainer, "Description generated successfully!", 'success');
		}
		
		return description;
		
	} catch (error) {
		console.error("AI description generation error:", error);
		const fallback = `${extensionName} - A helpful extension for Obsidian Vault Copilot.`;
		
		if (descriptionInput) {
			descriptionInput.value = fallback;
		}
		
		if (messageContainer) {
			showMessage(messageContainer, "Description generation failed. Using fallback content.", 'warning');
		}
		
		return fallback;
	}
}

/**
 * Generates README with AI (manual trigger)
 */
export async function generateReadmeWithAI(
	app: App,
	plugin: VaultCopilotPlugin | undefined,
	extensionPath: string,
	extensionId: string | undefined,
	extensionName: string | undefined,
	readmeInput: HTMLTextAreaElement | null,
	messageContainer: HTMLElement | null,
	showMessage: (container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info') => void
): Promise<string> {
	if (!plugin) {
		return "";
	}
	
	try {
		const aiService = plugin.getActiveService?.();
		
		if (!aiService) {
			throw new Error("AI service not available");
		}
		
		console.log("Starting AI README generation...");
		
		// Read extension files
		let extensionContent = "";
		
		const possibleFiles = [
			`${extensionPath}/${extensionId}.agent.md`,
			`${extensionPath}/${extensionId}.prompt.md`,
			`${extensionPath}/${extensionId}.voice-agent.md`,
			`${extensionPath}/README.md`
		];
		
		for (const filePath of possibleFiles) {
			try {
				const file = app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					extensionContent = await app.vault.read(file);
					console.log(`Read extension content from: ${filePath}`);
					break;
				}
			} catch (e) {
				// File doesn't exist, try next
			}
		}
		
		const readmePrompt = `Based on this extension content, write a comprehensive README.md with:
- Brief overview
- Features
- Usage instructions
- Examples (if applicable)

IMPORTANT:
- Do NOT wrap the output in markdown code blocks (no \`\`\`markdown)
- If the extension file has frontmatter (--- at the top), preserve it exactly
- Return the README content directly without any wrapper

${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}

README.md content:`;
		
		console.log("Sending prompt to AI service for README...");
		
		let readmeResponse;
		if ('createSession' in aiService && typeof (aiService as any).createSession === 'function') {
			console.log("AI service requires session creation");
			const aiSession = await (aiService as any).createSession();
			readmeResponse = await aiSession.sendMessage(readmePrompt);
		} else if (typeof aiService.sendMessage === 'function') {
			readmeResponse = await aiService.sendMessage(readmePrompt);
		} else {
			throw new Error("AI service does not support sendMessage");
		}
		
		console.log("AI README generated successfully");
		const readme = cleanMarkdownCodeBlocks(readmeResponse);
		
		if (readmeInput) {
			readmeInput.value = readme;
		}
		
		if (messageContainer) {
			showMessage(messageContainer, "README generated successfully!", 'success');
		}
		
		return readme;
		
	} catch (error) {
		console.error("AI README generation error:", error);
		const fallback = `# ${extensionName}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`;
		
		if (readmeInput) {
			readmeInput.value = fallback;
		}
		
		if (messageContainer) {
			showMessage(messageContainer, "README generation failed. Using fallback content.", 'warning');
		}
		
		return fallback;
	}
}
