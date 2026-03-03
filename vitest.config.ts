import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["./tests/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
		},
	},
	resolve: {
		alias: {
			obsidian: "./src/__mocks__/obsidian.ts",
			// When Pro files transitively import @basic/* (e.g. via shim modules),
			// resolve them to vault-copilot's own src/ so tests can run standalone.
			"@basic": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
});
