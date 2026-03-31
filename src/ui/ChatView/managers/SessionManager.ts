// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module SessionManager
 * @description Manages chat session lifecycle for Torqena chat view.
 *
 * Handles creation, loading, persistence, and auto-naming of chat sessions while
 * coordinating with the GitHub Copilot CLI service for message history.
 *
 * @since 0.0.14
 */

import { CopilotSession } from "../../../ui/settings";
import type { BasicCopilotPluginSettings } from "../../../ui/settings/types";
import { GitHubCopilotCliService, ChatMessage } from "../../../copilot/providers/GitHubCopilotCliService";

/**
 * Callback interface for SessionManager to notify the view of changes
 */
export interface SessionManagerCallbacks {
	onSessionCreated: () => void;
	onSessionLoaded: () => void;
	onHeaderUpdate: () => void;
	onSessionPanelHide: () => void;
	onAgentReset: () => void;
	onAgentRestore?: (agentName?: string) => void;
	onGetAgentName?: () => string | undefined;
	onClearUI: () => void;
	onLoadMessages: () => Promise<void>;
	onShowWelcome: () => void;
}

/**
 * Manages chat session lifecycle - creation, loading, saving, and naming
 */
export class SessionManager {
	private settings: BasicCopilotPluginSettings;
	private githubCopilotCliService: GitHubCopilotCliService;
	private saveSettings: () => Promise<void>;
	private callbacks: SessionManagerCallbacks;
	private vaultId?: string;
	private activeSessionId?: string;
	private lastGeneratedTimestamp = 0;

	constructor(
		settings: BasicCopilotPluginSettings,
		githubCopilotCliService: GitHubCopilotCliService,
		saveSettings: () => Promise<void>,
		callbacks: SessionManagerCallbacks,
		vaultId?: string
	) {
		this.settings = settings;
		this.githubCopilotCliService = githubCopilotCliService;
		this.saveSettings = saveSettings;
		this.callbacks = callbacks;
		this.vaultId = vaultId;
		this.activeSessionId = settings.activeSessionId ?? undefined;
	}

	/**
	 * Get the active session ID.
	 * @returns The active session ID or undefined if no session is active
	 */
	getActiveSessionId(): string | undefined {
		return this.activeSessionId ?? this.settings.activeSessionId ?? undefined;
	}

	setOwnedSessionId(sessionId?: string): void {
		this.activeSessionId = sessionId;
	}

	getSessionById(sessionId?: string): CopilotSession | undefined {
		if (!sessionId) return undefined;
		return this.settings.sessions.find((s: CopilotSession) => s.id === sessionId);
	}

	/**
	 * Get the current session object
	 */
	getCurrentSession(): CopilotSession | undefined {
		return this.getSessionById(this.getActiveSessionId());
	}

	/**
	 * Get the current session name for display
	 */
	getCurrentSessionName(): string {
		const session = this.getCurrentSession();
		if (session) {
			return session.name;
		}
		return "New Chat Window";
	}

