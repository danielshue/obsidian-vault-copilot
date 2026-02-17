/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module PromptExecutor
 * @description Executes custom prompts (from the prompt library / slash commands), handling
 * variable replacement, input collection modals, file/URL reference expansion, and streaming.
 *
 * @see {@link CopilotChatView} for integration
 * @see {@link PromptProcessor} for variable processing
 * @since 0.0.20
 */

import { App } from "obsidian";
import CopilotPlugin from "../../../main";
import { GitHubCopilotCliService, ChatMessage } from "../../../copilot/providers/GitHubCopilotCliService";
import { CachedPromptInfo } from "../../../copilot/customization/PromptCache";
import { PromptInputModal, parseInputVariables } from "../modals/PromptInputModal";
import { PromptProcessor } from "../processing/PromptProcessor";
import { MessageRenderer, UsedReference } from "../renderers/MessageRenderer";
import { MessageContextBuilder } from "../processing/MessageContextBuilder";

/**
 * Callbacks that the PromptExecutor needs from the parent view
 */
export interface PromptExecutorCallbacks {
	/** Ensure a session exists before sending messages */
	ensureSessionExists: () => Promise<void>;
	/** Render a full chat message and return the element */
	renderMessage: (message: ChatMessage) => Promise<HTMLElement>;
	/** Create a streaming message element */
	createMessageElement: (role: "user" | "assistant", content: string) => HTMLElement;
	/** Render markdown into a message element */
	renderMarkdownContent: (messageEl: HTMLElement, content: string) => Promise<void>;
	/** Add a copy button to a message element */
	addCopyButton: (messageEl: HTMLElement) => void;
	/** Render used references after a message */
	renderUsedReferences: (references: UsedReference[]) => void;
	/** Show an error message */
	addErrorMessage: (error: string) => void;
	/** Set processing state */
	setProcessing: (isProcessing: boolean) => void;
	/** Show the thinking indicator */
	showThinkingIndicator: () => void;
	/** Hide the thinking indicator */
	hideThinkingIndicator: () => void;
	/** Update the UI send/cancel button state */
	updateUIState: () => void;
	/** Scroll messages to bottom */
	scrollToBottom: () => void;
	/** Scroll so a message is at the top of the visible area */
	scrollMessageToTop: (messageEl: HTMLElement) => void;
	/** Get preserved editor selection text */
	getPreservedSelectionText: () => string | null;
	/** Log tool context for debugging */
	logToolContext: (promptTools?: string[]) => void;
	/** Clear the input area */
	clearInput: () => void;
	/** Auto-resize the input */
	autoResizeInput: () => void;
	/** Get the messages container element */
	getMessagesContainer: () => HTMLElement;
}

/**
 * Executes custom prompts with variable processing, input modals, and streaming
 */
export class PromptExecutor {
	private app: App;
	private plugin: CopilotPlugin;
	private service: GitHubCopilotCliService;
	private promptProcessor: PromptProcessor;
	private callbacks: PromptExecutorCallbacks;

