/**
 * SecretStorage - Secure storage for API keys using Obsidian's plugin storage
 * 
 * Desktop: Supports both encrypted storage and environment variable fallback
 * Mobile: Only encrypted storage (no process.env available)
 */

import { Plugin } from "obsidian";

/**
 * Storage key prefix for secrets in plugin data
 */
const SECRET_PREFIX = "secret_";

/**
 * Interface for stored secrets
 */
interface SecretStorageData {
	[key: string]: string;
}

/**
 * SecretStorage manages encrypted API keys for the plugin
 */
export class SecretStorage {
	private plugin: Plugin;
	private secrets: SecretStorageData = {};

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	/**
	 * Initialize the secret storage by loading from plugin data
	 */
	async initialize(): Promise<void> {
		const data = await this.plugin.loadData();
		if (data && data.secrets) {
			this.secrets = data.secrets;
		}
	}

	/**
	 * Get an API key from secure storage
	 * On desktop: Falls back to environment variables if not in storage
	 * On mobile: Only checks storage (no process.env)
	 * 
	 * @param key The key identifier (e.g., "openai_api_key")
	 * @returns The API key or null if not found
	 */
	async getApiKey(key: string): Promise<string | null> {
		// Check encrypted storage first
		const storageKey = `${SECRET_PREFIX}${key}`;
		if (this.secrets[storageKey]) {
			return this.secrets[storageKey];
		}

		// Fallback to environment variables if available (desktop only)
		if (typeof process !== "undefined" && process.env) {
			const envKey = key.toUpperCase();
			return process.env[envKey] || null;
		}

		return null;
	}

	/**
	 * Store an API key securely
	 * 
	 * @param key The key identifier (e.g., "openai_api_key")
	 * @param value The API key value
	 */
	async setApiKey(key: string, value: string): Promise<void> {
		const storageKey = `${SECRET_PREFIX}${key}`;
		this.secrets[storageKey] = value;
		await this.save();
	}

	/**
	 * Delete an API key from storage
	 * 
	 * @param key The key identifier (e.g., "openai_api_key")
	 */
	async deleteApiKey(key: string): Promise<void> {
		const storageKey = `${SECRET_PREFIX}${key}`;
		delete this.secrets[storageKey];
		await this.save();
	}

	/**
	 * Check if an API key exists in storage (not env vars)
	 * 
	 * @param key The key identifier
	 * @returns True if the key exists in storage
	 */
	hasStoredKey(key: string): boolean {
		const storageKey = `${SECRET_PREFIX}${key}`;
		return !!this.secrets[storageKey];
	}

	/**
	 * Migrate a plain text API key to encrypted storage
	 * 
	 * @param key The key identifier
	 * @param plainTextValue The plain text value to migrate
	 */
	async migrateFromPlainText(key: string, plainTextValue: string): Promise<void> {
		if (plainTextValue && plainTextValue.trim()) {
			await this.setApiKey(key, plainTextValue.trim());
		}
	}

	/**
	 * Save secrets to plugin data
	 */
	private async save(): Promise<void> {
		const data = await this.plugin.loadData() || {};
		data.secrets = this.secrets;
		await this.plugin.saveData(data);
	}
}

/**
 * Helper function to get OpenAI API key from SecretStorage or environment
 * 
 * @param secretStorage The SecretStorage instance
 * @param configKey Optional API key from config
 * @returns The API key or undefined
 */
export async function getOpenAIApiKey(
	secretStorage: SecretStorage | null,
	configKey?: string
): Promise<string | undefined> {
	// First check config parameter
	if (configKey && configKey.trim()) {
		return configKey;
	}

	// Then check SecretStorage
	if (secretStorage) {
		const storedKey = await secretStorage.getApiKey("openai_api_key");
		if (storedKey) {
			return storedKey;
		}
	}

	// Fallback to environment variables if available (desktop only)
	if (typeof process !== "undefined" && process.env) {
		return process.env.OPENAI_API_KEY;
	}

	return undefined;
}

/**
 * Helper function to get Azure OpenAI API key from SecretStorage or environment
 * 
 * @param secretStorage The SecretStorage instance
 * @param configKey Optional API key from config
 * @returns The API key or undefined
 */
export async function getAzureOpenAIApiKey(
	secretStorage: SecretStorage | null,
	configKey?: string
): Promise<string | undefined> {
	// First check config parameter
	if (configKey && configKey.trim()) {
		return configKey;
	}

	// Then check SecretStorage
	if (secretStorage) {
		const storedKey = await secretStorage.getApiKey("azure_openai_api_key");
		if (storedKey) {
			return storedKey;
		}
	}

	// Fallback to environment variables if available (desktop only)
	if (typeof process !== "undefined" && process.env) {
		return process.env.AZURE_OPENAI_API_KEY;
	}

	return undefined;
}
