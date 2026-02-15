/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ElectronPreload
 * @description Preload script that exposes safe Node.js APIs to the renderer
 * via contextBridge. The renderer accesses these through window.electronAPI.
 *
 * @since 0.0.27
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	/** @returns {boolean} Always true in Electron */
	isElectron: true,

	/**
	 * Execute a shell command.
	 * @param {string} command - The command to execute
	 * @param {object} [options] - Options (timeout, cwd, env)
	 * @returns {Promise<{stdout: string, stderr: string, exitCode: number, error: string|null}>}
	 */
	exec: (command, options) => ipcRenderer.invoke("shell:exec", command, options),

	/**
	 * Spawn a long-running process.
	 * @param {string} command - The command to spawn
	 * @param {string[]} [args] - Arguments
	 * @param {object} [options] - Options (cwd, env)
	 * @returns {Promise<{id: number, pid: number}>}
	 */
	spawn: (command, args, options) => ipcRenderer.invoke("shell:spawn", command, args, options),

	/**
	 * Write to a spawned process's stdin.
	 * @param {number} id - Process ID from spawn()
	 * @param {string} data - Data to write
	 * @returns {Promise<boolean>}
	 */
	stdin: (id, data) => ipcRenderer.invoke("shell:stdin", id, data),

	/**
	 * Kill a spawned process.
	 * @param {number} id - Process ID from spawn()
	 * @returns {Promise<boolean>}
	 */
	kill: (id) => ipcRenderer.invoke("shell:kill", id),

	/**
	 * Listen for stdout from a spawned process.
	 * @param {number} id - Process ID
	 * @param {function} callback - Called with each chunk of stdout data
	 * @returns {function} Unsubscribe function
	 */
	onStdout: (id, callback) => {
		const channel = `process:stdout:${id}`;
		const handler = (_event, data) => callback(data);
		ipcRenderer.on(channel, handler);
		return () => ipcRenderer.removeListener(channel, handler);
	},

	/**
	 * Listen for stderr from a spawned process.
	 * @param {number} id - Process ID
	 * @param {function} callback - Called with each chunk of stderr data
	 * @returns {function} Unsubscribe function
	 */
	onStderr: (id, callback) => {
		const channel = `process:stderr:${id}`;
		const handler = (_event, data) => callback(data);
		ipcRenderer.on(channel, handler);
		return () => ipcRenderer.removeListener(channel, handler);
	},

	/**
	 * Listen for process close.
	 * @param {number} id - Process ID
	 * @param {function} callback - Called with exit code
	 * @returns {function} Unsubscribe function
	 */
	onClose: (id, callback) => {
		const channel = `process:close:${id}`;
		const handler = (_event, code) => callback(code);
		ipcRenderer.on(channel, handler);
		return () => ipcRenderer.removeListener(channel, handler);
	},

	/**
	 * Listen for process error.
	 * @param {number} id - Process ID
	 * @param {function} callback - Called with error message
	 * @returns {function} Unsubscribe function
	 */
	onError: (id, callback) => {
		const channel = `process:error:${id}`;
		const handler = (_event, msg) => callback(msg);
		ipcRenderer.on(channel, handler);
		return () => ipcRenderer.removeListener(channel, handler);
	},

	/**
	 * Read a file.
	 * @param {string} filePath - Absolute file path
	 * @param {string} [encoding] - Encoding (default: utf-8)
	 * @returns {Promise<string>}
	 */
	readFile: (filePath, encoding) => ipcRenderer.invoke("fs:readFile", filePath, encoding),

	/**
	 * Write a file.
	 * @param {string} filePath - Absolute file path
	 * @param {string} content - File content
	 * @returns {Promise<void>}
	 */
	writeFile: (filePath, content) => ipcRenderer.invoke("fs:writeFile", filePath, content),

	/**
	 * Check if a file exists.
	 * @param {string} filePath - Absolute file path
	 * @returns {Promise<boolean>}
	 */
	exists: (filePath) => ipcRenderer.invoke("fs:exists", filePath),

	/**
	 * Get platform information.
	 * @returns {Promise<{platform: string, arch: string, nodeVersion: string, electronVersion: string, isPackaged: boolean, appPath: string, userData: string}>}
	 */
	getPlatformInfo: () => ipcRenderer.invoke("platform:info"),

	/**
	 * Open native folder picker dialog.
	 * @returns {Promise<string|null>} Selected directory path, or null if cancelled
	 */
	openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),

	/**
	 * List all files recursively in a directory.
	 * @param {string} dirPath - Absolute directory path
	 * @returns {Promise<string[]>} Array of relative file paths
	 */
	listFilesRecursive: (dirPath) => ipcRenderer.invoke("fs:listFilesRecursive", dirPath),

	/**
	 * List entries in a directory (non-recursive).
	 * @param {string} dirPath - Absolute directory path
	 * @returns {Promise<Array<{name: string, kind: 'file'|'directory'}>>}
	 */
	readdir: (dirPath) => ipcRenderer.invoke("fs:readdir", dirPath),

	/**
	 * Remove a file or directory.
	 * @param {string} filePath - Absolute path
	 * @param {object} [options] - { recursive: boolean }
	 */
	remove: (filePath, options) => ipcRenderer.invoke("fs:remove", filePath, options),

	/**
	 * Create a directory recursively.
	 * @param {string} dirPath - Absolute directory path
	 */
	mkdir: (dirPath) => ipcRenderer.invoke("fs:mkdir", dirPath),

	/**
	 * Set the window frame style (hidden or native). Takes effect on next restart.
	 * @param {string} style - "hidden" or "native"
	 */
	setWindowFrame: (style) => ipcRenderer.invoke("settings:setWindowFrame", style),

	/**
	 * Get the current window frame style.
	 * @returns {Promise<string>} "hidden" or "native"
	 */
	getWindowFrame: () => ipcRenderer.invoke("settings:getWindowFrame"),

	/**
	 * Update the titlebar overlay colors to match the current theme.
	 * @param {{ color: string, symbolColor: string }} colors
	 */
	setTitleBarOverlay: (colors) => ipcRenderer.invoke("settings:setTitleBarOverlay", colors),

	// ---- Secrets (Keychain) ----

	/**
	 * Check if encrypted secret storage is available.
	 * @returns {Promise<boolean>}
	 */
	isSecretStorageAvailable: () => ipcRenderer.invoke("secrets:isAvailable"),

	/**
	 * Save an encrypted secret.
	 * @param {string} id - Secret identifier
	 * @param {string} plainText - Secret value
	 * @returns {Promise<void>}
	 */
	saveSecret: (id, plainText) => ipcRenderer.invoke("secrets:save", id, plainText),

	/**
	 * Load and decrypt a secret.
	 * @param {string} id - Secret identifier
	 * @returns {Promise<string|null>}
	 */
	loadSecret: (id) => ipcRenderer.invoke("secrets:load", id),

	/**
	 * Delete a secret.
	 * @param {string} id - Secret identifier
	 * @returns {Promise<void>}
	 */
	deleteSecret: (id) => ipcRenderer.invoke("secrets:delete", id),

	/**
	 * List all secret IDs with metadata (no values).
	 * @returns {Promise<Array<{id: string, lastAccessed: number|null, createdAt: number, updatedAt: number}>>}
	 */
	listSecrets: () => ipcRenderer.invoke("secrets:list"),

	// ---- Pop-out Windows ----

	/**
	 * Open a view in a separate pop-out window.
	 * @param {string} viewType - The view type identifier (e.g., 'vc-tracing-view')
	 * @param {object} [options] - Optional window size/title overrides
	 * @returns {Promise<{windowId: number}>}
	 */
	openWindow: (viewType, options) => ipcRenderer.invoke("window:open", viewType, options),
});
