/**
 * Slash command definitions for the chat view
 */

// Forward reference to avoid circular dependency - will be imported dynamically
import type { CopilotChatView } from "../CopilotChatView";

/**
 * Interface for slash commands
 */
export interface SlashCommand {
	name: string;
	description: string;
	usage: string;
	handler: (view: CopilotChatView, args: string) => Promise<string>;
}

/**
 * Built-in slash commands that map to available tools
 */
export const SLASH_COMMANDS: SlashCommand[] = [
	{
		name: "help",
		description: "Show available slash commands",
		usage: "/help",
		handler: async () => {
			const commands = SLASH_COMMANDS.map(cmd => `**${cmd.usage}** - ${cmd.description}`).join("\n");
			return `## Vault Copilot Slash Commands\n\nThese commands control the chat interface:\n\n${commands}\n\n---\n*Tip: For vault operations like reading, searching, or creating notes, just ask naturally - Copilot will use the appropriate tools.*`;
		}
	},
	{
		name: "clear",
		description: "Clear chat history",
		usage: "/clear",
		handler: async (view) => {
			await view.clearChat();
			return ""; // Don't show a message, the UI is cleared
		}
	},
	{
		name: "sessions",
		description: "List all chat sessions",
		usage: "/sessions",
		handler: async (view) => {
			const sessions = view.plugin.settings.sessions;
			if (sessions.length === 0) return "No sessions yet. Start chatting to create your first session.";
			const active = sessions.filter(s => !s.archived);
			const archived = sessions.filter(s => s.archived);
			let output = "## Chat Sessions\n\n";
			if (active.length > 0) {
				output += "### Active\n" + active.map(s => `- **${s.name}** (${s.messages.length} messages)`).join("\n") + "\n\n";
			}
			if (archived.length > 0) {
				output += "### Archived\n" + archived.map(s => `- ${s.name} (${s.messages.length} messages)`).join("\n");
			}
			return output;
		}
	},
	{
		name: "new",
		description: "Create a new chat session",
		usage: "/new [name]",
		handler: async (view, args) => {
			await view.createNewSession(args || undefined);
			return "";
		}
	},
	{
		name: "archive",
		description: "Archive current session",
		usage: "/archive",
		handler: async (view) => {
			const sessionId = view.plugin.settings.activeSessionId;
			if (!sessionId) return "No active session to archive.";
			const session = view.plugin.settings.sessions.find(s => s.id === sessionId);
			if (!session) return "Session not found.";
			session.archived = true;
			session.completedAt = Date.now();
			await view.plugin.saveSettings();
			await view.createNewSession();
			return `Archived: ${session.name}`;
		}
	},
	{
		name: "demo-app",
		description: "Demo interactive MCP App (UI extension)",
		usage: "/demo-app",
		handler: async (view) => {
			// Render a sample MCP App to demonstrate the feature
			view.renderSampleMcpApp();
			return ""; // The app is rendered directly, no text response needed
		}
	},
	{
		name: "skills",
		description: "List all available skills and their resources",
		usage: "/skills [filter]",
		handler: async (view, args) => {
			const filter = args?.trim().toLowerCase();

			// Collect file-based skills from SkillCache
			const cachedSkills = view.plugin.skillCache.getSkills();

			// Collect runtime skills from SkillRegistry
			const runtimeSkills = view.plugin.skillRegistry.listSkills();

			let output = "## Available Skills\n\n";

			// File-based skills
			const fileSkills = filter
				? cachedSkills.filter((s: { name: string; description: string }) => s.name.toLowerCase().includes(filter) || s.description.toLowerCase().includes(filter))
				: cachedSkills;

			if (fileSkills.length > 0) {
				output += "### File-based Skills (SKILL.md)\n\n";
				output += "| Skill | Description | Resources |\n|-------|-------------|----------|\n";
				for (const skill of fileSkills) {
					const resCount = skill.resources?.length ?? 0;
					const resLabel = resCount > 0 ? `${resCount} file${resCount > 1 ? 's' : ''}` : '—';
					output += `| **${skill.name}** | ${skill.description} | ${resLabel} |\n`;
				}
				output += "\n";
			}

			// Runtime skills
			const rtSkills = filter
				? runtimeSkills.filter(s => s.name.toLowerCase().includes(filter) || s.description.toLowerCase().includes(filter))
				: runtimeSkills;

			if (rtSkills.length > 0) {
				output += "### Runtime Skills (Plugin-registered)\n\n";
				output += "| Skill | Description |\n|-------|-------------|\n";
				for (const skill of rtSkills) {
					output += `| **${skill.name}** | ${skill.description} |\n`;
				}
				output += "\n";
			}

			if (fileSkills.length === 0 && rtSkills.length === 0) {
				output += filter
					? `No skills matching "${filter}" found.\n\n`
					: "No skills installed. Add SKILL.md files to your configured skill directories.\n\n";
			}

			// Directories info
			const dirs = view.plugin.settings.skillDirectories || [];
			if (dirs.length > 0) {
				output += `**Skill directories:** ${dirs.join(', ')}\n\n`;
			}

			output += `*Configure skill directories in **Settings → Vault Copilot → Skill directories**.*`;

			return output;
		}
	}
];
