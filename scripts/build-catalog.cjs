#!/usr/bin/env node
/**
 * Build script that aggregates all extension manifests into catalog.json
 * 
 * Features:
 * - Scans all extensions/{type}/{name}/manifest.json files
 * - Validates manifests against JSON schema
 * - Aggregates into catalog/catalog.json
 * - Generates download URLs for GitHub raw content
 * - Calculates file sizes and metadata
 * - Integrates GitHub Discussions API for reaction counts
 * - Selects featured extensions based on criteria
 * 
 * Run during the GitHub Pages build process
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');
const CATALOG_PATH = path.join(__dirname, '..', 'catalog', 'catalog.json');
const SCHEMA_PATH = path.join(__dirname, '..', 'schema', 'manifest.schema.json');
const BASE_URL = 'https://danielshue.github.io/obsidian-vault-copilot';
const RAW_BASE = 'https://raw.githubusercontent.com/danielshue/obsidian-vault-copilot/master';

// GitHub API configuration
const GITHUB_OWNER = 'danielshue';
const GITHUB_REPO = 'obsidian-vault-copilot';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const EXTENSION_TYPES = ['agents', 'voice-agents', 'prompts', 'skills', 'mcp-servers'];

const CATEGORIES = [
  'Productivity',
  'Journaling',
  'Research',
  'Writing',
  'Task Management',
  'Voice',
  'Integration',
  'MCP',
  'Utility'
];

// Featured selection criteria
const FEATURED_CONFIG = {
  maxFeatured: 10,
  minRating: 3.0,
  boostNewExtensionsDays: 30, // Boost extensions published within this many days
};

// =============================================================================
// Logger
// =============================================================================

const Logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg, ...args) => {
    if (process.env.DEBUG) console.log(`[DEBUG] ${msg}`, ...args);
  },
  success: (msg, ...args) => console.log(`[SUCCESS] ${msg}`, ...args),
};

// =============================================================================
// Schema Validation
// =============================================================================

let validateManifest = null;

/**
 * Initialize the JSON schema validator
 * @returns {Function|null} The validator function or null if initialization fails
 */
function initializeValidator() {
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    
    if (!fs.existsSync(SCHEMA_PATH)) {
      Logger.warn(`Schema file not found at ${SCHEMA_PATH}, skipping validation`);
      return null;
    }
    
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    validateManifest = ajv.compile(schema);
    Logger.info('Schema validator initialized');
    return validateManifest;
  } catch (err) {
    Logger.warn(`Could not initialize schema validator: ${err.message}`);
    return null;
  }
}

/**
 * Validate a manifest against the schema
 * @param {Object} manifest - The manifest to validate
 * @param {string} manifestPath - Path to the manifest (for error messages)
 * @returns {Object} Validation result with valid flag and errors array
 */
function validateManifestSchema(manifest, manifestPath) {
  if (!validateManifest) {
    return { valid: true, errors: [] };
  }
  
  const valid = validateManifest(manifest);
  if (!valid) {
    const errors = validateManifest.errors.map(err => {
      return `${err.instancePath || 'root'}: ${err.message}`;
    });
    return { valid: false, errors };
  }
  
  return { valid: true, errors: [] };
}

// =============================================================================
// GitHub Discussions API Integration
// =============================================================================

/**
 * Fetch reaction counts from GitHub Discussions for an extension
 * Uses the GitHub GraphQL API to query discussion reactions
 * @param {string} extensionId - The extension ID to look up
 * @returns {Promise<Object>} Reaction data including counts and rating
 */
