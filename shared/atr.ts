export type AtrBar = { h: string | number; l: string | number; c: string | number };

function n(v: string | number): number {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : NaN;
}

/** Wilder ATR, SMA-seeded then smoothed — same recurrence family as SMMA. */
export function wilderAtr(bars: AtrBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = n(bars[i]!.h);
    const low = n(bars[i]!.l);
    const prevClose = n(bars[i - 1]!.c);
    if (![high, low, prevClose].every(Number.isFinite)) continue;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trs.length < period) return null;
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trs[i]!;
  atr /= period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]!) / period;
  }
  return atr;
}
