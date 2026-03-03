/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AIProvider (Basic re-export)
 * @description Re-exports AIProvider from the Pro tree.
 * The Basic plugin uses AIProvider only for return-type annotations.
 * @internal
 */

// Re-export from the Pro tree for type compatibility
export type { AIProvider, AIProviderType } from "../../../../src/copilot/providers/AIProvider";
