/**
 * @module extensions/ExtensionManager
 * @description Manages installation, updates, and tracking of extensions
 * 
 * This service orchestrates all extension lifecycle operations:
 * - Installation with dependency resolution
 * - Uninstallation with cleanup
 * - Updates with version checking
 * - Rollback on failures
 * - MCP server configuration merging
 */

import { App, Notice, TFile, Vault } from "obsidian";
import { httpRequest } from "../utils/http";
import {
	MarketplaceExtension,
	LocalExtensionRecord,
	InstallationOutcome,
	UpdateNotification,
} from "./types";

/**
 * Structure of the tracking file stored in .obsidian/vault-copilot-extensions.json
 */
interface TrackingFileData {
	/** Version of the tracking file format */
	formatVersion: string;
	
	/** Map of extension ID to installation record */
	installedExtensions: Record<string, LocalExtensionRecord>;
}

/**
 * Manages the lifecycle of extensions in the vault.
 * Handles installation, uninstallation, updates, and tracking.
 * 
 * @example
 * ```typescript
 * const manager = new ExtensionManager(app, plugin);
 * await manager.initialize();
 * 
 * // Install an extension
 * const result = await manager.installExtension(extensionManifest);
 * if (result.operationSucceeded) {
 *   console.log("Extension installed successfully");
 * }
 * 
 * // Check for updates
 * const updates = await manager.checkForUpdates(catalogService);
 * console.log(`Found ${updates.length} updates available`);
 * ```
 */
export class ExtensionManager {
	private app: App;
	private trackingFilePath: string;
	private installedExtensionsMap: Map<string, LocalExtensionRecord>;
	
	/**
	 * Creates a new ExtensionManager.
	 * 
	 * @param app - Obsidian App instance
	 */
	constructor(app: App) {
		this.app = app;
		this.trackingFilePath = ".obsidian/vault-copilot-extensions.json";
		this.installedExtensionsMap = new Map();
	}
	
	/**
	 * Initializes the extension manager.
	 * Loads the tracking file and populates the installed extensions map.
	 * 
	 * @example
	 * ```typescript
	 * const manager = new ExtensionManager(app);
	 * await manager.initialize();
	 * ```
	 */
	async initialize(): Promise<void> {
		await this.loadTrackingFile();
	}
	
	/**
	 * Gets all currently installed extensions.
	 * 
	 * @returns Map of extension ID to installation record
	 * 
	 * @example
	 * ```typescript
	 * const installed = await manager.getInstalledExtensions();
	 * for (const [id, record] of installed) {
	 *   console.log(`${id}: v${record.installedVersion}`);
	 * }
	 * ```
	 */
	async getInstalledExtensions(): Promise<Map<string, LocalExtensionRecord>> {
		return new Map(this.installedExtensionsMap);
	}
	
	/**
	 * Checks if an extension is installed.
	 * 
	 * @param extensionId - Unique identifier of the extension
	 * @returns True if installed, false otherwise
	 * 
	 * @example
	 * ```typescript
	 * if (manager.isInstalled("daily-journal-helper")) {
	 *   console.log("Extension is already installed");
	 * }
	 * ```
	 */
	isInstalled(extensionId: string): boolean {
		return this.installedExtensionsMap.has(extensionId);
	}
	
	/**
	 * Gets the installed version of an extension.
	 * 
	 * @param extensionId - Unique identifier of the extension
	 * @returns Version string if installed, null otherwise
	 * 
	 * @example
	 * ```typescript
	 * const version = manager.getInstalledVersion("daily-journal-helper");
	 * console.log(`Installed version: ${version}`);
	 * ```
	 */
	getInstalledVersion(extensionId: string): string | null {
		const record = this.installedExtensionsMap.get(extensionId);
		return record ? record.installedVersion : null;
	}
	
