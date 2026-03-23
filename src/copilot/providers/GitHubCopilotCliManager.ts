/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module GitHubCopilotCliManager
 * @description Utilities for detecting, installing, and initializing the GitHub Copilot CLI.
 *
 * This module encapsulates platform-specific shell behavior used by the plugin
 * settings UI to validate CLI setup and guide users through installation/auth.
 *
 * ## Responsibilities
 *
 * - Check whether the Copilot CLI is installed and discover its version
 * - Return platform-specific install commands and docs URL
 * - Launch interactive authentication in a separate terminal
 * - Initialize vault access with `--add-dir`
 * - Discover available models from `copilot help`
 *
 * @example
 * ```typescript
 * const manager = new GitHubCopilotCliManager();
 * const status = await manager.getStatus();
 * if (!status.installed) {
 *   const install = manager.getInstallCommand();
 *   console.log(install.command);
 * }
 * ```
 *
 * @see {@link GitHubCopilotCliService} for runtime chat/session integration
 * @since 0.0.1
 */

import { exec, spawn } from "child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Platform } from "obsidian";

/**
 * Installation/version status for GitHub Copilot CLI.
 */
export interface CliStatus {
	/** Whether the CLI executable is available on this machine. */
	installed: boolean;
	/** Parsed CLI version string when installed. */
	version?: string;
	/** Human-readable error description when detection fails. */
	error?: string;
}

/**
 * Manages GitHub Copilot CLI detection, installation, and authentication.
 *
 * This class is intentionally lightweight and shell-driven so it can be
 * used from settings UI actions without requiring the full Copilot SDK.
 *
 * @example
 * ```typescript
 * const manager = new GitHubCopilotCliManager();
 * const ok = await manager.installCli();
 * if (ok) await manager.invalidateCache();
 * ```
 */
export class GitHubCopilotCliManager {
	/** CLI executable path or command name. @internal */
	private cliPath: string;
	/** Cached installation status to avoid repeated shell calls. @internal */
	private cachedStatus: CliStatus | null = null;
	/** Guard to prevent overlapping status checks. @internal */
	private statusCheckInProgress = false;

	/**
	 * Create a CLI manager.
	 *
	 * @param cliPath - Optional explicit CLI path/command; defaults to `copilot`
	 *
	 * @example
	 * ```typescript
	 * const manager = new GitHubCopilotCliManager("C:/Users/me/AppData/Roaming/npm/copilot.cmd");
	 * ```
	 */
	constructor(cliPath?: string) {
		this.cliPath = cliPath || this.resolveCliPath();
	}

	/**
	 * Update the CLI path and invalidate cached status.
	 *
	 * @param path - New executable path/command name; falls back to resolved default when empty
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * manager.setCliPath("copilot");
	 * ```
	 */
	setCliPath(path: string): void {
		this.cliPath = path || this.resolveCliPath();
		this.cachedStatus = null; // Invalidate cache
	}

	/**
	 * Resolve the Copilot CLI executable path with platform-aware fallbacks.
	 *
	 * Obsidian's Electron process (launched via Finder/Dock on macOS, desktop
	 * shortcut on Windows/Linux) inherits a minimal PATH that often excludes
	 * Homebrew, npm global, and VS Code directories. This method probes known
	 * install locations explicitly.
	 *
	 * @returns Resolved CLI path or `"copilot"` as a last resort
	 * @internal
	 */
	private resolveCliPath(): string {
		if (Platform.isWin) {
			const appData = process.env.APPDATA;
			const localAppData = process.env.LOCALAPPDATA;
			const userProfile = process.env.USERPROFILE;

			const candidates = [
				appData ? join(appData, "npm", "copilot.cmd") : undefined,
				appData ? join(appData, "npm", "copilot") : undefined,
				appData ? join(appData, "Code - Insiders", "User", "globalStorage", "github.copilot-chat", "copilotCli", "copilot.bat") : undefined,
				appData ? join(appData, "Code", "User", "globalStorage", "github.copilot-chat", "copilotCli", "copilot.bat") : undefined,
				localAppData ? join(localAppData, "Programs", "Microsoft VS Code Insiders", "bin", "copilot.cmd") : undefined,
				localAppData ? join(localAppData, "Programs", "Microsoft VS Code", "bin", "copilot.cmd") : undefined,
				userProfile ? join(userProfile, "AppData", "Roaming", "npm", "copilot.cmd") : undefined,
			];

			for (const candidate of candidates) {
				if (candidate && existsSync(candidate)) {
					return candidate;
				}
			}
		} else if (Platform.isMacOS) {
			const home = homedir();
			const candidates = [
				// Homebrew (Apple Silicon)
				"/opt/homebrew/bin/copilot",
				// Homebrew (Intel) / npm global default prefix
				"/usr/local/bin/copilot",
				// VS Code Insiders bundled CLI
				join(home, "Library", "Application Support", "Code - Insiders", "User", "globalStorage", "github.copilot-chat", "copilotCli", "copilot"),
				// VS Code bundled CLI
				join(home, "Library", "Application Support", "Code", "User", "globalStorage", "github.copilot-chat", "copilotCli", "copilot"),
				// User-local bin
				join(home, ".local", "bin", "copilot"),
			];

			for (const candidate of candidates) {
				if (existsSync(candidate)) {
					return candidate;
				}
			}
		} else {
			// Linux
			const home = homedir();
			const candidates = [
				"/usr/local/bin/copilot",
				join(home, ".local", "bin", "copilot"),
				join(home, ".config", "Code - Insiders", "User", "globalStorage", "github.copilot-chat", "copilotCli", "copilot"),
				join(home, ".config", "Code", "User", "globalStorage", "github.copilot-chat", "copilotCli", "copilot"),
			];

			for (const candidate of candidates) {
				if (existsSync(candidate)) {
					return candidate;
				}
			}
		}

		return "copilot";
	}

