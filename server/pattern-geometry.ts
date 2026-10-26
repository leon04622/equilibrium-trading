import type { HyperliquidCandle } from "./hyperliquid";
import type { DetectedPattern, PatternGeometryDebug } from "./sma-detection";
import { intervalToMs, lastClosedBarIndex } from "@shared/ohlcv-normalize";

const FLAG_FAMILY = new Set(["bull_flag", "bear_flag"]);

export function maxLiveAgeBars(interval: string, name: DetectedPattern["name"]): number {
  if (FLAG_FAMILY.has(name)) {
    if (interval === "1m" || interval === "3m" || interval === "5m") return 36;
    if (interval === "15m" || interval === "30m") return 28;
    return 24;
  }
  if (interval === "1h" || interval === "2h") return 36;
  if (interval === "4h" || interval === "1d") return 48;
  return 40;
}

export function stampPatternGeometry(
  pattern: DetectedPattern,
  candles: HyperliquidCandle[],
  interval: string,
  nowMs: number,
): DetectedPattern {
  const closedIdx = lastClosedBarIndex(candles, interval, nowMs);
  const lastClosed = closedIdx >= 0 ? candles[closedIdx] : candles[candles.length - 1];
  const step = intervalToMs(interval);
  const g = pattern.geometry;
  const formedAt = g?.formedAtTs ?? g?.flagEndTs ?? g?.windowEndTs ?? lastClosed?.t ?? nowMs;
  const ageBars = lastClosed && step > 0 ? Math.max(0, Math.round((lastClosed.t - formedAt) / step)) : 0;
  const times = new Set(candles.map((c) => c.t));
  const anchors = [
    g?.poleStartTs,
    g?.poleEndTs,
    g?.flagStartTs,
    g?.flagEndTs,
    g?.windowStartTs,
    g?.windowEndTs,
    ...(g?.pivotTs ?? []),
  ].filter((t): t is number => typeof t === "number");
  const reconstructable = anchors.every((t) => times.has(t));
  const lookaheadOk = !g?.windowEndTs || !lastClosed || g.windowEndTs <= lastClosed.t + step;
  let invalidation = g?.invalidation;
  if (!reconstructable) invalidation = "Anchor timestamp missing from the candle series.";
  else if (!lookaheadOk) invalidation = "Geometry window extends past the last closed candle.";
  else if (ageBars > maxLiveAgeBars(interval, pattern.name)) {
    invalidation = `Formation is ${ageBars} bars old — expired as a live opportunity.`;
  } else if ((g?.channelQuality ?? 1) < 0.45) {
    invalidation = "Channel quality too low — bars do not respect boundaries.";
  }

  const geometry: PatternGeometryDebug | undefined = g
    ? {
        ...g,
        formedAtTs: formedAt,
        formationAgeBars: ageBars,
        lookaheadOk: lookaheadOk && reconstructable,
        invalidation,
      }
    : undefined;

  if (invalidation) {
    return {
      ...pattern,
      geometry,
      lifecycle: "expired",
      lifecycleReason: invalidation,
    };
  }
  return { ...pattern, geometry };
}

export function flagChannelsOverlap(a: DetectedPattern, b: DetectedPattern): boolean {
  const au = a.geometry?.channelUpper;
  const al = a.geometry?.channelLower;
  const bu = b.geometry?.channelUpper;
  const bl = b.geometry?.channelLower;
  if (au == null || al == null || bu == null || bl == null) {
    return Math.abs(a.breakoutLevel - b.breakoutLevel) / Math.max(Math.abs(a.breakoutLevel), 1e-12) < 0.004;
  }
  const overlap = Math.min(au, bu) - Math.max(al, bl);
  const span = Math.max(au, bu) - Math.min(al, bl);
  return span > 0 && overlap / span >= 0.45;
}

export function flagTimesOverlap(a: DetectedPattern, b: DetectedPattern): boolean {
  const a0 = a.geometry?.poleStartTs ?? a.geometry?.windowStartTs;
  const a1 = a.geometry?.flagEndTs ?? a.geometry?.windowEndTs;
  const b0 = b.geometry?.poleStartTs ?? b.geometry?.windowStartTs;
  const b1 = b.geometry?.flagEndTs ?? b.geometry?.windowEndTs;
  if (a0 == null || a1 == null || b0 == null || b1 == null) return false;
  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  const span = Math.max(a1, b1) - Math.min(a0, b0);
  return span > 0 && overlap / span >= 0.4;
}

export function sameLiveFlagStructure(a: DetectedPattern, b: DetectedPattern): boolean {
  if (a.name !== b.name) return false;
  if (!FLAG_FAMILY.has(a.name)) return false;
  return flagChannelsOverlap(a, b) || flagTimesOverlap(a, b);
}

function lifecycleRank(p: DetectedPattern): number {
  if (p.lifecycle === "confirmed" || p.status === "breakout_confirmed") return 3;
  if (p.lifecycle === "breakout_pending" || p.status === "breakout_pending") return 2;
  return 1;
}

export function collapseDuplicateFlagRows<T extends { p: DetectedPattern; volumeOk: boolean }>(rows: T[]): T[] {
  const kept: T[] = [];
  for (const row of rows) {
    const idx = kept.findIndex((k) => k.p.name === row.p.name && sameLiveFlagStructure(k.p, row.p));
    const sameNameOverlap =
      idx < 0
        ? kept.findIndex(
            (k) =>
              k.p.name === row.p.name &&
              (flagChannelsOverlap(k.p, row.p) || flagTimesOverlap(k.p, row.p)),
          )
        : idx;
    const match = sameNameOverlap;
    if (match < 0) {
      kept.push(row);
      continue;
    }
    const prev = kept[match]!;
    const newer = (row.p.geometry?.formedAtTs ?? 0) >= (prev.p.geometry?.formedAtTs ?? 0);
    if (newer || lifecycleRank(row.p) > lifecycleRank(prev.p)) kept[match] = row;
  }
  return kept;
}
