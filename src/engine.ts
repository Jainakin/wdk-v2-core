import type { WalletState, ChainId, TxParams, KeyHandle } from '@aspect/wdk-v2-utils';
import { StateError, CryptoError } from '@aspect/wdk-v2-utils';
import { KeyManager } from './keys.js';
import { EventEmitter, WDKEvents } from './events.js';
import { ChainRegistry } from './registry.js';
import { type WDKConfig, DEFAULT_CONFIG, mergeConfig } from './config.js';
import { WalletManager } from './wallet-manager.js';

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
  async unlockWallet(params: { mnemonic: string; passphrase?: string }): Promise<{ seedHandle: number }> {
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

    // Initialize registered chain modules with their network configs.
    // Await each so transport connections (e.g. Electrum TCP) complete
    // before the engine enters 'ready' state.
    for (const wallet of this.registry.getAll()) {
      const networkKey = `${wallet.chainId}:${this.config.defaultNetwork}`;
      const networkConfig = this.config.networks[networkKey] || this.config.networks[wallet.chainId as string];
      if (networkConfig) {
        await wallet.initialize(networkConfig);
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

  registerChain(module: WalletManager): void {
    module.setKeyManager(this.keys);
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

    const manager = this.registry.getManager(chainId);

    switch (action) {
      // ── Account lifecycle ──────────────────────────────────────────────
      case 'getAccount': {
        const index = (params.index as number) ?? 0;
        const addressType = params.addressType as string | undefined;
        const account = manager.getAccount(index, addressType);
        return account.toInfo();
      }

      case 'getAccountByPath': {
        const path = params.path as string;
        if (!path) throw new StateError('Missing "path" parameter');
        const account = manager.getAccountByPath(path);
        return account.toInfo();
      }

      case 'toReadOnlyAccount': {
        const index = (params.index as number) ?? 0;
        const addressType = params.addressType as string | undefined;
        const account = manager.getAccount(index, addressType);
        const readOnly = account.toReadOnly();
        return readOnly.toInfo();
      }

      case 'disposeAccount': {
        const index = (params.index as number) ?? 0;
        const addressType = params.addressType as string | undefined;
        manager.disposeAccount(index, addressType);
        return {};
      }

      // ── Address ────────────────────────────────────────────────────────
      case 'getAddress': {
        const index = (params.index as number) ?? 0;
        const addressType = params.addressType as string | undefined;
        const account = manager.getAccount(index, addressType);
        return account.address;
      }

      // ── Balance + read-only ────────────────────────────────────────────
      case 'getBalance': {
        const index = (params.index as number) ?? 0;
        const addressType = params.addressType as string | undefined;
        // If address is provided, use it to find the right account
        // Otherwise derive from index
        const account = params.address
          ? manager.getReadOnlyAccount(params.address as string, index)
          : manager.getAccount(index, addressType);
        return account.getBalance();
      }

      case 'getHistory': {
        const index = (params.index as number) ?? 0;
        const account = params.address
          ? manager.getReadOnlyAccount(params.address as string, index)
          : manager.getAccount(index);
        const limit = params.limit as number | undefined;
        return account.getTransactionHistory(limit);
      }

      case 'getTransfers': {
        const index = (params.index as number) ?? 0;
        const account = params.address
          ? manager.getReadOnlyAccount(params.address as string, index)
          : manager.getAccount(index);
        return account.getTransfers({
          direction: params.direction as string | undefined,
          limit: params.limit as number | undefined,
          afterTxId: params.afterTxId as string | undefined,
          page: params.page as number | undefined,
        });
      }

      case 'quoteSend': {
        const index = (params.index as number) ?? 0;
        const account = params.address
          ? manager.getReadOnlyAccount(params.address as string, index)
          : manager.getAccount(index);
        const to = params.to as string;
        if (!to) throw new StateError('Missing "to" parameter');
        const amount = params.amount as string;
        if (!amount) throw new StateError('Missing "amount" parameter');
        return account.quoteSendTransaction({ to, amount });
      }

      case 'getMaxSpendable': {
        const index = (params.index as number) ?? 0;
        const account = params.address
          ? manager.getReadOnlyAccount(params.address as string, index)
          : manager.getAccount(index);
        return account.getMaxSpendable();
      }

      case 'getFeeRates': {
        // Fee rates are account-independent — use any account or manager-level
        const account = manager.getAccount(0);
        return account.getFeeRates();
      }

      case 'getReceipt': {
        const txHash = params.txHash as string;
        if (!txHash) throw new StateError('Missing "txHash" parameter');
        const account = manager.getAccount(0);
        return account.getTransactionReceipt(txHash);
      }

      // ── Signing ────────────────────────────────────────────────────────
      case 'send': {
        const sendIndex = (params.index as number) ?? 0;
        const sendAddressType = params.addressType as string | undefined;
        const account = manager.getAccount(sendIndex, sendAddressType);
        const to = params.to as string;
        if (!to) throw new StateError('Missing "to" parameter');
        const amount = params.amount as string;
        if (!amount) throw new StateError('Missing "amount" parameter');
        const result = await account.sendTransaction({
          to, amount,
          feeRate: params.feeRate as number | undefined,
        });
        this.events.emit(WDKEvents.TX_SENT, { chain: chainId, txHash: result.txHash });
        return result;
      }

      case 'signMessage': {
        const message = params.message as string;
        if (!message && message !== '') throw new StateError('Missing "message" parameter');
        const signIndex = (params.index as number) ?? 0;
        const signAddrType = params.addressType as string | undefined;
        const account = manager.getAccount(signIndex, signAddrType);
        return account.sign(message);
      }

      case 'verifyMessage': {
        const message = params.message as string;
        const signature = params.signature as string;
        const address = params.address as string;
        if (!message && message !== '') throw new StateError('Missing "message" parameter');
        if (!signature) throw new StateError('Missing "signature" parameter');
        if (!address) throw new StateError('Missing "address" parameter');
        const account = manager.getReadOnlyAccount(address);
        return account.verifyMessage(message, signature);
      }

      default:
        throw new StateError(`Unknown action: ${action}`);
    }
  }

  // ── Configuration ──

  /**
   * Merge a partial config into the engine's current config.
   * Call before unlockWallet() so chain modules are initialized with
   * the updated settings (e.g. switching to testnet).
   */
  configure(partial: Partial<WDKConfig>): void {
    this.config = mergeConfig(this.config, partial);
  }

  // ── Accessors ──

  getState(): WalletState {
    return this.state;
  }

  getConfig(): WDKConfig {
    return this.config;
  }

  getKeyManager(): KeyManager {
    return this.keys;
  }

  getEvents(): EventEmitter {
    return this.events;
  }
}