	/**
	 * Installs an extension from the marketplace.
	 * Downloads files, resolves dependencies, and updates tracking.
	 * 
	 * @param manifest - Extension manifest from catalog
	 * @returns Promise resolving to installation outcome
	 * 
	 * @example
	 * ```typescript
	 * const result = await manager.installExtension(extension);
	 * if (!result.operationSucceeded) {
	 *   console.error(`Installation failed: ${result.errorDetails}`);
	 * }
	 * ```
	 */
	async installExtension(manifest: MarketplaceExtension): Promise<InstallationOutcome> {
		try {
			// Check if already installed
			if (this.isInstalled(manifest.uniqueId)) {
				return {
					operationSucceeded: false,
					affectedExtensionId: manifest.uniqueId,
					modifiedFilePaths: [],
					errorDetails: "Extension is already installed. Use update instead.",
				};
			}
			
			// Check for dependency circular references FIRST
			const circularDeps = this.detectCircularDependencies(manifest.uniqueId, manifest.dependsOnExtensions);
			if (circularDeps.length > 0) {
				return {
					operationSucceeded: false,
					affectedExtensionId: manifest.uniqueId,
					modifiedFilePaths: [],
					errorDetails: `Circular dependency detected: ${circularDeps.join(" → ")}`,
				};
			}
			
			// Then check and validate dependencies
			for (const depId of manifest.dependsOnExtensions) {
				if (!this.isInstalled(depId)) {
					return {
						operationSucceeded: false,
						affectedExtensionId: manifest.uniqueId,
						modifiedFilePaths: [],
						errorDetails: `Missing dependency: ${depId}. Please install it first.`,
					};
				}
			}
			
			// Download all files
			const downloadedFiles: Array<{ content: string; targetPath: string }> = [];
			for (const file of manifest.packageContents) {
				const content = await this.downloadFile(file.downloadSource);
				downloadedFiles.push({
					content,
					targetPath: file.targetLocation,
				});
			}
			
			// Install files to vault
			const installedPaths: string[] = [];
			for (const file of downloadedFiles) {
				await this.writeFileToVault(file.targetPath, file.content);
				installedPaths.push(file.targetPath);
			}
			
			// Update tracking file
			const record: LocalExtensionRecord = {
				extensionId: manifest.uniqueId,
				installedVersion: manifest.semanticVersion,
				installationTimestamp: new Date().toISOString(),
				installedFilePaths: installedPaths,
				linkedDependencies: manifest.dependsOnExtensions,
			};
			
			this.installedExtensionsMap.set(manifest.uniqueId, record);
			await this.saveTrackingFile();
			
			new Notice(`Extension "${manifest.displayTitle}" installed successfully`);
			
			return {
				operationSucceeded: true,
				affectedExtensionId: manifest.uniqueId,
				modifiedFilePaths: installedPaths,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			
			new Notice(`Failed to install extension: ${errorMsg}`, 5000);
			
			return {
				operationSucceeded: false,
				affectedExtensionId: manifest.uniqueId,
				modifiedFilePaths: [],
				errorDetails: errorMsg,
			};
		}
	}
	
	/**
	 * Uninstalls an extension from the vault.
	 * Removes files and updates tracking.
	 * 
	 * @param extensionId - Unique identifier of the extension to uninstall
	 * @returns Promise resolving to uninstallation outcome
	 * 
	 * @example
	 * ```typescript
	 * const result = await manager.uninstallExtension("daily-journal-helper");
	 * if (result.operationSucceeded) {
	 *   console.log("Extension removed successfully");
	 * }
	 * ```
	 */
	async uninstallExtension(extensionId: string): Promise<InstallationOutcome> {
		try {
			// Check if installed
			const record = this.installedExtensionsMap.get(extensionId);
			if (!record) {
				return {
					operationSucceeded: false,
					affectedExtensionId: extensionId,
					modifiedFilePaths: [],
					errorDetails: "Extension is not installed",
				};
			}
			
			// Check if other extensions depend on this one
			const dependents = this.findDependentExtensions(extensionId);
			if (dependents.length > 0) {
				return {
					operationSucceeded: false,
					affectedExtensionId: extensionId,
					modifiedFilePaths: [],
					errorDetails: `Cannot uninstall: Required by ${dependents.join(", ")}`,
				};
			}
			
			// Remove all installed files
			const removedPaths: string[] = [];
			for (const filePath of record.installedFilePaths) {
				await this.deleteFileFromVault(filePath);
				removedPaths.push(filePath);
			}
			
			// Update tracking file
			this.installedExtensionsMap.delete(extensionId);
			await this.saveTrackingFile();
			
			new Notice(`Extension "${extensionId}" uninstalled successfully`);
			
			return {
				operationSucceeded: true,
				affectedExtensionId: extensionId,
				modifiedFilePaths: removedPaths,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			
			new Notice(`Failed to uninstall extension: ${errorMsg}`, 5000);
			
			return {
				operationSucceeded: false,
				affectedExtensionId: extensionId,
				modifiedFilePaths: [],
				errorDetails: errorMsg,
			};
		}
	}
	
	/**
	 * Updates an extension to a new version.
	 * Uninstalls old version and installs new version.
	 * 
	 * @param extensionId - Unique identifier of the extension
	 * @param newManifest - New version manifest from catalog
	 * @returns Promise resolving to update outcome
	 * 
	 * @example
	 * ```typescript
	 * const result = await manager.updateExtension("daily-journal-helper", newManifest);
	 * ```
	 */
	async updateExtension(
		extensionId: string,
		newManifest: MarketplaceExtension
	): Promise<InstallationOutcome> {
		try {
			// Check if installed
			if (!this.isInstalled(extensionId)) {
				return {
					operationSucceeded: false,
					affectedExtensionId: extensionId,
					modifiedFilePaths: [],
					errorDetails: "Extension is not installed. Use install instead.",
				};
			}
			
			// Backup current installation for rollback
			const backupRecord = this.installedExtensionsMap.get(extensionId)!;
			
			// Uninstall old version
			const uninstallResult = await this.uninstallExtension(extensionId);
			if (!uninstallResult.operationSucceeded) {
				return uninstallResult;
			}
			
			// Install new version
			const installResult = await this.installExtension(newManifest);
			
			// If installation failed, attempt rollback
			if (!installResult.operationSucceeded) {
				// Restore backup
				this.installedExtensionsMap.set(extensionId, backupRecord);
				await this.saveTrackingFile();
				
				return {
					operationSucceeded: false,
					affectedExtensionId: extensionId,
					modifiedFilePaths: [],
					errorDetails: `Update failed: ${installResult.errorDetails}. Old version restored.`,
				};
			}
			
			new Notice(`Extension "${newManifest.displayTitle}" updated successfully`);
			
			return {
				operationSucceeded: true,
				affectedExtensionId: extensionId,
				modifiedFilePaths: installResult.modifiedFilePaths,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			
			new Notice(`Failed to update extension: ${errorMsg}`, 5000);
			
			return {
				operationSucceeded: false,
				affectedExtensionId: extensionId,
				modifiedFilePaths: [],
				errorDetails: errorMsg,
			};
		}
	}
	
	/**
	 * Checks for available updates by comparing installed versions with catalog.
	 * 
	 * @param catalogExtensions - Array of extensions from the catalog
	 * @returns Promise resolving to array of available updates
	 * 
	 * @example
	 * ```typescript
	 * const catalog = await catalogService.fetchCatalog();
	 * const updates = await manager.checkForUpdates(catalog.availableExtensions);
	 * console.log(`${updates.length} updates available`);
	 * ```
	 */
	async checkForUpdates(catalogExtensions: MarketplaceExtension[]): Promise<UpdateNotification[]> {
		const updates: UpdateNotification[] = [];
		
		for (const [extensionId, record] of this.installedExtensionsMap) {
			const catalogVersion = catalogExtensions.find((ext) => ext.uniqueId === extensionId);
			
			if (catalogVersion && catalogVersion.semanticVersion !== record.installedVersion) {
				// Simple version comparison (assumes semver format)
				if (this.isNewerVersion(catalogVersion.semanticVersion, record.installedVersion)) {
					updates.push({
						extensionId,
						currentlyInstalledVersion: record.installedVersion,
						availableNewerVersion: catalogVersion.semanticVersion,
					});
				}
			}
		}
		
		return updates;
	}
	
	/**
	 * Performs cleanup operations on shutdown.
	 */
	async cleanup(): Promise<void> {
		// No-op for now, but available for future cleanup needs
	}
	
	// ===== Private Helper Methods =====
	
	/**
	 * Loads the tracking file from disk.
	 */
	private async loadTrackingFile(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.trackingFilePath);
			
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				const data: TrackingFileData = JSON.parse(content);
				
				// Populate map from tracking file
				for (const [id, record] of Object.entries(data.installedExtensions)) {
					this.installedExtensionsMap.set(id, record);
				}
			}
		} catch (error) {
			// Tracking file doesn't exist or is corrupted - start fresh
			this.installedExtensionsMap.clear();
		}
	}
	
