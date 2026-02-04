import { Plugin, Notice } from "obsidian";
import { DEFAULT_SETTINGS, CopilotPluginSettings, CopilotSettingTab, CopilotSession, AIProviderProfile, generateProfileId, OpenAIProviderProfile, AzureOpenAIProviderProfile, getProfileById } from "./settings";
import { GitHubCopilotCliService, GitHubCopilotCliConfig, ChatMessage } from "./copilot/GitHubCopilotCliService";
import { CopilotChatView, COPILOT_VIEW_TYPE } from "./ui/ChatView";
import { CliManager } from "./copilot/CliManager";
import { 
	SkillRegistry, 
	getSkillRegistry, 
	VaultCopilotSkill, 
	SkillInfo, 
	SkillResult,
	McpServerConfig,
	SkillRegistryEvent
} from "./copilot/SkillRegistry";
import { McpManager } from "./copilot/McpManager";
import { AgentCache, CachedAgentInfo } from "./copilot/AgentCache";
import { PromptCache, CachedPromptInfo } from "./copilot/PromptCache";
import { CustomPrompt } from "./copilot/CustomizationLoader";
import { OpenAIService } from "./copilot/OpenAIService";
import { AzureOpenAIService } from "./copilot/AzureOpenAIService";
import { AIProviderType, AIProvider, getOpenAIApiKey } from "./copilot/AIProvider";
import { getTracingService } from "./copilot/TracingService";
import { MainVaultAssistant } from "./realtime-agent/MainVaultAssistant";
import { isMobile, supportsLocalProcesses } from "./utils/platform";

/**
 * Session info returned by the API
 */
export interface SessionInfo {
	id: string;
	name: string;
	createdAt: number;
	lastUsedAt: number;
	completedAt?: number;
	durationMs?: number;
	archived: boolean;
	messageCount: number;
}

// Re-export skill types for external plugins
export type { VaultCopilotSkill, SkillInfo, SkillResult, McpServerConfig, SkillRegistryEvent, CachedAgentInfo, CachedPromptInfo, CustomPrompt };

/**
 * Public API for other plugins to interact with Vault Copilot
 */
export interface VaultCopilotAPI {
	/** Check if the Copilot service is connected */
	isConnected(): boolean;
	
	/** Connect to GitHub Copilot */
	connect(): Promise<void>;
	
	/** Disconnect from GitHub Copilot */
	disconnect(): Promise<void>;
	
	/** Send a message and wait for the complete response */
	sendMessage(prompt: string): Promise<string>;
	
	/** Send a message with streaming response */
	sendMessageStreaming(
		prompt: string,
		onDelta: (delta: string) => void,
		onComplete?: (fullContent: string) => void
	): Promise<void>;
	
	/** Get message history from the current session */
	getMessageHistory(): ChatMessage[];
	
	/** Clear the current chat session */
	clearHistory(): Promise<void>;
	
	// ===== Session Management =====
	
	/** List all sessions */
	listSessions(): SessionInfo[];
	
	/** Get the active session ID */
	getActiveSessionId(): string | null;
	
	/** Create a new session */
	createSession(name?: string): Promise<SessionInfo>;
	
	/** Load a session by ID */
	loadSession(sessionId: string): Promise<void>;
	
	/** Archive a session */
	archiveSession(sessionId: string): Promise<void>;
	
	/** Unarchive a session */
	unarchiveSession(sessionId: string): Promise<void>;
	
	/** Delete a session */
	deleteSession(sessionId: string): Promise<void>;
	
	/** Rename a session */
	renameSession(sessionId: string, newName: string): Promise<void>;
	
	// ===== Skill Registration =====
	
	/** 
	 * Register a custom skill/tool that the AI can invoke
	 * @throws Error if skill with same name already exists
	 */
	registerSkill(skill: VaultCopilotSkill): void;
	
	/** 
	 * Update an existing skill
	 * @throws Error if skill doesn't exist
	 */
	updateSkill(skill: VaultCopilotSkill): void;
	
	/** Unregister a skill by name */
	unregisterSkill(name: string): boolean;
	
	/** Unregister all skills from a plugin */
	unregisterPluginSkills(pluginId: string): number;
	
	/** List all registered skills */
	listSkills(): SkillInfo[];
	
	/** List skills by category */
	listSkillsByCategory(category: string): SkillInfo[];
	
	/** List skills registered by a specific plugin */
	listSkillsByPlugin(pluginId: string): SkillInfo[];
	
	/** Check if a skill is registered */
	hasSkill(name: string): boolean;
	
	/** Execute a skill by name */
	executeSkill(name: string, args: Record<string, unknown>): Promise<SkillResult>;
	
	/** Subscribe to skill registry changes */
	onSkillChange(listener: (event: SkillRegistryEvent) => void): () => void;
	
	// ===== MCP Server Configuration =====
	
	/** Configure an MCP server */
	configureMcpServer(id: string, config: McpServerConfig): void;
	
	/** Remove an MCP server configuration */
	removeMcpServer(id: string): boolean;
	
	/** Get all configured MCP servers */
	getMcpServers(): Map<string, McpServerConfig>;
	
	// ===== Prompt Operations =====
	
