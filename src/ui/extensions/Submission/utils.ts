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
		const catalogUrl = "https://raw.githubusercontent.com/danielshue/obsidian-vault-copilot/master/catalog/catalog.json";
		
		const response = await fetch(catalogUrl);
		if (!response.ok) {
			throw new Error(
				`Could not fetch extension catalog from GitHub (HTTP ${response.status}). ID uniqueness could not be validated, but you may still continue.`
			);
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
		if (error instanceof Error) {
			// Surface known validation issues to the caller so the UI can show them.
			if (
				error.message.includes("already exists") ||
				error.message.includes("Could not fetch extension catalog")
			) {
				throw error;
			}
		}
		console.warn("Catalog validation failed:", error);
	}
}

/**
 * Reads the primary content for an extension based on the user-attached path.
 *
 * Supports both file and folder inputs:
 * - If the path points to a file, that file is read directly.
 * - If the path points to a folder, common extension files are probed using the
 *   derived extension ID (agent/prompt/voice-agent) and finally README.md.
 */
async function readExtensionContent(
	app: App,
	extensionPath: string,
	extensionId: string | undefined
): Promise<string> {
	if (!extensionPath) {
		return "";
	}

	try {
		const abstractFile = app.vault.getAbstractFileByPath(extensionPath);
		if (!abstractFile) {
			console.warn(`Could not resolve extension path for content: ${extensionPath}`);
			return "";
		}

		// If the user attached a specific file, read it directly
		if (abstractFile instanceof TFile) {
			console.log("Reading extension content from attached file:", abstractFile.path);
			return await app.vault.read(abstractFile);
		}

		// Otherwise treat the path as a folder and probe common files
		const adapter = app.vault.adapter;
		const basePath = extensionPath;
		const possibleFiles: string[] = [];
		if (extensionId) {
			possibleFiles.push(
				`${basePath}/${extensionId}.agent.md`,
				`${basePath}/${extensionId}.prompt.md`,
				`${basePath}/${extensionId}.voice-agent.md`
			);
		}
		possibleFiles.push(`${basePath}/README.md`);

		for (const filePath of possibleFiles) {
			try {
				if (await adapter.exists(filePath)) {
					console.log("Read extension content from:", filePath);
					return await adapter.read(filePath);
				}
			} catch (e) {
				// Continue to next file
			}
		}
	} catch (error) {
		console.error("Error reading extension content:", error);
	}

	return "";
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
		
		// Read extension files (supports both file and folder paths)
		const extensionContent = await readExtensionContent(app, extensionPath, extensionId);
		
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
 * Generates a preview image for the extension automatically.
 *
 * This helper is intentionally file-system based (no direct external image API).
 * It will:
 * - Resolve the target folder for the extension (file → parent folder, folder → itself)
 * - Re-use an existing preview asset if one already exists (preview.svg / preview.png)
 * - Otherwise, ask the active AI provider to generate an SVG image based on the README
 *   (or fall back to a static banner if AI is unavailable)
 *
 * The returned string is the vault-relative path to the generated or existing asset,
 * which is then surfaced in the wizard as the AI-generated image placeholder.
 *
 * @param app - The Obsidian app instance used for vault access
 * @param plugin - The Vault Copilot plugin instance (used to access the active AI service)
 * @param extensionPath - The path provided by the user for the extension (file or folder)
 * @param extensionId - The derived extension ID (used for logging only)
 * @param extensionName - Human-friendly extension name used in the SVG banner
 * @param readmeContent - README content used as the basis for the generated image
 * @returns The vault-relative image path, or null if generation fails
 */
export async function generateExtensionImageAuto(
	app: App,
	plugin: VaultCopilotPlugin | undefined,
	extensionPath: string,
	extensionId: string | undefined,
	extensionName: string | undefined,
	readmeContent?: string
): Promise<string | null> {
	try {
		if (!extensionPath) {
			console.warn("No extension path provided, skipping auto image generation");
			return null;
		}
		
		// Resolve the target folder for assets based on the provided path
		const abstractFile = app.vault.getAbstractFileByPath(extensionPath);
		let folderPath: string | null = null;
		
		if (abstractFile instanceof TFile) {
			// Use parent folder for files
			folderPath = abstractFile.parent ? abstractFile.parent.path : null;
		} else {
			// Path already points to a folder
			folderPath = extensionPath;
		}
		
		if (!folderPath) {
			console.warn("Could not resolve folder for auto image generation", { extensionPath });
			return null;
		}
		
		const adapter = app.vault.adapter;
		const svgPath = `${folderPath}/preview.svg`;
		const pngPath = `${folderPath}/preview.png`;
		
		// If a preview already exists on disk (user-provided asset), just reuse it
		if (await adapter.exists(svgPath)) {
			console.log("Reusing existing preview.svg for auto image generation:", svgPath);
			return svgPath;
		}
		if (await adapter.exists(pngPath)) {
			console.log("Reusing existing preview.png for auto image generation:", pngPath);
			return pngPath;
		}
		
		// Build a safe display name used in prompts and fallbacks
		const safeName = (extensionName || extensionId || "Vault Copilot Extension").trim();
		const titleText = safeName.length > 40 ? `${safeName.slice(0, 37)}...` : safeName;
		
		// Helper: static SVG banner used as a fallback when AI is unavailable or returns invalid output
		const buildFallbackSvg = (): string => {
			return `<?xml version="1.0" encoding="UTF-8"?>\n` +
				`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">\n` +
				`  <defs>\n` +
				`    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">\n` +
				`      <stop offset="0%" style="stop-color:#1e1e2e"/>\n` +
				`      <stop offset="100%" style="stop-color:#313244"/>\n` +
				`    </linearGradient>\n` +
				`  </defs>\n` +
				`  <rect width="1280" height="720" fill="url(#bg)"/>\n` +
				`  <rect x="80" y="60" width="1120" height="600" rx="12" fill="#45475a" stroke="#585b70" stroke-width="2"/>\n` +
				`  <circle cx="110" cy="85" r="8" fill="#f38ba8"/>\n` +
				`  <circle cx="135" cy="85" r="8" fill="#f9e2af"/>\n` +
				`  <circle cx="160" cy="85" r="8" fill="#a6e3a1"/>\n` +
				`  <rect x="100" y="110" width="1080" height="530" fill="#1e1e2e"/>\n` +
				`  <text x="640" y="320" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="56" fill="#cdd6f4" text-anchor="middle" font-weight="600">${titleText}</text>\n` +
				`  <text x="640" y="390" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="24" fill="#a6adc8" text-anchor="middle">AI-generated preview placeholder</text>\n` +
				`</svg>\n`;
		};

		// Helper: wrap SVG markup in a data URL so the image can be rendered
		// in the UI without writing files into the vault or repo.
		const toDataUrl = (svgContent: string): string => {
			return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
		};
		
		// If no plugin or AI service is available, fall back to a static SVG
		// returned as a data URL. This avoids creating on-disk assets inside the
		// plugin repo or test vault.
		if (!plugin) {
			const svgContent = buildFallbackSvg();
			const dataUrl = toDataUrl(svgContent);
			console.log("Auto-generated static preview image (no plugin available)", { extensionId });
			return dataUrl;
		}
		
		const aiService = plugin.getActiveService?.();
		if (!aiService) {
			const svgContent = buildFallbackSvg();
			const dataUrl = toDataUrl(svgContent);
			console.log("Auto-generated static preview image (no AI service available)", { extensionId });
			return dataUrl;
		}
		
		// Prefer README content passed from the caller; fall back to README.md in the folder
		let effectiveReadme = (readmeContent || "").trim();
		if (!effectiveReadme) {
			try {
				const readmePath = `${folderPath}/README.md`;
				if (await adapter.exists(readmePath)) {
					effectiveReadme = await adapter.read(readmePath);
					console.log("Loaded README.md for image generation:", readmePath);
				}
			} catch (readError) {
				console.warn("Failed to read README.md for image generation", readError);
			}
		}
		
		// Ask the AI provider to generate standalone SVG markup for the preview image
		let svgResponse: string;
		try {
			const prompt = `You are a UI designer generating SVG preview images for the Obsidian Vault Copilot extensions catalog. Based on the following README content, generate a rich, dark-theme-friendly SVG preview image that visually represents the extension.\n\nRequirements:\n- Output a single, valid standalone SVG element.\n- Size must be 1280x720.\n- Use a modern dark UI style similar to code editors.\n- Include the extension name as prominent title text: "${titleText}".\n- You may include subtle icons, panels, or tags that match the extension's purpose.\n- Do NOT wrap the SVG in Markdown or code fences.\n- Do NOT include any explanations, comments, or backticks.\n- Return only the <svg>...</svg> markup.\n\nREADME content:\n\n${effectiveReadme || "(No README content provided; design a generic but professional preview for the extension.)"}`;
			
			let aiSession: any = null;
			if ("createSession" in aiService && typeof (aiService as any).createSession === "function") {
				console.log("AI service requires session creation for image generation");
				aiSession = await (aiService as any).createSession();
			}
			
			if (aiSession && typeof aiSession.sendMessage === "function") {
				svgResponse = await aiSession.sendMessage(prompt);
			} else if (typeof (aiService as any).sendMessage === "function") {
				svgResponse = await (aiService as any).sendMessage(prompt);
			} else {
				throw new Error("AI service does not support sendMessage for image generation");
			}
		} catch (aiError) {
			console.error("AI image generation failed, falling back to static SVG:", aiError);
			const svgContent = buildFallbackSvg();
			return toDataUrl(svgContent);
		}
		
		// Clean up any accidental code fences and extract the SVG element if needed
		let cleanedSvg = cleanMarkdownCodeBlocks(svgResponse || "");
		const startIdx = cleanedSvg.indexOf("<svg");
		const endIdx = cleanedSvg.lastIndexOf("</svg>");
		if (startIdx !== -1 && endIdx !== -1) {
			cleanedSvg = cleanedSvg.slice(startIdx, endIdx + "</svg>".length);
		}
		cleanedSvg = cleanedSvg.trim();
		
		if (!cleanedSvg.toLowerCase().includes("<svg")) {
			console.warn("AI did not return valid SVG, using static fallback preview");
			const svgContent = buildFallbackSvg();
			return toDataUrl(svgContent);
		}
		
		const dataUrl = toDataUrl(cleanedSvg);
		console.log("AI-generated preview image for extension (data URL)", { extensionId });
		
		return dataUrl;
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
		
		// Read extension files (supports both file and folder paths)
		const extensionContent = await readExtensionContent(app, extensionPath, extensionId);
		
		const descPrompt = `You are helping generate a short catalog listing for an Obsidian Vault Copilot extension.

Write a single, concise description of this extension that is at most 200 characters long (including spaces).
- Focus on what it does and why it's useful.
- Do not include quotes or markdown formatting.
- Answer with the description text only.

Extension context:
${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}\n\nDescription (<= 200 characters):`;
		
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
		let description = descResponse.trim();
		if (description.length > 200) {
			description = `${description.slice(0, 197)}...`;
		}
		
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
		
		// Read extension files (supports both file and folder paths)
		const extensionContent = await readExtensionContent(app, extensionPath, extensionId);
		
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