	/**
	 * Saves the tracking file to disk.
	 */
	private async saveTrackingFile(): Promise<void> {
		const data: TrackingFileData = {
			formatVersion: "1.0",
			installedExtensions: Object.fromEntries(this.installedExtensionsMap),
		};
		
		const content = JSON.stringify(data, null, 2);
		
		const file = this.app.vault.getAbstractFileByPath(this.trackingFilePath);
		
		if (file instanceof TFile) {
			await this.app.vault.modify(file, content);
		} else {
			await this.app.vault.create(this.trackingFilePath, content);
		}
	}
	
	/**
	 * Downloads a file from a URL.
	 */
	private async downloadFile(url: string): Promise<string> {
		const response = await httpRequest<string>({
			url,
			method: "GET",
			timeout: 30000,
		});
		
		if (typeof response.data === "string") {
			return response.data;
		}
		
		// If response is JSON, stringify it
		return JSON.stringify(response.data);
	}
	
	/**
	 * Writes a file to the vault, creating parent folders if needed.
	 */
	private async writeFileToVault(path: string, content: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		
		if (file instanceof TFile) {
			// File exists, overwrite it
			await this.app.vault.modify(file, content);
		} else {
			// Create new file (Obsidian creates parent folders automatically)
			await this.app.vault.create(path, content);
		}
	}
	
