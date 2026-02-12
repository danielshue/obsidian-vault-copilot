---
agent: 'agent'
name: start-website
description: Start the Jekyll development web server for the project website
---
Start the Jekyll development web server to preview the Vault Copilot website locally.

## Prerequisites

- Ruby and Bundler must be installed
- Run `bundle install` in the project root if gems are not yet installed

## Steps

1. Run `bundle install` to ensure dependencies are up to date
2. Run `bundle exec jekyll serve` from the project root to start the local development server

## Expected Output

The Jekyll server starts and serves the site at:
- **Local**: http://127.0.0.1:4000/obsidian-vault-copilot/

The server watches for file changes and automatically rebuilds.

## Notes

- Use PowerShell (`pwsh`) for all terminal commands
- The `--livereload` flag can be added for automatic browser refresh on changes
- Press `Ctrl+C` to stop the server
