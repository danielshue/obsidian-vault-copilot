"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module submitRating
 * @description Azure Function that creates or updates a user's rating for an extension.
 *
 * **POST /api/ratings**
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
const TableStorageService_js_1 = require("../services/TableStorageService.js");
const validation_js_1 = require("../utils/validation.js");
const rateLimiter_js_1 = require("../utils/rateLimiter.js");
/**
 * Handle POST /api/ratings.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with the updated aggregate rating.
 */
async function submitRating(request, context) {
    context.log("Processing submitRating request");
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
    const ratingResult = (0, validation_js_1.validateRating)(body.rating);
    if (!ratingResult.valid) {
        return { status: 400, jsonBody: { error: ratingResult.error } };
    }
    const versionResult = (0, validation_js_1.validateVersion)(body.version);
    if (!versionResult.valid) {
        return { status: 400, jsonBody: { error: versionResult.error } };
    }
    if (!(0, rateLimiter_js_1.checkRateLimit)(body.userHash)) {
        return { status: 429, jsonBody: { error: "Rate limit exceeded. Please try again later." } };
    }
    try {
        const svc = TableStorageService_js_1.TableStorageService.getInstance();
        const result = await svc.submitRating({
            extensionId: body.extensionId,
            userHash: body.userHash,
            rating: body.rating,
            comment: body.comment ?? undefined,
            version: body.version,
        });
        return {
            status: 200,
            jsonBody: {
                message: "Rating submitted successfully",
                averageRating: result.averageRating,
                ratingCount: result.ratingCount,
            },
        };
    }
    catch (err) {
        context.error("Error submitting rating:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}
functions_1.app.http("submitRating", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "ratings",
    handler: submitRating,
});
//# sourceMappingURL=submitRating.js.map