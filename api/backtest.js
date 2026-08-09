/*
TradeMind Pro
V10.19 Historical Backtest Engine

PAPER BACKTEST ONLY
NO REAL ORDERS

NIFTY 50
INDstocks historical candles
5 minute default
*/

const CONFIG = {
  VERSION: "V10.19",

  EMA_FAST: 9,
  EMA_SLOW: 21,
  RSI_PERIOD: 14,
  ATR_PERIOD: 14,

  ATR_STOP_MULTIPLIER: 1.5,
  RISK_REWARD: 2,

  MIN_DIRECTIONAL_STRENGTH: 0.30,
  MIN_EMA_ATR_SEPARATION: 0.25,

  EMA_SLOPE_LOOKBACK: 3,
  MIN_BUY_EMA9_SLOPE_ATR: 0.03,
  MIN_SELL_EMA9_SLOPE_ATR: 0.02,
  MIN_BUY_EMA21_SLOPE_ATR: 0,
  MIN_SELL_EMA21_SLOPE_ATR: 0,

  MIN_VWAP_ATR_DISTANCE: 0.05,

  MIN_PULLBACK_ATR: 0.08,
  MAX_PULLBACK_ATR: 0.85,

  MIN_REJECTION_WICK_RATIO: 0.20,
  MIN_CANDLE_BODY_RATIO: 0.40,
  MIN_CLOSE_LOCATION: 0.60,

  MAX_EMA_EXTENSION_ATR: 1.15,
  HARD_EMA_EXTENSION_ATR: 1.40,

  SELL_RSI_MIN: 35,
  SELL_RSI_MAX: 48,

  BUY_RSI_MIN: 50,
  BUY_RSI_MAX: 65,
  BUY_RSI_HARD_MAX: 68,

  MIN_BUY_RSI_RISE: 0.25,
  MAX_BUY_RSI_DROP: 1.25,

  MAX_CURRENT_BODY_ATR: 1.25,
  MAX_PREVIOUS_BODY_ATR: 1.50,

  MAX_ENTRY_GAP_ATR: 0.25,

  COOLDOWN_CANDLES: 3,

  ENTRY_START_MINUTES: 9 * 60 + 20,
  ENTRY_END_MINUTES: 15 * 60,
  SESSION_CLOSE_MINUTES: 15 * 60 + 25
};


// ===============================
// EMA
// ===============================

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);

  let value =
    values
      .slice(0, period)
      .reduce((sum, v) => sum + Number(v), 0) / period;

  for (let i = period; i < values.length; i++) {
    value =
      ((Number(values[i]) - value) * multiplier) + value;
  }

  return value;
}


// ===============================
// RSI
// ===============================

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change =
      Number(values[i]) - Number(values[i - 1]);

    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const change =
      Number(values[i]) - Number(values[i - 1]);

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain =
      ((averageGain * (period - 1)) + gain) / period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) / period;
  }

  if (averageLoss === 0) return 100;

  const rs = averageGain / averageLoss;

  return 100 - (100 / (1 + rs));
}


// ===============================
// ATR
// ===============================

function trueRange(current, previous) {
  const high = Number(current.h);
  const low = Number(current.l);
  const previousClose = Number(previous.c);

  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return null;
  }

  if (!Number.isFinite(previousClose)) {
    return high - low;
  }

  return Math.max(
    high - low,
    Math.abs(high - previousClose),
    Math.abs(low - previousClose)
  );
}


function atr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) {
    return null;
  }

  const ranges = [];

  for (let i = 1; i < candles.length; i++) {
    const tr =
      trueRange(candles[i], candles[i - 1]);

    if (Number.isFinite(tr)) {
      ranges.push(tr);
    }
  }

  if (ranges.length < period) return null;

  let value =
    ranges
      .slice(0, period)
      .reduce((sum, v) => sum + v, 0) / period;

  for (let i = period; i < ranges.length; i++) {
    value =
      ((value * (period - 1)) + ranges[i]) / period;
  }

  return value;
}


// ===============================
// IST HELPERS
// ===============================

function getISTDate(timestamp) {
  const date = new Date(
    Number(timestamp) * 1000 +
    5.5 * 60 * 60 * 1000
  );

  return date.toISOString().slice(0, 10);
}


function getISTMinutes(timestamp) {
  const date = new Date(
    Number(timestamp) * 1000 +
    5.5 * 60 * 60 * 1000
  );

  return (
    date.getUTCHours() * 60 +
    date.getUTCMinutes()
  );
}


// ===============================
// VWAP
// ===============================

function vwap(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return null;
  }

  const latest =
    candles[candles.length - 1];

  const session =
    getISTDate(latest.ts);

  let totalPV = 0;
  let totalVolume = 0;

  for (const candle of candles) {
    if (getISTDate(candle.ts) !== session) {
      continue;
    }

    const high = Number(candle.h);
    const low = Number(candle.l);
    const close = Number(candle.c);
    const volume = Number(candle.v);

    if (
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      continue;
    }

    const typicalPrice =
      (high + low + close) / 3;

    totalPV += typicalPrice * volume;
    totalVolume += volume;
  }

  if (totalVolume <= 0) return null;

  return totalPV / totalVolume;
}


// ===============================
// NORMALIZE CANDLES
// ===============================