	/**
	 * Create a new chat — clears messages but keeps agent, tools, and ambient context.
	 * Use when you want to switch topics without losing your current setup.
	 */
	async createNewChat(name?: string): Promise<void> {
		console.info("[Torqena TRACE] session:create-new-chat:start", {
			activeSessionId: this.getActiveSessionId(),
			requestedName: name ?? null,
		});
		// Save current session before creating new one
		await this.saveCurrentSession();
		// Clear the current timeline immediately so New Chat feels instantaneous.
		this.callbacks.onClearUI();
		this.callbacks.onShowWelcome();

		// Do NOT reset agent or tools — they carry over

		// Create new session
		const now = Date.now();
		const defaultName = `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		const sessionId = this.generateSessionId(name);
		
		// Create a fresh SDK conversation with a structured app-owned session ID
		const conversationId = await this.githubCopilotCliService.createSession(sessionId);

		// Carry over agent and tool overrides from the previous session
		const prevSession = this.getCurrentSession();
		const newSession: CopilotSession = {
			id: sessionId,
			name: name || defaultName,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
			conversationId: conversationId || undefined,
			vaultId: this.vaultId,
			agentName: prevSession?.agentName || this.callbacks.onGetAgentName?.(),
			toolOverrides: prevSession?.toolOverrides ? { ...prevSession.toolOverrides } : undefined,
		};

		this.settings.sessions.push(newSession);
		this.setActiveSession(newSession.id);
		await this.saveSettings();
		console.info("[Torqena TRACE] session:create-new-chat:done", {
			sessionId: newSession.id,
			sessionName: newSession.name,
			conversationId: newSession.conversationId ?? null,
			agentName: newSession.agentName ?? null,
		});
		
		// Notify view to update UI
		this.callbacks.onHeaderUpdate();
		this.callbacks.onSessionCreated();
		this.callbacks.onSessionPanelHide();
	}

	/**
	 * Full session reset — clears conversation, context, agent, and tools.
	 * Use when the model seems confused or stuck on stale context.
	 */
	async createNewSession(name?: string): Promise<void> {
		console.info("[Torqena TRACE] session:create-new-session:start", {
			activeSessionId: this.getActiveSessionId(),
			requestedName: name ?? null,
		});
		// Save current session before creating new one
		await this.saveCurrentSession();
		// Clear the current timeline immediately so New Session feels instantaneous.
		this.callbacks.onClearUI();
		this.callbacks.onShowWelcome();

		// Reset agent through callback
		this.callbacks.onAgentReset();

		// Create new session
		const now = Date.now();
		const defaultName = `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		const sessionId = this.generateSessionId(name);
		
		// Create a fresh SDK conversation with a structured app-owned session ID
		const conversationId = await this.githubCopilotCliService.createSession(sessionId);
		
		const newSession: CopilotSession = {
			id: sessionId,
			name: name || defaultName,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
			conversationId: conversationId || undefined,
			vaultId: this.vaultId,
		};

		this.settings.sessions.push(newSession);
		this.setActiveSession(newSession.id);
		await this.saveSettings();
		console.info("[Torqena TRACE] session:create-new-session:done", {
			sessionId: newSession.id,
			sessionName: newSession.name,
			conversationId: newSession.conversationId ?? null,
		});
		
		// Notify view to update UI
		this.callbacks.onHeaderUpdate();
		this.callbacks.onSessionCreated();
		this.callbacks.onSessionPanelHide();
	}

	/**
	 * Load a session by its data.
	 *
	 * Uses the session's `conversationId` to resume the correct SDK conversation.
	 * If the session has no conversation yet, creates a fresh one and links it.
	 */
	async loadSession(session: CopilotSession): Promise<void> {
		console.info("[Torqena TRACE] session:load:start", {
			sessionId: session.id,
			sessionName: session.name,
			conversationId: session.conversationId ?? null,
			messageCount: session.messages?.length ?? 0,
		});
		// Save current session first
		await this.saveCurrentSession();

		// Update active session
		this.setActiveSession(session.id);
		session.lastUsedAt = Date.now();
		await this.saveSettings();

		// Load the SDK conversation backing this session
		if (session.conversationId) {
			try {
				await this.githubCopilotCliService.loadSession(session.conversationId, session.messages || []);
			} catch (loadErr) {
				// Conversation expired server-side — create a fresh one
				console.warn(`[VC] Failed to load conversation ${session.conversationId}, creating new:`, loadErr);
				const freshConvId = await this.githubCopilotCliService.createSession(session.id);
				if (freshConvId) {
					session.conversationId = freshConvId;
					await this.saveSettings();
				}
				// Restore local history so the model has context on the next send
				if (session.messages?.length) {
					const serviceWithHistory = this.githubCopilotCliService as unknown as {
						messageHistory: ChatMessage[];
						sessionRecreated: boolean;
					};
					serviceWithHistory.messageHistory = session.messages.map((msg: ChatMessage) => ({
						...msg, timestamp: new Date(msg.timestamp),
					}));
					serviceWithHistory.sessionRecreated = true;
				}
			}
		} else {
			// No conversation yet — create one and link it
			const convId = await this.githubCopilotCliService.createSession(session.id);
			if (convId) {
				session.conversationId = convId;
				await this.saveSettings();
			}
			if (session.messages?.length) {
				// Restore local message history for display
				const serviceWithHistory = this.githubCopilotCliService as unknown as {
					messageHistory: ChatMessage[];
					sessionRecreated: boolean;
				};
				serviceWithHistory.messageHistory = session.messages.map((msg: ChatMessage) => ({
					...msg, timestamp: new Date(msg.timestamp),
				}));
				serviceWithHistory.sessionRecreated = true;
			}
		}

		// Restore agent from the loaded session
		if (this.callbacks.onAgentRestore) {
			const fallbackLastSelected = (
				this.settings as BasicCopilotPluginSettings & { lastSelectedAgent?: string }
			).lastSelectedAgent;
			this.callbacks.onAgentRestore(session.agentName || fallbackLastSelected);
		}

		// Notify view to update UI
		this.callbacks.onClearUI();
		await this.callbacks.onLoadMessages();

		if (this.githubCopilotCliService.getMessageHistory().length === 0) {
			this.callbacks.onShowWelcome();
		}

		this.callbacks.onHeaderUpdate();
		this.callbacks.onSessionPanelHide();
		this.callbacks.onSessionLoaded();
		console.info("[Torqena TRACE] session:load:done", {
			sessionId: session.id,
			conversationId: session.conversationId ?? null,
			historyCount: this.githubCopilotCliService.getMessageHistory().length,
		});
	}

