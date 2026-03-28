import type { WalletState, ChainId, TxParams, KeyHandle } from '@aspect/wdk-v2-utils';
import { StateError, CryptoError } from '@aspect/wdk-v2-utils';
import { KeyManager } from './keys.js';
import { EventEmitter, WDKEvents } from './events.js';
import { ChainRegistry } from './registry.js';
import { type WDKConfig, DEFAULT_CONFIG, mergeConfig } from './config.js';
import { BaseWallet } from './wallet.js';

export class WDKEngine {
  private state: WalletState = 'locked';
  private keys: KeyManager = new KeyManager();
  private events: EventEmitter = new EventEmitter();
  private registry: ChainRegistry = new ChainRegistry();
  private config: WDKConfig;

  constructor(config?: Partial<WDKConfig>) {
    this.config = mergeConfig(DEFAULT_CONFIG, config || {});
  }

  // ── Lifecycle ──

  /** Generate a new wallet (12 or 24 word mnemonic) */
  createWallet(params?: { wordCount?: number }): { mnemonic: string } {
    if (this.state === 'destroyed') {
      throw new StateError('Wallet has been destroyed and cannot be reused');
    }
    const wordCount = params?.wordCount || 12;
    const mnemonic = native.crypto.generateMnemonic(wordCount);
    this.state = 'created';
    this.events.emit(WDKEvents.WALLET_CREATED);
    return { mnemonic };
  }

  /** Unlock wallet with mnemonic — derives seed and master key */
  unlockWallet(params: { mnemonic: string; passphrase?: string }): { seedHandle: number } {
    if (this.state === 'destroyed') {
      throw new StateError('Wallet has been destroyed and cannot be reused');
    }

    const words = params.mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      throw new CryptoError('Mnemonic must be 12 or 24 words');
    }

    const seedHandle = native.crypto.mnemonicToSeed(params.mnemonic, params.passphrase);
    this.keys.setSeedHandle(seedHandle);

    this.state = 'unlocked';
    this.events.emit(WDKEvents.WALLET_UNLOCKED);

    // Initialize registered chain modules with their network configs
    for (const wallet of this.registry.getAll()) {
      const networkKey = `${wallet.chainId}:${this.config.defaultNetwork}`;
      const networkConfig = this.config.networks[networkKey] || this.config.networks[wallet.chainId as string];
      if (networkConfig) {
        wallet.initialize(networkConfig);
      }
    }

    this.state = 'ready';
    return { seedHandle };
  }

  /** Lock wallet — releases all key handles */
  lockWallet(): void {
    if (this.state === 'destroyed') {
      throw new StateError('Wallet has been destroyed');
    }
    this.keys.releaseAll();
    this.state = 'locked';
    this.events.emit(WDKEvents.WALLET_LOCKED);
  }

  /** Destroy wallet — release keys, clear state, cannot be reused */
  destroyWallet(): void {
    this.keys.releaseAll();
    this.registry.destroyAll();
    this.events.emit(WDKEvents.WALLET_DESTROYED);
    this.events.removeAllListeners();
    this.state = 'destroyed';
  }

  // ── Chain Module Registration ──

  registerChain(module: BaseWallet): void {
    this.registry.register(module);
    this.events.emit(WDKEvents.CHAIN_REGISTERED, { chain: module.chainId });
  }

  // ── Dispatch ──

  /** Route API calls to the right chain module */
  async dispatch(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.state !== 'ready') {
      throw new StateError('Wallet not ready');
    }

    const chainId = params.chain as ChainId;
    if (!chainId) {
      throw new StateError('Missing "chain" parameter');
    }

    const wallet = this.registry.get(chainId);

    switch (action) {
      case 'getAddress': {
        const index = (params.index as number) ?? 0;
        const keyHandle = this.keys.deriveAndTrack(
          `m/44'/${wallet.coinType}'/0'/0/${index}`
        );
        return wallet.getAddress(keyHandle, index);
      }

      case 'getBalance': {
        const address = params.address as string;
        if (!address) throw new StateError('Missing "address" parameter');
        return wallet.getBalance(address);
      }

      case 'send': {
        const tx = await wallet.buildTransaction(params as unknown as TxParams);
        const keyHandle = this.keys.deriveAndTrack(
          `m/44'/${wallet.coinType}'/0'/0/0`
        );
        const signed = await wallet.signTransaction(tx, keyHandle);
        const txHash = await wallet.broadcastTransaction(signed);
        this.events.emit(WDKEvents.TX_SENT, { chain: chainId, txHash });
        return { txHash };
      }

      case 'getHistory': {
        const address = params.address as string;
        if (!address) throw new StateError('Missing "address" parameter');
        const limit = params.limit as number | undefined;
        return wallet.getTransactionHistory(address, limit);
      }

      default:
        throw new StateError(`Unknown action: ${action}`);
    }
  }

  // ── Accessors ──

  getState(): WalletState {
    return this.state;
  }

  getKeyManager(): KeyManager {
    return this.keys;
  }

  getEvents(): EventEmitter {
    return this.events;
  }
}
