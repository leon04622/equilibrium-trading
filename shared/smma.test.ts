import { describe, expect, it } from "vitest";
import { classifySmmaTrend, lastSmma, smmaSeries, smmaStep } from "./smma";

describe("SMMA / RMA", () => {
  it("seeds with SMA of the first N values then recurses", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const period = 4;
    const series = smmaSeries(values, period);
    expect(series[0]).toBeNull();
    expect(series[3]).toBeCloseTo((1 + 2 + 3 + 4) / 4, 10);
    expect(series[4]).toBeCloseTo(smmaStep(series[3]!, 5, period), 10);
    expect(lastSmma(values, period)).toBeCloseTo(series[series.length - 1]!, 10);
  });

  it("does not equal a simple rolling SMA after the seed", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + i);
    const smma = lastSmma(values, 5)!;
    const sma =
      values.slice(-5).reduce((s, v) => s + v, 0) / 5;
    expect(Math.abs(smma - sma)).toBeGreaterThan(0.5);
  });

  it("returns nulls when history is shorter than period", () => {
    expect(lastSmma([1, 2, 3], 5)).toBeNull();
  });

  it("classifies borderline SMMA distance as mixed even if 21 is slightly below 200", () => {
    const values: number[] = [];
    for (let i = 0; i < 220; i++) values.push(100 + i * 0.01);
    for (let i = 0; i < 8; i++) values.push(values[values.length - 1]! - 0.02);
    const ctx = classifySmmaTrend(values, 2);
    expect(ctx).not.toBeNull();
    expect(ctx!.regime).toBe("mixed");
  });
});
