/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ElectronMain
 * @description Electron main process for Vault Copilot standalone app.
 *
 * Creates the browser window, loads the Vite dev server (in dev) or
 * the built files (in production), and exposes Node.js APIs via IPC
 * for child_process, fs, and other system operations.
 *
 * @since 0.0.27
 */

const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog, safeStorage } = require("electron");
const path = require("path");
const { exec, spawn } = require("child_process");
const fs = require("fs");

/** @type {BrowserWindow | null} */
let mainWindow = null;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

if (isDev) {
	app.commandLine.appendSwitch("disable-http-cache");
}

/** Path to the window config file (persists frame style across restarts). */
const configPath = path.join(app.getPath("userData"), "window-config.json");

/** Read the persisted window config. */
function readWindowConfig() {
	try {
		if (fs.existsSync(configPath)) {
			return JSON.parse(fs.readFileSync(configPath, "utf-8"));
		}
	} catch { /* ignore */ }
	return {};
}

/** Write window config to disk. */
function writeWindowConfig(config) {
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
	} catch { /* ignore */ }
}

async function createWindow() {
	// Remove default menu bar
	Menu.setApplicationMenu(null);

	const config = readWindowConfig();
	const isFrameHidden = config.windowFrameStyle !== "native";

	const windowOptions = {
		width: 1400,
		height: 900,
		minWidth: 800,
		minHeight: 600,
		title: "Vault Copilot",
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	};

	if (isFrameHidden) {
		windowOptions.frame = false;
		windowOptions.titleBarStyle = "hidden";
		if (process.platform === "win32") {
			windowOptions.titleBarOverlay = {
				color: "#f6f6f6",
				symbolColor: "#2e3338",
				height: 36,
			};
		}
	}

	mainWindow = new BrowserWindow(windowOptions);

	if (isDev) {
		// In dev mode, load from Vite dev server
		const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
		try {
			await mainWindow.webContents.session.clearCache();
			await mainWindow.webContents.session.clearStorageData({
				storages: ["serviceworkers", "cachestorage"],
			});
		} catch {
			// Best-effort cache reset in dev mode
		}
		mainWindow.loadURL(devUrl);
		mainWindow.webContents.openDevTools();

		// Dev shortcuts: F5 = reload, Ctrl+Shift+I = toggle DevTools
		mainWindow.webContents.on("before-input-event", (_e, input) => {
			if (input.key === "F5" && input.type === "keyDown") {
				mainWindow.webContents.reload();
			}
			if (input.key === "I" && input.control && input.shift && input.type === "keyDown") {
				mainWindow.webContents.toggleDevTools();
			}
		});
	} else {
		// In production, load the built files
		mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

// ============================================================================
// IPC Handlers — expose Node.js capabilities to the renderer
// ============================================================================

/**
 * Execute a command and return { stdout, stderr, exitCode }.
 * Used by GitHubCopilotCliManager for CLI status checks.
 */
ipcMain.handle("shell:exec", async (_event, command, options = {}) => {
	return new Promise((resolve) => {
		const safeOptions = {
			timeout: options.timeout || 30000,
			maxBuffer: options.maxBuffer || 1024 * 1024,
			cwd: options.cwd || undefined,
			env: { ...process.env, ...(options.env || {}) },
		};
		exec(command, safeOptions, (error, stdout, stderr) => {
			resolve({
				stdout: stdout || "",
				stderr: stderr || "",
				exitCode: error ? error.code || 1 : 0,
				error: error ? error.message : null,
			});
		});
	});
});

/**
 * Spawn a long-running process (for MCP stdio servers).
 * Returns a process ID that can be used to send input and kill the process.
 */
const activeProcesses = new Map();
let nextProcessId = 1;

ipcMain.handle("shell:spawn", async (_event, command, args = [], options = {}) => {
	const id = nextProcessId++;
	const safeOptions = {
		cwd: options.cwd || undefined,
		env: { ...process.env, ...(options.env || {}) },
		stdio: ["pipe", "pipe", "pipe"],
	};

	const child = spawn(command, args, safeOptions);
	activeProcesses.set(id, child);

	child.stdout.on("data", (data) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(`process:stdout:${id}`, data.toString());
		}
	});

	child.stderr.on("data", (data) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(`process:stderr:${id}`, data.toString());
		}
	});

	child.on("close", (code) => {
		activeProcesses.delete(id);
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(`process:close:${id}`, code);
		}
	});

	child.on("error", (err) => {
		activeProcesses.delete(id);
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(`process:error:${id}`, err.message);
		}
	});

	return { id, pid: child.pid };
});

/**
 * Send data to a spawned process's stdin.
 */
