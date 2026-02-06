#!/usr/bin/env node
/**
 * Validation script for extension submissions
 * 
 * Features:
 * - JSON Schema validation using Ajv
 * - Security pattern detection
 * - Duplicate ID detection
 * - File size checks
 * - Required file validation
 * - Formatted validation reports
 * 
 * Usage:
 *   node validate-extension.js                    # Validate all extensions
 *   node validate-extension.js <extension-path>  # Validate single extension
 *   node validate-extension.js --pr              # PR mode with GitHub annotations
 *   node validate-extension.js --json            # Output as JSON
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const SCHEMA_PATH = path.join(__dirname, '..', 'schema', 'manifest.schema.json');
const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');
const CATALOG_PATH = path.join(__dirname, '..', 'catalog', 'catalog.json');

const EXTENSION_TYPES = ['agents', 'voice-agents', 'prompts', 'skills', 'mcp-servers'];

const VALID_CATEGORIES = [
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

// File size limits
const SIZE_LIMITS = {
  maxSingleFile: 500 * 1024,      // 500 KB per file
  maxTotalExtension: 2 * 1024 * 1024, // 2 MB total
  maxPreviewImage: 1 * 1024 * 1024,   // 1 MB for images
  warnSingleFile: 100 * 1024,     // Warn if file > 100 KB
};

// Security patterns to detect
// Note: Patterns are designed to catch real secrets while ignoring common placeholders
const SECURITY_PATTERNS = [
  { pattern: /eval\s*\(/gi, severity: 'error', name: 'eval() usage' },
  { pattern: /Function\s*\(/gi, severity: 'error', name: 'Function constructor' },
  { pattern: /new\s+Function/gi, severity: 'error', name: 'new Function()' },
  // API key pattern - exclude placeholders like <your-key>, YOUR_KEY, your-api-key-here
  { pattern: /(api[_-]?key|apikey)\s*[=:]\s*['"][^'"<>]{20,}['"]/gi, severity: 'error', name: 'API key' },
  // Password pattern - exclude placeholders
  { pattern: /(password|passwd|pwd)\s*[=:]\s*['"](?!<)[^'"<>]{8,}['"]/gi, severity: 'error', name: 'Password' },
  // Secret pattern - exclude env variable references and placeholders
  { pattern: /(secret|private_key)\s*[=:]\s*['"](?!\$\{)[^'"<>$]{10,}['"]/gi, severity: 'error', name: 'Secret/Private key' },
  // Access token - exclude placeholders
  { pattern: /\b(access_token|auth_token)\s*[=:]\s*['"](?!<)[^'"<>]{20,}['"]/gi, severity: 'error', name: 'Access token' },
  { pattern: /exec\s*\(/gi, severity: 'warning', name: 'exec() call' },
  { pattern: /child_process/gi, severity: 'warning', name: 'child_process module' },
  { pattern: /\brequire\s*\(['"]/gi, severity: 'warning', name: 'require() in markdown' },
  { pattern: /process\.env\./gi, severity: 'warning', name: 'Environment variable access' },
  { pattern: /<script[^>]*>/gi, severity: 'error', name: 'Script tag' },
  { pattern: /javascript:/gi, severity: 'error', name: 'javascript: protocol' },
  { pattern: /data:text\/html/gi, severity: 'error', name: 'data: HTML URI' },
  { pattern: /on(click|load|error|mouseover)\s*=/gi, severity: 'warning', name: 'Inline event handler' },
];

// Required files per extension type
const REQUIRED_FILES = {
  'agent': {
    required: ['manifest.json', 'README.md'],
    filePattern: /\.agent\.md$/
  },
  'voice-agent': {
    required: ['manifest.json', 'README.md'],
    filePattern: /\.voice-agent\.md$/
  },
  'prompt': {
    required: ['manifest.json', 'README.md'],
    filePattern: /\.prompt\.md$/
  },
  'skill': {
    required: ['manifest.json', 'README.md', 'skill.md'],
    filePattern: null
  },
  'mcp-server': {
    required: ['manifest.json', 'README.md', 'mcp-config.json'],
    filePattern: null
  }
};

// =============================================================================
// Validation Result Types
// =============================================================================

/**
 * @typedef {Object} ValidationIssue
 * @property {'error'|'warning'|'info'} severity
 * @property {string} message
 * @property {string} [file]
 * @property {number} [line]
 * @property {string} [code]
 */

