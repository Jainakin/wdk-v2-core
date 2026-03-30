/**
 * bundle-entry.ts — The single entry point for the JS bundle loaded into QuickJS.
 *
 * Imports core + all chain modules, creates the engine singleton,
 * registers chain modules, and exposes the public API on globalThis.wdk.
 *
 * The C engine calls: wdk_engine_call(engine, "methodName", json_args)
 * which resolves to: globalThis.wdk.methodName(parsed_args)
 */

import { WDKEngine } from './engine.js';
import { BtcWalletManager } from '../../wdk-v2-wallet-btc/src/index.js';

declare const native: {
  crypto: {
    generateMnemonic(wordCount: number): string;
    mnemonicToSeed(mnemonic: string, passphrase?: string): number;
    deriveKey(seedHandle: number, path: string): number;
    getPublicKey(keyHandle: number, curve: string): Uint8Array;
    signSecp256k1(keyHandle: number, hash: Uint8Array): Uint8Array;
    signEd25519(keyHandle: number, message: Uint8Array): Uint8Array;
    aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array, iv: Uint8Array): Uint8Array;
    aesGcmDecrypt(key: Uint8Array, ciphertext: Uint8Array, iv: Uint8Array): Uint8Array;
    sha256(data: Uint8Array): Uint8Array;
    keccak256(data: Uint8Array): Uint8Array;
    ripemd160(data: Uint8Array): Uint8Array;
    releaseKey(handle: number): void;
  };
  encoding: {
    hexEncode(data: Uint8Array): string;
    hexDecode(hex: string): Uint8Array;
    bech32Encode(hrp: string, data: Uint8Array): string;
    bech32Decode(str: string): { hrp: string; data: Uint8Array };
    base58Encode(data: Uint8Array): string;
    base58Decode(str: string): Uint8Array;
    base58CheckEncode(data: Uint8Array): string;
    base58CheckDecode(str: string): Uint8Array;
    utf8Encode(str: string): Uint8Array;
    utf8Decode(bytes: Uint8Array): string;
  };
  net: {
    fetch(url: string, options?: any): Promise<{ status: number; headers: any; body: Uint8Array }>;
  };
  storage: {
    secure: { set(k: string, v: Uint8Array): void; get(k: string): Uint8Array | null; delete(k: string): void; has(k: string): boolean };
    regular: { set(k: string, v: string): void; get(k: string): string | null; delete(k: string): void };
  };
  platform: {
    os: string;
    version: string;
    getRandomBytes(n: number): Uint8Array;
    log(level: number, msg: string): void;
  };
};

// Create singleton engine
const engine = new WDKEngine();

// Register BTC chain module
const btcManager = new BtcWalletManager();
engine.registerChain(btcManager);

// Build the public API
const wdk = {
  // ── Lifecycle ──
  createWallet(params?: { wordCount?: number }) {
    return engine.createWallet(params);
  },

  unlockWallet(params: { mnemonic: string; passphrase?: string }) {
    return engine.unlockWallet(params);
  },

  lockWallet() {
    return engine.lockWallet();
  },

  destroyWallet() {
    return engine.destroyWallet();
  },

  getState() {
    return engine.getState();
  },

  // ── BTC-specific convenience functions ──
  /**
   * Derive a BTC SegWit address at the given index.
   * Requires the wallet to already be unlocked (state === 'ready').
   * Throws StateError if called before unlockWallet().
   */
  getBtcAddress(params: { index?: number }) {
    // Delegates to BtcWalletManager.getAccount(index).address via dispatch
    return engine.dispatch('getAddress', { chain: 'btc', index: params.index ?? 0 });
  },

  // ── Configuration ──
  /**
   * Update network configuration before unlockWallet().
   * Pass { isTestnet: true } to switch a chain to testnet.
   * Pass { chain: 'btc', isTestnet: true } to target a specific chain
   * (defaults to 'btc' if chain is omitted).
   */
  configure(params: {
    isTestnet?: boolean;
    chain?: string;
    network?: string;
    btcClient?: { type: string; url?: string };
  }) {
    const chain = (params.chain ?? 'btc') as import('@aspect/wdk-v2-utils').ChainId;
    const isTestnet = params.isTestnet ?? (params.network === 'testnet' || params.network === 'regtest');
    const network = params.network ?? (isTestnet ? 'testnet' : 'bitcoin');

    engine.configure({
      networks: {
        [chain]: {
          chainId: chain,
          networkId: isTestnet ? 'testnet' : 'mainnet',
          rpcUrl: '',
          isTestnet,
          network,
          btcClient: params.btcClient,
        },
      },
    });
    return {};
  },

  // ── Generic chain dispatch ──
  getAddress(params: Record<string, unknown>) {
    return engine.dispatch('getAddress', params);
  },

  getBalance(params: Record<string, unknown>) {
    return engine.dispatch('getBalance', params);
  },

  send(params: Record<string, unknown>) {
    return engine.dispatch('send', params);
  },

  getHistory(params: Record<string, unknown>) {
    return engine.dispatch('getHistory', params);
  },

  quoteSend(params: Record<string, unknown>) {
    return engine.dispatch('quoteSend', params);
  },

  getMaxSpendable(params: Record<string, unknown>) {
    return engine.dispatch('getMaxSpendable', params);
  },

  getReceipt(params: Record<string, unknown>) {
    return engine.dispatch('getReceipt', params);
  },

  getFeeRates(params: Record<string, unknown>) {
    return engine.dispatch('getFeeRates', params);
  },

  getTransfers(params: Record<string, unknown>) {
    return engine.dispatch('getTransfers', params);
  },

  signMessage(params: Record<string, unknown>) {
    return engine.dispatch('signMessage', params);
  },

  verifyMessage(params: Record<string, unknown>) {
    return engine.dispatch('verifyMessage', params);
  },

  // ── Account lifecycle (production parity) ──
  getAccount(params: Record<string, unknown>) {
    return engine.dispatch('getAccount', params);
  },

  getAccountByPath(params: Record<string, unknown>) {
    return engine.dispatch('getAccountByPath', params);
  },

  toReadOnlyAccount(params: Record<string, unknown>) {
    return engine.dispatch('toReadOnlyAccount', params);
  },

  disposeAccount(params: Record<string, unknown>) {
    return engine.dispatch('disposeAccount', params);
  },
};

// Register on globalThis
(globalThis as any).wdk = wdk;
