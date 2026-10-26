import type { HyperliquidCandle } from "./hyperliquid";
import {
  getPatternStructuralBias,
  type DetectedPattern,
  type PatternLifecycle,
  type QualityFactor,
} from "./sma-detection";
import { classifySmmaTrend, type SmmaTrendRegime } from "@shared/smma";
import { wilderAtr } from "@shared/atr";
import { lastClosedBarIndex } from "@shared/ohlcv-normalize";
import { stampPatternGeometry } from "./pattern-geometry";

export type { PatternLifecycle, QualityFactor };

function num(v: string | number): number {
  const x = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(x) ? x : NaN;
}

/**
 * Wick-only breaks stay pending. Confirmed requires a *closed* candle close beyond the frozen boundary.
 */
export function applyClosedCandleConfirmation(
  pattern: DetectedPattern,
  candles: HyperliquidCandle[],
  interval: string,
  nowMs: number = Date.now(),
): DetectedPattern {
  const closedIdx = lastClosedBarIndex(candles, interval, nowMs);
  if (closedIdx < 0) return { ...pattern, lifecycle: "candidate" };

  const closed = candles[closedIdx]!;
  const close = num(closed.c);
  const high = num(closed.h);
  const low = num(closed.l);
  const b = pattern.breakoutLevel;
  const bias = getPatternStructuralBias(pattern);

  let status = pattern.status;
  let lifecycle: PatternLifecycle = "developing";
  let reason = "Structure developing; no closed-candle breakout yet.";

  if (bias === "bullish") {
    const closedBreak = close > b;
    const wickBreak = high > b;
    if (closedBreak) {
      status = "breakout_confirmed";
      lifecycle = "confirmed";
      reason = "Closed candle close above breakout boundary.";
    } else if (wickBreak || status === "breakout_pending") {
      status = "breakout_pending";
      lifecycle = "breakout_pending";
      reason = wickBreak
        ? "Wick tested the boundary; waiting for a close through it."
        : "Price testing boundary; confirmation needs a close.";
    } else {
      status = "forming";
      lifecycle = pattern.status === "forming" ? "developing" : "candidate";
    }
  } else if (bias === "bearish") {
    const closedBreak = close < b;
    const wickBreak = low < b;
    if (closedBreak) {
      status = "breakout_confirmed";
      lifecycle = "confirmed";
      reason = "Closed candle close below breakout boundary.";
    } else if (wickBreak || status === "breakout_pending") {
      status = "breakout_pending";
      lifecycle = "breakout_pending";
      reason = wickBreak
        ? "Wick tested the boundary; waiting for a close through it."
        : "Price testing boundary; confirmation needs a close.";
    } else {
      status = "forming";
      lifecycle = pattern.status === "forming" ? "developing" : "candidate";
    }
  } else {
    lifecycle = status === "breakout_confirmed" ? "confirmed" : "developing";
  }

  const currentPrice = num(candles[candles.length - 1]!.c);
  return {
    ...pattern,
    status,
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : pattern.currentPrice,
    lifecycle,
    lifecycleReason: reason,
    breakoutLevel: b,
  };
}

export function smmaTradeEligible(
  pattern: DetectedPattern,
  closes: number[],
  atr: number | null,
): { eligible: boolean; regime: SmmaTrendRegime | "unknown"; reason: string } {
  const ctx = classifySmmaTrend(closes, atr);
  const bias = getPatternStructuralBias(pattern);
  if (!ctx) {
    return { eligible: true, regime: "unknown", reason: "SMMA warm-up incomplete — eligibility not blocked." };
  }
  if (bias === "bullish" && ctx.regime === "bearish") {
    return {
      eligible: false,
      regime: ctx.regime,
      reason: "Geometry is bullish but 21/200 SMMA regime is bearish (shown, not trade-eligible).",
    };
  }
  if (bias === "bearish" && ctx.regime === "bullish") {
    return {
      eligible: false,
      regime: ctx.regime,
      reason: "Geometry is bearish but 21/200 SMMA regime is bullish (shown, not trade-eligible).",
    };
  }
  return {
    eligible: true,
    regime: ctx.regime,
    reason:
      ctx.regime === "mixed"
        ? "SMMA mixed/chop — pattern shown; treat eligibility as cautious."
        : `SMMA regime ${ctx.regime} does not veto this structure.`,
  };
}

