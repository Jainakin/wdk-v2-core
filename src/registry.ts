import type { ChainId } from '@aspect/wdk-v2-utils';
import { WalletManager } from './wallet-manager.js';

/**
 * ChainRegistry — stores WalletManager instances per chain.
 *
 * Updated from BaseWallet to WalletManager to support the full
 * production account lifecycle pattern.
 */
export class ChainRegistry {
  private modules: Map<ChainId, WalletManager> = new Map();

  register(module: WalletManager): void {
    this.modules.set(module.chainId, module);
  }

  getManager(chainId: ChainId): WalletManager {
    const mod = this.modules.get(chainId);
    if (!mod) throw new Error(`Chain module not registered: ${chainId}`);
    return mod;
  }

  /** Alias for backward compatibility */
  get(chainId: ChainId): WalletManager {
    return this.getManager(chainId);
  }

  has(chainId: ChainId): boolean {
    return this.modules.has(chainId);
  }

  getAll(): WalletManager[] {
    return Array.from(this.modules.values());
  }

  destroyAll(): void {
    for (const mod of this.modules.values()) {
      mod.destroy();
    }
    this.modules.clear();
  }
}
