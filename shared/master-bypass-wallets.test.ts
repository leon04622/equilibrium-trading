import { describe, expect, it } from "vitest";
import {
  isAdminWallet,
  isMasterBypassWalletInList,
} from "./schema";

describe("master bypass inherited wallets", () => {
  it("grants Pro bypass to the reported Hyperliquid sub-account key without making it admin", () => {
    const sub = "0xb454540da95846f2fecd7f13f01e9d0b5b7dc656";
    expect(isMasterBypassWalletInList(sub)).toBe(true);
    expect(isAdminWallet(sub)).toBe(false);
  });

  it("grants Pro bypass to the Hyperliquid Crypto Banks sub-account", () => {
    expect(isMasterBypassWalletInList("0xb0b91364acdb9552a95d894c10ffe6cf81a9a3e0")).toBe(true);
    expect(isAdminWallet("0xb0b91364acdb9552a95d894c10ffe6cf81a9a3e0")).toBe(false);
  });

  it("keeps the master wallet as both bypass and admin", () => {
    const master = "0x115560812df8e7515eecc957b6796531e936edd9";
    expect(isMasterBypassWalletInList(master)).toBe(true);
    expect(isAdminWallet(master)).toBe(true);
  });
});
