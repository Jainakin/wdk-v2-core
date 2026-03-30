/**
 * WalletManager — base class for chain-specific wallet managers.
 *
 * Mirrors production tetherto/wdk-wallet WalletManager:
 *   - Owns seed reference (via KeyManager)
 *   - Creates and caches WalletAccount objects per derivation path
 *   - Manages account lifecycle (create → use → dispose)
 *   - Shared across all accounts for a chain
 *
 * Chain modules extend this (e.g. BtcWalletManager).
 */

import type { ChainId, CurveType, NetworkConfig } from '@aspect/wdk-v2-utils';
import type { KeyManager } from './keys.js';
import { WalletAccount, WalletAccountReadOnly } from './wallet-account.js';

export abstract class WalletManager {
  readonly chainId: ChainId;
  protected coinType: number;
  readonly curve: CurveType;
  protected config: NetworkConfig | null = null;
  protected keyManager: KeyManager | null = null;

  /** Cached accounts by derivation path */
  private accounts: Map<string, WalletAccount> = new Map();

  constructor(chainId: ChainId, coinType: number, curve: CurveType) {
    this.chainId = chainId;
    this.coinType = coinType;
    this.curve = curve;
  }

  /** Injected by WDKEngine during registerChain() */
  setKeyManager(km: KeyManager): void {
    this.keyManager = km;
  }

  /** Initialize with network config — connect client, set network params */
  abstract initialize(config: NetworkConfig): Promise<void>;

  /**
   * Return the BIP derivation path for a given address index.
   * Default: BIP-44 m/44'/coinType'/0'/0/index
   * Override in chain modules (e.g. BTC uses BIP-84 for P2WPKH).
   */
  getDerivationPath(index: number, _addressType?: string): string {
    return `m/44'/${this.coinType}'/0'/0/${index}`;
  }

  // ── Account lifecycle ──────────────────────────────────────────────────

  /**
   * Get or create an account at the given index.
   * Cached by derivation path — same index returns same account.
   */
  getAccount(index: number = 0, addressType?: string): WalletAccount {
    const path = this.getDerivationPath(index, addressType);
    return this.getAccountByPath(path, index, addressType);
  }

  /**
   * Get or create an account by explicit derivation path.
   * Production equivalent: WalletManagerBtc.getAccountByPath(path)
   */
  getAccountByPath(path: string, index?: number, addressType?: string): WalletAccount {
    // Return cached account if it exists and is not disposed
    const cached = this.accounts.get(path);
    if (cached && !cached.isDisposed) {
      return cached;
    }

    // Derive key and create new account
    if (!this.keyManager) {
      throw new Error('KeyManager not set — call setKeyManager() before getAccount()');
    }

    const keyHandle = this.keyManager.deriveAndTrack(path);
    const publicKey = native.crypto.getPublicKey(keyHandle, this.curve);

    // Extract index from path if not provided: last component of m/purpose'/coin'/account'/change/index
    const idx = index ?? parseInt(path.split('/').pop() ?? '0', 10);

    const account = this.createAccount(keyHandle, publicKey, idx, path, addressType);
    this.accounts.set(path, account);
    return account;
  }

  /** Get all currently cached (non-disposed) accounts */
  getCachedAccounts(): WalletAccount[] {
    return Array.from(this.accounts.values()).filter(a => !a.isDisposed);
  }

  /**
   * Create a read-only account for an address (no signing capabilities).
   * Does not require a key handle — just the address.
   */
  getReadOnlyAccount(address: string, index: number = 0): WalletAccountReadOnly {
    return this.createReadOnlyAccount(address, index);
  }

  // ── Template methods for chain modules ─────────────────────────────────

  /** Create a chain-specific account — implemented by subclass */
  protected abstract createAccount(
    keyHandle: number,
    publicKey: Uint8Array,
    index: number,
    path: string,
    addressType?: string,
  ): WalletAccount;

  /** Create a chain-specific read-only account — implemented by subclass */
  protected abstract createReadOnlyAccount(
    address: string,
    index: number,
  ): WalletAccountReadOnly;

  // ── Disposal ───────────────────────────────────────────────────────────

  /** Dispose a single account by index */
  disposeAccount(index: number = 0, addressType?: string): void {
    const path = this.getDerivationPath(index, addressType);
    const account = this.accounts.get(path);
    if (account) {
      account.dispose();
      // Release the key handle via KeyManager
      if (this.keyManager) {
        this.keyManager.release(account.keyHandle);
      }
      this.accounts.delete(path);
    }
  }

  /** Dispose all accounts and clean up manager resources */
  destroy(): void {
    // Dispose all cached accounts
    for (const [path, account] of this.accounts) {
      account.dispose();
      if (this.keyManager) {
        this.keyManager.release(account.keyHandle);
      }
    }
    this.accounts.clear();
    this.config = null;
  }
}
