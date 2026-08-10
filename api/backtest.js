/*
TradeMind Pro
V10.25 Historical Backtest Engine

PAPER BACKTEST ONLY
NO REAL ORDERS

V10.25 CONTROLLED ENTRY QUALITY REVISION

Based on V10.24.

MAIN CHANGES:
1. SELL continuation-quality filter
2. BUY continuation-quality filter
3. Improved fresh-signal handling
4. Preserve V10.24 core trend architecture
5. ATR based risk
6. 1:2 reward/risk
7. Next candle execution
8. One position at a time
9. Cooldown
10. No overnight positions
*/


// ======================================================
// CONFIG
// ======================================================

export const CONFIG = {

    VERSION: "V10.25",

    EMA_FAST: 9,
    EMA_SLOW: 21,

    RSI_PERIOD: 14,
    ATR_PERIOD: 14,

    ATR_STOP_MULTIPLIER: 1.5,
    RISK_REWARD: 2,

    // ------------------------------
    // TREND
    // ------------------------------

    MIN_DIRECTIONAL_STRENGTH: 0.30,

    MIN_EMA_ATR_SEPARATION: 0.25,

    MIN_VWAP_ATR_DISTANCE: 0.05,

    // ------------------------------
    // EMA SLOPE
    // ------------------------------

    EMA_SLOPE_LOOKBACK: 3,

    MIN_BUY_EMA9_SLOPE_ATR: 0.03,

    MIN_SELL_EMA9_SLOPE_ATR: 0.02,

    // ------------------------------
    // BUY ACCELERATION
    // ------------------------------

    MIN_BUY_SLOPE_RATIO: 0.70,

    MIN_BUY_ACCELERATION_ATR: 0.01,

    // ------------------------------
    // PULLBACK
    // ------------------------------

    MIN_PULLBACK_ATR: 0.08,

    MAX_PULLBACK_ATR: 0.85,

    BUY_MIN_PULLBACK_ATR: 0.10,

    BUY_MAX_PULLBACK_ATR: 0.65,

    // ------------------------------
    // CANDLE
    // ------------------------------

    MIN_CANDLE_BODY_RATIO: 0.40,

    MIN_CLOSE_LOCATION: 0.60,

    BUY_MIN_CLOSE_LOCATION: 0.70,

    // ------------------------------
    // BUY REJECTION
    // ------------------------------

    BUY_MIN_WICK_REJECTION_RATIO: 0.20,

    // ------------------------------
    // EXTENSION
    // ------------------------------

    MAX_EMA_EXTENSION_ATR: 1.15,

    HARD_EMA_EXTENSION_ATR: 1.40,

    // ------------------------------
    // RSI
    // ------------------------------

    SELL_RSI_MIN: 35,

    SELL_RSI_MAX: 48,

    BUY_RSI_MIN: 53,

    BUY_RSI_MAX: 64,

    BUY_RSI_HARD_MAX: 69,

    MIN_BUY_RSI_RISE: 0.50,

    // ------------------------------
    // ENTRY GAP
    // ------------------------------

    MAX_ENTRY_GAP_ATR: 0.25,

    // ------------------------------
    // EXPANSION
    // ------------------------------

    MAX_EXPANSION_RANGE_ATR: 1.50,

    MAX_EXPANSION_BODY_RATIO: 0.85,

    // ==================================================
    // V10.25 SELL CONTINUATION QUALITY
    // ==================================================

    SELL_MIN_CONTINUATION_BODY: 0.45,

    SELL_MIN_CLOSE_LOCATION: 0.60,

    SELL_MIN_LOW_BREAK_ATR: 0.02,

    SELL_MIN_EMA9_DISTANCE_ATR: 0.05,

    SELL_MIN_SLOPE_PERSISTENCE_ATR: 0.01,

    // ==================================================
    // V10.25 BUY CONTINUATION QUALITY
    // ==================================================

    BUY_MIN_CONTINUATION_BODY: 0.45,

    BUY_MIN_HIGH_BREAK_ATR: 0.02,

    BUY_MIN_EMA9_DISTANCE_ATR: 0.05,

    BUY_MIN_SLOPE_PERSISTENCE_ATR: 0.01,

    // ------------------------------
    // COOLDOWN
    // ------------------------------

    COOLDOWN_CANDLES: 3,

    // ------------------------------
    // SESSION
    // ------------------------------

    ENTRY_START_MINUTES:
        9 * 60 + 20,

    ENTRY_END_MINUTES:
        15 * 60,

    SESSION_CLOSE_MINUTES:
        15 * 60 + 25

};


// ======================================================
// EMA
// ======================================================

function ema(values, period) {

    if (
        !Array.isArray(values) ||
        values.length < period
    ) {
        return null;
    }

    const multiplier =
        2 / (period + 1);

    let value =
        values
            .slice(0, period)
            .reduce(
                (sum, value) =>
                    sum + Number(value),
                0
            ) / period;

    for (
        let i = period;
        i < values.length;
        i++
    ) {

        const current =
            Number(values[i]);

        value =
            (
                (current - value) *
                multiplier
            ) + value;
    }

    return value;
}


// ======================================================
// RSI
// ======================================================

