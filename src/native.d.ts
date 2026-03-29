declare global {
  const native: {
    crypto: {
      generateMnemonic(wordCount: number): string;
      mnemonicToSeed(mnemonic: string, passphrase?: string): number;
      deriveKey(seedHandle: number, path: string): number;
      signSecp256k1(keyHandle: number, hash: Uint8Array): Uint8Array;
      signEd25519(keyHandle: number, message: Uint8Array): Uint8Array;
      getPublicKey(keyHandle: number, curve: 'secp256k1' | 'ed25519'): Uint8Array;
      sha256(data: Uint8Array): Uint8Array;
      sha512(data: Uint8Array): Uint8Array;
      keccak256(data: Uint8Array): Uint8Array;
      ripemd160(data: Uint8Array): Uint8Array;
      blake2b(data: Uint8Array, outLen: number): Uint8Array;
      hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array;
      hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array;
      pbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number, keyLen: number, digest: string): Uint8Array;
      hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, keyLen: number, digest: string): Uint8Array;
      aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array, iv: Uint8Array): Uint8Array;
      aesGcmDecrypt(key: Uint8Array, ciphertext: Uint8Array, iv: Uint8Array): Uint8Array;
      releaseKey(handle: number): void;
    };
    encoding: {
      hexEncode(data: Uint8Array): string;
      hexDecode(hex: string): Uint8Array;
      base58Encode(data: Uint8Array): string;
      base58Decode(str: string): Uint8Array;
      base58CheckEncode(data: Uint8Array): string;
      base58CheckDecode(str: string): Uint8Array;
      bech32Encode(hrp: string, data: Uint8Array): string;
      bech32Decode(str: string): { hrp: string; data: Uint8Array };
      bech32mEncode(hrp: string, data: Uint8Array): string;
      bech32mDecode(str: string): { hrp: string; data: Uint8Array };
      base64Encode(data: Uint8Array): string;
      base64Decode(str: string): Uint8Array;
      utf8Encode(str: string): Uint8Array;
      utf8Decode(bytes: Uint8Array): string;
    };
    net: {
      fetch(url: string, options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string | Uint8Array;
        timeout?: number;
      }): Promise<{ status: number; headers: Record<string, string>; body: Uint8Array }>;
    };
    storage: {
      secure: {
        set(key: string, value: Uint8Array): Promise<void>;
        get(key: string): Promise<Uint8Array | null>;
        delete(key: string): Promise<void>;
        has(key: string): Promise<boolean>;
      };
      regular: {
        set(key: string, value: string): Promise<void>;
        get(key: string): Promise<string | null>;
        delete(key: string): Promise<void>;
      };
    };
    platform: {
      os: string;
      version: string;
      getRandomBytes(length: number): Uint8Array;
      log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;
    };
  };
}
export {};
