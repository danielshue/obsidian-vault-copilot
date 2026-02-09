"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module deleteUserData
 * @description Azure Function that deletes all stored data for a user (GDPR erasure).
 *
 * **DELETE /api/user/{userHash}**
 *
 * @since 1.0.0
 */
const functions_1 = require("@azure/functions");
const TableStorageService_js_1 = require("../services/TableStorageService.js");
const validation_js_1 = require("../utils/validation.js");
/**
 * Handle DELETE /api/user/{userHash}.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 204 on success.
 */
async function deleteUserData(request, context) {
    context.log("Processing deleteUserData request");
    const userHash = request.params.userHash;
    const userHashResult = (0, validation_js_1.validateUserHash)(userHash);
    if (!userHashResult.valid) {
        return { status: 400, jsonBody: { error: userHashResult.error } };
    }
    try {
        const svc = TableStorageService_js_1.TableStorageService.getInstance();
        await svc.deleteUserData(userHash);
        return { status: 204 };
    }
    catch (err) {
        context.error("Error deleting user data:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}
functions_1.app.http("deleteUserData", {
    methods: ["DELETE"],
    authLevel: "anonymous",
    route: "user/{userHash}",
    handler: deleteUserData,
});
//# sourceMappingURL=deleteUserData.js.map