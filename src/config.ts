import type { NetworkConfig } from '@aspect/wdk-v2-utils';

export interface WDKConfig {
  defaultNetwork: 'mainnet' | 'testnet';
  networks: Record<string, NetworkConfig>;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Default per-chain network configs.
 * Keyed by chainId (e.g. "btc") so the unlockWallet fallback lookup finds them.
 * Callers can override by passing networks to the WDKEngine constructor or
 * by calling mergeConfig() before construction.
 */
export const DEFAULT_CONFIG: WDKConfig = {
  defaultNetwork: 'mainnet',
  networks: {
    btc: {
      chainId: 'btc',
      networkId: 'mainnet',
      rpcUrl: '',
      isTestnet: false,
      network: 'bitcoin',
    },
    evm: {
      chainId: 'evm',
      networkId: 'mainnet',
      rpcUrl: '',
      isTestnet: false,
    },
    ton: {
      chainId: 'ton',
      networkId: 'mainnet',
      rpcUrl: '',
      isTestnet: false,
    },
    tron: {
      chainId: 'tron',
      networkId: 'mainnet',
      rpcUrl: '',
      isTestnet: false,
    },
    solana: {
      chainId: 'solana',
      networkId: 'mainnet',
      rpcUrl: '',
      isTestnet: false,
    },
  },
  logLevel: 'info',
};

export function mergeConfig(base: WDKConfig, override: Partial<WDKConfig>): WDKConfig {
  return {
    defaultNetwork: override.defaultNetwork ?? base.defaultNetwork,
    networks: override.networks
      ? { ...base.networks, ...override.networks }
      : { ...base.networks },
    logLevel: override.logLevel ?? base.logLevel,
  };
}
