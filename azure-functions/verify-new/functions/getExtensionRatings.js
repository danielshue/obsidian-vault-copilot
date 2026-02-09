"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module getExtensionRatings
 * @description Azure Function that returns all ratings (with comments) for a
 * specific extension. Used by the GitHub Pages website to render the Feedback
 * section on extension detail pages.
 *
 * @example
 * ```
 * GET /api/ratings/{extensionId}
 * ```
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
const TableStorageService_js_1 = require("../services/TableStorageService.js");
/**
 * Handler for GET /api/ratings/{extensionId}.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns JSON array of rating objects.
 */
async function handler(request, context) {
    const extensionId = request.params.extensionId;
    if (!extensionId || extensionId.trim().length === 0) {
        return {
            status: 400,
            jsonBody: { error: "extensionId parameter is required" },
        };
    }
    try {
        const svc = TableStorageService_js_1.TableStorageService.getInstance();
        const ratings = await svc.getExtensionRatings(extensionId);
        return {
            status: 200,
            jsonBody: ratings,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=60",
            },
        };
    }
    catch (error) {
        context.error(`Failed to fetch ratings for ${extensionId}:`, error);
        return {
            status: 500,
            jsonBody: { error: "Internal server error" },
        };
    }
}
functions_1.app.http("getExtensionRatings", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "ratings/{extensionId}",
    handler,
});
//# sourceMappingURL=getExtensionRatings.js.map