/**
 * Mock for Obsidian API used in testing
 */

import { vi } from "vitest";

// Mock TFile
export class TFile {
	path: string;
	basename: string;
	extension: string;
	name: string;

	constructor(path: string) {
		this.path = path;
		this.basename = path.split("/").pop()?.replace(".md", "") || "";
		this.extension = "md";
		this.name = path.split("/").pop() || "";
	}
}

// Mock TFolder
export class TFolder {
	path: string;
	name: string;
	children: (TFile | TFolder)[] = [];

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() || "";
	}
}

// Mock TAbstractFile
export class TAbstractFile {
	path: string;
	name: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() || "";
	}
}

// Mock Vault
export class Vault {
	private files: Map<string, string> = new Map();

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		if (this.files.has(path)) {
			return new TFile(path);
		}
		return null;
	}

	getMarkdownFiles(): TFile[] {
		return Array.from(this.files.keys()).map((path) => new TFile(path));
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path) || "";
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(file.path, content);
	}

	async create(path: string, content: string): Promise<TFile> {
		this.files.set(path, content);
		return new TFile(path);
	}

	// Test helpers
	_setFile(path: string, content: string): void {
		this.files.set(path, content);
	}

	_getFile(path: string): string | undefined {
		return this.files.get(path);
	}

	_clear(): void {
		this.files.clear();
	}
}

// Mock Workspace
export class Workspace {
	private activeFile: TFile | null = null;

	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	// Test helper
	_setActiveFile(file: TFile | null): void {
		this.activeFile = file;
	}
}

// Mock App
export class App {
	vault: Vault;
	workspace: Workspace;

	constructor() {
		this.vault = new Vault();
		this.workspace = new Workspace();
	}
}

// Mock Notice
export class Notice {
	message: string;
	static instances: Notice[] = [];

	constructor(message: string, _timeout?: number) {
		this.message = message;
		Notice.instances.push(this);
	}

	static _clear(): void {
		Notice.instances = [];
	}

	static _getLastMessage(): string | undefined {
		return Notice.instances[Notice.instances.length - 1]?.message;
	}
}

// Mock requestUrl for fetch operations
export const requestUrl = vi.fn();

// Mock Platform
export const Platform = {
	isDesktop: true,
	isMobile: false,
	isDesktopApp: true,
	isMobileApp: false,
};

// Mock Plugin
export class Plugin {
	app: App;
	manifest: { id: string; name: string; version: string };

	constructor(app: App, manifest: { id: string; name: string; version: string }) {
		this.app = app;
		this.manifest = manifest;
	}

	loadData = vi.fn().mockResolvedValue({});
	saveData = vi.fn().mockResolvedValue(undefined);
	addCommand = vi.fn();
	addSettingTab = vi.fn();
	registerView = vi.fn();
	registerEvent = vi.fn();
	registerDomEvent = vi.fn();
	registerInterval = vi.fn();
}

// Mock PluginSettingTab
export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement("div");
	}

	display(): void {}
	hide(): void {}
}

// Mock Setting
export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;

	constructor(_containerEl: HTMLElement) {
		this.settingEl = document.createElement("div");
		this.infoEl = document.createElement("div");
		this.nameEl = document.createElement("div");
		this.descEl = document.createElement("div");
		this.controlEl = document.createElement("div");
	}

	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(_cb: (text: TextComponent) => void): this {
		return this;
	}
	addToggle(_cb: (toggle: ToggleComponent) => void): this {
		return this;
	}
	addDropdown(_cb: (dropdown: DropdownComponent) => void): this {
		return this;
	}
	addButton(_cb: (button: ButtonComponent) => void): this {
		return this;
	}
	setClass(_cls: string): this {
		return this;
	}
}

// Component mocks
export class TextComponent {
	setValue = vi.fn().mockReturnThis();
	setPlaceholder = vi.fn().mockReturnThis();
	onChange = vi.fn().mockReturnThis();
}

export class ToggleComponent {
	setValue = vi.fn().mockReturnThis();
	onChange = vi.fn().mockReturnThis();
}

export class DropdownComponent {
	addOption = vi.fn().mockReturnThis();
	setValue = vi.fn().mockReturnThis();
	onChange = vi.fn().mockReturnThis();
}

export class ButtonComponent {
	setButtonText = vi.fn().mockReturnThis();
	setCta = vi.fn().mockReturnThis();
	onClick = vi.fn().mockReturnThis();
}
