export { LocalWhisperService, type LocalWhisperConfig } from './LocalWhisperService';
export { OpenAIWhisperService, type OpenAIWhisperConfig } from './OpenAIWhisperService';
export { AzureWhisperService, type AzureWhisperConfig, getAzureOpenAIApiKey } from './AzureWhisperService';
export { VoiceChatService, type VoiceChatServiceConfig, type VoiceBackend } from './VoiceChatService';

// Re-export from refactored realtime-agent module
// Primary voice agents
export {
	BaseVoiceAgent,
	MainVaultAssistant,
	MAIN_ASSISTANT_DEFINITION_FILE,
	// Voice agent registry
	VoiceAgentRegistry,
	getVoiceAgentRegistry,
	type VoiceAgentFactory,
	type VoiceAgentRegistration,
	type VoiceAgentRegistryEvents,
	// Types
	type BaseVoiceAgentConfig,
	type MainVaultAssistantConfig,
	type RealtimeAgentConfig,
	type RealtimeAgentState,
	type RealtimeAgentEvents,
	type RealtimeHistoryItem,
	type RealtimeVoice,
	type TurnDetectionMode,
	type RealtimeToolConfig,
	type RealtimeToolName,
	type ToolExecutionCallback,
	type ToolApprovalRequest,
	DEFAULT_TOOL_CONFIG,
} from '../realtime-agent';

// Re-export task agent
export {
	TaskManagementAgent,
	TASK_AGENT_ID,
	TASK_AGENT_DEFINITION_FILE,
	type TaskManagementAgentConfig,
} from '../task-agent';

// Re-export note agent
export {
	NoteManagementAgent,
	NOTE_AGENT_ID,
	NOTE_AGENT_DEFINITION_FILE,
	type NoteManagementAgentConfig,
} from '../note-agent';

// Re-export workiq agent
export {
	WorkIQAgent,
	WORKIQ_AGENT_ID,
	WORKIQ_AGENT_DEFINITION_FILE,
	type WorkIQAgentConfig,
} from '../workiq-agent';

export type {
	RecordingState,
	TranscriptionSegment,
	TranscriptionResult,
	TranscriptionSegmentCallback,
	IVoiceChatService,
	VoiceChatEvents,
} from './types';
