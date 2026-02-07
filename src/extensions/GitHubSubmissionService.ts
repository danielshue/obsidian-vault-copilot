/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/GitHubSubmissionService
 * @description Service for submitting extensions to the obsidian-vault-copilot repository via GitHub.
 * 
 * This service orchestrates the complete workflow for submitting an extension to the
 * official marketplace catalog, including validation, GitHub setup, branch creation,
 * file operations, and pull request creation using the GitHub Copilot CLI SDK.
 * 
 * **Workflow Steps:**
 * 1. Validate extension files and manifest
 * 2. Check GitHub setup (CLI auth, fork exists)
 * 3. Create a new branch in the fork
 * 4. Copy extension files to the appropriate directory
 * 5. Commit and push changes
 * 6. Create a pull request to the upstream repository
 * 
 * @example
 * ```typescript
 * const service = new GitHubSubmissionService();
 * await service.initialize();
 * 
 * const result = await service.submitExtension({
 *   extensionPath: "/path/to/my-agent",
 *   extensionId: "my-agent",
 *   extensionType: "agent",
 *   version: "1.0.0",
 *   branchName: "add-my-agent"
 * });
 * 
 * if (result.success) {
 *   console.log(`PR created: ${result.pullRequestUrl}`);
 * }
 * ```
 * 
 * @since 0.0.19
 */

import { CopilotClient, defineTool } from "@github/copilot-sdk";
import type { CopilotSession } from "@github/copilot-sdk";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * Configuration options for the GitHub Submission Service.
 * 
 * @example
 * ```typescript
 * const config: GitHubSubmissionConfig = {
 *   upstreamOwner: "danielshue",
 *   upstreamRepo: "obsidian-vault-copilot",
 *   targetBranch: "master"
 * };
 * ```
 */
export interface GitHubSubmissionConfig {
	/** GitHub username/organization that owns the upstream repository */
	upstreamOwner: string;
	
	/** Name of the upstream repository */
	upstreamRepo: string;
	
	/** Target branch to create PR against (default: "master") */
	targetBranch?: string;
	
	/** Custom fork owner (if different from authenticated user) */
	forkOwner?: string;
}

/**
 * Parameters for submitting an extension to the marketplace.
 * 
 * @example
 * ```typescript
 * const params: ExtensionSubmissionParams = {
 *   extensionPath: "/vault/Reference/Agents/my-agent",
 *   extensionId: "my-agent",
 *   extensionType: "agent",
 *   version: "1.0.0",
 *   branchName: "add-my-agent-1.0.0"
 * };
 * ```
 */
export interface ExtensionSubmissionParams {
	/** Absolute path to the extension directory */
	extensionPath: string;
	
	/** Unique extension ID (lowercase-with-hyphens) */
	extensionId: string;
	
	/** Type of extension being submitted */
	extensionType: "agent" | "voice-agent" | "prompt" | "skill" | "mcp-server";
	
	/** Semantic version of the extension */
	version: string;
	
	/** Name of the branch to create for the submission */
	branchName: string;
	
	/** Optional commit message override */
	commitMessage?: string;
	
	/** Optional PR title override */
	prTitle?: string;
	
	/** Optional PR description override */
	prDescription?: string;
}

/**
 * Result of an extension submission operation.
 * 
 * @example
 * ```typescript
 * const result: ExtensionSubmissionResult = {
 *   success: true,
 *   pullRequestUrl: "https://github.com/danielshue/obsidian-vault-copilot/pull/42",
 *   pullRequestNumber: 42,
 *   branchName: "add-my-agent-1.0.0",
 *   validationErrors: []
 * };
 * ```
 */
export interface ExtensionSubmissionResult {
	/** Whether the submission was successful */
	success: boolean;
	
	/** URL to the created pull request (if successful) */
	pullRequestUrl?: string;
	
	/** Pull request number (if successful) */
	pullRequestNumber?: number;
	
	/** Name of the branch created */
	branchName?: string;
	
	/** List of validation errors (if any) */
	validationErrors: string[];
	
	/** Error message if submission failed */
	error?: string;
	
	/** Detailed error information for debugging */
	details?: unknown;
}

/**
 * Validation result for extension files and manifest.
 */
interface ValidationResult {
	/** Whether validation passed */
	valid: boolean;
	
	/** List of validation errors */
	errors: string[];
	
	/** List of validation warnings */
	warnings: string[];
}

