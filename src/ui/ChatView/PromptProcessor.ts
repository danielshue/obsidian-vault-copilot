import { App, ItemView, TFile } from "obsidian";
import * as VaultOps from "../../copilot/VaultOperations";

/**
 * Processes prompt content with variable substitution and file reference resolution
 */
export class PromptProcessor {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Process prompt variables using VS Code compatible ${var} syntax
	 */
	async processVariables(content: string, promptPath: string): Promise<string> {
		const activeFile = this.app.workspace.getActiveFile();
		const vaultPath = (this.app.vault.adapter as any).basePath || '';
		
		// VS Code compatible variables
		// File context variables
		if (activeFile) {
			// ${file} - Full path to the current file
			content = content.replace(/\$\{file\}/g, activeFile.path);
			
			// ${fileBasename} - Filename with extension
			content = content.replace(/\$\{fileBasename\}/g, activeFile.name);
			
			// ${fileDirname} - Directory of the current file
			const dirName = activeFile.parent?.path || '';
			content = content.replace(/\$\{fileDirname\}/g, dirName);
			
			// ${fileBasenameNoExtension} - Filename without extension
			content = content.replace(/\$\{fileBasenameNoExtension\}/g, activeFile.basename);
			
			// ${activeNoteContent} - Full content of active note (Obsidian-specific enhancement)
			if (content.includes('${activeNoteContent}')) {
				try {
					const noteContent = await this.app.vault.cachedRead(activeFile);
					content = content.replace(/\$\{activeNoteContent\}/g, noteContent);
				} catch {
					content = content.replace(/\$\{activeNoteContent\}/g, '[Could not read note content]');
				}
			}
		} else {
			content = content.replace(/\$\{file\}/g, '[No active file]');
			content = content.replace(/\$\{fileBasename\}/g, '[No active file]');
			content = content.replace(/\$\{fileDirname\}/g, '[No active file]');
			content = content.replace(/\$\{fileBasenameNoExtension\}/g, '[No active file]');
			content = content.replace(/\$\{activeNoteContent\}/g, '[No active file]');
		}
		
		// Workspace variables
		// ${workspaceFolder} - Path to the vault
		content = content.replace(/\$\{workspaceFolder\}/g, vaultPath);
		
		// ${workspaceFolderBasename} - Name of the vault
		const vaultName = this.app.vault.getName();
		content = content.replace(/\$\{workspaceFolderBasename\}/g, vaultName);
		
		// Selection variables
		// ${selection} / ${selectedText} - Currently selected text in the editor
		const activeView = this.app.workspace.getActiveViewOfType(ItemView);
		let selectedText = '';
		if (activeView && 'editor' in activeView) {
			const editor = (activeView as any).editor;
			if (editor && typeof editor.getSelection === 'function') {
				selectedText = editor.getSelection() || '';
			}
		}
		content = content.replace(/\$\{selection\}/g, selectedText || '[No selection]');
		content = content.replace(/\$\{selectedText\}/g, selectedText || '[No selection]');
		
		// Date/time variables (Obsidian-specific enhancements)
		const now = new Date();
		const dateStr = now.toISOString().split('T')[0] ?? now.toISOString();
		content = content.replace(/\$\{date\}/g, dateStr);
		content = content.replace(/\$\{time\}/g, now.toLocaleTimeString());
		content = content.replace(/\$\{datetime\}/g, now.toISOString());
		
		// Legacy support - also handle {var} syntax for backwards compatibility
		if (activeFile) {
			content = content.replace(/\{activeNote\}/g, activeFile.path);
			content = content.replace(/\{activeNoteName\}/g, activeFile.basename);
			if (content.includes('{activeNoteContent}')) {
				try {
					const noteContent = await this.app.vault.cachedRead(activeFile);
					content = content.replace(/\{activeNoteContent\}/g, noteContent);
				} catch {
					content = content.replace(/\{activeNoteContent\}/g, '[Could not read note content]');
				}
			}
		} else {
			content = content.replace(/\{activeNote\}/g, '[No active note]');
			content = content.replace(/\{activeNoteName\}/g, '[No active note]');
			content = content.replace(/\{activeNoteContent\}/g, '[No active note]');
		}
		content = content.replace(/\{date\}/g, dateStr);
		content = content.replace(/\{time\}/g, now.toLocaleTimeString());
		content = content.replace(/\{datetime\}/g, now.toISOString());
		
		return content;
	}