/**
 * @typedef {Object} ExtensionValidationResult
 * @property {string} id
 * @property {string} path
 * @property {boolean} valid
 * @property {ValidationIssue[]} issues
 * @property {Object} [manifest]
 * @property {Object} [stats]
 */

/**
 * @typedef {Object} FullValidationResult
 * @property {boolean} valid
 * @property {number} totalExtensions
 * @property {number} validExtensions
 * @property {number} invalidExtensions
 * @property {ExtensionValidationResult[]} extensions
 * @property {ValidationIssue[]} globalIssues
 */

// =============================================================================
// Schema Validator
// =============================================================================

let schemaValidator = null;

/**
 * Initialize the JSON schema validator
 * @returns {Function|null}
 */
function initializeSchemaValidator() {
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');

    if (!fs.existsSync(SCHEMA_PATH)) {
      console.warn('[WARN] Schema file not found, using basic validation only');
      return null;
    }

    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    schemaValidator = ajv.compile(schema);
    return schemaValidator;
  } catch (err) {
    console.warn(`[WARN] Could not initialize schema validator: ${err.message}`);
    return null;
  }
}

/**
 * Validate manifest against JSON schema
 * @param {Object} manifest
 * @returns {ValidationIssue[]}
 */
function validateSchema(manifest) {
  const issues = [];

  if (!schemaValidator) {
    // Fallback to basic validation
    return validateManifestBasic(manifest);
  }

  const valid = schemaValidator(manifest);
  if (!valid) {
    for (const err of schemaValidator.errors) {
      issues.push({
        severity: 'error',
        message: `${err.instancePath || 'root'}: ${err.message}`,
        code: 'SCHEMA_VALIDATION',
        file: 'manifest.json'
      });
    }
  }

  return issues;
}

/**
 * Basic manifest validation (fallback when Ajv not available)
 * @param {Object} manifest
 * @returns {ValidationIssue[]}
 */
function validateManifestBasic(manifest) {
  const issues = [];

  // Required fields
  const required = ['id', 'name', 'version', 'type', 'description', 'author', 'files'];
  for (const field of required) {
    if (!manifest[field]) {
      issues.push({
        severity: 'error',
        message: `Missing required field: ${field}`,
        code: 'MISSING_FIELD',
        file: 'manifest.json'
      });
    }
  }

  // ID format
  if (manifest.id && !/^[a-z0-9-]+$/.test(manifest.id)) {
    issues.push({
      severity: 'error',
      message: `ID must be lowercase alphanumeric with hyphens: "${manifest.id}"`,
      code: 'INVALID_ID',
      file: 'manifest.json'
    });
  }

  // Version format
  if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    issues.push({
      severity: 'error',
      message: `Version must be semver format (x.y.z): "${manifest.version}"`,
      code: 'INVALID_VERSION',
      file: 'manifest.json'
    });
  }

  // Type validation
  const validTypes = ['agent', 'voice-agent', 'prompt', 'skill', 'mcp-server'];
  if (manifest.type && !validTypes.includes(manifest.type)) {
    issues.push({
      severity: 'error',
      message: `Invalid type: "${manifest.type}". Must be: ${validTypes.join(', ')}`,
      code: 'INVALID_TYPE',
      file: 'manifest.json'
    });
  }

  // Name length
  if (manifest.name && manifest.name.length > 50) {
    issues.push({
      severity: 'error',
      message: `Name exceeds 50 characters (${manifest.name.length})`,
      code: 'NAME_TOO_LONG',
      file: 'manifest.json'
    });
  }

  // Description length
  if (manifest.description && manifest.description.length > 200) {
    issues.push({
      severity: 'warning',
      message: `Description exceeds 200 characters (${manifest.description.length})`,
      code: 'DESCRIPTION_TOO_LONG',
      file: 'manifest.json'
    });
  }

  // Categories validation
  if (manifest.categories) {
    for (const cat of manifest.categories) {
      if (!VALID_CATEGORIES.includes(cat)) {
        issues.push({
          severity: 'warning',
          message: `Unknown category: "${cat}"`,
          code: 'UNKNOWN_CATEGORY',
          file: 'manifest.json'
        });
      }
    }
  }

  // Files validation
  if (manifest.files) {
    for (const file of manifest.files) {
      if (!file.source || !file.installPath) {
        issues.push({
          severity: 'error',
          message: 'File entry missing source or installPath',
          code: 'INVALID_FILE_ENTRY',
          file: 'manifest.json'
        });
      }
    }
  }

  // Author validation
  if (manifest.author && !manifest.author.name) {
    issues.push({
      severity: 'error',
      message: 'Author must have a name',
      code: 'MISSING_AUTHOR_NAME',
      file: 'manifest.json'
    });
  }

  return issues;
}

