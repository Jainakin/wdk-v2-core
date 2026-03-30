/**
 * WalletAccountReadOnly + WalletAccount — base account classes.
 *
 * Mirrors production tetherto/wdk-wallet:
 *   WalletAccountReadOnly — balance, history, verification (no signing)
 *   WalletAccount — extends read-only with signing capabilities
 *
 * Chain modules extend these (e.g. BtcAccount, BtcAccountReadOnly).
 */

import type { ChainId, KeyHandle, TxRecord } from '@aspect/wdk-v2-utils';

// ── Read-Only Account ────────────────────────────────────────────────────────

/**
 * Read-only wallet account — can query chain data but cannot sign/send.
 * Safe to pass to untrusted code.
 */
export abstract class WalletAccountReadOnly {
  readonly chainId: ChainId;
  readonly address: string;
  readonly index: number;
  readonly path: string;

  constructor(chainId: ChainId, address: string, index: number, path: string) {
    this.chainId = chainId;
    this.address = address;
    this.index = index;
    this.path = path;
  }

  abstract getBalance(): Promise<string>;
  abstract getTransactionHistory(limit?: number): Promise<TxRecord[]>;
  abstract getTransfers(query?: Record<string, unknown>): Promise<unknown>;
  abstract quoteSendTransaction(params: { to: string; amount: string }): Promise<unknown>;
  abstract getMaxSpendable(): Promise<unknown>;
  abstract getFeeRates(): Promise<Record<string, number>>;
  abstract getTransactionReceipt(txHash: string): Promise<unknown>;
  abstract verifyMessage(message: string, signature: string): Promise<boolean>;

  /** Serialize to a plain object for dispatch return */
  toInfo(): { chainId: ChainId; address: string; index: number; path: string } {
    return {
      chainId: this.chainId,
      address: this.address,
      index: this.index,
      path: this.path,
    };
  }
}

// ── Signing Account ──────────────────────────────────────────────────────────

/**
 * Full wallet account with signing capabilities.
 * Extends read-only with sendTransaction + sign.
 *
 * keyHandle is an opaque integer pointing into the C key store.
 * privateKey is NEVER exposed to JS — keyPair.privateKey returns null.
 */
export abstract class WalletAccount extends WalletAccountReadOnly {
  readonly keyHandle: KeyHandle;
  readonly publicKey: Uint8Array;
  private _disposed = false;

  constructor(
    chainId: ChainId,
    address: string,
    index: number,
    path: string,
    keyHandle: KeyHandle,
    publicKey: Uint8Array,
  ) {
    super(chainId, address, index, path);
    this.keyHandle = keyHandle;
    this.publicKey = publicKey;
  }

  /**
   * Production-compatible keyPair property.
   * publicKey is the compressed secp256k1 key (33 bytes).
   * privateKey is ALWAYS null — key material stays in C key store.
   */
  get keyPair(): { publicKey: Uint8Array; privateKey: null } {
    return { publicKey: this.publicKey, privateKey: null };
  }

  /** Check if this account has been disposed */
  get isDisposed(): boolean {
    return this._disposed;
  }

  /** Send a transaction — build, sign, broadcast */
  abstract sendTransaction(params: {
    to: string;
    amount: string;
    feeRate?: number;
  }): Promise<{ txHash: string; fee: number }>;

  /** Sign a message using Bitcoin Signed Message format */
  abstract sign(message: string): Promise<string>;

  /**
   * Downcast to a read-only view — strips signing capabilities.
   * The returned object shares the same address but has no keyHandle.
   */
  abstract toReadOnly(): WalletAccountReadOnly;

  /**
   * Mark this account as disposed.
   * The key handle release is managed by WalletManager (which owns KeyManager).
   */
  dispose(): void {
    this._disposed = true;
  }

  /** Serialize to a plain object including publicKey */
  override toInfo(): {
    chainId: ChainId;
    address: string;
    index: number;
    path: string;
    publicKey: string;
  } {
    return {
      ...super.toInfo(),
      publicKey: native.encoding.hexEncode(this.publicKey),
    };
  }
}
