/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module getUserData
 * @description Azure Function that returns all stored data for a specific user (GDPR access).
 *
 * **GET /api/user/{userHash}/data**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateUserHash } from "../utils/validation.js";

/**
 * Handle GET /api/user/{userHash}/data.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} containing all user data.
 */
async function getUserData(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Processing getUserData request");

    const userHash = request.params.userHash;

    const userHashResult = validateUserHash(userHash);
    if (!userHashResult.valid) {
        return { status: 400, jsonBody: { error: userHashResult.error } };
    }

    try {
        const svc = TableStorageService.getInstance();
        const data = await svc.getUserData(userHash as string);

        return {
            status: 200,
            jsonBody: data,
        };
    } catch (err) {
        context.error("Error getting user data:", err);
        return { status: 500, jsonBody: { error: "Internal server error" } };
    }
}

app.http("getUserData", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "user/{userHash}/data",
    handler: getUserData,
});
