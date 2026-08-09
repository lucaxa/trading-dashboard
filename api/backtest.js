/*
TradeMind Pro
V10.8 Historical Backtest Engine

INDstocks → Historical Candles → V10.8 Simulation

V10.8 Strategy:
- EMA 9 / EMA 21
- Strong EMA separation
- Normalized EMA slope strength
- 3-candle trend persistence
- RSI 14 momentum regime
- VWAP confirmation
- EMA9 pullback
- Bullish/Bearish rejection
- Strong candle confirmation
- Candle close-location confirmation
- Overextension filter
- ATR 14
- ATR-based Stop Loss
- 1:2 Risk / Reward
- Fresh-signal tracking
- One position at a time
- No same-candle re-entry
- Next-candle execution
- No overnight positions
- Gap-aware execution
- Post-trade cooldown
- Detailed diagnostics

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

    ATR_STOP_MULTIPLIER: 1.5,

    RISK_REWARD: 2,

    // ==================================================
    // V10.8 TREND QUALITY
    // ==================================================

    // Minimum EMA separation relative to ATR
    MIN_EMA_ATR_SEPARATION: 0.25,

    // Minimum directional strength
    MIN_DIRECTIONAL_STRENGTH: 0.30,

    // EMA slope must have meaningful ATR-normalized strength
    MIN_EMA9_SLOPE_ATR: 0.08,

    MIN_EMA21_SLOPE_ATR: 0.05,

    // Trend must persist for this many candles
    TREND_PERSISTENCE_CANDLES: 3,

    // ==================================================
    // VWAP
    // ==================================================

    MIN_VWAP_ATR_DISTANCE: 0.08,

    // ==================================================
    // CANDLE
    // ==================================================

    MIN_CANDLE_BODY_RATIO: 0.50,

    MIN_CLOSE_LOCATION: 0.65,

    // ==================================================
    // OVEREXTENSION
    // ==================================================

    MAX_EMA_EXTENSION_ATR: 1.25,

    // ==================================================
    // EMA9 PULLBACK
    // ==================================================

    MIN_PULLBACK_ATR: 0.05,

    MAX_PULLBACK_ATR: 0.75,

    // ==================================================
    // RSI
    // ==================================================

    BUY_RSI_MIN: 55,

    BUY_RSI_MAX: 65,

    SELL_RSI_MIN: 35,

    SELL_RSI_MAX: 45,

    // ==================================================
    // COOLDOWN
    // ==================================================

    COOLDOWN_CANDLES: 3,

    // ==================================================
    // SESSION
    // ==================================================

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

    // ==================================================
    // EMA SLOPE
    // ==================================================

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

    // ==================================================
    // EMA SPREAD
    // ==================================================

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

    // ==================================================
    // NORMALIZED SLOPE
    // ==================================================

    const ema9SlopeATR =
        atrValue > 0
            ? Math.abs(
                ema9Slope
            ) / atrValue
            : 0;

    const ema21SlopeATR =
        atrValue > 0
            ? Math.abs(
                ema21Slope
            ) / atrValue
            : 0;

    // ==================================================
    // CURRENT SESSION
    // ==================================================

    const currentSession =
        getISTDate(
            history[
                history.length - 1
            ].ts
        );

    return {

        ema9:
            ema9Value,

        ema21:
            ema21Value,

        ema9Slope,

        ema21Slope,

        emaSpread,

        emaSeparationATR:
            directionalStrength,

        ema9SlopeATR,

        ema21SlopeATR,

        rsi14:
            rsiValue,

        atr14:
            atrValue,

        vwap:
            vwapValue,

        directionalStrength,

        currentSession

    };

}


// ======================================================
// TREND PERSISTENCE
// ======================================================

function checkTrendPersistence(
    candles,
    index,
    side
) {

    const required =
        CONFIG.TREND_PERSISTENCE_CANDLES;

    if (
        index <
        required - 1
    ) {

        return false;

    }

    for (
        let offset = 0;
        offset < required;
        offset++
    ) {

        const historicalIndex =
            index -
            offset;

        const indicators =
            calculateHistoricalIndicators(
                candles,
                historicalIndex
            );

        if (
            !indicators
        ) {

            return false;

        }

        if (
            side === "BUY" &&
            !(
                indicators.ema9 >
                indicators.ema21
            )
        ) {

            return false;

        }

        if (
            side === "SELL" &&
            !(
                indicators.ema9 <
                indicators.ema21
            )
        ) {

            return false;

        }

    }

    return true;

}


// ======================================================
// REJECTION DETECTION
// ======================================================

function getRejection(
    candle,
    side
) {

    if (
        !candle
    ) {

        return false;

    }

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

    if (
        range <= 0
    ) {

        return false;

    }

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

    if (
        side === "BUY"
    ) {

        return (

            lowerWick >=
            body * 0.50 &&

            close >
            open &&

            close >=
            low +
            range * 0.60

        );

    }

    if (
        side === "SELL"
    ) {

        return (

            upperWick >=
            body * 0.50 &&

            close <
            open &&

            close <=
            low +
            range * 0.40

        );

    }

    return false;

}


// ======================================================
// SIGNAL
// ======================================================

function getSignal(
    candle,
    indicators,
    candles,
    index
) {

    if (
        !candle ||
        !indicators
    ) {

        return {

            signal:
                "WAIT",

            buyScore:
                0,

            sellScore:
                0,

            reason:
                "Missing data"

        };

    }

    const ema9 =
        Number(
            indicators.ema9
        );

    const ema21 =
        Number(
            indicators.ema21
        );

    const ema9Slope =
        Number(
            indicators.ema9Slope
        );

    const ema21Slope =
        Number(
            indicators.ema21Slope
        );

    const emaSpread =
        Number(
            indicators.emaSpread
        );

    const emaSeparationATR =
        Number(
            indicators.emaSeparationATR
        );

    const ema9SlopeATR =
        Number(
            indicators.ema9SlopeATR
        );

    const ema21SlopeATR =
        Number(
            indicators.ema21SlopeATR
        );

    const rsi14 =
        Number(
            indicators.rsi14
        );

    const atr14 =
        Number(
            indicators.atr14
        );

    const vwapValue =
        Number(
            indicators.vwap
        );

    const open =
        Number(candle.o);

    const high =
        Number(candle.h);

    const low =
        Number(candle.l);

    const close =
        Number(candle.c);

    if (
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(ema9Slope) ||
        !Number.isFinite(ema21Slope) ||
        !Number.isFinite(emaSpread) ||
        !Number.isFinite(emaSeparationATR) ||
        !Number.isFinite(ema9SlopeATR) ||
        !Number.isFinite(ema21SlopeATR) ||
        !Number.isFinite(rsi14) ||
        !Number.isFinite(atr14) ||
        !Number.isFinite(vwapValue) ||
        atr14 <= 0
    ) {

        return {

            signal:
                "WAIT",

            buyScore:
                0,

            sellScore:
                0,

            reason:
                "Indicators unavailable"

        };

    }

    // ==================================================
    // CANDLE
    // ==================================================

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

    const strongCandle =
        bodyRatio >=
        CONFIG.MIN_CANDLE_BODY_RATIO;

    const closeLocation =
        range > 0
            ? (
                close -
                low
            ) / range
            : 0.5;

    const bullishCloseLocation =
        closeLocation >=
        CONFIG.MIN_CLOSE_LOCATION;

    const bearishCloseLocation =
        closeLocation <=
        (
            1 -
            CONFIG.MIN_CLOSE_LOCATION
        );

    // ==================================================
    // TREND
    // ==================================================

    const bullishTrend =
        ema9 >
        ema21;

    const bearishTrend =
        ema9 <
        ema21;

    // ==================================================
    // SLOPE
    // ==================================================

    const bullishSlope =
        ema9Slope > 0 &&
        ema21Slope >= 0;

    const bearishSlope =
        ema9Slope < 0 &&
        ema21Slope <= 0;

    // ==================================================
    // NORMALIZED SLOPE STRENGTH
    // ==================================================

    const strongBullishSlope =
        bullishSlope &&
        ema9SlopeATR >=
        CONFIG.MIN_EMA9_SLOPE_ATR &&
        ema21SlopeATR >=
        CONFIG.MIN_EMA21_SLOPE_ATR;

    const strongBearishSlope =
        bearishSlope &&
        ema9SlopeATR >=
        CONFIG.MIN_EMA9_SLOPE_ATR &&
        ema21SlopeATR >=
        CONFIG.MIN_EMA21_SLOPE_ATR;

    // ==================================================
    // EMA SEPARATION
    // ==================================================

    const strongEMASeparation =
        emaSeparationATR >=
        CONFIG.MIN_EMA_ATR_SEPARATION;

    // ==================================================
    // TREND STRENGTH
    // ==================================================

    const strongTrend =
        emaSeparationATR >=
        CONFIG.MIN_DIRECTIONAL_STRENGTH;

    // ==================================================
    // TREND PERSISTENCE
    // ==================================================

    const bullishPersistence =
        bullishTrend &&
        checkTrendPersistence(
            candles,
            index,
            "BUY"
        );

    const bearishPersistence =
        bearishTrend &&
        checkTrendPersistence(
            candles,
            index,
            "SELL"
        );

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
        atr14 > 0
            ? vwapDistance /
              atr14
            : 0;

    const awayFromVWAP =
        vwapDistanceATR >=
        CONFIG.MIN_VWAP_ATR_DISTANCE;

    // ==================================================
    // EMA9 PULLBACK
    // ==================================================

    const pullbackDistance =
        Math.abs(
            close -
            ema9
        );

    const pullbackDistanceATR =
        atr14 > 0
            ? pullbackDistance /
              atr14
            : 0;

    const inPullbackZone =
        pullbackDistanceATR >=
        CONFIG.MIN_PULLBACK_ATR &&
        pullbackDistanceATR <=
        CONFIG.MAX_PULLBACK_ATR;

    // ==================================================
    // OVEREXTENSION
    // ==================================================

    const emaExtension =
        Math.abs(
            close -
            ema9
        );

    const emaExtensionATR =
        atr14 > 0
            ? emaExtension /
              atr14
            : 0;

    const notOverextended =
        emaExtensionATR <=
        CONFIG.MAX_EMA_EXTENSION_ATR;

    // ==================================================
    // REJECTION
    // ==================================================

    const bullishRejection =
        getRejection(
            candle,
            "BUY"
        );

    const bearishRejection =
        getRejection(
            candle,
            "SELL"
        );

    // ==================================================
    // SCORES
    // ==================================================

    let buyScore = 0;

    let sellScore = 0;

    const buyReasons = [];

    const sellReasons = [];

    // ==================================================
    // BUY
    // ==================================================

    if (
        bullishTrend
    ) {

        buyScore++;

        buyReasons.push(
            "Bullish trend"
        );

    }

    if (
        strongBullishSlope
    ) {

        buyScore++;

        buyReasons.push(
            "EMA slope strength"
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
        bullishPersistence
    ) {

        buyScore++;

        buyReasons.push(
            "3-candle trend persistence"
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
        awayFromVWAP
    ) {

        buyScore++;

        buyReasons.push(
            "VWAP confirmation"
        );

    }

    if (
        inPullbackZone
    ) {

        buyScore++;

        buyReasons.push(
            "EMA9 pullback"
        );

    }

    if (
        bullishRejection
    ) {

        buyScore++;

        buyReasons.push(
            "Bullish rejection"
        );

    }

    if (
        close > open &&
        strongCandle &&
        bullishCloseLocation
    ) {

        buyScore++;

        buyReasons.push(
            "Strong bullish candle"
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

    // ==================================================
    // SELL
    // ==================================================

    if (
        bearishTrend
    ) {

        sellScore++;

        sellReasons.push(
            "Bearish trend"
        );

    }

    if (
        strongBearishSlope
    ) {

        sellScore++;

        sellReasons.push(
            "EMA slope strength"
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
        bearishPersistence
    ) {

        sellScore++;

        sellReasons.push(
            "3-candle trend persistence"
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
        awayFromVWAP
    ) {

        sellScore++;

        sellReasons.push(
            "VWAP confirmation"
        );

    }

    if (
        inPullbackZone
    ) {

        sellScore++;

        sellReasons.push(
            "EMA9 pullback"
        );

    }

    if (
        bearishRejection
    ) {

        sellScore++;

        sellReasons.push(
            "Bearish rejection"
        );

    }

    if (
        close < open &&
        strongCandle &&
        bearishCloseLocation
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

    // ==================================================
    // FINAL SIGNAL
    // ==================================================

    let signal =
        "WAIT";

    /*
    11 possible confirmations.

    V10.8 requires at least 8.

    More importantly:

    TREND
    + SLOPE STRENGTH
    + EMA SEPARATION
    + TREND STRENGTH
    + PERSISTENCE
    + VWAP
    + PULLBACK
    + REJECTION

    form the core setup.
    */

    const coreBuy =
        bullishTrend &&
        strongBullishSlope &&
        strongEMASeparation &&
        strongTrend &&
        bullishPersistence &&
        aboveVWAP &&
        awayFromVWAP &&
        inPullbackZone &&
        bullishRejection;

    const coreSell =
        bearishTrend &&
        strongBearishSlope &&
        strongEMASeparation &&
        strongTrend &&
        bearishPersistence &&
        belowVWAP &&
        awayFromVWAP &&
        inPullbackZone &&
        bearishRejection;

    if (
        coreBuy &&
        buyScore >= 8 &&
        buyScore > sellScore
    ) {

        signal =
            "BUY";

    }

    else if (
        coreSell &&
        sellScore >= 8 &&
        sellScore > buyScore
    ) {

        signal =
            "SELL";

    }

    let reason =
        "Waiting for V10.8 trend-quality confirmation";

    let confirmationReason =
        null;

    if (
        signal === "BUY"
    ) {

        reason =
            buyReasons.join(
                " + "
            );

        confirmationReason =
            "Bullish rejection candle";

    }

    else if (
        signal === "SELL"
    ) {

        reason =
            sellReasons.join(
                " + "
            );

        confirmationReason =
            "Bearish rejection candle";

    }

    return {

        signal,

        buyScore,

        sellScore,

        reason,

        confirmationReason,

        diagnostics: {

            bodyRatio,

            closeLocation,

            emaSpread,

            emaSeparationATR,

            ema9Slope,

            ema21Slope,

            ema9SlopeATR,

            ema21SlopeATR,

            rsi14,

            vwapDistanceATR,

            pullbackDistanceATR,

            emaExtensionATR,

            directionalStrength,

            bullishPersistence,

            bearishPersistence,

            strongBullishSlope,

            strongBearishSlope,

            strongEMASeparation,

            strongTrend,

            inPullbackZone,

            awayFromVWAP,

            notOverextended,

            bullishRejection,

            bearishRejection

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
            new Date(
                position.confirmationTs *
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

        ema9SlopeATR:
            Number(
                position.ema9SlopeATR?.toFixed(3)
            ),

        ema21SlopeATR:
            Number(
                position.ema21SlopeATR?.toFixed(3)
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
        // STOP checked before TARGET.

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
        // STOP checked before TARGET.

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
// V10.8 BACKTEST
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
        i < candles.length;
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
        // INDICATORS
        // ==================================================

        const indicators =
            calculateHistoricalIndicators(

                candles,

                i

            );

        let signal =
            "WAIT";

        let signalResult =
            null;

        if (
            indicators
        ) {

            signalResult =
                getSignal(

                    candle,

                    indicators,

                    candles,

                    i

                );

            signal =
                signalResult.signal;

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
        // INDICATORS
        // ==================================================

        if (
            !indicators ||
            !signalResult
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
        // ENTRY GAP
        // ==================================================

        const entryGap =
            entry -
            candle.c;

        const entryGapATR =
            atrValue > 0
                ? entryGap /
                  atrValue
                : 0;

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

            confirmationTs:
                candle.ts,

            signal,

            signalBuyScore:
                signalResult.buyScore,

            signalSellScore:
                signalResult.sellScore,

            signalReason:
                signalResult.reason,

            confirmationReason:
                signalResult.confirmationReason,

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
                atrValue,

            directionalStrength:
                indicators.directionalStrength,

            ema9SlopeATR:
                indicators.ema9SlopeATR,

            ema21SlopeATR:
                indicators.ema21SlopeATR,

            bodyRatio:
                signalResult.diagnostics
                    ?.bodyRatio,

            closeLocation:
                signalResult.diagnostics
                    ?.closeLocation,

            entryGapATR,

            emaExtensionATR:
                signalResult.diagnostics
                    ?.emaExtensionATR,

            pullbackDistanceATR:
                signalResult.diagnostics
                    ?.pullbackDistanceATR

        };

        console.log(
            "================================"
        );

        console.log(
            "V10.8 ENTRY"
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
                    "V10.8",

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
                    "V10.8",

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
            "TradeMind V10.8 Backtest Request"
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
                    "V10.8",

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
            "V10.8 INDstocks response:",
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
                    "V10.8",

                error:
                    result

            });

        }

        const rawCandles =
            extractCandles(
                result
            );

        console.log(
            "V10.8 raw candle count:",
            Array.isArray(rawCandles)
                ? rawCandles.length
                : 0
        );

        const candles =
            normalizeCandles(
                rawCandles
            );

        console.log(
            "V10.8 normalized candle count:",
            candles.length
        );

        if (
            candles.length < 50
        ) {

            return res.status(200).json({

                success: true,

                version:
                    "V10.8",

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
            "TradeMind V10.8 RESULT"
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

        console.table(
            backtest.trades
        );

        console.log(
            "================================"
        );

        return res.status(200).json({

            success: true,

            version:
                "V10.8",

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
            "TradeMind V10.8 Backtest Error:",
            error
        );

        return res.status(500).json({

            success: false,

            version:
                "V10.8",

            error:
                "V10.8 backtest failed",

            details:
                error?.message ||
                "Unknown error"

        });

    }

}
