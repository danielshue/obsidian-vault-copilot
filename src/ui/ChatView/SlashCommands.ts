/**
 * Slash command definitions for the chat view
 */

// Forward reference to avoid circular dependency - will be imported dynamically
import type { CopilotChatView } from "./CopilotChatView";

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
			return `## Vault Copilot Slash Commands\n\nThese commands are available in the chat:\n\n${commands}\n\n---\n*Tip: You can also ask Copilot questions in natural language.*`;
		}
	},
	{
		name: "read",
		description: "Read a note by path",
		usage: "/read <path>",
		handler: async (view, args) => {
			if (!args) return "Usage: /read <path>\nExample: /read Daily Notes/2026-01-28.md";
			const result = await view.executeTool("read_note", { path: args }) as { success: boolean; content?: string; error?: string };
			if (result.success) {
				return `## ${args}\n\n${result.content}`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "search",
		description: "Search for notes",
		usage: "/search <query>",
		handler: async (view, args) => {
			if (!args) return "Usage: /search <query>\nExample: /search project ideas";
			const result = await view.executeTool("search_notes", { query: args, limit: 10 }) as { results: Array<{ path: string; excerpt: string }> };
			if (result.results?.length > 0) {
				const list = result.results.map((r) => `- [[${r.path}]]: ${r.excerpt}`).join("\n");
				return `## Search Results for "${args}"\n\n${list}`;
			}
			return `No results found for "${args}"`;
		}
	},
	{
		name: "list",
		description: "List notes in a folder",
		usage: "/list [folder]",
		handler: async (view, args) => {
			const result = await view.executeTool("list_notes", { folder: args || undefined }) as { notes: Array<{ path: string }> };
			if (result.notes?.length > 0) {
				const list = result.notes.map((n) => `- [[${n.path}]]`).join("\n");
				return `## Notes${args ? ` in ${args}` : ""}\n\n${list}`;
			}
			return args ? `No notes found in "${args}"` : "No notes found in vault";
		}
	},
	{
		name: "create",
		description: "Create a new note",
		usage: "/create <path> [content]",
		handler: async (view, args) => {
			const match = args.match(/^(\S+)(?:\s+([\s\S]*))?$/);
			if (!match) return "Usage: /create <path> [content]\nExample: /create Projects/New Idea.md # My New Idea";
			const [, path, content] = match;
			const result = await view.executeTool("create_note", { path, content: content || "" }) as { success: boolean; path?: string; error?: string };
			if (result.success) {
				return `Created note: [[${result.path}]]`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "append",
		description: "Append content to a note",
		usage: "/append <path> <content>",
		handler: async (view, args) => {
			const match = args.match(/^(\S+)\s+([\s\S]+)$/);
			if (!match) return "Usage: /append <path> <content>\nExample: /append Daily Notes/2026-01-28.md ## New Section";
			const [, path, content] = match;
			const result = await view.executeTool("append_to_note", { path, content }) as { success: boolean; error?: string };
			if (result.success) {
				return `Appended to [[${path}]]`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "update",
		description: "Update/replace entire note content",
		usage: "/update <path> <content>",
		handler: async (view, args) => {
			const match = args.match(/^(\S+)\s+([\s\S]+)$/);
			if (!match) return "Usage: /update <path> <content>\nExample: /update note.md # New Content";
			const [, path, content] = match;
			const result = await view.executeTool("update_note", { path, content }) as { success: boolean; error?: string };
			if (result.success) {
				return `Updated [[${path}]]`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "delete",
		description: "Delete a note (moves to trash)",
		usage: "/delete <path>",
		handler: async (view, args) => {
			if (!args) return "Usage: /delete <path>\nExample: /delete old-note.md";
			const result = await view.executeTool("delete_note", { path: args }) as { success: boolean; error?: string };
			if (result.success) {
				return `Deleted: ${args} (moved to trash)`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "rename",
		description: "Rename or move a note",
		usage: "/rename <old-path> <new-path>",
		handler: async (view, args) => {
			const match = args.match(/^(\S+)\s+(\S+)$/);
			if (!match) return "Usage: /rename <old-path> <new-path>\nExample: /rename old.md new.md";
			const [, oldPath, newPath] = match;
			const result = await view.executeTool("rename_note", { oldPath, newPath }) as { success: boolean; newPath?: string; error?: string };
			if (result.success) {
				return `Renamed [[${oldPath}]] → [[${result.newPath}]]`;
			}
			return `Error: ${result.error}`;
		}
	},
	{
		name: "recent",
		description: "Show recently modified notes",
		usage: "/recent [count]",
		handler: async (view, args) => {
			const limit = parseInt(args) || 10;
			const result = await view.executeTool("get_recent_changes", { limit }) as { files: Array<{ path: string; mtimeFormatted: string }> };
			if (result.files?.length > 0) {
				const list = result.files.map((f) => 
					`- [[${f.path}]] - ${new Date(f.mtimeFormatted).toLocaleString()}`
				).join("\n");
				return `## Recently Modified\n\n${list}`;
			}
			return "No recent changes found";
		}
	},
	{
		name: "daily",
		description: "Get today's or a specific date's daily note",
		usage: "/daily [YYYY-MM-DD]",
		handler: async (view, args) => {
			const result = await view.executeTool("get_daily_note", { date: args || undefined }) as { exists: boolean; path?: string; content?: string; error?: string };
			if (result.exists && result.content) {
				return `## ${result.path}\n\n${result.content}`;
			}
			return result.error || "Daily note not found";
		}
	},
	{
		name: "active",
		description: "Get the currently active note",
		usage: "/active",
		handler: async (view) => {
			const result = await view.executeTool("get_active_note", {}) as { hasActiveNote: boolean; path?: string; content?: string };
			if (result.hasActiveNote && result.content) {
				return `## ${result.path}\n\n${result.content}`;
			}
			return "No active note open";
		}
	},
	{
		name: "batch",
		description: "Read multiple notes at once",
		usage: "/batch <path1> <path2> ...",
		handler: async (view, args) => {
			const paths = args.split(/\s+/).filter(p => p);
			if (paths.length === 0) return "Usage: /batch <path1> <path2> ...\nExample: /batch note1.md note2.md";
			const result = await view.executeTool("batch_read_notes", { paths }) as { results: Array<{ path: string; success: boolean; content?: string; error?: string }> };
			if (result.results?.length > 0) {
				const sections = result.results.map((r) => {
					if (r.success) {
						return `## ${r.path}\n\n${r.content}`;
					}
					return `## ${r.path}\n\nError: ${r.error}`;
				}).join("\n\n---\n\n");
				return sections;
			}
			return "No results";
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
	// Session management commands
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
	}
];
