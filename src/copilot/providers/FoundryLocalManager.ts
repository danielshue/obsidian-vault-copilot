/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from "child_process";
import { Platform } from "obsidian";

/**
 * Snapshot of Foundry Local CLI availability.
 */
export interface FoundryLocalCliStatus {
	installed: boolean;
	version?: string;
	error?: string;
}

/**
 * Manages Foundry Local CLI detection, model cache discovery, and install actions.
 */
export class FoundryLocalManager {
	private cachedStatus: FoundryLocalCliStatus | null = null;
	private cachedModels: string[] | null = null;

	/**
	 * Clears cached CLI/model status so the next read forces a fresh check.
	 */
	invalidateCache(): void {
		this.cachedStatus = null;
		this.cachedModels = null;
	}

	/**
	 * Returns Foundry Local install status.
	 *
	 * @param forceRefresh - When true, bypasses cached results.
	 */
	async getStatus(forceRefresh = false): Promise<FoundryLocalCliStatus> {
		if (this.cachedStatus && !forceRefresh) {
			return this.cachedStatus;
		}

		const status = await this.checkInstalled();
		this.cachedStatus = status;
		return status;
	}

	/**
	 * Executes `foundry --version` and parses installation/version state.
	 */
	private async checkInstalled(): Promise<FoundryLocalCliStatus> {
		return new Promise((resolve) => {
			exec("foundry --version", { timeout: 10000 }, (error, stdout, stderr) => {
				if (error) {
					const message = (stderr || error.message || "").toLowerCase();
					const notFound = message.includes("not found") || message.includes("not recognized");
					resolve({
						installed: false,
						error: notFound ? "Foundry Local CLI not found" : (stderr || error.message),
					});
					return;
				}

				const output = `${stdout}\n${stderr}`.trim();
				const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
				resolve({
					installed: true,
					version: versionMatch ? versionMatch[1] : output,
				});
			});
		});
	}

	/**
	 * Lists locally cached Foundry models using `foundry cache list`.
	 *
	 * @param forceRefresh - When true, bypasses cached model list.
	 */
	async listCachedModels(forceRefresh = false): Promise<{ models: string[]; error?: string }> {
		if (this.cachedModels && !forceRefresh) {
			return { models: this.cachedModels };
		}

		return new Promise((resolve) => {
			exec("foundry cache list", { timeout: 20000 }, (error, stdout, stderr) => {
				if (error) {
					resolve({ models: [], error: stderr || error.message });
					return;
				}

				const models = FoundryLocalManager.parseCachedModels(stdout);
				this.cachedModels = models;
				resolve({ models });
			});
		});
	}

	/**
	 * Returns platform-specific install command metadata for Foundry Local.
	 */
	getInstallCommand(): { command: string; description: string; url: string } {
		if (Platform.isWin) {
			return {
				command: "winget install Microsoft.FoundryLocal",
				description: "Install Foundry Local (Windows)",
				url: "https://learn.microsoft.com/en-us/azure/foundry-local/get-started",
			};
		}

		if ((Platform as unknown as { isMacOS?: boolean; isMac?: boolean }).isMacOS || (Platform as unknown as { isMac?: boolean }).isMac) {
			return {
				command: "brew tap microsoft/foundrylocal && brew install foundrylocal",
				description: "Install Foundry Local (macOS)",
				url: "https://learn.microsoft.com/en-us/azure/foundry-local/get-started",
			};
		}

		return {
			command: "",
			description: "Foundry Local is currently documented for Windows and macOS.",
			url: "https://learn.microsoft.com/en-us/azure/foundry-local/get-started",
		};
	}

	/**
	 * Attempts to install Foundry Local CLI using the platform install command.
	 *
	 * @returns True when install command exits successfully.
	 */
	async installCli(): Promise<boolean> {
		const installInfo = this.getInstallCommand();
		if (!installInfo.command) return false;

		return new Promise((resolve) => {
			exec(installInfo.command, { timeout: 5 * 60 * 1000 }, (error, _stdout, _stderr) => {
				if (error) {
					resolve(false);
					return;
				}
				this.invalidateCache();
				resolve(true);
			});
		});
	}

	/**
	 * Downloads a Foundry model by ID (for example: `fara-7b`, `phi-4`).
	 *
	 * @returns True when the download command exits successfully.
	 */
	async downloadModel(modelId: string): Promise<boolean> {
		const trimmed = modelId.trim();
		if (!trimmed) return false;

		return new Promise((resolve) => {
			exec(`foundry model download ${trimmed}`, { timeout: 30 * 60 * 1000 }, (error) => {
				if (error) {
					resolve(false);
					return;
				}
				this.cachedModels = null;
				resolve(true);
			});
		});
	}

	/**
	 * Parses model names from `foundry cache list` output into normalized IDs.
	 */
	private static parseCachedModels(output: string): string[] {
		const lines = output
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);

		const ignoredPrefixes = new Set([
			"name",
			"model",
			"alias",
			"size",
			"path",
			"id",
			"cached",
		]);

		const models = new Set<string>();
		for (const line of lines) {
			if (/^[-=|+]+$/.test(line)) continue;
			if (line.startsWith("Foundry")) continue;
			if (line.toLowerCase().startsWith("cache")) continue;

			const firstToken = line.split(/\s+/)[0]?.trim();
			if (!firstToken) continue;
			const tokenLower = firstToken.toLowerCase();
			if (ignoredPrefixes.has(tokenLower)) continue;

			if (/^[a-z0-9][a-z0-9._-]*$/i.test(firstToken)) {
				models.add(tokenLower);
			}
		}

		return Array.from(models).sort();
	}
}
