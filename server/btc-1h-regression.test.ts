import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gatherMultiPatternCandidates } from "./MultiPatternEngine";
import { analyzeEducationalUniversal } from "./universal-scanner";
import { lastClosedBarIndex } from "@shared/ohlcv-normalize";
import type { HyperliquidCandle } from "./hyperliquid";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/btc-1h-ohlcv.json", import.meta.url), "utf8"),
) as { candles: HyperliquidCandle[]; interval: string };

function closedNow(candles: HyperliquidCandle[]): number {
  const last = candles[candles.length - 1]!;
  return last.t + 3_600_000 + 5_000;
}

describe("BTC 1h scan regression from live OHLCV", () => {
  it("keeps at most one live bear flag and reconstructs it from candles", async () => {
    const candles = fixture.candles;
    const nowMs = closedNow(candles);
    const { rows } = gatherMultiPatternCandidates(candles, "1h", { nowMs });
    const signals = await analyzeEducationalUniversal("BTC", "1h", candles, { nowMs });
    const bearFlags = rows.filter((r) => r.p.name === "bear_flag");
    expect(bearFlags.length).toBeLessThanOrEqual(1);
    expect(signals.filter((s) => s.patternName.toLowerCase().includes("bear flag")).length).toBeLessThanOrEqual(1);

    const times = new Set(candles.map((c) => c.t));
    for (const row of rows) {
      const g = row.p.geometry;
      expect(g).toBeTruthy();
      expect(g!.lookaheadOk).toBe(true);
      expect(g!.invalidation).toBeUndefined();
      const anchors = [g!.poleStartTs, g!.poleEndTs, g!.flagStartTs, g!.flagEndTs, g!.windowStartTs, g!.windowEndTs, ...(g!.pivotTs ?? [])];
      for (const t of anchors) {
        if (t == null) continue;
        expect(times.has(t)).toBe(true);
      }
      expect(g!.windowEndTs).toBeLessThanOrEqual(candles[candles.length - 1]!.t);
    }
  });

  it("never treats Developed as confirmation without a closed close beyond the boundary", async () => {
    const candles = fixture.candles;
    const nowMs = closedNow(candles);
    const closedIdx = lastClosedBarIndex(candles, "1h", nowMs);
    const closed = candles[closedIdx]!;
    const { rows } = gatherMultiPatternCandidates(candles, "1h", { nowMs });
    for (const row of rows) {
      if (row.p.lifecycle === "confirmed" || row.p.status === "breakout_confirmed") {
        const close = parseFloat(closed.c);
        const b = row.p.breakoutLevel;
        if (row.p.name.includes("bull") || row.p.name === "double_bottom" || row.p.name === "ascending_triangle") {
          expect(close).toBeGreaterThan(b);
        } else {
          expect(close).toBeLessThan(b);
        }
      }
    }
    const signals = await analyzeEducationalUniversal("BTC", "1h", candles, { nowMs });
    for (const s of signals) {
      expect(s.scanTime).toBeTruthy();
      expect(s.qualityScore).toBeGreaterThanOrEqual(0);
      expect(s.qualityScore).toBeLessThanOrEqual(100);
      if (s.formedAt && s.scanTime) {
        expect(new Date(s.scanTime).getTime()).toBeGreaterThanOrEqual(new Date(s.formedAt).getTime());
      }
      if (s.patternStatus === "developed") {
        expect(s.whatToWatch.toLowerCase()).toContain("closed candle");
      }
    }
  });

  it("does not reprint the stale Oct 22–23 SMA bear flag as a second live opportunity", () => {
    const candles = fixture.candles;
    const nowMs = closedNow(candles);
    const { rows } = gatherMultiPatternCandidates(candles, "1h", { nowMs });
    const stale = rows.filter(
      (r) =>
        r.p.name === "bear_flag" &&
        r.p.geometry?.flagEndTs === Date.parse("2026-10-23T20:00:00.000Z"),
    );
    expect(stale).toHaveLength(0);
  });
});
