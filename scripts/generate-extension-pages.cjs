#!/usr/bin/env node
/**
 * Generate Jekyll-compatible index.md pages for each extension
 * 
 * This script creates an index.md file in each extension directory with
 * proper Jekyll front matter, making them discoverable by the Jekyll build.
 */

const fs = require('fs');
const path = require('path');

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');
const EXTENSION_TYPES = ['agents', 'voice-agents', 'prompts', 'skills', 'mcp-servers'];

function generateExtensionPages() {
  console.log('[generate-extension-pages] Starting...');
  
  let generated = 0;
  let skipped = 0;
  
  for (const type of EXTENSION_TYPES) {
    const typeDir = path.join(EXTENSIONS_DIR, type);
    
    if (!fs.existsSync(typeDir)) {
      console.log(`[generate-extension-pages] Type directory not found: ${type}`);
      continue;
    }
    
    const entries = fs.readdirSync(typeDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.gitkeep') {
        continue;
      }
      
      const extensionDir = path.join(typeDir, entry.name);
      const manifestPath = path.join(extensionDir, 'manifest.json');
      const indexPath = path.join(extensionDir, 'index.md');
      const readmePath = path.join(extensionDir, 'README.md');
      
      // Check if manifest exists
      if (!fs.existsSync(manifestPath)) {
        console.log(`[generate-extension-pages] No manifest found for ${type}/${entry.name}`);
        continue;
      }
      
      // Read manifest
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (err) {
        console.error(`[generate-extension-pages] Failed to parse manifest for ${type}/${entry.name}:`, err.message);
        continue;
      }
      
      // Read README content if it exists
      let readmeContent = '';
      if (fs.existsSync(readmePath)) {
        readmeContent = fs.readFileSync(readmePath, 'utf8');
        // Remove any existing front matter from README
        readmeContent = readmeContent.replace(/^---\n[\s\S]*?\n---\n/, '');
      }
      
      // Find icon file
      let iconPath = null;
      const iconFiles = ['icon.svg', 'icon.png', 'preview.svg', 'preview.png'];
      for (const iconFile of iconFiles) {
        const iconFullPath = path.join(extensionDir, iconFile);
        if (fs.existsSync(iconFullPath)) {
          iconPath = `${iconFile}`;
          break;
        }
      }
      
      // Generate front matter
      const frontMatter = [
        '---',
        'layout: extension',
        `title: "${manifest.name || entry.name}"`,
        `type: ${manifest.type || type.replace(/s$/, '')}`,
        `version: "${manifest.version || '1.0.0'}"`,
        `description: "${(manifest.description || '').replace(/"/g, '\\"')}"`,
        manifest.author ? `author: "${manifest.author.name || manifest.author}"` : null,
        manifest.author?.url ? `author_url: "${manifest.author.url}"` : null,
        iconPath ? `icon: "${iconPath}"` : null,
        manifest.categories && manifest.categories.length > 0 ? `categories: [${manifest.categories.map(c => `"${c}"`).join(', ')}]` : null,
        manifest.tags && manifest.tags.length > 0 ? `tags: [${manifest.tags.map(t => `"${t}"`).join(', ')}]` : null,
        '---',
        ''
      ].filter(line => line !== null).join('\n');
      
      // Combine front matter with README content
      const pageContent = frontMatter + '\n' + readmeContent;
      
      // Write index.md
      fs.writeFileSync(indexPath, pageContent, 'utf8');
      console.log(`[generate-extension-pages] Generated: ${type}/${entry.name}/index.md`);
      generated++;
    }
  }
  
  console.log('[generate-extension-pages] Complete!');
  console.log(`[generate-extension-pages] Generated: ${generated}, Skipped: ${skipped}`);
}

// Run if executed directly
if (require.main === module) {
  generateExtensionPages();
}

module.exports = { generateExtensionPages };