function rsi(
    values,
    period = 14
) {

    if (
        !Array.isArray(values) ||
        values.length < period + 1
    ) {
        return null;
    }

    let gains = 0;
    let losses = 0;

    for (
        let i = 1;
        i <= period;
        i++
    ) {

        const change =
            Number(values[i]) -
            Number(values[i - 1]);

        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    let averageGain =
        gains / period;

    let averageLoss =
        losses / period;

    for (
        let i = period + 1;
        i < values.length;
        i++
    ) {

        const change =
            Number(values[i]) -
            Number(values[i - 1]);

        const gain =
            Math.max(change, 0);

        const loss =
            Math.max(-change, 0);

        averageGain =
            (
                averageGain * (period - 1) +
                gain
            ) / period;

        averageLoss =
            (
                averageLoss * (period - 1) +
                loss
            ) / period;
    }

    if (averageLoss === 0) {
        return 100;
    }

    const rs =
        averageGain / averageLoss;

    return (
        100 -
        (
            100 / (1 + rs)
        )
    );
}


// ======================================================
// TRUE RANGE
// ======================================================

function trueRange(
    current,
    previous
) {

    const high =
        Number(current?.h);

    const low =
        Number(current?.l);

    const previousClose =
        Number(previous?.c);

    if (
        !Number.isFinite(high) ||
        !Number.isFinite(low)
    ) {
        return null;
    }

    if (
        !Number.isFinite(previousClose)
    ) {
        return high - low;
    }

    return Math.max(

        high - low,

        Math.abs(
            high - previousClose
        ),

        Math.abs(
            low - previousClose
        )

    );
}


// ======================================================
// ATR
// ======================================================

function atr(
    candles,
    period = 14
) {

    if (
        !Array.isArray(candles) ||
        candles.length < period + 1
    ) {
        return null;
    }

    const ranges = [];

    for (
        let i = 1;
        i < candles.length;
        i++
    ) {

        const value =
            trueRange(
                candles[i],
                candles[i - 1]
            );

        if (
            Number.isFinite(value)
        ) {
            ranges.push(value);
        }
    }

    if (
        ranges.length < period
    ) {
        return null;
    }

    let value =
        ranges
            .slice(0, period)
            .reduce(
                (sum, item) =>
                    sum + item,
                0
            ) / period;

    for (
        let i = period;
        i < ranges.length;
        i++
    ) {

        value =
            (
                value * (period - 1) +
                ranges[i]
            ) / period;
    }

    return value;
}


// ======================================================
// IST DATE
// ======================================================

function getISTDate(timestamp) {

    const date =
        new Date(
            Number(timestamp) * 1000 +
            5.5 * 60 * 60 * 1000
        );

    return date
        .toISOString()
        .slice(0, 10);
}


// ======================================================
// IST MINUTES
// ======================================================

function getISTMinutes(timestamp) {

    const date =
        new Date(
            Number(timestamp) * 1000 +
            5.5 * 60 * 60 * 1000
        );

    return (
        date.getUTCHours() * 60
    ) +
    date.getUTCMinutes();
}


// ======================================================
// VWAP
// ======================================================

function vwap(candles) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {
        return null;
    }

    const latest =
        candles[candles.length - 1];

    const session =
        getISTDate(latest.ts);

    let totalPV = 0;
    let totalVolume = 0;

    for (
        const candle of candles
    ) {

        if (
            getISTDate(candle.ts) !== session
        ) {
            continue;
        }

        const high =
            Number(candle.h);

        const low =
            Number(candle.l);

        const close =
            Number(candle.c);

        const volume =
            Number(candle.v);

        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close) ||
            !Number.isFinite(volume)
        ) {
            continue;
        }

        const typicalPrice =
            (
                high +
                low +
                close
            ) / 3;

        totalPV +=
            typicalPrice * volume;

        totalVolume +=
            volume;
    }

    if (
        totalVolume <= 0
    ) {
        return null;
    }

    return (
        totalPV /
        totalVolume
    );
}


// ======================================================
// NORMALIZE CANDLES
// ======================================================

export function normalizeCandles(candles) {

    if (
        !Array.isArray(candles)
    ) {
        return [];
    }

    return candles
        .map(candle => {

            if (
                Array.isArray(candle)
            ) {

                const normalized = {

                    ts: Number(candle[0]),
                    o: Number(candle[1]),
                    h: Number(candle[2]),
                    l: Number(candle[3]),
                    c: Number(candle[4]),
                    v: Number(candle[5] ?? 0)

                };

                if (
                    !Number.isFinite(normalized.ts) ||
                    !Number.isFinite(normalized.o) ||
                    !Number.isFinite(normalized.h) ||
                    !Number.isFinite(normalized.l) ||
                    !Number.isFinite(normalized.c)
                ) {
                    return null;
                }

                if (
                    normalized.h <
                    normalized.l
                ) {
                    return null;
                }

                return normalized;
            }

            if (
                candle &&
                typeof candle === "object"
            ) {

                const normalized = {

                    ts: Number(candle.ts),
                    o: Number(candle.o),
                    h: Number(candle.h),
                    l: Number(candle.l),
                    c: Number(candle.c),
                    v: Number(candle.v ?? 0)

                };

                if (
                    !Number.isFinite(normalized.ts) ||
                    !Number.isFinite(normalized.o) ||
                    !Number.isFinite(normalized.h) ||
                    !Number.isFinite(normalized.l) ||
                    !Number.isFinite(normalized.c)
                ) {
                    return null;
                }

                if (
                    normalized.h <
                    normalized.l
                ) {
                    return null;
                }

                return normalized;
            }

            return null;

        })
        .filter(Boolean)
        .sort(
            (a, b) =>
                a.ts - b.ts
        );
}


// ======================================================
// HISTORICAL INDICATORS
// ======================================================

export function calculateHistoricalIndicators(
    candles,
    index
) {

    const history =
        candles.slice(
            0,
            index + 1
        );

    if (
        history.length <
        CONFIG.EMA_SLOW + 5
    ) {
        return null;
    }

    const closes =
        history.map(
            candle =>
                Number(candle.c)
        );

    const ema9Value =
        ema(
            closes,
            CONFIG.EMA_FAST
        );

    const ema21Value =
        ema(
            closes,
            CONFIG.EMA_SLOW
        );

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

    let ema9Previous = null;
    let ema21Previous = null;

    if (
        history.length >
        CONFIG.EMA_SLOW +
        CONFIG.EMA_SLOPE_LOOKBACK
    ) {

        const previousCloses =
            history
                .slice(
                    0,
                    history.length -
                    CONFIG.EMA_SLOPE_LOOKBACK
                )
                .map(
                    candle =>
                        Number(candle.c)
                );

        ema9Previous =
            ema(
                previousCloses,
                CONFIG.EMA_FAST
            );

        ema21Previous =
            ema(
                previousCloses,
                CONFIG.EMA_SLOW
            );
    }

    const ema9Slope =
        Number.isFinite(ema9Previous)
            ? ema9Value - ema9Previous
            : null;

    const ema21Slope =
        Number.isFinite(ema21Previous)
            ? ema21Value - ema21Previous
            : null;

    let previousEma9Slope = null;

    if (
        history.length >
        CONFIG.EMA_SLOW +
        (
            CONFIG.EMA_SLOPE_LOOKBACK * 2
        )
    ) {

        const olderCloses =
            history
                .slice(
                    0,
                    history.length -
                    (
                        CONFIG.EMA_SLOPE_LOOKBACK * 2
                    )
                )
                .map(
                    candle =>
                        Number(candle.c)
                );

        const olderEma9 =
            ema(
                olderCloses,
                CONFIG.EMA_FAST
            );

        if (
            Number.isFinite(olderEma9) &&
            Number.isFinite(ema9Previous)
        ) {

            previousEma9Slope =
                ema9Previous -
                olderEma9;
        }
    }

    const emaSpread =
        Math.abs(
            ema9Value -
            ema21Value
        );

    const directionalStrength =
        atrValue > 0
            ? emaSpread / atrValue
            : 0;

    let previousRSI = null;
    let previousPreviousRSI = null;

    if (
        history.length >=
        CONFIG.RSI_PERIOD + 3
    ) {

        previousRSI =
            rsi(
                history
                    .slice(0, -1)
                    .map(
                        candle =>
                            Number(candle.c)
                    ),
                CONFIG.RSI_PERIOD
            );

        previousPreviousRSI =
            rsi(
                history
                    .slice(0, -2)
                    .map(
                        candle =>
                            Number(candle.c)
                    ),
                CONFIG.RSI_PERIOD
            );
    }

    return {

        ema9: ema9Value,

        ema21: ema21Value,

        ema9Slope,

        ema21Slope,

        previousEma9Slope,

        emaSpread,

        rsi14: rsiValue,

        previousRSI,

        previousPreviousRSI,

        atr14: atrValue,

        vwap: vwapValue,

        directionalStrength

    };
}


// ======================================================
// CANDLE ANALYSIS
// ======================================================

