/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module deleteUserData
 * @description Azure Function that deletes all stored data for a user (GDPR erasure).
 *
 * **DELETE /api/user/{userHash}**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateUserHash } from "../utils/validation.js";

/**
 * Handle DELETE /api/user/{userHash}.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 204 on success.
 */
async function deleteUserData(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Processing deleteUserData request");

    const userHash = request.params.userHash;

    const userHashResult = validateUserHash(userHash);
    if (!userHashResult.valid) {
        return { status: 400, jsonBody: { error: userHashResult.error } };
    }

    try {
        const svc = TableStorageService.getInstance();
        await svc.deleteUserData(userHash as string);

        return { status: 204 };
    } catch (err) {
        context.error("Error deleting user data:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}

app.http("deleteUserData", {
    methods: ["DELETE"],
    authLevel: "anonymous",
    route: "user/{userHash}",
    handler: deleteUserData,
});
