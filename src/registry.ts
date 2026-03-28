import type { ChainId } from '@aspect/wdk-v2-utils';
import { BaseWallet } from './wallet.js';

export class ChainRegistry {
  private modules: Map<ChainId, BaseWallet> = new Map();

  register(module: BaseWallet): void {
    this.modules.set(module.chainId, module);
  }

  get(chainId: ChainId): BaseWallet {
    const mod = this.modules.get(chainId);
    if (!mod) throw new Error(`Chain module not registered: ${chainId}`);
    return mod;
  }

  has(chainId: ChainId): boolean {
    return this.modules.has(chainId);
  }

  getAll(): BaseWallet[] {
    return Array.from(this.modules.values());
  }

  destroyAll(): void {
    for (const mod of this.modules.values()) {
      mod.destroy();
    }
    this.modules.clear();
  }
}