	/**
	 * Resolve Markdown file links and include referenced file content
	 * Supports [link text](relative/path.md) syntax
	 */
	async resolveMarkdownFileLinks(content: string, promptPath: string): Promise<string> {
		// Match Markdown links: [text](path.md) or [text](path)
		const linkRegex = /\[([^\]]*)\]\(([^)]+\.md)\)/g;
		const matches = [...content.matchAll(linkRegex)];
		
		if (matches.length === 0) return content;
		
		// Get the directory of the prompt file for relative path resolution
		const promptDir = promptPath.substring(0, promptPath.lastIndexOf('/'));
		
		for (const match of matches) {
			const fullMatch = match[0];
			const linkText = match[1] || '';
			const linkPath = match[2];
			
			// Skip if no path captured
			if (!linkPath) continue;
			
			// Resolve relative path from prompt file location
			let resolvedPath: string = linkPath;
			if (!linkPath.startsWith('/')) {
				resolvedPath = promptDir ? `${promptDir}/${linkPath}` : linkPath;
			}
			
			// Normalize the path (handle ../ etc)
			resolvedPath = this.normalizePath(resolvedPath);
			
			// Try to read the linked file
			const linkedFile = this.app.vault.getAbstractFileByPath(resolvedPath);
			if (linkedFile instanceof TFile) {
				try {
					const linkedContent = await this.app.vault.cachedRead(linkedFile);
					// Replace the link with the file content, wrapped with context
					const replacement = `\n\n---\n**Referenced file: ${linkText || linkedFile.basename}** (${resolvedPath})\n\n${linkedContent}\n\n---\n`;
					content = content.replace(fullMatch, replacement);
				} catch (error) {
					console.warn(`[VC] Could not read linked file: ${resolvedPath}`, error);
					content = content.replace(fullMatch, `[Could not read: ${resolvedPath}]`);
				}
			} else {
				console.warn(`[VC] Linked file not found: ${resolvedPath}`);
				content = content.replace(fullMatch, `[File not found: ${resolvedPath}]`);
			}
		}
		
		return content;
	}

	/**
	 * Normalize a path by resolving ../ and ./ components
	 * Also handles cross-platform path separators
	 */
	normalizePath(path: string): string {
		// Convert backslashes to forward slashes (Windows compatibility)
		let normalized = path.replace(/\\/g, '/');
		
		// Remove leading/trailing slashes for processing
		normalized = normalized.replace(/^\/+|\/+$/g, '');
		
		const parts = normalized.split('/').filter(p => p !== '.');
		const result: string[] = [];
		
		for (const part of parts) {
			if (part === '..') {
				result.pop();
			} else if (part) {
				result.push(part);
			}
		}
		
		return result.join('/');
	}

	/**
	 * Process #fetch URL references in the message
	 * Fetches web pages and adds their content as context
	 */
	async processFetchReferences(
		message: string
	): Promise<{
		processedMessage: string;
		fetchedUrls: string[];
		fetchedContext: string[];
	}> {
		// Find all #fetch URL references
		const fetchRefRegex = /#fetch\s+(https?:\/\/[^\s]+)/gi;
		const matches = [...message.matchAll(fetchRefRegex)];
		
		if (matches.length === 0) {
			return { processedMessage: message, fetchedUrls: [], fetchedContext: [] };
		}
		
		const fetchedUrls: string[] = [];
		const fetchedContext: string[] = [];
		let processedMessage = message;
		
		// Fetch each URL
		for (const match of matches) {
			const url = match[1];
			if (!url) continue;
			
			try {
				const result = await VaultOps.fetchWebPage(url);
				if (result.success && result.content) {
					fetchedUrls.push(url);
					fetchedContext.push(
						`--- Content from "${result.title || url}" (${url}) ---\n${result.content}\n--- End of web page content ---`
					);
				} else {
					// Add error note but continue
					fetchedContext.push(
						`--- Failed to fetch ${url}: ${result.error || 'Unknown error'} ---`
					);
				}
			} catch (error) {
				console.error(`Failed to fetch URL: ${url}`, error);
				fetchedContext.push(
					`--- Failed to fetch ${url}: ${error} ---`
				);
			}
		}
		
		// Replace #fetch URL with a cleaner reference in the message
		processedMessage = processedMessage.replace(fetchRefRegex, '[Web: $1]');
		
		return { processedMessage, fetchedUrls, fetchedContext };
	}

	/**
	 * Process #tool:name references in the prompt body
	 * This adds context about which tools are available for the prompt
	 */
	processToolReferences(content: string, promptTools?: string[]): string {
		// Find all #tool:toolName references
		const toolRefRegex = /#tool:(\w+)/g;
		const matches = [...content.matchAll(toolRefRegex)];
		
		if (matches.length === 0 && (!promptTools || promptTools.length === 0)) {
			return content;
		}
		
		// Collect unique tool names referenced in the body
		const referencedTools = new Set<string>();
		for (const match of matches) {
			if (match[1]) {
				referencedTools.add(match[1]);
			}
		}
		
		// Build tool context if tools are referenced
		if (referencedTools.size > 0) {
			const toolList = Array.from(referencedTools).join(', ');
			const toolContext = `\n\n[Tools referenced in this prompt: ${toolList}]\n`;
			
			// Append tool context at the end of the content
			content = content + toolContext;
			
			// Replace #tool:name with just the tool name for cleaner prompt
			content = content.replace(toolRefRegex, '`$1` tool');
		}
		
		// If prompt has tools specified in frontmatter, add that context too
		if (promptTools && promptTools.length > 0) {
			const availableTools = promptTools.join(', ');
			content = content + `\n[Available tools for this prompt: ${availableTools}]\n`;
		}
		
		return content;
	}
}