// =============================================================================
// File Validation
// =============================================================================

/**
 * Validate required files exist
 * @param {string} extDir
 * @param {Object} manifest
 * @returns {ValidationIssue[]}
 */
function validateRequiredFiles(extDir, manifest) {
  const issues = [];

  if (!manifest || !manifest.type) return issues;

  const typeConfig = REQUIRED_FILES[manifest.type];
  if (!typeConfig) return issues;

  // Check required files
  for (const file of typeConfig.required) {
    const filePath = path.join(extDir, file);
    if (!fs.existsSync(filePath)) {
      issues.push({
        severity: 'error',
        message: `Missing required file: ${file}`,
        code: 'MISSING_FILE',
        file
      });
    }
  }

  // Check for extension-specific file pattern
  if (typeConfig.filePattern) {
    const files = fs.readdirSync(extDir);
    const hasPatternFile = files.some(f => typeConfig.filePattern.test(f));
    if (!hasPatternFile) {
      issues.push({
        severity: 'error',
        message: `Missing extension file matching pattern: ${typeConfig.filePattern}`,
        code: 'MISSING_EXTENSION_FILE'
      });
    }
  }

  // Check declared files exist
  if (manifest.files) {
    for (const file of manifest.files) {
      const filePath = path.join(extDir, file.source);
      if (!fs.existsSync(filePath)) {
        issues.push({
          severity: 'error',
          message: `Declared file not found: ${file.source}`,
          code: 'MISSING_DECLARED_FILE',
          file: file.source
        });
      }
    }
  }

  // Check preview image if declared
  if (manifest.preview) {
    const previewPath = path.join(extDir, manifest.preview);
    if (!fs.existsSync(previewPath)) {
      issues.push({
        severity: 'warning',
        message: `Preview image not found: ${manifest.preview}`,
        code: 'MISSING_PREVIEW',
        file: manifest.preview
      });
    }
  } else {
    issues.push({
      severity: 'info',
      message: 'No preview image provided (recommended for better visibility)',
      code: 'NO_PREVIEW'
    });
  }

  return issues;
}

/**
 * Validate file sizes
 * @param {string} extDir
 * @param {Object} manifest
 * @returns {{issues: ValidationIssue[], stats: Object}}
 */
function validateFileSizes(extDir, manifest) {
  const issues = [];
  const stats = {
    totalSize: 0,
    fileCount: 0,
    files: []
  };

  const allFiles = [];

  // Get all files in the extension directory
  function scanDir(dir, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scanDir(fullPath, relativePath);
      } else {
        allFiles.push({ path: fullPath, name: relativePath });
      }
    }
  }

  try {
    scanDir(extDir);
  } catch (err) {
    issues.push({
      severity: 'error',
      message: `Failed to scan directory: ${err.message}`,
      code: 'SCAN_ERROR'
    });
    return { issues, stats };
  }

  for (const file of allFiles) {
    try {
      const fileStat = fs.statSync(file.path);
      const size = fileStat.size;

      stats.totalSize += size;
      stats.fileCount++;
      stats.files.push({ name: file.name, size });

      // Check individual file size
      if (size > SIZE_LIMITS.maxSingleFile) {
        issues.push({
          severity: 'error',
          message: `File too large: ${file.name} (${formatSize(size)} > ${formatSize(SIZE_LIMITS.maxSingleFile)})`,
          code: 'FILE_TOO_LARGE',
          file: file.name
        });
      } else if (size > SIZE_LIMITS.warnSingleFile) {
        issues.push({
          severity: 'warning',
          message: `Large file: ${file.name} (${formatSize(size)})`,
          code: 'LARGE_FILE',
          file: file.name
        });
      }

      // Check preview image size
      if (manifest?.preview && file.name === manifest.preview) {
        if (size > SIZE_LIMITS.maxPreviewImage) {
          issues.push({
            severity: 'error',
            message: `Preview image too large: ${formatSize(size)} > ${formatSize(SIZE_LIMITS.maxPreviewImage)}`,
            code: 'PREVIEW_TOO_LARGE',
            file: file.name
          });
        }
      }
    } catch (err) {
      issues.push({
        severity: 'warning',
        message: `Could not stat file: ${file.name}`,
        code: 'STAT_ERROR',
        file: file.name
      });
    }
  }

  // Check total extension size
  if (stats.totalSize > SIZE_LIMITS.maxTotalExtension) {
    issues.push({
      severity: 'error',
      message: `Extension too large: ${formatSize(stats.totalSize)} > ${formatSize(SIZE_LIMITS.maxTotalExtension)}`,
      code: 'EXTENSION_TOO_LARGE'
    });
  }

  return { issues, stats };
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// =============================================================================
// Security Validation
// =============================================================================

