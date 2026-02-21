/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module TelegramMessageHandler
 * @description Message processing logic for the Telegram bot integration.
 *
 * Handles authentication, session management, context building, AI routing,
 * and Telegram bot commands. This is the bridge between incoming Telegram
 * messages and the Vault Copilot AI providers.
 *
 * ## Features
 *
 * - **Vault tools**: Full read/write/search/task operations via AI tool calling
 * - **Agents**: Sticky per-session agent selection via `/agent <name>`
 * - **Prompts**: Run saved prompts via `/prompt <name> [args]`
 * - **Skills**: List and invoke skills via `/skills`
 * - **Sessions**: Multi-session support with `/sessions`, `/session`, `/new`, `/clear`
 *
 * ## Message Flow
 *
 * ```
 * TelegramMessage
 *   → Auth check (whitelist)
 *   → Session lookup/create
 *   → Typing indicator
 *   → Build tools + system prompt (with agent context)
 *   → AI provider sendMessage() with tool calling
 *   → Store messages in session
 *   → Send response to Telegram
 * ```
 *
 * @see {@link TelegramBotService} for the transport layer
 * @see {@link TelegramVoiceHandler} for voice message processing
 * @see {@link TelegramToolBuilder} for vault tool definitions
 * @since 0.1.0
 */

import type { App } from "obsidian";
import type CopilotPlugin from "../main";
import type { TelegramMessage } from "./types";
import { TELEGRAM_FORMATTING_CONTEXT } from "./types";
import type { TelegramBotService } from "./TelegramBotService";
import type { TelegramVoiceHandler } from "./TelegramVoiceHandler";
import type { CopilotSession } from "../ui/settings/types";
import type { ChatMessage } from "../copilot/providers/GitHubCopilotCliService";
import type { AIProvider, ToolDefinition } from "../copilot/providers/AIProvider";
import { OpenAIService } from "../copilot/providers/OpenAIService";
import { AzureOpenAIService } from "../copilot/providers/AzureOpenAIService";
import {
	getProfileById,
	getOpenAIProfileApiKey,
	getAzureProfileApiKey,
	getLegacyOpenAIKey,
} from "../ui/settings";
import type { OpenAIProviderProfile, AzureOpenAIProviderProfile } from "../ui/settings/types";
import { buildTelegramToolDefinitions } from "./TelegramToolBuilder";

/**
 * Format a timestamp as a relative time string (e.g., "5 mins ago").
 * @internal
 */
