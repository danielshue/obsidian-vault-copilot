/**
 * Barrel export for the obsidian-shim package.
 *
 * This file re-exports every class, function, type, and constant that
 * the plugin imports from "obsidian". At build time, Vite aliases
 * the "obsidian" module to this file.
 */

// ---- DOM extensions (must be initialized via initDomExtensions) ----
export { initDomExtensions } from "./dom/dom-extensions.js";
export type { DomElementInfo } from "./dom/dom-extensions.js";

// ---- Core ----
export { App } from "./core/App.js";
export { Component } from "./core/Component.js";
export { Events } from "./core/Events.js";
export type { EventRef } from "./core/Events.js";
export { Plugin } from "./core/Plugin.js";
export type { PluginManifest, Command } from "./core/Plugin.js";

// ---- Vault ----
export { TAbstractFile } from "./vault/TAbstractFile.js";
export { TFile } from "./vault/TFile.js";
export { TFolder } from "./vault/TFolder.js";
export { Vault } from "./vault/Vault.js";
export { VaultAdapter, FileSystemAdapter } from "./vault/VaultAdapter.js";

// ---- Workspace ----
export { Workspace } from "./workspace/Workspace.js";
export { WorkspaceLeaf } from "./workspace/WorkspaceLeaf.js";

// ---- UI ----
export { ItemView, MarkdownView, type ViewStateResult } from "./ui/ItemView.js";
export { Modal } from "./ui/Modal.js";
export { Setting } from "./ui/Setting.js";
export {
	TextComponent,
	TextAreaComponent,
	ToggleComponent,
	DropdownComponent,
	SliderComponent,
	ButtonComponent,
	ExtraButtonComponent,
} from "./ui/FormComponents.js";
export { Menu, MenuItem } from "./ui/Menu.js";
export { Notice } from "./ui/Notice.js";
export { PluginSettingTab } from "./ui/PluginSettingTab.js";
export { FuzzySuggestModal } from "./ui/FuzzySuggestModal.js";
export { AbstractInputSuggest } from "./ui/AbstractInputSuggest.js";
export { MarkdownRenderer } from "./ui/MarkdownRenderer.js";

// ---- Utils ----
export { setIcon } from "./utils/icons.js";
export { requestUrl } from "./utils/requestUrl.js";
export type { RequestUrlParam, RequestUrlResponse } from "./utils/requestUrl.js";
export { Platform } from "./utils/platform.js";
export { parseYaml, stringifyYaml } from "./utils/parseYaml.js";
export { normalizePath } from "./utils/normalizePath.js";

// ---- Metadata ----
export { MetadataCache } from "./metadata/MetadataCache.js";
export { FileManager } from "./metadata/FileManager.js";
