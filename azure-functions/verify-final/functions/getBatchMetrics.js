"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module getBatchMetrics
 * @description Azure Function that returns cached metrics for multiple extensions.
 *
 * **GET /api/metrics?ids=ext1,ext2,ext3**
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
const TableStorageService_js_1 = require("../services/TableStorageService.js");
const validation_js_1 = require("../utils/validation.js");
/** Maximum number of extensions that can be queried in one batch. */
const MAX_BATCH_SIZE = 50;
/**
 * Handle GET /api/metrics?ids=ext1,ext2.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} containing a map of metrics keyed by extension ID.
 */
async function getBatchMetrics(request, context) {
    context.log("Processing getBatchMetrics request");
    const idsParam = request.query.get("ids");
    if (!idsParam) {
        return { status: 400, jsonBody: { error: 'Query parameter "ids" is required (comma-separated extension IDs)' } };
    }
    const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
        return { status: 400, jsonBody: { error: "At least one extension ID is required" } };
    }
    if (ids.length > MAX_BATCH_SIZE) {
        return { status: 400, jsonBody: { error: `Maximum of ${MAX_BATCH_SIZE} extension IDs per request` } };
    }
    // Validate each ID
    for (const id of ids) {
        const result = (0, validation_js_1.validateExtensionId)(id);
        if (!result.valid) {
            return { status: 400, jsonBody: { error: `Invalid extension ID "${id}": ${result.error}` } };
        }
    }
    try {
        const svc = TableStorageService_js_1.TableStorageService.getInstance();
        const metrics = await svc.getBatchMetrics(ids);
        return {
            status: 200,
            jsonBody: metrics,
        };
    }
    catch (err) {
        context.error("Error getting batch metrics:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}
functions_1.app.http("getBatchMetrics", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "metrics",
    handler: getBatchMetrics,
});
//# sourceMappingURL=getBatchMetrics.js.map