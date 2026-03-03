import { App } from "obsidian";
import type { BasicCopilotPluginSettings } from "../types";

/**
 * Minimal plugin interface that both Basic and Pro plugin classes satisfy.
 * Using a structural interface avoids a concrete class dependency so that
 * Pro's `CopilotPlugin` (which extends `Plugin` directly) and Basic's
 * `BasicCopilotPlugin` are both assignable here without inheritance.
 *
 * `settings` is typed as `BasicCopilotPluginSettings` — the minimal settings
 * surface shared by both Basic and Pro.  Pro sections that need Pro-only
 * fields should cast through the `proPlugin` getter pattern.
 */
export interface ISettingsPlugin {
	readonly app: App;
	settings: BasicCopilotPluginSettings;
	saveSettings(): Promise<void>;
}

export interface SettingsContext {
	readonly app: App;
	readonly plugin: ISettingsPlugin;
	readonly display: () => void;
}