/**
 * Service for submitting extensions to the GitHub marketplace repository.
 * Uses the GitHub Copilot CLI SDK to interact with GitHub APIs through custom tools.
 * 
 * @example
 * ```typescript
 * const service = new GitHubSubmissionService({
 *   upstreamOwner: "danielshue",
 *   upstreamRepo: "obsidian-vault-copilot"
 * });
 * 
 * await service.initialize();
 * const result = await service.submitExtension(params);
 * await service.cleanup();
 * ```
 */
export class GitHubSubmissionService {
	private config: GitHubSubmissionConfig;
	private client: CopilotClient | null = null;
	private session: CopilotSession | null = null;
	private initialized = false;
	private commandLogger: ((command: string, cwd?: string) => void) | null = null;

	/**
	 * Creates a new GitHub Submission Service instance.
	 * 
	 * @param config - Configuration options for the service
	 * 
	 * @example
	 * ```typescript
	 * const service = new GitHubSubmissionService({
	 *   upstreamOwner: "danielshue",
	 *   upstreamRepo: "obsidian-vault-copilot",
	 *   targetBranch: "main"
	 * });
	 * ```
	 */
	constructor(config: GitHubSubmissionConfig) {
		this.config = {
			targetBranch: "master",
			...config,
		};
	}

	/**
	 * Initializes the service by creating a Copilot client and session with GitHub tools.
	 * Must be called before using submitExtension().
	 * 
	 * @throws {Error} If the GitHub Copilot CLI is not installed or authenticated
	 * 
	 * @example
	 * ```typescript
	 * await service.initialize();
	 * ```
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			// Create Copilot client
			this.client = new CopilotClient({
				autoStart: true,
			});

			await this.client.start();

			// Create session with GitHub tools
			this.session = await this.client.createSession({
				model: "gpt-5",
				tools: this.createGitHubTools(),
				systemMessage: {
					mode: "append",
					content: `
You are an AI assistant helping to submit extensions to a GitHub repository.
Your role is to execute GitHub operations (fork, branch, commit, push, PR creation) using the provided tools.
Always use the tools provided rather than suggesting manual commands.
Be precise and follow instructions carefully.
`,
				},
			});

			this.initialized = true;
		} catch (error) {
			throw new Error(
				`Failed to initialize GitHub Submission Service: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Validates extension files and manifest before submission.
	 * 
	 * **Validation checks:**
	 * - All required files exist (manifest.json, README.md, extension files)
	 * - manifest.json is valid JSON and follows schema
	 * - Extension ID matches directory name
	 * - Version follows semantic versioning
	 * - File sizes are within limits
	 * - No security issues detected
	 * 
	 * @param params - Extension submission parameters
	 * @returns Validation result with errors and warnings
	 * 
	 * @example
	 * ```typescript
	 * const validation = await service.validateExtension(params);
	 * if (!validation.valid) {
	 *   console.error("Validation errors:", validation.errors);
	 * }
	 * ```
	 */
	async validateExtension(
		params: ExtensionSubmissionParams
	): Promise<ValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];

		try {
			// Check if extension directory exists
			if (!fs.existsSync(params.extensionPath)) {
				errors.push(`Extension directory not found: ${params.extensionPath}`);
				return { valid: false, errors, warnings };
			}

			// Check for required files
			const manifestPath = path.join(params.extensionPath, "manifest.json");
			const readmePath = path.join(params.extensionPath, "README.md");

			if (!fs.existsSync(manifestPath)) {
				errors.push("manifest.json is required");
			}

			if (!fs.existsSync(readmePath)) {
				errors.push("README.md is required");
			}

			// Validate manifest.json if it exists
			if (fs.existsSync(manifestPath)) {
				try {
					const manifestContent = fs.readFileSync(manifestPath, "utf-8");
					const manifest = JSON.parse(manifestContent);

					// Validate required fields
					if (!manifest.id) {
						errors.push("manifest.json must have an 'id' field");
					} else if (manifest.id !== params.extensionId) {
						errors.push(
							`manifest.json id "${manifest.id}" does not match expected "${params.extensionId}"`
						);
					}

					if (!manifest.name) {
						errors.push("manifest.json must have a 'name' field");
					}

					if (!manifest.version) {
						errors.push("manifest.json must have a 'version' field");
					} else if (manifest.version !== params.version) {
						warnings.push(
							`manifest.json version "${manifest.version}" does not match expected "${params.version}"`
						);
					}

					if (!manifest.type) {
						errors.push("manifest.json must have a 'type' field");
					} else if (manifest.type !== params.extensionType) {
						errors.push(
							`manifest.json type "${manifest.type}" does not match expected "${params.extensionType}"`
						);
					}

					// Validate semantic versioning
					const semverRegex = /^\d+\.\d+\.\d+$/;
					if (!semverRegex.test(params.version)) {
						errors.push(
							`Version "${params.version}" does not follow semantic versioning (x.y.z)`
						);
					}
				} catch (parseError) {
					errors.push(
						`manifest.json is not valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
					);
				}
			}

			// Check for extension-specific required files
			const extensionFile = this.getExpectedExtensionFile(
				params.extensionType,
				params.extensionId
			);
			const extensionFilePath = path.join(
				params.extensionPath,
				extensionFile
			);

			if (!fs.existsSync(extensionFilePath)) {
				errors.push(
					`Extension file not found: ${extensionFile} (expected for ${params.extensionType})`
				);
			}

			// Check file sizes
			const files = fs.readdirSync(params.extensionPath);
			let totalSize = 0;

			for (const file of files) {
				const filePath = path.join(params.extensionPath, file);
				const stat = fs.statSync(filePath);

				if (stat.isFile()) {
					totalSize += stat.size;

					// Warn if single file is large
					if (stat.size > 100 * 1024) {
						// 100KB
						warnings.push(
							`File ${file} is large (${Math.round(stat.size / 1024)}KB)`
						);
					}
				}
			}

			// Error if total size exceeds limit
			if (totalSize > 2 * 1024 * 1024) {
				// 2MB
				errors.push(
					`Total extension size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds 2MB limit`
				);
			}
		} catch (error) {
			errors.push(
				`Validation failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Submits an extension to the GitHub marketplace repository.
	 * 
	 * **Workflow:**
	 * 1. Validates extension files and manifest
	 * 2. Checks GitHub authentication
	 * 3. Ensures fork exists
	 * 4. Creates a new branch
	 * 5. Copies extension files
	 * 6. Commits and pushes changes
	 * 7. Creates a pull request
	 * 
	 * @param params - Extension submission parameters
	 * @returns Submission result with PR URL or errors
	 * 
	 * @throws {Error} If service is not initialized
	 * 
	 * @example
	 * ```typescript
	 * const result = await service.submitExtension({
	 *   extensionPath: "/vault/Reference/Agents/my-agent",
	 *   extensionId: "my-agent",
	 *   extensionType: "agent",
	 *   version: "1.0.0",
	 *   branchName: "add-my-agent"
	 * });
	 * 
	 * if (result.success) {
	 *   console.log(`Successfully created PR: ${result.pullRequestUrl}`);
	 * } else {
	 *   console.error("Submission failed:", result.validationErrors);
	 * }
	 * ```
	 */
	async submitExtension(
		params: ExtensionSubmissionParams
	): Promise<ExtensionSubmissionResult> {
		if (!this.initialized || !this.session) {
			throw new Error(
				"GitHubSubmissionService must be initialized before use. Call initialize() first."
			);
		}

		// Step 1: Validate extension files and manifest
		const validation = await this.validateExtension(params);

		if (!validation.valid) {
			return {
				success: false,
				validationErrors: validation.errors,
				error: "Extension validation failed",
			};
		}

		try {
			// Prepare the submission prompt
			const prompt = this.buildSubmissionPrompt(params);

			// Send the submission request to the Copilot session
			await this.session.send({ prompt });

			// Wait for the session to complete all operations
			const result = await this.waitForSubmissionComplete();

			return result;
		} catch (error) {
			return {
				success: false,
				validationErrors: [],
				error: `Submission failed: ${error instanceof Error ? error.message : String(error)}`,
				details: error,
			};
		}
	}

	/**
	 * Cleans up resources used by the service.
	 * Should be called when the service is no longer needed.
	 * 
	 * @example
	 * ```typescript
	 * await service.cleanup();
	 * ```
	 */
	async cleanup(): Promise<void> {
		if (this.session) {
			await this.session.destroy();
			this.session = null;
		}

		if (this.client) {
			await this.client.stop();
			this.client = null;
		}

		this.initialized = false;
	}

	/**
	 * Attempts to abort any in-flight Copilot session work.
	 *
	 * This is a best-effort cancellation mechanism used when the user
	 * cancels the submission workflow from the UI. It does not forcibly
	 * terminate already-spawned git/gh processes, but it will stop
	 * additional tool invocations and mark the Copilot session as aborted.
	 *
	 * @since 0.0.18
	 */
	async abort(): Promise<void> {
		if (this.session && typeof this.session.abort === "function") {
			await this.session.abort();
		}
	}

	/**
	 * Sets a callback used to report each GitHub CLI command that the
	 * submission workflow executes.
	 *
	 * This is primarily intended for UI layers that want to surface a
	 * human-readable log (for example, nested under a "Submitting" step
	 * in a progress view). The callback is invoked before each `gh`
	 * command is run, and is best-effort only – failures are still
	 * reported via the normal error handling path.
	 *
	 * @param logger - Function that receives the full `gh` command and optional cwd
	 *
	 * @example
	 * ```typescript
	 * service.setCommandLogger((command, cwd) => {
	 *   console.log("Running:", command, "in", cwd);
	 * });
	 * ```
	 *
	 * @since 0.0.19
	 */
	setCommandLogger(logger: (command: string, cwd?: string) => void): void {
		this.commandLogger = logger;
	}

	// =========================================================================
	// Private Helper Methods
	// =========================================================================

	/**
	 * Gets the expected extension file name based on type and ID.
	 * 
	 * @param type - Extension type
	 * @param id - Extension ID
	 * @returns Expected filename
	 * 
	 * @internal
	 */
	private getExpectedExtensionFile(
		type: string,
		id: string
	): string {
		switch (type) {
			case "agent":
				return `${id}.agent.md`;
			case "voice-agent":
				return `${id}.voice-agent.md`;
			case "prompt":
				return `${id}.prompt.md`;
			case "skill":
				return "skill.md";
			case "mcp-server":
				return "mcp-config.json";
			default:
				return `${id}.md`;
		}
	}

	/**
	 * Builds the submission prompt for the Copilot session.
	 * 
	 * @param params - Extension submission parameters
	 * @returns Formatted prompt string
	 * 
	 * @internal
	 */
	private buildSubmissionPrompt(params: ExtensionSubmissionParams): string {
		const { upstreamOwner, upstreamRepo, targetBranch } = this.config;

		const commitMessage =
			params.commitMessage ||
			`Add ${params.extensionType}: ${params.extensionId} v${params.version}`;

		const prTitle =
			params.prTitle ||
			`[${this.capitalizeType(params.extensionType)}] ${params.extensionId} v${params.version}`;

		const prDescription =
			params.prDescription ||
			`## Extension Submission

**Extension Name:** ${params.extensionId}
**Extension ID:** ${params.extensionId}
**Type:** ${params.extensionType}
**Version:** ${params.version}

This PR adds a new ${params.extensionType} extension to the marketplace.

### Checklist
- [x] manifest.json validates against schema
- [x] README.md included
- [x] Extension file(s) included
- [x] No security issues detected
`;

		return `I need you to submit an extension to the GitHub repository ${upstreamOwner}/${upstreamRepo}.

Please execute the following workflow:

1. **Check GitHub Authentication**: Verify that the GitHub CLI is authenticated and ready to use.

2. **Ensure Fork Exists**: Check if a fork of ${upstreamOwner}/${upstreamRepo} exists for the authenticated user. If not, create a fork.

3. **Create Branch**: Create a new branch named "${params.branchName}" in the fork from the ${targetBranch} branch.

4. **Copy Extension Files**: Copy all files from "${params.extensionPath}" to "extensions/${this.getExtensionTypeFolder(params.extensionType)}/${params.extensionId}/" in the fork.

5. **Commit Changes**: Commit the changes with the message: "${commitMessage}"

6. **Push Branch**: Push the branch "${params.branchName}" to the fork.

7. **Create Pull Request**: Create a pull request from the fork's "${params.branchName}" branch to ${upstreamOwner}/${upstreamRepo}:${targetBranch} with:
   - Title: "${prTitle}"
   - Description: "${prDescription}"

Please execute these steps using the GitHub tools provided and report the pull request URL when complete.`;
	}

	/**
	 * Waits for the submission workflow to complete and extracts the result.
	 * 
	 * @returns Submission result
	 * 
	 * @internal
	 */
	private async waitForSubmissionComplete(): Promise<ExtensionSubmissionResult> {
		return new Promise((resolve) => {
			if (!this.session) {
				resolve({
					success: false,
					validationErrors: [],
					error: "Session not initialized",
				});
				return;
			}

			let responseText = "";

			const unsubscribe = this.session.on((event) => {
				if (event.type === "assistant.message") {
					responseText = event.data.content;
				} else if (event.type === "session.idle") {
					unsubscribe();

					// Parse the response to extract PR information
					const result = this.parseSubmissionResponse(responseText);
					resolve(result);
				} else if (event.type === "session.error") {
					unsubscribe();
					resolve({
						success: false,
						validationErrors: [],
						error: event.data.message,
					});
				}
			});
		});
	}

	/**
	 * Parses the Copilot session response to extract submission result.
	 * 
	 * @param response - Response text from the session
	 * @returns Parsed submission result
	 * 
	 * @internal
	 */
	private parseSubmissionResponse(
		response: string
	): ExtensionSubmissionResult {
		// Look for PR URL in the response
		const urlMatch = response.match(
			/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/
		);

		if (urlMatch && urlMatch[1]) {
			const prNumberString = urlMatch[1];
			return {
				success: true,
				pullRequestUrl: urlMatch[0],
				pullRequestNumber: parseInt(prNumberString, 10),
				validationErrors: [],
			};
		}

		// If no PR URL found, consider it a failure
		return {
			success: false,
			validationErrors: [],
			error: "Failed to create pull request",
			details: response,
		};
	}

	/**
	 * Gets the folder name for an extension type.
	 * 
	 * @param type - Extension type
	 * @returns Folder name (plural)
	 * 
	 * @internal
	 */
	private getExtensionTypeFolder(type: string): string {
		switch (type) {
			case "agent":
				return "agents";
			case "voice-agent":
				return "voice-agents";
			case "prompt":
				return "prompts";
			case "skill":
				return "skills";
			case "mcp-server":
				return "mcp-servers";
			default:
				return type + "s";
		}
	}

	/**
	 * Capitalizes the extension type for display.
	 * 
	 * @param type - Extension type
	 * @returns Capitalized type
	 * 
	 * @internal
	 */
	private capitalizeType(type: string): string {
		return type
			.split("-")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}

	/**
	 * Creates custom tools for GitHub operations using the Copilot SDK.
	 * 
	 * **Tools provided:**
	 * - `check_github_auth` - Verify GitHub CLI authentication
	 * - `check_fork_exists` - Check if fork exists
	 * - `create_fork` - Create a repository fork
	 * - `create_branch` - Create a new branch
	 * - `copy_files` - Copy files to repository
	 * - `commit_changes` - Commit changes
	 * - `push_branch` - Push branch to remote
	 * - `create_pull_request` - Create a pull request
	 * 
	 * @returns Array of custom tools
	 * 
	 * @internal
	 */
	private createGitHubTools() {
		const { upstreamOwner, upstreamRepo } = this.config;
		const targetBranch = this.config.targetBranch ?? "master";

		// Shared state for a single submission workflow
		let authenticatedUsername: string | null = null;
		let currentForkOwner: string | null = this.config.forkOwner ?? null;
		let localRepoPath: string | null = null;

		// Lazily load Node.js modules to ensure compatibility with desktop-only features
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { execFile } = require("child_process");
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { promisify } = require("util");
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const os = require("os");
		const execFileAsync = promisify(execFile);

		/**
		 * Runs a GitHub CLI command.
		 *
		 * @param args - Arguments passed to the `gh` executable
		 * @param cwd - Optional working directory
		 * @returns Standard output and error from the command
		 * 
		 * @internal
		 */
		const runGh = async (
			args: string[],
			cwd?: string
		): Promise<{ stdout: string; stderr: string }> => {
			try {
				const fullCommand = ["gh", ...args].join(" ");
				if (this.commandLogger) {
					this.commandLogger(fullCommand, cwd);
				}
				console.log("[GitHubSubmission] Running gh", { args: fullCommand, cwd });
				const { stdout, stderr } = await execFileAsync("gh", args, {
					cwd,
				});
				return {
					stdout: stdout?.toString() ?? "",
					stderr: stderr?.toString() ?? "",
				};
			} catch (error: unknown) {
				const err = error as { stderr?: string; message?: string };
				throw new Error(
					`gh ${args.join(" ")} failed: ${err.stderr ?? err.message ?? String(error)}`
				);
			}
		};

		/**
		 * Runs a git command in the local repository, optionally allowing failures.
		 *
		 * @param args - Arguments passed to the `git` executable
		 * @param cwd - Working directory (local repository path)
		 * @param allowFailure - Whether to treat failures as non-fatal
		 * @returns Standard output and error from the command
		 * 
		 * @internal
		 */
		const runGit = async (
			args: string[],
			cwd: string,
			allowFailure = false
		): Promise<{ stdout: string; stderr: string }> => {
			try {
				console.log("[GitHubSubmission] Running git", { args: ["git", ...args].join(" "), cwd, allowFailure });
				const { stdout, stderr } = await execFileAsync("git", args, { cwd });
				return {
					stdout: stdout?.toString() ?? "",
					stderr: stderr?.toString() ?? "",
				};
			} catch (error: unknown) {
				if (allowFailure) {
					const err = error as { stdout?: string; stderr?: string; message?: string };
					return {
						stdout: err.stdout?.toString() ?? "",
						stderr: err.stderr?.toString() ?? err.message ?? String(error),
					};
				}

				const err = error as { stderr?: string; message?: string };
				throw new Error(
					`git ${args.join(" ")} failed: ${err.stderr ?? err.message ?? String(error)}`
				);
			}
		};

		/**
		 * Ensures a local clone of the fork (or upstream) repository exists for this workflow.
		 * The repository is cloned into a dedicated submissions folder under the current
		 * working directory.
		 * 
		 * @returns Absolute path to the local repository
		 * 
		 * @internal
		 */
		const ensureLocalRepo = async (): Promise<string> => {
			if (localRepoPath) {
				return localRepoPath;
			}

			const owner = currentForkOwner || authenticatedUsername || upstreamOwner;
			const repoFullName = `${owner}/${upstreamRepo}`;
			// Use the operating system temp directory so that all cloning,
			// branching, and PR preparation happens outside of the source repo.
			const baseDir = path.join(os.tmpdir(), "obsidian-vault-copilot-submissions");

			if (!fs.existsSync(baseDir)) {
				fs.mkdirSync(baseDir, { recursive: true });
			}

			const repoDirName = `${upstreamRepo}-${Date.now()}`;
			const repoDir = path.join(baseDir, repoDirName);

			try {
				fs.mkdirSync(repoDir, { recursive: true });
				console.log("[GitHubSubmission] Cloning repository for submission", {
					repo: repoFullName,
					repoDir,
				});
				await runGh(["repo", "clone", repoFullName, repoDir, "--", "--depth=1"]);
				localRepoPath = repoDir;
				return repoDir;
			} catch (error) {
				throw new Error(
					`Failed to clone repository ${repoFullName}: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		};

		/**
		 * Recursively copies files from source to destination within the local repository.
		 *
		 * @param sourcePath - Absolute source directory path
		 * @param targetPath - Absolute destination directory path
		 * @returns Number of files copied
		 * 
		 * @internal
		 */
		const copyDirectoryRecursive = (
			sourcePath: string,
			targetPath: string
		): number => {
			if (!fs.existsSync(sourcePath)) {
				throw new Error(`Source path does not exist: ${sourcePath}`);
			}

			if (!fs.existsSync(targetPath)) {
				fs.mkdirSync(targetPath, { recursive: true });
			}

			let filesCopied = 0;
			const entries = fs.readdirSync(sourcePath, { withFileTypes: true });

			for (const entry of entries) {
				const sourceEntryPath = path.join(sourcePath, entry.name);
				const targetEntryPath = path.join(targetPath, entry.name);

				if (entry.isDirectory()) {
					filesCopied += copyDirectoryRecursive(sourceEntryPath, targetEntryPath);
				} else if (entry.isFile()) {
					fs.copyFileSync(sourceEntryPath, targetEntryPath);
					filesCopied += 1;
				}
			}

			return filesCopied;
		};

		return [
			// Tool: Check GitHub authentication
			defineTool("check_github_auth", {
				description: "Check if GitHub CLI is authenticated and ready to use",
				parameters: z.object({}),
				handler: async (_args: Record<string, never>) => {
					try {
						console.log("[GitHubSubmission] check_github_auth: start");
						const { stdout } = await runGh([
							"auth",
							"status",
							"--hostname",
							"github.com",
						]);

						let username: string | undefined;
						for (const line of stdout.split(/\r?\n/)) {
							const match = line.match(/Logged in to [^ ]+ as ([^ ]+)/);
							if (match && match[1]) {
								username = match[1];
								break;
							}
						}

						if (username) {
							authenticatedUsername = username;
						}

						const effectiveUser = currentForkOwner || authenticatedUsername;

						return {
							authenticated: true,
							username: effectiveUser ?? username ?? null,
						};
					} catch (error) {
						console.error("[GitHubSubmission] check_github_auth failed", error);
						return {
							authenticated: false,
							username: null,
							error:
								error instanceof Error ? error.message : String(error),
						};
					}
				},
			}),

			// Tool: Check if fork exists
			defineTool("check_fork_exists", {
				description: "Check if a fork of the repository exists for the authenticated user",
				parameters: z.object({
					owner: z.string().describe("Repository owner"),
					repo: z.string().describe("Repository name"),
				}),
				handler: async (args: { owner: string; repo: string }) => {
					const forkFullName = `${args.owner}/${args.repo}`;
					try {
						console.log("[GitHubSubmission] check_fork_exists: start", { forkFullName });
						const { stdout } = await execFileAsync("gh", [
							"api",
							`repos/${forkFullName}`,
						]);
						const data = JSON.parse(stdout?.toString() ?? "{}") as {
							html_url?: string;
							fork?: boolean;
						};

						if (data.fork) {
							currentForkOwner = args.owner;
						}

						return {
							exists: true,
							forkUrl: data.html_url ?? `https://github.com/${forkFullName}`,
						};
					} catch (error: unknown) {
						const err = error as { stderr?: string; message?: string };
						const stderr = err.stderr ?? err.message ?? String(error);

						if (stderr.includes("Not Found") || stderr.includes("404")) {
							console.log("[GitHubSubmission] check_fork_exists: fork not found", { forkFullName });
							return {
								exists: false,
								forkUrl: null as string | null,
							};
						}

						throw new Error(
							`Failed to check fork ${forkFullName}: ${stderr}`
						);
					}
				},
			}),

			// Tool: Create fork
			defineTool("create_fork", {
				description: "Create a fork of a GitHub repository",
				parameters: z.object({
					owner: z.string().describe("Repository owner"),
					repo: z.string().describe("Repository name"),
				}),
				handler: async (args: { owner: string; repo: string }) => {
					const upstreamFullName = `${args.owner}/${args.repo}`;

					try {
						console.log("[GitHubSubmission] create_fork: start", { upstreamFullName });
						// Fork the upstream repository into the authenticated user's account.
						// We intentionally avoid cloning or adding remotes here; those are handled
						// by subsequent tools.
						await runGh([
							"repo",
							"fork",
							upstreamFullName,
							"--remote=false",
							"--clone=false",
						]);

						const owner = currentForkOwner || authenticatedUsername;
						if (owner) {
							currentForkOwner = owner;
						}

						const effectiveOwner = currentForkOwner || upstreamOwner;
						return {
							success: true,
							forkUrl: `https://github.com/${effectiveOwner}/${args.repo}`,
						};
					} catch (error: unknown) {
						const err = error as { stderr?: string; message?: string };
						const stderr = err.stderr ?? err.message ?? String(error);

						// If the fork already exists, treat this as success
						if (
							stderr.includes("already exists") ||
							stderr.includes("A repository with the same name already exists")
						) {
							const owner = currentForkOwner || authenticatedUsername || upstreamOwner;
							return {
								success: true,
								forkUrl: `https://github.com/${owner}/${args.repo}`,
							};
						}

						throw new Error(
							`Failed to create fork for ${upstreamFullName}: ${stderr}`
						);
					}
				},
			}),

			// Tool: Create branch
			defineTool("create_branch", {
				description: "Create a new branch in the repository",
				parameters: z.object({
					branchName: z.string().describe("Name of the new branch"),
					baseBranch: z.string().describe("Base branch to branch from"),
				}),
				handler: async (args: { branchName: string; baseBranch: string }) => {
					const repoPath = await ensureLocalRepo();
					console.log("[GitHubSubmission] create_branch: start", {
						repoPath,
						branchName: args.branchName,
						baseBranch: args.baseBranch,
					});

					// Fetch latest from origin and create/reset the branch from the specified base
					await runGit(["fetch", "origin", args.baseBranch], repoPath);
					await runGit(
						["checkout", "-B", args.branchName, `origin/${args.baseBranch}`],
						repoPath
					);

					return {
						success: true,
						branchName: args.branchName,
					};
				},
			}),

			// Tool: Copy files
			defineTool("copy_files", {
				description: "Copy files from source to destination in the repository",
				parameters: z.object({
					sourcePath: z.string().describe("Source directory path"),
					targetPath: z.string().describe("Target directory path in repo"),
				}),
				handler: async (args: { sourcePath: string; targetPath: string }) => {
					const repoPath = await ensureLocalRepo();
					const absoluteTargetPath = path.isAbsolute(args.targetPath)
						? args.targetPath
						: path.join(repoPath, args.targetPath);

					console.log("[GitHubSubmission] copy_files: start", {
						sourcePath: args.sourcePath,
						targetPath: absoluteTargetPath,
					});
					const filesCopied = copyDirectoryRecursive(
						args.sourcePath,
						absoluteTargetPath
					);

					return {
						success: true,
						filesCopied,
					};
				},
			}),

			// Tool: Commit changes
			defineTool("commit_changes", {
				description: "Commit changes to the repository",
				parameters: z.object({
					message: z.string().describe("Commit message"),
				}),
				handler: async (args: { message: string }) => {
					const repoPath = await ensureLocalRepo();
					console.log("[GitHubSubmission] commit_changes: start", { message: args.message, repoPath });

					// Stage all changes
					await runGit(["add", "."], repoPath);

					// Commit changes; allow failure so we can handle "nothing to commit"
					const { stdout, stderr } = await runGit(
						["commit", "-m", args.message],
						repoPath,
						true
					);

					const combinedOutput = `${stdout}\n${stderr}`;
					if (/nothing to commit/i.test(combinedOutput)) {
						return {
							success: true,
							commitSha: null,
						};
					}

					// Attempt to extract the commit SHA from the output
					const shaMatch = combinedOutput.match(/[0-9a-f]{7,40}/i);
					const commitSha = shaMatch ? shaMatch[0] : null;

					return {
						success: true,
						commitSha,
					};
				},
			}),

			// Tool: Push branch
			defineTool("push_branch", {
				description: "Push a branch to the remote repository",
				parameters: z.object({
					branchName: z.string().describe("Branch name to push"),
				}),
				handler: async (args: { branchName: string }) => {
					const repoPath = await ensureLocalRepo();
					console.log("[GitHubSubmission] push_branch: start", { repoPath, branchName: args.branchName });
					await runGit(
						["push", "-u", "origin", args.branchName],
						repoPath
					);

					return {
						success: true,
						branchName: args.branchName,
					};
				},
			}),

			// Tool: Create pull request
			defineTool("create_pull_request", {
				description: "Create a pull request on GitHub",
				parameters: z.object({
					title: z.string().describe("PR title"),
					body: z.string().describe("PR description"),
					head: z.string().describe("Head branch (fork:branch)"),
					base: z.string().describe("Base branch to merge into"),
					repo: z.string().describe("Repository (owner/repo)"),
				}),
				handler: async (args: { 
					title: string; 
					body: string; 
					head: string; 
					base: string; 
					repo: string;
				}) => {
					// Always target the configured upstream repository to ensure submissions
					// go to danielshue/obsidian-vault-copilot (or the configured upstream).
					const repoFullName = `${upstreamOwner}/${upstreamRepo}`;
					const repoPath = await ensureLocalRepo();
					console.log("[GitHubSubmission] create_pull_request: start", {
						repoFullName,
						repoPath,
						base: args.base,
						head: args.head,
					});

					// Write the PR body to a temporary file to avoid shell escaping issues.
					const bodyFilePath = path.join(repoPath, ".gh-pr-body.md");
					fs.writeFileSync(bodyFilePath, args.body, "utf-8");

					const { stdout } = await runGh(
						[
							"pr",
							"create",
							"--repo",
							repoFullName,
							"--title",
							args.title,
							"--base",
							args.base || targetBranch,
							"--head",
							args.head,
							"--body-file",
							bodyFilePath,
							"--json",
							"number,url",
						],
						repoPath
					);

					try {
						const data = JSON.parse(stdout) as {
							number?: number;
							url?: string;
						};

						return {
							success: true,
							pullRequestUrl: data.url,
							pullRequestNumber: data.number,
						};
					} catch (error) {
						throw new Error(
							`Failed to create pull request for ${repoFullName}: ${
								error instanceof Error ? error.message : String(error)
							}`
						);
					}
				},
			}),
		];
	}
}