function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];

  return candles
    .map(candle => {
      let normalized;

      if (Array.isArray(candle)) {
        normalized = {
          ts: Number(candle[0]),
          o: Number(candle[1]),
          h: Number(candle[2]),
          l: Number(candle[3]),
          c: Number(candle[4]),
          v: Number(candle[5] ?? 0)
        };
      } else if (
        candle &&
        typeof candle === "object"
      ) {
        normalized = {
          ts: Number(candle.ts),
          o: Number(candle.o),
          h: Number(candle.h),
          l: Number(candle.l),
          c: Number(candle.c),
          v: Number(candle.v ?? 0)
        };
      } else {
        return null;
      }

      if (
        !Number.isFinite(normalized.ts) ||
        !Number.isFinite(normalized.o) ||
        !Number.isFinite(normalized.h) ||
        !Number.isFinite(normalized.l) ||
        !Number.isFinite(normalized.c) ||
        normalized.h < normalized.l
      ) {
        return null;
      }

      return normalized;
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}


// ===============================
// CANDLE ANALYSIS
// ===============================

function analyzeCandle(candle) {
  const open = Number(candle.o);
  const high = Number(candle.h);
  const low = Number(candle.l);
  const close = Number(candle.c);

  const range =
    Math.max(high - low, 0);

  const body =
    Math.abs(close - open);

  const upperWick =
    high - Math.max(open, close);

  const lowerWick =
    Math.min(open, close) - low;

  const bodyRatio =
    range > 0 ? body / range : 0;

  const closeLocation =
    range > 0
      ? (close - low) / range
      : 0.5;

  return {
    range,
    body,
    upperWick,
    lowerWick,
    bodyRatio,
    closeLocation,
    bullish: close > open,
    bearish: close < open
  };
}


// ===============================
// INDICATORS
// ===============================

function calculateHistoricalIndicators(
  candles,
  index
) {
  const history =
    candles.slice(0, index + 1);

  if (
    history.length <
    CONFIG.EMA_SLOW + 5
  ) {
    return null;
  }

  const closes =
    history.map(c => Number(c.c));

  const ema9Value =
    ema(closes, CONFIG.EMA_FAST);

  const ema21Value =
    ema(closes, CONFIG.EMA_SLOW);

  const rsiValue =
    rsi(
      closes,
      CONFIG.RSI_PERIOD
    );

  const atrValue =
    atr(
      history,
      CONFIG.ATR_PERIOD
    );

  const vwapValue =
    vwap(history);

  if (
    !Number.isFinite(ema9Value) ||
    !Number.isFinite(ema21Value) ||
    !Number.isFinite(rsiValue) ||
    !Number.isFinite(atrValue) ||
    !Number.isFinite(vwapValue)
  ) {
    return null;
  }

  const lookback =
    CONFIG.EMA_SLOPE_LOOKBACK;

  const previousCloses =
    history
      .slice(0, history.length - lookback)
      .map(c => Number(c.c));

  const ema9Previous =
    ema(
      previousCloses,
      CONFIG.EMA_FAST
    );

  const ema21Previous =
    ema(
      previousCloses,
      CONFIG.EMA_SLOW
    );

  const ema9Slope =
    Number.isFinite(ema9Previous)
      ? ema9Value - ema9Previous
      : null;

  const ema21Slope =
    Number.isFinite(ema21Previous)
      ? ema21Value - ema21Previous
      : null;

  const emaSpread =
    Math.abs(
      ema9Value - ema21Value
    );

  const directionalStrength =
    atrValue > 0
      ? emaSpread / atrValue
      : 0;

  const previousHistory =
    history.slice(0, history.length - 1);

  const previousPreviousHistory =
    history.slice(0, history.length - 2);

  const previousRSI =
    rsi(
      previousHistory.map(c => Number(c.c)),
      CONFIG.RSI_PERIOD
    );

  const previousPreviousRSI =
    rsi(
      previousPreviousHistory.map(c => Number(c.c)),
      CONFIG.RSI_PERIOD
    );

  return {
    ema9: ema9Value,
    ema21: ema21Value,

    ema9Slope,
    ema21Slope,

    emaSpread,

    rsi14: rsiValue,
    previousRSI,
    previousPreviousRSI,

    atr14: atrValue,
    vwap: vwapValue,

    directionalStrength
  };
}


// ===============================
// SIGNAL ENGINE V10.19
// ===============================

function getSignal(
  candle,
  indicators,
  previousCandle,
  previousPreviousCandle
) {
  if (!candle || !indicators) {
    return {
      signal: "WAIT",
      buyScore: 0,
      sellScore: 0,
      reason: "Missing data",
      diagnostics: {}
    };
  }

  const ema9 =
    Number(indicators.ema9);

  const ema21 =
    Number(indicators.ema21);

  const ema9Slope =
    Number(indicators.ema9Slope);

  const ema21Slope =
    Number(indicators.ema21Slope);

  const emaSpread =
    Number(indicators.emaSpread);

  const rsi14 =
    Number(indicators.rsi14);

  const previousRSI =
    Number(indicators.previousRSI);

  const atr14 =
    Number(indicators.atr14);

  const vwapValue =
    Number(indicators.vwap);

  const directionalStrength =
    Number(indicators.directionalStrength);

  if (
    ![
      ema9,
      ema21,
      ema9Slope,
      ema21Slope,
      emaSpread,
      rsi14,
      atr14,
      vwapValue,
      directionalStrength
    ].every(Number.isFinite) ||
    atr14 <= 0
  ) {
    return {
      signal: "WAIT",
      buyScore: 0,
      sellScore: 0,
      reason: "Indicators unavailable",
      diagnostics: {}
    };
  }

  const current =
    analyzeCandle(candle);

  const previous =
    previousCandle
      ? analyzeCandle(previousCandle)
      : null;

  const previousPrevious =
    previousPreviousCandle
      ? analyzeCandle(previousPreviousCandle)
      : null;

  const close =
    Number(candle.c);

  const bullishTrend =
    ema9 > ema21;

  const bearishTrend =
    ema9 < ema21;

  const strongTrend =
    directionalStrength >=
    CONFIG.MIN_DIRECTIONAL_STRENGTH;

  const strongEMASeparation =
    emaSpread / atr14 >=
    CONFIG.MIN_EMA_ATR_SEPARATION;

  const bullishSlope =
    ema9Slope >=
      atr14 *
      CONFIG.MIN_BUY_EMA9_SLOPE_ATR &&
    ema21Slope >=
      atr14 *
      CONFIG.MIN_BUY_EMA21_SLOPE_ATR;

  const bearishSlope =
    ema9Slope <=
      -(atr14 *
      CONFIG.MIN_SELL_EMA9_SLOPE_ATR) &&
    ema21Slope <=
      -(atr14 *
      CONFIG.MIN_SELL_EMA21_SLOPE_ATR);

  const aboveVWAP =
    close > vwapValue;

  const belowVWAP =
    close < vwapValue;

  const vwapDistanceATR =
    Math.abs(
      close - vwapValue
    ) / atr14;

  const vwapConfirmed =
    vwapDistanceATR >=
    CONFIG.MIN_VWAP_ATR_DISTANCE;

  const emaExtensionATR =
    Math.abs(
      close - ema9
    ) / atr14;

  const notOverextended =
    emaExtensionATR <=
    CONFIG.MAX_EMA_EXTENSION_ATR;

  const hardOverextended =
    emaExtensionATR >
    CONFIG.HARD_EMA_EXTENSION_ATR;


  // -------------------------------
  // PULLBACK
  // -------------------------------

  const previousDistanceATR =
    previousCandle
      ? Math.abs(
          Number(previousCandle.c) -
          ema9
        ) / atr14
      : Infinity;

  const previousHighDistanceATR =
    previousCandle
      ? Math.abs(
          Number(previousCandle.h) -
          ema9
        ) / atr14
      : Infinity;

  const previousLowDistanceATR =
    previousCandle
      ? Math.abs(
          Number(previousCandle.l) -
          ema9
        ) / atr14
      : Infinity;

  const bullishPullback =
    !!previous &&
    previousLowDistanceATR <=
      CONFIG.MAX_PULLBACK_ATR &&
    Number(previousCandle.l) <=
      ema9 + atr14 * 0.10 &&
    previousDistanceATR >=
      CONFIG.MIN_PULLBACK_ATR;

  const bearishPullback =
    !!previous &&
    previousHighDistanceATR <=
      CONFIG.MAX_PULLBACK_ATR &&
    Number(previousCandle.h) >=
      ema9 - atr14 * 0.10 &&
    previousDistanceATR >=
      CONFIG.MIN_PULLBACK_ATR;


  // -------------------------------
  // RECOVERY
  // -------------------------------

  const buyRecovery =
    close > ema9 &&
    (
      !previousCandle ||
      close >
      Number(previousCandle.c)
    );

  const sellRecovery =
    close < ema9 &&
    (
      !previousCandle ||
      close <
      Number(previousCandle.c)
    );


  // -------------------------------
  // REJECTION
  // -------------------------------

  const bullishLowerWick =
    current.lowerWick >=
    current.range *
    CONFIG.MIN_REJECTION_WICK_RATIO;

  const bearishUpperWick =
    current.upperWick >=
    current.range *
    CONFIG.MIN_REJECTION_WICK_RATIO;

  const bullishClose =
    current.bullish &&
    current.closeLocation >=
    CONFIG.MIN_CLOSE_LOCATION;

  const bearishClose =
    current.bearish &&
    current.closeLocation <=
    1 - CONFIG.MIN_CLOSE_LOCATION;

  const bullishRejection =
    bullishLowerWick &&
    bullishClose &&
    current.bodyRatio >=
    CONFIG.MIN_CANDLE_BODY_RATIO;

  const bearishRejection =
    bearishUpperWick &&
    bearishClose &&
    current.bodyRatio >=
    CONFIG.MIN_CANDLE_BODY_RATIO;


  // -------------------------------
  // RSI
  // -------------------------------

  const sellRSI =
    rsi14 >= CONFIG.SELL_RSI_MIN &&
    rsi14 <= CONFIG.SELL_RSI_MAX;

  const buyRSIZone =
    rsi14 >= CONFIG.BUY_RSI_MIN &&
    rsi14 <= CONFIG.BUY_RSI_MAX;

  const buyRSIRecovery =
    Number.isFinite(previousRSI) &&
    rsi14 >=
      previousRSI -
      CONFIG.MAX_BUY_RSI_DROP &&
    rsi14 -
      previousRSI >=
      CONFIG.MIN_BUY_RSI_RISE;

  const buyRSINotOverbought =
    rsi14 <=
    CONFIG.BUY_RSI_HARD_MAX;


  // -------------------------------
  // PRESSURE
  // -------------------------------

  let bearishPressure = 0;
  let bullishPressure = 0;

  if (previous?.bearish) {
    bearishPressure++;
  }

  if (previousPrevious?.bearish) {
    bearishPressure++;
  }

  if (previous?.bullish) {
    bullishPressure++;
  }

  if (previousPrevious?.bullish) {
    bullishPressure++;
  }

  const noHeavyBearishPressure =
    bearishPressure <= 1;

  const noHeavyBullishPressure =
    bullishPressure <= 1;


  // -------------------------------
  // EXPANSION
  // -------------------------------

  const currentBodyATR =
    current.body / atr14;

  const previousBodyATR =
    previous
      ? previous.body / atr14
      : 0;

  const currentNotExpanded =
    currentBodyATR <=
    CONFIG.MAX_CURRENT_BODY_ATR;

  const previousNotExpanded =
    previousBodyATR <=
    CONFIG.MAX_PREVIOUS_BODY_ATR;


  // -------------------------------
  // ENTRY GAP
  // -------------------------------

  const entryGapATR =
    previousCandle
      ? (
          Number(candle.o) -
          Number(previousCandle.c)
        ) / atr14
      : 0;

  const entryGapAcceptable =
    Math.abs(entryGapATR) <=
    CONFIG.MAX_ENTRY_GAP_ATR;


  // ===============================
  // BUY SCORE
  // ===============================

  let buyScore = 0;

  const buyReasons = [];

  if (bullishTrend) {
    buyScore++;
    buyReasons.push(
      "Bullish trend"
    );
  }

  if (bullishSlope) {
    buyScore++;
    buyReasons.push(
      "EMA slopes bullish"
    );
  }

  if (strongEMASeparation) {
    buyScore++;
    buyReasons.push(
      "Strong EMA separation"
    );
  }

  if (strongTrend) {
    buyScore++;
    buyReasons.push(
      "Trend strength"
    );
  }

  if (
    aboveVWAP &&
    vwapConfirmed
  ) {
    buyScore++;
    buyReasons.push(
      "VWAP confirmation"
    );
  }

  if (bullishPullback) {
    buyScore++;
    buyReasons.push(
      "Actual EMA9 pullback"
    );
  }

  if (bullishRejection) {
    buyScore++;
    buyReasons.push(
      "Bullish rejection"
    );
  }

  if (buyRecovery) {
    buyScore++;
    buyReasons.push(
      "Bullish recovery"
    );
  }

  if (buyRSIZone) {
    buyScore++;
    buyReasons.push(
      "BUY RSI zone"
    );
  }

  if (buyRSIRecovery) {
    buyScore++;
    buyReasons.push(
      "RSI recovery"
    );
  }

  if (noHeavyBearishPressure) {
    buyScore++;
    buyReasons.push(
      "No heavy bearish pressure"
    );
  }

  if (notOverextended) {
    buyScore++;
    buyReasons.push(
      "Not overextended"
    );
  }

  if (
    currentNotExpanded &&
    previousNotExpanded
  ) {
    buyScore++;
    buyReasons.push(
      "No expansion candle"
    );
  }

  if (entryGapAcceptable) {
    buyScore++;
    buyReasons.push(
      "Entry gap acceptable"
    );
  }


  // ===============================
  // SELL SCORE
  // ===============================

  let sellScore = 0;

  const sellReasons = [];

  if (bearishTrend) {
    sellScore++;
    sellReasons.push(
      "Bearish trend"
    );
  }

  if (bearishSlope) {
    sellScore++;
    sellReasons.push(
      "EMA slopes bearish"
    );
  }

  if (strongEMASeparation) {
    sellScore++;
    sellReasons.push(
      "Strong EMA separation"
    );
  }

  if (strongTrend) {
    sellScore++;
    sellReasons.push(
      "Trend strength"
    );
  }

  if (
    belowVWAP &&
    vwapConfirmed
  ) {
    sellScore++;
    sellReasons.push(
      "VWAP confirmation"
    );
  }

  if (bearishPullback) {
    sellScore++;
    sellReasons.push(
      "Actual EMA9 pullback"
    );
  }

  if (bearishRejection) {
    sellScore++;
    sellReasons.push(
      "Bearish rejection"
    );
  }

  if (sellRecovery) {
    sellScore++;
    sellReasons.push(
      "Bearish recovery"
    );
  }

  if (sellRSI) {
    sellScore++;
    sellReasons.push(
      "RSI momentum"
    );
  }

  if (noHeavyBullishPressure) {
    sellScore++;
    sellReasons.push(
      "No heavy bullish pressure"
    );
  }

  if (notOverextended) {
    sellScore++;
    sellReasons.push(
      "Not overextended"
    );
  }

  if (
    currentNotExpanded &&
    previousNotExpanded
  ) {
    sellScore++;
    sellReasons.push(
      "No expansion candle"
    );
  }

  if (entryGapAcceptable) {
    sellScore++;
    sellReasons.push(
      "Entry gap acceptable"
    );
  }


  // ===============================
  // STRICT BUY
  // ===============================

  const strictBuy =
    bullishTrend &&
    bullishSlope &&
    strongEMASeparation &&
    strongTrend &&
    aboveVWAP &&
    vwapConfirmed &&
    bullishPullback &&
    bullishRejection &&
    buyRecovery &&
    buyRSIZone &&
    buyRSIRecovery &&
    buyRSINotOverbought &&
    noHeavyBearishPressure &&
    notOverextended &&
    !hardOverextended &&
    currentNotExpanded &&
    previousNotExpanded &&
    entryGapAcceptable;


  // ===============================
  // STRICT SELL
  // ===============================

  const strictSell =
    bearishTrend &&
    bearishSlope &&
    strongEMASeparation &&
    strongTrend &&
    belowVWAP &&
    vwapConfirmed &&
    bearishPullback &&
    bearishRejection &&
    sellRecovery &&
    sellRSI &&
    noHeavyBullishPressure &&
    notOverextended &&
    !hardOverextended &&
    currentNotExpanded &&
    previousNotExpanded &&
    entryGapAcceptable;


  let signal = "WAIT";

  let reason =
    "Waiting for V10.19 confirmation";

  if (
    strictBuy &&
    buyScore > sellScore
  ) {
    signal = "BUY";
    reason =
      buyReasons.join(" + ");
  } else if (
    strictSell &&
    sellScore > buyScore
  ) {
    signal = "SELL";
    reason =
      sellReasons.join(" + ");
  }


  return {
    signal,
    buyScore,
    sellScore,
    reason,

    diagnostics: {
      emaSpread,
      directionalStrength,

      bodyRatio:
        current.bodyRatio,

      closeLocation:
        current.closeLocation,

      entryGapATR,

      emaExtensionATR,

      pullbackDistanceATR:
        Math.abs(close - ema9) / atr14,

      previousDistanceATR,

      currentBodyATR,
      previousBodyATR,

      vwapDistanceATR,

      bullishTrend,
      bearishTrend,

      bullishSlope,
      bearishSlope,

      strongTrend,
      strongEMASeparation,

      aboveVWAP,
      belowVWAP,

      vwapConfirmed,

      bullishPullback,
      bearishPullback,

      bullishRejection,
      bearishRejection,

      buyRecovery,
      sellRecovery,

      buyRSIZone,
      buyRSIRecovery,
      buyRSINotOverbought,

      sellRSI,

      bearishPressure,
      bullishPressure,

      noHeavyBearishPressure,
      noHeavyBullishPressure,

      notOverextended,
      hardOverextended,

      currentNotExpanded,
      previousNotExpanded,

      entryGapAcceptable
    }
  };
}


// ===============================
// CLOSE POSITION
// ===============================

function closePosition(
  position,
  exitPrice,
  exitTs,
  reason,
  equityState
) {
  const points =
    position.side === "BUY"
      ? exitPrice - position.entry
      : position.entry - exitPrice;

  equityState.equity += points;

  equityState.peakEquity =
    Math.max(
      equityState.peakEquity,
      equityState.equity
    );

  equityState.maxDrawdown =
    Math.max(
      equityState.maxDrawdown,
      equityState.peakEquity -
      equityState.equity
    );

  return {
    side: position.side,

    entry:
      Number(position.entry.toFixed(2)),

    stop:
      Number(position.stop.toFixed(2)),

    target:
      Number(position.target.toFixed(2)),

    exit:
      Number(exitPrice.toFixed(2)),

    points:
      Number(points.toFixed(2)),

    result:
      points > 0
        ? "WIN"
        : "LOSS",

    reason,

    entryTs:
      position.entryTs,

    exitTs,

    signalTs:
      position.signalTs,

    entryTime:
      new Date(
        position.entryTs * 1000
      ).toISOString(),

    exitTime:
      new Date(
        exitTs * 1000
      ).toISOString(),

    signalTime:
      new Date(
        position.signalTs * 1000
      ).toISOString(),

    signal:
      position.signal,

    buyScore:
      position.signalBuyScore,

    sellScore:
      position.signalSellScore,

    signalReason:
      position.signalReason,

    ema9:
      Number(
        position.ema9?.toFixed(2)
      ),

    ema21:
      Number(
        position.ema21?.toFixed(2)
      ),

    ema9Slope:
      Number(
        position.ema9Slope?.toFixed(2)
      ),

    ema21Slope:
      Number(
        position.ema21Slope?.toFixed(2)
      ),

    emaSpread:
      Number(
        position.emaSpread?.toFixed(2)
      ),

    rsi14:
      Number(
        position.rsi14?.toFixed(2)
      ),

    vwap:
      Number(
        position.vwap?.toFixed(2)
      ),

    atr14:
      Number(
        position.atr?.toFixed(2)
      ),

    directionalStrength:
      Number(
        position.directionalStrength?.toFixed(3)
      ),

    bodyRatio:
      Number(
        position.bodyRatio?.toFixed(3)
      ),

    closeLocation:
      Number(
        position.closeLocation?.toFixed(3)
      ),

    entryGapATR:
      Number(
        position.entryGapATR?.toFixed(3)
      ),

    emaExtensionATR:
      Number(
        position.emaExtensionATR?.toFixed(3)
      ),

    pullbackDistanceATR:
      Number(
        position.pullbackDistanceATR?.toFixed(3)
      )
  };
}


// ===============================
// POSITION MANAGEMENT
// ===============================

function managePosition(
  position,
  candle,
  equityState
) {
  if (!position) return null;

  const open = Number(candle.o);
  const high = Number(candle.h);
  const low = Number(candle.l);

  if (position.side === "BUY") {

    if (open <= position.stop) {
      return closePosition(
        position,
        open,
        candle.ts,
        "STOP LOSS - GAP",
        equityState
      );
    }

    if (open >= position.target) {
      return closePosition(
        position,
        open,
        candle.ts,
        "TARGET - GAP",
        equityState
      );
    }

    if (low <= position.stop) {
      return closePosition(
        position,
        position.stop,
        candle.ts,
        "STOP LOSS",
        equityState
      );
    }

    if (high >= position.target) {
      return closePosition(
        position,
        position.target,
        candle.ts,
        "TARGET",
        equityState
      );
    }
  }


  if (position.side === "SELL") {

    if (open >= position.stop) {
      return closePosition(
        position,
        open,
        candle.ts,
        "STOP LOSS - GAP",
        equityState
      );
    }

    if (open <= position.target) {
      return closePosition(
        position,
        open,
        candle.ts,
        "TARGET - GAP",
        equityState
      );
    }

    if (high >= position.stop) {
      return closePosition(
        position,
        position.stop,
        candle.ts,
        "STOP LOSS",
        equityState
      );
    }

    if (low <= position.target) {
      return closePosition(
        position,
        position.target,
        candle.ts,
        "TARGET",
        equityState
      );
    }
  }

  return null;
}


// ===============================
// BACKTEST
// ===============================

function runBacktest(candles) {

  const trades = [];

  let position = null;
  let cooldown = 0;

  let previousSession = null;
  let previousSignal = "WAIT";

  const equityState = {
    equity: 0,
    peakEquity: 0,
    maxDrawdown: 0
  };

  const diagnostics = {
    weakTrend: 0,
    weakEMASeparation: 0,
    weakSlope: 0,

    weakBuyTrend: 0,
    weakBuySeparation: 0,
    weakBuySlope: 0,

    vwapTooClose: 0,
    invalidPullback: 0,

    buyPullbackRejected: 0,

    overextended: 0,
    hardOverextended: 0,

    rsiRejected: 0,

    buyRSIRejected: 0,
    buyRSIRecoveryRejected: 0,
    buyRSIZoneRejected: 0,

    buyBearishPressureRejected: 0,
    buyRejectionRejected: 0,
    buyRecoveryRejected: 0,

    buyVWAPDistanceRejected: 0,
    buyExtensionRejected: 0,
    buyExpansionRejected: 0,

    sellPullbackRejected: 0,
    sellRejectionRejected: 0,
    sellRecoveryRejected: 0,
    sellRSIRejected: 0,
    sellBullishPressureRejected: 0,
    sellExpansionRejected: 0,

    weakCandle: 0,
    buyCandleRejected: 0,
    bearishCandleRejected: 0,

    bullishCloseRejected: 0,
    bearishCloseRejected: 0,

    entryGapRejected: 0,
    sessionRejected: 0,
    duplicateSignalRejected: 0,
    cooldownRejected: 0,
    noTradeSignal: 0
  };


  const startIndex =
    Math.max(
      CONFIG.EMA_SLOW + 10,
      CONFIG.RSI_PERIOD + 10,
      CONFIG.ATR_PERIOD + 10
    );


  for (
    let i = startIndex;
    i < candles.length;
    i++
  ) {

    const candle =
      candles[i];

    const previousCandle =
      i > 0
        ? candles[i - 1]
        : null;

    const previousPreviousCandle =
      i > 1
        ? candles[i - 2]
        : null;

    const session =
      getISTDate(candle.ts);

    const minutes =
      getISTMinutes(candle.ts);

    let closedThisCandle = false;


    // =============================
    // SESSION CHANGE
    // =============================

    if (
      previousSession !== null &&
      session !== previousSession
    ) {

      if (position) {

        const previousSessionCandle =
          candles[i - 1];

        trades.push(
          closePosition(
            position,
            previousSessionCandle.c,
            previousSessionCandle.ts,
            "SESSION CLOSE",
            equityState
          )
        );

        position = null;

        cooldown =
          CONFIG.COOLDOWN_CANDLES;

        closedThisCandle = true;
      }

      previousSignal = "WAIT";
    }

    previousSession = session;


    // =============================
    // INDICATORS
    // =============================

    const indicators =
      calculateHistoricalIndicators(
        candles,
        i
      );

    let signalResult = null;
    let signal = "WAIT";


    if (indicators) {

      signalResult =
        getSignal(
          candle,
          indicators,
          previousCandle,
          previousPreviousCandle
        );

      signal =
        signalResult.signal;

      const d =
        signalResult.diagnostics;


      if (!d.strongTrend)
        diagnostics.weakTrend++;

      if (!d.strongEMASeparation)
        diagnostics.weakEMASeparation++;

      if (
        !d.bullishSlope &&
        !d.bearishSlope
      )
        diagnostics.weakSlope++;


      if (
        d.bullishTrend &&
        !d.strongTrend
      )
        diagnostics.weakBuyTrend++;


      if (
        d.bullishTrend &&
        !d.strongEMASeparation
      )
        diagnostics.weakBuySeparation++;


      if (
        d.bullishTrend &&
        !d.bullishSlope
      )
        diagnostics.weakBuySlope++;


      if (!d.vwapConfirmed)
        diagnostics.vwapTooClose++;


      if (
        !d.bullishPullback &&
        !d.bearishPullback
      )
        diagnostics.invalidPullback++;


      if (
        d.bullishTrend &&
        !d.bullishPullback
      )
        diagnostics.buyPullbackRejected++;


      if (!d.notOverextended)
        diagnostics.overextended++;


      if (d.hardOverextended)
        diagnostics.hardOverextended++;


      if (
        !d.buyRSIZone &&
        !d.sellRSI
      )
        diagnostics.rsiRejected++;


      if (
        d.bullishTrend &&
        !d.buyRSIZone
      )
        diagnostics.buyRSIZoneRejected++;


      if (
        d.bullishTrend &&
        !d.buyRSIRecovery
      )
        diagnostics.buyRSIRecoveryRejected++;


      if (
        d.bullishTrend &&
        !d.noHeavyBearishPressure
      )
        diagnostics.buyBearishPressureRejected++;


      if (
        d.bullishTrend &&
        !d.bullishRejection
      )
        diagnostics.buyRejectionRejected++;


      if (
        d.bullishTrend &&
        !d.buyRecovery
      )
        diagnostics.buyRecoveryRejected++;


      if (
        d.bullishTrend &&
        !d.vwapConfirmed
      )
        diagnostics.buyVWAPDistanceRejected++;


      if (
        d.bullishTrend &&
        !d.notOverextended
      )
        diagnostics.buyExtensionRejected++;


      if (
        d.bullishTrend &&
        (
          !d.currentNotExpanded ||
          !d.previousNotExpanded
        )
      )
        diagnostics.buyExpansionRejected++;


      if (
        d.bearishTrend &&
        !d.bearishPullback
      )
        diagnostics.sellPullbackRejected++;


      if (
        d.bearishTrend &&
        !d.bearishRejection
      )
        diagnostics.sellRejectionRejected++;


      if (
        d.bearishTrend &&
        !d.sellRecovery
      )
        diagnostics.sellRecoveryRejected++;


      if (
        d.bearishTrend &&
        !d.sellRSI
      )
        diagnostics.sellRSIRejected++;


      if (
        d.bearishTrend &&
        !d.noHeavyBullishPressure
      )
        diagnostics.sellBullishPressureRejected++;


      if (
        d.bearishTrend &&
        (
          !d.currentNotExpanded ||
          !d.previousNotExpanded
        )
      )
        diagnostics.sellExpansionRejected++;


      const candleInfo =
        analyzeCandle(candle);


      if (
        candleInfo.bodyRatio <
        CONFIG.MIN_CANDLE_BODY_RATIO
      )
        diagnostics.weakCandle++;


      if (
        d.bullishTrend &&
        !d.bullishRejection
      )
        diagnostics.buyCandleRejected++;


      if (
        d.bearishTrend &&
        !d.bearishRejection
      )
        diagnostics.bearishCandleRejected++;


      if (
        d.bullishTrend &&
        candleInfo.closeLocation <
        CONFIG.MIN_CLOSE_LOCATION
      )
        diagnostics.bullishCloseRejected++;


      if (
        d.bearishTrend &&
        candleInfo.closeLocation >
        1 - CONFIG.MIN_CLOSE_LOCATION
      )
        diagnostics.bearishCloseRejected++;


      if (!d.entryGapAcceptable)
        diagnostics.entryGapRejected++;
    }


    // =============================
    // MANAGE POSITION
    // =============================

    if (position) {

      const trade =
        managePosition(
          position,
          candle,
          equityState
        );

      if (trade) {

        trades.push(trade);

        position = null;

        cooldown =
          CONFIG.COOLDOWN_CANDLES;

        closedThisCandle = true;
      }
    }


    // =============================
    // SESSION CLOSE
    // =============================

    if (
      position &&
      minutes >=
      CONFIG.SESSION_CLOSE_MINUTES
    ) {

      trades.push(
        closePosition(
          position,
          candle.c,
          candle.ts,
          "SESSION CLOSE",
          equityState
        )
      );

      position = null;

      cooldown =
        CONFIG.COOLDOWN_CANDLES;

      closedThisCandle = true;
    }


    // =============================
    // SIGNAL
    // =============================

    const freshSignal =
      signal !== "WAIT" &&
      signal !== previousSignal;

    previousSignal = signal;


    if (
      minutes >=
      CONFIG.SESSION_CLOSE_MINUTES
    ) {
      diagnostics.sessionRejected++;
      continue;
    }


    if (closedThisCandle)
      continue;


    if (cooldown > 0) {
      cooldown--;
      diagnostics.cooldownRejected++;
      continue;
    }


    if (
      minutes <
      CONFIG.ENTRY_START_MINUTES ||
      minutes >
      CONFIG.ENTRY_END_MINUTES
    ) {
      diagnostics.sessionRejected++;
      continue;
    }


    if (!indicators || !signalResult) {
      diagnostics.noTradeSignal++;
      continue;
    }


    if (!freshSignal) {
      diagnostics.duplicateSignalRejected++;
      continue;
    }


    if (i + 1 >= candles.length)
      continue;


    const nextCandle =
      candles[i + 1];


    if (
      getISTDate(nextCandle.ts) !==
      session
    )
      continue;


    const atrValue =
      Number(indicators.atr14);


    if (
      !Number.isFinite(atrValue) ||
      atrValue <= 0
    )
      continue;


    const entry =
      Number(nextCandle.o);


    if (
      !Number.isFinite(entry) ||
      entry <= 0
    )
      continue;


    const signalClose =
      Number(candle.c);


    const actualEntryGapATR =
      (
        entry -
        signalClose
      ) / atrValue;


    if (
      Math.abs(actualEntryGapATR) >
      CONFIG.MAX_ENTRY_GAP_ATR
    ) {
      diagnostics.entryGapRejected++;
      continue;
    }


    const risk =
      atrValue *
      CONFIG.ATR_STOP_MULTIPLIER;


    const reward =
      risk *
      CONFIG.RISK_REWARD;


    const side =
      signal === "BUY"
        ? "BUY"
        : "SELL";


    const stop =
      side === "BUY"
        ? entry - risk
        : entry + risk;


    const target =
      side === "BUY"
        ? entry + reward
        : entry - reward;


    position = {

      side,

      entry,
      stop,
      target,

      entryTs:
        nextCandle.ts,

      signalTs:
        candle.ts,

      signal,

      signalBuyScore:
        signalResult.buyScore,

      signalSellScore:
        signalResult.sellScore,

      signalReason:
        signalResult.reason,

      ema9:
        indicators.ema9,

      ema21:
        indicators.ema21,

      ema9Slope:
        indicators.ema9Slope,

      ema21Slope:
        indicators.ema21Slope,

      emaSpread:
        indicators.emaSpread,

      rsi14:
        indicators.rsi14,

      vwap:
        indicators.vwap,

      atr:
        indicators.atr14,

      directionalStrength:
        indicators.directionalStrength,

      bodyRatio:
        signalResult.diagnostics.bodyRatio,

      closeLocation:
        signalResult.diagnostics.closeLocation,

      entryGapATR:
        actualEntryGapATR,

      emaExtensionATR:
        signalResult.diagnostics.emaExtensionATR,

      pullbackDistanceATR:
        signalResult
          .diagnostics
          .pullbackDistanceATR
    };


    console.log(
      `${CONFIG.VERSION} ENTRY:`,
      position
    );
  }


  // =============================
  // END OF DATA
  // =============================

  if (position) {

    const last =
      candles[candles.length - 1];

    trades.push(
      closePosition(
        position,
        last.c,
        last.ts,
        "END OF DATA",
        equityState
      )
    );
  }


  // =============================
  // STATISTICS
  // =============================

  const totalTrades =
    trades.length;

  const buyTrades =
    trades.filter(
      t => t.side === "BUY"
    );

  const sellTrades =
    trades.filter(
      t => t.side === "SELL"
    );

  const winningTrades =
    trades.filter(
      t => t.points > 0
    );

  const losingTrades =
    trades.filter(
      t => t.points <= 0
    );

  const wins =
    winningTrades.length;

  const losses =
    losingTrades.length;


  const winRate =
    totalTrades > 0
      ? (wins / totalTrades) * 100
      : 0;


  const totalPoints =
    trades.reduce(
      (sum, t) => sum + t.points,
      0
    );


  const averageWin =
    wins > 0
      ? winningTrades.reduce(
          (sum, t) => sum + t.points,
          0
        ) / wins
      : 0;


  const averageLoss =
    losses > 0
      ? Math.abs(
          losingTrades.reduce(
            (sum, t) => sum + t.points,
            0
          ) / losses
        )
      : 0;


  const grossProfit =
    winningTrades.reduce(
      (sum, t) => sum + t.points,
      0
    );


  const grossLoss =
    Math.abs(
      losingTrades.reduce(
        (sum, t) => sum + t.points,
        0
      )
    );


  const profitFactor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? Infinity
        : 0;


  const directionStats = {

    BUY: {

      trades:
        buyTrades.length,

      wins:
        buyTrades.filter(
          t => t.points > 0
        ).length,

      losses:
        buyTrades.filter(
          t => t.points <= 0
        ).length,

      winRate:
        buyTrades.length > 0
          ? (
              buyTrades.filter(
                t => t.points > 0
              ).length /
              buyTrades.length
            ) * 100
          : 0,

      points:
        buyTrades.reduce(
          (sum, t) => sum + t.points,
          0
        )
    },


    SELL: {

      trades:
        sellTrades.length,

      wins:
        sellTrades.filter(
          t => t.points > 0
        ).length,

      losses:
        sellTrades.filter(
          t => t.points <= 0
        ).length,

      winRate:
        sellTrades.length > 0
          ? (
              sellTrades.filter(
                t => t.points > 0
              ).length /
              sellTrades.length
            ) * 100
          : 0,

      points:
        sellTrades.reduce(
          (sum, t) => sum + t.points,
          0
        )
    }
  };


  return {

    candlesTested:
      candles.length,

    totalTrades,

    buyTrades:
      buyTrades.length,

    sellTrades:
      sellTrades.length,

    winningTrades:
      wins,

    losingTrades:
      losses,

    winRate,

    totalPoints,

    averageWin,

    averageLoss,

    profitFactor,

    maxDrawdown:
      equityState.maxDrawdown,

    targetExits:
      trades.filter(
        t => t.reason === "TARGET"
      ).length,

    stopLossExits:
      trades.filter(
        t => t.reason === "STOP LOSS"
      ).length,

    sessionCloseExits:
      trades.filter(
        t => t.reason === "SESSION CLOSE"
      ).length,

    gapExits:
      trades.filter(
        t => t.reason.includes("GAP")
      ).length,

    endOfDataExits:
      trades.filter(
        t => t.reason === "END OF DATA"
      ).length,

    directionStats,

    diagnostics,

    trades
  };
}


// ===============================
// EXTRACT CANDLES
// ===============================

function extractCandles(result) {

  const candidates = [

    result?.data?.NIDX_40000001?.candles,

    result?.data?.candles,

    result?.candles

  ];

  for (const candidate of candidates) {

    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}


// ===============================
// API HANDLER
// ===============================

export default async function handler(
  req,
  res
) {

  try {

    const token =
      process.env.INDSTOCKS_TOKEN;


    if (!token) {

      return res.status(500).json({

        success: false,

        version:
          CONFIG.VERSION,

        error:
          "INDSTOCKS_TOKEN is not configured"

      });
    }


    const interval =
      req.query?.interval ||
      "5minute";


    const allowedIntervals = [

      "1minute",
      "2minute",
      "3minute",
      "4minute",
      "5minute",
      "10minute",
      "15minute",
      "30minute",
      "60minute",
      "120minute",
      "180minute",
      "240minute",
      "1day"

    ];


    if (
      !allowedIntervals.includes(
        interval
      )
    ) {

      return res.status(400).json({

        success: false,

        version:
          CONFIG.VERSION,

        error:
          "Invalid candle interval"

      });
    }


    const NIFTY_ID =
      "40000001";

    const scripCode =
      `NIDX_${NIFTY_ID}`;


    const endTime =
      Date.now();


    const startTime =
      endTime -
      (
        7 *
        24 *
        60 *
        60 *
        1000
      );


    const url =
      "https://api.indstocks.com" +
      `/market/historical/${interval}` +
      `?scrip-codes=${encodeURIComponent(
        scripCode
      )}` +
      `&start_time=${startTime}` +
      `&end_time=${endTime}`;


    console.log(
      "================================"
    );

    console.log(
      `${CONFIG.VERSION} BACKTEST REQUEST`
    );

    console.log(
      "Interval:",
      interval
    );

    console.log(
      "Scrip:",
      scripCode
    );

    console.log(
      "================================"
    );


    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Authorization: token,
            Accept:
              "application/json"
          }
        }
      );


    const text =
      await response.text();


    let result;


    try {

      result =
        JSON.parse(text);

    } catch {

      return res.status(502).json({

        success: false,

        version:
          CONFIG.VERSION,

        error:
          "INDstocks returned invalid JSON",

        details:
          text.slice(0, 1000)

      });
    }


    if (!response.ok) {

      return res
        .status(response.status)
        .json({

          success: false,

          version:
            CONFIG.VERSION,

          error:
            result

        });
    }


    const rawCandles =
      extractCandles(result);


    const candles =
      normalizeCandles(
        rawCandles
      );


    console.log(
      `${CONFIG.VERSION} candles:`,
      candles.length
    );


    if (candles.length < 50) {

      return res.status(200).json({

        success: true,

        version:
          CONFIG.VERSION,

        interval,

        status:
          "INSUFFICIENT_DATA",

        candlesTested:
          candles.length,

        totalTrades: 0,

        buyTrades: 0,

        sellTrades: 0,

        winningTrades: 0,

        losingTrades: 0,

        winRate: 0,

        totalPoints: 0,

        averageWin: 0,

        averageLoss: 0,

        profitFactor: 0,

        maxDrawdown: 0,

        targetExits: 0,

        stopLossExits: 0,

        sessionCloseExits: 0,

        gapExits: 0,

        endOfDataExits: 0,

        directionStats: {

          BUY: {
            trades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            points: 0
          },

          SELL: {
            trades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            points: 0
          }

        },

        diagnostics: {},

        trades: []

      });
    }


    const backtest =
      runBacktest(candles);


    console.log(
      `${CONFIG.VERSION} RESULT`,
      backtest
    );


    return res.status(200).json({

      success: true,

      version:
        CONFIG.VERSION,

      interval,

      status:
        "COMPLETED",

      candlesTested:
        backtest.candlesTested,

      totalTrades:
        backtest.totalTrades,

      buyTrades:
        backtest.buyTrades,

      sellTrades:
        backtest.sellTrades,

      winningTrades:
        backtest.winningTrades,

      losingTrades:
        backtest.losingTrades,

      winRate:
        backtest.winRate,

      totalPoints:
        backtest.totalPoints,

      averageWin:
        backtest.averageWin,

      averageLoss:
        backtest.averageLoss,

      profitFactor:
        backtest.profitFactor,

      maxDrawdown:
        backtest.maxDrawdown,

      targetExits:
        backtest.targetExits,

      stopLossExits:
        backtest.stopLossExits,

      sessionCloseExits:
        backtest.sessionCloseExits,

      gapExits:
        backtest.gapExits,

      endOfDataExits:
        backtest.endOfDataExits,

      directionStats:
        backtest.directionStats,

      diagnostics:
        backtest.diagnostics,

      trades:
        backtest.trades

    });

  } catch (error) {

    console.error(
      `${CONFIG.VERSION} ERROR:`,
      error
    );


    return res.status(500).json({

      success: false,

      version:
        CONFIG.VERSION,

      error:
        `${CONFIG.VERSION} backtest failed`,

      details:
        error?.message ||
        "Unknown error"

    });
  }
}