	/** List all available prompts */
	listPrompts(): CachedPromptInfo[];
	
	/** Get a prompt by name (cached info only) */
	getPromptInfo(name: string): CachedPromptInfo | undefined;
	
	/** Get the full prompt content by name */
	getFullPrompt(name: string): Promise<CustomPrompt | undefined>;
	
	/** Execute a prompt by name */
	executePrompt(name: string, variables?: Record<string, string>): Promise<string>;
	
	// ===== Note Operations =====
	
	/** Read a note by path */
	readNote(path: string): Promise<{ success: boolean; content?: string; error?: string }>;
	
	/** Search notes by query */
	searchNotes(query: string, limit?: number): Promise<{ results: Array<{ path: string; title: string; excerpt: string }> }>;
	
	/** Create a new note */
	createNote(path: string, content: string): Promise<{ success: boolean; path?: string; error?: string }>;
	
	/** Get the currently active note */
	getActiveNote(): Promise<{ hasActiveNote: boolean; path?: string; title?: string; content?: string }>;
	
	/** List notes and subfolders in a folder (non-recursive) */
	listNotes(folder?: string): Promise<{ items: Array<{ path: string; name: string; type: 'file' | 'folder' }> }>;
	
	/** List all notes recursively from a folder */
	listNotesRecursively(folder?: string, limit?: number): Promise<{ notes: Array<{ path: string; title: string }>; total: number; truncated: boolean }>;
	
	/** Append content to a note */
	appendToNote(path: string, content: string): Promise<{ success: boolean; error?: string }>;
	
	/** Read multiple notes at once */
	batchReadNotes(paths: string[], aiSummarize?: boolean, summaryPrompt?: string): Promise<{ results: Array<{ path: string; success: boolean; content?: string; summary?: string; error?: string }> }>;
	
	/** Update/replace entire note content */
	updateNote(path: string, content: string): Promise<{ success: boolean; error?: string }>;
	
	/** Delete a note (moves to trash) */
	deleteNote(path: string): Promise<{ success: boolean; error?: string }>;
	
	/** Get recently modified files */
	getRecentChanges(limit?: number): Promise<{ files: Array<{ path: string; title: string; mtime: number; mtimeFormatted: string }> }>;
	
	/** Get daily note for a date */
	getDailyNote(date?: string): Promise<{ success: boolean; path?: string; content?: string; exists: boolean; error?: string }>;
	
	/** Rename/move a note */
	renameNote(oldPath: string, newPath: string): Promise<{ success: boolean; newPath?: string; error?: string }>;
}

export default class CopilotPlugin extends Plugin {
	settings: CopilotPluginSettings;
	githubCopilotCliService: GitHubCopilotCliService | null = null;
	openaiService: OpenAIService | null = null;
	azureOpenaiService: AzureOpenAIService | null = null;
	skillRegistry: SkillRegistry;
	agentCache: AgentCache;
	promptCache: PromptCache;
	mcpManager: McpManager;
	private statusBarEl: HTMLElement | null = null;

	/**
	 * Get the currently active AI service based on settings
	 * Initializes the service on demand if not already initialized
	 */
	getActiveService(): AIProvider | GitHubCopilotCliService | null {
		// If a chat provider profile is selected, use it
		if (this.settings.chatProviderProfileId) {
			const profile = getProfileById(this.settings, this.settings.chatProviderProfileId);
			if (profile?.type === "openai") {
				// Initialize OpenAI service on demand
				if (!this.openaiService && (profile as OpenAIProviderProfile).apiKey) {
					this.initializeOpenAIService(profile as OpenAIProviderProfile);
				}
				return this.openaiService;
			} else if (profile?.type === "azure-openai") {
				// Initialize Azure service on demand
				if (!this.azureOpenaiService && (profile as AzureOpenAIProviderProfile).apiKey) {
					this.initializeAzureService(profile as AzureOpenAIProviderProfile);
				}
				return this.azureOpenaiService;
			}
		}
		
		// Fall back to legacy settings
		if (this.settings.aiProvider === "openai") {
			// Initialize OpenAI service on demand if not already initialized
			if (!this.openaiService) {
				this.initializeOpenAIServiceFromSettings();
			}
			return this.openaiService;
		} else if (this.settings.aiProvider === "azure-openai") {
			// Initialize Azure service on demand if not already initialized
			if (!this.azureOpenaiService) {
				this.initializeAzureServiceFromSettings();
			}
			return this.azureOpenaiService;
		}
		return this.githubCopilotCliService;
	}
	
	/**
	 * Initialize OpenAI service from profile
	 */
	private initializeOpenAIService(profile: OpenAIProviderProfile): void {
		try {
			this.openaiService = new OpenAIService(this.app, {
				provider: "openai",
				model: profile.model || "gpt-4o",
				streaming: true,
				apiKey: profile.apiKey,
				baseURL: profile.baseURL,
				mcpManager: this.mcpManager,
			});
		} catch (error) {
			console.error("[VaultCopilot] Failed to initialize OpenAI service:", error);
		}
	}
	
