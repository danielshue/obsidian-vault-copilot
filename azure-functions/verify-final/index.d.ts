/**
 * @module index
 * @description Entry point for Azure Functions that registers all HTTP triggers.
 *
 * This file imports all function modules to ensure they register with the @azure/functions app instance.
 *
 * @since 1.0.0
 */
import "./functions/health";
import "./functions/getExtensionRatings";
import "./functions/submitRating";
import "./functions/getMetrics";
import "./functions/getBatchMetrics";
import "./functions/trackInstall";
import "./functions/trackUninstall";
import "./functions/getUserData";
import "./functions/deleteUserData";
//# sourceMappingURL=index.d.ts.map