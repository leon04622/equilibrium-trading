/** Canonical Hyperliquid bar durations — includes native 30m. Never alias 30m to 15m or 1h. */
export const CANDLE_INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export type OhlcvBar = {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
};

function toNum(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : NaN;
}

export function intervalToMs(interval: string): number {
  return CANDLE_INTERVAL_MS[interval] ?? 60_000;
}

/** HL `t` is milliseconds; coerce seconds and align to interval. */
export function normalizeBarTimeMs(t: number, interval: string): number {
  if (!Number.isFinite(t)) return t;
  const step = intervalToMs(interval);
  let ms = t;
  if (ms > 0 && ms < 1e12) ms *= 1000;
  return Math.floor(ms / step) * step;
}

function mergeBar(a: OhlcvBar, b: OhlcvBar): OhlcvBar {
  const h = Math.max(toNum(a.h), toNum(b.h));
  const l = Math.min(toNum(a.l), toNum(b.l));
  return {
    t: a.t,
    o: a.o,
    h: Number.isFinite(h) ? String(h) : a.h,
    l: Number.isFinite(l) ? String(l) : a.l,
    c: b.c,
    v: b.v,
  };
}

export function isWellFormedBar(bar: OhlcvBar): boolean {
  const o = toNum(bar.o);
  const h = toNum(bar.h);
  const l = toNum(bar.l);
  const c = toNum(bar.c);
  if (![o, h, l, c].every(Number.isFinite)) return false;
  if (h < l) return false;
  if (h < Math.max(o, c) * 0.999999) return false;
  if (l > Math.min(o, c) * 1.000001) return false;
  return true;
}

export type NormalizeOhlcvResult = {
  bars: OhlcvBar[];
  droppedMalformed: number;
  mergedDuplicates: number;
  gaps: number;
};

/**
 * Sort, drop unusable bars, merge duplicate timestamps (keep first open, latest close, envelope H/L).
 */
export function normalizeOhlcv(
  raw: OhlcvBar[],
  interval: string,
): NormalizeOhlcvResult {
  let droppedMalformed = 0;
  let mergedDuplicates = 0;
  const byTime = new Map<number, OhlcvBar>();
  for (const row of raw) {
    if (!Number.isFinite(row.t)) {
      droppedMalformed++;
      continue;
    }
    const t = normalizeBarTimeMs(row.t, interval);
    const candidate: OhlcvBar = { ...row, t };
    if (!isWellFormedBar(candidate)) {
      droppedMalformed++;
      continue;
    }
    const prev = byTime.get(t);
    if (prev) {
      byTime.set(t, mergeBar(prev, candidate));
      mergedDuplicates++;
    } else {
      byTime.set(t, candidate);
    }
  }
  const bars = [...byTime.values()].sort((a, b) => a.t - b.t);
  const step = intervalToMs(interval);
  let gaps = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i]!.t - bars[i - 1]!.t > step * 1.5) gaps++;
  }
  return { bars, droppedMalformed, mergedDuplicates, gaps };
}

/** Index of the last fully closed bar. Forming bar is excluded. */
export function lastClosedBarIndex(
  bars: { t: number }[],
  interval: string,
  nowMs: number = Date.now(),
): number {
  if (bars.length === 0) return -1;
  const step = intervalToMs(interval);
  const last = bars.length - 1;
  const closeAt = bars[last]!.t + step;
  if (nowMs < closeAt - 50) return last - 1;
  return last;
}

export function closedBars<T extends { t: number }>(
  bars: T[],
  interval: string,
  nowMs: number = Date.now(),
): T[] {
  const idx = lastClosedBarIndex(bars, interval, nowMs);
  if (idx < 0) return [];
  return bars.slice(0, idx + 1);
}
