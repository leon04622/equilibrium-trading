import { mergeEthAccountLists, normalizeEthAccounts } from "@/lib/wallet-connect-flow";

export const KNOWN_WALLET_ADDRESSES_KEY = "eq_known_wallet_addresses";
const MAX_KNOWN_WALLETS = 16;

export function loadKnownWalletAddresses(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_WALLET_ADDRESSES_KEY);
    if (!raw) return [];
    return normalizeEthAccounts(JSON.parse(raw));
  } catch {
    return [];
  }
}

export { mergeEthAccountLists };

export function rememberWalletAddress(address: string | null | undefined): string[] {
  const next = mergeEthAccountLists(loadKnownWalletAddresses(), address ? [address] : []);
  const trimmed = next.slice(0, MAX_KNOWN_WALLETS);
  try {
    localStorage.setItem(KNOWN_WALLET_ADDRESSES_KEY, JSON.stringify(trimmed));
  } catch {
    /* private mode / quota */
  }
  return trimmed;
}
