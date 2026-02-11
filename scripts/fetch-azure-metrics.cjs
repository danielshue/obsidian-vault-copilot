/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module scripts/fetch-azure-metrics
 * @description Fetches extension analytics metrics from the Azure Functions API
 * and merges them into catalog.json during the GitHub Actions catalog build.
 *
 * This script is run as part of the build-and-deploy workflow. It reads the
 * current catalog.json, fetches real-time metrics for all extension IDs from
 * the Azure analytics API, and writes the updated metrics back.
 *
 * @example
 * ```bash
 * AZURE_API_URL=https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api node scripts/fetch-azure-metrics.cjs
 * ```
 *
 * @since 0.1.0
 */

const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'catalog', 'catalog.json');
const AZURE_API_URL = process.env.AZURE_API_URL || 'https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io/api';

/**
 * Makes an HTTP GET request and returns the parsed JSON response.
 *
 * @param {string} url - The URL to fetch.
 * @returns {Promise<any>} Parsed JSON response.
 */
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, { timeout: 15000 }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`HTTP ${res.statusCode} from ${url}`));
                return;
            }
            
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
                }
            });
        }).on('error', reject)
          .on('timeout', () => reject(new Error(`Request timed out: ${url}`)));
    });
}

/**
 * Fetches batch metrics from the Azure analytics API.
 *
 * @param {string[]} extensionIds - Array of extension IDs to fetch metrics for.
 * @returns {Promise<Record<string, any>>} Map of extension ID to metrics.
 */
async function fetchBatchMetrics(extensionIds) {
    if (extensionIds.length === 0) return {};

    const ids = extensionIds.map(encodeURIComponent).join(',');
    const url = `${AZURE_API_URL}/metrics?ids=${ids}`;

    console.log(`  Fetching metrics from: ${url}`);

    try {
        const response = await fetchJson(url);
        return response || {};
    } catch (error) {
        console.warn(`  ⚠ Failed to fetch batch metrics: ${error.message}`);
        return {};
    }
}

/**
 * Main entry point. Reads catalog.json, fetches Azure metrics, and writes
 * the updated catalog back to disk.
 */
async function main() {
    console.log('🔄 Fetching extension metrics from Azure...');
    console.log(`  API URL: ${AZURE_API_URL}`);

    // Read current catalog
    let catalog;
    try {
        const raw = await fs.readFile(CATALOG_PATH, 'utf8');
        catalog = JSON.parse(raw);
    } catch (error) {
        console.error(`❌ Failed to read catalog.json: ${error.message}`);
        process.exit(1);
    }

    const extensions = catalog.extensions || [];
    if (extensions.length === 0) {
        console.log('  No extensions in catalog, skipping.');
        return;
    }

    const extensionIds = extensions.map((ext) => ext.id);
    console.log(`  Found ${extensionIds.length} extensions: ${extensionIds.join(', ')}`);

    // Fetch metrics from Azure (batch)
    const azureMetrics = await fetchBatchMetrics(extensionIds);
    const updatedCount = Object.keys(azureMetrics).length;

    // Merge metrics into catalog
    for (const extension of extensions) {
        const metrics = azureMetrics[extension.id];
        if (metrics) {
            extension.downloads = metrics.totalInstalls || extension.downloads || 0;
            extension.activeInstalls = metrics.activeInstalls || 0;
            extension.rating = metrics.averageRating || extension.rating || null;
            extension.ratingCount = metrics.ratingCount || extension.ratingCount || 0;
            extension.analyticsSource = 'azure';
            console.log(`  ✅ ${extension.id}: ${extension.downloads} installs, rating ${extension.rating || 'N/A'} (${extension.ratingCount} ratings)`);
        } else {
            console.log(`  ℹ ${extension.id}: No Azure metrics (keeping existing values)`);
        }
    }

    // Update lastUpdated timestamp
    catalog.lastUpdated = new Date().toISOString();

    // Write updated catalog
    await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
    console.log(`✅ Updated ${updatedCount}/${extensionIds.length} extensions with Azure metrics`);
}

main().catch((error) => {
    console.error('❌ fetch-azure-metrics failed:', error);
    // Don't fail the build if metrics fetch fails — catalog will use existing values
    process.exit(0);
});
