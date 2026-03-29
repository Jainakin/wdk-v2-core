export class KeyManager {
  private handles: Set<number> = new Set();
  private seedHandle: number | null = null;
  /** Cache: derivation path → key handle (avoids re-deriving the same key) */
  private derivedCache: Map<string, number> = new Map();

  /** Track a key handle (returned by native.crypto.deriveKey etc.) */
  track(handle: number): number {
    this.handles.add(handle);
    return handle;
  }

  /** Release a single key handle */
  release(handle: number): void {
    if (this.handles.has(handle)) {
      native.crypto.releaseKey(handle);
      this.handles.delete(handle);
      // Also remove from derivation cache if present
      for (const [path, h] of this.derivedCache) {
        if (h === handle) {
          this.derivedCache.delete(path);
          break;
        }
      }
    }
  }

  /** Set the master seed handle. Releases the previous handle if one is already tracked. */
  setSeedHandle(handle: number): void {
    if (this.seedHandle !== null) {
      // Release the old handle before overwriting — prevents leak on double-unlock
      native.crypto.releaseKey(this.seedHandle);
      this.handles.delete(this.seedHandle);
    }
    this.seedHandle = handle;
    this.handles.add(handle);
  }

  /** Get the seed handle (throws if not set) */
  getSeedHandle(): number {
    if (this.seedHandle === null) {
      throw new Error('Seed handle not set — wallet not unlocked');
    }
    return this.seedHandle;
  }

  /**
   * Derive a key from seed at a BIP path and cache it.
   * Returns the cached handle if the same path was already derived.
   * This prevents handle leaks from repeated getAddress/send calls.
   */
  deriveAndTrack(path: string): number {
    const cached = this.derivedCache.get(path);
    if (cached !== undefined && this.handles.has(cached)) {
      return cached;
    }
    const handle = native.crypto.deriveKey(this.getSeedHandle(), path);
    this.handles.add(handle);
    this.derivedCache.set(path, handle);
    return handle;
  }

  /** Release ALL tracked handles including seed. Called on lock/destroy. */
  releaseAll(): void {
    for (const handle of this.handles) {
      native.crypto.releaseKey(handle);
    }
    this.handles.clear();
    this.derivedCache.clear();
    this.seedHandle = null;
  }

  /** Number of active handles */
  get count(): number {
    return this.handles.size;
  }
}
