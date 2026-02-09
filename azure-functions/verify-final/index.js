"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module index
 * @description Entry point for Azure Functions that registers all HTTP triggers.
 *
 * This file imports all function modules to ensure they register with the @azure/functions app instance.
 *
 * @since 1.0.0
 */
// Import all functions to register them with the app
require("./functions/health");
require("./functions/getExtensionRatings");
require("./functions/submitRating");
require("./functions/getMetrics");
require("./functions/getBatchMetrics");
require("./functions/trackInstall");
require("./functions/trackUninstall");
require("./functions/getUserData");
require("./functions/deleteUserData");
//# sourceMappingURL=index.js.map