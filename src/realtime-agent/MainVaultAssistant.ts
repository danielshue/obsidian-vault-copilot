/**
 * MainVaultAssistant - Entry point voice agent for Obsidian vault
 * 
 * This is the primary agent that users interact with. It:
 * - Owns the RealtimeSession
 * - Loads voice agent definitions from markdown files
 * - Uses VoiceAgentRegistry to discover and instantiate specialist agents
 * - Registers and orchestrates handoffs to specialist agents
 * - Provides vault and web tools (excluding task-specific tools)
 */

import { App } from "obsidian";
import { RealtimeSession } from "@openai/agents/realtime";
import type { tool } from "@openai/agents/realtime";
import { BaseVoiceAgent } from "./BaseVoiceAgent";
import {
	MainVaultAssistantConfig,
	RealtimeToolConfig,
	DEFAULT_TOOL_CONFIG,
	REALTIME_MODEL,
	logger,
} from "./types";
import { createToolsForAgent, getToolNames } from "./tool-manager";
import { CustomizationLoader, VoiceAgentDefinition } from "../copilot/CustomizationLoader";
import { getVoiceAgentRegistry, VoiceAgentRegistration } from "./VoiceAgentRegistry";
import { TaskManagementAgent } from "../task-agent/TaskManagementAgent";
import { NoteManagementAgent } from "../note-agent/NoteManagementAgent";
import { WorkIQAgent } from "../workiq-agent/WorkIQAgent";

/** Definition file name for MainVaultAssistant */
export const MAIN_ASSISTANT_DEFINITION_FILE = "main-vault-assistant.voice-agent.md";

/** Default instructions when no markdown file is loaded */
const DEFAULT_INSTRUCTIONS = `You are a helpful voice assistant coordinator for an Obsidian knowledge vault.

## LANGUAGE: ENGLISH ONLY
You MUST respond in English only. Do not use Spanish, French, German or any other language.
Regardless of the user's language, always respond in English.

## Your Role
You are the main coordinator that routes requests to specialist agents:

### Note Operations → Note Manager
For anything involving notes (reading, searching, creating, editing notes), hand off to the **Note Manager** specialist.
Trigger phrases: "switch to notes", "note manager", "help with notes", "open a note", "read a note", "find notes"

### Task Operations → Task Manager  
For task management (marking tasks complete, creating tasks, listing tasks), hand off to the **Task Manager** specialist.
Trigger phrases: "switch to tasks", "task manager", "help with tasks", "mark tasks", "complete tasks", "create a task"

### Web Operations → You handle directly
You can directly help with:
- Fetching web pages
- Searching the web for information

### Returning from Specialists
When users say "switch to main", "main assistant", "general help", "go back", or "return to main", they want to return to you for general assistance.

## Context Updates
When [INTERNAL CONTEXT UPDATE] messages arrive, note them silently - do not speak about them.

## Response Style
Be conversational and brief. Route requests efficiently to the right specialist.
When you hand off, briefly acknowledge: "Switching to Note Manager" or "Handing off to Task Manager".
`;

/**
 * MainVaultAssistant - The primary entry point for voice interactions
 */
export class MainVaultAssistant extends BaseVoiceAgent {
	private toolConfig: RealtimeToolConfig;
	private customizationLoader: CustomizationLoader;
	private voiceAgentDefinition: VoiceAgentDefinition | null = null;

	constructor(app: App, config: MainVaultAssistantConfig) {
		super("Main Vault Assistant", app, config);
		this.toolConfig = { ...DEFAULT_TOOL_CONFIG, ...config.toolConfig };
		this.customizationLoader = new CustomizationLoader(app);
	}

	// =========================================================================
	// Abstract Method Implementations
	// =========================================================================

	getInstructions(): string {
		// Use loaded markdown instructions if available
		if (this.voiceAgentDefinition?.instructions) {
			return this.voiceAgentDefinition.instructions;
		}
		
		// Use config instructions if provided
		const configInstructions = (this.config as MainVaultAssistantConfig).instructions;
		if (configInstructions) {
			return configInstructions;
		}

		// Fall back to default
		return DEFAULT_INSTRUCTIONS;
	}

	getHandoffDescription(): string {
		// Main agent doesn't need a handoff description (it's the entry point)
		return this.voiceAgentDefinition?.handoffDescription || "";
	}

	getTools(): ReturnType<typeof tool>[] {
		// Get tool names from definition or use defaults (web tools only - note/task tools handled by specialists)
		const allowedTools = this.voiceAgentDefinition?.tools || [
			"fetch_web_page",
			"web_search",
		];

		return createToolsForAgent(
			allowedTools,
			this.app,
			this.toolConfig,
			(this.config as MainVaultAssistantConfig).mcpManager,
			this.onToolExecution,
			(this.config as MainVaultAssistantConfig).periodicNotesSettings,
			this.getChatOutputCallback(),
			this.name
		);
	}

