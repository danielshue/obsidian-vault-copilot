/**
 * Cross-platform HTTP client for Obsidian
 * Works on both desktop and mobile platforms using Obsidian's requestUrl API
 */

import { requestUrl, RequestUrlParam } from "obsidian";

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
	url: string;
	method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	headers?: Record<string, string>;
	body?: string | object;
	timeout?: number;
}

/**
 * HTTP response structure
 */
export interface HttpResponse<T = unknown> {
	status: number;
	data: T;
	headers: Record<string, string>;
}

/**
 * Cross-platform HTTP client using Obsidian's requestUrl
 * Works on both desktop and mobile platforms
 * 
 * @param options - HTTP request options
 * @returns HTTP response with typed data
 */
export async function httpRequest<T = unknown>(
	options: HttpRequestOptions
): Promise<HttpResponse<T>> {
	const params: RequestUrlParam = {
		url: options.url,
		method: options.method || "GET",
		headers: options.headers,
		body: typeof options.body === "object" 
			? JSON.stringify(options.body) 
			: options.body,
		throw: false,
	};

	const response = await requestUrl(params);

	// Handle non-JSON responses gracefully
	let data: unknown;
	if (response.json !== undefined && response.json !== null) {
		// Pre-parsed JSON is available
		data = response.json;
	} else {
		// Fallback: check Content-Type header
		const headers = response.headers || {};
		const contentType = headers["content-type"] || headers["Content-Type"] || "";
		
		if (typeof contentType === "string" && contentType.includes("application/json")) {
			// Attempt to parse JSON from text
			try {
				data = JSON.parse(response.text);
			} catch {
				// Parsing failed, return raw text
				data = response.text;
			}
		} else {
			// Non-JSON response
			data = response.text;
		}
	}

	return {
		status: response.status,
		data: data as T,
		headers: response.headers,
	};
}

/**
 * Stream-capable fetch for SSE (Server-Sent Events)
 * Works on platforms that support streaming fetch
 * 
 * @param url - Request URL
 * @param options - Streaming options with callbacks
 */
export async function streamingRequest(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
		onData: (chunk: string) => void;
		onComplete: () => void;
		onError: (error: Error) => void;
	}
): Promise<void> {
	try {
		// Use native fetch for streaming (works in Obsidian desktop and mobile)
		const response = await fetch(url, {
			method: options.method || "POST",
			headers: options.headers,
			body: options.body,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		if (!response.body) {
			throw new Error("Response body is null");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			
			const chunk = decoder.decode(value, { stream: true });
			options.onData(chunk);
		}
		
		options.onComplete();
	} catch (error) {
		options.onError(error instanceof Error ? error : new Error(String(error)));
	}
}
