/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ElectronAPITypes
 * @description TypeScript declarations for the Electron API exposed via preload.
 *
 * These are available in the renderer process via `window.electronAPI`.
 *
 * @since 0.0.27
 */

interface ElectronExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	error: string | null;
}

interface ElectronSpawnResult {
	id: number;
	pid: number;
}

interface ElectronPlatformInfo {
	platform: string;
	arch: string;
	nodeVersion: string;
	electronVersion: string;
	isPackaged: boolean;
	appPath: string;
	userData: string;
}

interface ElectronAPI {
	isElectron: true;
	exec(command: string, options?: { timeout?: number; cwd?: string; env?: Record<string, string> }): Promise<ElectronExecResult>;
	spawn(command: string, args?: string[], options?: { cwd?: string; env?: Record<string, string> }): Promise<ElectronSpawnResult>;
	stdin(id: number, data: string): Promise<boolean>;
	kill(id: number): Promise<boolean>;
	onStdout(id: number, callback: (data: string) => void): () => void;
	onStderr(id: number, callback: (data: string) => void): () => void;
	onClose(id: number, callback: (code: number) => void): () => void;
	onError(id: number, callback: (message: string) => void): () => void;
	readFile(filePath: string, encoding?: string): Promise<string>;
	writeFile(filePath: string, content: string): Promise<void>;
	exists(filePath: string): Promise<boolean>;
	getPlatformInfo(): Promise<ElectronPlatformInfo>;
	openDirectory(): Promise<string | null>;
	listFilesRecursive(dirPath: string): Promise<string[]>;
	readdir(dirPath: string): Promise<Array<{ name: string; kind: "file" | "directory" }>>;
	remove(filePath: string, options?: { recursive?: boolean }): Promise<void>;
	mkdir(dirPath: string): Promise<void>;
	setWindowFrame(style: "hidden" | "native"): Promise<void>;
	getWindowFrame(): Promise<"hidden" | "native">;
	setTitleBarOverlay(colors: { color: string; symbolColor: string }): Promise<void>;
	isSecretStorageAvailable(): Promise<boolean>;
	saveSecret(id: string, plainText: string): Promise<void>;
	loadSecret(id: string): Promise<string | null>;
	deleteSecret(id: string): Promise<void>;
	listSecrets(): Promise<Array<{ id: string; lastAccessed: number | null; createdAt: number; updatedAt: number }>>;
	openWindow(viewType: string, options?: { width?: number; height?: number; title?: string }): Promise<{ windowId: number }>;
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
	}
}

export { ElectronAPI, ElectronExecResult, ElectronSpawnResult, ElectronPlatformInfo };
