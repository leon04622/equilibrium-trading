/**
 * TradingView-style RMA / SMMA:
 * seed = SMA of first N closes
 * SMMA[i] = (SMMA[i-1] * (N - 1) + close[i]) / N
 */
export function smmaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) return out;
    seed += v;
  }
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) {
      out[i] = null;
      continue;
    }
    prev = (prev * (period - 1) + v) / period;
    out[i] = prev;
  }
  return out;
}

export function lastSmma(values: number[], period: number): number | null {
  const series = smmaSeries(values, period);
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v != null) return v;
  }
  return null;
}

export function smmaStep(prev: number, nextValue: number, period: number): number {
  return (prev * (period - 1) + nextValue) / period;
}

export type SmmaTrendRegime = "bullish" | "bearish" | "mixed";

export type SmmaTrendContext = {
  smma21: number;
  smma200: number;
  price: number;
  regime: SmmaTrendRegime;
  slope21: number;
  slope200: number;
  separationPct: number;
  priceDistance21Atr: number | null;
};

function finiteSlope(series: Array<number | null>, lookback: number): number {
  const end = series.length - 1;
  const a = series[end];
  const b = series[Math.max(0, end - lookback)];
  if (a == null || b == null) return 0;
  return (a - b) / Math.max(Math.abs(b), 1e-12);
}

/**
 * Meaningful alignment vs chop. Geometry detectors must not use this as a hard veto.
 */
export function classifySmmaTrend(
  closes: number[],
  atr: number | null,
): SmmaTrendContext | null {
  if (closes.length < 200) return null;
  const s21 = smmaSeries(closes, 21);
  const s200 = smmaSeries(closes, 200);
  const smma21 = s21[s21.length - 1];
  const smma200 = s200[s200.length - 1];
  const price = closes[closes.length - 1]!;
  if (smma21 == null || smma200 == null || !Number.isFinite(price)) return null;

  const separationPct = ((smma21 - smma200) / Math.max(Math.abs(smma200), 1e-12)) * 100;
  const slope21 = finiteSlope(s21, 8);
  const slope200 = finiteSlope(s200, 21);
  const dist21 = atr && atr > 0 ? (price - smma21) / atr : null;

  const alignedBull =
    price > smma21 &&
    price > smma200 &&
    smma21 > smma200 &&
    slope21 >= 0;
  const alignedBear =
    price < smma21 &&
    price < smma200 &&
    smma21 < smma200 &&
    slope21 <= 0;

  let regime: SmmaTrendRegime = "mixed";
  if (alignedBull && Math.abs(separationPct) >= 0.04) regime = "bullish";
  else if (alignedBear && Math.abs(separationPct) >= 0.04) regime = "bearish";

  return {
    smma21,
    smma200,
    price,
    regime,
    slope21,
    slope200,
    separationPct,
    priceDistance21Atr: dist21,
  };
}