export function scorePatternQuality(
  pattern: DetectedPattern,
  opts: {
    volumeOk: boolean;
    tradeEligible: boolean;
    atr: number | null;
    dataGaps: number;
    mtfAligned?: boolean;
  },
): { qualityScore: number; qualityFactors: QualityFactor[] } {
  const factors: QualityFactor[] = [];
  const geom = Math.max(0, Math.min(50, Math.round(pattern.confidence * 0.55)));
  factors.push({ name: "geometry", points: geom, note: "Detector confidence mapped to 0–50." });

  if (pattern.lifecycle === "confirmed" || pattern.status === "breakout_confirmed") {
    factors.push({ name: "closed_breakout", points: 16, note: "Closed-candle confirmation." });
  } else if (pattern.lifecycle === "breakout_pending" || pattern.status === "breakout_pending") {
    factors.push({ name: "boundary_test", points: 8, note: "Boundary test without closed confirmation." });
  } else if (pattern.lifecycle === "expired" || pattern.lifecycle === "invalidated") {
    factors.push({ name: "expired", points: -20, note: pattern.lifecycleReason || "Pattern expired." });
  } else {
    factors.push({ name: "developing", points: 3, note: "Structure only." });
  }

  const age = pattern.geometry?.formationAgeBars ?? 0;
  if (age > 12) {
    factors.push({ name: "formation_age", points: -6, note: `Structure completed ${age} bars ago.` });
  } else if (pattern.geometry?.formedAtTs) {
    factors.push({ name: "formation_age", points: 2, note: "Formation is still current on this timeframe." });
  }
  if (pattern.geometry && pattern.geometry.channelQuality < 0.7) {
    factors.push({
      name: "channel_quality",
      points: -4,
      note: `Channel respect ${(pattern.geometry.channelQuality * 100).toFixed(0)}%.`,
    });
  }

  factors.push(
    opts.volumeOk
      ? { name: "volume", points: 10, note: "Flag/pole volume relationship supportive." }
      : { name: "volume", points: 0, note: "No volume confirmation." },
  );

  factors.push(
    opts.tradeEligible
      ? { name: "smma_context", points: 12, note: "SMMA regime does not conflict." }
      : { name: "smma_context", points: -8, note: "SMMA conflict — still displayed, not trade-eligible." },
  );

  if (opts.mtfAligned) {
    factors.push({ name: "htf_alignment", points: 8, note: "Higher-timeframe SMMA agrees." });
  }

  if (opts.dataGaps > 2) {
    factors.push({ name: "data_integrity", points: -10, note: `${opts.dataGaps} candle gaps in series.` });
  } else {
    factors.push({ name: "data_integrity", points: 6, note: "Series integrity acceptable." });
  }

  if (opts.atr != null && opts.atr > 0) {
    const width = Math.abs(pattern.takeProfit - pattern.entryPrice) / opts.atr;
    if (width >= 1) factors.push({ name: "range_vs_atr", points: 4, note: "Target distance ≥ 1 ATR." });
  }

  const qualityScore = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  return { qualityScore, qualityFactors: factors };
}

export function enrichDetectedPattern(
  pattern: DetectedPattern,
  candles: HyperliquidCandle[],
  interval: string,
  extras: { volumeOk: boolean; mtfAligned?: boolean; dataGaps?: number; nowMs?: number },
): DetectedPattern {
  const confirmed = applyClosedCandleConfirmation(pattern, candles, interval, extras.nowMs);
  const stamped = stampPatternGeometry(confirmed, candles, interval, extras.nowMs ?? Date.now());
  const closes = candles.map((c) => num(c.c)).filter(Number.isFinite);
  const atr = wilderAtr(candles);
  const elig = smmaTradeEligible(stamped, closes, atr);
  const { qualityScore, qualityFactors } = scorePatternQuality(stamped, {
    volumeOk: extras.volumeOk,
    tradeEligible: elig.eligible,
    atr,
    dataGaps: extras.dataGaps ?? 0,
    mtfAligned: extras.mtfAligned,
  });
  return {
    ...stamped,
    tradeEligible: elig.eligible,
    tradeEligibilityReason: elig.reason,
    smmaRegime: elig.regime,
    qualityScore,
    qualityFactors,
  };
}
