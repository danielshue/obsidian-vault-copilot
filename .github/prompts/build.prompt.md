---
agent: 'agent'
name: build
description: Build and deploy the Obsidian plugin to the test vault
---
Build and deploy the Obsidian Vault Copilot plugin to the test vault for local testing.

## Options

- **Run tests**: If requested, run unit tests before building (e.g., "build with tests" or "build and test")

## Steps

1. **(Optional)** Run `npm test` to execute unit tests - only if user requests tests
2. Run `npm run build` to compile TypeScript and bundle with esbuild
3. Run `node deploy.mjs` to copy artifacts to the test vault

## Expected Output

The deploy script copies these files to `test-vault/.obsidian/plugins/obsidian-vault-copilot/`:
- main.js
- manifest.json
- styles.css

## After Deployment

Open the test vault folder in Obsidian and enable the plugin in Settings → Community plugins to test changes.
