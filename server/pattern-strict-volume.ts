import type { HyperliquidCandle } from "./hyperliquid";
import type { DetectedPattern } from "./sma-detection";

function vol(c: HyperliquidCandle): number {
  const v = parseFloat(c.v || "0");
  return Number.isFinite(v) ? v : 0;
}

function avgVolume(slice: HyperliquidCandle[]): number {
  if (slice.length === 0) return 0;
  return slice.reduce((s, x) => s + vol(x), 0) / slice.length;
}

/**
 * Pole = 10 bars, permissive directional impulse; flag retracement ≤50% of pole height;
 * volume ideally lower in flag than pole.
 */
export function detectStrictFlagWithVolume(
  candles: HyperliquidCandle[],
  isBullish: boolean,
): { pattern: DetectedPattern; volumeOk: boolean } | null {
  const n = candles.length;
  const POLE_LEN = 10;
  const FLAG_MIN = 8;
  const FLAG_MAX = 18;
  if (n < POLE_LEN + FLAG_MIN + 5) return null;

  for (let poleEnd = POLE_LEN; poleEnd <= n - FLAG_MIN - 3; poleEnd++) {
    const pole = candles.slice(poleEnd - POLE_LEN, poleEnd);
    const low = Math.min(...pole.map((c) => parseFloat(c.l)));
    const high = Math.max(...pole.map((c) => parseFloat(c.h)));
    const poleHeight = high - low;
    if (poleHeight <= 0) continue;
    const movePct = isBullish ? (poleHeight / low) * 100 : (poleHeight / high) * 100;
    if (movePct < 0.48) continue;
    const c0 = parseFloat(pole[0].c);
    const c9 = parseFloat(pole[POLE_LEN - 1].c);
    if (isBullish && c9 <= c0) continue;
    if (!isBullish && c9 >= c0) continue;

    for (let flagLen = FLAG_MIN; flagLen <= FLAG_MAX && poleEnd + flagLen < n; flagLen++) {
      const flag = candles.slice(poleEnd, poleEnd + flagLen);
      const fh = Math.max(...flag.map((c) => parseFloat(c.h)));
      const fl = Math.min(...flag.map((c) => parseFloat(c.l)));
      if (isBullish) {
        const retrace = (high - fl) / poleHeight;
        if (retrace > 0.72) continue;
        if (fl < low * 0.992) continue;
      } else {
        const retrace = (fh - low) / poleHeight;
        if (retrace > 0.72) continue;
        if (fh > high * 1.008) continue;
      }
      const vPole = avgVolume(pole);
      const vFlag = avgVolume(flag);
      const volumeOk = vPole > 0 ? vFlag < vPole * 1.08 : true;

      const tail = candles.slice(poleEnd + flagLen);
      const currentPrice = parseFloat(candles[n - 1].c);
      const flagUpper = Math.max(...flag.map((c) => parseFloat(c.h)));
      const flagLower = Math.min(...flag.map((c) => parseFloat(c.l)));
      const fr = flagUpper - flagLower;
      let status: DetectedPattern["status"] = "forming";
      if (isBullish && currentPrice > flagUpper) status = "breakout_pending";
      if (!isBullish && currentPrice < flagLower) status = "breakout_pending";
      const baseConf = status === "breakout_pending" ? 56 : 44;
      const confidence = Math.min(94, baseConf + (volumeOk ? 14 : 0));

      const pattern: DetectedPattern = {
        name: isBullish ? "bull_flag" : "bear_flag",
        displayName: isBullish ? "Bull Flag" : "Bear Flag",
        status,
        entryPrice: isBullish ? flagUpper : flagLower,
        stopLoss: isBullish ? flagLower - fr * 0.12 : flagUpper + fr * 0.12,
        takeProfit: isBullish ? flagUpper + poleHeight : flagLower - poleHeight,
        breakoutLevel: isBullish ? flagUpper : flagLower,
        currentPrice,
        confidence,
        geometry: {
          source: "strict_flag",
          poleStartTs: pole[0]!.t,
          poleEndTs: pole[pole.length - 1]!.t,
          flagStartTs: flag[0]!.t,
          flagEndTs: flag[flag.length - 1]!.t,
          windowStartTs: pole[0]!.t,
          windowEndTs: tail[tail.length - 1]!.t,
          formedAtTs: flag[flag.length - 1]!.t,
          channelUpper: flagUpper,
          channelLower: flagLower,
          channelQuality: 1,
          formationAgeBars: 0,
          lookaheadOk: true,
        },
      };
      return { pattern, volumeOk };
    }
  }
  return null;
}
