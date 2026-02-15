/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module WebShellSettings
 * @description Shared settings interface and storage for web shell built-in tabs.
 */

export interface WebShellSettings {
	// General
	language: string;

	// Editor
	alwaysFocusNewTabs: boolean;
	defaultViewForNewTabs: "editing" | "reading";
	defaultEditingMode: "live-preview" | "source";
	showEditingModeInStatusBar: boolean;
	readableLineLength: boolean;
	strictLineBreaks: boolean;
	propertiesInDocument: "visible" | "hidden" | "source";
	foldHeadings: boolean;
	foldIndent: boolean;
	showLineNumbers: boolean;
	indentationGuides: boolean;
	rightToLeft: boolean;
	spellcheck: boolean;
	autoPairBrackets: boolean;
	autoPairMarkdownSyntax: boolean;
	smartLists: boolean;
	indentUsingTabs: boolean;
	tabSize: number;
	convertPastedHtmlToMarkdown: boolean;
	vimKeyBindings: boolean;

	// Files & Links
	newNotePath: string;
	attachmentFolder: string;
	linkFormat: "shortest" | "relative" | "absolute";
	useMarkdownLinks: boolean;
	autoUpdateLinks: boolean;
	deleteOption: "trash" | "permanent";

	// Appearance
	theme: "light" | "dark" | "system";
	accentColor: string;
	inlineTitle: boolean;
	showTabTitleBar: boolean;
	showRibbon: boolean;
	fontFamily: string;
	textFont: string;
	monospaceFont: string;
	fontSize: number;
	quickFontSizeAdjustment: boolean;
	zoomLevel: number;
	nativeMenus: boolean;
	windowFrameStyle: "hidden" | "native";
	hardwareAcceleration: boolean;
	translucent: boolean;
}

export const DEFAULT_SETTINGS: WebShellSettings = {
	language: "en",
	alwaysFocusNewTabs: true,
	defaultViewForNewTabs: "editing",
	defaultEditingMode: "live-preview",
	showEditingModeInStatusBar: false,
	readableLineLength: true,
	strictLineBreaks: false,
	propertiesInDocument: "visible",
	foldHeadings: true,
	foldIndent: true,
	showLineNumbers: false,
	indentationGuides: true,
	rightToLeft: false,
	spellcheck: true,
	autoPairBrackets: true,
	autoPairMarkdownSyntax: true,
	smartLists: true,
	indentUsingTabs: true,
	tabSize: 4,
	convertPastedHtmlToMarkdown: true,
	vimKeyBindings: false,
	newNotePath: "",
	attachmentFolder: "",
	linkFormat: "shortest",
	useMarkdownLinks: false,
	autoUpdateLinks: true,
	deleteOption: "trash",
	theme: "system",
	accentColor: "",
	inlineTitle: false,
	showTabTitleBar: true,
	showRibbon: true,
	fontFamily: "",
	textFont: "",
	monospaceFont: "",
	fontSize: 16,
	quickFontSizeAdjustment: false,
	zoomLevel: 0,
	nativeMenus: false,
	windowFrameStyle: "hidden",
	hardwareAcceleration: true,
	translucent: false,
};

const STORAGE_KEY = "web-shell-settings";

/** Load settings from localStorage, merged with defaults. */
export function loadSettings(): WebShellSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
		}
	} catch { /* ignore parse errors */ }
	return { ...DEFAULT_SETTINGS };
}

/** Save settings to localStorage. */
export function saveSettings(settings: WebShellSettings): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
