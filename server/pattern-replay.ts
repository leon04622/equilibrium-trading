import type { HyperliquidCandle } from "./hyperliquid";
import { gatherMultiPatternCandidates } from "./MultiPatternEngine";
import type { DetectedPattern } from "./sma-detection";

export type ReplayTransition = {
  barIndex: number;
  time: number;
  name: DetectedPattern["name"];
  status: DetectedPattern["status"];
  lifecycle?: DetectedPattern["lifecycle"];
  firstSeen: boolean;
};

/**
 * Walk candles left-to-right using only information available at each closed bar.
 * Never inspect future bars when deciding whether a pattern existed at time t.
 */
export function replayPatternHistory(
  candles: HyperliquidCandle[],
  timeframe: string,
  warmup = 80,
): ReplayTransition[] {
  const out: ReplayTransition[] = [];
  const seen = new Set<string>();
  const end = candles.length;
  for (let i = Math.min(warmup, end); i <= end; i++) {
    const slice = candles.slice(0, i);
    if (slice.length < 60) continue;
    const { rows } = gatherMultiPatternCandidates(slice, timeframe);
    for (const row of rows) {
      const p = row.p;
      const key = `${p.name}:${p.status}:${p.breakoutLevel.toFixed(6)}`;
      const firstSeen = !seen.has(key);
      seen.add(key);
      out.push({
        barIndex: i - 1,
        time: slice[slice.length - 1]!.t,
        name: p.name,
        status: p.status,
        lifecycle: p.lifecycle,
        firstSeen,
      });
    }
  }
  return out;
}

export function firstDetectableBar(
  events: ReplayTransition[],
  name: DetectedPattern["name"],
  status: DetectedPattern["status"],
): number | null {
  const hit = events.find((e) => e.name === name && e.status === status);
  return hit ? hit.barIndex : null;
}
