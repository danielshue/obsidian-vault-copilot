/** Utility helpers for interacting with Obsidian SecretStorage. */
import type { App } from 'obsidian';

/**
 * Safely reads a secret value from Obsidian's SecretStorage.
 * Returns undefined when the secret is not set or if SecretStorage is unavailable.
 */
export function getSecretValue(app: App | null | undefined, secretId?: string | null): string | undefined {
	if (!app || !secretId) {
		return undefined;
	}

	try {
		return app.secretStorage?.getSecret(secretId) ?? undefined;
	} catch (error) {
		console.error(`[SecretStorage] Failed to read secret "${secretId}":`, error);
		return undefined;
	}
}