async function fetchDiscussionReactions(extensionId) {
  const defaultResult = {
    totalReactions: 0,
    rating: null,
    reactions: {},
    discussionUrl: null
  };
  
  if (!GITHUB_TOKEN) {
    Logger.debug(`No GITHUB_TOKEN, skipping reactions for ${extensionId}`);
    return defaultResult;
  }
  
  try {
    const query = `
      query($owner: String!, $repo: String!, $searchQuery: String!) {
        repository(owner: $owner, name: $repo) {
          discussions(first: 1, filterBy: {}) {
            nodes {
              title
              url
              reactions(first: 100) {
                totalCount
                nodes {
                  content
                }
              }
              reactionGroups {
                content
                reactors {
                  totalCount
                }
              }
            }
          }
          discussionCategories(first: 10) {
            nodes {
              id
              name
            }
          }
        }
        search(query: $searchQuery, type: DISCUSSION, first: 1) {
          nodes {
            ... on Discussion {
              title
              url
              reactions(first: 100) {
                totalCount
              }
              reactionGroups {
                content
                reactors {
                  totalCount
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await fetch(`${GITHUB_API_BASE}/graphql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          searchQuery: `repo:${GITHUB_OWNER}/${GITHUB_REPO} "${extensionId}" in:title`
        }
      })
    });
    
    if (!response.ok) {
      Logger.debug(`GitHub API returned ${response.status} for ${extensionId}`);
      return defaultResult;
    }
    
    const data = await response.json();
    
    if (data.errors) {
      Logger.debug(`GraphQL errors for ${extensionId}: ${JSON.stringify(data.errors)}`);
      return defaultResult;
    }
    
    // Extract reactions from search results
    const discussion = data.data?.search?.nodes?.[0];
    if (!discussion) {
      Logger.debug(`No discussion found for ${extensionId}`);
      return defaultResult;
    }
    
    const reactions = {};
    let totalPositive = 0;
    let totalNegative = 0;
    
    for (const group of discussion.reactionGroups || []) {
      const count = group.reactors?.totalCount || 0;
      reactions[group.content] = count;
      
      // Calculate rating based on positive vs negative reactions
      if (['THUMBS_UP', 'HEART', 'ROCKET', 'HOORAY'].includes(group.content)) {
        totalPositive += count;
      } else if (['THUMBS_DOWN', 'CONFUSED'].includes(group.content)) {
        totalNegative += count;
      }
    }
    
    const totalReactions = discussion.reactions?.totalCount || 0;
    
    // Calculate a 5-star rating based on reaction ratio
    let rating = null;
    if (totalReactions > 0) {
      const positiveRatio = totalPositive / (totalPositive + totalNegative || 1);
      rating = Math.round(positiveRatio * 5 * 10) / 10; // Round to 1 decimal
    }
    
    return {
      totalReactions,
      rating,
      reactions,
      discussionUrl: discussion.url
    };
    
  } catch (err) {
    Logger.debug(`Error fetching reactions for ${extensionId}: ${err.message}`);
    return defaultResult;
  }
}

/**
 * Batch fetch reactions for multiple extensions
 * @param {string[]} extensionIds - Array of extension IDs
 * @returns {Promise<Map<string, Object>>} Map of extension ID to reaction data
 */
async function fetchAllReactions(extensionIds) {
  const reactionsMap = new Map();
  
  if (!GITHUB_TOKEN) {
    Logger.info('GITHUB_TOKEN not set, skipping GitHub Discussions integration');
    return reactionsMap;
  }
  
  Logger.info(`Fetching reactions for ${extensionIds.length} extensions...`);
  
  // Process in batches to avoid rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < extensionIds.length; i += BATCH_SIZE) {
    const batch = extensionIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(id => fetchDiscussionReactions(id))
    );
    
    batch.forEach((id, index) => {
      reactionsMap.set(id, results[index]);
    });
    
    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < extensionIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const withReactions = Array.from(reactionsMap.values()).filter(r => r.totalReactions > 0).length;
  Logger.info(`Found reactions for ${withReactions} extensions`);
  
  return reactionsMap;
}

// =============================================================================
// File Utilities
// =============================================================================

/**
 * Get the size of a file in human-readable format
 * @param {string} filePath - Path to the file
 * @returns {Object} Object with bytes (number) and formatted (string)
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    let formatted;
    if (bytes < 1024) {
      formatted = `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      formatted = `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      formatted = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return { bytes, formatted };
  } catch {
    return { bytes: 0, formatted: 'Unknown' };
  }
}

/**
 * Get the last modified date of a file
 * @param {string} filePath - Path to the file
 * @returns {string} ISO 8601 date string
 */
