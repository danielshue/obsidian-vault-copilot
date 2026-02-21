/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SystemPromptBuilder
 * @description Pure functions for constructing the system prompt injected into
 * every Copilot SDK session.
 *
 * Extracted from GitHubCopilotCliService so the prompt template can evolve
 * independently of the session management code.
 *
 * @example
 * ```typescript
 * const prompt = buildSystemPrompt(config, loadedInstructions);
 * ```
 *
 * @see {@link getDateTimeContext} for timezone-aware date/time context injection
 * @see {@link GitHubCopilotCliService} for session creation usage
 * @since 0.0.35
 */

import type { CustomInstruction } from "../customization/CustomizationLoader";
import type { GitHubCopilotCliConfig } from "./types";
import { getDateTimeContext } from "../../utils/dateTime";

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the full system prompt injected into every SDK session.
 *
 * Includes date/time context, slash commands, behavioral guidelines,
 * Bases filter reference, customization directory info, and any
 * user-defined instructions loaded from the vault.
 *
 * @param config - Service configuration (for directory paths)
 * @param loadedInstructions - Instruction files loaded from configured directories
 * @returns The complete system prompt string
 *
 * @example
 * ```typescript
 * const prompt = buildSystemPrompt(config, loadedInstructions);
 * session = client.createSession({ systemMessage: { content: prompt } });
 * ```
 *
 * @see {@link getDateTimeContext} for date/time context generation
 */
export function buildSystemPrompt(config: GitHubCopilotCliConfig, loadedInstructions: CustomInstruction[]): string {
	return `${getDateTimeContext({ timezone: config.timezone, weekStartDay: config.weekStartDay })}

## Available Slash Commands
When the user asks what commands are available, respond with this list:
/help, /read, /search, /list, /create, /append, /update, /delete, /rename, /recent, /daily, /active, /batch, /sessions, /new, /archive, /clear

## Guidelines
- When the user asks about their notes, use the available tools to fetch the content
- Format your responses in Markdown, which Obsidian renders natively
- **Always use [[wikilinks]] when referencing files in the vault** so users can click to navigate (e.g., [[Daily Notes/2026-01-29]] or [[Projects/My Project.md]])
- Be concise but helpful
- If you're unsure about something, ask for clarification
- When reading 10+ files, use batch_read_notes with aiSummarize=true to get AI-generated summaries instead of full content

## Obsidian Bases (.base files)
When the user asks you to create a Base, just call create_base with the path (and optionally name, description, and filters). The tool will automatically:
1. Scan vault notes near the target path to discover frontmatter properties
2. Present an interactive checkbox question to the user asking which properties to include as columns
3. Ask the user to select a view type (table, card, list)
4. Create the Base with the user's selections

You do NOT need to scan notes yourself or present properties manually — the tool handles all of this via inline question UI. Just call create_base once.

IMPORTANT: Do NOT pass a "properties" array unless the user has explicitly told you the exact property names. If you pass properties, the interactive discovery will be skipped and the user won't get to choose.

### Bases filter syntax reference
- Frontmatter property comparison: \`status != "archived"\` or \`priority == "high"\`
- Folder scoping: \`file.inFolder("Projects/MBA")\`
- Tag filtering: \`file.hasTag("lesson")\`
- Operators: ==, !=, >, <, >=, <=
- String values must be in double quotes
- Filters go inside an \`and:\` or \`or:\` group

## Customization Directories
The following directories are configured for extending your capabilities:

${getCustomizationDirectoriesInfo(config)}

${getLoadedInstructionsContent(loadedInstructions)}
`;
}

// ── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Generate a Markdown description of configured customization directories.
 *
 * Produces sections for agents, skills, and instruction directories so the
 * AI model is aware of how the user has extended its capabilities.
 *
 * @param config - Service configuration containing directory paths
 * @returns Formatted Markdown string (empty notice when nothing is configured)
 * @see {@link GitHubCopilotCliConfig} for directory fields used in output
 * @internal
 */
function getCustomizationDirectoriesInfo(config: GitHubCopilotCliConfig): string {
	const sections: string[] = [];

	const agentDirs = config.agentDirectories || [];
	if (agentDirs.length > 0) {
		sections.push(`### Agent Directories
Agents are custom personas with specific instructions and tool configurations.
Locations: ${agentDirs.map((d) => `\`${d}\``).join(", ")}
File pattern: \`*.agent.md\``);
	}

	const skillDirs = config.skillDirectories || [];
	if (skillDirs.length > 0) {
		sections.push(`### Skill Directories
Skills define reusable capabilities and tool definitions. Each skill is a subfolder containing a SKILL.md file.
Locations: ${skillDirs.map((d) => `\`${d}\``).join(", ")}
Structure: \`<skill-name>/SKILL.md\``);
	}

	const instructionDirs = config.instructionDirectories || [];
	if (instructionDirs.length > 0) {
		sections.push(`### Instruction Directories
Instructions provide additional context and guidelines for your responses.
Locations: ${instructionDirs.map((d) => `\`${d}\``).join(", ")}
File pattern: \`*.instructions.md\`, \`copilot-instructions.md\`, \`AGENTS.md\``);
	}

	if (sections.length === 0) {
		return "No customization directories are configured. Users can add agent, skill, and instruction directories in the plugin settings.";
	}

	return sections.join("\n\n");
}

/**
 * Render loaded instruction contents for inclusion in the system prompt.
 *
 * @param loadedInstructions - Array of loaded instruction objects
 * @returns Markdown-formatted user-defined instructions, or empty string if none loaded
 * @see {@link CustomInstruction} for loaded instruction shape
 * @internal
 */
function getLoadedInstructionsContent(loadedInstructions: CustomInstruction[]): string {
	if (loadedInstructions.length === 0) {
		return "";
	}

	const parts: string[] = [
		"## User-Defined Instructions\n\nThe following instructions have been loaded from the vault and should be followed:",
	];

	for (const instruction of loadedInstructions) {
		parts.push(`\n### ${instruction.name}${instruction.applyTo ? ` (applies to: ${instruction.applyTo})` : ""}\n\n${instruction.content}`);
	}

	return parts.join("\n");
}