/**
 * Scan files for security issues
 * @param {string} extDir
 * @returns {ValidationIssue[]}
 */
function validateSecurity(extDir) {
  const issues = [];

  // File types to scan
  const scanExtensions = ['.md', '.json', '.js', '.ts', '.yaml', '.yml', '.txt'];

  let files;
  try {
    files = fs.readdirSync(extDir).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return scanExtensions.includes(ext);
    });
  } catch (err) {
    issues.push({
      severity: 'error',
      message: `Failed to read directory: ${err.message}`,
      code: 'READ_ERROR'
    });
    return issues;
  }

  for (const file of files) {
    const filePath = path.join(extDir, file);

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      issues.push({
        severity: 'warning',
        message: `Could not read file: ${file}`,
        code: 'READ_ERROR',
        file
      });
      continue;
    }

    // Check each security pattern
    for (const { pattern, severity, name } of SECURITY_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;

      const matches = content.match(pattern);
      if (matches) {
        // Find line number for first match
        const lines = content.split('\n');
        let lineNum = 1;
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            lineNum = i + 1;
            break;
          }
          pattern.lastIndex = 0;
        }

        issues.push({
          severity,
          message: `Security: ${name} detected in ${file}`,
          code: 'SECURITY_PATTERN',
          file,
          line: lineNum
        });
      }
    }
  }

  return issues;
}

// =============================================================================
// Duplicate Detection
// =============================================================================

/**
 * Check for duplicate extension IDs across the catalog
 * @param {string} extensionId
 * @param {string} extensionPath
 * @returns {ValidationIssue[]}
 */
function checkDuplicateId(extensionId, extensionPath) {
  const issues = [];

  // Check against existing catalog
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
      const existing = catalog.extensions?.find(e => e.id === extensionId);
      if (existing) {
        // Check if it's actually a different path (not an update)
        const existingPathPart = existing.detailPageUrl?.split('/extensions/')?.[1]?.replace(/\/$/, '');
        const currentPathPart = extensionPath.split('extensions')[1]?.replace(/^[\\/]/, '').replace(/[\\/]/g, '/');

        if (existingPathPart && currentPathPart && !currentPathPart.includes(extensionId)) {
          issues.push({
            severity: 'error',
            message: `Duplicate ID: "${extensionId}" already exists in catalog`,
            code: 'DUPLICATE_ID'
          });
        }
      }
    } catch (err) {
      // Catalog doesn't exist or is invalid, skip check
    }
  }

  // Scan all extensions for duplicates
  const extensionIds = new Map();

  for (const typeDir of EXTENSION_TYPES) {
    const typePath = path.join(EXTENSIONS_DIR, typeDir);
    if (!fs.existsSync(typePath)) continue;

    const extensions = fs.readdirSync(typePath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const extName of extensions) {
      const manifestPath = path.join(typePath, extName, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.id) {
          const existingPath = extensionIds.get(manifest.id);
          if (existingPath && existingPath !== extensionPath) {
            issues.push({
              severity: 'error',
              message: `Duplicate ID: "${manifest.id}" also exists in ${existingPath}`,
              code: 'DUPLICATE_ID'
            });
          } else {
            extensionIds.set(manifest.id, path.join(typePath, extName));
          }
        }
      } catch (err) {
        // Skip invalid manifests
      }
    }
  }

  return issues;
}

// =============================================================================
// Main Validation Function
// =============================================================================

/**
 * Validate a single extension
 * @param {string} extPath
 * @param {Object} options
 * @returns {ExtensionValidationResult}
 */
