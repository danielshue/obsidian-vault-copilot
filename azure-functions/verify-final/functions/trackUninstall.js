"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module trackUninstall
 * @description Azure Function that marks an extension installation as inactive.
 *
 * **POST /api/uninstalls**
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
const TableStorageService_js_1 = require("../services/TableStorageService.js");
const validation_js_1 = require("../utils/validation.js");
const rateLimiter_js_1 = require("../utils/rateLimiter.js");
/**
 * Handle POST /api/uninstalls.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 200 on success.
 */
async function trackUninstall(request, context) {
    context.log("Processing trackUninstall request");
    let body;
    try {
        body = (await request.json());
    }
    catch {
        return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }
    const extensionIdResult = (0, validation_js_1.validateExtensionId)(body.extensionId);
    if (!extensionIdResult.valid) {
        return { status: 400, jsonBody: { error: extensionIdResult.error } };
    }
    const userHashResult = (0, validation_js_1.validateUserHash)(body.userHash);
    if (!userHashResult.valid) {
        return { status: 400, jsonBody: { error: userHashResult.error } };
    }
    if (!(0, rateLimiter_js_1.checkRateLimit)(body.userHash)) {
        return { status: 429, jsonBody: { error: "Rate limit exceeded. Please try again later." } };
    }
    try {
        const svc = TableStorageService_js_1.TableStorageService.getInstance();
        await svc.trackUninstall(body.extensionId, body.userHash);
        return {
            status: 200,
            jsonBody: { message: "Uninstall tracked successfully" },
        };
    }
    catch (err) {
        context.error("Error tracking uninstall:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}
functions_1.app.http("trackUninstall", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "uninstalls",
    handler: trackUninstall,
});
//# sourceMappingURL=trackUninstall.js.map