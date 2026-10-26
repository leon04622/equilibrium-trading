import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountsFromWalletPermissions,
  mergeEthAccountLists,
  normalizeEthAccounts,
  requestAccountsFromProvider,
} from "./wallet-connect-flow";

describe("normalizeEthAccounts", () => {
  it("dedupes and lowercases valid addresses", () => {
    expect(
      normalizeEthAccounts([
        "0x115560812DF8e7515eecc957b6796531e936edd9",
        "0x115560812df8e7515eecc957b6796531e936edd9",
        "not-an-address",
        12,
      ]),
    ).toEqual(["0x115560812df8e7515eecc957b6796531e936edd9"]);
  });
});

describe("accountsFromWalletPermissions", () => {
  it("reads MetaMask restrictReturnedAccounts caveats", () => {
    const perms = [
      {
        parentCapability: "eth_accounts",
        caveats: [
          {
            type: "restrictReturnedAccounts",
            value: [
              "0xb454540da95846f2fecd7f13f01e9d0b5b7dc656",
              "0x115560812df8e7515eecc957b6796531e936edd9",
            ],
          },
        ],
      },
    ];
    expect(accountsFromWalletPermissions(perms)).toEqual([
      "0xb454540da95846f2fecd7f13f01e9d0b5b7dc656",
      "0x115560812df8e7515eecc957b6796531e936edd9",
    ]);
  });
});

describe("mergeEthAccountLists", () => {
  it("unions live wallet accounts with previously used EQ wallets", () => {
    expect(
      mergeEthAccountLists(
        ["0xb454540da95846f2fecd7f13f01e9d0b5b7dc656"],
        ["0x115560812df8e7515eecc957b6796531e936edd9"],
      ),
    ).toEqual([
      "0xb454540da95846f2fecd7f13f01e9d0b5b7dc656",
      "0x115560812df8e7515eecc957b6796531e936edd9",
    ]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestAccountsFromProvider", () => {
  it("asks for permissions before returning a single selected account on desktop switch", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome" });
    const methods: string[] = [];
    const provider = {
      request: async ({ method }: { method: string }) => {
        methods.push(method);
        if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "eth_requestAccounts") return ["0xb454540da95846f2fecd7f13f01e9d0b5b7dc656"];
        if (method === "wallet_getPermissions") {
          return [
            {
              caveats: [
                {
                  value: [
                    "0xb454540da95846f2fecd7f13f01e9d0b5b7dc656",
                    "0x115560812df8e7515eecc957b6796531e936edd9",
                  ],
                },
              ],
            },
          ];
        }
        return [];
      },
    };
    const accounts = await requestAccountsFromProvider(provider, { forceAccountPicker: true });
    expect(methods[0]).toBe("wallet_requestPermissions");
    expect(accounts).toEqual([
      "0xb454540da95846f2fecd7f13f01e9d0b5b7dc656",
      "0x115560812df8e7515eecc957b6796531e936edd9",
    ]);
    vi.unstubAllGlobals();
  });
});
