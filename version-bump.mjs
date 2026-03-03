/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VersionBump
 * @description Synchronizes release version metadata across plugin manifests.
 *
 * Run via `npm version <major|minor|patch>` — npm sets `npm_package_version`
 * before invoking this script through the package.json `"version"` hook.
 *
 * Updates:
 * - manifest.json → `version`
 * - versions.json → adds new entry mapping version → minAppVersion
 *
 * @since 0.1.0
 */

import { readFileSync, writeFileSync } from "fs";

/**
 * Reads and parses JSON from disk.
 * @param {string} filePath - Path to the JSON file.
 * @returns {any} Parsed JSON object.
 */
function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, "utf8"));
}

/**
 * Serializes an object as pretty-printed JSON.
 * @param {string} filePath - Path to the output JSON file.
 * @param {any} data - JSON-serializable object.
 */
function writeJson(filePath, data) {
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
    throw new Error("npm_package_version is required to run version-bump.mjs");
}

const manifest = readJson("manifest.json");
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeJson("manifest.json", manifest);

const versions = readJson("versions.json");
if (!Object.prototype.hasOwnProperty.call(versions, targetVersion)) {
    versions[targetVersion] = minAppVersion;
    writeJson("versions.json", versions);
}
