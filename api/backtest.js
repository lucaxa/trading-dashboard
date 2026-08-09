/*
TradeMind Pro
V10.17 Historical Backtest Engine

V10.17 DIRECTIONAL STRATEGY

IMPORTANT:
- PAPER BACKTEST ONLY
- NO REAL ORDERS
- INDstocks historical candles
- NIFTY 50
- 5 minute default

V10.17:

SELL:
- EMA 9 / EMA 21 bearish
- EMA slope bearish
- EMA separation
- Trend strength
- VWAP confirmation
- Pullback toward EMA9
- RSI bearish momentum
- Bearish candle confirmation
- Not overextended
- Entry gap protection

BUY:
- Separate BUY architecture
- Bullish EMA trend
- Positive EMA slopes
- Strong EMA separation
- Trend strength
- Controlled EMA9 pullback
- Previous candle must show pullback
- Bullish recovery candle
- RSI recovery from lower zone
- RSI not already extended
- VWAP distance protection
- EMA extension protection
- Previous expansion candle protection
- Entry gap protection

Risk:
- ATR based stop
- 1:2 reward/risk
- Next candle execution
- One position at a time
- Cooldown
- No same-candle re-entry
- No overnight positions
*/


// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {

    VERSION: "V10.17",

    EMA_FAST: 9,

    EMA_SLOW: 21,

    RSI_PERIOD: 14,

    ATR_PERIOD: 14,

    ATR_STOP_MULTIPLIER: 1.5,

    RISK_REWARD: 2,

    // --------------------------------------------------
    // GENERAL TREND FILTERS
    // --------------------------------------------------

    MIN_DIRECTIONAL_STRENGTH: 0.30,

    MIN_EMA_ATR_SEPARATION: 0.25,

    MIN_VWAP_ATR_DISTANCE: 0.05,

    // --------------------------------------------------
    // EMA SLOPE
    // --------------------------------------------------

    EMA_SLOPE_LOOKBACK: 3,

    MIN_BUY_EMA9_SLOPE_ATR: 0.03,

    MIN_SELL_EMA9_SLOPE_ATR: 0.02,

    // --------------------------------------------------
    // GENERAL PULLBACK
    // --------------------------------------------------

    MIN_PULLBACK_ATR: 0.08,

    MAX_PULLBACK_ATR: 0.85,

    // --------------------------------------------------
    // GENERAL CANDLE
    // --------------------------------------------------

    MIN_CANDLE_BODY_RATIO: 0.40,

    MIN_CLOSE_LOCATION: 0.60,

    // --------------------------------------------------
    // GENERAL EXTENSION
    // --------------------------------------------------

    MAX_EMA_EXTENSION_ATR: 1.15,

    HARD_EMA_EXTENSION_ATR: 1.40,

    // --------------------------------------------------
    // SELL RSI
    // --------------------------------------------------

    SELL_RSI_MIN: 35,

    SELL_RSI_MAX: 48,

    SELL_RSI_HARD_MIN: 30,

    SELL_RSI_HARD_MAX: 52,

    // --------------------------------------------------
    // V10.17 BUY RSI
    // --------------------------------------------------

    BUY_RSI_MIN: 48,

    BUY_RSI_MAX: 59,

    BUY_RSI_HARD_MAX: 62,

    // --------------------------------------------------
    // RSI RECOVERY
    // --------------------------------------------------

    RSI_RECOVERY_LOOKBACK: 2,

    MIN_BUY_RSI_RISE: 1.00,

    MAX_BUY_RSI_DROP: 0.75,

    // --------------------------------------------------
    // V10.17 BUY PULLBACK
    // --------------------------------------------------

    BUY_PULLBACK_MAX_ATR: 0.55,

    BUY_EMA_TOUCH_ATR: 0.18,

    BUY_MAX_RECOVERY_DISTANCE_ATR: 0.55,

    BUY_MIN_WICK_REJECTION_RATIO: 0.25,

    // --------------------------------------------------
    // V10.17 BUY CANDLE
    // --------------------------------------------------

    BUY_MIN_CLOSE_LOCATION: 0.65,

    BUY_MIN_BODY_RATIO: 0.45,

    // --------------------------------------------------
    // V10.17 PREVIOUS CANDLE
    // --------------------------------------------------

    BUY_REQUIRE_PULLBACK_CANDLE: true,

    BUY_MAX_PREVIOUS_BODY_RATIO: 0.70,

    BUY_MAX_PREVIOUS_RANGE_ATR: 1.20,

    // --------------------------------------------------
    // V10.17 BUY VWAP
    // --------------------------------------------------

    BUY_MAX_VWAP_DISTANCE_ATR: 0.85,

    // --------------------------------------------------
    // V10.17 BUY EXTENSION
    // --------------------------------------------------

    BUY_MAX_EMA_EXTENSION_ATR: 0.65,

    // --------------------------------------------------
    // ENTRY GAP
    // --------------------------------------------------

    MAX_ENTRY_GAP_ATR: 0.25,

    // --------------------------------------------------
    // COOLDOWN
    // --------------------------------------------------

    COOLDOWN_CANDLES: 3,

    // --------------------------------------------------
    // TRADING SESSION
    // --------------------------------------------------

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
                (sum, item) =>
                    sum + Number(item),
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

        if (
            change > 0
        ) {

            gains += change;

        }

        else {

            losses +=
                Math.abs(change);

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
            Math.max(
                change,
                0
            );

        const loss =
            Math.max(
                -change,
                0
            );

        averageGain =
            (
                averageGain *
                (period - 1) +
                gain
            ) / period;

        averageLoss =
            (
                averageLoss *
                (period - 1) +
                loss
            ) / period;

    }

    if (
        averageLoss === 0
    ) {

        return 100;

    }

    const rs =
        averageGain /
        averageLoss;

    return (
        100 -
        (
            100 /
            (1 + rs)
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
            high -
            previousClose
        ),

        Math.abs(
            low -
            previousClose
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
                value *
                (period - 1) +
                ranges[i]
            ) / period;

    }

    return value;

}