function analyzeCandle(candle) {

    const open =
        Number(candle.o);

    const high =
        Number(candle.h);

    const low =
        Number(candle.l);

    const close =
        Number(candle.c);

    const range =
        high - low;

    const body =
        Math.abs(
            close - open
        );

    const upperWick =
        high -
        Math.max(open, close);

    const lowerWick =
        Math.min(open, close) -
        low;

    const bodyRatio =
        range > 0
            ? body / range
            : 0;

    const closeLocation =
        range > 0
            ? (
                close - low
            ) / range
            : 0.5;

    return {

        range,

        body,

        upperWick,

        lowerWick,

        bodyRatio,

        closeLocation,

        bullish:
            close > open,

        bearish:
            close < open

    };
}


// ======================================================
// V10.25 SIGNAL ENGINE
// ======================================================

export function getSignal(
    candle,
    indicators,
    previousCandle,
    previousPreviousCandle
) {

    if (
        !candle ||
        !indicators
    ) {

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

    const previousEma9Slope =
        Number(indicators.previousEma9Slope);

    const emaSpread =
        Number(indicators.emaSpread);

    const rsi14 =
        Number(indicators.rsi14);

    const previousRSI =
        Number(indicators.previousRSI);

    const previousPreviousRSI =
        Number(indicators.previousPreviousRSI);

    const atr14 =
        Number(indicators.atr14);

    const vwapValue =
        Number(indicators.vwap);

    const directionalStrength =
        Number(
            indicators.directionalStrength
        );

    const close =
        Number(candle.c);

    if (
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(ema9Slope) ||
        !Number.isFinite(ema21Slope) ||
        !Number.isFinite(emaSpread) ||
        !Number.isFinite(rsi14) ||
        !Number.isFinite(atr14) ||
        !Number.isFinite(vwapValue) ||
        !Number.isFinite(directionalStrength) ||
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


    // ==================================================
    // TREND
    // ==================================================

    const bullishTrend =
        ema9 > ema21;

    const bearishTrend =
        ema9 < ema21;

    const strongTrend =
        directionalStrength >=
        CONFIG.MIN_DIRECTIONAL_STRENGTH;

    const strongEMASeparation =
        (
            emaSpread /
            atr14
        ) >=
        CONFIG.MIN_EMA_ATR_SEPARATION;


    // ==================================================
    // SLOPE
    // ==================================================

    const bullishSlope =
        ema9Slope >
        (
            atr14 *
            CONFIG.MIN_BUY_EMA9_SLOPE_ATR
        ) &&
        ema21Slope >= 0;

    const bearishSlope =
        ema9Slope <
        -(
            atr14 *
            CONFIG.MIN_SELL_EMA9_SLOPE_ATR
        ) &&
        ema21Slope <= 0;


    // ==================================================
    // BUY ACCELERATION
    // ==================================================

    const buySlopeRatio =
        ema21Slope > 0
            ? ema9Slope / ema21Slope
            : 0;

    const buySlopeAcceleration =
        Number.isFinite(
            previousEma9Slope
        )
            ? ema9Slope >
              (
                previousEma9Slope +
                atr14 *
                CONFIG.MIN_BUY_ACCELERATION_ATR
            )
            : false;

    const buyTrendAcceleration =
        ema9Slope > 0 &&
        ema21Slope > 0 &&
        buySlopeRatio >=
        CONFIG.MIN_BUY_SLOPE_RATIO &&
        buySlopeAcceleration;


    // ==================================================
    // VWAP
    // ==================================================

    const aboveVWAP =
        close > vwapValue;

    const belowVWAP =
        close < vwapValue;

    const vwapDistance =
        Math.abs(
            close - vwapValue
        );

    const vwapConfirmed =
        vwapDistance >=
        (
            atr14 *
            CONFIG.MIN_VWAP_ATR_DISTANCE
        );


    // ==================================================
    // EXTENSION
    // ==================================================

    const emaExtension =
        Math.abs(
            close - ema9
        );

    const emaExtensionATR =
        emaExtension /
        atr14;

    const notOverextended =
        emaExtensionATR <=
        CONFIG.MAX_EMA_EXTENSION_ATR;

    const hardOverextended =
        emaExtensionATR >
        CONFIG.HARD_EMA_EXTENSION_ATR;


    // ==================================================
    // PULLBACK
    // ==================================================

    const pullbackDistanceATR =
        Math.abs(
            close - ema9
        ) / atr14;

    const validPullback =
        pullbackDistanceATR >=
            CONFIG.MIN_PULLBACK_ATR &&
        pullbackDistanceATR <=
            CONFIG.MAX_PULLBACK_ATR;

    const buyPullback =
        pullbackDistanceATR >=
            CONFIG.BUY_MIN_PULLBACK_ATR &&
        pullbackDistanceATR <=
            CONFIG.BUY_MAX_PULLBACK_ATR;

    const sellPullback =
        validPullback &&
        close <=
        (
            ema9 +
            atr14 * 0.15
        );


    // ==================================================
    // RSI
    // ==================================================

    const sellRSI =
        rsi14 >=
            CONFIG.SELL_RSI_MIN &&
        rsi14 <=
            CONFIG.SELL_RSI_MAX;

    const buyRSIZone =
        rsi14 >=
            CONFIG.BUY_RSI_MIN &&
        rsi14 <=
            CONFIG.BUY_RSI_MAX;

    const buyRSIRecovery =
        Number.isFinite(previousRSI) &&
        Number.isFinite(previousPreviousRSI) &&
        rsi14 > previousRSI &&
        previousRSI >= previousPreviousRSI &&
        (
            rsi14 - previousRSI
        ) >=
        CONFIG.MIN_BUY_RSI_RISE;

    const buyRSINotOverbought =
        rsi14 <=
        CONFIG.BUY_RSI_HARD_MAX;


    // ==================================================
    // CANDLE
    // ==================================================

    const strongBearishCandle =
        current.bearish &&
        current.bodyRatio >=
        CONFIG.MIN_CANDLE_BODY_RATIO &&
        current.closeLocation <=
        (
            1 -
            CONFIG.MIN_CLOSE_LOCATION
        );

    const bullishLowerWick =
        current.lowerWick >=
        (
            current.range *
            CONFIG.BUY_MIN_WICK_REJECTION_RATIO
        );

    const bullishRejection =
        bullishLowerWick &&
        current.bullish &&
        current.closeLocation >=
        CONFIG.BUY_MIN_CLOSE_LOCATION;


    // ==================================================
    // RECOVERY
    // ==================================================

    const previousClose =
        previousCandle
            ? Number(previousCandle.c)
            : null;

    const previousHigh =
        previousCandle
            ? Number(previousCandle.h)
            : null;

    const previousLow =
        previousCandle
            ? Number(previousCandle.l)
            : null;


    // ------------------------------
    // BUY RECOVERY
    // ------------------------------

    const recoveryAboveEMA9 =
        close > ema9;

    const recoveryAbovePreviousClose =
        Number.isFinite(previousClose)
            ? close > previousClose
            : false;

    const recoveryAbovePreviousHigh =
        Number.isFinite(previousHigh)
            ? close > previousHigh
            : false;

    const buyRecovery =
        recoveryAboveEMA9 &&
        recoveryAbovePreviousClose &&
        (
            recoveryAbovePreviousHigh ||
            current.closeLocation >=
            CONFIG.BUY_MIN_CLOSE_LOCATION
        );


    // ------------------------------
    // SELL RECOVERY
    // ------------------------------

    const sellRecovery =
        close < ema9 &&
        Number.isFinite(previousClose) &&
        close < previousClose;


    // ==================================================
    // PRESSURE
    // ==================================================

    let bearishPressure = 0;

    if (previous?.bearish) {
        bearishPressure++;
    }

    if (previousPrevious?.bearish) {
        bearishPressure++;
    }

    const noHeavyBearishPressure =
        bearishPressure <= 1;


    let bullishPressure = 0;

    if (previous?.bullish) {
        bullishPressure++;
    }

    if (previousPrevious?.bullish) {
        bullishPressure++;
    }

    const noHeavyBullishPressure =
        bullishPressure <= 1;


    // ==================================================
    // EXPANSION
    // ==================================================

    const expansionCandle =
        current.range >
        (
            atr14 *
            CONFIG.MAX_EXPANSION_RANGE_ATR
        ) ||
        current.bodyRatio >
        CONFIG.MAX_EXPANSION_BODY_RATIO;

    const noExpansionCandle =
        !expansionCandle;


    // ==================================================
    // ENTRY GAP
    // ==================================================

    let entryGapATR = 0;

    if (previousCandle) {

        entryGapATR =
            (
                Number(candle.o) -
                Number(previousCandle.c)
            ) / atr14;
    }

    const entryGapAcceptable =
        Math.abs(entryGapATR) <=
        CONFIG.MAX_ENTRY_GAP_ATR;


    // ==================================================
    // V10.25 SELL CONTINUATION QUALITY
    // ==================================================

    const bearishBodyQuality =
        current.bearish &&
        current.bodyRatio >=
        CONFIG.SELL_MIN_CONTINUATION_BODY;

    const bearishCloseQuality =
        current.bearish &&
        current.closeLocation <=
        (
            1 -
            CONFIG.SELL_MIN_CLOSE_LOCATION
        );

    const lowBreakATR =
        Number.isFinite(previousLow)
            ? (
                Number(previousLow) -
                Number(candle.l)
            ) / atr14
            : 0;

    const sellLowContinuation =
        Number.isFinite(previousLow) &&
        Number(candle.l) <=
        (
            Number(previousLow) -
            atr14 *
            CONFIG.SELL_MIN_LOW_BREAK_ATR
        );

    const sellMovingAwayFromEMA9 =
        (
            ema9 - close
        ) / atr14 >=
        CONFIG.SELL_MIN_EMA9_DISTANCE_ATR;

    const sellSlopePersistence =
        Number.isFinite(previousEma9Slope) &&
        ema9Slope <
        (
            previousEma9Slope -
            atr14 *
            CONFIG.SELL_MIN_SLOPE_PERSISTENCE_ATR
        );

    /*
    Controlled continuation rule.

    We don't require every continuation feature.
    We require strong evidence that the pullback
    has actually resumed downward.
    */

    const sellContinuation =
        bearishBodyQuality &&
        bearishCloseQuality &&
        sellMovingAwayFromEMA9 &&
        (
            sellLowContinuation ||
            sellSlopePersistence
        );


    // ==================================================
    // V10.25 BUY CONTINUATION QUALITY
    // ==================================================

    const bullishBodyQuality =
        current.bullish &&
        current.bodyRatio >=
        CONFIG.BUY_MIN_CONTINUATION_BODY;

    const bullishCloseQuality =
        current.bullish &&
        current.closeLocation >=
        CONFIG.BUY_MIN_CLOSE_LOCATION;

    const currentHigh =
        Number(candle.h);

    const previousHighValue =
        Number(previousCandle?.h);

    const buyHighContinuation =
        Number.isFinite(previousHighValue) &&
        currentHigh >=
        (
            previousHighValue +
            atr14 *
            CONFIG.BUY_MIN_HIGH_BREAK_ATR
        );

    const buyMovingAwayFromEMA9 =
        (
            close - ema9
        ) / atr14 >=
        CONFIG.BUY_MIN_EMA9_DISTANCE_ATR;

    const buySlopePersistence =
        Number.isFinite(previousEma9Slope) &&
        ema9Slope >
        (
            previousEma9Slope +
            atr14 *
            CONFIG.BUY_MIN_SLOPE_PERSISTENCE_ATR
        );

    const buyContinuation =
        bullishBodyQuality &&
        bullishCloseQuality &&
        buyMovingAwayFromEMA9 &&
        (
            buyHighContinuation ||
            buySlopePersistence
        );


    // ==================================================
    // BUY SCORE
    // ==================================================

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

    if (buyPullback) {

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

    if (buyTrendAcceleration) {

        buyScore++;

        buyReasons.push(
            "BUY trend acceleration"
        );
    }

    if (bullishBodyQuality) {

        buyScore++;

        buyReasons.push(
            "Strong bullish body"
        );
    }

    if (bullishCloseQuality) {

        buyScore++;

        buyReasons.push(
            "Strong bullish close"
        );
    }

    if (buyContinuation) {

        buyScore++;

        buyReasons.push(
            "BUY continuation quality"
        );
    }

    if (notOverextended) {

        buyScore++;

        buyReasons.push(
            "Not overextended"
        );
    }

    if (noExpansionCandle) {

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


    // ==================================================
    // SELL SCORE
    // ==================================================

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

    if (sellPullback) {

        sellScore++;

        sellReasons.push(
            "Actual EMA9 pullback"
        );
    }

    if (strongBearishCandle) {

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

    if (sellContinuation) {

        sellScore++;

        sellReasons.push(
            "Bearish continuation"
        );
    }

    if (notOverextended) {

        sellScore++;

        sellReasons.push(
            "Not overextended"
        );
    }

    if (noExpansionCandle) {

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


    // ==================================================
    // STRICT BUY
    // ==================================================

    const strictBuy =
        bullishTrend &&
        bullishSlope &&
        strongEMASeparation &&
        strongTrend &&
        aboveVWAP &&
        vwapConfirmed &&
        buyPullback &&
        bullishRejection &&
        buyRecovery &&
        buyRSIZone &&
        buyRSIRecovery &&
        buyRSINotOverbought &&
        noHeavyBearishPressure &&
        buyTrendAcceleration &&
        bullishBodyQuality &&
        bullishCloseQuality &&
        buyContinuation &&
        notOverextended &&
        !hardOverextended &&
        noExpansionCandle &&
        entryGapAcceptable;


    // ==================================================
    // STRICT SELL
    // ==================================================

    const strictSell =
        bearishTrend &&
        bearishSlope &&
        strongEMASeparation &&
        strongTrend &&
        belowVWAP &&
        vwapConfirmed &&
        sellPullback &&
        sellRSI &&
        strongBearishCandle &&
        sellRecovery &&
        noHeavyBullishPressure &&
        sellContinuation &&
        notOverextended &&
        !hardOverextended &&
        noExpansionCandle &&
        entryGapAcceptable;


    // ==================================================
    // FINAL SIGNAL
    // ==================================================

    let signal = "WAIT";

    let reason =
        "Waiting for V10.25 confirmation";


    if (
        strictBuy &&
        buyScore > sellScore
    ) {

        signal = "BUY";

        reason =
            buyReasons.join(
                " + "
            );

    } else if (
        strictSell &&
        sellScore > buyScore
    ) {

        signal = "SELL";

        reason =
            sellReasons.join(
                " + "
            );
    }


    // ==================================================
    // DIAGNOSTICS
    // ==================================================

    return {

        signal,

        buyScore,

        sellScore,

        reason,

        diagnostics: {

            emaSpread,

            directionalStrength,

            ema9Slope,

            ema21Slope,

            previousEma9Slope,

            buySlopeRatio,

            buySlopeAcceleration,

            buyTrendAcceleration,

            bodyRatio:
                current.bodyRatio,

            closeLocation:
                current.closeLocation,

            entryGapATR,

            emaExtensionATR,

            pullbackDistanceATR,

            bullishTrend,

            bearishTrend,

            bullishSlope,

            bearishSlope,

            strongTrend,

            strongEMASeparation,

            aboveVWAP,

            belowVWAP,

            vwapConfirmed,

            validPullback,

            buyPullback,

            sellPullback,

            bullishRejection,

            strongBearishCandle,

            buyRecovery,

            sellRecovery,

            buyRSIZone,

            buyRSIRecovery,

            buyRSINotOverbought,

            sellRSI,

            noHeavyBearishPressure,

            noHeavyBullishPressure,

            bearishPressure,

            bullishPressure,

            expansionCandle,

            noExpansionCandle,

            notOverextended,

            hardOverextended,

            entryGapAcceptable,

            // V10.25
            bearishBodyQuality,

            bearishCloseQuality,

            lowBreakATR,

            sellLowContinuation,

            sellMovingAwayFromEMA9,

            sellSlopePersistence,

            sellContinuation,

            bullishBodyQuality,

            bullishCloseQuality,

            buyHighContinuation,

            buyMovingAwayFromEMA9,

            buySlopePersistence,

            buyContinuation

        }

    };
}


// ======================================================
// CLOSE POSITION
// ======================================================

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

    const drawdown =
        equityState.peakEquity -
        equityState.equity;

    equityState.maxDrawdown =
        Math.max(
            equityState.maxDrawdown,
            drawdown
        );

    return {

        side:
            position.side,

        entry:
            Number(
                position.entry.toFixed(2)
            ),

        stop:
            Number(
                position.stop.toFixed(2)
            ),

        target:
            Number(
                position.target.toFixed(2)
            ),

        exit:
            Number(
                exitPrice.toFixed(2)
            ),

        points:
            Number(
                points.toFixed(2)
            ),

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
            ),

        sellContinuation:
            position.sellContinuation,

        buyContinuation:
            position.buyContinuation

    };
}


// ======================================================
// POSITION MANAGEMENT
// ======================================================

function managePosition(
    position,
    candle,
    equityState
) {

    if (!position) {
        return null;
    }

    const open =
        Number(candle.o);

    const high =
        Number(candle.h);

    const low =
        Number(candle.l);


    // ==================================================
    // BUY
    // ==================================================

    if (
        position.side === "BUY"
    ) {

        if (
            open <=
            position.stop
        ) {

            return closePosition(
                position,
                open,
                candle.ts,
                "STOP LOSS - GAP",
                equityState
            );
        }

        if (
            open >=
            position.target
        ) {

            return closePosition(
                position,
                open,
                candle.ts,
                "TARGET - GAP",
                equityState
            );
        }

        if (
            low <=
            position.stop
        ) {

            return closePosition(
                position,
                position.stop,
                candle.ts,
                "STOP LOSS",
                equityState
            );
        }

        if (
            high >=
            position.target
        ) {

            return closePosition(
                position,
                position.target,
                candle.ts,
                "TARGET",
                equityState
            );
        }
    }


    // ==================================================
    // SELL
    // ==================================================

    if (
        position.side === "SELL"
    ) {

        if (
            open >=
            position.stop
        ) {

            return closePosition(
                position,
                open,
                candle.ts,
                "STOP LOSS - GAP",
                equityState
            );
        }

        if (
            open <=
            position.target
        ) {

            return closePosition(
                position,
                open,
                candle.ts,
                "TARGET - GAP",
                equityState
            );
        }

        if (
            high >=
            position.stop
        ) {

            return closePosition(
                position,
                position.stop,
                candle.ts,
                "STOP LOSS",
                equityState
            );
        }

        if (
            low <=
            position.target
        ) {

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


// ======================================================
// BACKTEST
// ======================================================

function runBacktest(candles) {

    const trades = [];

    let position = null;

    const equityState = {

        equity: 0,

        peakEquity: 0,

        maxDrawdown: 0

    };

    let cooldown = 0;

    let previousSession = null;

    /*
    V10.25:
    Store the timestamp of the last actual
    signal instead of simply comparing signal
    direction with the previous candle.
    */

    let lastSignalTs = null;

    const diagnostics = {

        weakTrend: 0,

        weakEMASeparation: 0,

        weakSlope: 0,

        weakBuyTrend: 0,

        weakBuySeparation: 0,

        weakBuySlope: 0,

        buyTrendAccelerationRejected: 0,

        buySlopeRatioRejected: 0,

        buyRSIRejected: 0,

        buyRSIRecoveryRejected: 0,

        buyBearishPressureRejected: 0,

        buyBodyRejected: 0,

        buyCloseRejected: 0,

        buyRejectionRejected: 0,

        buyRecoveryRejected: 0,

        buyExpansionRejected: 0,

        buyExtensionRejected: 0,

        buyContinuationRejected: 0,

        sellPullbackRejected: 0,

        sellRejectionRejected: 0,

        sellRecoveryRejected: 0,

        sellRSIRejected: 0,

        sellBullishPressureRejected: 0,

        sellContinuationRejected: 0,

        sellBodyRejected: 0,

        sellCloseRejected: 0,

        sellExpansionRejected: 0,

        sellExtensionRejected: 0,

        overextended: 0,

        hardOverextended: 0,

        vwapTooClose: 0,

        invalidPullback: 0,

        weakCandle: 0,

        entryGapRejected: 0,

        sessionRejected: 0,

        duplicateSignalRejected: 0,

        cooldownRejected: 0,

        noTradeSignal: 0

    };


    // ==================================================
    // FUNNEL
    // ==================================================

    const funnel = {

        BUY: {

            trend: 0,
            slope: 0,
            separation: 0,
            strength: 0,
            vwap: 0,
            pullback: 0,
            candle: 0,
            recovery: 0,
            rsi: 0,
            pressure: 0,
            acceleration: 0,
            continuation: 0,
            safety: 0,
            finalSignal: 0,
            executed: 0

        },

        SELL: {

            trend: 0,
            slope: 0,
            separation: 0,
            strength: 0,
            vwap: 0,
            pullback: 0,
            candle: 0,
            recovery: 0,
            rsi: 0,
            pressure: 0,
            continuation: 0,
            safety: 0,
            finalSignal: 0,
            executed: 0

        }

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

        let closedThisCandle =
            false;


        // ==================================================
        // NEW SESSION
        // ==================================================

        if (
            previousSession !== null &&
            session !== previousSession
        ) {

            if (position) {

                const previousSessionCandle =
                    candles[i - 1];

                const trade =
                    closePosition(

                        position,

                        Number(
                            previousSessionCandle.c
                        ),

                        previousSessionCandle.ts,

                        "SESSION CLOSE",

                        equityState

                    );

                trades.push(trade);

                position = null;

                cooldown =
                    CONFIG.COOLDOWN_CANDLES;

                closedThisCandle = true;
            }

            lastSignalTs = null;
        }

        previousSession = session;


        // ==================================================
        // INDICATORS
        // ==================================================

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


            // ==================================================
            // GENERAL DIAGNOSTICS
            // ==================================================

            if (!d.strongTrend) {
                diagnostics.weakTrend++;
            }

            if (!d.strongEMASeparation) {
                diagnostics.weakEMASeparation++;
            }

            if (
                !d.bullishSlope &&
                !d.bearishSlope
            ) {
                diagnostics.weakSlope++;
            }


            // ==================================================
            // BUY FUNNEL
            // ==================================================

            if (d.bullishTrend) {

                funnel.BUY.trend++;

                if (d.bullishSlope) {

                    funnel.BUY.slope++;

                    if (d.strongEMASeparation) {

                        funnel.BUY.separation++;

                        if (d.strongTrend) {

                            funnel.BUY.strength++;

                            if (
                                d.aboveVWAP &&
                                d.vwapConfirmed
                            ) {

                                funnel.BUY.vwap++;

                                if (d.buyPullback) {

                                    funnel.BUY.pullback++;

                                    if (
                                        d.bullishRejection &&
                                        d.bullishBodyQuality &&
                                        d.bullishCloseQuality
                                    ) {

                                        funnel.BUY.candle++;

                                        if (d.buyRecovery) {

                                            funnel.BUY.recovery++;

                                            if (
                                                d.buyRSIZone &&
                                                d.buyRSIRecovery &&
                                                d.buyRSINotOverbought
                                            ) {

                                                funnel.BUY.rsi++;

                                                if (
                                                    d.noHeavyBearishPressure
                                                ) {

                                                    funnel.BUY.pressure++;

                                                    if (
                                                        d.buyTrendAcceleration
                                                    ) {

                                                        funnel.BUY.acceleration++;

                                                        if (
                                                            d.buyContinuation
                                                        ) {

                                                            funnel.BUY.continuation++;

                                                            if (
                                                                d.notOverextended &&
                                                                !d.hardOverextended &&
                                                                d.noExpansionCandle &&
                                                                d.entryGapAcceptable
                                                            ) {

                                                                funnel.BUY.safety++;

                                                                if (
                                                                    signal === "BUY"
                                                                ) {

                                                                    funnel.BUY.finalSignal++;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }


            // ==================================================
            // SELL FUNNEL
            // ==================================================

            if (d.bearishTrend) {

                funnel.SELL.trend++;

                if (d.bearishSlope) {

                    funnel.SELL.slope++;

                    if (d.strongEMASeparation) {

                        funnel.SELL.separation++;

                        if (d.strongTrend) {

                            funnel.SELL.strength++;

                            if (
                                d.belowVWAP &&
                                d.vwapConfirmed
                            ) {

                                funnel.SELL.vwap++;

                                if (d.sellPullback) {

                                    funnel.SELL.pullback++;

                                    if (
                                        d.strongBearishCandle
                                    ) {

                                        funnel.SELL.candle++;

                                        if (d.sellRecovery) {

                                            funnel.SELL.recovery++;

                                            if (d.sellRSI) {

                                                funnel.SELL.rsi++;

                                                if (
                                                    d.noHeavyBullishPressure
                                                ) {

                                                    funnel.SELL.pressure++;

                                                    if (
                                                        d.sellContinuation
                                                    ) {

                                                        funnel.SELL.continuation++;

                                                        if (
                                                            d.notOverextended &&
                                                            !d.hardOverextended &&
                                                            d.noExpansionCandle &&
                                                            d.entryGapAcceptable
                                                        ) {

                                                            funnel.SELL.safety++;

                                                            if (
                                                                signal === "SELL"
                                                            ) {

                                                                funnel.SELL.finalSignal++;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }


            // ==================================================
            // BUY DIAGNOSTICS
            // ==================================================

            if (
                d.bullishTrend &&
                !d.strongTrend
            ) {
                diagnostics.weakBuyTrend++;
            }

            if (
                d.bullishTrend &&
                !d.strongEMASeparation
            ) {
                diagnostics.weakBuySeparation++;
            }

            if (
                d.bullishTrend &&
                !d.bullishSlope
            ) {
                diagnostics.weakBuySlope++;
            }

            if (
                d.bullishTrend &&
                !d.buyTrendAcceleration
            ) {
                diagnostics.buyTrendAccelerationRejected++;
            }

            if (
                d.bullishTrend &&
                d.buySlopeRatio <
                CONFIG.MIN_BUY_SLOPE_RATIO
            ) {
                diagnostics.buySlopeRatioRejected++;
            }

            if (
                d.bullishTrend &&
                !d.buyRSIZone
            ) {
                diagnostics.buyRSIRejected++;
            }

            if (
                d.bullishTrend &&
                !d.buyRSIRecovery
            ) {
                diagnostics.buyRSIRecoveryRejected++;
            }

            if (
                d.bullishTrend &&
                !d.noHeavyBearishPressure
            ) {
                diagnostics.buyBearishPressureRejected++;
            }

            if (
                d.bullishTrend &&
                !d.bullishBodyQuality
            ) {
                diagnostics.buyBodyRejected++;
            }

            if (
                d.bullishTrend &&
                !d.bullishCloseQuality
            ) {
                diagnostics.buyCloseRejected++;
            }

            if (
                d.bullishTrend &&
                !d.bullishRejection
            ) {
                diagnostics.buyRejectionRejected++;
            }

            if (
                d.bullishTrend &&
                !d.buyRecovery
            ) {
                diagnostics.buyRecoveryRejected++;
            }

            if (
                d.bullishTrend &&
                !d.noExpansionCandle
            ) {
                diagnostics.buyExpansionRejected++;
            }

            if (
                d.bullishTrend &&
                !d.notOverextended
            ) {
                diagnostics.buyExtensionRejected++;
            }

            if (
                d.bullishTrend &&
                !d.buyContinuation
            ) {
                diagnostics.buyContinuationRejected++;
            }


            // ==================================================
            // SELL DIAGNOSTICS
            // ==================================================

            if (
                d.bearishTrend &&
                !d.sellPullback
            ) {
                diagnostics.sellPullbackRejected++;
            }

            if (
                d.bearishTrend &&
                !d.strongBearishCandle
            ) {
                diagnostics.sellRejectionRejected++;
            }

            if (
                d.bearishTrend &&
                !d.sellRecovery
            ) {
                diagnostics.sellRecoveryRejected++;
            }

            if (
                d.bearishTrend &&
                !d.sellRSI
            ) {
                diagnostics.sellRSIRejected++;
            }

            if (
                d.bearishTrend &&
                !d.noHeavyBullishPressure
            ) {
                diagnostics.sellBullishPressureRejected++;
            }

            if (
                d.bearishTrend &&
                !d.sellContinuation
            ) {
                diagnostics.sellContinuationRejected++;
            }

            if (
                d.bearishTrend &&
                !d.bearishBodyQuality
            ) {
                diagnostics.sellBodyRejected++;
            }

            if (
                d.bearishTrend &&
                !d.bearishCloseQuality
            ) {
                diagnostics.sellCloseRejected++;
            }

            if (
                d.bearishTrend &&
                !d.noExpansionCandle
            ) {
                diagnostics.sellExpansionRejected++;
            }

            if (
                d.bearishTrend &&
                !d.notOverextended
            ) {
                diagnostics.sellExtensionRejected++;
            }


            // ==================================================
            // OTHER DIAGNOSTICS
            // ==================================================

            if (
                !d.notOverextended
            ) {
                diagnostics.overextended++;
            }

            if (
                d.hardOverextended
            ) {
                diagnostics.hardOverextended++;
            }

            if (
                !d.vwapConfirmed
            ) {
                diagnostics.vwapTooClose++;
            }

            if (
                !d.validPullback
            ) {
                diagnostics.invalidPullback++;
            }

            const candleInfo =
                analyzeCandle(candle);

            if (
                candleInfo.bodyRatio <
                CONFIG.MIN_CANDLE_BODY_RATIO
            ) {
                diagnostics.weakCandle++;
            }

            if (
                !d.entryGapAcceptable
            ) {
                diagnostics.entryGapRejected++;
            }
        }


        // ==================================================
        // POSITION MANAGEMENT
        // ==================================================

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


        // ==================================================
        // SESSION CLOSE
        // ==================================================

        if (
            position &&
            minutes >=
            CONFIG.SESSION_CLOSE_MINUTES
        ) {

            const trade =
                closePosition(

                    position,

                    Number(candle.c),

                    candle.ts,

                    "SESSION CLOSE",

                    equityState

                );

            trades.push(trade);

            position = null;

            cooldown =
                CONFIG.COOLDOWN_CANDLES;

            closedThisCandle = true;
        }


        // ==================================================
        // SESSION FILTER
        // ==================================================

        if (
            minutes >=
            CONFIG.SESSION_CLOSE_MINUTES
        ) {

            diagnostics.sessionRejected++;

            continue;
        }


        // ==================================================
        // NO SAME CANDLE RE-ENTRY
        // ==================================================

        if (closedThisCandle) {
            continue;
        }


        // ==================================================
        // COOLDOWN
        // ==================================================

        if (
            cooldown > 0
        ) {

            cooldown--;

            diagnostics.cooldownRejected++;

            continue;
        }


        // ==================================================
        // ENTRY WINDOW
        // ==================================================

        if (
            minutes <
            CONFIG.ENTRY_START_MINUTES ||
            minutes >
            CONFIG.ENTRY_END_MINUTES
        ) {

            diagnostics.sessionRejected++;

            continue;
        }


        // ==================================================
        // SIGNAL DATA
        // ==================================================

        if (
            !indicators ||
            !signalResult
        ) {

            diagnostics.noTradeSignal++;

            continue;
        }


        // ==================================================
        // VALID SIGNAL
        // ==================================================

        if (
            signal === "WAIT"
        ) {

            continue;
        }


        // ==================================================
        // V10.25 SIGNAL DUPLICATION FIX
        // ==================================================

        /*
        A signal is considered duplicate only if the
        exact same candle has already generated a signal.

        We intentionally do NOT reject a new BUY simply
        because the previous valid signal was BUY.

        This lets the strategy discover independent
        setups after the previous trade has ended.
        */

        if (
            lastSignalTs === candle.ts
        ) {

            diagnostics.duplicateSignalRejected++;

            continue;
        }


        lastSignalTs =
            candle.ts;


        // ==================================================
        // NEXT CANDLE
        // ==================================================

        if (
            i + 1 >=
            candles.length
        ) {
            continue;
        }

        const nextCandle =
            candles[i + 1];

        if (
            getISTDate(nextCandle.ts) !==
            session
        ) {
            continue;
        }


        // ==================================================
        // ATR
        // ==================================================

        const atrValue =
            Number(
                indicators.atr14
            );

        if (
            !Number.isFinite(atrValue) ||
            atrValue <= 0
        ) {
            continue;
        }


        // ==================================================
        // ENTRY
        // ==================================================

        const entry =
            Number(nextCandle.o);

        if (
            !Number.isFinite(entry) ||
            entry <= 0
        ) {
            continue;
        }


        // ==================================================
        // ACTUAL ENTRY GAP
        // ==================================================

        const signalClose =
            Number(candle.c);

        const actualEntryGapATR =
            (
                entry -
                signalClose
            ) / atrValue;

        if (
            Math.abs(
                actualEntryGapATR
            ) >
            CONFIG.MAX_ENTRY_GAP_ATR
        ) {

            diagnostics.entryGapRejected++;

            continue;
        }


        // ==================================================
        // RISK
        // ==================================================

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


        // ==================================================
        // POSITION
        // ==================================================

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
                signalResult.diagnostics
                    ?.bodyRatio,

            closeLocation:
                signalResult.diagnostics
                    ?.closeLocation,

            entryGapATR:
                actualEntryGapATR,

            emaExtensionATR:
                signalResult.diagnostics
                    ?.emaExtensionATR,

            pullbackDistanceATR:
                signalResult.diagnostics
                    ?.pullbackDistanceATR,

            sellContinuation:
                signalResult.diagnostics
                    ?.sellContinuation,

            buyContinuation:
                signalResult.diagnostics
                    ?.buyContinuation

        };


        if (
            side === "BUY"
        ) {
            funnel.BUY.executed++;
        } else {
            funnel.SELL.executed++;
        }


        console.log(
            `${CONFIG.VERSION} ENTRY:`,
            position
        );
    }


    // ==================================================
    // FINAL POSITION
    // ==================================================

    if (position) {

        const last =
            candles[
                candles.length - 1
            ];

        const trade =
            closePosition(

                position,

                Number(last.c),

                last.ts,

                "END OF DATA",

                equityState

            );

        trades.push(trade);
    }


    // ==================================================
    // STATISTICS
    // ==================================================

    const totalTrades =
        trades.length;

    const buyTrades =
        trades.filter(
            trade =>
                trade.side === "BUY"
        );

    const sellTrades =
        trades.filter(
            trade =>
                trade.side === "SELL"
        );

    const winningTrades =
        trades.filter(
            trade =>
                trade.points > 0
        );

    const losingTrades =
        trades.filter(
            trade =>
                trade.points <= 0
        );

    const wins =
        winningTrades.length;

    const losses =
        losingTrades.length;

    const winRate =
        totalTrades > 0
            ? (
                wins /
                totalTrades
            ) * 100
            : 0;

    const totalPoints =
        trades.reduce(
            (sum, trade) =>
                sum + trade.points,
            0
        );

    const averageWin =
        wins > 0
            ? winningTrades.reduce(
                (sum, trade) =>
                    sum + trade.points,
                0
            ) / wins
            : 0;

    const averageLoss =
        losses > 0
            ? Math.abs(
                losingTrades.reduce(
                    (sum, trade) =>
                        sum + trade.points,
                    0
                ) / losses
            )
            : 0;

    const grossProfit =
        winningTrades.reduce(
            (sum, trade) =>
                sum + trade.points,
            0
        );

    const grossLoss =
        Math.abs(
            losingTrades.reduce(
                (sum, trade) =>
                    sum + trade.points,
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
                    trade =>
                        trade.points > 0
                ).length,

            losses:
                buyTrades.filter(
                    trade =>
                        trade.points <= 0
                ).length,

            winRate:
                buyTrades.length > 0
                    ? (
                        buyTrades.filter(
                            trade =>
                                trade.points > 0
                        ).length /
                        buyTrades.length
                    ) * 100
                    : 0,

            points:
                buyTrades.reduce(
                    (sum, trade) =>
                        sum + trade.points,
                    0
                )

        },

        SELL: {

            trades:
                sellTrades.length,

            wins:
                sellTrades.filter(
                    trade =>
                        trade.points > 0
                ).length,

            losses:
                sellTrades.filter(
                    trade =>
                        trade.points <= 0
                ).length,

            winRate:
                sellTrades.length > 0
                    ? (
                        sellTrades.filter(
                            trade =>
                                trade.points > 0
                        ).length /
                        sellTrades.length
                    ) * 100
                    : 0,

            points:
                sellTrades.reduce(
                    (sum, trade) =>
                        sum + trade.points,
                    0
                )

        }

    };


    const targetExits =
        trades.filter(
            trade =>
                trade.reason === "TARGET"
        ).length;

    const stopLossExits =
        trades.filter(
            trade =>
                trade.reason === "STOP LOSS"
        ).length;

    const sessionCloseExits =
        trades.filter(
            trade =>
                trade.reason === "SESSION CLOSE"
        ).length;

    const gapExits =
        trades.filter(
            trade =>
                trade.reason.includes("GAP")
        ).length;

    const endOfDataExits =
        trades.filter(
            trade =>
                trade.reason === "END OF DATA"
        ).length;


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

        targetExits,

        stopLossExits,

        sessionCloseExits,

        gapExits,

        endOfDataExits,

        directionStats,

        funnel,

        diagnostics,

        trades

    };
}


// ======================================================
// EXTRACT CANDLES
// ======================================================

function extractCandles(result) {

    const candidates = [

        result
            ?.data
            ?.NIDX_40000001
            ?.candles,

        result
            ?.data
            ?.candles,

        result
            ?.candles

    ];

    for (
        const candidate of candidates
    ) {

        if (
            Array.isArray(candidate)
        ) {
            return candidate;
        }
    }


    if (
        result?.data &&
        typeof result.data === "object"
    ) {

        for (
            const key of Object.keys(
                result.data
            )
        ) {

            const lower =
                key.toLowerCase();

            if (
                lower.includes("40000001") ||
                lower.includes("nidx_40000001") ||
                lower === "nifty" ||
                lower === "nifty50"
            ) {

                const block =
                    result.data[key];

                if (
                    Array.isArray(block)
                ) {
                    return block;
                }

                if (
                    Array.isArray(
                        block?.candles
                    )
                ) {
                    return block.candles;
                }

                if (
                    Array.isArray(
                        block?.data
                    )
                ) {
                    return block.data;
                }
            }
        }
    }

    return [];
}


// ======================================================
// API HANDLER
// ======================================================

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


        // ==================================================
        // NIFTY
        // ==================================================

        const NIFTY_ID =
            "40000001";

        const scripCode =
            `NIDX_${NIFTY_ID}`;


        // ==================================================
        // HISTORICAL WINDOW
        // ==================================================

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


        // ==================================================
        // API URL
        // ==================================================

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


        // ==================================================
        // FETCH
        // ==================================================

        const response =
            await fetch(
                url,
                {

                    method: "GET",

                    headers: {

                        Authorization:
                            token,

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
                    text.slice(
                        0,
                        1000
                    )

            });
        }


        console.log(
            `${CONFIG.VERSION} INDstocks response:`,
            JSON.stringify(
                result
            ).slice(
                0,
                3000
            )
        );


        // ==================================================
        // API ERROR
        // ==================================================

        if (
            !response.ok
        ) {

            return res.status(
                response.status
            ).json({

                success: false,

                version:
                    CONFIG.VERSION,

                error:
                    result

            });
        }


        // ==================================================
        // EXTRACT
        // ==================================================

        const rawCandles =
            extractCandles(result);


        console.log(
            `${CONFIG.VERSION} raw candle count:`,
            Array.isArray(rawCandles)
                ? rawCandles.length
                : 0
        );


        // ==================================================
        // NORMALIZE
        // ==================================================

        const candles =
            normalizeCandles(
                rawCandles
            );


        console.log(
            `${CONFIG.VERSION} normalized candle count:`,
            candles.length
        );


        // ==================================================
        // INSUFFICIENT DATA
        // ==================================================

        if (
            candles.length < 50
        ) {

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

                funnel: {},

                diagnostics: {},

                trades: []

            });
        }


        // ==================================================
        // RUN
        // ==================================================

        const backtest =
            runBacktest(candles);


        // ==================================================
        // LOG
        // ==================================================

        console.log(
            "================================"
        );

        console.log(
            `${CONFIG.VERSION} RESULT`
        );

        console.log(
            "Candles:",
            backtest.candlesTested
        );

        console.log(
            "Trades:",
            backtest.totalTrades
        );

        console.log(
            "BUY:",
            backtest.buyTrades
        );

        console.log(
            "SELL:",
            backtest.sellTrades
        );

        console.log(
            "Wins:",
            backtest.winningTrades
        );

        console.log(
            "Losses:",
            backtest.losingTrades
        );

        console.log(
            "Win rate:",
            backtest.winRate
        );

        console.log(
            "Total points:",
            backtest.totalPoints
        );

        console.log(
            "Profit factor:",
            backtest.profitFactor
        );

        console.log(
            "Max drawdown:",
            backtest.maxDrawdown
        );

        console.log(
            "Funnel:",
            backtest.funnel
        );

        console.log(
            "Diagnostics:",
            backtest.diagnostics
        );

        console.table(
            backtest.trades
        );

        console.log(
            "================================"
        );


        // ==================================================
        // RESPONSE
        // ==================================================

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

            funnel:
                backtest.funnel,

            diagnostics:
                backtest.diagnostics,

            trades:
                backtest.trades

        });

    } catch (error) {

        console.error(
            `${CONFIG.VERSION} BACKTEST ERROR:`,
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