	/**
	 * Check whether the CLI is installed and parse its version.
	 *
	 * Executes `<cliPath> --version` with a timeout and maps common
	 * not-found errors to a friendly message.
	 *
	 * @returns Installation result with optional version or error
	 *
	 * @example
	 * ```typescript
	 * const result = await manager.checkInstalled();
	 * if (result.installed) console.log(result.version);
	 * ```
	 */
	async checkInstalled(): Promise<{ installed: boolean; version?: string; error?: string }> {
		return new Promise((resolve) => {
			exec(`${this.cliPath} --version`, { timeout: 10000 }, (error, stdout, _stderr) => {
				if (error) {
					resolve({ 
						installed: false, 
						error: error.message.includes("not recognized") || error.message.includes("not found")
								? "GitHub Copilot CLI not found"
							: error.message
					});
				} else {
					// Parse version from output (e.g., "copilot version 0.0.397")
					const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
					const version = versionMatch ? versionMatch[1] : stdout.trim();
					resolve({ installed: true, version });
				}
			});
		});
	}

	/**
	 * Get CLI status (installation + version), with optional cache refresh.
	 *
	 * Authentication state is handled interactively by the CLI itself via
	 * `/login`, so this method only checks executable availability.
	 *
	 * @param forceRefresh - When true, bypasses cache and performs a new shell check
	 * @returns Cached or freshly-computed {@link CliStatus}
	 *
	 * @example
	 * ```typescript
	 * const status = await manager.getStatus(true);
	 * ```
	 */
	async getStatus(forceRefresh = false): Promise<CliStatus> {
		if (this.cachedStatus && !forceRefresh) {
			return this.cachedStatus;
		}

		if (this.statusCheckInProgress) {
			// Wait a bit and return cached status
			await new Promise(resolve => setTimeout(resolve, 100));
			return this.cachedStatus || { installed: false };
		}

		this.statusCheckInProgress = true;

		try {
			const installCheck = await this.checkInstalled();
			
			this.cachedStatus = {
				installed: installCheck.installed,
				version: installCheck.version,
				error: installCheck.error,
			};

			return this.cachedStatus;
		} finally {
			this.statusCheckInProgress = false;
		}
	}

	/**
	 * Get platform-specific install command and documentation URL.
	 *
	 * @returns Install metadata including shell command, description, and docs link
	 *
	 * @example
	 * ```typescript
	 * const install = manager.getInstallCommand();
	 * console.log(install.command);
	 * ```
	 */
	getInstallCommand(): { command: string; description: string; url: string } {
		if (Platform.isWin) {
			return {
				command: "winget install GitHub.Copilot",
				description: "Install using WinGet (Windows)",
				url: "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli",
			};
		} else if (Platform.isMacOS) {
			return {
				command: "brew install copilot-cli",
				description: "Install using Homebrew (macOS)",
				url: "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli",
			};
		} else {
			// Linux or other
			return {
				command: "npm install -g @github/copilot",
				description: "Install using npm (requires Node.js 22+)",
				url: "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli",
			};
		}
	}

