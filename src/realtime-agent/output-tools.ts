/**
 * Output tools for the Realtime Agent
 * 
 * These tools allow the voice agent to output content to the ChatView,
 * which is useful for displaying structured data, tables, lists, etc.
 * that are better read than spoken.
 */

import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { ChatOutputCallback, RealtimeToolName } from "./types";

/**
 * Create output tools for the realtime agent
 * @param onChatOutput - Callback for outputting content to the ChatView
 * @param sourceAgent - Name of the agent creating the tools (for attribution)
 * @param requiresApproval - Set of tool names that require user approval
 */
export function createOutputTools(
	onChatOutput: ChatOutputCallback | null,
	sourceAgent: string,
	requiresApproval: Set<RealtimeToolName> = new Set()
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];

	// Send to chat tool - outputs formatted content to the ChatView
	tools.push(
		tool({
			name: "send_to_chat",
			description: `Display formatted content in the chat window instead of speaking it. Use this tool when:
- The user explicitly asks to "output to chat", "send to chat", "display in chat", "show me in the chat", or similar
- Showing structured data like tables, lists, meeting schedules, task summaries
- The content is better read than spoken (long lists, detailed schedules, etc.)

The content will be rendered as Markdown. You can include [[wikilinks]] to vault notes and standard markdown links. After using this tool, briefly tell the user you've displayed the information in the chat.`,
			parameters: z.object({
				content: z
					.string()
					.describe(
						"The content to display in the chat. Supports Markdown formatting including headings, lists, tables, bold, italic, links, code blocks, and [[wikilinks]] to vault notes."
					),
				title: z
					.string()
					.optional()
					.describe(
						"Optional title to display above the content. If not provided, the content will be displayed without a title header."
					),
			}),
			needsApproval: requiresApproval.has("send_to_chat"),
			execute: async ({ content, title }) => {
				if (!onChatOutput) {
					return JSON.stringify({
						success: false,
						error: "Chat output not available",
					});
				}

				// Format content with optional title
				const formattedContent = title 
					? `## ${title}\n\n${content}`
					: content;

				// Send to chat via callback
				onChatOutput(formattedContent, sourceAgent);

				return JSON.stringify({
					success: true,
					message: "Content displayed in chat",
					contentLength: formattedContent.length,
				});
			},
		})
	);

	return tools;
}