ipcMain.handle("shell:stdin", async (_event, id, data) => {
	const child = activeProcesses.get(id);
	if (child && child.stdin && !child.stdin.destroyed) {
		child.stdin.write(data);
		return true;
	}
	return false;
});

/**
 * Kill a spawned process.
 */
ipcMain.handle("shell:kill", async (_event, id) => {
	const child = activeProcesses.get(id);
	if (child) {
		child.kill();
		activeProcesses.delete(id);
		return true;
	}
	return false;
});

/**
 * Read a file from the filesystem.
 */
ipcMain.handle("fs:readFile", async (_event, filePath, encoding = "utf-8") => {
	return fs.promises.readFile(filePath, encoding);
});

/**
 * Write a file to the filesystem.
 */
ipcMain.handle("fs:writeFile", async (_event, filePath, content) => {
	return fs.promises.writeFile(filePath, content, "utf-8");
});

/**
 * Check if a file or directory exists.
 */
ipcMain.handle("fs:exists", async (_event, filePath) => {
	try {
		await fs.promises.access(filePath);
		return true;
	} catch {
		return false;
	}
});

/**
 * Open a native folder picker dialog.
 * Returns the selected directory path, or null if cancelled.
 */
ipcMain.handle("dialog:openDirectory", async () => {
	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ["openDirectory"],
		title: "Select Vault Folder",
	});
	if (result.canceled || result.filePaths.length === 0) return null;
	return result.filePaths[0];
});

/**
 * List files recursively in a directory.
 * Returns an array of relative paths.
 */
ipcMain.handle("fs:listFilesRecursive", async (_event, dirPath) => {
	const results = [];
	async function walk(dir, prefix) {
		const entries = await fs.promises.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const rel = prefix ? prefix + "/" + entry.name : entry.name;
			if (entry.isDirectory()) {
				await walk(path.join(dir, entry.name), rel);
			} else {
				results.push(rel);
			}
		}
	}
	await walk(dirPath, "");
	return results;
});

/**
 * List entries in a directory (non-recursive).
 * Returns [{name, kind}] where kind is "file" or "directory".
 */
ipcMain.handle("fs:readdir", async (_event, dirPath) => {
	const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
	return entries.map((e) => ({
		name: e.name,
		kind: e.isDirectory() ? "directory" : "file",
	}));
});

/**
 * Remove a file or directory.
 */
ipcMain.handle("fs:remove", async (_event, filePath, options = {}) => {
	await fs.promises.rm(filePath, { recursive: !!options.recursive, force: true });
});

/**
 * Create a directory recursively.
 */
ipcMain.handle("fs:mkdir", async (_event, dirPath) => {
	await fs.promises.mkdir(dirPath, { recursive: true });
});

/**
 * Get platform info.
 */
ipcMain.handle("settings:setWindowFrame", async (_event, style) => {
	const config = readWindowConfig();
	config.windowFrameStyle = style;
	writeWindowConfig(config);
});

ipcMain.handle("settings:getWindowFrame", async () => {
	const config = readWindowConfig();
	return config.windowFrameStyle || "hidden";
});

/**
 * Update the titlebar overlay colors dynamically to match the app theme.
 * Only works on Windows with a frameless window.
 */
ipcMain.handle("settings:setTitleBarOverlay", async (event, colors) => {
	const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
	if (targetWindow && !targetWindow.isDestroyed() && process.platform === "win32") {
		try {
			targetWindow.setTitleBarOverlay({
				color: colors.color,
				symbolColor: colors.symbolColor,
				height: 36,
			});
		} catch { /* ignore if not supported */ }
	}
});

/**
 * Request docking a detached file tab back into the main window.
 * Sends the file path to main renderer and closes the child window.
 */
ipcMain.handle("window:dockTab", async (event, filePath) => {
	if (mainWindow && !mainWindow.isDestroyed()) {
		const dispatchDock = () => {
			if (!mainWindow || mainWindow.isDestroyed()) return;
			mainWindow.webContents.send("window:dockTab", filePath);
		};

		if (mainWindow.webContents.isLoadingMainFrame()) {
			mainWindow.webContents.once("did-finish-load", dispatchDock);
		} else {
			dispatchDock();
		}

		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	}
	const senderWindow = BrowserWindow.fromWebContents(event.sender);
	if (senderWindow && senderWindow !== mainWindow && !senderWindow.isDestroyed()) {
		senderWindow.close();
	}
	return { ok: true };
});

ipcMain.handle("platform:info", async () => {
	return {
		platform: process.platform,
		arch: process.arch,
		nodeVersion: process.version,
		electronVersion: process.versions.electron,
		isPackaged: app.isPackaged,
		appPath: app.getAppPath(),
		userData: app.getPath("userData"),
	};
});

