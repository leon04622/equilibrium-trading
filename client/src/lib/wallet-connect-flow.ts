import { isMobileUserAgent } from "@/lib/wallet-mobile-rabby";

/** Normalize EIP-1193 account list from wallet providers. */
export function normalizeEthAccounts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    if (typeof a !== "string") continue;
    const lower = a.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

export function mergeEthAccountLists(...groups: Array<string[] | null | undefined>): string[] {
  return normalizeEthAccounts(groups.flatMap((g) => g ?? []));
}

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

async function requestEthAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  return normalizeEthAccounts(accounts);
}

export async function tryWalletRequestPermissions(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* Rabby mobile often rejects this — eth_requestAccounts still works */
  }
}

function collectHexAddresses(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectHexAddresses(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectHexAddresses(nested, into);
    }
  }
}

/** Pull every 0x address out of EIP-2255 permission caveats (MetaMask restrictReturnedAccounts). */
export function accountsFromWalletPermissions(raw: unknown): string[] {
  const found: string[] = [];
  collectHexAddresses(raw, found);
  return normalizeEthAccounts(found);
}

export async function readAccountsFromPermissions(provider: Eip1193Provider): Promise<string[]> {
  try {
    const perms = await provider.request({ method: "wallet_getPermissions" });
    return accountsFromWalletPermissions(perms);
  } catch {
    return [];
  }
}

/**
 * Request accounts from an injected wallet.
 * Mobile / Rabby: `eth_requestAccounts` first (official Rabby path).
 * Desktop Switch account: `wallet_requestPermissions` first so the extension shows every key.
 */
export async function requestAccountsFromProvider(
  provider: Eip1193Provider,
  options?: { forceAccountPicker?: boolean },
): Promise<string[]> {
  const mobile = isMobileUserAgent();
  const forcePicker = options?.forceAccountPicker === true;

  if (forcePicker && !mobile) {
    await tryWalletRequestPermissions(provider);
  }

  let list = await requestEthAccounts(provider);
  const fromPerms = await readAccountsFromPermissions(provider);
  list = mergeEthAccountLists(list, fromPerms);
  if (list.length > 0) return list;

  if (!mobile) {
    await tryWalletRequestPermissions(provider);
    list = mergeEthAccountLists(
      await requestEthAccounts(provider),
      await readAccountsFromPermissions(provider),
    );
    if (list.length > 0) return list;
  }

  return readAuthorizedAccounts(provider);
}

export async function readAuthorizedAccounts(provider: Eip1193Provider): Promise<string[]> {
  try {
    const existing = await provider.request({ method: "eth_accounts" });
    return normalizeEthAccounts(existing);
  } catch {
    return [];
  }
}