	/**
	 * Attempt to install the CLI using platform-default package manager commands.
	 *
	 * - Windows: `winget install GitHub.Copilot`
	 * - macOS: `brew install copilot-cli`
	 * - Linux/other: `npm install -g @github/copilot`
	 *
	 * @returns `true` when command exits successfully, otherwise `false`
	 *
	 * @example
	 * ```typescript
	 * const installed = await manager.installCli();
	 * ```
	 *
	 * @see {@link getInstallCommand} for command preview and docs URL
	 */
	async installCli(): Promise<boolean> {
		if (Platform.isWin) {
			return this.runInstallCommand("winget", ["install", "GitHub.Copilot"]);
		} else if (Platform.isMacOS) {
			return this.runInstallCommand("brew", ["install", "copilot-cli"]);
		} else {
			// For Linux, try npm
			return this.runInstallCommand("npm", ["install", "-g", "@github/copilot"]);
		}
	}

	/**
	 * Execute an install command and capture success/failure.
	 *
	 * @param command - Executable to run (e.g. `winget`, `brew`, `npm`)
	 * @param args - Command arguments
	 * @returns `true` on success, otherwise `false`
	 * @internal
	 */
	private runInstallCommand(command: string, args: string[]): Promise<boolean> {
		return new Promise((resolve) => {
			const child = spawn(command, args, { 
				shell: true,
				stdio: "pipe"
			});

			let output = "";
			let errorOutput = "";

			child.stdout?.on("data", (data) => {
				output += data.toString();
			});

			child.stderr?.on("data", (data) => {
				errorOutput += data.toString();
			});

			child.on("close", (code) => {
				if (code === 0) {
					this.cachedStatus = null; // Invalidate cache
					resolve(true);
				} else {
					console.error(`Failed to install GitHub Copilot CLI. Please install manually.`);
					console.error("Install error:", errorOutput || output);
					resolve(false);
				}
			});

			child.on("error", (err) => {
				console.error(`Installation failed: ${err.message}. Please install manually.`);
				resolve(false);
			});

			// Timeout after 5 minutes
			setTimeout(() => {
				child.kill();
				console.error("Installation timed out. Please install manually.");
				resolve(false);
			}, 5 * 60 * 1000);
		});
	}

	/**
	 * Open an interactive terminal session for CLI authentication.
	 *
	 * Launches a new platform-specific terminal window and starts Copilot CLI,
	 * optionally granting vault access via `--add-dir`.
	 *
	 * @param vaultPath - The path to the Obsidian vault for authentication context
	 * @returns Resolves after launch is initiated
	 *
	 * @example
	 * ```typescript
	 * await manager.openForAuthentication(vaultPath);
	 * // User then runs /login in the opened terminal
	 * ```
	 */
	async openForAuthentication(vaultPath?: string): Promise<void> {
		return new Promise((resolve) => {
			// Build CLI command with vault path if provided
			// Use --add-dir to grant access to the vault directory
			const normalizedPath = vaultPath?.replace(/\\/g, "/");
			const cliCmd = normalizedPath 
				? `${this.cliPath} --add-dir "${normalizedPath}"`
				: this.cliPath;

			// Spawn the CLI in a way that allows user interaction
			// On desktop, this should open a new terminal window
			if (Platform.isWin) {
				// On Windows, use start to open a new cmd window with the vault as cwd
				const cwdArg = vaultPath ? `/d "${vaultPath}"` : "";
				spawn("cmd", ["/c", "start", "cmd", cwdArg, "/k", cliCmd], { 
					shell: true,
					detached: true,
					stdio: "ignore",
					cwd: vaultPath || undefined
				});
			} else if (Platform.isMacOS) {
				// On macOS, cd to vault path first then run CLI
				const script = vaultPath
					? `tell application "Terminal" to do script "cd '${vaultPath}' && ${cliCmd}"`
					: `tell application "Terminal" to do script "${cliCmd}"`;
				spawn("osascript", ["-e", script], {
					detached: true,
					stdio: "ignore"
				});
			} else {
				// Linux - try common terminals
				const terminals = ["gnome-terminal", "konsole", "xterm"];
				for (const term of terminals) {
					try {
						spawn(term, ["--", "bash", "-c", `cd "${vaultPath || '.'}" && ${cliCmd}`], {
							detached: true,
							stdio: "ignore"
						});
						break;
					} catch {
						continue;
					}
				}
			}

			setTimeout(resolve, 1000);
		});
	}