// ======================================================
// IST DATE
// ======================================================

function getISTDate(
    timestamp
) {

    const date =
        new Date(
            Number(timestamp) *
            1000 +
            (
                5.5 *
                60 *
                60 *
                1000
            )
        );

    return date
        .toISOString()
        .slice(0, 10);

}


// ======================================================
// IST MINUTES
// ======================================================

function getISTMinutes(
    timestamp
) {

    const date =
        new Date(
            Number(timestamp) *
            1000 +
            (
                5.5 *
                60 *
                60 *
                1000
            )
        );

    return (
        date.getUTCHours() *
        60
    ) +
    date.getUTCMinutes();

}


// ======================================================
// VWAP
// ======================================================

function vwap(
    candles
) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        return null;

    }

    const latest =
        candles[
            candles.length - 1
        ];

    const session =
        getISTDate(
            latest.ts
        );

    let totalPV = 0;

    let totalVolume = 0;

    for (
        const candle of candles
    ) {

        if (
            getISTDate(
                candle.ts
            ) !== session
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
            typicalPrice *
            volume;

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

function normalizeCandles(
    candles
) {

    if (
        !Array.isArray(candles)
    ) {

        return [];

    }

    return candles

        .map(
            candle => {

                if (
                    Array.isArray(candle)
                ) {

                    const normalized = {

                        ts:
                            Number(candle[0]),

                        o:
                            Number(candle[1]),

                        h:
                            Number(candle[2]),

                        l:
                            Number(candle[3]),

                        c:
                            Number(candle[4]),

                        v:
                            Number(
                                candle[5] ?? 0
                            )

                    };

                    if (
                        !Number.isFinite(
                            normalized.ts
                        ) ||
                        !Number.isFinite(
                            normalized.o
                        ) ||
                        !Number.isFinite(
                            normalized.h
                        ) ||
                        !Number.isFinite(
                            normalized.l
                        ) ||
                        !Number.isFinite(
                            normalized.c
                        )
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

                        ts:
                            Number(candle.ts),

                        o:
                            Number(candle.o),

                        h:
                            Number(candle.h),

                        l:
                            Number(candle.l),

                        c:
                            Number(candle.c),

                        v:
                            Number(
                                candle.v ?? 0
                            )

                    };

                    if (
                        !Number.isFinite(
                            normalized.ts
                        ) ||
                        !Number.isFinite(
                            normalized.o
                        ) ||
                        !Number.isFinite(
                            normalized.h
                        ) ||
                        !Number.isFinite(
                            normalized.l
                        ) ||
                        !Number.isFinite(
                            normalized.c
                        )
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

            }
        )

        .filter(Boolean)

        .sort(
            (a, b) =>
                a.ts -
                b.ts
        );

}


// ======================================================
// HISTORICAL INDICATORS
// ======================================================

function calculateHistoricalIndicators(
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
        vwap(
            history
        );

    if (
        !Number.isFinite(ema9Value) ||
        !Number.isFinite(ema21Value) ||
        !Number.isFinite(rsiValue) ||
        !Number.isFinite(atrValue) ||
        !Number.isFinite(vwapValue)
    ) {

        return null;

    }

    // --------------------------------------------------
    // PREVIOUS EMA VALUES
    // --------------------------------------------------

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
        Number.isFinite(
            ema9Previous
        )
            ? ema9Value -
              ema9Previous
            : null;

    const ema21Slope =
        Number.isFinite(
            ema21Previous
        )
            ? ema21Value -
              ema21Previous
            : null;

    // --------------------------------------------------
    // EMA SPREAD
    // --------------------------------------------------

    const emaSpread =
        Math.abs(
            ema9Value -
            ema21Value
        );

    const directionalStrength =
        atrValue > 0
            ? emaSpread /
              atrValue
            : 0;

    // --------------------------------------------------
    // PREVIOUS RSI
    // --------------------------------------------------

    let previousRSI = null;

    let previousPreviousRSI = null;

    if (
        history.length >=
        CONFIG.RSI_PERIOD + 3
    ) {

        const previousHistory =
            history.slice(
                0,
                history.length - 1
            );

        const previousPreviousHistory =
            history.slice(
                0,
                history.length - 2
            );

        previousRSI =
            rsi(
                previousHistory.map(
                    candle =>
                        Number(candle.c)
                ),
                CONFIG.RSI_PERIOD
            );

        previousPreviousRSI =
            rsi(
                previousPreviousHistory.map(
                    candle =>
                        Number(candle.c)
                ),
                CONFIG.RSI_PERIOD
            );

    }

    return {

        ema9:
            ema9Value,

        ema21:
            ema21Value,

        ema9Slope,

        ema21Slope,

        emaSpread,

        rsi14:
            rsiValue,

        previousRSI,

        previousPreviousRSI,

        atr14:
            atrValue,

        vwap:
            vwapValue,

        directionalStrength

    };

}


// ======================================================
// CANDLE ANALYSIS
// ======================================================

function analyzeCandle(
    candle
) {

    const open =
        Number(candle.o);

    const high =
        Number(candle.h);

    const low =
        Number(candle.l);

    const close =
        Number(candle.c);

    const range =
        high -
        low;

    const body =
        Math.abs(
            close -
            open
        );

    const upperWick =
        high -
        Math.max(
            open,
            close
        );

    const lowerWick =
        Math.min(
            open,
            close
        ) -
        low;

    const bodyRatio =
        range > 0
            ? body / range
            : 0;

    const closeLocation =
        range > 0
            ? (
                close -
                low
            ) / range
            : 0.5;

    const bullish =
        close >
        open;

    const bearish =
        close <
        open;

    return {

        range,

        body,

        upperWick,

        lowerWick,

        bodyRatio,

        closeLocation,

        bullish,

        bearish

    };

}


// ======================================================
// V10.17 SIGNAL
// ======================================================

function getSignal(
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

            reason:
                "Missing data"

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

    const previousPreviousRSI =
        Number(
            indicators.previousPreviousRSI
        );

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

            reason:
                "Indicators unavailable"

        };

    }

    // ==================================================
    // CANDLE ANALYSIS
    // ==================================================

    const currentCandle =
        analyzeCandle(
            candle
        );

    const previousAnalysis =
        previousCandle
            ? analyzeCandle(
                previousCandle
            )
            : null;

    const previousPreviousAnalysis =
        previousPreviousCandle
            ? analyzeCandle(
                previousPreviousCandle
            )
            : null;

    // ==================================================
    // BASIC TREND
    // ==================================================

    const bullishTrend =
        ema9 >
        ema21;

    const bearishTrend =
        ema9 <
        ema21;

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
    // EMA SLOPE
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
    // VWAP
    // ==================================================

    const aboveVWAP =
        close >
        vwapValue;

    const belowVWAP =
        close <
        vwapValue;

    const vwapDistance =
        Math.abs(
            close -
            vwapValue
        );

    const vwapDistanceATR =
        vwapDistance /
        atr14;

    const vwapConfirmed =
        vwapDistanceATR >=
        CONFIG.MIN_VWAP_ATR_DISTANCE;

    // ==================================================
    // EXTENSION
    // ==================================================

    const emaExtension =
        Math.abs(
            close -
            ema9
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
    // GENERAL PULLBACK
    // ==================================================

    const pullbackDistance =
        Math.abs(
            close -
            ema9
        );

    const pullbackDistanceATR =
        pullbackDistance /
        atr14;

    const validPullback =
        pullbackDistanceATR >=
            CONFIG.MIN_PULLBACK_ATR &&
        pullbackDistanceATR <=
            CONFIG.MAX_PULLBACK_ATR;

    // ==================================================
    // RSI
    // ==================================================

    const sellRSI =
        rsi14 >=
            CONFIG.SELL_RSI_MIN &&
        rsi14 <=
            CONFIG.SELL_RSI_MAX;

    const buyRSI =
        rsi14 >=
            CONFIG.BUY_RSI_MIN &&
        rsi14 <=
            CONFIG.BUY_RSI_MAX;

    const buyRSINotOverbought =
        rsi14 <=
        CONFIG.BUY_RSI_HARD_MAX;

    const buyRSIRecovery =
        Number.isFinite(previousRSI) &&
        Number.isFinite(previousPreviousRSI) &&
        rsi14 >
        previousRSI &&
        (
            rsi14 -
            previousRSI
        ) >=
        CONFIG.MIN_BUY_RSI_RISE &&
        previousRSI >=
        previousPreviousRSI;

    // ==================================================
    // PREVIOUS CANDLE
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

    const previousRange =
        previousCandle
            ? Number(previousCandle.h) -
              Number(previousCandle.l)
            : null;

    const previousRangeATR =
        Number.isFinite(previousRange)
            ? previousRange /
              atr14
            : Infinity;

    const previousBodyRatio =
        previousAnalysis
            ? previousAnalysis.bodyRatio
            : 0;

    const previousBearish =
        previousAnalysis?.bearish === true;

    // ==================================================
    // V10.17 CONTROLLED BUY PULLBACK
    // ==================================================

    const previousLowNearEMA9 =
        Number.isFinite(previousLow) &&
        previousLow <=
        (
            ema9 +
            atr14 *
            CONFIG.BUY_EMA_TOUCH_ATR
        );

    const previousCloseNearEMA9 =
        Number.isFinite(previousClose) &&
        Math.abs(
            previousClose -
            ema9
        ) /
        atr14 <=
        CONFIG.BUY_PULLBACK_MAX_ATR;

    const previousPullback =
        previousLowNearEMA9 ||
        previousCloseNearEMA9 ||
        previousBearish;

    const previousCandleNotExpansion =
        previousRangeATR <=
        CONFIG.BUY_MAX_PREVIOUS_RANGE_ATR &&
        previousBodyRatio <=
        CONFIG.BUY_MAX_PREVIOUS_BODY_RATIO;

    const validBuyPullback =
        previousPullback &&
        previousCandleNotExpansion;

    // ==================================================
    // CURRENT BUY RECOVERY
    // ==================================================

    const bullishCandle =
        currentCandle.bullish;

    const bullishBody =
        currentCandle.bodyRatio >=
        CONFIG.BUY_MIN_BODY_RATIO;

    const bullishCloseLocation =
        currentCandle.closeLocation >=
        CONFIG.BUY_MIN_CLOSE_LOCATION;

    const recoveryAboveEMA9 =
        close >
        ema9;

    const recoveryDistanceATR =
        Math.abs(
            close -
            ema9
        ) /
        atr14;

    const recoveryNotTooFar =
        recoveryDistanceATR <=
        CONFIG.BUY_MAX_RECOVERY_DISTANCE_ATR;

    const recoveryAbovePreviousClose =
        Number.isFinite(previousClose) &&
        close >
        previousClose;

    const recoveryAbovePreviousHigh =
        Number.isFinite(previousHigh) &&
        close >
        previousHigh;

    const bullishRecovery =
        bullishCandle &&
        bullishBody &&
        bullishCloseLocation &&
        recoveryAboveEMA9 &&
        recoveryAbovePreviousClose &&
        recoveryNotTooFar;

    // ==================================================
    // BUY VWAP DISTANCE
    // ==================================================

    const buyVWAPDistanceAcceptable =
        aboveVWAP &&
        vwapConfirmed &&
        vwapDistanceATR <=
        CONFIG.BUY_MAX_VWAP_DISTANCE_ATR;

    // ==================================================
    // BEARISH PRESSURE
    // ==================================================

    let bearishPressure = 0;

    if (
        previousAnalysis?.bearish
    ) {

        bearishPressure++;

    }

    if (
        previousPreviousAnalysis?.bearish
    ) {

        bearishPressure++;

    }

    const noHeavyBearishPressure =
        bearishPressure <= 1;

    // ==================================================
    // BUY RSI RECOVERY ZONE
    // ==================================================

    const buyRSIRecoveryZone =
        buyRSI &&
        buyRSIRecovery &&
        rsi14 < 59;

    // ==================================================
    // BUY EXTENSION
    // ==================================================

    const buyExtensionAcceptable =
        emaExtensionATR <=
        CONFIG.BUY_MAX_EMA_EXTENSION_ATR &&
        !hardOverextended;

    // ==================================================
    // SELL PULLBACK
    // ==================================================

    const sellPullback =
        validPullback &&
        close <=
        (
            ema9 +
            atr14 *
            0.15
        );

    // ==================================================
    // SELL CANDLE
    // ==================================================

    const strongBearishCandle =
        currentCandle.bearish &&
        currentCandle.bodyRatio >=
        CONFIG.MIN_CANDLE_BODY_RATIO &&
        currentCandle.closeLocation <=
        (
            1 -
            CONFIG.MIN_CLOSE_LOCATION
        );

    // ==================================================
    // ENTRY GAP
    // ==================================================

    let entryGapATR = 0;

    if (
        previousCandle
    ) {

        entryGapATR =
            (
                Number(candle.o) -
                Number(previousCandle.c)
            ) /
            atr14;

    }

    const entryGapAcceptable =
        Math.abs(entryGapATR) <=
        CONFIG.MAX_ENTRY_GAP_ATR;

    // ==================================================
    // BUY SCORE
    // ==================================================

    let buyScore = 0;

    const buyReasons = [];

    if (
        bullishTrend
    ) {

        buyScore++;

        buyReasons.push(
            "Bullish trend"
        );

    }

    if (
        bullishSlope
    ) {

        buyScore++;

        buyReasons.push(
            "EMA slope bullish"
        );

    }

    if (
        strongEMASeparation
    ) {

        buyScore++;

        buyReasons.push(
            "Strong EMA separation"
        );

    }

    if (
        strongTrend
    ) {

        buyScore++;

        buyReasons.push(
            "Trend strength"
        );

    }

    if (
        buyVWAPDistanceAcceptable
    ) {

        buyScore++;

        buyReasons.push(
            "VWAP confirmation"
        );

    }

    if (
        validBuyPullback
    ) {

        buyScore++;

        buyReasons.push(
            "Controlled EMA9 pullback"
        );

    }

    if (
        bullishRecovery
    ) {

        buyScore++;

        buyReasons.push(
            "Bullish pullback recovery"
        );

    }

    if (
        buyRSIRecoveryZone
    ) {

        buyScore++;

        buyReasons.push(
            "RSI recovery zone"
        );

    }

    if (
        noHeavyBearishPressure
    ) {

        buyScore++;

        buyReasons.push(
            "No heavy bearish pressure"
        );

    }

    if (
        buyExtensionAcceptable
    ) {

        buyScore++;

        buyReasons.push(
            "BUY extension acceptable"
        );

    }

    if (
        entryGapAcceptable
    ) {

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

    if (
        bearishTrend
    ) {

        sellScore++;

        sellReasons.push(
            "Bearish trend"
        );

    }

    if (
        bearishSlope
    ) {

        sellScore++;

        sellReasons.push(
            "EMA slope bearish"
        );

    }

    if (
        strongEMASeparation
    ) {

        sellScore++;

        sellReasons.push(
            "Strong EMA separation"
        );

    }

    if (
        strongTrend
    ) {

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

    if (
        sellPullback
    ) {

        sellScore++;

        sellReasons.push(
            "EMA9 pullback"
        );

    }

    if (
        sellRSI
    ) {

        sellScore++;

        sellReasons.push(
            "RSI momentum"
        );

    }

    if (
        strongBearishCandle
    ) {

        sellScore++;

        sellReasons.push(
            "Strong bearish candle"
        );

    }

    if (
        notOverextended
    ) {

        sellScore++;

        sellReasons.push(
            "Not overextended"
        );

    }

    if (
        entryGapAcceptable
    ) {

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
        buyVWAPDistanceAcceptable &&
        validBuyPullback &&
        bullishRecovery &&
        buyRSIRecoveryZone &&
        buyRSINotOverbought &&
        noHeavyBearishPressure &&
        buyExtensionAcceptable &&
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
        notOverextended &&
        !hardOverextended &&
        entryGapAcceptable;

    // ==================================================
    // SIGNAL
    // ==================================================

    let signal =
        "WAIT";

    let reason =
        "Waiting for V10.17 confirmation";

    if (
        strictBuy &&
        buyScore > sellScore
    ) {

        signal =
            "BUY";

        reason =
            buyReasons.join(
                " + "
            );

    }

    else if (
        strictSell &&
        sellScore > buyScore
    ) {

        signal =
            "SELL";

        reason =
            sellReasons.join(
                " + "
            );

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
                currentCandle.bodyRatio,

            closeLocation:
                currentCandle.closeLocation,

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

            validBuyPullback,

            previousPullback,

            previousLowNearEMA9,

            previousCloseNearEMA9,

            previousBearish,

            previousCandleNotExpansion,

            bullishRecovery,

            recoveryAboveEMA9,

            recoveryAbovePreviousClose,

            recoveryAbovePreviousHigh,

            recoveryDistanceATR,

            recoveryNotTooFar,

            buyVWAPDistanceAcceptable,

            buyRSI,

            buyRSIRecovery,

            buyRSIRecoveryZone,

            buyRSINotOverbought,

            noHeavyBearishPressure,

            bearishPressure,

            strongBearishCandle,

            sellRSI,

            notOverextended,

            hardOverextended,

            buyExtensionAcceptable,

            entryGapAcceptable

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

            ? exitPrice -
              position.entry

            : position.entry -
              exitPrice;

    equityState.equity +=
        points;

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
                position.entryTs *
                1000
            ).toISOString(),

        exitTime:
            new Date(
                exitTs *
                1000
            ).toISOString(),

        signalTime:
            new Date(
                position.signalTs *
                1000
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


// ======================================================
// MANAGE POSITION
// ======================================================

function managePosition(
    position,
    candle,
    equityState
) {

    if (
        !position
    ) {

        return null;

    }

    const open =
        Number(candle.o);

    const high =
        Number(candle.h);

    const low =
        Number(candle.l);

    // --------------------------------------------------
    // BUY
    // --------------------------------------------------

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

    // --------------------------------------------------
    // SELL
    // --------------------------------------------------

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

function runBacktest(
    candles
) {

    const trades = [];

    let position = null;

    const equityState = {

        equity: 0,

        peakEquity: 0,

        maxDrawdown: 0

    };

    let cooldown = 0;

    let previousSession = null;

    let previousSignal =
        "WAIT";

    const diagnostics = {

        weakTrend: 0,

        weakEMASeparation: 0,

        weakSlope: 0,

        weakBuyTrend: 0,

        weakBuySeparation: 0,

        weakBuySlope: 0,

        vwapTooClose: 0,

        invalidPullback: 0,

        overextended: 0,

        hardOverextended: 0,

        rsiRejected: 0,

        buyRSIRejected: 0,

        buyRSIRecoveryRejected: 0,

        buyRSIZoneRejected: 0,

        buyBearishPressureRejected: 0,

        buyRejectionRejected: 0,

        buyRecoveryRejected: 0,

        buyPullbackRejected: 0,

        buyVWAPDistanceRejected: 0,

        buyExtensionRejected: 0,

        buyExpansionRejected: 0,

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
            getISTDate(
                candle.ts
            );

        const minutes =
            getISTMinutes(
                candle.ts
            );

        let closedThisCandle =
            false;

        // ==================================================
        // NEW SESSION
        // ==================================================

        if (
            previousSession !== null &&
            session !== previousSession
        ) {

            if (
                position
            ) {

                const previousSessionCandle =
                    candles[i - 1];

                const trade =
                    closePosition(

                        position,

                        previousSessionCandle.c,

                        previousSessionCandle.ts,

                        "SESSION CLOSE",

                        equityState

                    );

                trades.push(
                    trade
                );

                position =
                    null;

                cooldown =
                    CONFIG.COOLDOWN_CANDLES;

                closedThisCandle =
                    true;

            }

            previousSignal =
                "WAIT";

        }

        previousSession =
            session;

        // ==================================================
        // INDICATORS
        // ==================================================

        const indicators =
            calculateHistoricalIndicators(
                candles,
                i
            );

        let signalResult =
            null;

        let signal =
            "WAIT";

        if (
            indicators
        ) {

            signalResult =
                getSignal(

                    candle,

                    indicators,

                    previousCandle,

                    previousPreviousCandle

                );

            signal =
                signalResult.signal;

            // ==================================================
            // DIAGNOSTICS
            // ==================================================

            const d =
                signalResult.diagnostics;

            if (
                !d.strongTrend
            ) {

                diagnostics.weakTrend++;

            }

            if (
                !d.strongEMASeparation
            ) {

                diagnostics.weakEMASeparation++;

            }

            if (
                !d.bullishSlope &&
                !d.bearishSlope
            ) {

                diagnostics.weakSlope++;

            }

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
                !d.vwapConfirmed
            ) {

                diagnostics.vwapTooClose++;

            }

            if (
                !d.validPullback
            ) {

                diagnostics.invalidPullback++;

            }

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
                !d.sellRSI &&
                !d.buyRSI
            ) {

                diagnostics.rsiRejected++;

            }

            if (
                d.bullishTrend &&
                !d.buyRSI
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
                !d.buyRSIRecoveryZone
            ) {

                diagnostics.buyRSIZoneRejected++;

            }

            if (
                d.bullishTrend &&
                !d.noHeavyBearishPressure
            ) {

                diagnostics.buyBearishPressureRejected++;

            }

            if (
                d.bullishTrend &&
                !d.validBuyPullback
            ) {

                diagnostics.buyPullbackRejected++;

            }

            if (
                d.bullishTrend &&
                !d.bullishRecovery
            ) {

                diagnostics.buyRecoveryRejected++;

            }

            if (
                d.bullishTrend &&
                !d.buyVWAPDistanceAcceptable
            ) {

                diagnostics.buyVWAPDistanceRejected++;

            }

            if (
                d.bullishTrend &&
                !d.buyExtensionAcceptable
            ) {

                diagnostics.buyExtensionRejected++;

            }

            if (
                d.bullishTrend &&
                !d.previousCandleNotExpansion
            ) {

                diagnostics.buyExpansionRejected++;

            }

            if (
                d.bullishTrend &&
                !d.bullishRecovery
            ) {

                diagnostics.buyRejectionRejected++;

            }

            const candleInfo =
                analyzeCandle(
                    candle
                );

            if (
                candleInfo.bodyRatio <
                CONFIG.MIN_CANDLE_BODY_RATIO
            ) {

                diagnostics.weakCandle++;

            }

            if (
                d.bullishTrend &&
                !d.bullishRecovery
            ) {

                diagnostics.buyCandleRejected++;

            }

            if (
                d.bearishTrend &&
                !d.strongBearishCandle
            ) {

                diagnostics.bearishCandleRejected++;

            }

            if (
                d.bullishTrend &&
                !d.bullishCloseLocation
            ) {

                diagnostics.bullishCloseRejected++;

            }

            if (
                d.bearishTrend &&
                !d.strongBearishCandle
            ) {

                diagnostics.bearishCloseRejected++;

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

        if (
            position
        ) {

            const trade =
                managePosition(

                    position,

                    candle,

                    equityState

                );

            if (
                trade
            ) {

                trades.push(
                    trade
                );

                position =
                    null;

                cooldown =
                    CONFIG.COOLDOWN_CANDLES;

                closedThisCandle =
                    true;

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

                    candle.c,

                    candle.ts,

                    "SESSION CLOSE",

                    equityState

                );

            trades.push(
                trade
            );

            position =
                null;

            cooldown =
                CONFIG.COOLDOWN_CANDLES;

            closedThisCandle =
                true;

        }

        // ==================================================
        // FRESH SIGNAL
        // ==================================================

        const freshSignal =
            signal !== "WAIT" &&
            signal !== previousSignal;

        previousSignal =
            signal;

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
        // NO ENTRY AFTER EXIT
        // ==================================================

        if (
            closedThisCandle
        ) {

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
        // INDICATORS
        // ==================================================

        if (
            !indicators ||
            !signalResult
        ) {

            diagnostics.noTradeSignal++;

            continue;

        }

        // ==================================================
        // FRESH SIGNAL
        // ==================================================

        if (
            !freshSignal
        ) {

            diagnostics.duplicateSignalRejected++;

            continue;

        }

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
            getISTDate(
                nextCandle.ts
            ) !== session
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
            Number(
                nextCandle.o
            );

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
            Number(
                candle.c
            );

        const actualEntryGapATR =
            (
                entry -
                signalClose
            ) /
            atrValue;

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
        // STOP / TARGET
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
        // CREATE POSITION
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
                    ?.pullbackDistanceATR

        };

        console.log(
            `${CONFIG.VERSION} ENTRY:`,
            position
        );

    }

    // ==================================================
    // CLOSE FINAL POSITION
    // ==================================================

    if (
        position
    ) {

        const last =
            candles[
                candles.length - 1
            ];

        const trade =
            closePosition(

                position,

                last.c,

                last.ts,

                "END OF DATA",

                equityState

            );

        trades.push(
            trade
        );

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
                sum +
                trade.points,
            0
        );

    const averageWin =
        wins > 0
            ? winningTrades.reduce(
                (sum, trade) =>
                    sum +
                    trade.points,
                0
            ) / wins
            : 0;

    const averageLoss =
        losses > 0
            ? Math.abs(
                losingTrades.reduce(
                    (sum, trade) =>
                        sum +
                        trade.points,
                    0
                ) / losses
            )
            : 0;

    const grossProfit =
        winningTrades.reduce(
            (sum, trade) =>
                sum +
                trade.points,
            0
        );

    const grossLoss =
        Math.abs(
            losingTrades.reduce(
                (sum, trade) =>
                    sum +
                    trade.points,
                0
            )
        );

    const profitFactor =
        grossLoss > 0
            ? grossProfit /
              grossLoss
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
                        sum +
                        trade.points,
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
                        sum +
                        trade.points,
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

        diagnostics,

        trades

    };

}


// ======================================================
// EXTRACT CANDLES
// ======================================================

function extractCandles(
    result
) {

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

        if (
            !token
        ) {

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
        // NIFTY 50
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

                    method:
                        "GET",

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

        }

        catch {

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
            extractCandles(
                result
            );

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

                diagnostics: {},

                trades: []

            });

        }

        // ==================================================
        // RUN BACKTEST
        // ==================================================

        const backtest =
            runBacktest(
                candles
            );

        // ==================================================
        // LOG RESULT
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
            "Direction stats:",
            backtest.directionStats
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

            diagnostics:
                backtest.diagnostics,

            trades:
                backtest.trades

        });

    }

    catch (error) {

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
