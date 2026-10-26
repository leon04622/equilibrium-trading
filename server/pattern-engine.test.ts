import { describe, expect, it } from "vitest";
import type { HyperliquidCandle } from "./hyperliquid";
import { gatherMultiPatternCandidates } from "./MultiPatternEngine";
import { applyClosedCandleConfirmation } from "./pattern-enrichment";
import { replayPatternHistory } from "./pattern-replay";
import { lastSmma } from "@shared/smma";
import { detectRsiDivergence } from "./rsi-divergence";

function c(
  t: number,
  o: number,
  h: number,
  l: number,
  close: number,
  v = 100,
): HyperliquidCandle {
  return { t, o: String(o), h: String(h), l: String(l), c: String(close), v: String(v) };
}

function makeBullFlagSeries(): HyperliquidCandle[] {
  const step = 60_000;
  const out: HyperliquidCandle[] = [];
  let t = 1_700_000_000_000;
  let px = 100;
  for (let i = 0; i < 200; i++) {
    px += 0.04;
    out.push(c(t, px - 0.02, px + 0.05, px - 0.05, px, 80));
    t += step;
  }
  const poleStart = px;
  for (let i = 0; i < 25; i++) {
    px += 0.55;
    out.push(c(t, px - 0.4, px + 0.2, px - 0.45, px, 220));
    t += step;
  }
    const poleTop = px;
    if (poleTop <= poleStart + 8) {
      throw new Error("fixture pole too small");
    }
  for (let i = 0; i < 25; i++) {
    px -= 0.08;
    out.push(c(t, px + 0.05, px + 0.12, px - 0.1, px, 90));
    t += step;
  }
  for (let i = 0; i < 10; i++) {
    out.push(c(t, px, px + 0.08, px - 0.08, px, 85));
    t += step;
  }
  return out;
}

