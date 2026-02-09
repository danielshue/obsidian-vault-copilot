/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module trackInstall
 * @description Azure Function that records a new extension installation.
 *
 * **POST /api/installs**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateExtensionId, validateUserHash, validateVersion, validatePlatform } from "../utils/validation.js";
import { checkRateLimit } from "../utils/rateLimiter.js";

/**
 * Handle POST /api/installs.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 201 on success.
 */
async function trackInstall(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Processing trackInstall request");

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }

    // Validate fields
    const extensionIdResult = validateExtensionId(body.extensionId);
    if (!extensionIdResult.valid) {
        return { status: 400, jsonBody: { error: extensionIdResult.error } };
    }

    const userHashResult = validateUserHash(body.userHash);
    if (!userHashResult.valid) {
        return { status: 400, jsonBody: { error: userHashResult.error } };
    }

    const versionResult = validateVersion(body.version);
    if (!versionResult.valid) {
        return { status: 400, jsonBody: { error: versionResult.error } };
    }

    const platformResult = validatePlatform(body.platform);
    if (!platformResult.valid) {
        return { status: 400, jsonBody: { error: platformResult.error } };
    }

    // Rate limit
    if (!checkRateLimit(body.userHash as string)) {
        return { status: 429, jsonBody: { error: "Rate limit exceeded. Please try again later." } };
    }

    try {
        const svc = TableStorageService.getInstance();
        await svc.trackInstall({
            extensionId: body.extensionId as string,
            userHash: body.userHash as string,
            version: body.version as string,
            platform: body.platform as string,
            vaultCopilotVersion: (body.vaultCopilotVersion as string) ?? "unknown",
        });

        return {
            status: 201,
            jsonBody: { message: "Install tracked successfully" },
        };
    } catch (err) {
        context.error("Error tracking install:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}

app.http("trackInstall", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "installs",
    handler: trackInstall,
});