function getFileModifiedDate(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Check if a required file exists in the extension directory
 * @param {string} extDir - Extension directory path
 * @param {string} filename - Filename to check
 * @returns {boolean} True if file exists
 */
function fileExists(extDir, filename) {
  return fs.existsSync(path.join(extDir, filename));
}

// =============================================================================
// Extension Type Mapping
// =============================================================================

/**
 * Get the folder name for an extension type
 * @param {string} type - Extension type from manifest
 * @returns {string} Folder name (pluralized)
 */
function getTypeFolderName(type) {
  const typeMap = {
    'agent': 'agents',
    'voice-agent': 'voice-agents',
    'prompt': 'prompts',
    'skill': 'skills',
    'mcp-server': 'mcp-servers'
  };
  return typeMap[type] || type + 's';
}

// =============================================================================
// Extension Scanning
// =============================================================================

/**
 * Scan a single extension directory and build catalog entry
 * @param {string} typeDir - Type directory path
 * @param {string} type - Extension type folder name
 * @param {string} extName - Extension folder name
 * @returns {Object|null} Catalog entry or null if invalid
 */
function scanExtension(typeDir, type, extName) {
  const extDir = path.join(typeDir, extName);
  const manifestPath = path.join(extDir, 'manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    Logger.warn(`No manifest.json in ${extDir}`);
    return null;
  }
  
  let manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(content);
  } catch (err) {
    Logger.error(`Failed to parse ${manifestPath}: ${err.message}`);
    return null;
  }
  
  // Validate against schema
  const validation = validateManifestSchema(manifest, manifestPath);
  if (!validation.valid) {
    Logger.error(`Invalid manifest ${manifestPath}:`);
    validation.errors.forEach(err => Logger.error(`  - ${err}`));
    return null;
  }
  
  // Validate required files exist
  const missingFiles = [];
  for (const file of manifest.files || []) {
    if (!fileExists(extDir, file.source)) {
      missingFiles.push(file.source);
    }
  }
  if (missingFiles.length > 0) {
    Logger.error(`Missing files in ${extDir}: ${missingFiles.join(', ')}`);
    return null;
  }
  
  // Check for README.md
  if (!fileExists(extDir, 'README.md')) {
    Logger.warn(`Missing README.md in ${extDir}`);
  }
  
  // Calculate total size of extension files
  let totalSizeBytes = 0;
  const files = (manifest.files || []).map(f => {
    const filePath = path.join(extDir, f.source);
    const sizeInfo = getFileSize(filePath);
    totalSizeBytes += sizeInfo.bytes;
    
    return {
      source: f.source,
      downloadUrl: `${RAW_BASE}/extensions/${type}/${extName}/${encodeURIComponent(f.source)}`,
      installPath: f.installPath,
      size: sizeInfo.formatted
    };
  });
  
  // Determine type folder for URLs
  const typeFolder = getTypeFolderName(manifest.type);
  
  // Build catalog entry
  const entry = {
    id: manifest.id,
    name: manifest.name,
    type: manifest.type,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    categories: manifest.categories || [],
    tags: manifest.tags || [],
    downloads: 0, // Will be populated from analytics if available
    rating: null, // Will be populated from GitHub Discussions
    ratingCount: 0,
    publishedAt: manifest.publishedAt || getFileModifiedDate(manifestPath),
    updatedAt: getFileModifiedDate(manifestPath),
    size: totalSizeBytes > 0 ? `${(totalSizeBytes / 1024).toFixed(1)} KB` : 'Unknown',
    sizeBytes: totalSizeBytes,
    minVaultCopilotVersion: manifest.minVaultCopilotVersion || '0.1.0',
    repository: manifest.repository || null,
    license: manifest.license || 'MIT',
    detailPageUrl: `${BASE_URL}/extensions/${typeFolder}/${extName}/`,
    discussionUrl: null, // Will be populated from GitHub Discussions
    files,
    tools: manifest.tools || [],
    permissions: manifest.permissions || [],
    dependencies: manifest.dependencies || [],
    preview: manifest.preview
      ? `${RAW_BASE}/extensions/${typeFolder}/${extName}/${encodeURIComponent(manifest.preview)}`
      : null,
    icon: fileExists(extDir, 'icon.svg')
      ? `${RAW_BASE}/extensions/${typeFolder}/${extName}/icon.svg`
      : null,
    featured: manifest.featured || false,
    versions: manifest.versions || [],
    submittedBy: manifest.submittedBy || null, // Track who submitted the extension
    _sourceDir: extDir, // Internal use only, removed before output
    _manifestPath: manifestPath
  };
  
  Logger.debug(`Scanned: ${manifest.id} (${manifest.type}) v${manifest.version}`);
  return entry;
}

/**
 * Scan all extension directories
 * @returns {Object} Object containing extensions array and metadata
 */
