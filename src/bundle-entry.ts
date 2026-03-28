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
import { BitcoinWallet } from '../../wdk-v2-wallet-btc/src/index.js';

declare const native: {
  crypto: {
    generateMnemonic(wordCount: number): string;
    mnemonicToSeed(mnemonic: string, passphrase?: string): number;
    deriveKey(seedHandle: number, path: string): number;
    getPublicKey(keyHandle: number, curve: string): Uint8Array;
    signSecp256k1(keyHandle: number, hash: Uint8Array): Uint8Array;
    signEd25519(keyHandle: number, message: Uint8Array): Uint8Array;
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
  };
  net: {
    fetch(url: string, options?: any): Promise<{ status: number; headers: any; body: string }>;
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
const btcWallet = new BitcoinWallet();
engine.registerChain(btcWallet);

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
  getBtcAddress(params: { mnemonic: string; index?: number }) {
    // Unlock if needed
    if (engine.getState() !== 'ready') {
      engine.unlockWallet({ mnemonic: params.mnemonic });
    }

    const index = params.index ?? 0;
    const keyHandle = engine.getKeyManager().deriveAndTrack(
      `m/84'/0'/0'/0/${index}`
    );

    // Get compressed public key
    const pubkey = native.crypto.getPublicKey(keyHandle, 'secp256k1');

    // Hash160: SHA256 then RIPEMD160
    const sha = native.crypto.sha256(pubkey);
    const hash160 = native.crypto.ripemd160(sha);

    // Convert to 5-bit groups for bech32
    const fiveBit = convertBits(hash160, 8, 5, true);
    if (!fiveBit) return { error: 'bit conversion failed' };

    // Witness version 0 + 5-bit program
    const witnessProgram = new Uint8Array(1 + fiveBit.length);
    witnessProgram[0] = 0; // witness version 0
    witnessProgram.set(fiveBit, 1);

    const address = native.encoding.bech32Encode('bc', witnessProgram);
    return { address };
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
};

// BIP-173 bit conversion helper (8-bit to 5-bit)
function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): Uint8Array | null {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value < 0 || (value >> fromBits) !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    return null;
  }

  return new Uint8Array(ret);
}

// Register on globalThis
(globalThis as any).wdk = wdk;
