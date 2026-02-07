#!/usr/bin/env node
/**
 * Convert SVG files to PNG using sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Base conversions that are not extension-specific
const baseConversions = [
  { svg: 'assets/images/logo.svg', png: 'assets/images/logo.png', width: 200, height: 200 },
  { svg: 'assets/images/favicon.svg', png: 'assets/images/favicon.png', width: 32, height: 32 },
];

/**
 * Discover all extension preview SVGs under the extensions/ tree.
 *
 * For each directory that contains a preview.svg, we generate a matching
 * preview.png at 1280x720. This allows newly submitted extensions (with
 * only a preview.svg committed) to be included automatically in the
 * website build without updating this script.
 */
function discoverExtensionPreviewConversions() {
  const rootDir = path.join(__dirname, '..');
  const extensionsRoot = path.join(rootDir, 'extensions');

  const conversions = [];

  if (!fs.existsSync(extensionsRoot)) {
    return conversions;
  }

  const typeDirs = fs.readdirSync(extensionsRoot, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const typeDir of typeDirs) {
    const typePath = path.join(extensionsRoot, typeDir);
    const extensionDirs = fs.readdirSync(typePath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const extDir of extensionDirs) {
      const svgRel = path.join('extensions', typeDir, extDir, 'preview.svg');
      const svgAbs = path.join(rootDir, svgRel);
      if (!fs.existsSync(svgAbs)) {
        continue;
      }

      const pngRel = path.join('extensions', typeDir, extDir, 'preview.png');
      conversions.push({
        svg: svgRel,
        png: pngRel,
        width: 1280,
        height: 720,
      });
    }
  }

  return conversions;
}

const conversions = [
  ...baseConversions,
  ...discoverExtensionPreviewConversions(),
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
