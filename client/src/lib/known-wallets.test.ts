import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KNOWN_WALLET_ADDRESSES_KEY,
  loadKnownWalletAddresses,
  rememberWalletAddress,
} from "./known-wallets";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe("known wallets", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers previously connected addresses in order", () => {
    rememberWalletAddress("0x115560812df8e7515eecc957b6796531e936edd9");
    rememberWalletAddress("0xb454540da95846f2fecd7f13f01e9d0b5b7dc656");
    expect(loadKnownWalletAddresses()).toEqual([
      "0x115560812df8e7515eecc957b6796531e936edd9",
      "0xb454540da95846f2fecd7f13f01e9d0b5b7dc656",
    ]);
    expect(JSON.parse(localStorage.getItem(KNOWN_WALLET_ADDRESSES_KEY) ?? "[]")).toHaveLength(2);
  });
});
