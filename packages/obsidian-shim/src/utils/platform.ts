/**
 * Platform detection constants replicating Obsidian's Platform object.
 *
 * In the web shim, both isDesktop and isMobile are false.
 * This causes the plugin's platform guards to correctly disable
 * desktop-only features (CLI, Stdio MCP) without any source changes.
 */

export const Platform = {
	isDesktop: false,
	isDesktopApp: false,
	isMobile: false,
	isMobileApp: false,
	isMacOS: false,
	isWin: false,
	isLinux: false,
	isIosApp: false,
	isAndroidApp: false,
	isPhone: false,
	isTablet: false,
	isSafari: false,
} as const;
