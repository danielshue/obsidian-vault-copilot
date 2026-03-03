/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ContextProviderRegistry (Basic)
 * @description No-op context provider registry for Basic plugin.
 * 
 * Basic doesn't support custom context providers. Pro has the full implementation
 * that allows plugins to register context providers for message augmentation.
 * 
 * @since 0.1.0
 */

/** Context provider interface (for type compatibility) */
export interface ContextProvider {
	id: string;
	name: string;
	getContext(): string | undefined;
}

/** No-op registry */
class BasicContextProviderRegistry {
	register(_provider: ContextProvider): void {
		// No-op in Basic
	}

	unregister(_id: string): void {
		// No-op in Basic
	}

	gatherContext(): string[] {
		return [];
	}

	getAll(): ContextProvider[] {
		return [];
	}
}

/** Singleton instance */
let instance: BasicContextProviderRegistry | null = null;

/**
 * Get the context provider registry singleton.
 * In Basic, this returns a no-op implementation.
 */
export function getContextProviderRegistry(): BasicContextProviderRegistry {
	if (!instance) {
		instance = new BasicContextProviderRegistry();
	}
	return instance;
}