function formatTimeAgo(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""} ago`;
	if (hours < 24) return `${hours} hr${hours !== 1 ? "s" : ""} ago`;
	if (days === 1) return "yesterday";
	return `${days} days ago`;
}

/**
 * Configuration for the message handler.
 */
export interface TelegramMessageHandlerConfig {
	/** Reference to the main plugin */
	plugin: CopilotPlugin;
	/** Reference to the bot service for sending responses */
	botService: TelegramBotService;
	/** Optional voice handler for voice message processing */
	voiceHandler?: TelegramVoiceHandler;
}

/**
 * Handles incoming Telegram messages: auth, routing, AI interaction, session management.
 *
 * Creates a dedicated AI service instance (separate from the ChatView) to avoid
 * shared state issues. Tools are wired via {@link TelegramToolBuilder} so the AI
 * can perform vault operations, task management, and web searches.
 *
 * @example
 * ```typescript
 * const handler = new TelegramMessageHandler({
 *   plugin,
 *   botService: bot,
 * });
 * await handler.handleMessage(telegramMessage);
 * ```
 */
export class TelegramMessageHandler {
	private plugin: CopilotPlugin;
	private app: App;
	private botService: TelegramBotService;
	private voiceHandler?: TelegramVoiceHandler;
	/** In-memory sessions for non-persistent mode */
	private ephemeralSessions: Map<string, CopilotSession> = new Map();
	/** Dedicated AI service for Telegram (separate from ChatView) */
	private dedicatedService: AIProvider | null = null;
	/** Fingerprint of last provider config to detect changes */
	private lastProviderFingerprint: string = "";
	/** Cached tool definitions (rebuilt when provider changes or on first use) */
	private cachedTools: ToolDefinition[] | null = null;
	/** Per-chat sticky agent selection: chatId → agentName */
	private chatAgents: Map<string, string> = new Map();

	constructor(config: TelegramMessageHandlerConfig) {
		this.plugin = config.plugin;
		this.app = config.plugin.app;
		this.botService = config.botService;
		this.voiceHandler = config.voiceHandler;
	}

	/**
	 * Set the voice handler (set after construction to avoid circular dependency).
	 *
	 * @param handler - The voice handler instance
	 */
	setVoiceHandler(handler: TelegramVoiceHandler): void {
		this.voiceHandler = handler;
	}

	/**
	 * Process an incoming Telegram message.
	 *
	 * Handles auth checking, bot commands, voice messages, and AI routing.
	 *
	 * @param message - The incoming Telegram message
	 */
	async handleMessage(message: TelegramMessage): Promise<void> {
		const chatId = message.chat.id;
		const chatIdStr = String(chatId);

		// Auth check
		if (!this.isAuthorized(chatIdStr)) {
			console.log(`[Telegram] Unauthorized message from chat ${chatId}`);
			await this.botService.sendMessage(chatId, "⛔ You are not authorized to use this bot. Add your chat ID to the Vault Copilot Telegram settings.");
			return;
		}

		// Handle voice messages
		if (message.voice && this.voiceHandler) {
			await this.voiceHandler.handleVoiceMessage(message);
			return;
		}

		const text = message.text?.trim();
		if (!text) return;

		// Handle bot commands
		if (text.startsWith("/")) {
			await this.handleCommand(chatId, chatIdStr, text);
			return;
		}

		// Regular text message → AI
		await this.processTextMessage(chatId, chatIdStr, text);
	}

	// ========================================================================
	// Bot Commands
	// ========================================================================

	/**
	 * Handle Telegram bot commands (messages starting with /).
	 *
	 * Supports: /start, /clear, /status, /help, /agent, /agents,
	 * /prompt, /prompts, /skills, /sessions, /session, /new,
	 * /conv, /join, /leave
	 *
	 * @param chatId - The chat to respond in
	 * @param chatIdStr - The chat ID as string
	 * @param command - The full command text (e.g., "/agent researcher")
	 * @internal
	 */
	private async handleCommand(chatId: number, chatIdStr: string, command: string): Promise<void> {
		const parts = command.split(/\s+/);
		const cmd = (parts[0] ?? "").toLowerCase();
		const args = parts.slice(1).join(" ").trim();

		switch (cmd) {
			case "/start":
				await this.botService.sendMessage(chatId, this.getWelcomeMessage());
				break;

			case "/clear":
				this.clearSession(chatIdStr);
				this.chatAgents.delete(chatIdStr);
				await this.botService.sendMessage(chatId, "🗑️ Session cleared. Starting fresh!");
				break;

			case "/status":
				await this.botService.sendMessage(chatId, await this.getStatusMessage(chatIdStr));
				break;

			case "/help":
				await this.botService.sendMessage(chatId, this.getHelpMessage());
				break;

			case "/agent":
				await this.handleAgentCommand(chatId, chatIdStr, args);
				break;

			case "/agents":
				await this.handleAgentsCommand(chatId);
				break;

			case "/prompt":
				await this.handlePromptCommand(chatId, chatIdStr, args);
				break;

			case "/prompts":
				await this.handlePromptsCommand(chatId);
				break;

			case "/skills":
				await this.handleSkillsCommand(chatId);
				break;

			case "/sessions":
				await this.handleSessionsCommand(chatId, chatIdStr);
				break;

			case "/session":
				await this.handleSessionCommand(chatId, chatIdStr, args);
				break;

			case "/new":
				await this.handleNewCommand(chatId, chatIdStr, args);
				break;

			case "/conv":
				await this.handleConversationsCommand(chatId);
				break;

			case "/join":
				await this.handleJoinCommand(chatId, chatIdStr, args);
				break;

			case "/leave":
				await this.handleLeaveCommand(chatId, chatIdStr);
				break;

			default:
				await this.botService.sendMessage(chatId, `Unknown command: ${cmd}\n\nType /help for available commands.`);
				break;
		}
	}

	// ========================================================================
	// Agent Commands
	// ========================================================================

	/**
	 * Handle /agent command — set, clear, or show active agent for this chat.
	 *
	 * @param chatId - Telegram chat ID
	 * @param chatIdStr - Chat ID as string
	 * @param args - Agent name or empty to show current
	 * @internal
	 */
	private async handleAgentCommand(chatId: number, chatIdStr: string, args: string): Promise<void> {
		if (!args) {
			// Show current agent
			const current = this.chatAgents.get(chatIdStr);
			if (current) {
				await this.botService.sendMessage(chatId, `🤖 Active agent: *${current}*\n\nUse /agent <name> to switch, or /agent off to clear.`);
			} else {
				await this.botService.sendMessage(chatId, "🤖 No active agent. Use /agent <name> to select one.\n\nUse /agents to see available agents.");
			}
			return;
		}

		// Clear agent
		if (args.toLowerCase() === "off" || args.toLowerCase() === "none" || args.toLowerCase() === "clear") {
			this.chatAgents.delete(chatIdStr);
			await this.botService.sendMessage(chatId, "🤖 Agent cleared. Using default mode.");
			return;
		}

		// Set agent
		const agents = this.plugin.agentCache.getAgents();
		const match = agents.find(a => a.name.toLowerCase() === args.toLowerCase());
		if (!match) {
			// Try fuzzy match
			const fuzzyMatch = agents.find(a => a.name.toLowerCase().includes(args.toLowerCase()));
			if (fuzzyMatch) {
				this.chatAgents.set(chatIdStr, fuzzyMatch.name);
				await this.botService.sendMessage(chatId, `🤖 Agent set to *${fuzzyMatch.name}*\n${fuzzyMatch.description || ""}`);
			} else {
				const available = agents.map(a => `• ${a.name}`).join("\n") || "No agents configured.";
				await this.botService.sendMessage(chatId, `❌ Agent "${args}" not found.\n\n*Available agents:*\n${available}`);
			}
			return;
		}

		this.chatAgents.set(chatIdStr, match.name);
		await this.botService.sendMessage(chatId, `🤖 Agent set to *${match.name}*\n${match.description || ""}`);
	}

	/**
	 * Handle /agents command — list all available agents.
	 *
	 * @param chatId - Telegram chat ID
	 * @internal
	 */
	private async handleAgentsCommand(chatId: number): Promise<void> {
		const agents = this.plugin.agentCache.getAgents();
		if (agents.length === 0) {
			await this.botService.sendMessage(chatId, "🤖 No agents configured.\n\nCreate .agent.md files in your vault's .github/agents/ folder.");
			return;
		}

		const lines = agents.map(a => {
			const desc = a.description ? ` — ${a.description}` : "";
			return `• *${a.name}*${desc}`;
		});

		await this.botService.sendMessage(chatId, `🤖 *Available Agents* (${agents.length}):\n\n${lines.join("\n")}\n\nUse /agent <name> to select one.`);
	}

	// ========================================================================
	// Prompt Commands
	// ========================================================================

	/**
	 * Handle /prompt command — run a named prompt template.
	 *
	 * @param chatId - Telegram chat ID
	 * @param chatIdStr - Chat ID as string
	 * @param args - Prompt name and optional arguments
	 * @internal
	 */
	private async handlePromptCommand(chatId: number, chatIdStr: string, args: string): Promise<void> {
		if (!args) {
			await this.botService.sendMessage(chatId, "Usage: /prompt <name> [arguments]\n\nUse /prompts to see available prompts.");
			return;
		}

		// Parse prompt name and arguments
		const spaceIdx = args.indexOf(" ");
		const promptName = spaceIdx === -1 ? args : args.substring(0, spaceIdx);
		const promptArgs = spaceIdx === -1 ? "" : args.substring(spaceIdx + 1).trim();

		// Find the prompt
		const prompts = this.plugin.promptCache.getPrompts();
		const match = prompts.find(p => p.name.toLowerCase() === promptName.toLowerCase())
			|| prompts.find(p => p.name.toLowerCase().includes(promptName.toLowerCase()));

		if (!match) {
			await this.botService.sendMessage(chatId, `❌ Prompt "${promptName}" not found.\n\nUse /prompts to see available prompts.`);
			return;
		}

		// Load full prompt content
		const fullPrompt = await this.plugin.promptCache.getFullPrompt(match.name);
		if (!fullPrompt?.content) {
			await this.botService.sendMessage(chatId, `⚠️ Prompt "${match.name}" has no content.`);
			return;
		}

		// Substitute arguments into prompt content
		let promptContent = fullPrompt.content;
		if (promptArgs) {
			// Replace {{input}} or {{args}} or {{query}} placeholders
			promptContent = promptContent.replace(/\{\{(input|args|query|message)\}\}/gi, promptArgs);
		}

		// If prompt specifies an agent, temporarily activate it
		const previousAgent = this.chatAgents.get(chatIdStr);
		if (fullPrompt.agent) {
			this.chatAgents.set(chatIdStr, fullPrompt.agent);
		}

		// Send the prompt through normal AI processing
		await this.processTextMessage(chatId, chatIdStr, promptContent);

		// Restore previous agent if it was temporarily changed
		if (fullPrompt.agent) {
			if (previousAgent) {
				this.chatAgents.set(chatIdStr, previousAgent);
			} else {
				this.chatAgents.delete(chatIdStr);
			}
		}
	}

	/**
	 * Handle /prompts command — list all available prompts.
	 *
	 * @param chatId - Telegram chat ID
	 * @internal
	 */
	private async handlePromptsCommand(chatId: number): Promise<void> {
		const prompts = this.plugin.promptCache.getPrompts();
		if (prompts.length === 0) {
			await this.botService.sendMessage(chatId, "📝 No prompts configured.\n\nCreate .prompt.md files in your vault's .github/prompts/ folder.");
			return;
		}

		const lines = prompts.map(p => {
			const desc = p.description ? ` — ${p.description}` : "";
			const hint = p.argumentHint ? ` \`${p.argumentHint}\`` : "";
			return `• *${p.name}*${hint}${desc}`;
		});

		await this.botService.sendMessage(chatId, `📝 *Available Prompts* (${prompts.length}):\n\n${lines.join("\n")}\n\nUse /prompt <name> [args] to run one.`);
	}

	// ========================================================================
	// Skills Command
	// ========================================================================

	/**
	 * Handle /skills command — list all available skills.
	 *
	 * @param chatId - Telegram chat ID
	 * @internal
	 */
	private async handleSkillsCommand(chatId: number): Promise<void> {
		const fileSkills = this.plugin.skillCache.getSkills();
		const runtimeSkills = this.plugin.skillRegistry.listSkills();

		if (fileSkills.length === 0 && runtimeSkills.length === 0) {
			await this.botService.sendMessage(chatId, "🔧 No skills configured.\n\nCreate SKILL.md files in your vault's .github/skills/ folder.");
			return;
		}

		const lines: string[] = [];
		if (fileSkills.length > 0) {
			lines.push("*File-based skills:*");
			for (const s of fileSkills) {
				lines.push(`• *${s.name}* — ${s.description || "No description"}`);
			}
		}
		if (runtimeSkills.length > 0) {
			if (lines.length > 0) lines.push("");
			lines.push("*Runtime skills:*");
			for (const s of runtimeSkills) {
				lines.push(`• *${s.name}* — ${s.description || "No description"}`);
			}
		}

		const total = fileSkills.length + runtimeSkills.length;
		await this.botService.sendMessage(chatId, `🔧 *Available Skills* (${total}):\n\n${lines.join("\n")}`);
	}

	// ========================================================================
	// Session Commands
	// ========================================================================

	/**
	 * Handle /sessions command — list all sessions (Telegram + ChatView).
	 *
	 * Shows both Telegram and ChatView sessions so the user can join any
	 * existing session via `/session <name>`.
	 *
	 * @param chatId - Telegram chat ID
	 * @param chatIdStr - Chat ID as string
	 * @internal
	 */
	private async handleSessionsCommand(chatId: number, _chatIdStr: string): Promise<void> {
		const settings = this.plugin.settings;
		const activeSessions = settings.sessions.filter(s => !s.archived);
		const recentArchived = settings.sessions.filter(s => s.archived).slice(-5);

		if (activeSessions.length === 0 && recentArchived.length === 0) {
			await this.botService.sendMessage(chatId, "💬 No sessions found. Send a message to start one!");
			return;
		}

		const lines: string[] = [];

		// Active sessions (sorted by last used)
		const sorted = [...activeSessions].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
		for (const s of sorted) {
			const msgCount = s.messages.length;
			const time = formatTimeAgo(s.lastUsedAt);
			const currentTag = s.id === settings.activeSessionId ? " ← _current_" : "";
			lines.push(`• *${s.name}*${currentTag} (${msgCount} msgs, ${time})`);
		}

		if (recentArchived.length > 0) {
			lines.push("");
			lines.push("*Archived:*");
			for (const s of [...recentArchived].reverse()) {
				const msgCount = s.messages.length;
				const time = formatTimeAgo(s.lastUsedAt);
				lines.push(`• ${s.name} (${msgCount} msgs, ${time})`);
			}
		}

		await this.botService.sendMessage(
			chatId,
			`💬 *Sessions:*\n\n${lines.join("\n")}\n\nUse /session <name> to switch sessions.\nUse /new [name] to start a new one.`
		);
	}

	/**
	 * Handle /new command — archive the current Telegram session and create a new one.
	 *
	 * @param chatId - Telegram chat ID
	 * @param chatIdStr - Chat ID as string
	 * @param args - Optional session name
	 * @internal
	 */
	private async handleNewCommand(chatId: number, chatIdStr: string, args: string): Promise<void> {
		const settings = this.plugin.settings;

		// Archive the current active session
		if (settings.activeSessionId) {
			const current = settings.sessions.find(s => s.id === settings.activeSessionId && !s.archived);
			if (current) {
				current.archived = true;
				current.completedAt = Date.now();
			}
		}

		// Create new session
		const now = Date.now();
		const name = args || `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		const newSession: CopilotSession = {
			id: `session-${now}`,
			name,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
		};
		settings.sessions.push(newSession);
		settings.activeSessionId = newSession.id;

		// Clear AI context and agent
		this.clearSession(chatIdStr);
		this.chatAgents.delete(chatIdStr);

		await this.plugin.saveSettings();
		this.plugin.notifySessionUpdate();

		await this.botService.sendMessage(chatId, `✨ New session: *${name}*\n\nPrevious session archived.`);
	}

	/**
	 * Handle /session command — join an existing session by name.
	 *
	 * Looks up a session by name (fuzzy match) and switches the Telegram
	 * conversation to use that session. This lets users continue ChatView
	 * sessions from Telegram and vice versa.
	 *
	 * @param chatId - Telegram chat ID
	 * @param chatIdStr - Chat ID as string
	 * @param args - Session name to search for
	 * @internal
	 */
	private async handleSessionCommand(chatId: number, _chatIdStr: string, args: string): Promise<void> {
		if (!args) {
			await this.botService.sendMessage(chatId, "Usage: /session <name>\n\nUse /sessions to see available sessions.");
			return;
		}

		const settings = this.plugin.settings;
		const query = args.toLowerCase();

		// Find matching session (exact then fuzzy)
		const activeSessions = settings.sessions.filter(s => !s.archived);
		const match = activeSessions.find(s => s.name.toLowerCase() === query)
			|| activeSessions.find(s => s.name.toLowerCase().includes(query));

		if (!match) {
			const available = activeSessions.map(s => `• ${s.name}`).join("\n") || "No active sessions.";
			await this.botService.sendMessage(chatId, `❌ No session matching "${args}".\n\n*Active sessions:*\n${available}`);
			return;
		}

		// Switch active session
		settings.activeSessionId = match.id;
		match.lastUsedAt = Date.now();

		// Clear AI context so it rebuilds from the new session's history
		if (this.dedicatedService) {
			this.dedicatedService.clearHistory();
		}

		await this.plugin.saveSettings();
		this.plugin.notifySessionUpdate();

		const msgCount = match.messages.length;
		const convInfo = match.conversationId ? `\nConversation: \`${match.conversationId.substring(0, 12)}...\`` : "\nConversation: _(new on next message)_";
		await this.botService.sendMessage(
			chatId,
			`🔗 Switched to: *${match.name}* (${msgCount} messages)${convInfo}\n\nI can see the conversation history. What would you like to do?`
		);
	}

	/**
	 * Handle /conv command — list SDK CLI conversations.
	 *
	 * Shows all server-side conversations that can be joined from Telegram
	 * sessions. This bridges the session/conversation separation.
	 *
	 * @param chatId - Telegram chat ID
	 * @internal
	 */
	private async handleConversationsCommand(chatId: number): Promise<void> {
		const sharedService = this.plugin.getActiveService();
		if (!sharedService || !('listSessions' in sharedService)) {
			await this.botService.sendMessage(chatId, "⚠️ Conversations are only available with the Copilot CLI provider.");
			return;
		}

		try {
			const cliService = sharedService as { listSessions: () => Promise<Array<{ sessionId: string; modifiedTime?: Date; summary?: string }>> };
			const conversations = await cliService.listSessions();

			if (conversations.length === 0) {
				await this.botService.sendMessage(chatId, "📭 No conversations found.\n\nStart chatting to create one.");
				return;
			}

			// Find which sessions link to which conversations
			const sessionMap = new Map<string, string>();
			for (const s of this.plugin.settings.sessions) {
				if (s.conversationId) {
					sessionMap.set(s.conversationId, s.name);
				}
			}

			const lines = conversations
				.sort((a, b) => (b.modifiedTime?.getTime() ?? 0) - (a.modifiedTime?.getTime() ?? 0))
				.slice(0, 10)
				.map(c => {
					const shortId = c.sessionId.substring(0, 12);
					const linkedSession = sessionMap.get(c.sessionId);
					const link = linkedSession ? ` → _${linkedSession}_` : "";
					const summary = c.summary ? `: ${c.summary.substring(0, 40)}` : "";
					const time = c.modifiedTime ? ` (${formatTimeAgo(c.modifiedTime.getTime())})` : "";
					return `• \`${shortId}\`${summary}${time}${link}`;
				});

			await this.botService.sendMessage(
				chatId,
				`🧠 *Conversations:*\n\n${lines.join("\n")}\n\nUse /join <id> to attach your current session to one.`
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			await this.botService.sendMessage(chatId, `⚠️ Failed to list conversations: ${msg}`);
		}
	}

	/**
	 * Handle /join command — attach the current session to an existing conversation.
	 *
	 * Looks up a conversation by ID prefix or linked session name, then sets
	 * the session's `conversationId`. The next message will resume that conversation.
	 *
	 * @param chatId - Telegram chat ID
	 * @param chatIdStr - Chat ID as string
	 * @param args - Conversation ID prefix or session name to match
	 * @internal
	 */
	private async handleJoinCommand(chatId: number, _chatIdStr: string, args: string): Promise<void> {
		if (!args) {
			await this.botService.sendMessage(chatId, "Usage: /join <conversation-id or session-name>\n\nUse /conv to see available conversations.");
			return;
		}

		const sharedService = this.plugin.getActiveService();
		if (!sharedService || !('listSessions' in sharedService)) {
			await this.botService.sendMessage(chatId, "⚠️ /join is only available with the Copilot CLI provider.");
			return;
		}

		const settings = this.plugin.settings;

		// Get the current session
		const session = settings.activeSessionId
			? settings.sessions.find(s => s.id === settings.activeSessionId && !s.archived)
			: null;
		if (!session) {
			await this.botService.sendMessage(chatId, "⚠️ No active session. Send a message first or use /new.");
			return;
		}

		try {
			const cliService = sharedService as { listSessions: () => Promise<Array<{ sessionId: string; summary?: string }>> };
			const conversations = await cliService.listSessions();
			const query = args.toLowerCase();

			// Match by conversation ID prefix
			let match = conversations.find(c => c.sessionId.toLowerCase().startsWith(query));

			// Fallback: match by linked session name
			if (!match) {
				for (const s of settings.sessions) {
					if (s.conversationId && s.name.toLowerCase().includes(query)) {
						match = conversations.find(c => c.sessionId === s.conversationId);
						if (match) break;
					}
				}
			}

			if (!match) {
				await this.botService.sendMessage(chatId, `❌ No conversation matching "${args}".\n\nUse /conv to see available conversations.`);
				return;
			}

			session.conversationId = match.sessionId;
			await this.plugin.saveSettings();
			this.plugin.notifySessionUpdate();

			const summary = match.summary ? `\nSummary: ${match.summary.substring(0, 80)}` : "";
			await this.botService.sendMessage(
				chatId,
				`🔗 Joined conversation \`${match.sessionId.substring(0, 12)}...\`${summary}\n\nSession *${session.name}* is now linked to this conversation.`
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			await this.botService.sendMessage(chatId, `⚠️ Failed to join conversation: ${msg}`);
		}
	}

	/**
	 * Handle /leave command — detach the current session from its conversation.
	 *
	 * Clears the session's `conversationId`. The next message will create
	 * a fresh conversation automatically.
	 *
	 * @param chatId - Telegram chat ID
	 * @param _chatIdStr - Chat ID as string (unused)
	 * @internal
	 */
	private async handleLeaveCommand(chatId: number, _chatIdStr: string): Promise<void> {
		const settings = this.plugin.settings;

		const session = settings.activeSessionId
			? settings.sessions.find(s => s.id === settings.activeSessionId && !s.archived)
			: null;

		if (!session) {
			await this.botService.sendMessage(chatId, "⚠️ No active session.");
			return;
		}

		if (!session.conversationId) {
			await this.botService.sendMessage(chatId, "ℹ️ This session isn't linked to a conversation.");
			return;
		}

		const oldConvId = session.conversationId.substring(0, 12);
		session.conversationId = undefined;
		await this.plugin.saveSettings();
		this.plugin.notifySessionUpdate();

		await this.botService.sendMessage(
			chatId,
			`🔓 Detached from conversation \`${oldConvId}...\`\n\nSession *${session.name}* will start a new conversation on the next message.`
		);
	}

	// ========================================================================
	// Dedicated AI Service Management
	// ========================================================================

	/**
	 * Get or create a dedicated AI service for Telegram.
	 *
	 * For OpenAI/Azure, creates a separate service instance so Telegram
	 * calls don't interfere with the ChatView. For Copilot CLI, returns
	 * the shared service (since its tools are built-in).
	 *
	 * @returns The AI service to use, or null if none available
	 * @internal
	 */
	private async ensureDedicatedService(): Promise<AIProvider | { sendMessage: (prompt: string) => Promise<string> } | null> {
		const sharedService = this.plugin.getActiveService();
		if (!sharedService) return null;

		// For Copilot CLI, use the shared service (tools are built into the SDK session)
		if (this.plugin.settings.aiProvider === "copilot" && !this.plugin.settings.chatProviderProfileId) {
			return sharedService;
		}

		// Check if we have a Copilot CLI service from profile
		const profileId = this.plugin.settings.chatProviderProfileId;
		if (profileId) {
			const profile = getProfileById(this.plugin.settings, profileId);
			if (!profile || profile.type === "copilot") {
				return sharedService;
			}
		}

		// For OpenAI/Azure, use a dedicated service
		const fingerprint = this.getProviderFingerprint();
		if (this.dedicatedService && this.lastProviderFingerprint === fingerprint) {
			return this.dedicatedService;
		}

		// Create or recreate dedicated service
		await this.createDedicatedService();
		return this.dedicatedService;
	}

	/**
	 * Create a dedicated OpenAI or Azure service for Telegram.
	 *
	 * @internal
	 */
	private async createDedicatedService(): Promise<void> {
		// Destroy existing service
		if (this.dedicatedService) {
			await this.dedicatedService.destroy();
			this.dedicatedService = null;
		}

		const settings = this.plugin.settings;
		const profileId = settings.chatProviderProfileId;

		try {
			if (profileId) {
				const profile = getProfileById(settings, profileId);
				if (profile?.type === "openai") {
					const apiKey = getOpenAIProfileApiKey(this.app, profile as OpenAIProviderProfile);
					this.dedicatedService = new OpenAIService(this.app, {
						provider: "openai",
						model: (profile as OpenAIProviderProfile).model || "gpt-4o",
						streaming: false,
						apiKey,
						baseURL: (profile as OpenAIProviderProfile).baseURL,
						mcpManager: this.plugin.mcpManager,
					});
				} else if (profile?.type === "azure-openai") {
					const azProfile = profile as AzureOpenAIProviderProfile;
					const apiKey = getAzureProfileApiKey(this.app, azProfile);
					this.dedicatedService = new AzureOpenAIService(this.app, {
						provider: "azure-openai",
						model: azProfile.model || "gpt-4o",
						streaming: false,
						apiKey: apiKey || "",
						endpoint: azProfile.endpoint,
						deploymentName: azProfile.deploymentName,
						apiVersion: azProfile.apiVersion,
						mcpManager: this.plugin.mcpManager,
					});
				}
			} else if (settings.aiProvider === "openai") {
				const apiKey = getLegacyOpenAIKey(this.app, settings);
				if (apiKey) {
					this.dedicatedService = new OpenAIService(this.app, {
						provider: "openai",
						model: settings.openai?.model || "gpt-4o",
						streaming: false,
						apiKey,
						baseURL: settings.openai?.baseURL || undefined,
						mcpManager: this.plugin.mcpManager,
					});
				}
			} else if (settings.aiProvider === "azure-openai") {
				// Azure from legacy settings
				const profile = settings.aiProviderProfiles?.find(p => p.type === "azure-openai");
				if (profile) {
					const azProfile = profile as AzureOpenAIProviderProfile;
					const apiKey = getAzureProfileApiKey(this.app, azProfile);
					this.dedicatedService = new AzureOpenAIService(this.app, {
						provider: "azure-openai",
						model: azProfile.model || "gpt-4o",
						streaming: false,
						apiKey: apiKey || "",
						endpoint: azProfile.endpoint,
						deploymentName: azProfile.deploymentName,
						apiVersion: azProfile.apiVersion,
						mcpManager: this.plugin.mcpManager,
					});
				}
			}

			if (this.dedicatedService) {
				await this.dedicatedService.initialize();
				// Set vault tools on the dedicated service
				this.cachedTools = buildTelegramToolDefinitions(this.app, this.plugin);
				this.dedicatedService.setTools(this.cachedTools);
				this.lastProviderFingerprint = this.getProviderFingerprint();
				console.log(`[Telegram] Dedicated AI service created with ${this.cachedTools.length} tools`);
			}
		} catch (error) {
			console.error("[Telegram] Failed to create dedicated service:", error);
			this.dedicatedService = null;
		}
	}

	/**
	 * Get a fingerprint of the current provider configuration.
	 * Used to detect when the service needs to be recreated.
	 *
	 * @returns A string fingerprint of the provider config
	 * @internal
	 */
	private getProviderFingerprint(): string {
		const s = this.plugin.settings;
		return `${s.aiProvider}|${s.chatProviderProfileId || ""}|${s.model}`;
	}

	// ========================================================================
	// AI Message Processing
	// ========================================================================

	/**
	 * Process a text message through the AI provider.
	 *
	 * Uses a dedicated AI service with vault tools wired in.
	 * For OpenAI/Azure, creates a separate instance to avoid shared state.
	 * For Copilot CLI, uses the shared service (tools are built-in).
	 *
	 * @param chatId - Telegram chat ID (number)
	 * @param chatIdStr - Telegram chat ID (string, for session lookup)
	 * @param text - User's message text
	 * @param inputType - How the message was input ('text' or 'voice')
	 * @internal
	 */
	async processTextMessage(
		chatId: number,
		chatIdStr: string,
		text: string,
		inputType: "text" | "voice" = "text"
	): Promise<void> {
		const service = await this.ensureDedicatedService();
		if (!service) {
			await this.botService.sendMessage(chatId, "⚠️ No AI provider is connected. Configure one in Vault Copilot settings.");
			return;
		}

		// Show typing indicator
		await this.botService.sendTypingAction(chatId);

		// Get or create session
		const session = this.getOrCreateSession(chatIdStr);

		// Store user message
		const userMessage: ChatMessage = {
			role: "user",
			content: text,
			timestamp: new Date(),
			source: "telegram",
			inputType,
		};
		session.messages.push(userMessage);

		// Update lastUsedAt immediately so the session moves to top of the list
		session.lastUsedAt = Date.now();
		// Skip notification here — we are about to sync the SDK conversation
		// and notifying ChatView would race with the shared service.
		await this.saveSession(session, /* skipNotify */ true);

		try {
			// Build context with session history
			const contextMessages = this.buildContextMessages(session);

			// For shared Copilot CLI service, ensure the SDK conversation
			// matches the session's linked conversation. If the session has
			// no conversationId yet (e.g., new session), create a fresh
			// SDK conversation and link it. Local session IDs never touch
			// the SDK — only conversationId does.
			if (service !== this.dedicatedService && 'getSessionId' in service && 'loadSession' in service) {
				const cliService = service as { getSessionId: () => string | null; loadSession: (id: string, msgs?: ChatMessage[]) => Promise<void>; createSession: () => Promise<string>; sendMessage: (prompt: string) => Promise<string> };

				if (session.conversationId) {
					// Session has a linked conversation — ensure the SDK is on it
					const sdkSessionId = cliService.getSessionId();
					if (sdkSessionId !== session.conversationId) {
						console.log(`[Telegram] Conversation mismatch: SDK=${sdkSessionId}, expected=${session.conversationId} — loading`);
						try {
							await cliService.loadSession(session.conversationId, session.messages || []);
						} catch (loadErr) {
							// Conversation expired server-side — create a fresh one
							console.warn(`[Telegram] Failed to load conversation ${session.conversationId}, creating new:`, loadErr);
							const freshConvId = await cliService.createSession();
							if (freshConvId) {
								session.conversationId = freshConvId;
								await this.saveSession(session, /* skipNotify */ true);
							}
						}
					}
				} else {
					// No conversation yet — create one and link it
					const convId = await cliService.createSession();
					if (convId) {
						session.conversationId = convId;
						console.log(`[Telegram] Created new conversation ${convId} for session ${session.id}`);
						await this.saveSession(session, /* skipNotify */ true);
					}
				}
			}

			// For dedicated AI service (OpenAI/Azure), configure per-call
			if (this.dedicatedService && service === this.dedicatedService) {
				// Clear previous conversation from the service's internal history
				this.dedicatedService.clearHistory();
				// Ensure tools are set (they persist but refresh on provider change)
				if (!this.cachedTools) {
					this.cachedTools = buildTelegramToolDefinitions(this.app, this.plugin);
					this.dedicatedService.setTools(this.cachedTools);
				}
			}

			// Build the prompt based on service type
			let finalPrompt: string;
			if (service !== this.dedicatedService) {
				// Shared Copilot CLI: the SDK session already has its own
				// systemMessage set at session creation time. Do NOT prepend
				// the Telegram system prompt here — doing so stores it in the
				// SDK's messageHistory and it shows up as a user message in
				// the ChatView. Just prepend the lightweight formatting context.
				finalPrompt = `${TELEGRAM_FORMATTING_CONTEXT}\n\n${text}`;
			} else {
				// Dedicated service (OpenAI/Azure): needs full context replay
				// since it starts fresh each call.
				const fullPrompt = contextMessages
						? `${TELEGRAM_FORMATTING_CONTEXT}\n\n${contextMessages}\n\nUser: ${text}`
						: `${TELEGRAM_FORMATTING_CONTEXT}\n\n${text}`;
					finalPrompt = fullPrompt;
			}

			// Send to AI provider (non-streaming)
			// Keep sending typing indicators during processing
			const typingInterval = setInterval(() => {
				this.botService.sendTypingAction(chatId).catch(() => { /* best effort */ });
			}, 4000);

			let response: string;
			try {
				response = await service.sendMessage(finalPrompt);
			} finally {
				clearInterval(typingInterval);
			}

			// Guard against empty response
			if (!response || !response.trim()) {
				console.warn("[Telegram] AI returned empty response");
				await this.botService.sendMessage(chatId, "⚠️ The AI returned an empty response. Please try again.");
				return;
			}

			// Store assistant response
			const assistantMessage: ChatMessage = {
				role: "assistant",
				content: response,
				timestamp: new Date(),
				source: "telegram",
			};
			session.messages.push(assistantMessage);

			// Trim session if needed
			this.trimSession(session);

			// Update session timestamp
			session.lastUsedAt = Date.now();

			// Save session
			await this.saveSession(session);

			// Send response back to Telegram (split if too long)
			await this.sendLongMessage(chatId, response);

			// Handle voice reply if applicable
			if (this.voiceHandler && this.shouldSendVoiceReply(inputType)) {
				await this.voiceHandler.sendVoiceReply(chatId, response);
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error("[Telegram] AI processing error:", errorMsg);
			await this.botService.sendMessage(chatId, `⚠️ Error: ${errorMsg}`);
		}
	}

	/**
	 * Send a long message, splitting into chunks if it exceeds Telegram's limit.
	 *
	 * @param chatId - Telegram chat ID
	 * @param text - The full message text
	 * @internal
	 */
	private async sendLongMessage(chatId: number, text: string): Promise<void> {
		const MAX_LENGTH = 4000;
		if (text.length <= MAX_LENGTH) {
			await this.botService.sendMessage(chatId, text);
			return;
		}

		// Split on paragraph boundaries
		const chunks: string[] = [];
		let remaining = text;
		while (remaining.length > MAX_LENGTH) {
			let splitAt = remaining.lastIndexOf("\n\n", MAX_LENGTH);
			if (splitAt === -1 || splitAt < MAX_LENGTH / 2) {
				splitAt = remaining.lastIndexOf("\n", MAX_LENGTH);
			}
			if (splitAt === -1 || splitAt < MAX_LENGTH / 2) {
				splitAt = MAX_LENGTH;
			}
			chunks.push(remaining.substring(0, splitAt));
			remaining = remaining.substring(splitAt).trimStart();
		}
		if (remaining) {
			chunks.push(remaining);
		}

		for (const chunk of chunks) {
			await this.botService.sendMessage(chatId, chunk);
		}
	}

	// ========================================================================
	// Session Management
	// ========================================================================

	/**
	 * Get or create a session for a Telegram chat.
	 *
	 * Uses the shared active session (`activeSessionId`) so Telegram and
	 * the ChatView operate on the same conversation. If no active session
	 * exists, creates a new one using the same naming convention as ChatView.
	 *
	 * @param _chatIdStr - Telegram chat ID (unused; kept for API compat)
	 * @returns The chat session
	 */
	private getOrCreateSession(_chatIdStr: string): CopilotSession {
		const settings = this.plugin.settings;
		const saveConversations = settings.telegram?.saveConversations ?? true;

		if (!saveConversations) {
			// Ephemeral mode — in-memory only
			let session = this.ephemeralSessions.get("active");
			if (!session) {
				session = {
					id: `ephemeral-${Date.now()}`,
					name: "Telegram Chat",
					createdAt: Date.now(),
					lastUsedAt: Date.now(),
					archived: false,
					messages: [],
				};
				this.ephemeralSessions.set("active", session);
			}
			return session;
		}

		// Use the active session if it exists
		if (settings.activeSessionId) {
			const active = settings.sessions.find(
				(s) => s.id === settings.activeSessionId && !s.archived
			);
			if (active) return active;
		}

		// No active session — create one and make it active
		const now = Date.now();
		const session: CopilotSession = {
			id: `session-${now}`,
			name: `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
		};
		settings.sessions.push(session);
		settings.activeSessionId = session.id;
		return session;
	}

	/**
	 * Clear the current Telegram AI context.
	 *
	 * Resets the dedicated service's conversation history so the next
	 * message starts fresh. Does not archive the active session — use
	 * `/new` to archive and create a new session.
	 *
	 * @param _chatIdStr - Telegram chat ID (unused; kept for API compat)
	 */
	private clearSession(_chatIdStr: string): void {
		// Clear ephemeral session
		this.ephemeralSessions.delete("active");

		// Clear the dedicated service's conversation history
		if (this.dedicatedService) {
			this.dedicatedService.clearHistory();
		}
	}

	/**
	 * Trim session messages to stay within the configured limit.
	 *
	 * @param session - The session to trim
	 * @internal
	 */
	private trimSession(session: CopilotSession): void {
		const maxMessages = this.plugin.settings.telegram?.maxSessionMessages ?? 100;
		if (session.messages.length > maxMessages) {
			// Keep the most recent messages, preserving pairs
			const excess = session.messages.length - maxMessages;
			session.messages.splice(0, excess);
		}
	}

	/**
	 * Save the session to plugin settings and notify the ChatView.
	 *
	 * Persists the session data and triggers a UI refresh so messages
	 * added by Telegram appear in the ChatView in real time.
	 *
	 * @param _session - The session to save
	 * @param skipNotify - When true, persists data but does NOT fire
	 *   {@link notifySessionUpdate}. Use this inside critical SDK sync
	 *   blocks where notifying ChatView would cause it to call
	 *   `loadSession()` on the shared service and switch the active
	 *   conversation before `sendMessage()` completes (race condition).
	 * @internal
	 */
	private async saveSession(_session: CopilotSession, skipNotify = false): Promise<void> {
		if (this.plugin.settings.telegram?.saveConversations) {
			await this.plugin.saveSettings();
			if (!skipNotify) {
				// Notify ChatView to refresh so Telegram messages appear live
				this.plugin.notifySessionUpdate();
			}
		}
	}

	// ========================================================================
	// Context Building
	// ========================================================================

	/**
	 * Build context from session history for the AI prompt.
	 *
	 * Creates a simple conversation transcript from recent messages
	 * to provide multi-turn context.
	 *
	 * @param session - The chat session
	 * @returns Formatted conversation context string
	 * @internal
	 */
	private buildContextMessages(session: CopilotSession): string {
		if (session.messages.length <= 1) return "";

		// Use recent messages for context (last 20 message pairs max)
		// Exclude the last message (current user message, already added separately)
		const recentMessages = session.messages.slice(-41, -1);
		if (recentMessages.length === 0) return "";

		const lines = recentMessages.map((msg) => {
			const role = msg.role === "user" ? "User" : "Assistant";
			return `${role}: ${msg.content}`;
		});

		return "Previous conversation:\n" + lines.join("\n");
	}

	// ========================================================================
	// Authorization
	// ========================================================================

	/**
	 * Check if a chat ID is authorized.
	 *
	 * @param chatIdStr - Telegram chat ID to check
	 * @returns True if authorized
	 * @internal
	 */
	private isAuthorized(chatIdStr: string): boolean {
		const authorizedIds = this.plugin.settings.telegram?.authorizedChatIds ?? [];

		// If no IDs configured, deny all (require explicit authorization)
		if (authorizedIds.length === 0) return false;

		return authorizedIds.includes(chatIdStr);
	}

	/**
	 * Check if we should send a voice reply based on settings and input type.
	 *
	 * @param inputType - How the user's message was input
	 * @returns True if a voice reply should be sent
	 * @internal
	 */
	private shouldSendVoiceReply(inputType: "text" | "voice"): boolean {
		const mode = this.plugin.settings.telegram?.voiceReplies ?? "voice-only";
		switch (mode) {
			case "always":
				return true;
			case "voice-only":
				return inputType === "voice";
			case "never":
				return false;
			default:
				return false;
		}
	}

	// ========================================================================
	// Message Templates
	// ========================================================================

	/**
	 * Get the welcome message for /start command.
	 * @internal
	 */
	private getWelcomeMessage(): string {
		return [
			"👋 Welcome to Vault Copilot!",
			"",
			"I'm your AI assistant connected to your Obsidian vault. I can:",
			"• Read, create, search, and update notes",
			"• Manage tasks (create, list, mark complete)",
			"• Search the web and fetch pages",
			"• Use custom agents, prompts, and skills",
			"• Process voice messages",
			"",
			"Type /help to see all commands.",
			"Just send me a message to get started!",
		].join("\n");
	}

	/**
	 * Get the help message for /help command.
	 * @internal
	 */
	private getHelpMessage(): string {
		return [
			"📖 *Available Commands:*",
			"",
			"*General:*",
			"/start — Welcome message",
			"/help — This help message",
			"/status — Connection & config status",
			"",
			"*Sessions:*",
			"/clear — Clear current session",
			"/new [name] — Start a new session",
			"/sessions — List all sessions",
			"/session <name> — Switch to a session",
			"",
			"*Conversations (CLI):*",
			"/conv — List SDK conversations",
			"/join <id|name> — Attach session to a conversation",
			"/leave — Detach session from its conversation",
			"",
			"*AI Customization:*",
			"/agent <name> — Set active agent (sticky)",
			"/agent off — Clear active agent",
			"/agents — List available agents",
			"/prompt <name> [args] — Run a prompt",
			"/prompts — List available prompts",
			"/skills — List available skills",
			"",
			"💡 *Tips:*",
			"• Just type naturally — I can read, create, and search notes",
			"• Ask me to manage tasks, fetch web pages, or search the web",
			"• Send voice messages for voice-to-text processing",
			"• Agents stay active until you switch or /clear",
			"• Sessions are local buckets; conversations are the AI brain",
		].join("\n");
	}

	/**
	 * Get the status message for /status command.
	 * @internal
	 */
	private async getStatusMessage(chatIdStr: string): Promise<string> {
		const sharedService = this.plugin.getActiveService();
		const botInfo = this.botService.getBotInfo();
		const status = this.botService.getStatus();
		const agentName = this.chatAgents.get(chatIdStr);
		const hasDedicatedService = this.dedicatedService !== null;
		const toolCount = this.cachedTools?.length ?? 0;

		// Show active session info
		const activeSession = this.plugin.settings.activeSessionId
			? this.plugin.settings.sessions.find(s => s.id === this.plugin.settings.activeSessionId && !s.archived)
			: null;
		const sessionName = activeSession?.name ?? "None (send a message to start)";
		const sessionMsgs = activeSession?.messages.length ?? 0;

		const lines = [
			"📊 *Vault Copilot Status:*",
			"",
			`Bot: @${botInfo?.username ?? "unknown"} (${status})`,
			`AI Provider: ${sharedService ? "Connected" : "Not connected"}`,
			`Provider Type: ${this.plugin.settings.aiProvider}`,
			`Model: ${this.plugin.settings.model}`,
			`Dedicated Service: ${hasDedicatedService ? "Yes" : "No (using shared)"}`,
			`Tools Loaded: ${toolCount}`,
			`Active Agent: ${agentName || "None"}`,
			`Current Session: ${sessionName} (${sessionMsgs} msgs)`,
			`Conversation: ${activeSession?.conversationId ? `\`${activeSession.conversationId.substring(0, 16)}...\`` : "_(none — new on next message)_"}`,
			`Save Conversations: ${this.plugin.settings.telegram?.saveConversations ? "Yes" : "No"}`,
			`Agents: ${this.plugin.agentCache.count}`,
			`Prompts: ${this.plugin.promptCache.count}`,
			`Skills: ${this.plugin.skillCache.count}`,
		];

		return lines.join("\n");
	}

	/**
	 * Destroy the handler and clean up resources.
	 */
	async destroy(): Promise<void> {
		this.ephemeralSessions.clear();
		this.chatAgents.clear();
		this.cachedTools = null;

		if (this.dedicatedService) {
			await this.dedicatedService.destroy();
			this.dedicatedService = null;
		}
	}
}
