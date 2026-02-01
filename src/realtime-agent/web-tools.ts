/**
 * Web-related tools for the Realtime Agent
 *
 * Uses shared VaultOperations for the actual implementation.
 */

import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { ToolExecutionCallback } from "./types";
import * as VaultOps from "../copilot/VaultOperations";

/**
 * Create web access tools for the realtime agent
 */
export function createWebTools(
	onToolExecution: ToolExecutionCallback | null
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];

	// Fetch web page tool
	tools.push(
		tool({
			name: "fetch_web_page",
			description: "Fetch and extract text content from a web page URL",
			parameters: z.object({
				url: z.string().describe("The URL of the web page to fetch"),
			}),
			execute: async ({ url }) => {
				const result = await VaultOps.fetchWebPage(url);
				if (result.success) {
					onToolExecution?.(
						"fetch_web_page",
						{ url },
						{ title: result.title, length: result.content?.length || 0 }
					);
				}
				return JSON.stringify(result);
			},
		})
	);

	// Web search tool - performs a search query using DuckDuckGo
	tools.push(
		tool({
			name: "web_search",
			description:
				"Search the web for information. Use this to look up current events, facts, or any information not in the vault. Returns search results with titles, URLs, and snippets.",
			parameters: z.object({
				query: z.string().describe("The search query to look up on the web"),
				limit: z
					.number()
					.optional()
					.describe("Maximum number of results to return (default: 5)"),
			}),
			execute: async ({ query, limit = 5 }) => {
				const result = await VaultOps.webSearch(query, limit);
				onToolExecution?.(
					"web_search",
					{ query, limit },
					{ resultCount: result.results.length }
				);
				return JSON.stringify({
					...result,
					resultCount: result.results.length,
				});
			},
		})
	);

	return tools;
}
