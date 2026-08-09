/*
TradeMind Pro
V10.6 Historical Backtest Engine

INDstocks → Historical Candles → V10.6 Simulation

V10.6 Strategy:

CORE TREND
- EMA 9 / EMA 21
- EMA slope confirmation
- EMA separation
- EMA spread expansion
- Directional trend strength
- VWAP confirmation

MOMENTUM
- RSI 14
- Strong candle
- Candle close-location

ENTRY QUALITY
- EMA9 pullback zone
- Signal candle
- Confirmation candle
- Entry-gap protection
- Entry extension protection
- No chasing after large moves

RISK
- ATR 14
- ATR-based stop loss
- 1:2 Risk / Reward
- One position at a time
- Cooldown
- No overnight positions
- Conservative SL/Target handling

PAPER BACKTEST ONLY.
NO REAL ORDERS.
*/


// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {

    EMA_FAST: 9,

    EMA_SLOW: 21,

    RSI_PERIOD: 14,

    ATR_PERIOD: 14,

    // ----------------------------------------------
    // RISK
    // ----------------------------------------------

    ATR_STOP_MULTIPLIER: 1.5,

    RISK_REWARD: 2,

    // ----------------------------------------------
    // TREND
    // ----------------------------------------------

    MIN_EMA_ATR_SEPARATION: 0.12,

    MIN_DIRECTIONAL_STRENGTH: 0.12,

    // Require spread to be expanding
    MIN_SPREAD_EXPANSION_ATR: 0.02,

    // ----------------------------------------------
    // VWAP
    // ----------------------------------------------

    MIN_VWAP_ATR_DISTANCE: 0.08,

    // ----------------------------------------------
    // CANDLE
    // ----------------------------------------------

    MIN_CANDLE_BODY_RATIO: 0.50,

    MIN_CLOSE_LOCATION: 0.65,

    // ----------------------------------------------
    // EXTENSION
    // ----------------------------------------------

    MAX_EMA_EXTENSION_ATR: 1.25,

    // ----------------------------------------------
    // EMA PULLBACK
    // ----------------------------------------------

    MAX_PULLBACK_DISTANCE_ATR: 0.75,

    // ----------------------------------------------
    // SLOPE
    // ----------------------------------------------

    EMA_SLOPE_LOOKBACK: 3,

    // ----------------------------------------------
    // RSI
    // ----------------------------------------------

    BUY_RSI_MIN: 55,

    BUY_RSI_MAX: 65,

    SELL_RSI_MIN: 35,

    SELL_RSI_MAX: 45,

    // ----------------------------------------------
    // CONFIRMATION CANDLE
    // ----------------------------------------------

    MIN_CONFIRM_BODY_RATIO: 0.35,

    MIN_CONFIRM_CLOSE_LOCATION: 0.55,

    // ----------------------------------------------
    // ENTRY GAP PROTECTION
    // ----------------------------------------------

    MAX_ENTRY_GAP_ATR: 0.35,

    // ----------------------------------------------
    // ACTUAL ENTRY EXTENSION
    // ----------------------------------------------

    MAX_ENTRY_EXTENSION_ATR: 1.25,

    // ----------------------------------------------
    // COOLDOWN
    // ----------------------------------------------

    COOLDOWN_CANDLES: 3,

    // ----------------------------------------------
    // SESSION
    // ----------------------------------------------

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
            values[i] -
            values[i - 1];

        if (
            change > 0
        ) {

            gains += change;

        } else {

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
            values[i] -
            values[i - 1];

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
                candle.c
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

    // ----------------------------------------------
    // PREVIOUS EMA
    // ----------------------------------------------

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
                        candle.c
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

    // ----------------------------------------------
    // EMA SPREAD
    // ----------------------------------------------

    const emaSpread =
        Math.abs(
            ema9Value -
            ema21Value
        );

    // Previous spread
    let previousSpread = null;

    if (
        history.length >
        CONFIG.EMA_SLOPE_LOOKBACK
    ) {

        const previousHistory =
            history.slice(
                0,
                history.length -
                CONFIG.EMA_SLOPE_LOOKBACK
            );

        const previousCloses =
            previousHistory.map(
                candle =>
                    candle.c
            );

        const previousEMA9 =
            ema(
                previousCloses,
                CONFIG.EMA_FAST
            );

        const previousEMA21 =
            ema(
                previousCloses,
                CONFIG.EMA_SLOW
            );

        if (
            Number.isFinite(
                previousEMA9
            ) &&
            Number.isFinite(
                previousEMA21
            )
        ) {

            previousSpread =
                Math.abs(
                    previousEMA9 -
                    previousEMA21
                );

        }

    }

    const spreadExpansion =
        Number.isFinite(
            previousSpread
        )
            ? emaSpread -
              previousSpread
            : 0;

    const spreadExpanding =
        spreadExpansion >=
        (
            atrValue *
            CONFIG.MIN_SPREAD_EXPANSION_ATR
        );

    const directionalStrength =
        atrValue > 0
            ? emaSpread /
              atrValue
            : 0;

    return {

        ema9:
            ema9Value,

        ema21:
            ema21Value,

        ema9Slope,

        ema21Slope,

        emaSpread,

        previousSpread,

        spreadExpansion,

        spreadExpanding,

        rsi14:
            rsiValue,

        atr14:
            atrValue,

        vwap:
            vwapValue,

        directionalStrength

    };

}


