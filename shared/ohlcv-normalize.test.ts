import { describe, expect, it } from "vitest";
import {
  lastClosedBarIndex,
  normalizeOhlcv,
  type OhlcvBar,
} from "./ohlcv-normalize";

function bar(t: number, c: number): OhlcvBar {
  return { t, o: String(c), h: String(c + 1), l: String(c - 1), c: String(c), v: "1" };
}

describe("normalizeOhlcv", () => {
  it("sorts, merges duplicates, and uses native 30m step", () => {
    const step = 30 * 60_000;
    const t0 = Math.floor(1_700_000_000_000 / step) * step;
    const raw: OhlcvBar[] = [
      bar(t0 + step, 2),
      bar(t0, 1),
      { ...bar(t0, 1.2), h: "3", v: "9" },
    ];
    const { bars, mergedDuplicates } = normalizeOhlcv(raw, "30m");
    expect(mergedDuplicates).toBe(1);
    expect(bars.map((b) => b.t)).toEqual([t0, t0 + step]);
    expect(bars[0]!.h).toBe("3");
    expect(bars[0]!.c).toBe("1.2");
  });

  it("treats the last bar as forming until the interval elapses", () => {
    const step = 60_000;
    const t0 = 1_700_000_000_000;
    const bars = [bar(t0, 1), bar(t0 + step, 2)];
    const during = lastClosedBarIndex(bars, "1m", t0 + step + 10_000);
    const after = lastClosedBarIndex(bars, "1m", t0 + 2 * step + 10);
    expect(during).toBe(0);
    expect(after).toBe(1);
  });
});