	// =========================================================================
	// Configuration
	// =========================================================================

	/**
	 * Update tool configuration at runtime
	 */
	updateToolConfig(config: Partial<RealtimeToolConfig>): void {
		this.toolConfig = { ...this.toolConfig, ...config };
		logger.info(`[${this.name}] Tool config updated`);
	}

	// =========================================================================
	// Connection Lifecycle
	// =========================================================================

	/**
	 * Connect to the realtime session
	 */
	async connect(): Promise<void> {
		if (this.state !== "idle") {
			throw new Error(`Cannot connect: agent is in ${this.state} state`);
		}

		try {
			this.setState("connecting");

			// Start trace for this voice session
			this.startTrace({
				voice: this.config.voice,
				language: this.config.language,
			});

			// Load voice agent definitions
			await this.loadVoiceAgentDefinitions();

			// Create and register handoff agents
			await this.setupHandoffAgents();

			// Build the main agent with handoffs
			this.buildAgent();

			// Log tools being registered
			const tools = this.getTools();
			const toolNames = getToolNames(tools);
			logger.info(`[${this.name}] Created with ${tools.length} tools: ${toolNames.join(", ")}`);
			logger.info(`[${this.name}] Registered ${this.handoffAgents.size} handoff agents`);

			// Create session with configuration
			this.session = new RealtimeSession(this.agent!, {
				model: REALTIME_MODEL,
				config: {
					toolChoice: "auto",
					voice: this.config.voice || "alloy",
					inputAudioTranscription: {
						model: "whisper-1",
						...(this.config.language ? { language: this.config.language } : {}),
					},
					turnDetection: {
						type: this.config.turnDetection || "server_vad",
					},
				},
			});

			// Set up event handlers
			this.setupEventHandlers();

			// Get ephemeral key and connect
			const ephemeralKey = await this.getEphemeralKey();
			await this.session.connect({ apiKey: ephemeralKey });

			this.setState("connected");
			logger.info(`[${this.name}] Connected successfully`);
		} catch (error) {
			this.setState("error");
			this.emit("error", error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Disconnect from the session
	 */
	async disconnect(): Promise<void> {
		try {
			logger.info(`[${this.name}] Disconnecting...`);
			
			// End trace
			this.endTrace();

			// Close session
			if (this.session) {
				this.session.close();
				this.session = null;
			}

			// Clean up
			this.agent = null;
			this.activeAgent = this;
			this.sessionApprovedTools.clear();
			this.handoffAgents.clear();
			this.voiceAgentDefinition = null;

			this.setState("idle");
			logger.info(`[${this.name}] Disconnected`);
		} catch (error) {
			logger.error(`[${this.name}] Error disconnecting:`, error);
			this.setState("idle");
		}
	}

	// =========================================================================
	// Voice Agent Loading
	// =========================================================================

	/** Loaded voice agent definitions (cached for handoff setup) */
	private loadedDefinitions: VoiceAgentDefinition[] = [];

	/**
	 * Load voice agent definitions from explicit file paths or directories.
	 * Explicit file paths (voiceAgentFiles) take precedence over directory scanning.
	 */
	private async loadVoiceAgentDefinitions(): Promise<void> {
		const config = this.config as MainVaultAssistantConfig;
		const explicitFiles = config.voiceAgentFiles;
		const directories = config.voiceAgentDirectories;

		try {
			// Strategy 1: Load from explicit file paths (preferred)
			if (explicitFiles) {
				const fileMap: Record<string, string | undefined> = {
					mainAssistant: explicitFiles.mainAssistant,
					noteManager: explicitFiles.noteManager,
					taskManager: explicitFiles.taskManager,
					workiq: explicitFiles.workiq,
				};

				for (const [agentKey, filePath] of Object.entries(fileMap)) {
					if (filePath) {
						const definition = await this.customizationLoader.loadVoiceAgentFromFile(filePath);
						if (definition) {
							this.loadedDefinitions.push(definition);
							logger.info(`[${this.name}] Loaded ${agentKey} definition from: ${filePath}`);
						} else {
							logger.debug(`[${this.name}] Could not load ${agentKey} from: ${filePath}`);
						}
					}
				}
			}

			// Strategy 2: Fall back to directory scanning if no explicit files or to supplement
			if (directories && directories.length > 0 && this.loadedDefinitions.length === 0) {
				const dirDefinitions = await this.customizationLoader.loadVoiceAgents(directories);
				// Only add definitions not already loaded
				for (const def of dirDefinitions) {
					if (!this.loadedDefinitions.some(d => d.path === def.path || d.name === def.name)) {
						this.loadedDefinitions.push(def);
					}
				}
				logger.info(`[${this.name}] Loaded ${dirDefinitions.length} definitions from directories`);
			}

			logger.info(`[${this.name}] Total voice agent definitions loaded: ${this.loadedDefinitions.length}`);

			// Find the main vault assistant definition
			this.voiceAgentDefinition = this.loadedDefinitions.find(
				(a) => 
					a.path?.endsWith(MAIN_ASSISTANT_DEFINITION_FILE) ||
					a.name === "Main Vault Assistant" || 
					a.name === this.name
			) || null;

			if (this.voiceAgentDefinition) {
				logger.info(`[${this.name}] Using voice agent definition from: ${this.voiceAgentDefinition.path}`);
			}

			// Log which registered agents have definitions available
			const registry = getVoiceAgentRegistry();
			for (const registration of registry.getAll()) {
				const def = this.loadedDefinitions.find(d => 
					d.path?.endsWith(registration.definitionFileName) ||
					d.name === registration.name
				);
				if (def) {
					logger.info(`[${this.name}] Found definition for ${registration.name}: ${def.path}`);
				} else {
					logger.debug(`[${this.name}] No definition found for ${registration.name}, will use defaults`);
				}
			}
		} catch (error) {
			logger.warn(`[${this.name}] Failed to load voice agent definitions:`, error);
		}
	}

	/**
	 * Set up handoff agents based on VoiceAgentRegistry
	 * Creates instances of all registered agents and registers them for handoffs.
	 * Also wires up cross-handoffs between specialist agents based on their definitions.
	 */
	private async setupHandoffAgents(): Promise<void> {
		const registry = getVoiceAgentRegistry();
		const registrations = registry.getAll();

		logger.info(`[${this.name}] Setting up ${registrations.length} registered handoff agents`);

		// Map to track created agents by name for cross-handoff wiring
		const createdAgents = new Map<string, { agent: BaseVoiceAgent; definition?: VoiceAgentDefinition }>();

		// Phase 1: Create all agents
		for (const registration of registrations) {
			// Find matching definition by file name or agent name
			const definition = this.loadedDefinitions.find(d => 
				d.path?.endsWith(registration.definitionFileName) ||
				d.name === registration.name
			);

			if (definition) {
				logger.info(`[${this.name}] Creating ${registration.name} with definition from ${definition.path}`);
			} else {
				logger.info(`[${this.name}] Creating ${registration.name} with default configuration`);
			}

			// Use the factory to create the agent instance
			const agent = registry.create(
				registration.id,
				this.app,
				this.config,
				definition
			);

			if (agent) {
				this.registerHandoff(agent);
				createdAgents.set(agent.name, { agent, definition });
			}
		}

		// Phase 2: Wire up cross-handoffs between specialist agents from definitions
		for (const [agentName, { agent, definition }] of createdAgents) {
			const handoffNames = definition?.handoffs || [];
			
			for (const handoffName of handoffNames) {
				const targetEntry = createdAgents.get(handoffName);
				if (targetEntry) {
					agent.registerHandoff(targetEntry.agent);
					logger.info(`[${this.name}] Wired cross-handoff: ${agentName} → ${handoffName}`);
				} else {
					logger.warn(`[${this.name}] Handoff target not found: ${agentName} → ${handoffName}`);
				}
			}
		}

		// Phase 3: Wire up default cross-handoffs between all specialists
		// This allows specialists to hand off to each other even without explicit definition
		for (const [agentName, { agent }] of createdAgents) {
			// Register Main Vault Assistant as handoff target (so specialists can return)
			agent.registerHandoff(this);
			logger.info(`[${this.name}] Wired return handoff: ${agentName} → ${this.name}`);

			// Register all other specialists as handoff targets
			for (const [otherName, { agent: otherAgent }] of createdAgents) {
				if (agentName !== otherName) {
					agent.registerHandoff(otherAgent);
					logger.info(`[${this.name}] Wired default cross-handoff: ${agentName} → ${otherName}`);
				}
			}
		}
	}

	// =========================================================================
	// Static Methods - Built-in Agent Registration
	// =========================================================================

	/**
	 * Register all built-in voice agents with the global registry.
	 * Call this once during plugin initialization.
	 */
	static registerBuiltInAgents(): void {
		logger.info("[MainVaultAssistant] Registering built-in voice agents");
		
		// Register NoteManagementAgent
		NoteManagementAgent.register();
		
		// Register TaskManagementAgent
		TaskManagementAgent.register();
		
		// Register WorkIQAgent
		WorkIQAgent.register();
	}

	/**
	 * Unregister all built-in voice agents.
	 * Call this during plugin cleanup.
	 */
	static unregisterBuiltInAgents(): void {
		logger.info("[MainVaultAssistant] Unregistering built-in voice agents");
		
		// Unregister NoteManagementAgent
		NoteManagementAgent.unregister();
		
		// Unregister TaskManagementAgent
		TaskManagementAgent.unregister();
		
		// Unregister WorkIQAgent
		WorkIQAgent.unregister();
	}

	/**
	 * Get the voice agent registry for external plugins to register agents
	 */
	static getRegistry(): ReturnType<typeof getVoiceAgentRegistry> {
		return getVoiceAgentRegistry();
	}
}
