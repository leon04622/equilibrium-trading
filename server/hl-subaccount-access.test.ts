import { describe, expect, it } from "vitest";
import {
  parseHyperliquidMasterFromUserRole,
  inheritsPaidAccessFromHyperliquidMaster,
} from "./hl-subaccount-access";

describe("parseHyperliquidMasterFromUserRole", () => {
  it("returns the master for a Hyperliquid sub-account", () => {
    expect(
      parseHyperliquidMasterFromUserRole({
        role: "subAccount",
        data: { master: "0x115560812df8e7515eecc957b6796531e936edd9" },
      }),
    ).toBe("0x115560812df8e7515eecc957b6796531e936edd9");
  });

  it("returns null for a missing or ordinary user", () => {
    expect(parseHyperliquidMasterFromUserRole({ role: "missing" })).toBeNull();
    expect(parseHyperliquidMasterFromUserRole({ role: "user" })).toBeNull();
  });
});

describe("inheritsPaidAccessFromHyperliquidMaster", () => {
  it("inherits when HL reports a master bypass wallet", async () => {
    const ok = await inheritsPaidAccessFromHyperliquidMaster(
      "0xb0b91364acdb9552a95d894c10ffe6cf81a9a3e0",
      async () => false,
      async () => ({
        role: "subAccount",
        data: { master: "0x115560812df8e7515eecc957b6796531e936edd9" },
      }),
    );
    expect(ok).toBe(true);
  });

  it("does not inherit for an unrelated EOA", async () => {
    const ok = await inheritsPaidAccessFromHyperliquidMaster(
      "0xb454540da95846f2fecd7f13f01e9d0b5b7dc656",
      async () => false,
      async () => ({ role: "missing" }),
    );
    expect(ok).toBe(false);
  });
});
