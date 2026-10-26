import { isMasterBypassWalletAddress } from "./master-bypass-wallets";
import { isAdminWallet } from "@shared/schema";

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const ROLE_TTL_MS = 5 * 60_000;

type CachedRole = { at: number; master: string | null };
const roleCache = new Map<string, CachedRole>();

type InfoFetcher = (body: unknown) => Promise<unknown>;

const defaultInfoFetch: InfoFetcher = async (body) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(HYPERLIQUID_INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export function parseHyperliquidMasterFromUserRole(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const role = (raw as { role?: unknown }).role;
  if (role !== "subAccount") return null;
  const master = (raw as { data?: { master?: unknown } }).data?.master;
  if (typeof master !== "string") return null;
  const lower = master.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(lower) ? lower : null;
}

export async function resolveHyperliquidMasterWallet(
  walletAddress: string,
  infoFetch: InfoFetcher = defaultInfoFetch,
): Promise<string | null> {
  const wallet = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return null;
  const cached = roleCache.get(wallet);
  if (cached && Date.now() - cached.at < ROLE_TTL_MS) return cached.master;
  const raw = await infoFetch({ type: "userRole", user: wallet });
  const master = parseHyperliquidMasterFromUserRole(raw);
  roleCache.set(wallet, { at: Date.now(), master });
  return master;
}

/** True when this address is a Hyperliquid sub-account of a master that already has Pro. */
export async function inheritsPaidAccessFromHyperliquidMaster(
  walletAddress: string,
  masterIsPaid: (master: string) => boolean | Promise<boolean>,
  infoFetch: InfoFetcher = defaultInfoFetch,
): Promise<boolean> {
  const master = await resolveHyperliquidMasterWallet(walletAddress, infoFetch);
  if (!master) return false;
  if (isMasterBypassWalletAddress(master) || isAdminWallet(master)) return true;
  return Boolean(await masterIsPaid(master));
}
