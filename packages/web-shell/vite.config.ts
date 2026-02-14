import { defineConfig } from "vite";
import path from "path";

const stub = (name: string) => path.resolve(__dirname, `src/stubs/${name}.ts`);

export default defineConfig({
	root: "src",
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, "../obsidian-shim/src/index.ts"),
			// Node.js built-in stubs for browser
			"node:child_process": stub("child_process"),
			child_process: stub("child_process"),
			"node:fs/promises": stub("fs_promises"),
			"fs/promises": stub("fs_promises"),
			"node:fs": stub("fs"),
			fs: stub("fs"),
			"node:path": stub("path"),
			path: stub("path"),
			"node:os": stub("os"),
			os: stub("os"),
			"node:util": stub("util"),
			util: stub("util"),
			"node:http": stub("http"),
			http: stub("http"),
			"node:https": stub("https"),
			https: stub("https"),
		},
	},
	build: {
		outDir: "../dist",
		sourcemap: true,
	},
});
