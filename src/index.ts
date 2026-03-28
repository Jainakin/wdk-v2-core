import { WDKEngine } from './engine.js';
import { BaseWallet } from './wallet.js';

// Create a singleton engine instance
const engine = new WDKEngine();

// Expose public API on globalThis.wdk
// The C engine calls: wdk_engine_call(engine, "createWallet", json_args)
// Which translates to: globalThis.wdk.createWallet(parsed_args)
const wdk = {
  // Lifecycle
  createWallet: (params?: { wordCount?: number }) => engine.createWallet(params),
  unlockWallet: (params: { mnemonic: string; passphrase?: string }) => engine.unlockWallet(params),
  lockWallet: () => engine.lockWallet(),
  destroyWallet: () => engine.destroyWallet(),
  getState: () => engine.getState(),

  // Chain operations (dispatched to registered chain modules)
  getAddress: (params: Record<string, unknown>) => engine.dispatch('getAddress', params),
  getBalance: (params: Record<string, unknown>) => engine.dispatch('getBalance', params),
  send: (params: Record<string, unknown>) => engine.dispatch('send', params),
  getHistory: (params: Record<string, unknown>) => engine.dispatch('getHistory', params),

  // Chain registration (called during setup)
  registerChain: (module: BaseWallet) => engine.registerChain(module),

  // Events
  on: (event: string, callback: (...args: any[]) => void) => engine.getEvents().on(event, callback),
  off: (event: string, callback: (...args: any[]) => void) => engine.getEvents().off(event, callback),
};

// Make it available to the C engine
(globalThis as any).wdk = wdk;

// Also export for module bundling
export { WDKEngine } from './engine.js';
export { BaseWallet } from './wallet.js';
export { KeyManager } from './keys.js';
export { EventEmitter, WDKEvents } from './events.js';
export { ChainRegistry } from './registry.js';
export type { WDKConfig } from './config.js';
