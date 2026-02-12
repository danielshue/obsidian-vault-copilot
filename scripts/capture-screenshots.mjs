/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CaptureScreenshots
 * @description Captures screenshots of plugin views for documentation using the Obsidian CLI.
 *
 * Navigates to each registered plugin view/screen, waits for it to render,
 * and saves a timestamped screenshot to docs/images/screenshots/.
 *
 * Requires:
 * - Obsidian 1.12+ with CLI enabled (Settings → General → Command line interface)
 * - The plugin must be installed and enabled in the active vault
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs                  # Capture all screens
 *   node scripts/capture-screenshots.mjs chat              # Capture only the chat view
 *   node scripts/capture-screenshots.mjs settings          # Capture only the settings tab
 *   node scripts/capture-screenshots.mjs --mobile          # Capture in mobile emulation mode
 *   node scripts/capture-screenshots.mjs --no-timestamp    # Overwrite without timestamp suffix
 *
 * @since 0.0.24
 */

import { execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");
const SCREENSHOT_DIR = join(PROJECT_ROOT, "docs", "images", "screenshots");

const PLUGIN_ID = "obsidian-vault-copilot";

/** Delay in ms to allow Obsidian to render the view before capturing. */
const RENDER_DELAY_MS = 1500;

/**
 * Screenshot targets: each entry navigates to a plugin screen and captures it.
 * - name: identifier used in filenames and CLI filtering
 * - description: what this screenshot shows (for logging)
 * - setup: array of CLI commands to run before the screenshot (navigate to the view)
 */
const SCREENSHOT_TARGETS = [
	{
		name: "chat",
		description: "Copilot Chat view",
		setup: [
			`obsidian command id=${PLUGIN_ID}:open-copilot-chat`,
		],
	},
	{
		name: "settings",
		description: "Plugin settings tab",
		setup: [
			`obsidian eval code="app.setting.open(); app.setting.openTabById('${PLUGIN_ID}');"`,
		],
	},
	{
		name: "extension-browser",
		description: "Extension Browser view",
		setup: [
			`obsidian command id=${PLUGIN_ID}:open-extension-browser`,
		],
	},
	{
		name: "submit-extension",
		description: "Extension Submission wizard",
		setup: [
			`obsidian command id=${PLUGIN_ID}:submit-extension`,
		],
	},
];

/**
 * Run an Obsidian CLI command, returning stdout. Throws on failure.
 * @param {string} cmd - The full CLI command string.
 * @returns {string} stdout output
 */
function runCli(cmd) {
	try {
		return execSync(cmd, { timeout: 15000, stdio: "pipe", encoding: "utf-8" });
	} catch (err) {
		const message = err.stderr?.toString() || err.message;
		throw new Error(`CLI command failed: ${cmd}\n${message}`);
	}
}

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a filename for the screenshot.
 * @param {string} name - Target name (e.g. "chat")
 * @param {boolean} mobile - Whether mobile emulation is active
 * @param {boolean} useTimestamp - Whether to include a timestamp
 * @returns {string}
 */
function buildFilename(name, mobile, useTimestamp) {
	const suffix = mobile ? "-mobile" : "";
	const ts = useTimestamp
		? `-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`
		: "";
	return `${name}${suffix}${ts}.png`;
}

// --- Main ---

async function main() {
	const args = process.argv.slice(2);
	const useMobile = args.includes("--mobile");
	const useTimestamp = !args.includes("--no-timestamp");
	const filterNames = args.filter((a) => !a.startsWith("--"));

	// Filter targets if specific names were provided
	const targets =
		filterNames.length > 0
			? SCREENSHOT_TARGETS.filter((t) => filterNames.includes(t.name))
			: SCREENSHOT_TARGETS;

	if (targets.length === 0) {
		const available = SCREENSHOT_TARGETS.map((t) => t.name).join(", ");
		console.error(`No matching targets. Available: ${available}`);
		process.exit(1);
	}

	// Verify CLI is available
	try {
		runCli("obsidian version");
	} catch {
		console.error(
			"Obsidian CLI not available. Ensure Obsidian 1.12+ is running with CLI enabled.\n" +
			"See: Settings → General → Command line interface"
		);
		process.exit(1);
	}

	// Ensure output directory exists
	if (!existsSync(SCREENSHOT_DIR)) {
		mkdirSync(SCREENSHOT_DIR, { recursive: true });
	}

	// Enable mobile emulation if requested
	if (useMobile) {
		console.log("Enabling mobile emulation...");
		runCli("obsidian dev:mobile on");
		await sleep(RENDER_DELAY_MS);
	}

	console.log(
		`\nCapturing ${targets.length} screenshot(s)${useMobile ? " (mobile)" : ""}...\n`
	);

	let captured = 0;
	for (const target of targets) {
		try {
			// Navigate to the target view
			for (const cmd of target.setup) {
				runCli(cmd);
			}

			// Wait for the view to render
			await sleep(RENDER_DELAY_MS);

			// Capture
			const filename = buildFilename(target.name, useMobile, useTimestamp);
			const outPath = join(SCREENSHOT_DIR, filename);
			runCli(`obsidian dev:screenshot path="${outPath}"`);

			console.log(`  ✓ ${target.description} → ${filename}`);
			captured++;
		} catch (err) {
			console.error(`  ✗ ${target.description}: ${err.message}`);
		}
	}

	// Disable mobile emulation if we enabled it
	if (useMobile) {
		console.log("\nDisabling mobile emulation...");
		runCli("obsidian dev:mobile off");
	}

	console.log(`\nDone: ${captured}/${targets.length} screenshots saved to docs/images/screenshots/`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
