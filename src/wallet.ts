import type {
  ChainId,
  CurveType,
  KeyHandle,
  TxParams,
  UnsignedTx,
  SignedTx,
  TxRecord,
  NetworkConfig,
} from '@aspect/wdk-v2-utils';

export abstract class BaseWallet {
  readonly chainId: ChainId;
  protected coinType: number;
  readonly curve: CurveType;
  protected config: NetworkConfig | null = null;

  constructor(chainId: ChainId, coinType: number, curve: CurveType) {
    this.chainId = chainId;
    this.coinType = coinType;
    this.curve = curve;
  }

  /** Initialize with network config */
  async initialize(config: NetworkConfig): Promise<void> {
    this.config = config;
  }

  /**
   * Return the BIP derivation path for a given address index.
   * Override in chain modules that use a non-BIP-44 standard.
   * e.g. Bitcoin SegWit uses BIP-84: m/84'/coinType'/0'/0/index
   */
  getDerivationPath(index: number): string {
    return `m/44'/${this.coinType}'/0'/0/${index}`;
  }

  /** Get address for a derived key at account/index */
  abstract getAddress(keyHandle: KeyHandle, index: number): Promise<string>;

  /** Get balance for an address */
  abstract getBalance(address: string): Promise<string>;

  /** Build an unsigned transaction */
  abstract buildTransaction(params: TxParams): Promise<UnsignedTx>;

  /** Sign a transaction */
  abstract signTransaction(tx: UnsignedTx, keyHandle: KeyHandle): Promise<SignedTx>;

  /** Broadcast a signed transaction */
  abstract broadcastTransaction(tx: SignedTx): Promise<string>;

  /** Get transaction history */
  abstract getTransactionHistory(address: string, limit?: number): Promise<TxRecord[]>;

  /** Get transaction confirmation status */
  abstract getTransactionReceipt(txHash: string): Promise<{
    txHash: string;
    confirmed: boolean;
    blockHeight: number;
    blockTime: number;
    fee: number;
  }>;

  /** Preview a send — estimate fees without signing/broadcasting */
  abstract quoteSendTransaction(params: {
    from: string;
    to: string;
    amount: string;
  }): Promise<{
    feasible: boolean;
    fee: number;
    feeRate: number;
    inputCount: number;
    outputCount: number;
    totalInput: number;
    change: number;
    error?: string;
  }>;

  /** Get maximum spendable amount for an address */
  abstract getMaxSpendable(address: string): Promise<{
    maxSpendable: number;
    fee: number;
    utxoCount: number;
  }>;

  /** Cleanup resources */
  destroy(): void {
    this.config = null;
  }

  /** Helper: make an RPC call via native.net.fetch */
  protected async rpcCall(method: string, params: unknown[]): Promise<unknown> {
    if (!this.config) throw new Error('Wallet not initialized');
    const response = await native.net.fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const bodyText = response.body ? native.encoding.utf8Decode(response.body) : '{}';
    const json = JSON.parse(bodyText);
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }
}
