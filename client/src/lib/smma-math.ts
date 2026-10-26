import type { Time } from "lightweight-charts";
import { smmaSeries } from "@shared/smma";

/** SMMA (Smoothed Moving Average) — TradingView RMA / venue-native formula. */
export function calcSMMA(
  vals: number[],
  times: Time[],
  period: number,
): { time: Time; value: number }[] {
  const series = smmaSeries(vals, period);
  const out: { time: Time; value: number }[] = [];
  for (let i = 0; i < series.length; i++) {
    const value = series[i];
    if (value == null) continue;
    out.push({ time: times[i]!, value });
  }
  return out;
}
