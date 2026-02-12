import tseslint from 'typescript-eslint';
import globals from "globals";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"coverage/**",
			"**/*.mjs",
			"**/*.cjs",
			"**/*.js",
			"main.js",
			"versions.json",
			"test-vault/**",
			"examples/**",
			"scripts/**",
			"vitest.config.ts",
			"src/tests/**",
			"src/__mocks__/**",
			"_site/**",
			"azure-functions/**",
		],
	},
	...tseslint.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: __dirname,
			},
		},
		rules: {
			// TypeScript rules - Configure for gradual cleanup
			"@typescript-eslint/no-unused-vars": ["warn", { 
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_" 
			}],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-non-null-assertion": "warn",
			"@typescript-eslint/no-empty-object-type": "off",
			"@typescript-eslint/no-unused-expressions": "off",
			"@typescript-eslint/no-this-alias": "warn",
			"prefer-const": "warn",
		},
	}
);