	private currentStreamingMessageEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: CopilotPlugin,
		service: GitHubCopilotCliService,
		promptProcessor: PromptProcessor,
		callbacks: PromptExecutorCallbacks
	) {
		this.app = app;
		this.plugin = plugin;
		this.service = service;
		this.promptProcessor = promptProcessor;
		this.callbacks = callbacks;
	}

	/**
	 * Execute a custom prompt with additional user arguments.
	 * Called when user types /prompt-name additional text here.
	 *
	 * @param promptInfo - The cached prompt metadata
	 * @param userArgs - Additional text after the slash command
	 */
	async executePromptWithArgs(promptInfo: CachedPromptInfo, userArgs: string): Promise<void> {
		const fullPrompt = await this.plugin.promptCache.getFullPrompt(promptInfo.name);
		if (!fullPrompt) {
			console.error(`Could not load prompt: ${promptInfo.name}`);
			return;
		}

		const inputVariables = parseInputVariables(fullPrompt.content);

		if (inputVariables.length > 0) {
			const modal = new PromptInputModal(this.app, inputVariables, (values) => {
				this.executePromptWithInputValues(promptInfo, fullPrompt, userArgs, values);
			});
			modal.open();
			return;
		}

		await this.executePromptWithInputValues(promptInfo, fullPrompt, userArgs, new Map());
	}

	/**
	 * Execute a custom prompt (VS Code compatible) — no user args.
	 * Called when user selects a prompt from the picker dropdown.
	 *
	 * @param promptInfo - The cached prompt metadata
	 */
	async executePrompt(promptInfo: CachedPromptInfo): Promise<void> {
		this.callbacks.clearInput();
		this.callbacks.autoResizeInput();

		const fullPrompt = await this.plugin.promptCache.getFullPrompt(promptInfo.name);
		if (!fullPrompt) {
			console.error(`Could not load prompt: ${promptInfo.name}`);
			return;
		}

		await this.callbacks.ensureSessionExists();

		// Clear welcome message if present
		const messagesContainer = this.callbacks.getMessagesContainer();
		const welcomeEl = messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) welcomeEl.remove();

		const userMessage = `Run prompt: **${promptInfo.name}**\n\n> ${promptInfo.description}`;
		await this.callbacks.renderMessage({ role: "user", content: userMessage, timestamp: new Date() });

		const promptUserMsgEl = messagesContainer.lastElementChild as HTMLElement;
		if (promptUserMsgEl) {
			this.callbacks.scrollMessageToTop(promptUserMsgEl);
		}

		if (fullPrompt.agent) {
			const agent = this.plugin.agentCache.getAgentByName(fullPrompt.agent);
			if (agent) {
				console.log(`[VC] Prompt specifies agent: ${agent.name}`);
			} else {
				console.warn(`[VC] Agent "${fullPrompt.agent}" specified in prompt not found`);
			}
		}

		this.callbacks.setProcessing(true);
		this.callbacks.updateUIState();
		this.callbacks.showThinkingIndicator();

		try {
			this.currentStreamingMessageEl = this.callbacks.createMessageElement("assistant", "");
			this.callbacks.scrollToBottom();

			let content = await this.promptProcessor.processVariables(
				fullPrompt.content, fullPrompt.path, this.callbacks.getPreservedSelectionText() ?? undefined
			);
			content = await this.promptProcessor.resolveMarkdownFileLinks(content, fullPrompt.path);
			content = this.promptProcessor.processToolReferences(content, fullPrompt.tools);

			const originalModel = this.plugin.settings.model;
			if (fullPrompt.model) {
				this.service.updateConfig({ model: fullPrompt.model });
				console.log(`[VC] Prompt using model: ${fullPrompt.model}`);
			}

			this.callbacks.logToolContext(fullPrompt.tools);

			await this.sendContent(content);

			if (fullPrompt.model) {
				this.service.updateConfig({ model: originalModel });
			}
		} catch (error) {
			console.error(`Prompt execution error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.callbacks.addErrorMessage(String(error));
		} finally {
			this.callbacks.hideThinkingIndicator();
			this.callbacks.setProcessing(false);
			this.callbacks.updateUIState();
			this.callbacks.scrollToBottom();
		}
	}

	/**
	 * Execute a prompt after input variables have been collected
	 */
	private async executePromptWithInputValues(
		promptInfo: CachedPromptInfo,
		fullPrompt: { content: string; path: string; agent?: string; model?: string; tools?: string[]; timeout?: number },
		userArgs: string,
		inputValues: Map<string, string>
	): Promise<void> {
		await this.callbacks.ensureSessionExists();

		const messagesContainer = this.callbacks.getMessagesContainer();
		const welcomeEl = messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) welcomeEl.remove();

		// Build display message
		let userMessage = `Run prompt: **${promptInfo.name}**\n\n> ${promptInfo.description}`;
		if (userArgs) userMessage += `\n\n**Input:** ${userArgs}`;
		if (inputValues.size > 0) {
			for (const [name, value] of inputValues) {
				userMessage += `\n\n**${name}:** ${value}`;
			}
		}
		await this.callbacks.renderMessage({ role: "user", content: userMessage, timestamp: new Date() });

		const usedReferences: UsedReference[] = [];

		if (fullPrompt.agent) {
			const agent = this.plugin.agentCache.getAgentByName(fullPrompt.agent);
			if (agent) {
				console.log(`[VC] Prompt specifies agent: ${agent.name}`);
				usedReferences.push({ type: "agent", name: agent.name, path: agent.path });
			} else {
				console.warn(`[VC] Agent "${fullPrompt.agent}" specified in prompt not found`);
			}
		}

		this.callbacks.setProcessing(true);
		this.callbacks.updateUIState();
		this.callbacks.showThinkingIndicator();

		try {
			let content = await this.promptProcessor.processVariables(
				fullPrompt.content, fullPrompt.path, this.callbacks.getPreservedSelectionText() ?? undefined
			);

			content = content.replace(/\$\{userInput\}/g, userArgs || '[No input provided]');

			// Expand folder paths to file references
			if (userArgs) {
				const normalizedPath = userArgs.replace(/^\/+|\/+$/g, '');
				const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

				if (folder && 'children' in folder) {
					const files = this.app.vault.getMarkdownFiles().filter(f =>
						f.path === normalizedPath || f.path.startsWith(normalizedPath + '/')
					);
					for (const file of files) {
						usedReferences.push({ type: "context", name: file.basename, path: file.path });
					}
					console.log(`[VC] Expanded folder "${normalizedPath}" to ${files.length} file references`);
				}
			}

			content = this.processInputVariablesWithValues(content, inputValues);

			const { content: contentWithLinks, resolvedFiles } = await this.promptProcessor.resolveMarkdownFileLinksWithTracking(content, fullPrompt.path);
			content = contentWithLinks;

			for (const file of resolvedFiles) {
				usedReferences.push({ type: "context", name: file.name, path: file.path });
			}

			content = this.promptProcessor.processToolReferences(content, fullPrompt.tools);

			// Process user arguments (fetch URLs, inline note refs)
			if (userArgs) {
				const additionalContent = await this.processUserArgsContent(userArgs, usedReferences);
				if (additionalContent) content += additionalContent;
			}

			if (usedReferences.length > 0) {
				this.callbacks.renderUsedReferences(usedReferences);
			}

			this.currentStreamingMessageEl = this.callbacks.createMessageElement("assistant", "");
			this.callbacks.scrollToBottom();

			const originalModel = this.plugin.settings.model;
			if (fullPrompt.model) {
				this.service.updateConfig({ model: fullPrompt.model });
				console.log(`[VC] Prompt using model: ${fullPrompt.model}`);
			}

			const timeoutMs = fullPrompt.timeout ? fullPrompt.timeout * 1000 : undefined;
			this.callbacks.logToolContext(fullPrompt.tools);

			await this.sendContent(content, timeoutMs);

			if (fullPrompt.model) {
				this.service.updateConfig({ model: originalModel });
			}
		} catch (error) {
			console.error(`Prompt execution error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.callbacks.addErrorMessage(String(error));
		} finally {
			this.callbacks.hideThinkingIndicator();
			this.callbacks.setProcessing(false);
			this.callbacks.updateUIState();
			this.callbacks.scrollToBottom();
		}
	}

	/**
	 * Process user arguments to find fetch URLs and inline note references.
	 * Returns additional content to append, or null if none.
	 */
	private async processUserArgsContent(userArgs: string, usedReferences: UsedReference[]): Promise<string | null> {
		const { processedMessage: processedUserArgs, fetchedUrls, fetchedContext } = await this.promptProcessor.processFetchReferences(userArgs);

		const inlineNoteRefs = MessageContextBuilder.extractInlineNoteReferences(processedUserArgs);
		const inlineNoteContext: string[] = [];
		for (const noteName of inlineNoteRefs) {
			const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
			if (file) {
				try {
					const noteContent = await this.app.vault.cachedRead(file);
					inlineNoteContext.push(`--- Content of "${file.path}" ---\n${noteContent}\n--- End of "${file.path}" ---`);
					usedReferences.push({ type: "context", name: file.basename, path: file.path });
				} catch (e) {
					console.error(`Failed to read inline note reference: ${noteName}`, e);
				}
			}
		}

		for (const url of fetchedUrls) {
			try {
				usedReferences.push({ type: "url", name: new URL(url).hostname, path: url });
			} catch {
				usedReferences.push({ type: "url", name: url, path: url });
			}
		}

		if (fetchedContext.length > 0 || inlineNoteContext.length > 0) {
			let section = `\n\n---\n**Referenced content:**\n`;
			if (fetchedContext.length > 0) section += `\n${fetchedContext.join("\n\n")}\n`;
			if (inlineNoteContext.length > 0) section += `\n${inlineNoteContext.join("\n\n")}\n`;
			return section;
		}

		return null;
	}

	/**
	 * Process ${input:name:...} and ${input:name} variables with pre-collected values
	 */
	private processInputVariablesWithValues(content: string, values: Map<string, string>): string {
		const inputRegex = /\$\{input:([^:}]+)(?::([^}]+))?\}/g;

		return content.replace(inputRegex, (_match, varName, descAndOptions) => {
			if (values.has(varName)) return values.get(varName) || '';

			// Bare ${input:name} — no description or options
			if (!descAndOptions) return `[${varName}]`;

			const parts = descAndOptions.split('|');
			const options = parts.slice(1).map((opt: string) => opt.trim()).filter((opt: string) => opt);
			if (options.length > 0) return options[0];

			const description = parts[0]?.trim() || varName;
			return `[${description}]`;
		});
	}

	/**
	 * Execute a skill with additional user arguments.
	 * Called when user types /skill-name additional text here.
	 *
	 * Loads the full skill instructions (Level 2 loading) and resolves
	 * any referenced resource files (Level 3 loading) before sending them
	 * along with user arguments to the AI service.
	 *
	 * @param skillInfo - The skill metadata (name & description minimum)
	 * @param userArgs - Additional text after the slash command
	 *
	 * @example
	 * ```typescript
	 * await executor.executeSkillWithArgs(
	 *   { name: "json-canvas", description: "Create JSON Canvas files" },
	 *   "Create a mind map of TypeScript concepts"
	 * );
	 * ```
	 */
	async executeSkillWithArgs(skillInfo: { name: string; description: string }, userArgs: string): Promise<void> {
		this.callbacks.clearInput();
		this.callbacks.autoResizeInput();

		// Level 2 loading — load full skill instructions from disk
		const fullSkill = await this.plugin.skillCache.getFullSkill(skillInfo.name);
		if (!fullSkill) {
			console.error(`Could not load skill: ${skillInfo.name}`);
			this.callbacks.addErrorMessage(`Could not load skill: ${skillInfo.name}`);
			return;
		}

		await this.callbacks.ensureSessionExists();

		// Clear welcome message if present
		const messagesContainer = this.callbacks.getMessagesContainer();
		const welcomeEl = messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) welcomeEl.remove();

		// Build display message
		let userMessage = `Run skill: **${skillInfo.name}**\n\n> ${skillInfo.description}`;
		if (userArgs) userMessage += `\n\n**Input:** ${userArgs}`;
		await this.callbacks.renderMessage({ role: "user", content: userMessage, timestamp: new Date() });

		const skillUserMsgEl = messagesContainer.lastElementChild as HTMLElement;
		if (skillUserMsgEl) {
			this.callbacks.scrollMessageToTop(skillUserMsgEl);
		}

		this.callbacks.setProcessing(true);
		this.callbacks.updateUIState();
		this.callbacks.showThinkingIndicator();

		try {
			// Build content from skill instructions + user input
			let content = fullSkill.instructions;

			// Level 3 loading — resolve referenced resource files
			content = await this.resolveSkillResources(content, fullSkill);

			// Check for {{input:...}} variables in the skill instructions
			const inputVariables = parseInputVariables(content);
			if (inputVariables.length > 0) {
				// Collect variable values via modal, then continue execution
				const modal = new PromptInputModal(this.app, inputVariables, async (values) => {
					// Replace input variables with collected values
					const inputRegex = /\$\{input:([^:}]+)(?::([^}]+))?\}/g;
					content = content.replace(inputRegex, (_match, varName) => {
						if (values.has(varName)) return values.get(varName) || '';
						return `[${varName}]`;
					});
					await this.executeSkillContent(content, userArgs);
				});
				modal.open();
				return;
			}

			await this.executeSkillContent(content, userArgs);
		} catch (error) {
			console.error(`Skill execution error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.callbacks.addErrorMessage(String(error));
		} finally {
			this.callbacks.hideThinkingIndicator();
			this.callbacks.setProcessing(false);
			this.callbacks.updateUIState();
			this.callbacks.scrollToBottom();
		}
	}

	/**
	 * Resolve resource file references in skill instructions (Level 3 loading).
	 *
	 * Scans the skill body for markdown links with relative paths
	 * (e.g., `[test script](./test-template.js)`) and auto-injects the
	 * referenced file content as fenced code blocks appended to the instructions.
	 *
	 * @param content - The raw skill instructions
	 * @param skill - The full skill object with path and optional resources
	 * @returns Updated content with resolved resource files appended
	 * @internal
	 * @since 0.1.1
	 */
	private async resolveSkillResources(content: string, skill: { path: string; resources?: Array<{ relativePath: string; name: string; type: string }> }): Promise<string> {
		// Match markdown links with relative paths: [label](./path) or [label](path)
		const linkRegex = /\[([^\]]+)\]\(\.?\/?([^)]+)\)/g;
		const resolvedPaths = new Set<string>();
		const resourceBlocks: string[] = [];
		let totalSize = 0;
		const MAX_RESOURCE_SIZE = 50 * 1024; // 50KB limit

		let match;
		while ((match = linkRegex.exec(content)) !== null) {
			const relativePath = match[2]!;
			// Skip external URLs and anchors
			if (relativePath.startsWith('http') || relativePath.startsWith('#') || relativePath.startsWith('mailto:')) continue;
			// Skip SKILL.md self-references
			if (relativePath === 'SKILL.md') continue;
			// Deduplicate
			if (resolvedPaths.has(relativePath)) continue;
			resolvedPaths.add(relativePath);

			try {
				const loader = this.plugin.skillCache['loader'] as import('../../../copilot/customization/CustomizationLoader').CustomizationLoader;
				const fileContent = await loader.readSkillResource(skill.path, relativePath);
				if (fileContent) {
					if (totalSize + fileContent.length > MAX_RESOURCE_SIZE) {
						console.warn(`[VC] Skill resource injection truncated at ${MAX_RESOURCE_SIZE} bytes`);
						resourceBlocks.push(`\n<!-- Resource ${relativePath} skipped: size limit reached -->`);
						break;
					}
					totalSize += fileContent.length;
					// Infer language from file extension for syntax highlighting
					const ext = relativePath.split('.').pop() || '';
					resourceBlocks.push(`\n## Resource: ${relativePath}\n\n\`\`\`${ext}\n${fileContent}\n\`\`\``);
				}
			} catch (err) {
				console.warn(`[VC] Failed to resolve skill resource: ${relativePath}`, err);
			}
		}

		if (resourceBlocks.length > 0) {
			content += '\n\n---\n**Referenced skill resources:**' + resourceBlocks.join('\n');
		}

		return content;
	}

	/**
	 * Execute skill content after any input variables have been resolved.
	 * Appends user arguments and sends to the AI service.
	 *
	 * @param content - The skill instructions (with variables already resolved)
	 * @param userArgs - Additional user-provided text
	 * @internal
	 */
	private async executeSkillContent(content: string, userArgs: string): Promise<void> {
		if (userArgs) {
			content += `\n\nUser request: ${userArgs}`;
		}

		this.currentStreamingMessageEl = this.callbacks.createMessageElement("assistant", "");
		this.callbacks.scrollToBottom();

		await this.sendContent(content);
	}

	/**
	 * Send content to the AI service (handles streaming vs non-streaming)
	 */
	private async sendContent(content: string, timeoutMs?: number): Promise<void> {
		if (this.plugin.settings.streaming) {
			await this.service.sendMessageStreaming(
				content,
				(delta) => {
					if (this.currentStreamingMessageEl) {
						const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
						if (contentEl) contentEl.textContent += delta;
					}
					this.callbacks.scrollToBottom();
				},
				async (fullContent) => {
					if (this.currentStreamingMessageEl) {
						await this.callbacks.renderMarkdownContent(this.currentStreamingMessageEl, fullContent);
						this.callbacks.addCopyButton(this.currentStreamingMessageEl);
					}
					this.currentStreamingMessageEl = null;
				},
				timeoutMs
			);
		} else {
			const response = await this.service.sendMessage(content, timeoutMs);
			if (this.currentStreamingMessageEl) {
				await this.callbacks.renderMarkdownContent(this.currentStreamingMessageEl, response);
				this.callbacks.addCopyButton(this.currentStreamingMessageEl);
			}
			this.currentStreamingMessageEl = null;
		}
	}
}
