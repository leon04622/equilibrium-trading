import type { HyperliquidCandle } from "./hyperliquid";

export type DivergenceKind =
  | "regular_bullish"
  | "regular_bearish"
  | "hidden_bullish"
  | "hidden_bearish";

export type DivergenceHit = {
  kind: DivergenceKind;
  confirmed: boolean;
  priceLeftIdx: number;
  priceRightIdx: number;
  rsiLeft: number;
  rsiRight: number;
};

function rsiSeries(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / Math.max(loss, 1e-12));
  }
  return out;
}

function pivots(values: number[], lookback: number, kind: "high" | "low"): number[] {
  const idx: number[] = [];
  for (let i = lookback; i < values.length - lookback; i++) {
    let ok = true;
    for (let j = 1; j <= lookback; j++) {
      if (kind === "high" && (values[i - j]! >= values[i]! || values[i + j]! >= values[i]!)) ok = false;
      if (kind === "low" && (values[i - j]! <= values[i]! || values[i + j]! <= values[i]!)) ok = false;
    }
    if (ok) idx.push(i);
  }
  return idx;
}

/**
 * Pivot-based RSI divergence. Right-side confirmation uses only already-closed bars
 * (caller must pass a closed-only slice). This is evidence, not an entry.
 */
export function detectRsiDivergence(candles: HyperliquidCandle[], lookback = 3): DivergenceHit[] {
  const closes = candles.map((c) => parseFloat(c.c)).filter(Number.isFinite);
  if (closes.length < 40) return [];
  const rsi = rsiSeries(closes, 14);
  const usable = rsi.map((v, i) => (v == null ? NaN : v));
  const priceHighs = pivots(closes, lookback, "high");
  const priceLows = pivots(closes, lookback, "low");
  const rsiHighs = pivots(usable.map((v) => (Number.isFinite(v) ? v : 0)), lookback, "high");
  const rsiLows = pivots(usable.map((v) => (Number.isFinite(v) ? v : 100)), lookback, "low");
  const hits: DivergenceHit[] = [];

  const pair = (a: number[], b: number[]) => {
    if (a.length < 2 || b.length < 2) return null;
    return {
      p0: a[a.length - 2]!,
      p1: a[a.length - 1]!,
      r0: b[b.length - 2]!,
      r1: b[b.length - 1]!,
    };
  };

  const lowPair = pair(priceLows, rsiLows);
  if (lowPair && Math.abs(lowPair.p1 - lowPair.r1) <= 8) {
    const pl = closes[lowPair.p0]!;
    const pr = closes[lowPair.p1]!;
    const rl = rsi[lowPair.r0];
    const rr = rsi[lowPair.r1];
    if (rl != null && rr != null) {
      if (pr < pl && rr > rl) {
        hits.push({
          kind: "regular_bullish",
          confirmed: true,
          priceLeftIdx: lowPair.p0,
          priceRightIdx: lowPair.p1,
          rsiLeft: rl,
          rsiRight: rr,
        });
      }
      if (pr > pl && rr < rl) {
        hits.push({
          kind: "hidden_bullish",
          confirmed: true,
          priceLeftIdx: lowPair.p0,
          priceRightIdx: lowPair.p1,
          rsiLeft: rl,
          rsiRight: rr,
        });
      }
    }
  }

  const highPair = pair(priceHighs, rsiHighs);
  if (highPair && Math.abs(highPair.p1 - highPair.r1) <= 8) {
    const pl = closes[highPair.p0]!;
    const pr = closes[highPair.p1]!;
    const rl = rsi[highPair.r0];
    const rr = rsi[highPair.r1];
    if (rl != null && rr != null) {
      if (pr > pl && rr < rl) {
        hits.push({
          kind: "regular_bearish",
          confirmed: true,
          priceLeftIdx: highPair.p0,
          priceRightIdx: highPair.p1,
          rsiLeft: rl,
          rsiRight: rr,
        });
      }
      if (pr < pl && rr > rl) {
        hits.push({
          kind: "hidden_bearish",
          confirmed: true,
          priceLeftIdx: highPair.p0,
          priceRightIdx: highPair.p1,
          rsiLeft: rl,
          rsiRight: rr,
        });
      }
    }
  }

  return hits;
}