function validateExtension(extPath, options = {}) {
  const result = {
    id: null,
    path: extPath,
    valid: true,
    issues: [],
    manifest: null,
    stats: null
  };

  const manifestPath = path.join(extPath, 'manifest.json');

  // Check manifest exists
  if (!fs.existsSync(manifestPath)) {
    result.issues.push({
      severity: 'error',
      message: 'manifest.json not found',
      code: 'NO_MANIFEST'
    });
    result.valid = false;
    return result;
  }

  // Parse manifest
  let manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(content);
    result.manifest = manifest;
    result.id = manifest.id || path.basename(extPath);
  } catch (err) {
    result.issues.push({
      severity: 'error',
      message: `Failed to parse manifest.json: ${err.message}`,
      code: 'PARSE_ERROR',
      file: 'manifest.json'
    });
    result.valid = false;
    return result;
  }

  // Schema validation
  const schemaIssues = validateSchema(manifest);
  result.issues.push(...schemaIssues);

  // Required files validation
  const fileIssues = validateRequiredFiles(extPath, manifest);
  result.issues.push(...fileIssues);

  // File size validation
  const { issues: sizeIssues, stats } = validateFileSizes(extPath, manifest);
  result.issues.push(...sizeIssues);
  result.stats = stats;

  // Security validation
  const securityIssues = validateSecurity(extPath);
  result.issues.push(...securityIssues);

  // Duplicate ID check
  if (manifest.id && !options.skipDuplicateCheck) {
    const duplicateIssues = checkDuplicateId(manifest.id, extPath);
    result.issues.push(...duplicateIssues);
  }

  // Determine overall validity
  result.valid = !result.issues.some(i => i.severity === 'error');

  return result;
}

/**
 * Validate all extensions
 * @param {Object} options
 * @returns {FullValidationResult}
 */
function validateAllExtensions(options = {}) {
  const result = {
    valid: true,
    totalExtensions: 0,
    validExtensions: 0,
    invalidExtensions: 0,
    extensions: [],
    globalIssues: []
  };

  // Track all IDs for duplicate detection
  const allIds = new Map();

  for (const typeDir of EXTENSION_TYPES) {
    const typePath = path.join(EXTENSIONS_DIR, typeDir);

    if (!fs.existsSync(typePath)) {
      continue;
    }

    let extensions;
    try {
      extensions = fs.readdirSync(typePath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch (err) {
      result.globalIssues.push({
        severity: 'error',
        message: `Failed to read ${typeDir}: ${err.message}`,
        code: 'READ_ERROR'
      });
      continue;
    }

    for (const extName of extensions) {
      const extPath = path.join(typePath, extName);
      const extResult = validateExtension(extPath, { skipDuplicateCheck: true });

      result.extensions.push(extResult);
      result.totalExtensions++;

      if (extResult.valid) {
        result.validExtensions++;
      } else {
        result.invalidExtensions++;
      }

      // Track for duplicate detection
      if (extResult.id) {
        const existing = allIds.get(extResult.id);
        if (existing) {
          result.globalIssues.push({
            severity: 'error',
            message: `Duplicate ID "${extResult.id}": ${existing} and ${extPath}`,
            code: 'DUPLICATE_ID'
          });
        } else {
          allIds.set(extResult.id, extPath);
        }
      }
    }
  }

  // Overall validity
  result.valid = result.invalidExtensions === 0 && 
                 !result.globalIssues.some(i => i.severity === 'error');

  return result;
}

// =============================================================================
// Report Formatting
// =============================================================================

/**
 * Format validation result for console output
 * @param {ExtensionValidationResult} result
 */
function formatExtensionResult(result) {
  const relativePath = path.relative(process.cwd(), result.path);

  console.log('');
  console.log(`${'─'.repeat(60)}`);
  console.log(`📦 ${result.id || 'Unknown'}`);
  console.log(`   ${relativePath}`);
  console.log(`${'─'.repeat(60)}`);

  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const issue of errors) {
      const location = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})` : '';
      console.log(`   • ${issue.message}${location}`);
    }
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const issue of warnings) {
      const location = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})` : '';
      console.log(`   • ${issue.message}${location}`);
    }
  }

  if (infos.length > 0 && process.env.VERBOSE) {
    console.log('\nℹ️  Info:');
    for (const issue of infos) {
      console.log(`   • ${issue.message}`);
    }
  }

  if (result.stats) {
    console.log(`\n📊 Stats: ${result.stats.fileCount} files, ${formatSize(result.stats.totalSize)} total`);
  }

  console.log('');
  if (result.valid) {
    console.log('✅ PASSED');
  } else {
    console.log('❌ FAILED');
  }
}

