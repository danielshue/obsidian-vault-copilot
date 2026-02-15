/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AppearanceSettingTab
 * @description Appearance settings matching Obsidian's full Appearance panel:
 * color scheme, accent color, themes, interface, font, and advanced sections.
 */

import { Setting } from "@vault-copilot/obsidian-shim/src/ui/Setting.js";
import { SettingTab } from "./SettingTab.js";
import { loadSettings, saveSettings } from "./WebShellSettings.js";
import type { App } from "@vault-copilot/obsidian-shim/src/core/App.js";

export class AppearanceSettingTab extends SettingTab {
	constructor(app: App) {
		super(app, "appearance", "Appearance", "palette");
	}

	display(): void {
		const el = this.containerEl;
		el.empty();

		const settings = loadSettings();

		// ── Top section (no heading) ──

		new Setting(el)
			.setName("Base color scheme")
			.setDesc("Choose Obsidian's default color scheme.")
			.addDropdown((dd) => {
				dd.addOption("system", "Adapt to system")
					.addOption("light", "Light")
					.addOption("dark", "Dark")
					.setValue(settings.theme)
					.onChange((val) => {
						settings.theme = val as "light" | "dark" | "system";
						saveSettings(settings);
						this.applyTheme(settings.theme);
					});
			});

		new Setting(el)
			.setName("Accent color")
			.setDesc("Choose the accent color used throughout the app.")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Restore default")
					.onClick(() => {
						settings.accentColor = "";
						saveSettings(settings);
						document.body.style.removeProperty("--interactive-accent");
						this.display();
					});
			})
			.addToggle((toggle) => {
				// Use toggle as a visual color swatch
				toggle.setValue(!!settings.accentColor);
				if (settings.accentColor) {
					toggle.toggleEl.style.backgroundColor = settings.accentColor;
				}
				// Add a hidden color input triggered on click
				const colorInput = document.createElement("input");
				colorInput.type = "color";
				colorInput.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none;";
				colorInput.value = settings.accentColor || "#7c4dff";
				toggle.toggleEl.style.cursor = "pointer";
				toggle.toggleEl.style.position = "relative";
				toggle.toggleEl.appendChild(colorInput);
				toggle.toggleEl.addEventListener("click", (e) => {
					e.stopPropagation();
					colorInput.click();
				});
				colorInput.addEventListener("input", () => {
					settings.accentColor = colorInput.value;
					saveSettings(settings);
					document.body.style.setProperty("--interactive-accent", colorInput.value);
					toggle.toggleEl.style.backgroundColor = colorInput.value;
					toggle.setValue(true);
				});
			});

		// ── Interface ──

		new Setting(el).setName("Interface").setHeading();

		new Setting(el)
			.setName("Inline title")
			.setDesc("Display the filename as an editable title inline with the file contents.")
			.addToggle((toggle) => {
				toggle.setValue(settings.inlineTitle)
					.onChange((val) => {
						settings.inlineTitle = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Show tab title bar")
			.setDesc("Display the header at the top of every tab.")
			.addToggle((toggle) => {
				toggle.setValue(settings.showTabTitleBar)
					.onChange((val) => {
						settings.showTabTitleBar = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Show ribbon")
			.setDesc("Display vertical toolbar on the side of the window.")
			.addToggle((toggle) => {
				toggle.setValue(settings.showRibbon)
					.onChange((val) => {
						settings.showRibbon = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Ribbon menu configuration")
			.setDesc("Configure what commands appear in the ribbon menu.")
			.addButton((btn) => {
				btn.setButtonText("Manage");
			});

		// ── Font ──

		new Setting(el).setName("Font").setHeading();

		new Setting(el)
			.setName("Interface font")
			.setDesc("Set base font for all of Obsidian.")
			.addButton((btn) => {
				btn.setButtonText("Manage")
					.onClick(() => {
						const val = prompt("Enter font family name:", settings.fontFamily || "");
						if (val !== null) {
							settings.fontFamily = val;
							saveSettings(settings);
							if (val) {
								document.body.style.setProperty("--font-default", val);
							} else {
								document.body.style.removeProperty("--font-default");
							}
						}
					});
			});

		new Setting(el)
			.setName("Text font")
			.setDesc("Set font for editing and reading views.")
			.addButton((btn) => {
				btn.setButtonText("Manage")
					.onClick(() => {
						const val = prompt("Enter text font family:", settings.textFont || "");
						if (val !== null) {
							settings.textFont = val;
							saveSettings(settings);
							if (val) {
								document.body.style.setProperty("--font-text", val);
							} else {
								document.body.style.removeProperty("--font-text");
							}
						}
					});
			});

		new Setting(el)
			.setName("Monospace font")
			.setDesc("Set font for places like code blocks and frontmatter.")
			.addButton((btn) => {
				btn.setButtonText("Manage")
					.onClick(() => {
						const val = prompt("Enter monospace font family:", settings.monospaceFont || "");
						if (val !== null) {
							settings.monospaceFont = val;
							saveSettings(settings);
							if (val) {
								document.body.style.setProperty("--font-monospace", val);
							} else {
								document.body.style.removeProperty("--font-monospace");
							}
						}
					});
			});

		new Setting(el)
			.setName("Font size")
			.setDesc("Font size in pixels that affects editing and reading views.")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Restore default")
					.onClick(() => {
						settings.fontSize = 16;
						saveSettings(settings);
						this.display();
					});
			})
			.addSlider((slider) => {
				slider.setLimits(8, 48, 1)
					.setValue(settings.fontSize)
					.setDynamicTooltip()
					.onChange((val) => {
						settings.fontSize = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Quick font size adjustment")
			.setDesc("Adjust the font size using Ctrl + Scroll, or using the trackpad pinch-zoom gesture.")
			.addToggle((toggle) => {
				toggle.setValue(settings.quickFontSizeAdjustment)
					.onChange((val) => {
						settings.quickFontSizeAdjustment = val;
						saveSettings(settings);
					});
			});

		// ── Advanced ──

		new Setting(el).setName("Advanced").setHeading();

		new Setting(el)
			.setName("Zoom level")
			.setDesc("Controls the overall zoom level of the app.")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Restore default")
					.onClick(() => {
						settings.zoomLevel = 0;
						saveSettings(settings);
						this.display();
					});
			})
			.addSlider((slider) => {
				slider.setLimits(-5, 5, 0.5)
					.setValue(settings.zoomLevel)
					.setDynamicTooltip()
					.onChange((val) => {
						settings.zoomLevel = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Native menus")
			.setDesc("Menus throughout the app will match the operating system. They will not be affected by your theme.")
			.addToggle((toggle) => {
				toggle.setValue(settings.nativeMenus)
					.onChange((val) => {
						settings.nativeMenus = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Window frame style")
			.setDesc("Determines the styling of the title bar of Obsidian windows. Requires a full restart to take effect.")
			.addDropdown((dd) => {
				dd.addOption("hidden", "Hidden (default)")
					.addOption("native", "Native")
					.setValue(settings.windowFrameStyle)
					.onChange(async (val) => {
						settings.windowFrameStyle = val as "hidden" | "native";
						saveSettings(settings);
						if (window.electronAPI) {
							await window.electronAPI.setWindowFrame(val as "hidden" | "native");
						}
					});
			});

		new Setting(el)
			.setName("Custom app icon")
			.setDesc("Set a custom icon for the app")
			.addButton((btn) => {
				btn.setButtonText("Choose");
			});

		new Setting(el)
			.setName("Hardware acceleration")
			.setDesc("Turns on Hardware Acceleration, which uses your GPU to make Obsidian smoother.")
			.addToggle((toggle) => {
				toggle.setValue(settings.hardwareAcceleration)
					.onChange((val) => {
						settings.hardwareAcceleration = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Translucent window")
			.setDesc("Make the window background slightly transparent (Electron only).")
			.addToggle((toggle) => {
				toggle.setValue(settings.translucent)
					.setDisabled(!window.electronAPI)
					.onChange((val) => {
						settings.translucent = val;
						saveSettings(settings);
					});
			});
	}

	/** Apply the selected theme to the document. */
	private applyTheme(theme: "light" | "dark" | "system"): void {
		let darkMode: boolean;
		if (theme === "system") {
			darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
		} else {
			darkMode = theme === "dark";
		}
		document.body.classList.toggle("theme-dark", darkMode);
		document.body.classList.toggle("theme-light", !darkMode);
	}
}
