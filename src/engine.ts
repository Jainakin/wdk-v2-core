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
        const addressType = params.addressType as string | undefined;
        const keyHandle = this.keys.deriveAndTrack(
          wallet.getDerivationPath(index, addressType)
        );
        return wallet.getAddress(keyHandle, index, addressType);
      }

      case 'getBalance': {
        const address = params.address as string;
        if (!address) throw new StateError('Missing "address" parameter');
        return wallet.getBalance(address);
      }

      case 'send': {
        // Pre-derive sender address — supports both BIP84 (default) and BIP44 (legacy)
        const sendIndex = (params.index as number) ?? 0;
        const sendAddressType = params.addressType as string | undefined;
        const senderKeyHandle = this.keys.deriveAndTrack(
          wallet.getDerivationPath(sendIndex, sendAddressType)
        );
        const senderAddress = await wallet.getAddress(senderKeyHandle, sendIndex, sendAddressType);
        const txParams: TxParams = {
          ...(params as unknown as TxParams),
          from: senderAddress,
        };
        const tx = await wallet.buildTransaction(txParams);
        const signed = await wallet.signTransaction(tx, senderKeyHandle);
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

      case 'quoteSend': {
        const from = params.from as string ?? params.address as string;
        if (!from) throw new StateError('Missing "from"/"address" parameter');
        const to = params.to as string;
        if (!to) throw new StateError('Missing "to" parameter');
        const amount = params.amount as string;
        if (!amount) throw new StateError('Missing "amount" parameter');
        return wallet.quoteSendTransaction({ from, to, amount });
      }

      case 'getMaxSpendable': {
        const address = params.address as string;
        if (!address) throw new StateError('Missing "address" parameter');
        return wallet.getMaxSpendable(address);
      }

      case 'getFeeRates': {
        return wallet.getFeeRates();
      }

      case 'getReceipt': {
        const txHash = params.txHash as string;
        if (!txHash) throw new StateError('Missing "txHash" parameter');
        return wallet.getTransactionReceipt(txHash);
      }

      case 'getTransfers': {
        const address = params.address as string;
        if (!address) throw new StateError('Missing "address" parameter');
        return wallet.getTransfers(address, {
          direction: params.direction as string | undefined,
          limit: params.limit as number | undefined,
          afterTxId: params.afterTxId as string | undefined,
          page: params.page as number | undefined,
        });
      }

      case 'signMessage': {
        const message = params.message as string;
        if (!message && message !== '') throw new StateError('Missing "message" parameter');
        const signIndex = (params.index as number) ?? 0;
        const signAddrType = params.addressType as string | undefined;
        const msgKeyHandle = this.keys.deriveAndTrack(
          wallet.getDerivationPath(signIndex, signAddrType)
        );
        return wallet.signMessage(msgKeyHandle, message);
      }

      case 'verifyMessage': {
        const message = params.message as string;
        const signature = params.signature as string;
        const address = params.address as string;
        if (!message && message !== '') throw new StateError('Missing "message" parameter');
        if (!signature) throw new StateError('Missing "signature" parameter');
        if (!address) throw new StateError('Missing "address" parameter');
        return wallet.verifyMessage(message, signature, address);
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