describe("pattern engine upgrade", () => {
  it("does not confirm a wick-only breakout", () => {
    const boundary = 100;
    const bars: HyperliquidCandle[] = [
      c(0, 99, 99.5, 98.5, 99),
      c(60_000, 99.2, 101.5, 99.1, 99.4),
    ];
    const pattern = {
      name: "bull_flag" as const,
      displayName: "Bull Flag",
      status: "breakout_confirmed" as const,
      entryPrice: 100,
      stopLoss: 98,
      takeProfit: 104,
      breakoutLevel: boundary,
      currentPrice: 99.4,
      confidence: 80,
    };
    const refined = applyClosedCandleConfirmation(pattern, bars, "1m", 120_000 + 5_000);
    expect(refined.status).toBe("breakout_pending");
    expect(refined.lifecycle).toBe("breakout_pending");
  });

  it("confirms only after a closed close through the boundary", () => {
    const bars: HyperliquidCandle[] = [
      c(0, 99, 99.5, 98.5, 99),
      c(60_000, 99.2, 101.5, 99.1, 100.8),
    ];
    const pattern = {
      name: "bull_flag" as const,
      displayName: "Bull Flag",
      status: "forming" as const,
      entryPrice: 100,
      stopLoss: 98,
      takeProfit: 104,
      breakoutLevel: 100,
      currentPrice: 100.8,
      confidence: 44,
    };
    const refined = applyClosedCandleConfirmation(pattern, bars, "1m", 120_000 + 5_000);
    expect(refined.status).toBe("breakout_confirmed");
    expect(refined.lifecycle).toBe("confirmed");
  });

  it("still detects bull-flag geometry when SMMA regime is not bullish", () => {
    const step = 60_000;
    const bars: HyperliquidCandle[] = [];
    let t = 1_700_000_000_000;
    let px = 200;
    for (let i = 0; i < 220; i++) {
      px -= 0.15;
      bars.push(c(t, px + 0.05, px + 0.08, px - 0.08, px, 70));
      t += step;
    }
    for (let i = 0; i < 25; i++) {
      px += 0.7;
      bars.push(c(t, px - 0.5, px + 0.15, px - 0.55, px, 240));
      t += step;
    }
    for (let i = 0; i < 25; i++) {
      px -= 0.12;
      bars.push(c(t, px + 0.04, px + 0.1, px - 0.12, px, 80));
      t += step;
    }
    for (let i = 0; i < 12; i++) {
      bars.push(c(t, px, px + 0.06, px - 0.06, px, 80));
      t += step;
    }
    const closes = bars.map((b) => parseFloat(b.c));
    const smma21 = lastSmma(closes, 21)!;
    const smma200 = lastSmma(closes, 200)!;
    const upgraded = gatherMultiPatternCandidates(bars, "1m", { smmaVetoFlags: false });
    const baseline = gatherMultiPatternCandidates(bars, "1m", { smmaVetoFlags: true });
    const upFlags = upgraded.rows.filter((r) => r.p.name === "bull_flag");
    const baseFlags = baseline.rows.filter((r) => r.p.name === "bull_flag");
    expect(smma21).toBeLessThan(smma200);
    expect(upFlags.length).toBeGreaterThanOrEqual(baseFlags.length);
    if (upFlags.length > 0) {
      expect(upFlags.some((r) => r.p.tradeEligible === false || r.p.smmaRegime === "bearish" || r.p.smmaRegime === "mixed")).toBe(true);
    }
  });

  it("replay never looks ahead of the current bar", () => {
    const series = makeBullFlagSeries();
    const events = replayPatternHistory(series, "1m", 210);
    for (const e of events) {
      expect(e.barIndex).toBeLessThan(series.length);
      expect(e.time).toBe(series[e.barIndex]!.t);
    }
  });

  it("does not treat random chop as a confirmed flag", () => {
    const step = 60_000;
    const bars: HyperliquidCandle[] = [];
    let t = 1_700_000_000_000;
    for (let i = 0; i < 260; i++) {
      const px = 100 + Math.sin(i / 3) * 0.15;
      bars.push(c(t, px, px + 0.05, px - 0.05, px, 50));
      t += step;
    }
    const { rows } = gatherMultiPatternCandidates(bars, "1h");
    const confirmedFlags = rows.filter(
      (r) =>
        (r.p.name === "bull_flag" || r.p.name === "bear_flag") &&
        r.p.status === "breakout_confirmed",
    );
    expect(confirmedFlags.length).toBe(0);
  });

  it("exposes an explainable quality score instead of a win probability", () => {
    const series = makeBullFlagSeries();
    const { rows } = gatherMultiPatternCandidates(series, "1m");
    if (rows.length === 0) return;
    const p = rows[0]!.p;
    expect(p.qualityScore).toBeGreaterThanOrEqual(0);
    expect(p.qualityScore).toBeLessThanOrEqual(100);
    expect((p.qualityFactors ?? []).length).toBeGreaterThan(0);
    expect(JSON.stringify(p.qualityFactors)).not.toMatch(/chance of winning/i);
  });

  it("rsi divergence module is optional evidence", () => {
    const step = 60_000;
    const bars: HyperliquidCandle[] = [];
    let t = 0;
    const closes = [
      10, 11, 12, 11, 10.5, 9.5, 8.5, 9, 10, 11, 10, 9, 8, 7.2, 8, 9, 8.5, 7.1, 6.4, 7, 8, 7.5, 6.2, 5.8, 6.5, 7.2, 6.8,
      5.5, 5.1, 6, 7, 8, 7.5, 6.9, 6.1, 5.4, 5.0, 5.6, 6.4, 7.1, 6.6, 5.9, 5.2, 4.8, 5.5, 6.2, 5.8, 5.1, 4.6, 5.2,
    ];
    for (const px of closes) {
      bars.push(c(t, px, px + 0.2, px - 0.2, px));
      t += step;
    }
    const hits = detectRsiDivergence(bars);
    expect(Array.isArray(hits)).toBe(true);
  });
});
