/**
 * Cross-platform path utilities for Obsidian vault paths
 * 
 * Obsidian uses forward slashes internally regardless of platform.
 * These utilities ensure consistent path handling across Windows, Mac, and Linux.
 */

/**
 * Normalize a path for use with Obsidian's vault API.
 * - Converts backslashes to forward slashes (Windows compatibility)
 * - Removes trailing slashes
 * - Collapses multiple consecutive slashes
 * - Removes leading slashes (vault paths are relative)
 * - Trims whitespace
 * 
 * @param path - The path to normalize
 * @returns Normalized vault-relative path
 */
export function normalizeVaultPath(path: string): string {
	let normalized = path.trim();
	
	// Convert backslashes to forward slashes (Windows)
	normalized = normalized.replace(/\\/g, '/');
	
	// Remove trailing slashes
	normalized = normalized.replace(/\/+$/, '');
	
	// Collapse multiple consecutive slashes
	normalized = normalized.replace(/\/+/g, '/');
	
	// Remove leading slashes (vault paths are relative)
	normalized = normalized.replace(/^\/+/, '');
	
	return normalized;
}

/**
 * Ensure a path ends with .md extension
 * 
 * @param path - The path to check
 * @returns Path with .md extension
 */
export function ensureMarkdownExtension(path: string): string {
	const normalized = normalizeVaultPath(path);
	return normalized.endsWith('.md') ? normalized : `${normalized}.md`;
}

/**
 * Compare two vault paths for equality (case-insensitive on Windows/Mac)
 * Note: This is a simple comparison. For strict platform-aware comparison,
 * consider the actual platform.
 * 
 * @param path1 - First path
 * @param path2 - Second path
 * @returns True if paths are equivalent
 */
export function pathsEqual(path1: string, path2: string): boolean {
	const normalized1 = normalizeVaultPath(path1);
	const normalized2 = normalizeVaultPath(path2);
	
	// Use case-insensitive comparison for broader compatibility
	// (Windows and Mac are case-insensitive, Linux is case-sensitive)
	return normalized1.toLowerCase() === normalized2.toLowerCase();
}

/**
 * Convert an absolute system path to a vault-relative path
 * 
 * @param absolutePath - The absolute system path
 * @param vaultBasePath - The vault's base path (with forward slashes)
 * @returns Vault-relative path, or original path if not within vault
 */
export function toVaultRelativePath(absolutePath: string, vaultBasePath: string): string {
	let normalized = normalizeVaultPath(absolutePath);
	const normalizedBase = normalizeVaultPath(vaultBasePath);
	
	// Case-insensitive comparison for Windows/Mac compatibility
	if (normalized.toLowerCase().startsWith(normalizedBase.toLowerCase())) {
		normalized = normalized.slice(normalizedBase.length);
		// Remove leading slash after stripping base
		normalized = normalized.replace(/^\/+/, '');
	}
	
	return normalized;
}

/**
 * Check if a path represents the vault root
 * 
 * @param path - The path to check
 * @returns True if this represents the vault root
 */
export function isVaultRoot(path: string): boolean {
	const normalized = normalizeVaultPath(path);
	return normalized === '' || normalized === '.' || normalized === '/';
}
