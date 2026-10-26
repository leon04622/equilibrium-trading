import { describe, expect, it } from "vitest";
import { CANDLE_INTERVAL_MS } from "@shared/ohlcv-normalize";
import { getCandles } from "./hyperliquid";
import { normalizeOhlcv } from "@shared/ohlcv-normalize";

const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

describe("Hyperliquid native intervals", () => {
  it("keeps a distinct 30m duration (not aliased to 15m or 1h)", () => {
    expect(CANDLE_INTERVAL_MS["30m"]).toBe(30 * 60_000);
    expect(CANDLE_INTERVAL_MS["30m"]).not.toBe(CANDLE_INTERVAL_MS["15m"]);
    expect(CANDLE_INTERVAL_MS["30m"]).not.toBe(CANDLE_INTERVAL_MS["1h"]);
  });

  it("fetches BTC candles for each required interval when the network is available", async () => {
    for (const interval of INTERVALS) {
      const raw = await getCandles("BTC", interval, undefined, undefined, 40, true);
      if (raw.length === 0) {
        console.warn(`skip live assert for ${interval}: empty snapshot`);
        continue;
      }
      const { bars, droppedMalformed } = normalizeOhlcv(raw, interval);
      expect(droppedMalformed).toBe(0);
      expect(bars.length).toBeGreaterThan(5);
      for (let i = 1; i < bars.length; i++) {
        expect(bars[i]!.t).toBeGreaterThan(bars[i - 1]!.t);
      }
      const step = CANDLE_INTERVAL_MS[interval];
      const deltas = bars.slice(1).map((b, i) => b.t - bars[i]!.t);
      const native = deltas.filter((d) => d === step).length;
      expect(native).toBeGreaterThan(0);
    }
  }, 60_000);
});
