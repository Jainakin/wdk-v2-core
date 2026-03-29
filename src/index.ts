/**
 * wdk-v2-core public API.
 *
 * This file is the library entry point — it exports classes and types only.
 * It does NOT create engine singletons or assign globalThis.wdk.
 *
 * Singleton creation and globalThis.wdk assignment live exclusively in
 * bundle-entry.ts so the bundle has exactly ONE engine instance and ONE
 * globalThis.wdk = … assignment.
 */

export { WDKEngine } from './engine.js';
export { BaseWallet } from './wallet.js';
export { KeyManager } from './keys.js';
export { EventEmitter, WDKEvents } from './events.js';
export { ChainRegistry } from './registry.js';
export type { WDKConfig } from './config.js';
