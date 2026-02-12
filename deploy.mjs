import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLUGIN_ID = "obsidian-vault-copilot";
const TEST_VAULT_PATH = join(__dirname, "test-vault");
const PLUGIN_DEST = join(TEST_VAULT_PATH, ".obsidian", "plugins", PLUGIN_ID);

const FILES_TO_COPY = ["main.js", "manifest.json", "styles.css"];

// Check for --no-reload flag to skip Obsidian CLI reload
const skipReload = process.argv.includes("--no-reload");

// Ensure destination directory exists
if (!existsSync(PLUGIN_DEST)) {
	mkdirSync(PLUGIN_DEST, { recursive: true });
}

console.log(`Deploying plugin to: ${PLUGIN_DEST}`);

let copied = 0;
for (const file of FILES_TO_COPY) {
	const src = join(__dirname, file);
	const dest = join(PLUGIN_DEST, file);

	if (existsSync(src)) {
		copyFileSync(src, dest);
		console.log(`  ✓ ${file}`);
		copied++;
	} else {
		console.log(`  ✗ ${file} (not found - run build first)`);
	}
}

console.log(`\nDeployed ${copied}/${FILES_TO_COPY.length} files.`);

if (copied < FILES_TO_COPY.length) {
	console.log("\nWarning: Some files were missing. Run 'npm run build' first.");
	process.exit(1);
}

console.log(`\nTest vault ready at: ${TEST_VAULT_PATH}`);

// Attempt to reload the plugin via Obsidian CLI (requires Obsidian 1.12+ with CLI enabled)
if (!skipReload) {
	try {
		execSync(`obsidian vault="${TEST_VAULT_PATH}" plugin:reload id=${PLUGIN_ID}`, {
			timeout: 10000,
			stdio: "pipe",
		});
		console.log(`  ✓ Plugin reloaded via Obsidian CLI`);
	} catch {
		console.log(
			"\n  ℹ Obsidian CLI not available — reload the plugin manually in Obsidian."
		);
		console.log(
			"    To enable: Obsidian 1.12+ → Settings → General → Command line interface"
		);
	}
} else {
	console.log("  ℹ Skipping Obsidian CLI reload (--no-reload)");
}