	/**
	 * Invalidate cached installation status.
	 *
	 * @returns Nothing
	 *
	 * @example
	 * ```typescript
	 * manager.invalidateCache();
	 * ```
	 */
	invalidateCache(): void {
		this.cachedStatus = null;
	}

	/**
	 * Fetch available models by parsing `copilot help` output.
	 *
	 * Parses the `--model` choices segment from CLI help text and returns
	 * sorted model names. If parsing fails, returns an empty list and error.
	 *
	 * @returns Object containing discovered model IDs and optional error
	 *
	 * @example
	 * ```typescript
	 * const { models } = await manager.fetchAvailableModels();
	 * ```
	 */
	async fetchAvailableModels(): Promise<{ models: string[]; error?: string }> {
		return new Promise((resolve) => {
			exec(`${this.cliPath} help`, { timeout: 15000 }, (error, stdout, stderr) => {
				if (error) {
					console.error("[GitHubCopilotCliManager] Error fetching models:", error.message);
					resolve({ models: [], error: error.message });
					return;
				}

				// Parse models from the --model line
				// Example: --model <model>  Set the AI model (choices: "claude-sonnet-4.5", "gpt-4.1", ...)
				const output = stdout + stderr;
				const modelMatch = output.match(/--model\s+<model>\s+.*?\(choices:\s*([^)]+)\)/i);
				
				if (modelMatch && modelMatch[1]) {
					// Extract quoted model names
					const modelString = modelMatch[1];
					const models = modelString
						.match(/"([^"]+)"/g)
						?.map(m => m.replace(/"/g, ''))
						.filter(m => m.length > 0)
						.sort() || [];
					
					if (models.length > 0) {
						console.log(`[GitHubCopilotCliManager] Discovered ${models.length} models from CLI`);
						resolve({ models });
						return;
					}
				}

				console.warn("[GitHubCopilotCliManager] Could not parse models from CLI help output");
				resolve({ models: [], error: "Could not parse models from CLI output" });
			});
		});
	}

	/**
	 * Initialize Copilot CLI access for a specific vault directory.
	 *
	 * Runs: `copilot --add-dir <vault_path>`.
	 *
	 * @param vaultPath - Absolute path to the vault directory
	 * @returns Success flag and optional error details
	 *
	 * @example
	 * ```typescript
	 * const result = await manager.initializeVault(vaultPath);
	 * if (!result.success) console.error(result.error);
	 * ```
	 *
	 * @see {@link openForAuthentication} to open an interactive CLI session
	 */
	async initializeVault(vaultPath: string): Promise<{ success: boolean; error?: string }> {
		return new Promise((resolve) => {
			// Normalize path for cross-platform compatibility
			const normalizedPath = vaultPath.replace(/\\/g, "/");

			exec(
				`${this.cliPath} --add-dir "${normalizedPath}"`,
				{ timeout: 30000 },
				(error, stdout, stderr) => {
					if (error) {
						const errorMsg = stderr || error.message;
						console.error(`Failed to initialize vault: ${errorMsg}`);
						resolve({ success: false, error: errorMsg });
					} else {
						this.cachedStatus = null; // Invalidate cache
						resolve({ success: true });
					}
				}
			);
		});
	}

	/**
	 * Check if the installed CLI version supports the extensions system.
	 *
	 * CLI extensions (`.github/extensions/`) require Copilot CLI >= 1.0.8.
	 * Returns false if CLI is not installed or version is below minimum.
	 *
	 * @returns `true` if CLI supports extensions, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * const status = await manager.getStatus();
	 * if (manager.supportsExtensions()) {
	 *     // Show extension authoring tools
	 * }
	 * ```
	 *
	 * @since 0.0.47
	 */
	supportsExtensions(): boolean {
		if (!this.cachedStatus?.installed || !this.cachedStatus.version) {
			return false;
		}
		return GitHubCopilotCliManager.compareVersions(this.cachedStatus.version, "1.0.8") >= 0;
	}

	/**
	 * Compare two semver version strings.
	 *
	 * @param a - First version (e.g. "1.0.8")
	 * @param b - Second version (e.g. "1.0.0")
	 * @returns Negative if a < b, zero if equal, positive if a > b
	 * @internal
	 */
	static compareVersions(a: string, b: string): number {
		const pa = a.split(".").map(Number);
		const pb = b.split(".").map(Number);
		for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
			const na = pa[i] || 0;
			const nb = pb[i] || 0;
			if (na !== nb) return na - nb;
		}
		return 0;
	}
}
