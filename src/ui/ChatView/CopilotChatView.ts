// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module CopilotChatView
 * @description Main chat view component for Vault Copilot.
 *
 * This is the primary user interface for AI-powered chat, displayed as an
 * Obsidian ItemView in the right sidebar. It integrates all chat functionality
 * including message rendering, voice input, session management, and tool execution.
 *
 * ## Features
 *
 * - **Chat Interface**: Message input, streaming responses, markdown rendering
 * - **Session Management**: Save, restore, and archive chat sessions
 * - **Voice Input**: Whisper-based voice transcription
 * - **Realtime Agent**: Live voice conversation with tool execution
 * - **Context Awareness**: Attach notes for context, inline @-mentions
 * - **Tool Execution**: Visual feedback for AI tool calls
 * - **Prompt Library**: Quick access to saved prompts
 *
 * ## Architecture
 *
 * ```
 * CopilotChatView (ItemView)
 *   ├── SessionPanel (sidebar)
 *   ├── AgentSelector (toolbar)
 *   ├── PromptPicker (toolbar)
 *   ├── ContextPicker (toolbar)
 *   ├── MessagesContainer (main area)
 *   │    └── MessageRenderer
 *   ├── InputArea (bottom)
 *   │    ├── VoiceButton
 *   │    └── SendButton
 *   └── VoiceChatService / RealtimeAgentService
 * ```
 *
 * ## View Registration
 *
 * ```typescript
 * this.registerView(
 *   COPILOT_VIEW_TYPE,
 *   (leaf) => new CopilotChatView(leaf, this)
 * );
 * ```
 *
 * @see {@link SessionManager} for session state management
 * @see {@link MessageRenderer} for message display
 * @see {@link VoiceChatService} for voice input
 * @since 0.0.1
 */

import { ItemView, WorkspaceLeaf, Notice, TFile, setIcon, Menu } from "obsidian";
import { GitHubCopilotCliService, ChatMessage } from "../../copilot/providers/GitHubCopilotCliService";
import CopilotPlugin from "../../main";
import { getAvailableModels, getModelDisplayName, CopilotSession, VoiceConversation, VoiceMessage, getVoiceServiceConfigFromProfile, getProfileById, OpenAIProviderProfile, AzureOpenAIProviderProfile, getOpenAIProfileApiKey, getAzureProfileApiKey, getLegacyOpenAIKey } from "../../ui/settings";
import { SessionPanel } from "./SessionPanel";
import { CachedAgentInfo } from "../../copilot/customization/AgentCache";
import { CachedPromptInfo } from "../../copilot/customization/PromptCache";
import { ToolCatalog } from "../../copilot/tools/ToolCatalog";
import { ToolPickerModal } from "./modals/ToolPickerModal";
import { PromptInputModal, parseInputVariables } from "./modals/PromptInputModal";
import { 
	McpAppContainer,
	UIResourceContent,
	ToolCallResult
} from "../mcp-apps";
import { SLASH_COMMANDS } from "./SlashCommands";
import { NoteSuggestModal } from "./modals/NoteSuggestModal";
import { renderWelcomeMessage } from "./renderers/WelcomeMessage";
import { PromptPicker } from "./pickers/PromptPicker";
import { ContextPicker } from "./pickers/ContextPicker";
import { PromptProcessor } from "./PromptProcessor";
import { MessageRenderer, UsedReference } from "./renderers/MessageRenderer";
import { SessionManager } from "./SessionManager";
import { ToolExecutionRenderer } from "./renderers/ToolExecutionRenderer";
import { openTracingPopout } from "./modals/TracingModal";
import { openVoiceHistoryPopout } from "./modals/ConversationHistoryModal";
import { VoiceChatService, RecordingState, MainVaultAssistant, RealtimeAgentState, RealtimeHistoryItem, ToolApprovalRequest } from "../../copilot/voice-chat";
import { AIProvider } from "../../copilot/providers/AIProvider";
import { getSecretValue } from "../../utils/secrets";
import { getTracingService } from "../../copilot/TracingService";

export const COPILOT_VIEW_TYPE = "copilot-chat-view";

export class CopilotChatView extends ItemView {
	public plugin: CopilotPlugin;
	private githubCopilotCliService: GitHubCopilotCliService;
	private messagesContainer: HTMLElement;
	private inputArea: HTMLElement | null = null;
	private inputEl: HTMLDivElement;  // contenteditable div for inline chips
	private sendButton: HTMLButtonElement;
	private isProcessing = false;
	private currentStreamingMessageEl: HTMLElement | null = null;
	private attachedNotes: TFile[] = [];  // From "Add Context..." button
	private attachmentsContainer: HTMLElement | null = null;
	private sessionPanel: SessionPanel | null = null;
	private sessionPanelEl: HTMLElement | null = null;
	private mainViewEl: HTMLElement | null = null;
	private sessionPanelVisible = false;
	private resizerEl: HTMLElement | null = null;
	private sessionToggleBtnEl: HTMLElement | null = null;
	private isResizing = false;
	private selectedAgent: CachedAgentInfo | null = null;
	private agentSelectorEl: HTMLButtonElement | null = null;
	private agentCacheUnsubscribe: (() => void) | null = null;
	private promptPickerEl: HTMLElement | null = null;
	private promptCacheUnsubscribe: (() => void) | null = null;
	private promptPicker: PromptPicker | null = null;
	private contextPickerEl: HTMLElement | null = null;
	private contextPicker: ContextPicker | null = null;
	private toolSelectorEl: HTMLButtonElement | null = null;
	private modelSelectorEl: HTMLButtonElement | null = null;
	private toolCatalog: ToolCatalog | null = null;
	private promptProcessor: PromptProcessor;
	private messageRenderer: MessageRenderer;
	private sessionManager: SessionManager;
	private toolExecutionRenderer: ToolExecutionRenderer;
	
	// Voice chat
	private voiceChatService: VoiceChatService | null = null;
	private voiceBtn: HTMLButtonElement | null = null;
	private voiceStopBtn: HTMLButtonElement | null = null;
	private voiceStateUnsubscribe: (() => void) | null = null;
	private toolbarRightEl: HTMLDivElement | null = null;
	
	// Realtime agent
	private realtimeAgentService: MainVaultAssistant | null = null;
	private agentBtn: HTMLButtonElement | null = null;
	private agentMuteBtn: HTMLButtonElement | null = null;
	private realtimeAgentUnsubscribes: (() => void)[] = [];
	private pendingToolApproval: ToolApprovalRequest | null = null;
	private toolApprovalEl: HTMLElement | null = null;
	private currentVoiceConversationId: string | null = null;
	
	// Thinking indicator
	private thinkingIndicatorEl: HTMLElement | null = null;
	
	// Input history for up/down arrow navigation
	private inputHistory: string[] = [];
	private historyIndex = -1;  // -1 means not navigating history
	private savedCurrentInput = '';  // Save current input when navigating

	constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin, githubCopilotCliService: GitHubCopilotCliService | null) {
		super(leaf);
		this.plugin = plugin;
		this.githubCopilotCliService = githubCopilotCliService as GitHubCopilotCliService; // Type assertion for backward compatibility
		this.toolCatalog = new ToolCatalog(plugin.skillRegistry, plugin.mcpManager);
		this.promptProcessor = new PromptProcessor(plugin.app);
		this.messageRenderer = new MessageRenderer(plugin.app, this);
		
		// Initialize SessionManager with callbacks
		// Use getActiveService() to get the appropriate provider (Copilot, OpenAI, or Azure)
		const activeService = this.getActiveAIService();
		this.sessionManager = new SessionManager(
			plugin.settings,
			activeService as GitHubCopilotCliService, // SessionManager expects CopilotService but works with any AIProvider
			() => plugin.saveSettings(),
			{
				onSessionCreated: () => {
					// Clear input box and attachments
					if (this.inputEl) {
						this.inputEl.innerHTML = "";
						this.autoResizeInput();
					}
					this.attachedNotes = [];
					// Clear input history for new session
					this.inputHistory = [];
					this.historyIndex = -1;
				},
				onSessionLoaded: () => {
					// Clear input history when switching sessions
					this.inputHistory = [];
					this.historyIndex = -1;
				},
				onHeaderUpdate: () => this.updateHeaderTitle(),
				onSessionPanelHide: () => {
					if (this.sessionPanelVisible) {
						this.toggleSessionPanel();
					}
				},
				onAgentReset: async () => {
					// Refresh agent cache to pick up any new agents
					await this.plugin.agentCache.refreshCache();
					this.selectedAgent = null;
					this.updateAgentSelectorText();
				},
				onClearUI: () => this.messagesContainer.empty(),
				onLoadMessages: () => this.loadMessages(),
				onShowWelcome: () => this.addWelcomeMessage(),
			}
		);
		
		// Initialize ToolExecutionRenderer with tool execution callback
		this.toolExecutionRenderer = new ToolExecutionRenderer(
			this,
			(toolName, args) => this.executeTool(toolName, args)
		);
		
		// Initialize VoiceChatService with settings
		const voiceSettings = this.plugin.settings.voice || {
			backend: 'openai-whisper',
			whisperServerUrl: 'http://127.0.0.1:8080',
			language: 'en-US',
			audioDeviceId: undefined,
		};
		
		// Get configuration from selected profile
		const voiceProfileId = this.plugin.settings.voiceInputProfileId;
		const voiceProfile = getProfileById(this.plugin.settings, voiceProfileId);
		const profileConfig = getVoiceServiceConfigFromProfile(
			this.plugin.settings,
			voiceProfileId
		);

		// Resolve API keys from SecretStorage (with legacy/env fallbacks)
		const openaiSettings = this.plugin.settings.openai;
		let profileOpenAiKey: string | undefined;
		if (voiceProfile?.type === 'openai') {
			profileOpenAiKey = getOpenAIProfileApiKey(this.app, voiceProfile as OpenAIProviderProfile);
		} else if (profileConfig?.openaiApiKeySecretId) {
			profileOpenAiKey = getSecretValue(this.app, profileConfig.openaiApiKeySecretId);
		}
		const legacyOpenAiKey = getLegacyOpenAIKey(this.app, this.plugin.settings);
		const resolvedOpenAiKey = profileOpenAiKey || legacyOpenAiKey;

		let resolvedAzureKey: string | undefined;
		if (voiceProfile?.type === 'azure-openai') {
			resolvedAzureKey = getAzureProfileApiKey(this.app, voiceProfile as AzureOpenAIProviderProfile);
		} else if (profileConfig?.azureApiKeySecretId) {
			resolvedAzureKey = getSecretValue(this.app, profileConfig.azureApiKeySecretId);
		}
		if (!resolvedAzureKey && typeof process !== "undefined" && process.env) {
			resolvedAzureKey = process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
		}

		// Fallback to inline settings if no profile selected (backwards compatibility)
		this.voiceChatService = new VoiceChatService({
			backend: profileConfig?.backend || voiceSettings.backend,
			whisperServerUrl: profileConfig?.whisperServerUrl || voiceSettings.whisperServerUrl,
			language: voiceSettings.language,
			openaiApiKey: resolvedOpenAiKey,
			openaiBaseUrl: profileConfig?.openaiBaseUrl || openaiSettings?.baseURL || undefined,
			azureApiKey: resolvedAzureKey,
			azureEndpoint: profileConfig?.azureEndpoint || voiceSettings.azure?.endpoint || undefined,
			azureDeploymentName: profileConfig?.azureDeploymentName || voiceSettings.azure?.deploymentName || undefined,
			azureApiVersion: profileConfig?.azureApiVersion || voiceSettings.azure?.apiVersion || undefined,
			audioDeviceId: voiceSettings.audioDeviceId,
		});
	}

	/**
	 * Get the active AI service (Copilot, OpenAI, or Azure)
	 * Ensures the appropriate service is initialized based on settings
	 */
	private getActiveAIService(): GitHubCopilotCliService | AIProvider {
		// Initialize services on demand if not already initialized
		const activeService = this.plugin.getActiveService();
		
		if (activeService) {
			return activeService as GitHubCopilotCliService;
		}
		
		// Fallback: if no service is active, ensure we have at least a copilot service reference
		// This maintains backward compatibility
		if (this.githubCopilotCliService) {
			return this.githubCopilotCliService;
		}
		
		// This should not happen in normal operation, but provides a safe fallback
		throw new Error("No AI service is configured. Please configure an API key in settings.");
	}

	getViewType(): string {
		return COPILOT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Vault Copilot";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass("vc-chat-container");

		// Create a wrapper for the layout (main view + session panel on right)
		const layoutWrapper = container.createDiv({ cls: "vc-layout-wrapper" });

		// Main view wrapper (comes first, on left)
		this.mainViewEl = layoutWrapper.createDiv({ cls: "vc-main-view" });

		// Resizer handle (hidden by default, shown when panel visible)
		this.resizerEl = layoutWrapper.createDiv({ cls: "vc-resizer" });
		this.resizerEl.style.display = "none";
		this.setupResizer();

		// Session panel on right (hidden by default)
		this.sessionPanelEl = layoutWrapper.createDiv({ cls: "vc-session-panel-wrapper" });
		this.sessionPanelEl.style.display = "none";
		this.sessionPanel = new SessionPanel(this.plugin, this.sessionPanelEl, {
			onSessionSelect: (session) => this.loadSession(session),
			onNewSession: () => this.createNewSession(),
			onClose: () => this.toggleSessionPanel(),
		});

		// Header toolbar
		const header = this.mainViewEl.createDiv({ cls: "vc-chat-header" });
		
		// Session name on the left
		const sessionTitle = header.createDiv({ cls: "vc-header-title" });
		sessionTitle.setText(this.getCurrentSessionName());
		
		// Right side buttons container
		const headerActions = header.createDiv({ cls: "vc-header-actions" });
		
		// New session button (plus icon)
		const newSessionBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "New session" }
		});
		setIcon(newSessionBtn, "plus");
		newSessionBtn.addEventListener("click", () => this.createNewSession());

		// Settings menu button (gear icon)
		const settingsMenuBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "Settings menu" }
		});
		setIcon(settingsMenuBtn, "settings");
		settingsMenuBtn.addEventListener("click", (e) => this.showSettingsMenu(e));
		
		// Session toggle button
		this.sessionToggleBtnEl = headerActions.createEl("button", {
			cls: "vc-header-btn vc-session-toggle-btn",
			attr: { "aria-label": "Toggle sessions" }
		});
		// Sidebar/panel toggle icon
		setIcon(this.sessionToggleBtnEl, "panel-right");
		this.sessionToggleBtnEl.addEventListener("click", () => this.toggleSessionPanel());

		// Messages container
		this.messagesContainer = this.mainViewEl.createDiv({ cls: "vc-messages" });

		// Input area
		this.inputArea = this.mainViewEl.createDiv({ cls: "vc-input-area" });
		const inputArea = this.inputArea;

		// Main input wrapper (the box)
		const inputWrapper = inputArea.createDiv({ cls: "vc-input-wrapper" });
		
		// Context row - Add Context button and attachment chips in a row
		const contextRow = inputWrapper.createDiv({ cls: "vc-context-row" });
		
		const addContextBtn = contextRow.createEl("button", { 
			cls: "vc-add-context",
			attr: { "aria-label": "Add context from notes" }
		});
		addContextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg><span>Add Context...</span>`;
		addContextBtn.addEventListener("click", () => this.openNotePicker());
		
		// Attachments container next to Add Context button (for "Add Context..." chips)
		this.attachmentsContainer = contextRow.createDiv({ cls: "vc-attachments" });
		
		// Contenteditable div for mixed text and inline chips
		this.inputEl = inputWrapper.createDiv({
			cls: "vc-input",
			attr: { 
				contenteditable: "true",
				"data-placeholder": "Ask Vault Copilot anything or type / for prompts"
			}
		}) as HTMLDivElement;
		
		// Context picker dropdown (hidden by default, shown when user types #)
		this.contextPickerEl = inputWrapper.createDiv({ cls: "vc-context-picker" });
		this.contextPickerEl.style.display = "none";
		
		// Prompt picker dropdown (hidden by default, shown when user types /)
		this.promptPickerEl = inputWrapper.createDiv({ cls: "vc-prompt-picker" });
		this.promptPickerEl.style.display = "none";
		
		// Subscribe to prompt cache changes
		this.promptCacheUnsubscribe = this.plugin.promptCache.onCacheChange(() => {
			// If picker is visible, refresh the list
			if (this.promptPicker?.isVisible()) {
				this.promptPicker.update(this.inputEl.innerText || "");
			}
		});

		// Bottom toolbar inside the input box
		const inputToolbar = inputWrapper.createDiv({ cls: "vc-input-toolbar" });
		
		// Left side icons
		const toolbarLeft = inputToolbar.createDiv({ cls: "vc-toolbar-left" });

		// Brain icon button (left of agent selector)
		const brainIconBtn = toolbarLeft.createEl("button", {
			cls: "vc-brain-icon-btn",
			attr: { "aria-label": "AI Assistant" }
		});
		brainIconBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>`;

		// Agent selector button
		this.agentSelectorEl = toolbarLeft.createEl("button", { 
			cls: "vc-agent-selector",
			attr: { "aria-label": "Select agent" }
		});
		this.updateAgentSelectorText();

		// Subscribe to agent cache changes to refresh the dropdown
		this.agentCacheUnsubscribe = this.plugin.agentCache.onCacheChange((event) => {
			// When cache is reloaded (e.g., new directory added), check if selected agent still exists
			if (event.type === 'loaded') {
				if (this.selectedAgent) {
					// Check if the selected agent is still in the new list
					const stillExists = event.agents.some(a => a.path === this.selectedAgent?.path);
					if (!stillExists) {
						this.selectedAgent = null;
						this.updateAgentSelectorText();
					}
				}
			}
			// If selected agent was removed, reset selection
			else if (event.type === 'removed' && this.selectedAgent?.path === event.path) {
				this.selectedAgent = null;
				this.updateAgentSelectorText();
			}
			// If selected agent was updated, refresh its info
			else if (event.type === 'updated' && this.selectedAgent?.path === event.agent.path) {
				this.selectedAgent = event.agent;
				this.updateAgentSelectorText();
			}
		});
		
		this.agentSelectorEl.addEventListener("click", (e) => {
			const menu = new Menu();
			
			// Default option (no agent)
			menu.addItem((item) => {
				item.setTitle("Default")
					.onClick(() => {
						this.selectedAgent = null;
						this.updateAgentSelectorText();
					});
				if (this.selectedAgent === null) {
					item.setChecked(true);
				}
			});
			
			// Get agents from the plugin's cache (already loaded)
			const agents = this.plugin.agentCache.getAgents();
			
			if (agents.length > 0) {
				menu.addSeparator();
				
				for (const agent of agents) {
					menu.addItem((item) => {
						item.setTitle(agent.name)
							.onClick(() => {
								this.selectedAgent = agent;
								this.updateAgentSelectorText();
							});
						if (this.selectedAgent?.name === agent.name) {
							item.setChecked(true);
						}
						// Add description as tooltip-like text
						const itemEl = (item as any).dom as HTMLElement;
						if (agent.description) {
							const descSpan = itemEl.createSpan({ cls: "vc-agent-desc", text: agent.description });
							itemEl.appendChild(descSpan);
						}
					});
				}
			} else if (this.plugin.settings.agentDirectories.length === 0) {
				menu.addItem((item) => {
					item.setTitle("No agent directories configured")
						.setDisabled(true);
				});
			} else {
				menu.addItem((item) => {
					item.setTitle("No agents found")
						.setDisabled(true);
				});
			}
			
			menu.showAtMouseEvent(e as MouseEvent);
		});

		// Model selector button
		this.modelSelectorEl = toolbarLeft.createEl("button", { 
			cls: "vc-model-selector",
			attr: { "aria-label": "Select model" }
		});
		this.updateModelSelectorText();
		
		this.modelSelectorEl.addEventListener("click", (e) => {
			const menu = new Menu();
			const models = getAvailableModels(this.plugin.settings);
			
			// Group models by prefix for better organization
			const currentModel = this.plugin.settings.model;
			
			for (const modelId of models) {
				menu.addItem((item) => {
					item.setTitle(getModelDisplayName(modelId))
						.onClick(async () => {
							this.plugin.settings.model = modelId;
							await this.plugin.saveSettings();
							this.githubCopilotCliService.updateConfig({ model: modelId });
							this.updateModelSelectorText();
						});
					if (currentModel === modelId) {
						item.setChecked(true);
					}
				});
			}
			
			menu.showAtMouseEvent(e as MouseEvent);
		});

		// Tools selector button
		this.toolSelectorEl = toolbarLeft.createEl("button", { 
			cls: "vc-tool-selector",
			attr: { "aria-label": "Select tools" }
		});
		this.updateToolSelectorText();
		
		this.toolSelectorEl.addEventListener("click", () => this.openToolPicker());
		
		// Right side icons
		this.toolbarRightEl = inputToolbar.createDiv({ cls: "vc-toolbar-right" });
		
		// Create voice/agent buttons based on current settings
		this.createVoiceToolbarButtons();

		// Send button
		this.sendButton = this.toolbarRightEl.createEl("button", { 
			cls: "vc-send-btn",
			attr: { "aria-label": "Send message (Enter or Ctrl-Alt-Enter)" }
		});
		this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;

		// Event listeners
		this.inputEl.addEventListener("keydown", (e) => {
			// Handle context picker navigation (for #)
			if (this.contextPicker?.handleKeyDown(e)) {
				return;
			}
			
			// Handle prompt picker navigation
			if (this.promptPicker?.handleKeyDown(e)) {
				return;
			}
			
			// Handle up/down arrow for input history navigation
			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				// Only navigate history if input is empty or already navigating
				const currentText = this.inputEl.textContent || '';
				const isEmpty = currentText.trim() === '';
				const isNavigating = this.historyIndex >= 0;
				
				if (this.inputHistory.length > 0 && (isEmpty || isNavigating)) {
					e.preventDefault();
					this.navigateHistory(e.key === "ArrowUp" ? 'up' : 'down');
					return;
				}
			}
			
			if (e.key === "Enter" && (!e.shiftKey || (e.ctrlKey && e.altKey))) {
				// Check if prompt was just selected - if so, don't auto-submit
				if (this.promptPicker?.checkAndClearJustSelected()) {
					return;
				}
				e.preventDefault();
				this.sendMessage();
			}
			
			// Reset history navigation on other key input
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && !e.ctrlKey && !e.metaKey) {
				this.historyIndex = -1;
			}
		});

		this.inputEl.addEventListener("input", () => {
			this.autoResizeInput();
			this.promptPicker?.handleInput();
			this.contextPicker?.handleInput();
		});

		// Initialize pickers after textarea is created
		if (this.promptPickerEl) {
			this.promptPicker = new PromptPicker({
				containerEl: this.promptPickerEl,
				inputEl: this.inputEl,
				getPrompts: () => this.plugin.promptCache.getPrompts(),
				onSelect: (prompt) => this.executePrompt(prompt),
			});
		}

		if (this.contextPickerEl) {
			this.contextPicker = new ContextPicker({
				containerEl: this.contextPickerEl,
				inputEl: this.inputEl,
				getFiles: () => this.app.vault.getMarkdownFiles(),
				onSelect: (file) => this.insertInlineChip(file),
			});
		}

		this.sendButton.addEventListener("click", () => this.handleSendOrCancel());

		// Load existing messages
		await this.loadMessages();

		// Add welcome message if no history
		if (this.githubCopilotCliService.getMessageHistory().length === 0) {
			this.addWelcomeMessage();
		}

		// Auto-start the Copilot service when panel opens
		this.startService();

		// Register keyboard shortcuts
		this.registerKeyboardShortcuts();
	}

	/**
	 * Handle voice input button click
	 */
	private async handleVoiceInput(): Promise<void> {
		if (!this.voiceChatService) {
			console.error('Voice input is not available');
			return;
		}

		const state = this.voiceChatService.getState();
		console.log('VoiceInput: Current state:', state);

		try {
			switch (state) {
				case 'recording':
					await this.voiceChatService.pauseRecording();
					break;
				case 'paused':
					await this.voiceChatService.resumeRecording();
					break;
				case 'idle':
				case 'error':
					await this.voiceChatService.startRecording();
					break;
				case 'processing':
				default:
					// No-op while processing
					break;
			}
		} catch (error) {
			console.error('Voice input action failed:', error);
		}
	}

	/**
	 * Stop recording and transcribe the captured audio
	 */
	private async handleVoiceStop(): Promise<void> {
		if (!this.voiceChatService) {
			console.error('Voice input is not available');
			return;
		}

		const state = this.voiceChatService.getState();
		if (state !== 'recording' && state !== 'paused') {
			console.log('VoiceStop: Ignoring stop, not currently recording');
			return;
		}

		try {
			const result = await this.voiceChatService.stopRecording();
			console.log('VoiceStop: Got result:', result);
			if (result.text) {
				this.insertTextAtCursor(result.text);
			} else {
				console.log('VoiceStop: No text in result');
			}
		} catch (error) {
			console.error('Voice transcription failed:', error);
		}
	}

	/**
	 * Insert text at the current cursor position in the input
	 */
	private insertTextAtCursor(text: string): void {
		console.log('insertTextAtCursor: Inserting text:', text);
		
		// Get existing text and append new text
		const existingText = this.inputEl.textContent || '';
		const newText = existingText ? existingText + ' ' + text : text;
		this.inputEl.textContent = newText;
		
		// Move cursor to end
		const range = document.createRange();
		const selection = window.getSelection();
		range.selectNodeContents(this.inputEl);
		range.collapse(false);
		if (selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}
		
		this.autoResizeInput();
		this.inputEl.focus();
		console.log('insertTextAtCursor: Done, input now contains:', this.inputEl.textContent);
	}

	/**
	 * Create voice/agent toolbar buttons based on current settings.
	 * Should be called once during onOpen and again when settings change.
	 */
	private createVoiceToolbarButtons(): void {
		if (!this.toolbarRightEl) return;

		// Realtime agent button - only shown when enabled in settings
		if (this.plugin.settings.voice?.realtimeAgentEnabled) {
			this.agentBtn = this.toolbarRightEl.createEl("button", { 
				cls: "vc-toolbar-btn vc-agent-btn",
				attr: { "aria-label": "Start voice agent" }
			});
			this.updateAgentButtonState('idle');
			this.agentBtn.addEventListener("click", () => this.handleAgentToggle());
			
			// Mute button for realtime agent - hidden initially, shown when agent is active
			this.agentMuteBtn = this.toolbarRightEl.createEl("button", {
				cls: "vc-toolbar-btn vc-agent-mute-btn",
				attr: { "aria-label": "Mute microphone" }
			});
			this.agentMuteBtn.style.display = "none";
			this.updateAgentMuteButtonState(false);
			this.agentMuteBtn.addEventListener("click", () => this.handleAgentMuteToggle());
			
			// Initialize realtime agent service (if not already created)
			if (!this.realtimeAgentService) {
				this.initRealtimeAgentService();
			}
			
			// Sync button state with current service state
			if (this.realtimeAgentService) {
				this.updateAgentButtonState(this.realtimeAgentService.getState());
			}
		}

		// Voice button - only shown when voice input is enabled in settings
		if (this.plugin.settings.voice?.voiceInputEnabled) {
			this.voiceBtn = this.toolbarRightEl.createEl("button", { 
				cls: "vc-toolbar-btn vc-voice-btn",
				attr: { "aria-label": "Voice input" }
			});
			this.updateVoiceButtonState('idle');
			this.voiceBtn.addEventListener("click", () => this.handleVoiceInput());

			// Stop button appears only while recording/paused
			this.voiceStopBtn = this.toolbarRightEl.createEl("button", {
				cls: "vc-toolbar-btn vc-voice-stop-btn",
				attr: { "aria-label": "Stop recording and transcribe" }
			});
			this.voiceStopBtn.style.display = "none";
			this.voiceStopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`;
			this.voiceStopBtn.addEventListener("click", () => this.handleVoiceStop());
			
			// Subscribe to voice chat state changes
			if (this.voiceChatService) {
				this.voiceStateUnsubscribe = this.voiceChatService.on('stateChange', (state) => {
					this.updateVoiceButtonState(state);
				});
			}
		}
	}

	/**
	 * Refresh the voice/agent toolbar buttons when settings change.
	 * Called from settings panel when it closes.
	 */
	refreshFromSettings(): void {
		// Validate current model is still in available list
		const availableModels = getAvailableModels(this.plugin.settings);
		const firstModel = availableModels[0];
		if (firstModel && !availableModels.includes(this.plugin.settings.model)) {
			// Current model no longer available, switch to first available
			this.plugin.settings.model = firstModel;
			this.plugin.saveSettings();
		}
		
		// Update model selector text
		this.updateModelSelectorText();
		
		// Update copilot service with current model
		this.githubCopilotCliService.updateConfig({ model: this.plugin.settings.model });
		
		// Refresh voice toolbar
		this.refreshVoiceToolbar();
	}

	/**
	 * Update the model selector button text based on current settings.
	 * Hide the selector for Azure OpenAI profiles (which have hardcoded models).
	 */
	private updateModelSelectorText(): void {
		if (!this.modelSelectorEl) return;
		
		// Check if current provider is Azure OpenAI
		const profileId = this.plugin.settings.chatProviderProfileId;
		const profile = getProfileById(this.plugin.settings, profileId);
		
		// Hide model selector for Azure OpenAI (hardcoded models)
		// Show for GitHub Copilot CLI and OpenAI
		if (profile && profile.type === 'azure-openai') {
			this.modelSelectorEl.style.display = 'none';
		} else {
			this.modelSelectorEl.style.display = '';
			const currentModel = this.plugin.settings.model;
			this.modelSelectorEl.textContent = getModelDisplayName(currentModel);
		}
	}

	/**
	 * Refresh the voice/agent toolbar buttons when settings change.
	 */
	private refreshVoiceToolbar(): void {
		if (!this.toolbarRightEl || !this.sendButton) return;

		// Clean up existing voice state subscription
		if (this.voiceStateUnsubscribe) {
			this.voiceStateUnsubscribe();
			this.voiceStateUnsubscribe = null;
		}

		// Remove existing voice and agent buttons (keep send button)
		if (this.agentBtn) {
			this.agentBtn.remove();
			this.agentBtn = null;
		}
		if (this.voiceBtn) {
			this.voiceBtn.remove();
			this.voiceBtn = null;
		}
		if (this.voiceStopBtn) {
			this.voiceStopBtn.remove();
			this.voiceStopBtn = null;
		}

		// Move send button to end temporarily
		const sendButton = this.sendButton;
		sendButton.remove();

		// Recreate voice/agent buttons based on current settings
		this.createVoiceToolbarButtons();

		// Re-add send button at the end
		this.toolbarRightEl.appendChild(sendButton);
	}

	/**
	 * Update the voice button visual state based on recording state
	 */
	private updateVoiceButtonState(state: RecordingState): void {
		if (!this.voiceBtn) return;

		// Remove all state classes
		this.voiceBtn.removeClass('vc-voice-recording', 'vc-voice-processing', 'vc-voice-error', 'vc-voice-paused');

		// Update icon and state
		switch (state) {
			case 'recording':
				this.voiceBtn.addClass('vc-voice-recording');
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Pause recording');
				break;
			case 'paused':
				this.voiceBtn.addClass('vc-voice-paused');
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Resume recording');
				break;
			case 'processing':
				this.voiceBtn.addClass('vc-voice-processing');
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="m4.93 4.93 2.83 2.83"></path><path d="m16.24 16.24 2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="m4.93 19.07 2.83-2.83"></path><path d="m16.24 7.76 2.83-2.83"></path></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Processing...');
				break;
			case 'error':
				this.voiceBtn.addClass('vc-voice-error');
				// Fall through to idle icon
			case 'idle':
			default:
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Voice input');
				break;
		}

		if (this.voiceStopBtn) {
			const showStop = state === 'recording' || state === 'paused' || state === 'processing';
			this.voiceStopBtn.style.display = showStop ? '' : 'none';
			this.voiceStopBtn.disabled = state === 'processing';
		}
	}

	/**
	 * Initialize the realtime agent service with event handlers
	 */
	private initRealtimeAgentService(): void {
		if (this.realtimeAgentService) {
			return;
		}

		// Get API key from selected Realtime Agent profile
		const selectedProfileId = this.plugin.settings.realtimeAgentProfileId;
		const selectedProfile = getProfileById(this.plugin.settings, selectedProfileId);
		
		let apiKey: string | undefined;
		if (selectedProfile && selectedProfile.type === 'openai') {
			// Use API key from selected profile
			const openaiProfile = selectedProfile as OpenAIProviderProfile;
			apiKey = getOpenAIProfileApiKey(this.app, openaiProfile);
		} else {
			// Fallback to legacy settings if no profile selected
			apiKey = getLegacyOpenAIKey(this.app, this.plugin.settings);
		}
		
		if (!apiKey) {
			console.warn('OpenAI API key not configured for realtime agent. Select an OpenAI profile in settings.');
			return;
		}

		// Build supplemental instructions for context
		// MainVaultAssistant loads base instructions from markdown files;
		// we add MCP and language info as supplements
		let supplementalInstructions = '';

		// Add MCP tools info if available
		if (this.plugin.mcpManager?.hasConnectedServers()) {
			const mcpTools = this.plugin.mcpManager.getAllTools();
			const mcpToolCount = mcpTools.length;
			if (mcpToolCount > 0) {
				supplementalInstructions += `\n\nYou also have access to ${mcpToolCount} MCP tools from connected servers:`;
				// Group by server and list tool names
				const byServer = new Map<string, string[]>();
				for (const t of mcpTools) {
					if (!byServer.has(t.serverName)) {
						byServer.set(t.serverName, []);
					}
					byServer.get(t.serverName)!.push(t.tool.name);
				}
				for (const [serverName, toolNames] of byServer) {
					supplementalInstructions += `\n- ${serverName}: ${toolNames.join(', ')}`;
				}
				supplementalInstructions += `\nUse these MCP tools when relevant to the user's questions.`;
			}
		}

		// Get configured language for responses
		const configuredLanguage = this.plugin.settings.voice?.realtimeLanguage || 'en';
		const languageName = this.getLanguageName(configuredLanguage);
		
		// Add language instruction if not English
		if (configuredLanguage && configuredLanguage !== 'en') {
			supplementalInstructions += `\n\nIMPORTANT: Always respond in ${languageName}. The user prefers to communicate in ${languageName}.`;
		}

		// MainVaultAssistant loads base instructions from *.voice-agent.md files
		// and supplements them with the context-specific instructions above
		this.realtimeAgentService = new MainVaultAssistant(this.app, {
			apiKey,
			voice: this.plugin.settings.voice?.realtimeVoice || 'alloy',
			turnDetection: this.plugin.settings.voice?.realtimeTurnDetection || 'server_vad',
			language: configuredLanguage,
			instructions: supplementalInstructions || undefined,
			mcpManager: this.plugin.mcpManager,
			toolConfig: this.plugin.settings.voice?.realtimeToolConfig,
			voiceAgentDirectories: this.plugin.settings.voice?.voiceAgentDirectories,
			voiceAgentFiles: this.plugin.settings.voice?.voiceAgentFiles,
			periodicNotesSettings: this.plugin.settings.periodicNotes,
			timezone: this.plugin.settings.timezone,
			weekStartDay: this.plugin.settings.weekStartDay,
		});

		// Subscribe to state changes
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('stateChange', (state) => {
				console.log(`[UI] stateChange received: ${state}`);
				this.updateAgentButtonState(state);
			})
		);

		// Subscribe to transcript updates - display in chat
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('transcript', (item) => {
				this.handleRealtimeTranscript(item);
			})
		);

		// Subscribe to tool executions
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('toolExecution', (toolName, args, result, agentName) => {
				console.log(`[${agentName}] Tool executed: ${toolName}`, args, result);
			})
		);

		// Subscribe to errors
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('error', (error) => {
				const errorMessage = error instanceof Error 
					? error.message 
					: (typeof error === 'string' ? error : JSON.stringify(error));
				new Notice(`Voice agent error: ${errorMessage}`);
				console.error('[VoiceAgent] Error:', error);
			})
		);

		// Subscribe to tool approval requests
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('toolApprovalRequested', (request) => {
				this.showToolApprovalPrompt(request);
			})
		);

		// Subscribe to history updates for conversation saving
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('historyUpdated', (history) => {
				this.updateCurrentVoiceConversation(history);
			})
		);
		
		// Subscribe to user transcription events (captures user speech)
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('user_transcription', (item) => {
				console.log('[VoiceHistory] User transcription received:', item);
				this.addUserTranscriptionToConversation(item);
			})
		);

		// Subscribe to chat output events (agent wants to display content in chat)
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('chatOutput', (content, sourceAgent) => {
				console.log(`[VoiceAgent] Chat output from ${sourceAgent}:`, content?.substring(0, 100));
				this.handleChatOutput(content, sourceAgent);
			})
		);

		// Subscribe to mute state changes
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('muteChange', (isMuted) => {
				console.log(`[VoiceAgent] Mute state changed: ${isMuted}`);
				this.updateAgentMuteButtonState(isMuted);
			})
		);
	}

	/**
	 * Handle toggle of the realtime agent button
	 */
	private async handleAgentToggle(): Promise<void> {
		if (!this.realtimeAgentService) {
			this.initRealtimeAgentService();
		}

		if (!this.realtimeAgentService) {
			new Notice('Failed to initialize voice agent. Check your OpenAI API key.');
			return;
		}

		const state = this.realtimeAgentService.getState();
		
		if (state === 'idle' || state === 'error') {
			// Start a new conversation
			this.startNewVoiceConversation();
			
			// Start the agent
			try {
				await this.realtimeAgentService.connect();
				
				// Pass the current note content as initial context
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					try {
						const content = await this.app.vault.read(activeFile);
						const truncatedContent = content.length > 6000 
							? content.substring(0, 6000) + '\n\n[Content truncated...]' 
							: content;
						this.realtimeAgentService.sendContext(
							`The user is currently looking at a note called "${activeFile.basename}" (path: ${activeFile.path}). Here is its content:\n\n${truncatedContent}`
						);
					} catch {
						// Fall back to just the name if we can't read
						this.realtimeAgentService.sendContext(
							`The user is currently looking at a note called "${activeFile.basename}" (path: ${activeFile.path}).`
						);
					}
				}

				// Listen for when user opens a different note and share it with the agent
				const fileOpenRef = this.app.workspace.on('file-open', async (file) => {
					if (file && this.realtimeAgentService?.isConnected()) {
						try {
							const content = await this.app.vault.read(file);
							const truncatedContent = content.length > 6000 
								? content.substring(0, 6000) + '\n\n[Content truncated...]' 
								: content;
							this.realtimeAgentService.sendContext(
								`The user switched to a different note called "${file.basename}" (path: ${file.path}). Here is its content:\n\n${truncatedContent}`
							);
							console.log(`[RealtimeAgent] Shared note context: ${file.basename}`);
						} catch (e) {
							console.warn('[RealtimeAgent] Failed to read opened file:', e);
						}
					}
				});
				
				// Store unsubscribe function for cleanup
				this.realtimeAgentUnsubscribes.push(() => {
					this.app.workspace.offref(fileOpenRef);
				});

			} catch (error) {
				new Notice(`Failed to connect voice agent: ${error instanceof Error ? error.message : String(error)}`);
			}
		} else {
			// Save the current conversation before stopping
			this.saveCurrentVoiceConversation();
			// Stop the agent
			this.realtimeAgentService.disconnect();
		}
	}

	/**
	 * Convert a language code to a human-readable name
	 */
	private getLanguageName(code: string): string {
		const languageNames: Record<string, string> = {
			'': 'auto-detected',
			'en': 'English',
			'es': 'Spanish',
			'fr': 'French',
			'de': 'German',
			'it': 'Italian',
			'pt': 'Portuguese',
			'nl': 'Dutch',
			'ja': 'Japanese',
			'ko': 'Korean',
			'zh': 'Chinese',
			'ru': 'Russian',
			'ar': 'Arabic',
			'hi': 'Hindi',
		};
		return languageNames[code] || code;
	}

	/**
	 * Show tool approval prompt in the chat view
	 */
	private showToolApprovalPrompt(request: ToolApprovalRequest): void {
		this.pendingToolApproval = request;
		
		// Remove any existing approval prompt
		if (this.toolApprovalEl) {
			this.toolApprovalEl.remove();
			this.toolApprovalEl = null;
		}
		
		// Create approval prompt element
		this.toolApprovalEl = this.messagesContainer.createDiv({
			cls: 'vc-tool-approval-prompt'
		});
		
		// Header
		const headerEl = this.toolApprovalEl.createDiv({ cls: 'vc-tool-approval-header' });
		headerEl.createSpan({ text: '🔧 Tool Approval Required', cls: 'vc-tool-approval-title' });
		
		// Tool info
		const infoEl = this.toolApprovalEl.createDiv({ cls: 'vc-tool-approval-info' });
		infoEl.createEl('strong', { text: request.toolName });
		
		// Show args summary (truncated)
		const argsObj = request.args as Record<string, unknown> | undefined;
		if (argsObj && Object.keys(argsObj).length > 0) {
			const argsEl = infoEl.createDiv({ cls: 'vc-tool-approval-args' });
			const argsText = JSON.stringify(argsObj, null, 2);
			const truncatedArgs = argsText.length > 200 ? argsText.substring(0, 200) + '...' : argsText;
			argsEl.createEl('pre', { text: truncatedArgs });
		}
		
		// Buttons
		const buttonsEl = this.toolApprovalEl.createDiv({ cls: 'vc-tool-approval-buttons' });
		
		const allowOnceBtn = buttonsEl.createEl('button', { 
			text: 'Allow Once',
			cls: 'vc-tool-approval-btn vc-tool-approval-allow'
		});
		allowOnceBtn.addEventListener('click', () => this.handleToolApproval('once'));
		
		const alwaysAllowBtn = buttonsEl.createEl('button', { 
			text: 'Always Allow',
			cls: 'vc-tool-approval-btn vc-tool-approval-always'
		});
		alwaysAllowBtn.addEventListener('click', () => this.handleToolApproval('always'));
		
		const denyBtn = buttonsEl.createEl('button', { 
			text: 'Deny',
			cls: 'vc-tool-approval-btn vc-tool-approval-deny'
		});
		denyBtn.addEventListener('click', () => this.handleToolApproval('deny'));
		
		// Scroll to show the approval prompt
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	/**
	 * Handle tool approval decision
	 */
	private handleToolApproval(decision: 'once' | 'always' | 'deny'): void {
		if (!this.pendingToolApproval || !this.realtimeAgentService) {
			return;
		}
		
		const request = this.pendingToolApproval;
		
		if (decision === 'deny') {
			this.realtimeAgentService.rejectTool(request);
			new Notice(`Denied tool: ${request.toolName}`);
		} else {
			if (decision === 'always') {
				this.realtimeAgentService.approveToolForSession(request);
			} else {
				this.realtimeAgentService.approveTool(request);
			}
			new Notice(`Allowed tool: ${request.toolName}${decision === 'always' ? ' (for session)' : ''}`);
		}
		
		// Clean up
		this.pendingToolApproval = null;
		if (this.toolApprovalEl) {
			this.toolApprovalEl.remove();
			this.toolApprovalEl = null;
		}
	}

	/**
	 * Start a new voice conversation
	 */
	private startNewVoiceConversation(): void {
		const id = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const now = Date.now();
		
		// Create the conversation in settings
		if (!this.plugin.settings.voice) {
			this.plugin.settings.voice = {
				backend: 'openai-whisper',
				whisperServerUrl: 'http://127.0.0.1:8080',
				language: 'auto',
				conversations: []
			};
		}
		if (!this.plugin.settings.voice.conversations) {
			this.plugin.settings.voice.conversations = [];
		}
		
		const conversation: VoiceConversation = {
			id,
			name: `Voice Chat ${new Date(now).toLocaleString()}`,
			createdAt: now,
			messages: []
		};
		
		this.plugin.settings.voice.conversations.push(conversation);
		this.currentVoiceConversationId = id;
		this.plugin.saveSettings();
		
		console.log(`[VoiceHistory] Started new conversation: ${id}`);
	}

	/**
	 * Update current voice conversation with history from realtime agent
	 */
	private updateCurrentVoiceConversation(history: RealtimeHistoryItem[]): void {
		if (!this.currentVoiceConversationId) return;
		
		const conversations = this.plugin.settings.voice?.conversations;
		if (!conversations) return;
		
		const convIndex = conversations.findIndex(c => c.id === this.currentVoiceConversationId);
		if (convIndex === -1) return;
		
		const conv = conversations[convIndex];
		if (!conv) return;
		
		// Debug: Log all history items we receive
		console.log('[VoiceHistory] Received history items:', history.length);
		for (const item of history) {
			console.log('[VoiceHistory] Item:', item.type, item.role, 
				item.content?.substring(0, 50) || item.transcript?.substring(0, 50) || '(no content)');
		}
		
		// Convert history items to voice messages
		const messages: VoiceMessage[] = [];
		const baseTimestamp = conv.createdAt;
		
		for (let i = 0; i < history.length; i++) {
			const item = history[i];
			if (!item) continue;
			
			const text = item.content || item.transcript || '';
			
			// Skip system context messages (injected context)
			if (this.isSystemContextMessage(text)) {
				continue;
			}
			
			// Determine the message type
			const messageType = item.type || 'message';
			
			// For function calls, create a tool message
			if (messageType === 'function_call') {
				if (item.name) {
					messages.push({
						role: 'assistant',
						content: '',
						timestamp: baseTimestamp + (i * 1000),
						type: 'function_call',
						toolName: item.name,
						toolArgs: item.arguments || ''
					});
				}
				continue;
			}
			
			// For function call outputs
			if (messageType === 'function_call_output') {
				if (item.output) {
					messages.push({
						role: 'system',
						content: '',
						timestamp: baseTimestamp + (i * 1000),
						type: 'function_call_output',
						toolOutput: item.output
					});
				}
				continue;
			}
			
			// Regular message - determine role from item
			const role = item.role || 'assistant';
			const content = item.content || item.transcript || '';
			
			// Skip empty messages
			if (!content.trim()) {
				continue;
			}
			
			// Log user messages specifically for debugging
			if (role === 'user') {
				console.log('[VoiceHistory] Captured user message:', content.substring(0, 100));
			}
			
			// Check if assistant message looks like a tool call (JSON or function syntax)
			if (role === 'assistant' && this.looksLikeToolCall(content)) {
				// Parse to extract tool name and args
				const parsed = this.parseToolCall(content);
				if (parsed) {
					messages.push({
						role: 'tool',  // Use 'tool' role to distinguish in history
						content: '',
						timestamp: baseTimestamp + (i * 1000),
						type: 'function_call',
						toolName: parsed.toolName,
						toolArgs: parsed.args
					});
					continue;
				}
			}
			
			messages.push({
				role: role,
				content: content,
				timestamp: baseTimestamp + (i * 1000),
				type: 'message'
			});
		}
		
		console.log('[VoiceHistory] Converted to', messages.length, 'messages');
		
		// Update the conversation
		conv.messages = messages;
		this.plugin.saveSettings();
	}
	
	/**
	 * Check if a message is system context that should be hidden
	 */
	private isSystemContextMessage(text: string): boolean {
		if (!text) return false;
		
		// Common patterns for system context messages
		const systemPatterns = [
			'[SYSTEM CONTEXT',
			'DO NOT RESPOND TO THIS',
			'[Context Update]',
			'The user is currently looking at a note',
			'The user switched to a different note',
			'Here is its content:',
			'[Content truncated...]'
		];
		
		for (const pattern of systemPatterns) {
			if (text.includes(pattern)) {
				return true;
			}
		}
		
		return false;
	}
	
	/**
	 * Check if content looks like a JSON tool call response or function-call syntax
	 */
	private looksLikeToolCall(content: string): boolean {
		if (!content) return false;
		const trimmed = content.trim();
		
		// Check for function-call syntax (e.g., "update_checklist_item(...)")
		if (trimmed.match(/^\w+\s*\(/)) {
			return true;
		}
		
		// Check for JSON object or array start
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			try {
				JSON.parse(trimmed);
				return true;
			} catch {
				// Not valid JSON, but might still be partial JSON
				return trimmed.startsWith('{') && trimmed.includes('"');
			}
		}
		
		return false;
	}
	
	/**
	 * Parse a tool call to extract tool name and arguments
	 * Handles both JSON format and function-call syntax
	 */
	private parseToolCall(content: string): { toolName: string; args: string } | null {
		const trimmed = content.trim();
		
		// Check for function-call syntax first (e.g., "update_checklist_item(...)")
		const funcMatch = trimmed.match(/^(\w+)\s*\(([\s\S]*)\)$/);
		if (funcMatch) {
			const toolName = funcMatch[1] || 'unknown_tool';
			const argsContent = funcMatch[2] || '';
			
			// Try to parse the args into a more readable format
			// Format: note_path="...", item_text="...", checked=True
			const args: Record<string, string> = {};
			const argMatches = argsContent.matchAll(/(\w+)\s*=\s*["']?([^"',\n]+)["']?/g);
			for (const match of argMatches) {
				if (match[1] && match[2]) {
					args[match[1]] = match[2].trim();
				}
			}
			
			return {
				toolName,
				args: Object.keys(args).length > 0 ? JSON.stringify(args, null, 2) : argsContent
			};
		}
		
		// Try JSON parsing
		try {
			const parsed = JSON.parse(trimmed);
			
			// Try common JSON tool call formats
			// Format 1: { "tool": "name", "args": {...} }
			if (parsed.tool && typeof parsed.tool === 'string') {
				return {
					toolName: parsed.tool,
					args: JSON.stringify(parsed.args || parsed.arguments || parsed, null, 2)
				};
			}
			
			// Format 2: { "name": "tool_name", "arguments": {...} }
			if (parsed.name && typeof parsed.name === 'string') {
				return {
					toolName: parsed.name,
					args: JSON.stringify(parsed.arguments || parsed.args || parsed, null, 2)
				};
			}
			
			// Format 3: { "action": "tool_name", ... }
			if (parsed.action && typeof parsed.action === 'string') {
				return {
					toolName: parsed.action,
					args: JSON.stringify(parsed, null, 2)
				};
			}
			
			// Format 4: Just a JSON object that looks like a response
			// Try to identify it by common patterns
			const keys = Object.keys(parsed);
			if (keys.length > 0) {
				// If it has result/output/data keys, it's likely a tool response
				if (parsed.result || parsed.output || parsed.data || parsed.response) {
					return {
						toolName: 'json_response',
						args: JSON.stringify(parsed, null, 2)
					};
				}
			}
			
			// Default: treat any JSON as a tool response
			return {
				toolName: 'structured_output',
				args: JSON.stringify(parsed, null, 2)
			};
		} catch {
			return null;
		}
	}
	
	/**
	 * Add a user transcription to the current voice conversation
	 * This is called separately from historyUpdated since user transcriptions
	 * come through a different event in the Realtime API
	 */
	private addUserTranscriptionToConversation(item: RealtimeHistoryItem): void {
		if (!this.currentVoiceConversationId) return;
		
		const conversations = this.plugin.settings.voice?.conversations;
		if (!conversations) return;
		
		const convIndex = conversations.findIndex(c => c.id === this.currentVoiceConversationId);
		if (convIndex === -1) return;
		
		const conv = conversations[convIndex];
		if (!conv) return;
		
		const content = item.content || item.transcript || '';
		if (!content.trim() || this.isSystemContextMessage(content)) {
			return;
		}
		
		console.log('[VoiceHistory] Adding user transcription:', content.substring(0, 100));
		
		// Add to messages array
		conv.messages.push({
			role: 'user',
			content: content,
			timestamp: Date.now(),
			type: 'message'
		});
		
		this.plugin.saveSettings();
	}

	/**
	 * Save the current voice conversation
	 */
	private saveCurrentVoiceConversation(): void {
		if (!this.currentVoiceConversationId) return;
		
		const conversations = this.plugin.settings.voice?.conversations;
		if (!conversations) return;
		
		const conv = conversations.find(c => c.id === this.currentVoiceConversationId);
		if (conv && conv.messages.length === 0) {
			// Remove empty conversations
			const idx = conversations.indexOf(conv);
			if (idx > -1) {
				conversations.splice(idx, 1);
			}
		}
		
		this.plugin.saveSettings();
		this.currentVoiceConversationId = null;
		console.log(`[VoiceHistory] Saved conversation`);
	}

	/**
	 * Open the conversation history modal/pop-out
	 */
	private openConversationHistory(): void {
		const conversations = this.plugin.settings.voice?.conversations || [];
		
		openVoiceHistoryPopout(
			this.app,
			conversations,
			(id: string) => this.deleteVoiceConversation(id),
			() => this.deleteAllVoiceConversations()
		);
	}

	/**
	 * Delete a single voice conversation
	 */
	private deleteVoiceConversation(id: string): void {
		if (!this.plugin.settings.voice?.conversations) return;
		
		const idx = this.plugin.settings.voice.conversations.findIndex(c => c.id === id);
		if (idx > -1) {
			this.plugin.settings.voice.conversations.splice(idx, 1);
			this.plugin.saveSettings();
		}
	}

	/**
	 * Delete all voice conversations
	 */
	private deleteAllVoiceConversations(): void {
		if (this.plugin.settings.voice) {
			this.plugin.settings.voice.conversations = [];
			this.plugin.saveSettings();
		}
	}

	/**
	 * Handle transcript updates from the realtime agent
	 */
	/**
	 * Handle transcript updates from the realtime agent
	 * Note: Transcripts are NOT displayed in the main chat view.
	 * The voice agent speaks responses directly; we only log for debugging.
	 */
	private handleRealtimeTranscript(item: RealtimeHistoryItem): void {
		// Get the text from content or transcript
		const text = item.content || item.transcript || '';
		const role = item.role || 'assistant';
		
		// Skip system context messages - these are internal
		if (text.includes('[SYSTEM CONTEXT') || text.includes('DO NOT RESPOND TO THIS')) {
			return;
		}
		
		// Log for debugging only - voice transcripts stay out of main chat
		console.log(`[RealtimeAgent] ${role}: ${text}`);
		
		// Voice agent output is audible, not written to chat
		// The main chat view is reserved for text-based interactions
	}

	/**
	 * Handle chat output from the realtime agent
	 * This displays formatted content (markdown) in the chat view when the agent
	 * wants to show structured data that's better read than spoken.
	 * Supports Markdown, [[wikilinks]], and HTML links.
	 */
	private async handleChatOutput(content: string, sourceAgent: string): Promise<void> {
		if (!content || !content.trim()) {
			return;
		}

		// Render the message in the chat view
		// The MessageRenderer handles markdown, wikilinks, and HTML links via MarkdownRenderer
		await this.renderMessage({
			role: 'assistant',
			content: content,
			timestamp: new Date(),
		});

		// Scroll to bottom to show the new content
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

		console.log(`[VoiceAgent] Displayed chat output from ${sourceAgent}: ${content.substring(0, 100)}...`);
	}

	/**
	 * Add a transcript message to the chat display
	 */
	private addTranscriptMessage(role: 'user' | 'assistant', text: string): void {
		const messageEl = this.messagesContainer.createDiv({
			cls: `vc-message vc-message-${role} vc-message-transcript`
		});
		
		const contentEl = messageEl.createDiv({ cls: "vc-message-content" });
		contentEl.createEl("p", { text });
		
		// Add a small indicator that this is from voice
		const indicatorEl = messageEl.createDiv({ cls: "vc-transcript-indicator" });
		indicatorEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>`;
		
		// Scroll to bottom
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	/**
	 * Update the agent button visual state based on realtime agent state
	 */
	private updateAgentButtonState(state: RealtimeAgentState): void {
		if (!this.agentBtn) return;

		// Remove all state classes
		this.agentBtn.removeClass('vc-agent-connecting', 'vc-agent-connected', 'vc-agent-speaking', 'vc-agent-listening', 'vc-agent-error');

		// Agent icon SVG (robot/agent icon)
		const agentIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" x2="8" y1="16" y2="16"></line><line x1="16" x2="16" y1="16" y2="16"></line></svg>`;
		
		// Pulsing/active icon for connected states
		const activeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" x2="8" y1="16" y2="16"></line><line x1="16" x2="16" y1="16" y2="16"></line></svg>`;

		// Update icon and state
		switch (state) {
			case 'connecting':
				this.agentBtn.addClass('vc-agent-connecting');
				this.agentBtn.innerHTML = agentIcon;
				this.agentBtn.setAttribute('aria-label', 'Connecting...');
				this.showThinkingIndicator();
				break;
			case 'connected':
				this.agentBtn.addClass('vc-agent-connected');
				this.agentBtn.innerHTML = activeIcon;
				this.agentBtn.setAttribute('aria-label', 'Voice agent active - click to stop');
				this.hideThinkingIndicator();
				break;
			case 'listening':
				this.agentBtn.addClass('vc-agent-listening');
				this.agentBtn.innerHTML = activeIcon;
				this.agentBtn.setAttribute('aria-label', 'Agent listening...');
				// Don't show thinking while user is speaking
				this.hideThinkingIndicator();
				break;
			case 'processing':
				this.agentBtn.addClass('vc-agent-listening'); // Reuse listening style
				this.agentBtn.innerHTML = activeIcon;
				this.agentBtn.setAttribute('aria-label', 'Processing...');
				// Show thinking while AI is processing after user finished speaking
				this.showThinkingIndicator();
				break;
			case 'speaking':
				this.agentBtn.addClass('vc-agent-speaking');
				this.agentBtn.innerHTML = activeIcon;
				this.agentBtn.setAttribute('aria-label', 'Agent speaking - click to interrupt');
				this.hideThinkingIndicator();
				break;
			case 'error':
				this.agentBtn.addClass('vc-agent-error');
				this.agentBtn.innerHTML = agentIcon;
				this.agentBtn.setAttribute('aria-label', 'Voice agent error - click to retry');
				this.hideThinkingIndicator();
				break;
			case 'idle':
		default:
				this.agentBtn.innerHTML = agentIcon;
				this.agentBtn.setAttribute('aria-label', 'Start voice agent');
				this.hideThinkingIndicator();
				break;
		}

		// Show mute button only when agent is active (matches voice stop button pattern)
		// Hide voice input button when agent is active to avoid double microphone icons
		const agentActive = state === 'connected' || state === 'listening' || state === 'processing' || state === 'speaking';
		
		if (this.agentMuteBtn) {
			this.agentMuteBtn.style.display = agentActive ? 'inline-flex' : 'none';
		}
		
		// Hide voice input button when agent is active
		if (this.voiceBtn) {
			this.voiceBtn.style.display = agentActive ? 'none' : '';
		}
	}

	/**
	 * Update the mute button visual state
	 */
	private updateAgentMuteButtonState(isMuted: boolean): void {
		if (!this.agentMuteBtn) return;

		// Microphone icon (unmuted)
		const micIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
		
		// Muted microphone icon (with slash)
		const micMutedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"></path><path d="M5 10v2a7 7 0 0 0 12 5"></path><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"></path><path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;

		if (isMuted) {
			this.agentMuteBtn.addClass('vc-agent-muted');
			this.agentMuteBtn.innerHTML = micMutedIcon;
			this.agentMuteBtn.setAttribute('aria-label', 'Unmute microphone');
		} else {
			this.agentMuteBtn.removeClass('vc-agent-muted');
			this.agentMuteBtn.innerHTML = micIcon;
			this.agentMuteBtn.setAttribute('aria-label', 'Mute microphone');
		}
	}

	/**
	 * Handle mute button toggle
	 */
	private handleAgentMuteToggle(): void {
		if (!this.realtimeAgentService) return;
		
		this.realtimeAgentService.toggleMute();
	}

	/**
	 * Show "Thinking..." indicator while waiting for response
	 */
	private showThinkingIndicator(): void {
		console.log('[UI] showThinkingIndicator called, existing:', !!this.thinkingIndicatorEl);
		if (this.thinkingIndicatorEl || !this.inputArea) {
			return; // Already showing or no input area
		}
		
		// Create indicator as first child of input area (before input wrapper)
		this.thinkingIndicatorEl = this.inputArea.createDiv({ cls: "vc-thinking" });
		
		const textEl = this.thinkingIndicatorEl.createDiv({ cls: "vc-thinking-text" });
		textEl.setText("Thinking...");
		
		const progressEl = this.thinkingIndicatorEl.createDiv({ cls: "vc-thinking-progress" });
		progressEl.createDiv({ cls: "vc-thinking-progress-bar" });
		
		// Move to be first child (before input wrapper)
		if (this.inputArea.firstChild) {
			this.inputArea.insertBefore(this.thinkingIndicatorEl, this.inputArea.firstChild);
		}
		console.log('[UI] Thinking indicator CREATED');
	}

	/**
	 * Hide "Thinking..." indicator
	 */
	private hideThinkingIndicator(): void {
		console.log('[UI] hideThinkingIndicator called, existing:', !!this.thinkingIndicatorEl);
		if (this.thinkingIndicatorEl) {
			this.thinkingIndicatorEl.remove();
			this.thinkingIndicatorEl = null;
			console.log('[UI] Thinking indicator REMOVED');
		}
	}

	private async startService(): Promise<void> {
		try {
			if (!this.githubCopilotCliService.isConnected()) {
				await this.githubCopilotCliService.start();
				
				// Resume existing session if available, otherwise create new one
				const activeSessionId = this.plugin.settings.activeSessionId;
				if (activeSessionId) {
					// Try to resume the session from SDK persistence
					await this.githubCopilotCliService.loadSession(activeSessionId);
					console.log('[Vault Copilot] Resumed session:', activeSessionId);
				} else {
					// Create new session to load instructions, agents, and tools
					await this.githubCopilotCliService.createSession();
				}
				
				this.plugin.updateStatusBar();
			}
		} catch (error) {
			console.error("Failed to start Copilot service:", error);
		}
	}

	/**
	 * Toggle the session panel visibility
	 */
	private toggleSessionPanel(): void {
		this.sessionPanelVisible = !this.sessionPanelVisible;
		
		if (this.sessionPanelEl) {
			this.sessionPanelEl.style.display = this.sessionPanelVisible ? "flex" : "none";
			if (this.sessionPanelVisible && this.sessionPanel) {
				this.sessionPanel.render();
			}
		}
		
		if (this.resizerEl) {
			this.resizerEl.style.display = this.sessionPanelVisible ? "block" : "none";
		}
		
		// Hide the toggle button when panel is open, show when closed
		if (this.sessionToggleBtnEl) {
			this.sessionToggleBtnEl.style.display = this.sessionPanelVisible ? "none" : "flex";
		}
	}

	/**
	 * Setup the resizer drag functionality
	 */
	private setupResizer(): void {
		if (!this.resizerEl) return;

		const resizer = this.resizerEl;
		
		const onMouseDown = (e: MouseEvent) => {
			e.preventDefault();
			this.isResizing = true;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		};

		const onMouseMove = (e: MouseEvent) => {
			if (!this.isResizing || !this.sessionPanelEl) return;
			
			const container = this.containerEl.children[1] as HTMLElement;
			if (!container) return;
			
			const containerRect = container.getBoundingClientRect();
			const newPanelWidth = containerRect.right - e.clientX;
			
			// Constrain panel width between 200px and 50% of container
			const minWidth = 200;
			const maxWidth = containerRect.width * 0.5;
			const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newPanelWidth));
			
			this.sessionPanelEl.style.width = `${constrainedWidth}px`;
			this.sessionPanelEl.style.flex = "none";
		};

		const onMouseUp = () => {
			this.isResizing = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		resizer.addEventListener("mousedown", onMouseDown);
	}

	/**
	 * Get the current session name for display
	 */
	private getCurrentSessionName(): string {
		const activeSessionId = this.plugin.settings.activeSessionId;
		if (activeSessionId) {
			const session = this.plugin.settings.sessions.find(s => s.id === activeSessionId);
			if (session) {
				return session.name;
			}
		}
		return "New Chat";
	}

	/**
	 * Update the header title with current session name
	 */
	private updateHeaderTitle(): void {
		const titleEl = this.containerEl.querySelector(".vc-header-title");
		if (titleEl) {
			titleEl.setText(this.getCurrentSessionName());
		}
	}

	/**
	 * Update the agent selector button text
	 */
	private updateAgentSelectorText(): void {
		if (!this.agentSelectorEl) return;
		
		if (this.selectedAgent) {
			this.agentSelectorEl.textContent = this.selectedAgent.name;
			this.agentSelectorEl.addClass("vc-agent-selected");
		} else {
			this.agentSelectorEl.textContent = "Agent";
			this.agentSelectorEl.removeClass("vc-agent-selected");
		}
	}

	/**
	 * Get the currently selected agent
	 */
	getSelectedAgent(): CachedAgentInfo | null {
		return this.selectedAgent;
	}

	/**
	 * Update the tool selector button text with summary
	 */
	private updateToolSelectorText(): void {
		if (!this.toolSelectorEl || !this.toolCatalog) return;
		
		const currentSession = this.getCurrentSession();
		const summary = this.toolCatalog.getToolsSummary(this.plugin.settings, currentSession);
		
		// Show tools icon with tooltip showing count
		this.toolSelectorEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
		this.toolSelectorEl.setAttribute("aria-label", `Tools ${summary.enabled}/${summary.total}`);
		
		// Add visual indicator if not all tools enabled
		if (summary.enabled < summary.total) {
			this.toolSelectorEl.addClass("vc-tools-filtered");
		} else {
			this.toolSelectorEl.removeClass("vc-tools-filtered");
		}
	}

	/**
	 * Get the current session object (delegates to SessionManager)
	 */
	private getCurrentSession(): CopilotSession | undefined {
		return this.sessionManager.getCurrentSession();
	}

	/**
	 * Open the tool picker modal
	 */
	private openToolPicker(): void {
		if (!this.toolCatalog) return;

		const currentSession = this.getCurrentSession();

		new ToolPickerModal(this.app, {
			toolCatalog: this.toolCatalog,
			settings: this.plugin.settings,
			session: currentSession,
			mode: "session",
			onSave: async (enabledTools) => {
				// Save to current session
				if (currentSession) {
					currentSession.toolOverrides = {
						enabled: enabledTools,
					};
					await this.plugin.saveSettings();
					
					// Recreate the Copilot session with updated tools (maintains session ID for persistence)
					await this.githubCopilotCliService.createSession(currentSession.id);
				}
				
				// Update UI
				this.updateToolSelectorText();
			}
		}).open();
	}

	/**
	 * Show the settings menu dropdown
	 */
	private showSettingsMenu(e: Event): void {
		const menu = new Menu();

		// Extensions
		menu.addItem((item) => {
			item.setTitle("Extensions")
				.setIcon("puzzle")
				.onClick(() => {
					// Open Extension Browser
					this.plugin.activateExtensionBrowser();
				});
		});

		menu.addSeparator();

		// Custom Agents
		menu.addItem((item) => {
			item.setTitle("Custom Agents")
				.setIcon("bot")
				.onClick(() => {
					// Open settings to agent directories section
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		// Prompt Files
		menu.addItem((item) => {
			item.setTitle("Prompt Files")
				.setIcon("file-text")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		menu.addSeparator();

		// Skills
		menu.addItem((item) => {
			item.setTitle("Skills")
				.setIcon("sparkles")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		// Chat Instructions
		menu.addItem((item) => {
			item.setTitle("Chat Instructions")
				.setIcon("scroll-text")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		// Generate Chat Instructions
		menu.addItem((item) => {
			item.setTitle("Generate Chat Instructions")
				.setIcon("wand")
				.onClick(async () => {
					// TODO: Implement chat instructions generation
				});
		});

		menu.addSeparator();

		// MCP Servers
		menu.addItem((item) => {
			item.setTitle("MCP Servers")
				.setIcon("server")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		// Tool Sets
		menu.addItem((item) => {
			item.setTitle("Tool Sets")
				.setIcon("wrench")
				.onClick(() => {
					this.openToolPicker();
				});
		});

		menu.addSeparator();

		// Diagnostics
		menu.addItem((item) => {
			item.setTitle("Diagnostics")
				.setIcon("activity")
				.onClick(() => {
					// Show diagnostics info
					this.showDiagnostics();
				});
		});

		// View Tracing (only when tracing is enabled)
		if (this.plugin.settings.tracingEnabled) {
			menu.addItem((item) => {
				item.setTitle("View Tracing")
					.setIcon("list-tree")
					.onClick(() => {
						openTracingPopout(this.app);
					});
			});
		}

		// Voice Conversation History (only when realtime agent is enabled)
		if (this.plugin.settings.voice?.realtimeAgentEnabled) {
			menu.addItem((item) => {
				item.setTitle("Voice History")
					.setIcon("history")
					.onClick(() => {
						this.openConversationHistory();
					});
			});
		}

		// Chat Settings
		menu.addItem((item) => {
			item.setTitle("Chat Settings")
				.setIcon("settings")
				.onClick(() => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				});
		});

		menu.showAtMouseEvent(e as MouseEvent);
	}

	/**
	 * Show diagnostics information
	 */
	private showDiagnostics(): void {
		const diagnostics: string[] = [];
		
		// Service status
		diagnostics.push(`**Service Status:** ${this.githubCopilotCliService.isConnected() ? "Connected" : "Disconnected"}`);
		diagnostics.push(`**Model:** ${this.plugin.settings.model}`);
		diagnostics.push(`**Streaming:** ${this.plugin.settings.streaming ? "Enabled" : "Disabled"}`);
		
		// Session info
		const session = this.getCurrentSession();
		if (session) {
			diagnostics.push(`\n**Session:** ${session.name}`);
			diagnostics.push(`**Messages:** ${session.messages?.length || 0}`);
		}
		
		// Tools
		if (this.toolCatalog) {
			const tools = this.toolCatalog.getAllTools();
			diagnostics.push(`\n**Available Tools:** ${tools.length}`);
		}
		
		// Configuration directories
		diagnostics.push(`\n**Agent Directories:** ${this.plugin.settings.agentDirectories.length}`);
		diagnostics.push(`**Prompt Directories:** ${this.plugin.settings.promptDirectories.length}`);
		diagnostics.push(`**Skill Directories:** ${this.plugin.settings.skillDirectories.length}`);
		
		new Notice(diagnostics.join("\n"), 10000);
	}

	/**
	 * Create a new chat session (delegates to SessionManager)
	 */
	async createNewSession(name?: string): Promise<void> {
		await this.sessionManager.createNewSession(name);
		this.renderAttachments();
	}

	/**
	 * Load a session by its data (delegates to SessionManager)
	 */
	async loadSession(session: CopilotSession): Promise<void> {
		await this.sessionManager.loadSession(session);
	}

	/**
	 * Save the current session's messages (delegates to SessionManager)
	 */
	async saveCurrentSession(): Promise<void> {
		await this.sessionManager.saveCurrentSession();
	}

	/**
	 * Ensure a session exists in our tracking system before sending messages (delegates to SessionManager)
	 */
	private async ensureSessionExists(): Promise<void> {
		await this.sessionManager.ensureSessionExists();
	}

	/**
	 * Register keyboard shortcuts
	 */
	registerKeyboardShortcuts(): void {
		// Ctrl+N for new chat
		this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
			if (e.ctrlKey && e.key === "n" && this.containerEl.contains(document.activeElement)) {
				e.preventDefault();
				this.createNewSession();
			}
		});
	}

	private openNotePicker(): void {
		new NoteSuggestModal(this.plugin, (file) => {
			this.attachNote(file);
		}).open();
	}

	private attachNote(file: TFile): void {
		// Avoid duplicates
		if (this.attachedNotes.some(n => n.path === file.path)) {
			return;
		}
		
		this.attachedNotes.push(file);
		this.renderAttachments();
	}

	private removeAttachment(file: TFile): void {
		this.attachedNotes = this.attachedNotes.filter(n => n.path !== file.path);
		this.renderAttachments();
	}

	private renderAttachments(): void {
		if (!this.attachmentsContainer) return;
		
		this.attachmentsContainer.empty();
		
		for (const file of this.attachedNotes) {
			const chip = this.attachmentsContainer.createSpan({ cls: "vc-attachment-chip" });
			
			const icon = chip.createSpan({ cls: "vc-attachment-icon" });
			icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
			
			chip.createSpan({ text: file.basename, cls: "vc-attachment-name" });
			
			const removeBtn = chip.createSpan({ cls: "vc-attachment-remove" });
			removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.removeAttachment(file);
			});
		}
	}

	/**
	 * Insert an inline chip at the current cursor position inside the contenteditable input
	 */
	private insertInlineChip(file: TFile): void {
		// Create the chip element
		const chip = document.createElement("span");
		chip.className = "vc-inline-chip";
		chip.contentEditable = "false";  // Make the chip non-editable as a unit
		chip.setAttribute("data-file-path", file.path);
		
		const icon = document.createElement("span");
		icon.className = "vc-attachment-icon";
		icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
		chip.appendChild(icon);
		
		const name = document.createElement("span");
		name.className = "vc-attachment-name";
		name.textContent = file.basename;
		chip.appendChild(name);
		
		const removeBtn = document.createElement("span");
		removeBtn.className = "vc-attachment-remove";
		removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
		removeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			chip.remove();
			this.inputEl.focus();
		});
		chip.appendChild(removeBtn);
		
		// Insert at cursor position
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			
			// Only insert if cursor is within our input element
			if (this.inputEl.contains(range.commonAncestorContainer)) {
				range.deleteContents();
				range.insertNode(chip);
				
				// Add a space after the chip and move cursor there
				const space = document.createTextNode(" ");
				range.setStartAfter(chip);
				range.insertNode(space);
				range.setStartAfter(space);
				range.setEndAfter(space);
				selection.removeAllRanges();
				selection.addRange(range);
			} else {
				// Cursor not in input, append at end
				this.inputEl.appendChild(chip);
				this.inputEl.appendChild(document.createTextNode(" "));
			}
		} else {
			// No selection, append at end
			this.inputEl.appendChild(chip);
			this.inputEl.appendChild(document.createTextNode(" "));
		}
		
		this.autoResizeInput();
		this.inputEl.focus();
	}
	
	/**
	 * Extract text and inline chips from the contenteditable input
	 * Returns the plain text message and array of file paths from chips
	 */
	private extractInputContent(): { text: string; chipFilePaths: string[] } {
		const chipFilePaths: string[] = [];
		let text = "";
		
		const extractFromNode = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				text += node.textContent || "";
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const element = node as HTMLElement;
				if (element.classList.contains("vc-inline-chip")) {
					// It's a chip - add the file path and represent as [[filename]]
					const filePath = element.getAttribute("data-file-path");
					if (filePath) {
						chipFilePaths.push(filePath);
						// Add inline reference notation to the text
						const name = element.querySelector(".vc-attachment-name")?.textContent || "";
						text += `[[${name}]]`;
					}
				} else if (element.tagName === "BR") {
					text += "\n";
				} else {
					// Recurse into children
					node.childNodes.forEach(extractFromNode);
				}
			}
		};
		
		this.inputEl.childNodes.forEach(extractFromNode);
		
		return { text: text.trim(), chipFilePaths };
	}

	async onClose(): Promise<void> {
		// Unsubscribe from agent cache changes
		if (this.agentCacheUnsubscribe) {
			this.agentCacheUnsubscribe();
			this.agentCacheUnsubscribe = null;
		}
		// Unsubscribe from prompt cache changes
		if (this.promptCacheUnsubscribe) {
			this.promptCacheUnsubscribe();
			this.promptCacheUnsubscribe = null;
		}
		// Unsubscribe from voice state changes and destroy service
		if (this.voiceStateUnsubscribe) {
			this.voiceStateUnsubscribe();
			this.voiceStateUnsubscribe = null;
		}
		if (this.voiceChatService) {
			this.voiceChatService.destroy();
			this.voiceChatService = null;
		}
		// Cleanup realtime agent service
		for (const unsubscribe of this.realtimeAgentUnsubscribes) {
			unsubscribe();
		}
		this.realtimeAgentUnsubscribes = [];
		if (this.realtimeAgentService) {
			this.realtimeAgentService.destroy();
			this.realtimeAgentService = null;
		}
	}

	private async loadMessages(): Promise<void> {
		const history = this.githubCopilotCliService.getMessageHistory();
		for (const message of history) {
			await this.renderMessage(message);
		}
		this.scrollToBottom();
	}

	private addWelcomeMessage(): void {
		renderWelcomeMessage(this.messagesContainer, (text) => {
			this.inputEl.innerText = text;
			this.sendMessage();
		});
	}

	/**
	 * Execute a tool directly (used by slash commands)
	 */
	async executeTool(toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
		const service = this.githubCopilotCliService as unknown as {
			readNote: (path: string) => Promise<Record<string, unknown>>;
			searchNotes: (query: string, limit: number) => Promise<Record<string, unknown>>;
			createNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			getActiveNote: () => Promise<Record<string, unknown>>;
			listNotes: (folder?: string) => Promise<Record<string, unknown>>;
			listNotesRecursively: (folder?: string, limit?: number) => Promise<Record<string, unknown>>;
			appendToNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			batchReadNotes: (paths: string[], aiSummarize?: boolean, summaryPrompt?: string) => Promise<Record<string, unknown>>;
			updateNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			deleteNote: (path: string) => Promise<Record<string, unknown>>;
			getRecentChanges: (limit: number) => Promise<Record<string, unknown>>;
			getDailyNote: (date?: string) => Promise<Record<string, unknown>>;
			renameNote: (oldPath: string, newPath: string) => Promise<Record<string, unknown>>;
		};

		switch (toolName) {
			case "read_note":
				return await service.readNote(args.path as string);
			case "search_notes":
				return await service.searchNotes(args.query as string, (args.limit as number) || 10);
			case "create_note":
				return await service.createNote(args.path as string, args.content as string);
			case "get_active_note":
				return await service.getActiveNote();
			case "list_notes":
				return await service.listNotes(args.folder as string | undefined);
			case "list_notes_recursively":
				return await service.listNotesRecursively(args.folder as string | undefined, args.limit as number | undefined);
			case "append_to_note":
				return await service.appendToNote(args.path as string, args.content as string);
			case "batch_read_notes":
				return await service.batchReadNotes(
					args.paths as string[], 
					args.aiSummarize as boolean | undefined,
					args.summaryPrompt as string | undefined
				);
			case "update_note":
				return await service.updateNote(args.path as string, args.content as string);
			case "delete_note":
				return await service.deleteNote(args.path as string);
			case "get_recent_changes":
				return await service.getRecentChanges((args.limit as number) || 10);
			case "get_daily_note":
				return await service.getDailyNote(args.date as string | undefined);
			case "rename_note":
				return await service.renameNote(args.oldPath as string, args.newPath as string);
			default:
				return { success: false, error: `Unknown tool: ${toolName}` };
		}
	}

	/**
	 * Clear chat history and UI
	 */
	async clearChat(): Promise<void> {
		await this.githubCopilotCliService.clearHistory();
		this.messagesContainer.empty();
		this.addWelcomeMessage();
	}

	/**
	 * Handle slash command
	 */
	private async handleSlashCommand(message: string): Promise<boolean> {
		if (!message.startsWith("/")) return false;

		const match = message.match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
		if (!match) return false;

		const [, commandName, args] = match;
		if (!commandName) return false;
		
		// Normalize the command name for comparison (lowercase)
		const normalizedCommand = commandName.toLowerCase();
		
		// First check if it's a custom prompt
		// Match by normalizing prompt names (replace spaces with hyphens, lowercase)
		const promptInfo = this.plugin.promptCache.getPrompts().find(
			p => p.name.toLowerCase().replace(/\s+/g, '-') === normalizedCommand ||
			     p.name.toLowerCase() === normalizedCommand
		);
		
		if (promptInfo) {
			// It's a custom prompt - execute it with any additional args
			await this.executePromptWithArgs(promptInfo, args?.trim() || "");
			return true;
		}
		
		const command = SLASH_COMMANDS.find(c => c.name === normalizedCommand);
		
		if (!command) {
			// Unknown command - show help
			await this.renderMessage({ role: "user", content: message, timestamp: new Date() });
			const helpMsg = `Unknown command: /${commandName}\n\nType **/help** to see available commands.`;
			await this.renderMessage({ role: "assistant", content: helpMsg, timestamp: new Date() });
			return true;
		}

		// Display user command
		await this.renderMessage({ role: "user", content: message, timestamp: new Date() });
		
		// Scroll the new user message to the top of the visible area
		const userMsgEl = this.messagesContainer.lastElementChild as HTMLElement;
		if (userMsgEl) {
			this.scrollMessageToTop(userMsgEl);
		}

		try {
			const result = await command.handler(this, args?.trim() || "");
			
			if (result) {
				// Create message element for the response
				const msgEl = this.createMessageElement("assistant", "");
				await this.renderMarkdownContent(msgEl, result);
				this.addCopyButton(msgEl);
			}
		} catch (error) {
			this.addErrorMessage(`Command failed: ${error}`);
		}

		return true;
	}

	/**
	 * Navigate through input history using up/down arrows
	 */
	private navigateHistory(direction: 'up' | 'down'): void {
		if (this.inputHistory.length === 0) return;

		// Save current input before starting navigation
		if (this.historyIndex === -1) {
			this.savedCurrentInput = this.inputEl.textContent || '';
		}

		if (direction === 'up') {
			// Go back in history
			if (this.historyIndex === -1) {
				this.historyIndex = this.inputHistory.length - 1;
			} else if (this.historyIndex > 0) {
				this.historyIndex--;
			}
		} else {
			// Go forward in history
			if (this.historyIndex >= 0) {
				this.historyIndex++;
				if (this.historyIndex >= this.inputHistory.length) {
					// Back to current input
					this.historyIndex = -1;
				}
			}
		}

		// Update input content
		if (this.historyIndex === -1) {
			this.inputEl.textContent = this.savedCurrentInput;
		} else {
			this.inputEl.textContent = this.inputHistory[this.historyIndex] ?? '';
		}

		// Move cursor to end
		const range = document.createRange();
		const sel = window.getSelection();
		if (this.inputEl.childNodes.length > 0) {
			range.selectNodeContents(this.inputEl);
			range.collapse(false);
			sel?.removeAllRanges();
			sel?.addRange(range);
		}
	}

	private async sendMessage(): Promise<void> {
		// Extract text and inline chip file paths from contenteditable
		const { text: message, chipFilePaths } = this.extractInputContent();
		if (!message || this.isProcessing) return;

		// Add to input history (avoid duplicates of last entry)
		if (this.inputHistory.length === 0 || this.inputHistory[this.inputHistory.length - 1] !== message) {
			this.inputHistory.push(message);
		}
		this.historyIndex = -1;  // Reset navigation

		this.isProcessing = true;
		this.updateUIState();
		this.showThinkingIndicator();

		// Clear input
		this.inputEl.innerHTML = "";
		this.autoResizeInput();

		// Ensure we have a session in our tracking system
		await this.ensureSessionExists();

		// Clear welcome message if present
		const welcomeEl = this.messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) {
			welcomeEl.remove();
		}

		// Check if this is a slash command
		if (message.startsWith("/")) {
			try {
				const handled = await this.handleSlashCommand(message);
				if (handled) {
					this.isProcessing = false;
					this.updateUIState();
					this.scrollToBottom();
					return;
				}
			} catch (error) {
				this.addErrorMessage(`Command error: ${error}`);
				this.isProcessing = false;
				this.updateUIState();
				return;
			}
		}

		// Check if voice agent is active - send text to voice agent instead
		if (this.realtimeAgentService?.isConnected()) {
			// Display user message in voice transcript area
			await this.renderMessage({ role: "user", content: message, timestamp: new Date() });
			
			// Send as text input to the voice agent
			this.realtimeAgentService.sendMessage(message);
			
			this.isProcessing = false;
			this.updateUIState();
			this.scrollToBottom();
			return;
		}

		// Process #fetch URL references
		const { processedMessage, fetchedUrls, fetchedContext } = await this.promptProcessor.processFetchReferences(message);

		// Extract and process [[filename]] inline references
		const inlineNoteRefs = this.extractInlineNoteReferences(processedMessage);
		const inlineNoteContext: string[] = [];
		const loadedInlineNotes: string[] = [];
		for (const noteName of inlineNoteRefs) {
			const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
			if (file) {
				try {
					const content = await this.app.vault.cachedRead(file);
					inlineNoteContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
					loadedInlineNotes.push(file.basename);
				} catch (e) {
					console.error(`Failed to read inline note reference: ${noteName}`, e);
				}
			}
		}

		// Build message with attached notes context
		let fullMessage = processedMessage;
		
		// Add selected agent instructions as context (prepended to message)
		let agentInstructions: string | null = null;
		if (this.selectedAgent) {
			const fullAgent = await this.plugin.agentCache.getFullAgent(this.selectedAgent.name);
			if (fullAgent?.instructions) {
				agentInstructions = fullAgent.instructions;
				fullMessage = `[Agent Instructions for "${fullAgent.name}"]\n${fullAgent.instructions}\n[End Agent Instructions]\n\nUser message:\n${fullMessage}`;
			}
		}
		
		// Add fetched web page content as context
		if (fetchedContext.length > 0) {
			fullMessage = `${fetchedContext.join("\n\n")}\n\n${fullMessage}`;
		}

		// Add inline [[note]] reference content as context
		if (inlineNoteContext.length > 0) {
			fullMessage = `${inlineNoteContext.join("\n\n")}\n\n${fullMessage}`;
		}

		// Add inline chip note refs (from # picker) as context
		const chipFileNames: string[] = [];
		if (chipFilePaths.length > 0) {
			const inlineRefContext: string[] = [];
			for (const filePath of chipFilePaths) {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					try {
						const content = await this.app.vault.cachedRead(file);
						inlineRefContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
						chipFileNames.push(file.basename);
					} catch (e) {
						console.error(`Failed to read inline note ref: ${file.path}`, e);
					}
				}
			}
			if (inlineRefContext.length > 0) {
				fullMessage = `${inlineRefContext.join("\n\n")}\n\n${fullMessage}`;
			}
		}
		
		if (this.attachedNotes.length > 0) {
			const attachmentContext: string[] = [];
			for (const file of this.attachedNotes) {
				try {
					const content = await this.app.vault.cachedRead(file);
					attachmentContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
				} catch (e) {
					console.error(`Failed to read attached note: ${file.path}`, e);
				}
			}
			if (attachmentContext.length > 0) {
				fullMessage = `${attachmentContext.join("\n\n")}\n\nUser question about the above note(s):\n${processedMessage}`;
			}
		}

		// Collect all used references for display
		const usedReferences: UsedReference[] = [];
		
		// Add selected agent as a reference
		if (this.selectedAgent) {
			usedReferences.push({
				type: "agent",
				name: this.selectedAgent.name,
				path: this.selectedAgent.path
			});
		}
		
		// Add loaded instructions as references
		const loadedInstructions = this.githubCopilotCliService.getLoadedInstructions();
		for (const instruction of loadedInstructions) {
			usedReferences.push({
				type: "instruction",
				name: instruction.name,
				path: instruction.path
			});
		}
		
		// Add fetched URLs as references
		for (const url of fetchedUrls) {
			usedReferences.push({
				type: "url",
				name: new URL(url).hostname,
				path: url
			});
		}
		
		// Add inline [[note]] references as context
		for (let i = 0; i < loadedInlineNotes.length; i++) {
			const noteName = loadedInlineNotes[i];
			const noteRef = inlineNoteRefs[i];
			const file = this.app.metadataCache.getFirstLinkpathDest(noteRef || "", "");
			usedReferences.push({
				type: "context",
				name: noteName || noteRef || "Unknown",
				path: file?.path || noteRef || ""
			});
		}
		
		// Add chip file references as context
		for (let i = 0; i < chipFileNames.length; i++) {
			usedReferences.push({
				type: "context",
				name: chipFileNames[i] || "Unknown",
				path: chipFilePaths[i] || ""
			});
		}
		
		// Add attached notes as context
		for (const file of this.attachedNotes) {
			usedReferences.push({
				type: "context",
				name: file.basename,
				path: file.path
			});
		}

		// Display user message (clean, without prefixes)
		const userMessageEl = await this.renderMessage({ role: "user", content: processedMessage, timestamp: new Date() });
		
		// Render collapsible references section after the user message
		if (usedReferences.length > 0) {
			this.messageRenderer.renderUsedReferences(this.messagesContainer, usedReferences);
		}

		// Clear attachments after sending
		this.attachedNotes = [];
		this.renderAttachments();

		try {
			// Create streaming message element (thinking indicator will be hidden when first content arrives)
			this.currentStreamingMessageEl = this.createMessageElement("assistant", "");
			
			// Scroll the new user message to the top AFTER creating streaming element
			// This ensures any auto-scroll from element creation is overwritten
			if (userMessageEl) {
				requestAnimationFrame(() => {
					this.scrollMessageToTop(userMessageEl);
				});
			}

			// Log tool context for debugging
			this.logToolContext();

			let isFirstDelta = true;
			if (this.plugin.settings.streaming) {
				await this.githubCopilotCliService.sendMessageStreaming(
					fullMessage,
					(delta) => {
						// Hide thinking indicator on first content delta
						if (isFirstDelta) {
							this.hideThinkingIndicator();
							isFirstDelta = false;
						}
						
						if (this.currentStreamingMessageEl) {
							const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
							if (contentEl) {
								contentEl.textContent += delta;
							}
						}
						// Don't auto-scroll during streaming - keep user's question at top
					},
					async (fullContent) => {
						// Render markdown when complete
						if (this.currentStreamingMessageEl) {
							await this.renderMarkdownContent(this.currentStreamingMessageEl, fullContent);
							this.addCopyButton(this.currentStreamingMessageEl);
						}
						this.currentStreamingMessageEl = null;
					}
				);
			} else {
				// Hide thinking indicator before non-streaming response
				this.hideThinkingIndicator();
				
				const response = await this.githubCopilotCliService.sendMessage(fullMessage);
				if (this.currentStreamingMessageEl) {
					await this.renderMarkdownContent(this.currentStreamingMessageEl, response);
					this.addCopyButton(this.currentStreamingMessageEl);
				}
				this.currentStreamingMessageEl = null;
			}
		} catch (error) {
			new Notice(`Vault Copilot error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.addErrorMessage(String(error));
		} finally {
			// Hide thinking indicator if still showing (for error cases)
			this.hideThinkingIndicator();
			
			// Auto-rename session based on first message
			await this.autoRenameSessionFromFirstMessage(message);
			
			this.isProcessing = false;
			this.updateUIState();
			// Don't scroll to bottom - keep user's question visible at top
		}
	}

	/**
	 * Auto-rename session based on first user message (delegates to SessionManager)
	 */
	private async autoRenameSessionFromFirstMessage(firstMessage: string): Promise<void> {
		await this.sessionManager.autoRenameSessionFromFirstMessage(
			firstMessage,
			this.sessionPanel ? () => this.sessionPanel!.render() : undefined
		);
	}

	private createMessageElement(role: "user" | "assistant", content: string): HTMLElement {
		return this.messageRenderer!.createMessageElement(this.messagesContainer, role, content);
	}

	private addCopyButton(messageEl: HTMLElement): void {
		this.messageRenderer!.addCopyButton(messageEl);
	}

	private async renderMessage(message: ChatMessage): Promise<HTMLElement> {
		return await this.messageRenderer!.renderMessage(this.messagesContainer, message);
	}

	private async renderMarkdownContent(messageEl: HTMLElement, content: string): Promise<void> {
		await this.messageRenderer!.renderMarkdownContent(messageEl, content);
	}

	/**
	 * Render an MCP App inline in the chat (delegates to ToolExecutionRenderer)
	 * 
	 * @param containerEl - The container element to render the app into
	 * @param resource - The UI resource content (HTML)
	 * @param toolInfo - Optional tool information for context
	 * @returns The McpAppContainer component instance
	 */
	renderMcpApp(
		containerEl: HTMLElement,
		resource: UIResourceContent,
		toolInfo?: { id?: string | number; tool: { name: string; description: string } }
	): McpAppContainer {
		return this.toolExecutionRenderer.renderMcpApp(containerEl, resource, toolInfo);
	}

	/**
	 * Render a tool execution indicator with optional MCP App UI (delegates to ToolExecutionRenderer)
	 * 
	 * @param toolName - The name of the tool being executed
	 * @param toolArgs - The arguments passed to the tool
	 * @param uiResourceUri - Optional URI to a UI resource for rendering results
	 */
	renderToolExecution(
		toolName: string,
		toolArgs: Record<string, unknown>,
		uiResourceUri?: string
	): HTMLElement {
		const el = this.toolExecutionRenderer.renderToolExecution(
			this.messagesContainer,
			toolName,
			toolArgs,
			uiResourceUri
		);
		this.scrollToBottom();
		return el;
	}

	/**
	 * Update a tool execution indicator with the result (delegates to ToolExecutionRenderer)
	 * 
	 * @param containerEl - The tool execution container element
	 * @param result - The tool result
	 * @param uiResource - Optional UI resource for rendering the result
	 */
	async updateToolExecutionComplete(
		containerEl: HTMLElement,
		result: ToolCallResult,
		uiResource?: UIResourceContent
	): Promise<void> {
		await this.toolExecutionRenderer.updateToolExecutionComplete(
			this.messagesContainer,
			containerEl,
			result,
			uiResource
		);
		this.scrollToBottom();
	}

	/**
	 * Create a sample MCP App for testing/demonstration (delegates to ToolExecutionRenderer)
	 * This renders a simple HTML app inline
	 */
	renderSampleMcpApp(): void {
		this.toolExecutionRenderer.renderSampleMcpApp(this.messagesContainer);
		this.scrollToBottom();
	}

	private addErrorMessage(error: string): void {
		const errorEl = this.messagesContainer.createDiv({ cls: "vc-error" });
		errorEl.createEl("span", { text: `Error: ${error}` });
	}

	private handleSendOrCancel(): void {
		if (this.isProcessing) {
			this.cancelRequest();
		} else {
			this.sendMessage();
		}
	}

	private async cancelRequest(): Promise<void> {
		try {
			await this.githubCopilotCliService.abort();
			if (this.currentStreamingMessageEl) {
				const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
				if (contentEl && contentEl.textContent) {
					// Keep what was streamed, mark as cancelled
					contentEl.textContent += "\n\n*[Generation cancelled]*";
				} else {
					// Remove empty message
					this.currentStreamingMessageEl.remove();
				}
				this.currentStreamingMessageEl = null;
			}
			this.isProcessing = false;
			this.updateUIState();
		} catch (error) {
			console.error("Failed to cancel:", error);
		}
	}

	private updateUIState(): void {
		// Toggle contenteditable based on processing state
		this.inputEl.contentEditable = this.isProcessing ? "false" : "true";
		
		if (this.isProcessing) {
			this.sendButton.addClass("vc-loading");
			// Change to stop icon
			this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect></svg>`;
			this.sendButton.setAttribute("aria-label", "Stop generation");
		} else {
			this.sendButton.removeClass("vc-loading");
			// Change back to send icon
			this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;
			this.sendButton.setAttribute("aria-label", "Send message");
		}
	}

	private autoResizeInput(): void {
		this.inputEl.style.height = "auto";
		const newHeight = Math.min(this.inputEl.scrollHeight, 200);
		this.inputEl.style.height = newHeight + "px";
	}

	/**
	 * Execute a custom prompt with additional user arguments
	 * This is called when user types /prompt-name additional text here
	 */
	private async executePromptWithArgs(promptInfo: CachedPromptInfo, userArgs: string): Promise<void> {
		// Load the full prompt content
		const fullPrompt = await this.plugin.promptCache.getFullPrompt(promptInfo.name);
		if (!fullPrompt) {
			new Notice(`Could not load prompt: ${promptInfo.name}`);
			return;
		}
		
		// Check for input variables that need user selection (have options)
		const inputVariables = parseInputVariables(fullPrompt.content);
		
		if (inputVariables.length > 0) {
			// Show modal to collect input for variables with options
			const modal = new PromptInputModal(this.app, inputVariables, (values) => {
				// Continue execution with collected values
				this.executePromptWithInputValues(promptInfo, fullPrompt, userArgs, values);
			});
			modal.open();
			return;
		}
		
		// No input variables need collection - execute directly
		await this.executePromptWithInputValues(promptInfo, fullPrompt, userArgs, new Map());
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
		// Ensure we have a session
		await this.ensureSessionExists();
		
		// Clear welcome message if present
		const welcomeEl = this.messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) {
			welcomeEl.remove();
		}
		
		// Build display message showing prompt and inputs
		let userMessage = `Run prompt: **${promptInfo.name}**\n\n> ${promptInfo.description}`;
		if (userArgs) {
			userMessage += `\n\n**Input:** ${userArgs}`;
		}
		if (inputValues.size > 0) {
			for (const [name, value] of inputValues) {
				userMessage += `\n\n**${name}:** ${value}`;
			}
		}
		await this.renderMessage({ role: "user", content: userMessage, timestamp: new Date() });
		
		// Collect all used references for display
		const usedReferences: UsedReference[] = [];
		
		// Track agent if specified in prompt
		if (fullPrompt.agent) {
			const agent = this.plugin.agentCache.getAgentByName(fullPrompt.agent);
			if (agent) {
				console.log(`[VC] Prompt specifies agent: ${agent.name}`);
				usedReferences.push({
					type: "agent",
					name: agent.name,
					path: agent.path
				});
			} else {
				console.warn(`[VC] Agent "${fullPrompt.agent}" specified in prompt not found`);
			}
		}
		
		// Set processing state
		this.isProcessing = true;
		this.updateUIState();
		
		try {
			// Process the prompt content with VS Code compatible variable replacement
			let content = await this.promptProcessor.processVariables(fullPrompt.content, fullPrompt.path);
			
			// Process ${userInput} - simple replacement with user's additional input
			content = content.replace(/\$\{userInput\}/g, userArgs || '[No input provided]');
		
		// Check if userInput is a folder path and expand to file references
		if (userArgs) {
			// Normalize the path (remove leading/trailing slashes)
			const normalizedPath = userArgs.replace(/^\/+|\/+$/g, '');
			const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
			
			if (folder && 'children' in folder) {
				// It's a folder - recursively get all markdown files
				const files = this.app.vault.getMarkdownFiles().filter(f => {
					// Match both exact folder and subfolders
					return f.path === normalizedPath || 
					       f.path.startsWith(normalizedPath + '/');
				});
				
				for (const file of files) {
					usedReferences.push({
						type: "context",
						name: file.basename,
						path: file.path
					});
				}
				console.log(`[VC] Expanded folder "${normalizedPath}" to ${files.length} file references`);
			}
		}
		
		// Process ${input:name:...} variables - replace with collected values or defaults
		content = this.processInputVariablesWithValues(content, inputValues);
		
		// Process Markdown file links and wikilinks - resolve and include referenced content (with tracking)
		const { content: contentWithLinks, resolvedFiles } = await this.promptProcessor.resolveMarkdownFileLinksWithTracking(content, fullPrompt.path);
		content = contentWithLinks;
		
		// Add resolved files from prompt to references
		for (const file of resolvedFiles) {
			usedReferences.push({
				type: "context",
				name: file.name,
				path: file.path
			});
		}
		
		// Process #tool:name references in the body
		content = this.promptProcessor.processToolReferences(content, fullPrompt.tools);

		// Process user arguments if provided (including file references)
		const fetchedUrls: string[] = [];
		const loadedInlineNotes: string[] = [];
		
		if (userArgs) {
				// Process #fetch URL references in user args
				const { processedMessage: processedUserArgs, fetchedUrls: urls, fetchedContext } = await this.promptProcessor.processFetchReferences(userArgs);
				fetchedUrls.push(...urls);
				
				// Extract and process [[filename]] inline references in user args
				const inlineNoteRefs = this.extractInlineNoteReferences(processedUserArgs);
				const inlineNoteContext: string[] = [];
				for (const noteName of inlineNoteRefs) {
					const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
					if (file) {
						try {
							const noteContent = await this.app.vault.cachedRead(file);
							inlineNoteContext.push(`--- Content of "${file.path}" ---\n${noteContent}\n--- End of "${file.path}" ---`);
							loadedInlineNotes.push(file.basename);
							
							// Add to references
							usedReferences.push({
								type: "context",
								name: file.basename,
								path: file.path
							});
						} catch (e) {
							console.error(`Failed to read inline note reference: ${noteName}`, e);
						}
					}
				}
				
				// Add fetched URLs to references
				for (const url of fetchedUrls) {
					try {
						usedReferences.push({
							type: "url",
							name: new URL(url).hostname,
							path: url
						});
					} catch {
						usedReferences.push({
							type: "url",
							name: url,
							path: url
						});
					}
				}
				
				// Build the user args section only if there's fetched/referenced content
				// (raw user input is already used for ${userInput} in the prompt)
				if (fetchedContext.length > 0 || inlineNoteContext.length > 0) {
					let userArgsSection = `\n\n---\n**Referenced content:**\n`;
					
					// Add fetched web content
					if (fetchedContext.length > 0) {
						userArgsSection += `\n${fetchedContext.join("\n\n")}\n`;
					}
					
					// Add inline note content
					if (inlineNoteContext.length > 0) {
						userArgsSection += `\n${inlineNoteContext.join("\n\n")}\n`;
					}
					
					content += userArgsSection;
				}
			}
			
			// Render collapsible references section after the user message
			if (usedReferences.length > 0) {
				this.messageRenderer.renderUsedReferences(this.messagesContainer, usedReferences);
			}

			// Create streaming message element
			this.currentStreamingMessageEl = this.createMessageElement("assistant", "");
			this.scrollToBottom();

			// Override model if specified in prompt
			const originalModel = this.plugin.settings.model;
			if (fullPrompt.model) {
				this.githubCopilotCliService.updateConfig({ model: fullPrompt.model });
				console.log(`[VC] Prompt using model: ${fullPrompt.model}`);
			}

			// Calculate timeout (prompt can override default, specified in seconds, converted to ms)
			const timeoutMs = fullPrompt.timeout ? fullPrompt.timeout * 1000 : undefined;

			// Log tool context for debugging
			this.logToolContext(fullPrompt.tools);

			if (this.plugin.settings.streaming) {
				await this.githubCopilotCliService.sendMessageStreaming(
					content,
					(delta) => {
						if (this.currentStreamingMessageEl) {
							const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
							if (contentEl) {
								contentEl.textContent += delta;
							}
						}
						this.scrollToBottom();
					},
					async (fullContent) => {
						if (this.currentStreamingMessageEl) {
							await this.renderMarkdownContent(this.currentStreamingMessageEl, fullContent);
							this.addCopyButton(this.currentStreamingMessageEl);
						}
						this.currentStreamingMessageEl = null;
					},
					timeoutMs
				);
			} else {
				const response = await this.githubCopilotCliService.sendMessage(content, timeoutMs);
				if (this.currentStreamingMessageEl) {
					await this.renderMarkdownContent(this.currentStreamingMessageEl, response);
					this.addCopyButton(this.currentStreamingMessageEl);
				}
				this.currentStreamingMessageEl = null;
			}

			// Restore original model if we changed it
			if (fullPrompt.model) {
				this.githubCopilotCliService.updateConfig({ model: originalModel });
			}
		} catch (error) {
			new Notice(`Prompt execution error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.addErrorMessage(String(error));
		} finally {
			this.isProcessing = false;
			this.updateUIState();
			this.scrollToBottom();
		}
	}

	/**
	 * Execute a custom prompt (VS Code compatible)
	 */
	private async executePrompt(promptInfo: CachedPromptInfo): Promise<void> {
		// Clear the input
		this.inputEl.innerHTML = "";
		this.autoResizeInput();
		
		// Load the full prompt content
		const fullPrompt = await this.plugin.promptCache.getFullPrompt(promptInfo.name);
		if (!fullPrompt) {
			new Notice(`Could not load prompt: ${promptInfo.name}`);
			return;
		}
		
		// Ensure we have a session
		await this.ensureSessionExists();
		
		// Clear welcome message if present
		const welcomeEl = this.messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) {
			welcomeEl.remove();
		}
		
		// Display a user message showing which prompt was executed
		const userMessage = `Run prompt: **${promptInfo.name}**\n\n> ${promptInfo.description}`;
		await this.renderMessage({ role: "user", content: userMessage, timestamp: new Date() });
		
		// Scroll the new user message to the top of the visible area
		const promptUserMsgEl = this.messagesContainer.lastElementChild as HTMLElement;
		if (promptUserMsgEl) {
			this.scrollMessageToTop(promptUserMsgEl);
		}
		
		// Log agent from frontmatter if specified (agent switching requires selecting before prompt)
		if (fullPrompt.agent) {
			const agent = this.plugin.agentCache.getAgentByName(fullPrompt.agent);
			if (agent) {
				console.log(`[VC] Prompt specifies agent: ${agent.name}`);
				// Note: To use this agent, select it from the agent dropdown before running the prompt
			} else {
				console.warn(`[VC] Agent "${fullPrompt.agent}" specified in prompt not found`);
			}
		}
		
		// Set processing state
		this.isProcessing = true;
		this.updateUIState();
		
		try {
			// Create streaming message element
			this.currentStreamingMessageEl = this.createMessageElement("assistant", "");
			this.scrollToBottom();
			
			// Process the prompt content with VS Code compatible variable replacement
			let content = await this.promptProcessor.processVariables(fullPrompt.content, fullPrompt.path);
			
			// Process Markdown file links - resolve and include referenced content
			content = await this.promptProcessor.resolveMarkdownFileLinks(content, fullPrompt.path);
			
			// Process #tool:name references in the body
			content = this.promptProcessor.processToolReferences(content, fullPrompt.tools);

			// Override model if specified in prompt
			const originalModel = this.plugin.settings.model;
			if (fullPrompt.model) {
				this.githubCopilotCliService.updateConfig({ model: fullPrompt.model });
				console.log(`[VC] Prompt using model: ${fullPrompt.model}`);
			}

			// Log tool context for debugging
			this.logToolContext(fullPrompt.tools);

			if (this.plugin.settings.streaming) {
				await this.githubCopilotCliService.sendMessageStreaming(
					content,
					(delta) => {
						if (this.currentStreamingMessageEl) {
							const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
							if (contentEl) {
								contentEl.textContent += delta;
							}
						}
						this.scrollToBottom();
					},
					async (fullContent) => {
						if (this.currentStreamingMessageEl) {
							await this.renderMarkdownContent(this.currentStreamingMessageEl, fullContent);
							this.addCopyButton(this.currentStreamingMessageEl);
						}
						this.currentStreamingMessageEl = null;
					}
				);
			} else {
				const response = await this.githubCopilotCliService.sendMessage(content);
				if (this.currentStreamingMessageEl) {
					await this.renderMarkdownContent(this.currentStreamingMessageEl, response);
					this.addCopyButton(this.currentStreamingMessageEl);
				}
				this.currentStreamingMessageEl = null;
			}

			// Restore original model if we changed it
			if (fullPrompt.model) {
				this.githubCopilotCliService.updateConfig({ model: originalModel });
			}
		} catch (error) {
			new Notice(`Prompt execution error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.addErrorMessage(String(error));
		} finally {
			this.isProcessing = false;
			this.updateUIState();
			this.scrollToBottom();
		}
	}

	private insertCodeBlock(): void {
		// For contenteditable, insert code block at cursor position
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			// No selection, append at end
			const codeBlock = document.createTextNode("```\n\n```");
			this.inputEl.appendChild(codeBlock);
		} else {
			const range = selection.getRangeAt(0);
			if (this.inputEl.contains(range.commonAncestorContainer)) {
				const selectedText = range.toString();
				range.deleteContents();
				const codeText = selectedText ? 
					`\`\`\`\n${selectedText}\n\`\`\`` :
					"```\n\n```";
				const codeBlock = document.createTextNode(codeText);
				range.insertNode(codeBlock);
				
				// Move cursor inside the code block if empty
				if (!selectedText) {
					range.setStart(codeBlock, 4);
					range.collapse(true);
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		}
		this.inputEl.focus();
		this.autoResizeInput();
	}

	/**
	 * Process ${input:name:...} variables with pre-collected values
	 */
	private processInputVariablesWithValues(content: string, values: Map<string, string>): string {
		// Match ${input:name:description} or ${input:name:description|opt1|opt2|...}
		const inputRegex = /\$\{input:([^:}]+):([^}]+)\}/g;
		
		return content.replace(inputRegex, (match, varName, descAndOptions) => {
			// Check if we have a collected value for this variable
			if (values.has(varName)) {
				return values.get(varName) || '';
			}
			
			// Otherwise use first option as default
			const parts = descAndOptions.split('|');
			const options = parts.slice(1).map((opt: string) => opt.trim()).filter((opt: string) => opt);
			
			if (options.length > 0) {
				return options[0];
			}
			
			// No default available
			const description = parts[0]?.trim() || varName;
			return `[${description}]`;
		});
	}

	/**
	 * Extract [[filename]] inline note references from a message
	 * Returns array of note names (without the brackets)
	 */
	private extractInlineNoteReferences(message: string): string[] {
		const noteRefs: string[] = [];
		const regex = /\[\[([^\]]+)\]\]/g;
		let match;
		while ((match = regex.exec(message)) !== null) {
			// Get the note name, handling aliases like [[note|alias]]
			const fullRef = match[1];
			if (fullRef) {
				const noteName = fullRef.split("|")[0]?.trim();
				if (noteName && !noteRefs.includes(noteName)) {
					noteRefs.push(noteName);
				}
			}
		}
		return noteRefs;
	}

	/**
	 * Log tool context to SDK logs for debugging
	 * Shows all available tools and which ones are enabled for this request
	 */
	private logToolContext(promptTools?: string[]): void {
		if (!this.toolCatalog) return;
		
		const tracingService = getTracingService();
		const currentSession = this.sessionManager.getCurrentSession();
		const allTools = this.toolCatalog.getAllTools();
		const enabledTools = this.toolCatalog.getEnabledTools(this.plugin.settings, currentSession);
		const toolsBySource = this.toolCatalog.getToolsBySource();
		
		// Build detailed tool report
		const lines: string[] = ['[Tool Context]'];
		
		// Prompt-specified tools (if any)
		if (promptTools && promptTools.length > 0) {
			lines.push(`\nPrompt specifies tools: ${promptTools.join(', ')}`);
		}
		
		// Summary
		lines.push(`\nEnabled: ${enabledTools.length}/${allTools.length} tools`);
		
		// Group by source
		for (const [source, tools] of Object.entries(toolsBySource)) {
			const sourceEnabled = tools.filter(t => enabledTools.includes(t.id));
			if (tools.length > 0) {
				lines.push(`\n[${source.toUpperCase()}] (${sourceEnabled.length}/${tools.length} enabled)`);
				for (const tool of tools) {
					const status = enabledTools.includes(tool.id) ? '✓' : '○';
					lines.push(`  ${status} ${tool.id}`);
				}
			}
		}
		
		tracingService.addSdkLog('info', lines.join('\n'), 'tool-context');
	}

	private scrollToBottom(): void {
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	/**
	 * Scroll so that the given message element appears at the top of the visible area.
	 * This creates the effect of "clearing the page" while keeping history below.
	 */
	private scrollMessageToTop(messageEl: HTMLElement): void {
		// Get the element's position relative to the scroll container
		const containerRect = this.messagesContainer.getBoundingClientRect();
		const messageRect = messageEl.getBoundingClientRect();
		
		// Calculate how much to scroll: current scroll + message position relative to container top
		const scrollAmount = this.messagesContainer.scrollTop + (messageRect.top - containerRect.top);
		this.messagesContainer.scrollTop = scrollAmount;
	}
}