// ======================================================
// CANDLE DIAGNOSTICS
// ======================================================

function getCandleDiagnostics(
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

    return {

        range,

        body,

        bodyRatio,

        closeLocation,

        bullish:
            close > open,

        bearish:
            close < open

    };

}


// ======================================================
// V10.6 SIGNAL
// ======================================================

function getSignal(
    candle,
    indicators
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

    const atr14 =
        Number(indicators.atr14);

    const vwapValue =
        Number(indicators.vwap);

    const directionalStrength =
        Number(
            indicators.directionalStrength
        );

    if (
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(ema9Slope) ||
        !Number.isFinite(ema21Slope) ||
        !Number.isFinite(emaSpread) ||
        !Number.isFinite(rsi14) ||
        !Number.isFinite(atr14) ||
        !Number.isFinite(vwapValue) ||
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

    const candleInfo =
        getCandleDiagnostics(
            candle
        );

    const close =
        Number(candle.c);

    // ----------------------------------------------
    // TREND
    // ----------------------------------------------

    const bullishEMA =
        ema9 >
        ema21;

    const bearishEMA =
        ema9 <
        ema21;

    const bullishSlope =
        ema9Slope > 0 &&
        ema21Slope >= 0;

    const bearishSlope =
        ema9Slope < 0 &&
        ema21Slope <= 0;

    const strongTrend =
        directionalStrength >=
        CONFIG.MIN_DIRECTIONAL_STRENGTH;

    // ----------------------------------------------
    // EMA SEPARATION
    // ----------------------------------------------

    const strongEMASeparation =
        (
            emaSpread /
            atr14
        ) >=
        CONFIG.MIN_EMA_ATR_SEPARATION;

    // ----------------------------------------------
    // VWAP
    // ----------------------------------------------

    const aboveVWAP =
        close >
        vwapValue;

    const belowVWAP =
        close <
        vwapValue;

    const vwapDistanceATR =
        atr14 > 0
            ? Math.abs(
                close -
                vwapValue
            ) / atr14
            : 0;

    const vwapDistanceAcceptable =
        vwapDistanceATR >=
        CONFIG.MIN_VWAP_ATR_DISTANCE;

    // ----------------------------------------------
    // EMA EXTENSION
    // ----------------------------------------------

    const emaExtensionATR =
        atr14 > 0
            ? Math.abs(
                close -
                ema9
            ) / atr14
            : 999;

    const notOverextended =
        emaExtensionATR <=
        CONFIG.MAX_EMA_EXTENSION_ATR;

    // ----------------------------------------------
    // PULLBACK ZONE
    // ----------------------------------------------

    const pullbackDistanceATR =
        atr14 > 0
            ? Math.abs(
                close -
                ema9
            ) / atr14
            : 999;

    const inPullbackZone =
        pullbackDistanceATR <=
        CONFIG.MAX_PULLBACK_DISTANCE_ATR;

    // ----------------------------------------------
    // CANDLE
    // ----------------------------------------------

    const strongCandle =
        candleInfo.bodyRatio >=
        CONFIG.MIN_CANDLE_BODY_RATIO;

    const bullishCloseLocation =
        candleInfo.closeLocation >=
        CONFIG.MIN_CLOSE_LOCATION;

    const bearishCloseLocation =
        candleInfo.closeLocation <=
        (
            1 -
            CONFIG.MIN_CLOSE_LOCATION
        );

    // ----------------------------------------------
    // SCORE
    // ----------------------------------------------

    let buyScore = 0;

    let sellScore = 0;

    const buyReasons = [];

    const sellReasons = [];

    // ==================================================
    // BUY
    // ==================================================

    if (
        bullishEMA
    ) {

        buyScore++;

        buyReasons.push(
            "EMA bullish"
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
        indicators.spreadExpanding
    ) {

        buyScore++;

        buyReasons.push(
            "EMA spread expanding"
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
        rsi14 >=
        CONFIG.BUY_RSI_MIN &&
        rsi14 <=
        CONFIG.BUY_RSI_MAX
    ) {

        buyScore++;

        buyReasons.push(
            "RSI momentum"
        );

    }

    if (
        aboveVWAP &&
        vwapDistanceAcceptable
    ) {

        buyScore++;

        buyReasons.push(
            "VWAP confirmation"
        );

    }

    if (
        notOverextended
    ) {

        buyScore++;

        buyReasons.push(
            "Not overextended"
        );

    }

    if (
        inPullbackZone
    ) {

        buyScore++;

        buyReasons.push(
            "EMA9 pullback zone"
        );

    }

    if (
        candleInfo.bullish &&
        strongCandle
    ) {

        buyScore++;

        buyReasons.push(
            "Strong bullish candle"
        );

    }

    if (
        bullishCloseLocation
    ) {

        buyScore++;

        buyReasons.push(
            "Bullish close location"
        );

    }

    // ==================================================
    // SELL
    // ==================================================

    if (
        bearishEMA
    ) {

        sellScore++;

        sellReasons.push(
            "EMA bearish"
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
        indicators.spreadExpanding
    ) {

        sellScore++;

        sellReasons.push(
            "EMA spread expanding"
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
        rsi14 >=
        CONFIG.SELL_RSI_MIN &&
        rsi14 <=
        CONFIG.SELL_RSI_MAX
    ) {

        sellScore++;

        sellReasons.push(
            "RSI momentum"
        );

    }

    if (
        belowVWAP &&
        vwapDistanceAcceptable
    ) {

        sellScore++;

        sellReasons.push(
            "VWAP confirmation"
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
        inPullbackZone
    ) {

        sellScore++;

        sellReasons.push(
            "EMA9 pullback zone"
        );

    }

    if (
        candleInfo.bearish &&
        strongCandle
    ) {

        sellScore++;

        sellReasons.push(
            "Strong bearish candle"
        );

    }

    if (
        bearishCloseLocation
    ) {

        sellScore++;

        sellReasons.push(
            "Bearish close location"
        );

    }

    // ==================================================
    // FINAL SIGNAL
    // ==================================================

    let signal =
        "WAIT";

    /*
    V10.6 intentionally requires
    strong confirmation but leaves
    room for the confirmation candle
    to make the final entry decision.
    */

    if (
        buyScore >= 7 &&
        buyScore > sellScore
    ) {

        signal =
            "BUY";

    }

    else if (
        sellScore >= 7 &&
        sellScore > buyScore
    ) {

        signal =
            "SELL";

    }

    let reason =
        "Waiting for V10.6 setup";

    if (
        signal === "BUY"
    ) {

        reason =
            buyReasons.join(
                " + "
            );

    }

    else if (
        signal === "SELL"
    ) {

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

            bodyRatio:
                candleInfo.bodyRatio,

            closeLocation:
                candleInfo.closeLocation,

            directionalStrength,

            emaSpread,

            spreadExpansion:
                indicators.spreadExpansion,

            vwapDistanceATR,

            emaExtensionATR,

            pullbackDistanceATR,

            strongEMASeparation,

            spreadExpanding:
                indicators.spreadExpanding,

            notOverextended,

            inPullbackZone

        }

    };

}


// ======================================================
// CONFIRMATION CANDLE
// ======================================================

function confirmEntry(
    signal,
    candle,
    indicators
) {

    if (
        !candle ||
        !indicators
    ) {

        return {

            confirmed: false,

            reason:
                "Missing confirmation data"

        };

    }

    const info =
        getCandleDiagnostics(
            candle
        );

    const close =
        Number(candle.c);

    const ema9 =
        Number(indicators.ema9);

    const vwapValue =
        Number(indicators.vwap);

    const atr14 =
        Number(indicators.atr14);

    if (
        !Number.isFinite(
            ema9
        ) ||
        !Number.isFinite(
            vwapValue
        ) ||
        !Number.isFinite(
            atr14
        ) ||
        atr14 <= 0
    ) {

        return {

            confirmed: false,

            reason:
                "Confirmation indicators unavailable"

        };

    }

    const bodyOK =
        info.bodyRatio >=
        CONFIG.MIN_CONFIRM_BODY_RATIO;

    const closeDistanceEMA9 =
        Math.abs(
            close -
            ema9
        ) / atr14;

    const notTooExtended =
        closeDistanceEMA9 <=
        CONFIG.MAX_EMA_EXTENSION_ATR;

    const closeLocation =
        info.closeLocation;

    // ==================================================
    // BUY CONFIRMATION
    // ==================================================

    if (
        signal === "BUY"
    ) {

        const directional =
            info.bullish;

        const aboveEMA =
            close >
            ema9;

        const aboveVWAP =
            close >
            vwapValue;

        const locationOK =
            closeLocation >=
            CONFIG.MIN_CONFIRM_CLOSE_LOCATION;

        if (
            directional &&
            bodyOK &&
            aboveEMA &&
            aboveVWAP &&
            locationOK &&
            notTooExtended
        ) {

            return {

                confirmed: true,

                reason:
                    "Bullish confirmation candle",

                diagnostics: {

                    bodyRatio:
                        info.bodyRatio,

                    closeLocation,

                    closeDistanceEMA9,

                    aboveEMA,

                    aboveVWAP,

                    notTooExtended

                }

            };

        }

        const reasons = [];

        if (!directional)
            reasons.push(
                "not bullish"
            );

        if (!bodyOK)
            reasons.push(
                "weak body"
            );

        if (!aboveEMA)
            reasons.push(
                "below EMA9"
            );

        if (!aboveVWAP)
            reasons.push(
                "below VWAP"
            );

        if (!locationOK)
            reasons.push(
                "poor close location"
            );

        if (!notTooExtended)
            reasons.push(
                "overextended"
            );

        return {

            confirmed: false,

            reason:
                reasons.join(
                    ", "
                )

        };

    }

    // ==================================================
    // SELL CONFIRMATION
    // ==================================================

    if (
        signal === "SELL"
    ) {

        const directional =
            info.bearish;

        const belowEMA =
            close <
            ema9;

        const belowVWAP =
            close <
            vwapValue;

        const locationOK =
            closeLocation <=
            (
                1 -
                CONFIG.MIN_CONFIRM_CLOSE_LOCATION
            );

        if (
            directional &&
            bodyOK &&
            belowEMA &&
            belowVWAP &&
            locationOK &&
            notTooExtended
        ) {

            return {

                confirmed: true,

                reason:
                    "Bearish confirmation candle",

                diagnostics: {

                    bodyRatio:
                        info.bodyRatio,

                    closeLocation,

                    closeDistanceEMA9,

                    belowEMA,

                    belowVWAP,

                    notTooExtended

                }

            };

        }

        const reasons = [];

        if (!directional)
            reasons.push(
                "not bearish"
            );

        if (!bodyOK)
            reasons.push(
                "weak body"
            );

        if (!belowEMA)
            reasons.push(
                "above EMA9"
            );

        if (!belowVWAP)
            reasons.push(
                "above VWAP"
            );

        if (!locationOK)
            reasons.push(
                "poor close location"
            );

        if (!notTooExtended)
            reasons.push(
                "overextended"
            );

        return {

            confirmed: false,

            reason:
                reasons.join(
                    ", "
                )

        };

    }

    return {

        confirmed: false,

        reason:
            "WAIT signal"

    };

}


// ======================================================
// CLOSE TRADE
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

        confirmationTs:
            position.confirmationTs,

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

        confirmationTime:
            position.confirmationTs
                ? new Date(
                    position.confirmationTs *
                    1000
                ).toISOString()
                : null,

        signal:
            position.signal,

        buyScore:
            position.signalBuyScore,

        sellScore:
            position.signalSellScore,

        signalReason:
            position.signalReason,

        confirmationReason:
            position.confirmationReason,

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

        entryExtensionATR:
            Number(
                position.entryExtensionATR?.toFixed(3)
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

        // Conservative:
        // STOP checked first.

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

        // Conservative:
        // STOP checked first.

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
// V10.6 BACKTEST
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

    const startIndex =
        Math.max(

            CONFIG.EMA_SLOW + 5,

            CONFIG.RSI_PERIOD + 5,

            CONFIG.ATR_PERIOD + 5

        );

    for (
        let i = startIndex;
        i < candles.length - 2;
        i++
    ) {

        const candle =
            candles[i];

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

                const previousCandle =
                    candles[i - 1];

                const trade =
                    closePosition(

                        position,

                        previousCandle.c,

                        previousCandle.ts,

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
        // INDICATORS
        // ==================================================

        const indicators =
            calculateHistoricalIndicators(

                candles,

                i

            );

        if (
            !indicators
        ) {

            continue;

        }

        // ==================================================
        // SIGNAL
        // ==================================================

        const signalResult =
            getSignal(

                candle,

                indicators

            );

        const signal =
            signalResult.signal;

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
        // EXISTING POSITION
        // ==================================================

        if (
            position
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

            continue;

        }

        // ==================================================
        // FRESH SIGNAL
        // ==================================================

        if (
            !freshSignal
        ) {

            continue;

        }

        // ==================================================
        // SIGNAL CANDLE
        //
        // i
        //
        // Confirmation candle:
        // i + 1
        //
        // Actual entry:
        // i + 2
        // ==================================================

        const confirmationCandle =
            candles[i + 1];

        const entryCandle =
            candles[i + 2];

        if (
            !confirmationCandle ||
            !entryCandle
        ) {

            continue;

        }

        // ==================================================
        // SAME SESSION
        // ==================================================

        if (
            getISTDate(
                confirmationCandle.ts
            ) !== session ||
            getISTDate(
                entryCandle.ts
            ) !== session
        ) {

            continue;

        }

        // ==================================================
        // CONFIRMATION
        // ==================================================

        const confirmationIndicators =
            calculateHistoricalIndicators(

                candles,

                i + 1

            );

        if (
            !confirmationIndicators
        ) {

            continue;

        }

        const confirmation =
            confirmEntry(

                signal,

                confirmationCandle,

                confirmationIndicators

            );

        if (
            !confirmation.confirmed
        ) {

            continue;

        }

        // ==================================================
        // ENTRY
        // ==================================================

        const entry =
            Number(
                entryCandle.o
            );

        if (
            !Number.isFinite(entry) ||
            entry <= 0
        ) {

            continue;

        }

        const atrValue =
            Number(
                confirmationIndicators.atr14
            );

        if (
            !Number.isFinite(atrValue) ||
            atrValue <= 0
        ) {

            continue;

        }

        // ==================================================
        // ENTRY GAP
        // ==================================================

        const entryGap =
            signal === "BUY"

                ? entry -
                  confirmationCandle.c

                : confirmationCandle.c -
                  entry;

        const entryGapATR =
            entryGap /
            atrValue;

        /*
        Positive = adverse movement.

        BUY:
        confirmation close 24500
        next open 24520
        = +20 adverse gap

        SELL:
        confirmation close 24500
        next open 24480
        = +20 adverse gap
        */

        if (
            entryGapATR >
            CONFIG.MAX_ENTRY_GAP_ATR
        ) {

            continue;

        }

        // ==================================================
        // ENTRY EXTENSION
        // ==================================================

        const entryEMA9 =
            Number(
                confirmationIndicators.ema9
            );

        const entryExtensionATR =
            Math.abs(
                entry -
                entryEMA9
            ) / atrValue;

        if (
            entryExtensionATR >
            CONFIG.MAX_ENTRY_EXTENSION_ATR
        ) {

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
        // ENTRY SESSION CHECK
        // ==================================================

        const entryMinutes =
            getISTMinutes(
                entryCandle.ts
            );

        if (
            entryMinutes >=
            CONFIG.SESSION_CLOSE_MINUTES
        ) {

            continue;

        }

        // ==================================================
        // CREATE POSITION
        // ==================================================

        position = {

            side,

            entry,

            stop,

            target,

            entryTs:
                entryCandle.ts,

            signalTs:
                candle.ts,

            confirmationTs:
                confirmationCandle.ts,

            signal,

            signalBuyScore:
                signalResult.buyScore,

            signalSellScore:
                signalResult.sellScore,

            signalReason:
                signalResult.reason,

            confirmationReason:
                confirmation.reason,

            ema9:
                confirmationIndicators.ema9,

            ema21:
                confirmationIndicators.ema21,

            ema9Slope:
                confirmationIndicators.ema9Slope,

            ema21Slope:
                confirmationIndicators.ema21Slope,

            emaSpread:
                confirmationIndicators.emaSpread,

            rsi14:
                confirmationIndicators.rsi14,

            vwap:
                confirmationIndicators.vwap,

            atr:
                atrValue,

            directionalStrength:
                confirmationIndicators
                    .directionalStrength,

            bodyRatio:
                confirmation.diagnostics
                    ?.bodyRatio,

            closeLocation:
                confirmation.diagnostics
                    ?.closeLocation,

            entryGapATR,

            entryExtensionATR

        };

        console.log(
            "================================"
        );

        console.log(
            "V10.6 ENTRY"
        );

        console.log(
            position
        );

        console.log(
            "================================"
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
        ).length;

    const sellTrades =
        trades.filter(
            trade =>
                trade.side === "SELL"
        ).length;

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

    return {

        candlesTested:
            candles.length,

        totalTrades,

        buyTrades,

        sellTrades,

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
                    "V10.6",

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
                    "V10.6",

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
            "TradeMind V10.6 Backtest Request"
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
                    "V10.6",

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
            "V10.6 INDstocks response:",
            JSON.stringify(
                result
            ).slice(
                0,
                3000
            )
        );

        if (
            !response.ok
        ) {

            return res.status(
                response.status
            ).json({

                success: false,

                version:
                    "V10.6",

                error:
                    result

            });

        }

        const rawCandles =
            extractCandles(
                result
            );

        console.log(
            "V10.6 raw candle count:",
            Array.isArray(
                rawCandles
            )
                ? rawCandles.length
                : 0
        );

        const candles =
            normalizeCandles(
                rawCandles
            );

        console.log(
            "V10.6 normalized candle count:",
            candles.length
        );

        if (
            candles.length < 50
        ) {

            return res.status(200).json({

                success: true,

                version:
                    "V10.6",

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

                trades: []

            });

        }

        const backtest =
            runBacktest(
                candles
            );

        console.log(
            "================================"
        );

        console.log(
            "TradeMind V10.6 RESULT"
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
            "Average win:",
            backtest.averageWin
        );

        console.log(
            "Average loss:",
            backtest.averageLoss
        );

        console.log(
            "Profit factor:",
            backtest.profitFactor
        );

        console.log(
            "Max drawdown:",
            backtest.maxDrawdown
        );

        console.table(
            backtest.trades
        );

        console.log(
            "================================"
        );

        return res.status(200).json({

            success: true,

            version:
                "V10.6",

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

            trades:
                backtest.trades

        });

    }

    catch (error) {

        console.error(
            "TradeMind V10.6 Backtest Error:",
            error
        );

        return res.status(500).json({

            success: false,

            version:
                "V10.6",

            error:
                "V10.6 backtest failed",

            details:
                error?.message ||
                "Unknown error"

        });

    }

}
