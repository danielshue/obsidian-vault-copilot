Remove an extension from the Vault Copilot catalog and website.

## Instructions

When the user provides an extension name (and optionally type), run the removal script after confirming with the user.

## Steps

1. **Identify the extension details**:
   - Ask for the extension type if not provided (agent, prompt, voice-agent, skill, mcp-server)
   - Get the extension ID/name
   
2. **Preview the removal** (dry-run first):
   ```bash
   node scripts/remove-extension.cjs --dry-run <type> <id>
   ```
   - Show the user what files will be removed
   - Display the extension details from the dry-run output

3. **Confirm with user**:
   - Ask if they want to proceed with the actual removal
   - Warn that this action will remove the extension from the catalog and website

4. **Execute removal** (if confirmed):
   ```bash
   node scripts/remove-extension.cjs --yes <type> <id>
   ```

5. **Push changes** (if user confirms):
   ```bash
   git push
   ```
   - Inform user that this will trigger automatic catalog rebuild and website redeployment
   - The extension will be removed from the live site once deployment completes

## Examples

**User says:** "Remove the tutor agent"
- Type: `agent`
- ID: `tutor`
- Run: `node scripts/remove-extension.cjs --dry-run agent tutor`
- Show output and confirm
- Run: `node scripts/remove-extension.cjs --yes agent tutor`
- Run: `git push`

**User says:** "Delete daily-journal"
- Determine type by checking extension folders
- Run dry-run to show what will be removed
- Confirm and execute

## Important Notes

- **Always run `--dry-run` first** to show the user what will be removed
- **Always confirm** before executing the actual removal
- **Explain** that pushing will automatically update the live website
- **Check** that the extension exists before attempting removal
- The script automatically:
  - Removes the extension directory
  - Rebuilds catalog.json
  - Commits the changes
- After push, GitHub Actions will:
  - Regenerate extension pages
  - Update the catalog
  - Redeploy the website

## Script Options

- `--dry-run`: Preview removal without making changes (always use first)
- `--yes`: Skip confirmation prompt in script (use this after user confirms)
- `--no-commit`: Don't auto-commit (for manual review)

## Safety Checks

Before removal:
1. ✅ Verify extension exists
2. ✅ Show all files that will be removed
3. ✅ Check if extension is in catalog
4. ✅ Get user confirmation
5. ✅ Explain impact (website will be updated after push)
