"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module getMetrics
 * @description Azure Function that returns cached metrics for a single extension.
 *
 * **GET /api/metrics/{extensionId}**
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
const TableStorageService_js_1 = require("../services/TableStorageService.js");
const validation_js_1 = require("../utils/validation.js");
/**
 * Handle GET /api/metrics/{extensionId}.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} containing the extension metrics.
 */
async function getMetrics(request, context) {
    context.log("Processing getMetrics request");
    const extensionId = request.params.extensionId;
    const extensionIdResult = (0, validation_js_1.validateExtensionId)(extensionId);
    if (!extensionIdResult.valid) {
        return { status: 400, jsonBody: { error: extensionIdResult.error } };
    }
    try {
        const svc = TableStorageService_js_1.TableStorageService.getInstance();
        const metrics = await svc.getMetrics(extensionId);
        return {
            status: 200,
            jsonBody: metrics,
        };
    }
    catch (err) {
        context.error("Error getting metrics:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}
functions_1.app.http("getMetrics", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "metrics/{extensionId}",
    handler: getMetrics,
});
//# sourceMappingURL=getMetrics.js.map