	/**
	 * Save the current session's messages and backfill conversationId if needed.
	 */
	async saveCurrentSession(sessionId?: string): Promise<void> {
		const activeSessionId = sessionId ?? this.getActiveSessionId();
		if (activeSessionId) {
			const session = this.getSessionById(activeSessionId);
			if (session) {
				session.messages = this.githubCopilotCliService.getMessageHistory();
				session.lastUsedAt = Date.now();
				// Save the active agent name so it can be restored
				if (this.callbacks.onGetAgentName) {
					session.agentName = this.callbacks.onGetAgentName() || undefined;
				}
				// Backfill conversationId for sessions that pre-date this field
				if (!session.conversationId) {
					const sdkId = this.githubCopilotCliService.getSessionId();
					if (sdkId) {
						session.conversationId = sdkId;
						console.log("[SessionManager] ✅ Backfilled conversationId:", sdkId, "for session:", activeSessionId);
					} else {
						console.warn("[SessionManager] ⚠️ Missing conversationId on save - SDK session may not be created yet");
					}
				}
				await this.saveSettings();
				console.info("[Torqena TRACE] session:save", {
					sessionId: activeSessionId,
					sessionName: session.name,
					messageCount: session.messages.length,
					conversationId: session.conversationId ?? null,
				});
			}
		}
	}