// ============================================================================
// Secrets (Keychain) — encrypted storage via Electron safeStorage
// ============================================================================

/** Path to the encrypted secrets file. */
const secretsPath = path.join(app.getPath("userData"), "vault-copilot-secrets.json");

/** Read the secrets file from disk. */
function readSecretsFile() {
	try {
		if (fs.existsSync(secretsPath)) {
			return JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
		}
	} catch { /* ignore */ }
	return { secrets: {} };
}

/** Write the secrets file to disk. */
function writeSecretsFile(data) {
	try {
		fs.writeFileSync(secretsPath, JSON.stringify(data, null, 2), "utf-8");
	} catch { /* ignore */ }
}

/**
 * Check if encryption is available.
 */
ipcMain.handle("secrets:isAvailable", async () => {
	return safeStorage.isEncryptionAvailable();
});

/**
 * Save an encrypted secret.
 */
ipcMain.handle("secrets:save", async (_event, id, plainText) => {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error("Encryption not available");
	}
	const data = readSecretsFile();
	const encrypted = safeStorage.encryptString(plainText);
	data.secrets[id] = {
		encrypted: encrypted.toString("base64"),
		lastAccessed: null,
		createdAt: data.secrets[id]?.createdAt || Date.now(),
		updatedAt: Date.now(),
	};
	writeSecretsFile(data);
});

/**
 * Load and decrypt a secret.
 */
ipcMain.handle("secrets:load", async (_event, id) => {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error("Encryption not available");
	}
	const data = readSecretsFile();
	const entry = data.secrets[id];
	if (!entry) return null;

	// Update lastAccessed timestamp
	entry.lastAccessed = Date.now();
	writeSecretsFile(data);

	const buffer = Buffer.from(entry.encrypted, "base64");
	return safeStorage.decryptString(buffer);
});

/**
 * Delete a secret.
 */
ipcMain.handle("secrets:delete", async (_event, id) => {
	const data = readSecretsFile();
	delete data.secrets[id];
	writeSecretsFile(data);
});

/**
 * List all secret IDs with metadata (no values).
 */
ipcMain.handle("secrets:list", async () => {
	const data = readSecretsFile();
	return Object.entries(data.secrets).map(([id, entry]) => ({
		id,
		lastAccessed: entry.lastAccessed,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
	}));
});

// ============================================================================
// Pop-out Windows — open views in separate BrowserWindows
// ============================================================================

/** @type {Map<number, BrowserWindow>} */
const childWindows = new Map();
let nextChildId = 1;

/**
 * Open a view in a new child BrowserWindow.
 * The child loads the same app URL with a `?view=<viewType>` query parameter
 * so the renderer can detect it and render only that view's panel.
 *
 * @param {string} viewType - The view type identifier (e.g., 'vc-tracing-view')
 * @param {object} [options] - Optional window size overrides
 * @returns {{ windowId: number }}
 */
ipcMain.handle("window:open", async (_event, viewType, options = {}) => {
	const config = readWindowConfig();
	const isFrameHidden = config.windowFrameStyle !== "native";

	const childOptions = {
		width: options.width || 900,
		height: options.height || 650,
		minWidth: 500,
		minHeight: 400,
		title: options.title || "Vault Copilot",
		parent: mainWindow,
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	};

	if (isFrameHidden) {
		childOptions.frame = false;
		childOptions.titleBarStyle = "hidden";
		if (process.platform === "win32") {
			childOptions.titleBarOverlay = {
				color: "#f6f6f6",
				symbolColor: "#2e3338",
				height: 36,
			};
		}
	}

	const childWindow = new BrowserWindow(childOptions);
	const childId = nextChildId++;
	childWindows.set(childId, childWindow);

	// Remove menu bar from child window
	childWindow.setMenu(null);

	const query = { ...(options.query || {}) };
	if (viewType && viewType !== "main") {
		query.view = viewType;
	}

	if (isDev) {
		const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
		const search = new URLSearchParams(query).toString();
		childWindow.loadURL(search ? `${devUrl}?${search}` : devUrl);
	} else {
		// For production, load index.html with query param
		const indexPath = path.join(__dirname, "../dist/index.html");
		childWindow.loadFile(indexPath, { query });
	}

	childWindow.on("closed", () => {
		childWindows.delete(childId);
	});

	return { windowId: childId };
});

// Clean up spawned processes and child windows on exit
app.on("before-quit", () => {
	for (const [, child] of activeProcesses) {
		child.kill();
	}
	activeProcesses.clear();

	for (const [, win] of childWindows) {
		if (!win.isDestroyed()) win.close();
	}
	childWindows.clear();
});