/**
 * Format full validation result for console
 * @param {FullValidationResult} result
 */
function formatFullResult(result) {
  console.log('');
  console.log('═'.repeat(60));
  console.log('Extension Validation Report');
  console.log('═'.repeat(60));

  for (const ext of result.extensions) {
    formatExtensionResult(ext);
  }

  if (result.globalIssues.length > 0) {
    console.log('');
    console.log('─'.repeat(60));
    console.log('🌐 Global Issues');
    console.log('─'.repeat(60));
    for (const issue of result.globalIssues) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      console.log(`${icon} ${issue.message}`);
    }
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('Summary');
  console.log('═'.repeat(60));
  console.log(`Total:   ${result.totalExtensions}`);
  console.log(`Valid:   ${result.validExtensions} ✅`);
  console.log(`Invalid: ${result.invalidExtensions} ${result.invalidExtensions > 0 ? '❌' : ''}`);
  console.log('');

  if (result.valid) {
    console.log('✅ All extensions passed validation');
  } else {
    console.log('❌ Some extensions failed validation');
  }
  console.log('');
}

/**
 * Format for GitHub Actions annotations
 * @param {FullValidationResult} result
 */
function formatGitHubAnnotations(result) {
  for (const ext of result.extensions) {
    for (const issue of ext.issues) {
      if (issue.severity === 'info') continue;

      const file = issue.file 
        ? path.relative(process.cwd(), path.join(ext.path, issue.file))
        : path.relative(process.cwd(), path.join(ext.path, 'manifest.json'));

      const type = issue.severity === 'error' ? 'error' : 'warning';
      const line = issue.line || 1;

      console.log(`::${type} file=${file},line=${line}::${issue.message}`);
    }
  }

  for (const issue of result.globalIssues) {
    const type = issue.severity === 'error' ? 'error' : 'warning';
    console.log(`::${type}::${issue.message}`);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

function main() {
  const args = process.argv.slice(2);

  const options = {
    prMode: args.includes('--pr') || args.includes('--github'),
    jsonMode: args.includes('--json'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h')
  };

  if (options.verbose) {
    process.env.VERBOSE = 'true';
  }

  if (options.help) {
    console.log(`
Extension Validation Script

Usage:
  node validate-extension.js                    Validate all extensions
  node validate-extension.js <path>             Validate single extension
  node validate-extension.js --pr               Output GitHub Actions annotations
  node validate-extension.js --json             Output JSON report
  node validate-extension.js -v, --verbose      Include info messages

Options:
  --pr, --github    Format output for GitHub Actions
  --json            Output results as JSON
  -v, --verbose     Show info-level messages
  -h, --help        Show this help
    `);
    process.exit(0);
  }

  // Initialize schema validator
  initializeSchemaValidator();

  // Get extension path from args (excluding flags)
  const extPath = args.find(a => !a.startsWith('-'));

  let result;

  if (extPath) {
    // Validate single extension
    const resolvedPath = path.resolve(extPath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: Path not found: ${resolvedPath}`);
      process.exit(1);
    }

    const extResult = validateExtension(resolvedPath);
    result = {
      valid: extResult.valid,
      totalExtensions: 1,
      validExtensions: extResult.valid ? 1 : 0,
      invalidExtensions: extResult.valid ? 0 : 1,
      extensions: [extResult],
      globalIssues: []
    };
  } else {
    // Validate all extensions
    result = validateAllExtensions(options);
  }

  // Output results
  if (options.jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.prMode) {
    formatGitHubAnnotations(result);
    if (!result.valid) {
      console.log('');
      console.log(`::error::${result.invalidExtensions} extension(s) failed validation`);
    }
  } else {
    formatFullResult(result);
  }

  process.exit(result.valid ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  validateExtension,
  validateAllExtensions,
  validateSchema,
  validateSecurity,
  validateFileSizes,
  validateRequiredFiles,
  checkDuplicateId,
  initializeSchemaValidator,
  VALID_CATEGORIES,
  SECURITY_PATTERNS,
  SIZE_LIMITS
};
