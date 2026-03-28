type EventCallback = (...args: any[]) => void;

export class EventEmitter {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  once(event: string, callback: EventCallback): void {
    const wrapper: EventCallback = (...args: any[]) => {
      this.off(event, wrapper);
      callback(...args);
    };
    this.on(event, wrapper);
  }

  emit(event: string, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const callback of set) {
        callback(...args);
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const WDKEvents = {
  WALLET_CREATED: 'wallet:created',
  WALLET_UNLOCKED: 'wallet:unlocked',
  WALLET_LOCKED: 'wallet:locked',
  WALLET_DESTROYED: 'wallet:destroyed',
  CHAIN_REGISTERED: 'chain:registered',
  TX_SENT: 'tx:sent',
  TX_CONFIRMED: 'tx:confirmed',
  TX_FAILED: 'tx:failed',
  ERROR: 'error',
} as const;
