import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gatherMultiPatternCandidates } from "./MultiPatternEngine";
import { analyzeEducationalUniversal } from "./universal-scanner";
import { lastClosedBarIndex, CANDLE_INTERVAL_MS } from "@shared/ohlcv-normalize";
import { getPatternStructuralBias } from "./sma-detection";
import { SCAN_ALL_TIMEFRAMES } from "@shared/scan-timeframes";
import type { HyperliquidCandle } from "./hyperliquid";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/btc-mtf-ohlcv.json", import.meta.url), "utf8")) as {
  intervals: Record<string, { candles: HyperliquidCandle[] }>;
};

function closedNow(candles: HyperliquidCandle[], tf: string): number {
  const last = candles[candles.length - 1]!;
  return last.t + (CANDLE_INTERVAL_MS[tf] ?? 60_000) + 5_000;
}

describe.each([...SCAN_ALL_TIMEFRAMES])("BTC %s scan vs historical OHLCV", (tf) => {
  it("reconstructs live patterns from candles with no lookahead and honest confirmation", async () => {
    const candles = fixture.intervals[tf]?.candles;
    expect(candles?.length).toBeGreaterThanOrEqual(200);
    const nowMs = closedNow(candles!, tf);
    const { rows } = gatherMultiPatternCandidates(candles!, tf, { nowMs });
    const signals = await analyzeEducationalUniversal("BTC", tf, candles!, { nowMs });
    const closedIdx = lastClosedBarIndex(candles!, tf, nowMs);
    const closed = candles![closedIdx]!;
    const times = new Set(candles!.map((c) => c.t));

    const names = rows.map((r) => `${r.p.name}::${r.p.lifecycle ?? r.p.status}`);
    expect(new Set(names).size).toBe(names.length);

    const bearFlags = rows.filter((r) => r.p.name === "bear_flag");
    const bullFlags = rows.filter((r) => r.p.name === "bull_flag");
    expect(bearFlags.length).toBeLessThanOrEqual(1);
    expect(bullFlags.length).toBeLessThanOrEqual(1);

    for (const row of rows) {
      const g = row.p.geometry;
      expect(g, `${tf} ${row.p.name} missing geometry`).toBeTruthy();
      expect(g!.lookaheadOk).toBe(true);
      expect(g!.invalidation).toBeUndefined();
      const anchors = [
        g!.poleStartTs,
        g!.poleEndTs,
        g!.flagStartTs,
        g!.flagEndTs,
        g!.windowStartTs,
        g!.windowEndTs,
        ...(g!.pivotTs ?? []),
      ];
      for (const t of anchors) {
        if (t == null) continue;
        expect(times.has(t), `${tf} ${row.p.name} anchor ${t} not in series`).toBe(true);
      }
      expect(g!.windowEndTs).toBeLessThanOrEqual(candles![candles!.length - 1]!.t);

      if (row.p.lifecycle === "confirmed" || row.p.status === "breakout_confirmed") {
        const close = parseFloat(closed.c);
        const bias = getPatternStructuralBias(row.p);
        if (bias === "bullish") expect(close).toBeGreaterThan(row.p.breakoutLevel);
        else if (bias === "bearish") expect(close).toBeLessThan(row.p.breakoutLevel);
      }
    }

    for (const s of signals) {
      expect(s.scanTime).toBeTruthy();
      expect(s.qualityScore).toBeGreaterThanOrEqual(0);
      expect(s.qualityScore).toBeLessThanOrEqual(100);
      expect(s.timeframe).toBe(tf);
      if (s.formedAt && s.scanTime) {
        expect(new Date(s.scanTime).getTime()).toBeGreaterThanOrEqual(new Date(s.formedAt).getTime());
      }
      if (s.patternStatus === "developed" || s.lifecycle === "confirmed") {
        expect(s.whatToWatch.toLowerCase()).toMatch(/closed candle/);
      }
    }
  });
});

describe("BTC 1h specific duplicate / stale flags", () => {
  it("does not reprint the Oct 22–23 SMA bear flag as a live 1h opportunity", () => {
    const candles = fixture.intervals["1h"]!.candles;
    const nowMs = closedNow(candles, "1h");
    const { rows } = gatherMultiPatternCandidates(candles, "1h", { nowMs });
    expect(rows.filter((r) => r.p.name === "bear_flag")).toHaveLength(0);
    const stale = rows.filter((r) => r.p.geometry?.flagEndTs === Date.parse("2026-10-23T20:00:00.000Z"));
    expect(stale).toHaveLength(0);
  });
});
