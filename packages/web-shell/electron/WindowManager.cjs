/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module WindowManager
 * @description Manages BrowserWindow lifecycle for Vault Copilot's Electron shell.
 *
 * Responsibilities:
 * - Main window creation with persisted frame-style config
 * - Child (pop-out) windows for detached views
 * - Window configuration persistence (frame style, titlebar overlay)
 * - Tab docking from child windows back to main
 * - Dev-mode shortcuts (F5 reload, Ctrl+Shift+I DevTools)
 *
 * @example
 * ```js
 * const WindowManager = require("./WindowManager.cjs");
 * const wm = new WindowManager();
 * await wm.createMainWindow();
 * ```
 *
 * @see {@link ProcessManager} for child process management
 * @since 0.0.28
 */

const { BrowserWindow, Menu, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

class WindowManager {
	/**
	 * Create a new WindowManager.
	 *
	 * @param {import("electron").App} app - The Electron app instance
	 * @param {boolean} isDev - Whether the app is running in development mode
	 */
	constructor(app, isDev) {
		/** @type {import("electron").App} */
		this._app = app;

		/** @type {boolean} */
		this._isDev = isDev;

		/** @type {BrowserWindow | null} */
		this._mainWindow = null;

		/** @type {Map<number, BrowserWindow>} */
		this._childWindows = new Map();

		/** @type {number} */
		this._nextChildId = 1;

		/** @internal Path to the window config file (persists frame style across restarts). */
		this._configPath = path.join(app.getPath("userData"), "window-config.json");
	}

	// ---- Config Persistence ----

	/**
	 * Read the persisted window config from disk.
	 *
	 * @returns {object} The config object (may be empty)
	 * @internal
	 */
	_readConfig() {
		try {
			if (fs.existsSync(this._configPath)) {
				return JSON.parse(fs.readFileSync(this._configPath, "utf-8"));
			}
		} catch { /* ignore */ }
		return {};
	}

	/**
	 * Write window config to disk.
	 *
	 * @param {object} config - The config object to persist
	 * @internal
	 */
	_writeConfig(config) {
		try {
			fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), "utf-8");
		} catch { /* ignore */ }
	}

	// ---- Main Window ----

	/**
	 * The main BrowserWindow, or null if not yet created.
	 *
	 * @returns {BrowserWindow | null}
	 */
	get mainWindow() {
		return this._mainWindow;
	}

	/**
	 * Create and show the main application window.
	 *
	 * Reads the persisted frame-style config, constructs BrowserWindow options,
	 * loads the Vite dev server (dev) or built index.html (production), and
	 * wires dev-mode keyboard shortcuts.
	 *
	 * @returns {Promise<BrowserWindow>}
	 */
	async createMainWindow() {
		Menu.setApplicationMenu(null);

		const config = this._readConfig();
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

		this._mainWindow = new BrowserWindow(windowOptions);

		if (this._isDev) {
			const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
			try {
				await this._mainWindow.webContents.session.clearCache();
				await this._mainWindow.webContents.session.clearStorageData({
					storages: ["serviceworkers", "cachestorage"],
				});
			} catch {
				// Best-effort cache reset in dev mode
			}
			this._mainWindow.loadURL(devUrl);
			this._mainWindow.webContents.openDevTools();

			// Dev shortcuts: F5 = reload, Ctrl+Shift+I = toggle DevTools
			this._mainWindow.webContents.on("before-input-event", (_e, input) => {
				if (input.key === "F5" && input.type === "keyDown") {
					this._mainWindow.webContents.reload();
				}
				if (input.key === "I" && input.control && input.shift && input.type === "keyDown") {
					this._mainWindow.webContents.toggleDevTools();
				}
			});
		} else {
			this._mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
		}

		this._mainWindow.on("closed", () => {
			this._mainWindow = null;
		});

		return this._mainWindow;
	}

	// ---- Child (Pop-out) Windows ----

	/**
	 * Open a view in a new child BrowserWindow.
	 *
	 * The child loads the same app URL with a `?view=<viewType>` query parameter
	 * so the renderer can detect it and render only that view's panel.
	 *
	 * @param {string} viewType - The view type identifier (e.g., 'vc-tracing-view')
	 * @param {object} [options] - Optional window size/title/query overrides
	 * @returns {{ windowId: number }}
	 */
	openChildWindow(viewType, options = {}) {
		const config = this._readConfig();
		const isFrameHidden = config.windowFrameStyle !== "native";

		const childOptions = {
			width: options.width || 900,
			height: options.height || 650,
			minWidth: 500,
			minHeight: 400,
			title: options.title || "Vault Copilot",
			parent: this._mainWindow,
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
		const childId = this._nextChildId++;
		this._childWindows.set(childId, childWindow);

		childWindow.setMenu(null);

		const query = { ...(options.query || {}) };
		if (viewType && viewType !== "main") {
			query.view = viewType;
		}

		if (this._isDev) {
			const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
			const search = new URLSearchParams(query).toString();
			childWindow.loadURL(search ? `${devUrl}?${search}` : devUrl);
		} else {
			const indexPath = path.join(__dirname, "../dist/index.html");
			childWindow.loadFile(indexPath, { query });
		}

		childWindow.on("closed", () => {
			this._childWindows.delete(childId);
		});

		return { windowId: childId };
	}

	/**
	 * Dock a detached file tab back into the main window.
	 *
	 * Sends the file path to the main renderer via IPC and closes the
	 * child window that initiated the request.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents that sent the request
	 * @param {string} filePath - Vault-relative file path to dock
	 * @returns {{ ok: boolean }}
	 */
	dockTab(senderContents, filePath) {
		if (this._mainWindow && !this._mainWindow.isDestroyed()) {
			const dispatchDock = () => {
				if (!this._mainWindow || this._mainWindow.isDestroyed()) return;
				this._mainWindow.webContents.send("window:dockTab", filePath);
			};

			if (this._mainWindow.webContents.isLoadingMainFrame()) {
				this._mainWindow.webContents.once("did-finish-load", dispatchDock);
			} else {
				dispatchDock();
			}

			if (this._mainWindow.isMinimized()) {
				this._mainWindow.restore();
			}
			this._mainWindow.show();
			this._mainWindow.focus();
		}

		const senderWindow = BrowserWindow.fromWebContents(senderContents);
		if (senderWindow && senderWindow !== this._mainWindow && !senderWindow.isDestroyed()) {
			senderWindow.close();
		}

		return { ok: true };
	}

	// ---- Frame / Titlebar ----

	/**
	 * Get the current window frame style.
	 *
	 * @returns {string} "hidden" or "native"
	 */
	getFrameStyle() {
		const config = this._readConfig();
		return config.windowFrameStyle || "hidden";
	}

	/**
	 * Set the window frame style. Takes effect on next restart.
	 *
	 * @param {string} style - "hidden" or "native"
	 */
	setFrameStyle(style) {
		const config = this._readConfig();
		config.windowFrameStyle = style;
		this._writeConfig(config);
	}

	/**
	 * Update the titlebar overlay colors dynamically to match the app theme.
	 * Only works on Windows with a frameless window.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents requesting the update
	 * @param {{ color: string, symbolColor: string }} colors - The overlay colors
	 */
	setTitleBarOverlay(senderContents, colors) {
		const targetWindow = BrowserWindow.fromWebContents(senderContents) || this._mainWindow;
		if (targetWindow && !targetWindow.isDestroyed() && process.platform === "win32") {
			try {
				targetWindow.setTitleBarOverlay({
					color: colors.color,
					symbolColor: colors.symbolColor,
					height: 36,
				});
			} catch { /* ignore if not supported */ }
		}
	}

	// ---- Dialog ----

	/**
	 * Open a native folder picker dialog.
	 *
	 * @returns {Promise<string | null>} The selected directory path, or null if cancelled
	 */
	async openDirectory() {
		const result = await dialog.showOpenDialog(this._mainWindow, {
			properties: ["openDirectory"],
			title: "Select Vault Folder",
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	}

	// ---- Cleanup ----

	/**
	 * Close all child windows. Called during app quit.
	 */
	destroyAllChildren() {
		for (const [, win] of this._childWindows) {
			if (!win.isDestroyed()) win.close();
		}
		this._childWindows.clear();
	}
}

module.exports = WindowManager;