function scanExtensions() {
  const extensions = [];
  const errors = [];
  const warnings = [];
  
  Logger.info(`Scanning extensions in ${EXTENSIONS_DIR}...`);
  
  for (const type of EXTENSION_TYPES) {
    const typeDir = path.join(EXTENSIONS_DIR, type);
    
    if (!fs.existsSync(typeDir)) {
      Logger.debug(`Type directory not found: ${typeDir}`);
      continue;
    }
    
    let extensionDirs;
    try {
      extensionDirs = fs.readdirSync(typeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch (err) {
      Logger.error(`Failed to read ${typeDir}: ${err.message}`);
      errors.push(`Failed to read ${typeDir}`);
      continue;
    }
    
    Logger.debug(`Found ${extensionDirs.length} directories in ${type}/`);
    
    for (const extName of extensionDirs) {
      const entry = scanExtension(typeDir, type, extName);
      if (entry) {
        extensions.push(entry);
      } else {
        warnings.push(`Skipped ${type}/${extName}`);
      }
    }
  }
  
  // Check for duplicate IDs
  const idCounts = new Map();
  for (const ext of extensions) {
    const count = idCounts.get(ext.id) || 0;
    idCounts.set(ext.id, count + 1);
  }
  
  const duplicates = Array.from(idCounts.entries()).filter(([_, count]) => count > 1);
  if (duplicates.length > 0) {
    for (const [id, count] of duplicates) {
      Logger.error(`Duplicate extension ID "${id}" found ${count} times`);
      errors.push(`Duplicate ID: ${id}`);
    }
  }
  
  Logger.info(`Scanned ${extensions.length} valid extensions`);
  
  return { extensions, errors, warnings };
}

// =============================================================================
// Featured Selection
// =============================================================================

/**
 * Calculate a score for an extension to determine featured status
 * @param {Object} ext - Extension catalog entry
 * @returns {number} Score value (higher = more likely to be featured)
 */
function calculateFeaturedScore(ext) {
  let score = 0;
  
  // Explicitly marked as featured gets high priority
  if (ext.featured) {
    score += 100;
  }
  
  // Rating contribution (0-25 points)
  if (ext.rating) {
    score += ext.rating * 5; // Max 25 points for 5-star rating
  }
  
  // Reaction count contribution (0-20 points)
  if (ext.ratingCount > 0) {
    score += Math.min(ext.ratingCount, 20);
  }
  
  // Recent extensions get a small boost
  const publishedDate = new Date(ext.publishedAt);
  const daysSincePublish = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublish <= FEATURED_CONFIG.boostNewExtensionsDays) {
    score += 10 * (1 - daysSincePublish / FEATURED_CONFIG.boostNewExtensionsDays);
  }
  
  // Completeness bonuses
  if (ext.preview) score += 5;
  if (ext.repository) score += 3;
  if (ext.tools && ext.tools.length > 0) score += 2;
  if (ext.categories && ext.categories.length > 0) score += 2;
  
  return score;
}

/**
 * Select featured extensions based on scoring algorithm
 * @param {Array} extensions - All extensions
 * @returns {string[]} Array of featured extension IDs
 */
function selectFeaturedExtensions(extensions) {
  if (extensions.length === 0) {
    return [];
  }
  
  // Score all extensions
  const scored = extensions.map(ext => ({
    id: ext.id,
    score: calculateFeaturedScore(ext),
    rating: ext.rating
  }));
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Take top extensions that meet minimum criteria
  const featured = scored
    .filter(s => {
      // If explicitly marked featured, always include
      const ext = extensions.find(e => e.id === s.id);
      if (ext?.featured) return true;
      // Otherwise, check minimum rating if set
      if (FEATURED_CONFIG.minRating && s.rating !== null) {
        return s.rating >= FEATURED_CONFIG.minRating;
      }
      return true;
    })
    .slice(0, FEATURED_CONFIG.maxFeatured)
    .map(s => s.id);
  
  // If no extensions meet criteria, take the top few anyway
  if (featured.length === 0 && extensions.length > 0) {
    return scored.slice(0, Math.min(5, extensions.length)).map(s => s.id);
  }
  
  return featured;
}

// =============================================================================
// Main Build Function
// =============================================================================

/**
 * Main build function - orchestrates the catalog generation
 */
async function buildCatalog() {
  const startTime = Date.now();
  
  Logger.info('='.repeat(60));
  Logger.info('Building Extension Catalog');
  Logger.info('='.repeat(60));
  
  // Initialize schema validator
  initializeValidator();
  
  // Scan all extensions
  const { extensions, errors, warnings } = scanExtensions();
  
  if (extensions.length === 0) {
    Logger.warn('No valid extensions found');
  }
  
  // Fetch GitHub Discussions reactions
  const extensionIds = extensions.map(e => e.id);
  const reactionsMap = await fetchAllReactions(extensionIds);
  
  // Merge reaction data into extensions
  for (const ext of extensions) {
    const reactions = reactionsMap.get(ext.id);
    if (reactions) {
      ext.rating = reactions.rating;
      ext.ratingCount = reactions.totalReactions;
      ext.discussionUrl = reactions.discussionUrl;
    }
  }
  
  // Select featured extensions
  const featured = selectFeaturedExtensions(extensions);
  Logger.info(`Selected ${featured.length} featured extensions`);
  
  // Clean up internal fields from extensions
  const cleanedExtensions = extensions.map(ext => {
    const cleaned = { ...ext };
    delete cleaned._sourceDir;
    delete cleaned._manifestPath;
    return cleaned;
  });
  
  // Sort extensions alphabetically by name
  cleanedExtensions.sort((a, b) => a.name.localeCompare(b.name));
  
  // Build the catalog object
  const catalog = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    totalExtensions: cleanedExtensions.length,
    extensions: cleanedExtensions,
    categories: CATEGORIES,
    featured,
    stats: {
      byType: EXTENSION_TYPES.reduce((acc, type) => {
        const singularType = type.replace(/-/g, '-').replace(/s$/, '').replace('mcp-server', 'mcp-server');
        acc[type] = cleanedExtensions.filter(e => getTypeFolderName(e.type) === type).length;
        return acc;
      }, {}),
      byCategory: CATEGORIES.reduce((acc, cat) => {
        acc[cat] = cleanedExtensions.filter(e => e.categories.includes(cat)).length;
        return acc;
      }, {}),
      withRatings: cleanedExtensions.filter(e => e.rating !== null).length,
      averageRating: cleanedExtensions.filter(e => e.rating !== null).length > 0
        ? (cleanedExtensions.filter(e => e.rating !== null)
            .reduce((sum, e) => sum + e.rating, 0) /
            cleanedExtensions.filter(e => e.rating !== null).length).toFixed(1)
        : null
    }
  };
  
  // Ensure catalog directory exists
  const catalogDir = path.dirname(CATALOG_PATH);
  if (!fs.existsSync(catalogDir)) {
    fs.mkdirSync(catalogDir, { recursive: true });
    Logger.info(`Created catalog directory: ${catalogDir}`);
  }
  
  // Write catalog.json
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  
  // Build summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  Logger.info('='.repeat(60));
  Logger.success('Catalog Build Complete!');
  Logger.info('='.repeat(60));
  Logger.info(`Output: ${CATALOG_PATH}`);
  Logger.info(`Extensions: ${catalog.totalExtensions}`);
  Logger.info(`Featured: ${featured.length > 0 ? featured.join(', ') : 'none'}`);
  Logger.info(`Build time: ${duration}s`);
  
  // Log stats by type
  Logger.info('\nExtensions by type:');
  for (const [type, count] of Object.entries(catalog.stats.byType)) {
    if (count > 0) {
      Logger.info(`  ${type}: ${count}`);
    }
  }
  
  // Log warnings and errors
  if (warnings.length > 0) {
    Logger.info(`\nWarnings: ${warnings.length}`);
    warnings.forEach(w => Logger.warn(`  - ${w}`));
  }
  
  if (errors.length > 0) {
    Logger.error(`\nErrors: ${errors.length}`);
    errors.forEach(e => Logger.error(`  - ${e}`));
    process.exitCode = 1;
  }
  
  return catalog;
}

// =============================================================================
// Entry Point
// =============================================================================

// Run if executed directly
if (require.main === module) {
  buildCatalog().catch(err => {
    Logger.error(`Build failed: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}

// Export for testing
module.exports = {
  buildCatalog,
  scanExtensions,
  scanExtension,
  selectFeaturedExtensions,
  calculateFeaturedScore,
  fetchDiscussionReactions,
  validateManifestSchema,
  getFileSize,
  getFileModifiedDate,
  EXTENSION_TYPES,
  CATEGORIES
};
