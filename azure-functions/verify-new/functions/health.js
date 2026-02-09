"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module health
 * @description Azure Function that returns the service health status.
 *
 * **GET /api/health**
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
/**
 * Handle GET /api/health.
 *
 * Returns a simple JSON payload indicating the service is operational.
 *
 * @param _request - The incoming HTTP request (unused).
 * @param context  - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 200.
 */
async function health(_request, context) {
    context.log("Processing health check request");
    return {
        status: 200,
        jsonBody: {
            status: "healthy",
            service: "vault-copilot-analytics",
            timestamp: new Date().toISOString(),
            version: "1.0.0",
        },
    };
}
functions_1.app.http("health", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "health",
    handler: health,
});
//# sourceMappingURL=health.js.map