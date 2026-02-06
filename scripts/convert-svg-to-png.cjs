#!/usr/bin/env node
/**
 * Convert SVG files to PNG using sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const conversions = [
  { svg: 'assets/images/logo.svg', png: 'assets/images/logo.png', width: 200, height: 200 },
  { svg: 'assets/images/favicon.svg', png: 'assets/images/favicon.png', width: 32, height: 32 },
  { svg: 'extensions/agents/daily-journal-agent/preview.svg', png: 'extensions/agents/daily-journal-agent/preview.png', width: 1280, height: 720 },
  { svg: 'extensions/agents/meeting-notes-agent/preview.svg', png: 'extensions/agents/meeting-notes-agent/preview.png', width: 1280, height: 720 },
  { svg: 'extensions/agents/weekly-review-agent/preview.svg', png: 'extensions/agents/weekly-review-agent/preview.png', width: 1280, height: 720 },
  { svg: 'extensions/prompts/task-management-prompt/preview.svg', png: 'extensions/prompts/task-management-prompt/preview.png', width: 1280, height: 720 },
  { svg: 'extensions/mcp-servers/example-weather/preview.svg', png: 'extensions/mcp-servers/example-weather/preview.png', width: 1280, height: 720 },
];

async function convert() {
  for (const { svg, png, width, height } of conversions) {
    const svgPath = path.join(__dirname, '..', svg);
    const pngPath = path.join(__dirname, '..', png);
    
    if (!fs.existsSync(svgPath)) {
      console.log(`Skipping ${svg} - file not found`);
      continue;
    }
    
    try {
      await sharp(svgPath)
        .resize(width, height)
        .png()
        .toFile(pngPath);
      console.log(`✓ Created ${png}`);
    } catch (err) {
      console.error(`✗ Failed ${svg}: ${err.message}`);
    }
  }
}

convert();