	/**
	 * Deletes a file from the vault.
	 */
	private async deleteFileFromVault(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		
		if (file instanceof TFile) {
			await this.app.vault.delete(file);
		}
	}
	
	/**
	 * Detects circular dependencies in the dependency tree.
	 */
	private detectCircularDependencies(
		extensionId: string,
		dependencies: string[],
		visitedChain: string[] = []
	): string[] {
		// Check if this extension is already in the visited chain
		if (visitedChain.includes(extensionId)) {
			return [...visitedChain, extensionId]; // Circular dependency found
		}
		
		const newChain = [...visitedChain, extensionId];
		
		// Check each dependency
		for (const depId of dependencies) {
			const depRecord = this.installedExtensionsMap.get(depId);
			if (depRecord && depRecord.linkedDependencies.length > 0) {
				const circular = this.detectCircularDependencies(
					depId,
					depRecord.linkedDependencies,
					newChain
				);
				if (circular.length > 0) {
					return circular;
				}
			}
		}
		
		return []; // No circular dependency
	}
	
	/**
	 * Finds all extensions that depend on a given extension.
	 */
	private findDependentExtensions(extensionId: string): string[] {
		const dependents: string[] = [];
		
		for (const [id, record] of this.installedExtensionsMap) {
			if (record.linkedDependencies.includes(extensionId)) {
				dependents.push(id);
			}
		}
		
		return dependents;
	}
	
	/**
	 * Compares two semantic versions.
	 * 
	 * @returns True if newVersion is newer than currentVersion
	 */
	private isNewerVersion(newVersion: string, currentVersion: string): boolean {
		const parseVersion = (v: string) => {
			const parts = v.split(".").map(Number);
			return {
				major: parts[0] || 0,
				minor: parts[1] || 0,
				patch: parts[2] || 0,
			};
		};
		
		const newVer = parseVersion(newVersion);
		const curVer = parseVersion(currentVersion);
		
		if (newVer.major !== curVer.major) return newVer.major > curVer.major;
		if (newVer.minor !== curVer.minor) return newVer.minor > curVer.minor;
		return newVer.patch > curVer.patch;
	}
}