	/**
	 * Ensure a session exists in our tracking system before sending messages.
	 *
	 * Links the current SDK conversation (if any) as the session's `conversationId`.
	 */
	async ensureSessionExists(taskHint?: string): Promise<void> {
		// If there's already an active session, we're good
		const currentId = this.getActiveSessionId();
		if (currentId) {
			const existingSession = this.getSessionById(currentId);
			if (existingSession) {
				// Backfill conversationId if session pre-dates this field
				if (!existingSession.conversationId) {
					const sdkId = this.githubCopilotCliService.getSessionId();
					if (sdkId) {
						existingSession.conversationId = sdkId;
						await this.saveSettings();
						console.log("[SessionManager] ✅ Backfilled conversationId:", sdkId, "for existing session:", existingSession.id);
					} else {
						console.warn("[SessionManager] ⚠️ Missing conversationId - SDK session not ready yet");
					}
				}
				console.info("[Torqena TRACE] session:ensure-existing", {
					sessionId: existingSession.id,
					sessionName: existingSession.name,
					conversationId: existingSession.conversationId ?? null,
				});
				return;
			}
		}

		// Create a new session with a local ID and link the SDK conversation
		const now = Date.now();
		const defaultName = `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		const sessionId = this.generateSessionId(taskHint);
		const conversationId = this.githubCopilotCliService.getSessionId() || undefined;
		
		const newSession: CopilotSession = {
			id: sessionId,
			name: defaultName,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
			conversationId,
			vaultId: this.vaultId,
		};

		this.settings.sessions.push(newSession);
		this.setActiveSession(newSession.id);
		await this.saveSettings();
		
		this.callbacks.onHeaderUpdate();
		console.log("[SessionManager] ✅ Created new session:", newSession.name, "conversationId:", conversationId ?? "(missing - will backfill)");
		console.info("[Torqena TRACE] session:ensure-created", {
			sessionId: newSession.id,
			sessionName: newSession.name,
			conversationId: newSession.conversationId ?? null,
			taskHint: taskHint ?? null,
		});
	}

	/**
	 * Auto-rename session based on first user message
	 */
	async autoRenameSessionFromFirstMessage(firstMessage: string, sessionPanelRender?: () => void): Promise<void> {
		const currentSession = this.getCurrentSession();
		
		if (!currentSession) {
			console.log("[VC] No current session found for auto-rename");
			return;
		}
		
		// Only rename if this appears to be the default auto-generated name
		// (starts with "Chat " followed by a time)
		if (!currentSession.name.startsWith("Chat ")) {
			console.log("[VC] Session already has custom name:", currentSession.name);
			return;
		}
		
		// Check if this is the first user message by counting user messages
		const messageHistory = this.githubCopilotCliService.getMessageHistory();
		const userMessageCount = messageHistory.filter((m: ChatMessage) => m.role === "user").length;
		console.log("[VC] User message count:", userMessageCount, "Total messages:", messageHistory.length);
		
		if (userMessageCount !== 1) {
			console.log("[VC] Not first user message, skipping rename");
			return;
		}
		
		// Generate a concise title from the first message
		const title = this.generateSessionTitle(firstMessage);
		console.log("[VC] Renaming session to:", title);
		
		// Update session name
		currentSession.name = title;
		await this.saveSettings();
		
		// Update UI
		this.callbacks.onHeaderUpdate();
		if (sessionPanelRender) {
			sessionPanelRender();
		}
	}
	
	/**
	 * Generate a concise session title from a message (max ~50 chars)
	 */
	generateSessionTitle(message: string): string {
		// Remove slash commands prefix if any
		let cleaned = message.replace(/^\/\w+\s*/, "").trim();
		
		// Remove common prefixes
		cleaned = cleaned.replace(/^(can you|could you|please|would you|help me|i want to|i need to)\s+/i, "");
		
		// Capitalize first letter
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
		
		// Truncate if too long (keep first ~47 chars + "...")
		if (cleaned.length > 50) {
			cleaned = cleaned.substring(0, 47).trim() + "...";
		}
		
		return cleaned;
	}

	private setActiveSession(sessionId: string): void {
		this.activeSessionId = sessionId;
		this.settings.activeSessionId = sessionId;
	}

	private generateSessionId(taskHint?: string): string {
		const userId = this.resolveUserId();
		const taskId = this.deriveTaskId(taskHint);
		const timestamp = this.nextTimestamp();
		return `${userId}-${taskId}-${timestamp}`;
	}

	private nextTimestamp(): number {
		const now = Date.now();
		const timestamp = now <= this.lastGeneratedTimestamp
			? this.lastGeneratedTimestamp + 1
			: now;
		this.lastGeneratedTimestamp = timestamp;
		return timestamp;
	}

	private resolveUserId(): string {
		const settingsWithIdentity = this.settings as BasicCopilotPluginSettings & {
			userName?: string;
			githubUsername?: string;
			anonymousId?: string;
		};
		const rawUserId = settingsWithIdentity.userName
			|| settingsWithIdentity.githubUsername
			|| settingsWithIdentity.anonymousId;
		return this.slugifyToken(rawUserId, "anon", 32);
	}

	private deriveTaskId(taskHint?: string): string {
		if (!taskHint) return "new-chat";
		let cleaned = taskHint.replace(/^\/\w+\s*/, "").trim();
		cleaned = cleaned.replace(/^(can you|could you|please|would you|help me|i want to|i need to)\s+/i, "");
		return this.slugifyToken(cleaned, "new-chat", 40);
	}

	private slugifyToken(input: string | undefined, fallback: string, maxLength: number): string {
		if (!input) return fallback;
		const ascii = input
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^\x00-\x7F]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
		if (!ascii) return fallback;
		if (ascii.length <= maxLength) return ascii;
		return ascii.slice(0, maxLength).replace(/-+$/g, "") || fallback;
	}
}
