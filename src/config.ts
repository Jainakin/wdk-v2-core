import type { NetworkConfig } from '@aspect/wdk-v2-utils';

export interface WDKConfig {
  defaultNetwork: 'mainnet' | 'testnet';
  networks: Record<string, NetworkConfig>;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_CONFIG: WDKConfig = {
  defaultNetwork: 'mainnet',
  networks: {},
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
