#!/usr/bin/env node
/**
 * Remove an extension from the catalog
 * 
 * This script:
 * - Removes the extension directory
 * - Rebuilds catalog.json
 * - Commits the changes
 * 
 * Usage:
 *   node scripts/remove-extension.cjs <type> <id>
 *   node scripts/remove-extension.cjs agent daily-journal
 * 
 * Run with --dry-run to preview what would be removed without actually doing it
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');
const CATALOG_PATH = path.join(__dirname, '..', 'catalog', 'catalog.json');

const TYPE_MAP = {
  'agent': 'agents',
  'agents': 'agents',
  'voice-agent': 'voice-agents',
  'voice-agents': 'voice-agents',
  'prompt': 'prompts',
  'prompts': 'prompts',
  'skill': 'skills',
  'skills': 'skills',
  'mcp-server': 'mcp-servers',
  'mcp-servers': 'mcp-servers'
};

// =============================================================================
// Logger
// =============================================================================

const Logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  success: (msg, ...args) => console.log(`[SUCCESS] ${msg}`, ...args),
};

// =============================================================================
// Main Function
// =============================================================================

async function removeExtension(type, id, options = {}) {
  const dryRun = options.dryRun || false;
  
  Logger.info('='.repeat(60));
  Logger.info(`Remove Extension: ${type}/${id}`);
  if (dryRun) {
    Logger.info('DRY RUN MODE - No changes will be made');
  }
  Logger.info('='.repeat(60));
  
  // Normalize type
  const normalizedType = TYPE_MAP[type];
  if (!normalizedType) {
    Logger.error(`Invalid extension type: ${type}`);
    Logger.error(`Valid types: ${Object.keys(TYPE_MAP).filter(k => !k.includes('-')).join(', ')}`);
    process.exit(1);
  }
  
  // Check if extension exists
  const extensionDir = path.join(EXTENSIONS_DIR, normalizedType, id);
  if (!fs.existsSync(extensionDir)) {
    Logger.error(`Extension not found: ${normalizedType}/${id}`);
    Logger.error(`Path checked: ${extensionDir}`);
    process.exit(1);
  }
  
  // Verify it's a directory
  if (!fs.statSync(extensionDir).isDirectory()) {
    Logger.error(`Path exists but is not a directory: ${extensionDir}`);
    process.exit(1);
  }
  
  // Show what will be removed
  Logger.info(`Extension directory: ${extensionDir}`);
  
  // List files that will be removed
  const files = fs.readdirSync(extensionDir);
  Logger.info(`Files to be removed (${files.length}):`);
  files.forEach(file => {
    const filePath = path.join(extensionDir, file);
    const stat = fs.statSync(filePath);
    const size = stat.isFile() ? `(${(stat.size / 1024).toFixed(1)} KB)` : '(directory)';
    Logger.info(`  - ${file} ${size}`);
  });
  
  // Check if extension is in catalog
  let extensionInCatalog = false;
  if (fs.existsSync(CATALOG_PATH)) {
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const extensionList = catalog.extensions || [];
    extensionInCatalog = extensionList.some(ext => ext.id === id && ext.type === normalizedType.replace(/s$/, ''));
    
    if (extensionInCatalog) {
      Logger.info(`Extension found in catalog.json`);
    } else {
      Logger.warn(`Extension NOT found in catalog.json (may already be removed)`);
    }
  }
  
  // Confirm removal
  if (!dryRun && !options.yes) {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      readline.question('\nAre you sure you want to remove this extension? (yes/no): ', resolve);
    });
    readline.close();
    
    if (answer.toLowerCase() !== 'yes') {
      Logger.info('Removal cancelled');
      process.exit(0);
    }
  }
  
  if (dryRun) {
    Logger.info('\nDRY RUN - Skipping actual removal');
    Logger.info('\nTo perform the removal, run without --dry-run flag');
    return;
  }
  
  // Remove the directory
  Logger.info('\nRemoving extension directory...');
  try {
    fs.rmSync(extensionDir, { recursive: true, force: true });
    Logger.success(`Removed: ${extensionDir}`);
  } catch (err) {
    Logger.error(`Failed to remove directory: ${err.message}`);
    process.exit(1);
  }
  
  // Rebuild catalog
  Logger.info('\nRebuilding catalog.json...');
  try {
    const buildCatalogScript = path.join(__dirname, 'build-catalog.cjs');
    execSync(`node "${buildCatalogScript}"`, { stdio: 'inherit' });
    Logger.success('Catalog rebuilt');
  } catch (err) {
    Logger.error(`Failed to rebuild catalog: ${err.message}`);
    Logger.warn('You may need to run the build-catalog script manually');
  }
  
  // Commit changes if in a git repository
  if (!options.noCommit) {
    Logger.info('\nCommitting changes...');
    try {
      // Check if we're in a git repository
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      
      // Add changes
      execSync(`git add "${extensionDir}" "${CATALOG_PATH}"`, { stdio: 'inherit' });
      
      // Commit
      const commitMessage = `chore: remove extension ${normalizedType}/${id}`;
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
      
      Logger.success('Changes committed');
      Logger.info('\nTo push changes, run: git push');
      Logger.info('This will trigger automatic rebuild and redeployment of the catalog site');
    } catch (err) {
      Logger.warn('Failed to commit changes automatically');
      Logger.info('You may need to commit and push manually');
    }
  }
  
  Logger.info('\n' + '='.repeat(60));
  Logger.success('Extension removed successfully!');
  Logger.info('='.repeat(60));
  
  if (!options.noCommit) {
    Logger.info('\nNext steps:');
    Logger.info('1. Review the changes: git status');
    Logger.info('2. Push to trigger deployment: git push');
    Logger.info('3. The catalog website will be automatically updated');
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

function showHelp() {
  console.log(`
Usage: node scripts/remove-extension.cjs [options] <type> <id>

Remove an extension from the catalog and website.

Arguments:
  type              Extension type (agent, prompt, voice-agent, skill, mcp-server)
  id                Extension ID (e.g., daily-journal, task-management-prompt)

Options:
  --dry-run         Preview what would be removed without actually doing it
  --yes, -y         Skip confirmation prompt
  --no-commit       Don't automatically commit changes
  --help, -h        Show this help message

Examples:
  # Remove an agent
  node scripts/remove-extension.cjs agent daily-journal

  # Preview removal without making changes
  node scripts/remove-extension.cjs --dry-run agent daily-journal

  # Remove without confirmation prompt
  node scripts/remove-extension.cjs --yes prompt task-management

  # Remove but don't commit (for manual review)
  node scripts/remove-extension.cjs --no-commit agent tutor
`);
}

// Parse command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  const options = {
    dryRun: args.includes('--dry-run'),
    yes: args.includes('--yes') || args.includes('-y'),
    noCommit: args.includes('--no-commit')
  };
  
  const positionalArgs = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  
  if (positionalArgs.length < 2) {
    Logger.error('Missing required arguments: type and id');
    Logger.info('Run with --help for usage information');
    process.exit(1);
  }
  
  const [type, id] = positionalArgs;
  
  removeExtension(type, id, options).catch(err => {
    Logger.error(`Removal failed: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}

// Export for testing
module.exports = { removeExtension };
