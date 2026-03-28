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
  readonly coinType: number;
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
    const json = JSON.parse(response.body);
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }
}
