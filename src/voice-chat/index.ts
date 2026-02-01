export { LocalWhisperService, type LocalWhisperConfig } from './LocalWhisperService';
export { OpenAIWhisperService, type OpenAIWhisperConfig } from './OpenAIWhisperService';
export { VoiceChatService, type VoiceChatServiceConfig, type VoiceBackend } from './VoiceChatService';

// Re-export from refactored realtime-agent module
export {
	RealtimeAgentService,
	type RealtimeAgentConfig,
	type RealtimeAgentState,
	type RealtimeAgentEvents,
	type RealtimeHistoryItem,
	type RealtimeVoice,
	type TurnDetectionMode,
	type RealtimeToolConfig,
	type RealtimeToolName,
	type ToolExecutionCallback,
	DEFAULT_TOOL_CONFIG,
} from '../realtime-agent';

export type {
	RecordingState,
	TranscriptionSegment,
	TranscriptionResult,
	TranscriptionSegmentCallback,
	IVoiceChatService,
	VoiceChatEvents,
} from './types';