	/**
	 * Initialize Azure service from profile
	 */
	private initializeAzureService(profile: AzureOpenAIProviderProfile): void {
		try {
			this.azureOpenaiService = new AzureOpenAIService(this.app, {
				provider: "azure-openai",
				model: profile.model || "gpt-4o",
				streaming: true,
				apiKey: profile.apiKey,
				endpoint: profile.endpoint,
				deploymentName: profile.deploymentName,
				apiVersion: profile.apiVersion,
				mcpManager: this.mcpManager,
			});
		} catch (error) {
			console.error("[VaultCopilot] Failed to initialize Azure service:", error);
		}
	}
	
	/**
	 * Initialize OpenAI service from legacy settings
	 */
	private initializeOpenAIServiceFromSettings(): void {
		// This is for backward compatibility with legacy settings
		// In practice, users should use profiles
		const apiKey = getOpenAIApiKey();
		if (apiKey) {
			this.initializeOpenAIService({
				id: "legacy-openai",
				name: "OpenAI (Legacy)",
				type: "openai",
				apiKey: apiKey,
			});
		}
	}
	
	/**
	 * Initialize Azure service from legacy settings  
	 */
	private initializeAzureServiceFromSettings(): void {
		// This is for backward compatibility - users should use profiles
		console.warn("[VaultCopilot] Azure service initialization from legacy settings not fully implemented");
	}

	/**
	 * Check if any service is connected
	 */
	isAnyServiceConnected(): boolean {
		// If a chat provider profile is selected, check it
		if (this.settings.chatProviderProfileId) {
			const profile = getProfileById(this.settings, this.settings.chatProviderProfileId);
			if (profile?.type === "openai") {
				return this.openaiService?.isReady() ?? false;
			} else if (profile?.type === "azure-openai") {
				return this.azureOpenaiService?.isReady() ?? false;
			}
		}
		
		// Fall back to legacy settings
		if (this.settings.aiProvider === "openai") {
			return this.openaiService?.isReady() ?? false;
		} else if (this.settings.aiProvider === "azure-openai") {
			return this.azureOpenaiService?.isReady() ?? false;
		}
		return this.githubCopilotCliService?.isConnected() ?? false;
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		// Validate provider compatibility on load (mobile check)
		if (isMobile && this.settings.aiProvider === "copilot") {
			// Auto-switch to OpenAI on mobile if Copilot was selected
			this.settings.aiProvider = "openai";
			await this.saveSettings();
			new Notice(
				"GitHub Copilot CLI is unavailable on mobile. " +
				"Switched to OpenAI. Please configure your API key in settings."
			);
		}

		// Auto-discover available models from CLI if not already cached (desktop only)
		if (supportsLocalProcesses() && (!this.settings.availableModels || this.settings.availableModels.length === 0)) {
			this.discoverModels();
		}

		// Initialize tracing if enabled
		if (this.settings.tracingEnabled) {
			getTracingService().enable();
		}

		// Initialize skill registry
		this.skillRegistry = getSkillRegistry();

		// Register built-in voice agents with the VoiceAgentRegistry
		MainVaultAssistant.registerBuiltInAgents();

		// Initialize agent cache
		this.agentCache = new AgentCache(this.app);
		await this.agentCache.initialize(this.settings.agentDirectories);

		// Initialize prompt cache
		this.promptCache = new PromptCache(this.app);
		await this.promptCache.initialize(this.settings.promptDirectories);

		// Initialize MCP manager (platform-aware internally)
		this.mcpManager = new McpManager(this.app);
		await this.mcpManager.initialize();

		// Initialize Copilot service (desktop only)
		if (supportsLocalProcesses()) {
			this.githubCopilotCliService = new GitHubCopilotCliService(this.app, this.getServiceConfig());
		}
		
		// Initialize OpenAI/Azure services for mobile or desktop alternative providers
		// These are initialized lazily when needed, but we ensure they're available
		// The active service is determined by settings and getActiveService()

		// Register the chat view with nullable copilotService
		// The view will use plugin.getActiveService() to get the appropriate provider
		this.registerView(
			COPILOT_VIEW_TYPE,
			(leaf) => new CopilotChatView(leaf, this, this.githubCopilotCliService)
		);

		// Add ribbon icon to open chat
		this.addRibbonIcon("message-square", "Open Vault Copilot", () => {
			this.activateChatView();
		});

		// Add status bar item
		if (this.settings.showInStatusBar) {
			this.statusBarEl = this.addStatusBarItem();
			this.statusBarEl.addEventListener("click", () => {
				this.toggleCopilotView();
			});
			this.updateStatusBar();
		}

		// Add commands
		this.addCommand({
			id: "open-copilot-chat",
			name: "Open chat",
			callback: () => {
				this.activateChatView();
			},
		});

		this.addCommand({
			id: "copilot-new-chat",
			name: "Start new chat",
			callback: async () => {
				if (this.githubCopilotCliService) {
					await this.githubCopilotCliService.clearHistory();
					await this.activateChatView();
				}
			},
		});

		this.addCommand({
			id: "copilot-summarize-note",
			name: "Summarize current note",
			editorCallback: async () => {
				await this.activateChatView();
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && this.githubCopilotCliService) {
					// The view will handle the actual message sending
				}
			},
		});

