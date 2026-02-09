"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module trackInstall
 * @description Azure Function that records a new extension installation.
 *
 * **POST /api/installs**
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
const TableStorageService_js_1 = require("../services/TableStorageService.js");
const validation_js_1 = require("../utils/validation.js");
const rateLimiter_js_1 = require("../utils/rateLimiter.js");
/**
 * Handle POST /api/installs.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 201 on success.
 */
async function trackInstall(request, context) {
    context.log("Processing trackInstall request");
    let body;
    try {
        body = (await request.json());
    }
    catch {
        return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }
    // Validate fields
    const extensionIdResult = (0, validation_js_1.validateExtensionId)(body.extensionId);
    if (!extensionIdResult.valid) {
        return { status: 400, jsonBody: { error: extensionIdResult.error } };
    }
    const userHashResult = (0, validation_js_1.validateUserHash)(body.userHash);
    if (!userHashResult.valid) {
        return { status: 400, jsonBody: { error: userHashResult.error } };
    }
    const versionResult = (0, validation_js_1.validateVersion)(body.version);
    if (!versionResult.valid) {
        return { status: 400, jsonBody: { error: versionResult.error } };
    }
    const platformResult = (0, validation_js_1.validatePlatform)(body.platform);
    if (!platformResult.valid) {
        return { status: 400, jsonBody: { error: platformResult.error } };
    }
    // Rate limit
    if (!(0, rateLimiter_js_1.checkRateLimit)(body.userHash)) {
        return { status: 429, jsonBody: { error: "Rate limit exceeded. Please try again later." } };
    }
    try {
        const svc = TableStorageService_js_1.TableStorageService.getInstance();
        await svc.trackInstall({
            extensionId: body.extensionId,
            userHash: body.userHash,
            version: body.version,
            platform: body.platform,
            vaultCopilotVersion: body.vaultCopilotVersion ?? "unknown",
        });
        return {
            status: 201,
            jsonBody: { message: "Install tracked successfully" },
        };
    }
    catch (err) {
        context.error("Error tracking install:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}
functions_1.app.http("trackInstall", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "installs",
    handler: trackInstall,
});
//# sourceMappingURL=trackInstall.js.map