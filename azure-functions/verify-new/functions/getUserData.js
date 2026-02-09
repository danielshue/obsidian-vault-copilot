"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module getUserData
 * @description Azure Function that returns all stored data for a specific user (GDPR access).
 *
 * **GET /api/user/{userHash}/data**
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
const TableStorageService_js_1 = require("../services/TableStorageService.js");
const validation_js_1 = require("../utils/validation.js");
/**
 * Handle GET /api/user/{userHash}/data.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} containing all user data.
 */
async function getUserData(request, context) {
    context.log("Processing getUserData request");
    const userHash = request.params.userHash;
    const userHashResult = (0, validation_js_1.validateUserHash)(userHash);
    if (!userHashResult.valid) {
        return { status: 400, jsonBody: { error: userHashResult.error } };
    }
    try {
        const svc = TableStorageService_js_1.TableStorageService.getInstance();
        const data = await svc.getUserData(userHash);
        return {
            status: 200,
            jsonBody: data,
        };
    }
    catch (err) {
        context.error("Error getting user data:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}
functions_1.app.http("getUserData", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "user/{userHash}/data",
    handler: getUserData,
});
//# sourceMappingURL=getUserData.js.map