		this.addCommand({
			id: "copilot-connect",
			name: "Connect to Vault Copilot",
			callback: async () => {
				await this.connectCopilot();
			},
		});

		this.addCommand({
			id: "copilot-disconnect",
			name: "Disconnect from Vault Copilot",
			callback: async () => {
				await this.disconnectCopilot();
			},
		});

		// Add settings tab
		this.addSettingTab(new CopilotSettingTab(this.app, this));

		// Auto-connect on startup (optional)
		// await this.connectCopilot();
	}

	async onunload(): Promise<void> {
		await this.disconnectCopilot();
		await this.mcpManager?.shutdown();
		this.agentCache?.destroy();
		this.promptCache?.destroy();
		
		// Unregister built-in voice agents
		MainVaultAssistant.unregisterBuiltInAgents();
	}

	async loadSettings(): Promise<void> {
		const savedData = await this.loadData() as Partial<CopilotPluginSettings> || {};
		
		// Deep merge to preserve nested object defaults (voice, openai, periodicNotes)
		this.settings = {
			...DEFAULT_SETTINGS,
			...savedData,
			// Deep merge nested objects - ensure required properties have defaults
			voice: {
				...DEFAULT_SETTINGS.voice,
				...(savedData.voice || {}),
				// Deep merge voiceAgentFiles
				voiceAgentFiles: {
					...DEFAULT_SETTINGS.voice?.voiceAgentFiles,
					...(savedData.voice?.voiceAgentFiles || {}),
				},
				// Ensure required properties are set
				backend: savedData.voice?.backend ?? DEFAULT_SETTINGS.voice?.backend ?? 'openai-whisper',
				whisperServerUrl: savedData.voice?.whisperServerUrl ?? DEFAULT_SETTINGS.voice?.whisperServerUrl ?? 'http://127.0.0.1:8080',
				language: savedData.voice?.language ?? DEFAULT_SETTINGS.voice?.language ?? 'auto',
			},
			openai: {
				...DEFAULT_SETTINGS.openai,
				...(savedData.openai || {}),
			},
			periodicNotes: {
				...DEFAULT_SETTINGS.periodicNotes,
				...(savedData.periodicNotes || {}),
			},
			// Ensure AI provider profiles array exists
			aiProviderProfiles: savedData.aiProviderProfiles ?? [],
			voiceInputProfileId: savedData.voiceInputProfileId ?? null,
			realtimeAgentProfileId: savedData.realtimeAgentProfileId ?? null,
		};

		// Migration: Create a profile from existing voice settings if no profiles exist
		await this.migrateVoiceSettingsToProfiles();
		
		// Ensure built-in profiles (like GitHub Copilot CLI) exist
		const { ensureBuiltInProfiles } = await import('./settings');
		ensureBuiltInProfiles(this.settings);
		await this.saveSettings();
	}

	/**
	 * Migrate existing voice settings to AI Provider profiles
	 * This runs once when upgrading from the old inline settings format
	 */
	private async migrateVoiceSettingsToProfiles(): Promise<void> {
		// Skip if profiles already exist
		if (this.settings.aiProviderProfiles && this.settings.aiProviderProfiles.length > 0) {
			return;
		}

		// Skip if voice input is not enabled or no backend configured
		if (!this.settings.voice?.voiceInputEnabled) {
			return;
		}

		const backend = this.settings.voice.backend;
		let profile: AIProviderProfile | null = null;

		if (backend === 'openai-whisper') {
			// Check if there's an API key configured (either inline or from env)
			const { getOpenAIApiKey } = await import('./copilot/AIProvider');
			const apiKey = this.settings.openai?.apiKey || getOpenAIApiKey() || '';
			
			if (apiKey) {
				profile = {
					id: generateProfileId(),
					name: 'OpenAI (Migrated)',
					type: 'openai',
					apiKey: this.settings.openai?.apiKey || '', // Only store inline key, not env
					baseURL: this.settings.openai?.baseURL || undefined,
				};
			}
		} else if (backend === 'azure-whisper') {
			// Check if Azure settings are configured
			const azure = this.settings.voice.azure;
			if (azure?.endpoint && azure?.deploymentName) {
				const { getAzureOpenAIApiKey } = await import('./voice-chat/AzureWhisperService');
				profile = {
					id: generateProfileId(),
					name: 'Azure OpenAI (Migrated)',
					type: 'azure-openai',
					apiKey: '', // Azure key must be in env variable
					endpoint: azure.endpoint,
					deploymentName: azure.deploymentName,
					apiVersion: azure.apiVersion,
				};
			}
		} else if (backend === 'local-whisper') {
			// Local whisper server - create profile from server URL
			const serverUrl = this.settings.voice.whisperServerUrl;
			if (serverUrl) {
				profile = {
					id: generateProfileId(),
					name: 'Local Whisper (Migrated)',
					type: 'local',
					serverUrl: serverUrl,
				};
			}
		}

		// Save the migrated profile
		if (profile) {
			this.settings.aiProviderProfiles = [profile];
			this.settings.voiceInputProfileId = profile.id;
			console.log(`[CopilotPlugin] Migrated voice settings to profile: ${profile.name}`);
			await this.saveSettings();
		}
	}

	/**
	 * Discover available models from CLI (runs in background, doesn't block startup)
	 */
	private async discoverModels(): Promise<void> {
		const cliManager = new CliManager(this.settings.cliPath || undefined);
		const status = await cliManager.getStatus();
		
		if (!status.installed) {
			console.log("[CopilotPlugin] CLI not installed, skipping model discovery");
			return;
		}
		
		const result = await cliManager.fetchAvailableModels();
		if (result.models.length > 0) {
			this.settings.availableModels = result.models;
			await this.saveSettings();
			console.log(`[CopilotPlugin] Discovered ${result.models.length} models from CLI`);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		
		// Update service config when settings change
		if (this.githubCopilotCliService) {
			this.githubCopilotCliService.updateConfig(this.getServiceConfig());
		}
		
		// Update tracing when setting changes
		const tracingService = getTracingService();
		if (this.settings.tracingEnabled) {
			tracingService.enable();
		} else {
			tracingService.disable();
		}
		
		// Update agent cache when agent directories change
		if (this.agentCache) {
			await this.agentCache.updateDirectories(this.settings.agentDirectories);
		}
		
		// Update prompt cache when prompt directories change
		if (this.promptCache) {
			await this.promptCache.updateDirectories(this.settings.promptDirectories);
		}
	}

	private getServiceConfig(): GitHubCopilotCliConfig {
		// Resolve relative paths to absolute paths based on vault location
		const vaultPath = this.getVaultBasePath();
		
		const resolvePaths = (paths: string[]): string[] => {
			if (!vaultPath) return paths;
			return paths.map(p => {
				// If already absolute, use as-is
				if (p.startsWith('/') || p.match(/^[A-Za-z]:\\/)) {
					return p;
				}
				// Otherwise, resolve relative to vault
				return `${vaultPath}/${p}`.replace(/\\/g, '/');
			});
		};

		return {
			model: this.settings.model,
			cliPath: this.settings.cliPath || undefined,
			cliUrl: this.settings.cliUrl || undefined,
			streaming: this.settings.streaming,
			requestTimeout: this.settings.requestTimeout,
			tracingEnabled: this.settings.tracingEnabled,
			skillRegistry: this.skillRegistry,
			mcpManager: this.mcpManager,
			skillDirectories: resolvePaths(this.settings.skillDirectories),
			agentDirectories: resolvePaths(this.settings.agentDirectories),
			instructionDirectories: resolvePaths(this.settings.instructionDirectories),
			promptDirectories: resolvePaths(this.settings.promptDirectories),
		};
	}

	private getVaultBasePath(): string | undefined {
		const adapter = this.app.vault.adapter;
		if ('getBasePath' in adapter && typeof adapter.getBasePath === 'function') {
			return adapter.getBasePath();
		}
		return undefined;
	}

	async activateChatView(): Promise<void> {
		const { workspace } = this.app;
		
		let leaf = workspace.getLeavesOfType(COPILOT_VIEW_TYPE)[0];

		if (!leaf) {
			// Open in right sidebar by default
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({ type: COPILOT_VIEW_TYPE, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async connectCopilot(): Promise<void> {
		// Check if a chat provider profile is selected
		if (this.settings.chatProviderProfileId) {
			const profile = getProfileById(this.settings, this.settings.chatProviderProfileId);
			if (profile) {
				if (profile.type === "openai") {
					return this.connectOpenAI(profile as OpenAIProviderProfile);
				} else if (profile.type === "azure-openai") {
					return this.connectAzureOpenAI(profile as AzureOpenAIProviderProfile);
				}
			}
		}
		
		// Fall back to legacy settings
		const provider = this.settings.aiProvider;
		
		if (provider === "openai") {
			// Connect to OpenAI using legacy settings
			if (!this.openaiService) {
				this.openaiService = new OpenAIService(this.app, {
					provider: "openai",
					model: this.settings.openai.model,
					streaming: this.settings.streaming,
					apiKey: this.settings.openai.apiKey || undefined,
					baseURL: this.settings.openai.baseURL || undefined,
					organization: this.settings.openai.organization || undefined,
					maxTokens: this.settings.openai.maxTokens,
					temperature: this.settings.openai.temperature,
					mcpManager: this.mcpManager, // Add MCP support
				});
			}

			try {
				await this.openaiService.initialize();
				this.updateStatusBar();
			} catch (error) {
				new Notice(`Failed to connect to OpenAI: ${error}`);
			}
		} else if (provider === "azure-openai") {
			// Connect to Azure OpenAI using legacy settings (if we add them)
			new Notice("Azure OpenAI requires a provider profile. Please configure a profile in settings.");
		} else {
			// Connect to GitHub Copilot
			if (!this.githubCopilotCliService) {
				this.githubCopilotCliService = new GitHubCopilotCliService(this.app, this.getServiceConfig());
			}

			try {
				await this.githubCopilotCliService.start();
				this.updateStatusBar();
			} catch (error) {
				new Notice(`Failed to connect to Copilot: ${error}`);
			}
		}
	}

	/**
	 * Connect to OpenAI using a provider profile
	 */
	private async connectOpenAI(profile: OpenAIProviderProfile): Promise<void> {
		if (!this.openaiService) {
			// Use profile model if set, otherwise use default
			const model = profile.model || this.settings.openai.model || "gpt-4o";
			this.openaiService = new OpenAIService(this.app, {
				provider: "openai",
				model: model,
				streaming: this.settings.streaming,
				apiKey: profile.apiKey || undefined,
				baseURL: profile.baseURL || undefined,
				maxTokens: this.settings.openai.maxTokens,
				temperature: this.settings.openai.temperature,
				mcpManager: this.mcpManager, // Add MCP support
			});
		}

		try {
			await this.openaiService.initialize();
			this.updateStatusBar();
		} catch (error) {
			new Notice(`Failed to connect to OpenAI: ${error}`);
		}
	}

	/**
	 * Connect to Azure OpenAI using a provider profile
	 */
	private async connectAzureOpenAI(profile: AzureOpenAIProviderProfile): Promise<void> {
		if (!this.azureOpenaiService) {
			if (!profile.deploymentName) {
				new Notice("Azure OpenAI profile requires a deployment name");
				return;
			}
			
			// Use profile model if set, otherwise use deployment name
			const model = profile.model || profile.deploymentName;
			
			this.azureOpenaiService = new AzureOpenAIService(this.app, {
				provider: "azure-openai",
				model: model,
				deploymentName: profile.deploymentName,
				streaming: this.settings.streaming,
				apiKey: profile.apiKey,
				endpoint: profile.endpoint,
				apiVersion: profile.apiVersion,
				maxTokens: this.settings.openai.maxTokens,
				temperature: this.settings.openai.temperature,
				mcpManager: this.mcpManager, // Add MCP support
			});
		}

		try {
			await this.azureOpenaiService.initialize();
			this.updateStatusBar();
		} catch (error) {
			new Notice(`Failed to connect to Azure OpenAI: ${error}`);
		}
	}

	async disconnectCopilot(): Promise<void> {
		// Disconnect all services
		if (this.githubCopilotCliService) {
			try {
				await this.githubCopilotCliService.stop();
			} catch (error) {
				console.error("Error disconnecting Copilot:", error);
			}
		}
		
		if (this.openaiService) {
			try {
				await this.openaiService.destroy();
			} catch (error) {
				console.error("Error disconnecting OpenAI:", error);
			}
		}
		
		if (this.azureOpenaiService) {
			try {
				await this.azureOpenaiService.destroy();
			} catch (error) {
				console.error("Error disconnecting Azure OpenAI:", error);
			}
		}
		
		this.updateStatusBar();
	}

	updateStatusBar(): void {
		if (!this.statusBarEl) {
			if (this.settings.showInStatusBar) {
				this.statusBarEl = this.addStatusBarItem();
				// Add click handler only once when creating the status bar
				this.statusBarEl.addEventListener("click", () => {
					this.toggleCopilotView();
				});
			} else {
				return;
			}
		}

		if (!this.settings.showInStatusBar) {
			this.statusBarEl.remove();
			this.statusBarEl = null;
			return;
		}

		const isConnected = this.isAnyServiceConnected();
		
		// Determine provider name
		let providerName = "Copilot";
		let providerType: "copilot" | "openai" | "azure-openai" = "copilot";
		
		if (this.settings.chatProviderProfileId) {
			const profile = getProfileById(this.settings, this.settings.chatProviderProfileId);
			if (profile?.type === "openai") {
				providerName = "OpenAI";
				providerType = "openai";
			} else if (profile?.type === "azure-openai") {
				providerName = "Azure OpenAI";
				providerType = "azure-openai";
			}
		} else if (this.settings.aiProvider === "openai") {
			providerName = "OpenAI";
			providerType = "openai";
		} else if (this.settings.aiProvider === "azure-openai") {
			providerName = "Azure OpenAI";
			providerType = "azure-openai";
		}
		
		this.statusBarEl.empty();
		
		const statusEl = this.statusBarEl.createSpan({ cls: "vc-status" });
		statusEl.setAttribute("aria-label", isConnected ? "Toggle Vault Copilot window" : `Connect to ${providerName}`);
		
		// Provider logo SVG
		const logoEl = statusEl.createSpan({ cls: "vc-status-logo" });
		if (providerType === "openai" || providerType === "azure-openai") {
			// OpenAI logo (used for both OpenAI and Azure OpenAI)
			logoEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`;
		} else {
			// GitHub Copilot logo
			logoEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.25 2.5h1.5a4.75 4.75 0 0 1 4.75 4.75v.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-.5a3.25 3.25 0 0 0-3.25-3.25h-1.5a3.25 3.25 0 0 0-3.25 3.25v.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-.5A4.75 4.75 0 0 1 7.25 2.5zm-3 4.25a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0zm5.5 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0zM2 11.5c0-.83.67-1.5 1.5-1.5h9c.83 0 1.5.67 1.5 1.5v1c0 .83-.67 1.5-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-1zm1.5-.5a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h9a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9z"/></svg>`;
		}
		
		// Connection status indicator
		statusEl.createSpan({ 
			cls: `vc-status-indicator ${isConnected ? "vc-connected" : "vc-disconnected"}` 
		});
	}

	/**
	 * Toggle the Copilot chat view visibility
	 */
	toggleCopilotView(): void {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(COPILOT_VIEW_TYPE);
		
		if (leaves.length > 0) {
			// View exists - close it
			leaves.forEach(leaf => leaf.detach());
		} else {
			// View doesn't exist - open it
			this.activateChatView();
			// Auto-connect if not connected
			if (!this.isAnyServiceConnected()) {
				this.connectCopilot();
			}
		}
	}

	/**
	 * Load a previous session by ID
	 */
	async loadSession(sessionId: string): Promise<void> {
		// Find the session in settings
		const session = this.settings.sessions.find(s => s.id === sessionId);
		if (!session) {
			new Notice("Session not found");
			return;
		}

		if (this.githubCopilotCliService) {
			await this.githubCopilotCliService.loadSession(sessionId, session.messages || []);
			
			// Update settings to mark this session as active
			this.settings.activeSessionId = sessionId;
			session.lastUsedAt = Date.now();
			await this.saveSettings();
			
			this.activateChatView();
		}
	}

	/**
	 * Get the public API for other plugins to use
	 * Usage: const vc = (app as any).plugins.plugins['obsidian-vault-copilot']?.api;
	 */
	get api(): VaultCopilotAPI {
		// Note: copilotService handles note operations, while chat can use either provider
		const githubCopilotCliService = this.githubCopilotCliService;
		const plugin = this;
		
		// Helper to convert CopilotSession to SessionInfo
		const toSessionInfo = (session: CopilotSession): SessionInfo => ({
			id: session.id,
			name: session.name,
			createdAt: session.createdAt,
			lastUsedAt: session.lastUsedAt,
			completedAt: session.completedAt,
			durationMs: session.durationMs,
			archived: session.archived,
			messageCount: session.messages?.length ?? 0,
		});
		
		return {
			isConnected: () => plugin.isAnyServiceConnected(),
			
			connect: async () => {
				await plugin.connectCopilot();
			},
			
			disconnect: async () => {
				await plugin.disconnectCopilot();
			},
			
			sendMessage: async (prompt: string) => {
				// Use the active provider for chat
				if (plugin.settings.aiProvider === "openai") {
					if (!plugin.openaiService) throw new Error("OpenAI service not initialized");
					if (!plugin.openaiService.isReady()) await plugin.connectCopilot();
					return await plugin.openaiService.sendMessage(prompt);
				} else {
					if (!githubCopilotCliService) throw new Error("VaultCopilot service not initialized");
					if (!githubCopilotCliService.isConnected()) await plugin.connectCopilot();
					return await githubCopilotCliService.sendMessage(prompt);
				}
			},
			
			sendMessageStreaming: async (prompt, onDelta, onComplete) => {
				// Use the active provider for chat
				if (plugin.settings.aiProvider === "openai") {
					if (!plugin.openaiService) throw new Error("OpenAI service not initialized");
					if (!plugin.openaiService.isReady()) await plugin.connectCopilot();
					return await plugin.openaiService.sendMessageStreaming(prompt, {
						onDelta,
						onComplete,
					});
				} else {
					if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
					if (!githubCopilotCliService.isConnected()) await plugin.connectCopilot();
					return await githubCopilotCliService.sendMessageStreaming(prompt, onDelta, onComplete);
				}
			},
			
			getMessageHistory: () => {
				if (plugin.settings.aiProvider === "openai" && plugin.openaiService) {
					return plugin.openaiService.getMessageHistory();
				}
				return githubCopilotCliService?.getMessageHistory() ?? [];
			},
			
			clearHistory: async () => {
				if (plugin.settings.aiProvider === "openai" && plugin.openaiService) {
					plugin.openaiService.clearHistory();
					return;
				}
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.clearHistory();
			},
			
			// ===== Session Management =====
			
			listSessions: () => {
				return plugin.settings.sessions.map(toSessionInfo);
			},
			
			getActiveSessionId: () => {
				return plugin.settings.activeSessionId;
			},
			
			createSession: async (name?: string) => {
				const now = Date.now();
				const sessionId = `session-${now}`;
				
				// Create the SDK session first to get the actual session ID
				let actualSessionId = sessionId;
				if (githubCopilotCliService) {
					actualSessionId = await githubCopilotCliService.createSession(sessionId);
				}
				
				const newSession: CopilotSession = {
					id: actualSessionId,
					name: name || `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
					createdAt: now,
					lastUsedAt: now,
					archived: false,
					messages: [],
				};
				plugin.settings.sessions.push(newSession);
				plugin.settings.activeSessionId = newSession.id;
				await plugin.saveSettings();
				
				return toSessionInfo(newSession);
			},
			
			loadSession: async (sessionId: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				
				await plugin.loadSession(sessionId);
			},
			
			archiveSession: async (sessionId: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				
				session.archived = true;
				session.completedAt = Date.now();
				
				const messages = session.messages || [];
				if (messages.length > 0) {
					const firstMsg = messages[0];
					const lastMsg = messages[messages.length - 1];
					if (firstMsg && lastMsg) {
						const firstMsgTime = new Date(firstMsg.timestamp).getTime();
						const lastMsgTime = new Date(lastMsg.timestamp).getTime();
						session.durationMs = lastMsgTime - firstMsgTime;
					}
				}
				
				await plugin.saveSettings();
			},
			
			unarchiveSession: async (sessionId: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				
				session.archived = false;
				await plugin.saveSettings();
			},
			
			deleteSession: async (sessionId: string) => {
				const index = plugin.settings.sessions.findIndex(s => s.id === sessionId);
				if (index === -1) throw new Error(`Session not found: ${sessionId}`);
				
				plugin.settings.sessions.splice(index, 1);
				
				if (plugin.settings.activeSessionId === sessionId) {
					plugin.settings.activeSessionId = null;
				}
				
				await plugin.saveSettings();
			},
			
			renameSession: async (sessionId: string, newName: string) => {
				const session = plugin.settings.sessions.find(s => s.id === sessionId);
				if (!session) throw new Error(`Session not found: ${sessionId}`);
				
				session.name = newName;
				await plugin.saveSettings();
			},
			
			// ===== Note Operations =====
			
			readNote: async (path) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.readNote(path);
			},
			
			searchNotes: async (query, limit = 10) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.searchNotes(query, limit);
			},
			
			createNote: async (path, content) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.createNote(path, content);
			},
			
			getActiveNote: async () => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.getActiveNote();
			},
			
			listNotes: async (folder) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.listNotes(folder);
			},
			
			listNotesRecursively: async (folder, limit) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.listNotesRecursively(folder, limit);
			},
			
			appendToNote: async (path, content) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.appendToNote(path, content);
			},
			
			batchReadNotes: async (paths) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.batchReadNotes(paths);
			},
			
			updateNote: async (path, content) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.updateNote(path, content);
			},
			
			deleteNote: async (path) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.deleteNote(path);
			},
			
			getRecentChanges: async (limit = 10) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.getRecentChanges(limit);
			},
			
			getDailyNote: async (date) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.getDailyNote(date);
			},
			
			renameNote: async (oldPath, newPath) => {
				if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
				return await githubCopilotCliService.renameNote(oldPath, newPath);
			},
			
			// ===== Skill Registration =====
			
			registerSkill: (skill: VaultCopilotSkill) => {
				plugin.skillRegistry.registerSkill(skill);
			},
			
			updateSkill: (skill: VaultCopilotSkill) => {
				plugin.skillRegistry.updateSkill(skill);
			},
			
			unregisterSkill: (name: string) => {
				return plugin.skillRegistry.unregisterSkill(name);
			},
			
			unregisterPluginSkills: (pluginId: string) => {
				return plugin.skillRegistry.unregisterPluginSkills(pluginId);
			},
			
			listSkills: () => {
				return plugin.skillRegistry.listSkills();
			},
			
			listSkillsByCategory: (category: string) => {
				return plugin.skillRegistry.listSkillsByCategory(category);
			},
			
			listSkillsByPlugin: (pluginId: string) => {
				return plugin.skillRegistry.listSkillsByPlugin(pluginId);
			},
			
			hasSkill: (name: string) => {
				return plugin.skillRegistry.hasSkill(name);
			},
			
			executeSkill: async (name: string, args: Record<string, unknown>) => {
				return await plugin.skillRegistry.executeSkill(name, args);
			},
			
			onSkillChange: (listener: (event: SkillRegistryEvent) => void) => {
				return plugin.skillRegistry.onSkillChange(listener);
			},
			
			// ===== MCP Server Configuration =====
			
			configureMcpServer: (id: string, config: McpServerConfig) => {
				plugin.skillRegistry.configureMcpServer(id, config);
			},
			
			removeMcpServer: (id: string) => {
				return plugin.skillRegistry.removeMcpServer(id);
			},
			
			getMcpServers: () => {
				return plugin.skillRegistry.getMcpServers();
			},
			
			// ===== Prompt Operations =====
			
			listPrompts: () => {
				return plugin.promptCache.getPrompts();
			},
			
			getPromptInfo: (name: string) => {
				return plugin.promptCache.getPromptByName(name);
			},
			
			getFullPrompt: async (name: string) => {
				return await plugin.promptCache.getFullPrompt(name);
			},
			
			executePrompt: async (name: string, variables?: Record<string, string>) => {
				// Use the active provider for chat
				const isOpenAI = plugin.settings.aiProvider === "openai";
				
				if (isOpenAI) {
					if (!plugin.openaiService) throw new Error("OpenAI service not initialized");
					if (!plugin.openaiService.isReady()) await plugin.connectCopilot();
				} else {
					if (!githubCopilotCliService) throw new Error("Vault Copilot service not initialized");
					if (!githubCopilotCliService.isConnected()) await plugin.connectCopilot();
				}
				
				const prompt = await plugin.promptCache.getFullPrompt(name);
				if (!prompt) throw new Error(`Prompt not found: ${name}`);
				
				// Replace variables in the prompt content
				let content = prompt.content;
				if (variables) {
					for (const [key, value] of Object.entries(variables)) {
						content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
					}
				}
				
				if (isOpenAI) {
					return await plugin.openaiService!.sendMessage(content);
				} else {
					return await githubCopilotCliService!.sendMessage(content);
				}
			},
		};
	}
}
