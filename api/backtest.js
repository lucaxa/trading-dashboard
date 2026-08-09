/*
TradeMind Pro
V10.14 Historical Backtest Engine

V10.14 Strategy:

BASE:
- EMA 9 / EMA 21
- EMA slope
- EMA separation
- RSI 14
- VWAP
- ATR 14
- EMA9 pullback
- Overextension protection
- Candle confirmation
- Entry-gap protection
- Fresh signal
- Cooldown
- One position at a time
- Next-candle execution
- Gap-aware execution
- Conservative SL/Target handling
- 1:2 Risk / Reward

V10.14 CHANGE:

SELL:
- Preserve V10.12-style SELL behavior
- Do NOT over-filter SELL signals

BUY:
- Restore BUY signals
- Use a direction-specific quality score
- Reject extreme RSI
- Reject excessive extension
- Reject weak trend
- Reject weak EMA separation
- Require bullish structure
- Require controlled pullback
- Require VWAP confirmation
- Require acceptable candle confirmation

IMPORTANT:
PAPER BACKTEST ONLY.
NO REAL ORDERS.
*/


// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {

    VERSION: "V10.14",

    EMA_FAST: 9,

    EMA_SLOW: 21,

    RSI_PERIOD: 14,

    ATR_PERIOD: 14,

    ATR_STOP_MULTIPLIER: 1.5,

    RISK_REWARD: 2,

    // ------------------------------------------
    // TREND
    // ------------------------------------------

    MIN_DIRECTIONAL_STRENGTH: 0.12,

    STRONG_DIRECTIONAL_STRENGTH: 0.30,

    // ------------------------------------------
    // EMA
    // ------------------------------------------

    MIN_EMA_ATR_SEPARATION: 0.12,

    STRONG_EMA_ATR_SEPARATION: 0.35,

    EMA_SLOPE_LOOKBACK: 3,

    // Minimum slope relative to ATR
    MIN_SLOPE_ATR: 0.02,

    STRONG_SLOPE_ATR: 0.08,

    // ------------------------------------------
    // VWAP
    // ------------------------------------------

    MIN_VWAP_ATR_DISTANCE: 0.08,

    // ------------------------------------------
    // RSI
    // ------------------------------------------

    BUY_RSI_MIN: 55,

    BUY_RSI_MAX: 65,

    SELL_RSI_MIN: 35,

    SELL_RSI_MAX: 45,

    // Extreme BUY momentum protection
    BUY_RSI_HARD_MAX: 70,

    // Extreme SELL momentum protection
    SELL_RSI_HARD_MIN: 30,

    // ------------------------------------------
    // CANDLE
    // ------------------------------------------

    MIN_CANDLE_BODY_RATIO: 0.25,

    STRONG_CANDLE_BODY_RATIO: 0.50,

    MIN_CLOSE_LOCATION: 0.60,

    STRONG_CLOSE_LOCATION: 0.70,

    // ------------------------------------------
    // EXTENSION
    // ------------------------------------------

    MAX_EMA_EXTENSION_ATR: 1.25,

    HARD_EMA_EXTENSION_ATR: 1.60,

    // ------------------------------------------
    // PULLBACK
    // ------------------------------------------

    MIN_PULLBACK_ATR: 0.05,

    MAX_PULLBACK_ATR: 0.80,

    // ------------------------------------------
    // ENTRY GAP
    // ------------------------------------------

    MAX_ENTRY_GAP_ATR: 0.20,

    // ------------------------------------------
    // SCORE
    // ------------------------------------------

    BUY_MIN_SCORE: 7,

    SELL_MIN_SCORE: 7,

    // ------------------------------------------
    // TRADE MANAGEMENT
    // ------------------------------------------

    COOLDOWN_CANDLES: 3,

    // ------------------------------------------
    // SESSION
    // ------------------------------------------

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
        CONFIG.EMA_SLOW +
        CONFIG.EMA_SLOPE_LOOKBACK +
        5
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

    if (
        !Number.isFinite(ema9Slope) ||
        !Number.isFinite(ema21Slope)
    ) {

        return null;

    }

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

        atr14:
            atrValue,

        vwap:
            vwapValue,

        directionalStrength

    };

}


// ======================================================
// SIGNAL ENGINE
// ======================================================

function getSignal(
    candle,
    indicators,
    diagnostics
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

    const open =
        Number(candle.o);

    const high =
        Number(candle.h);

    const low =
        Number(candle.l);

    const close =
        Number(candle.c);

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
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
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

            signal:
                "WAIT",

            buyScore:
                0,

            sellScore:
                0,

            reason:
                "Invalid indicators"

        };

    }

    // ==================================================
    // CANDLE STRUCTURE
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

    const closeLocation =
        range > 0
            ? (
                close -
                low
            ) / range
            : 0.5;

    const bullishCandle =
        close >
        open;

    const bearishCandle =
        close <
        open;

    const strongCandle =
        bodyRatio >=
        CONFIG.MIN_CANDLE_BODY_RATIO;

    const strongCandle50 =
        bodyRatio >=
        CONFIG.STRONG_CANDLE_BODY_RATIO;

    const bullishClose =
        closeLocation >=
        CONFIG.MIN_CLOSE_LOCATION;

    const bearishClose =
        closeLocation <=
        (
            1 -
            CONFIG.MIN_CLOSE_LOCATION
        );

    // ==================================================
    // EMA STRUCTURE
    // ==================================================

    const bullishEMA =
        ema9 >
        ema21;

    const bearishEMA =
        ema9 <
        ema21;

    const emaSeparationATR =
        emaSpread /
        atr14;

    const strongEMASeparation =
        emaSeparationATR >=
        CONFIG.MIN_EMA_ATR_SEPARATION;

    const veryStrongEMASeparation =
        emaSeparationATR >=
        CONFIG.STRONG_EMA_ATR_SEPARATION;

    // ==================================================
    // SLOPE
    // ==================================================

    const ema9SlopeATR =
        Math.abs(ema9Slope) /
        atr14;

    const ema21SlopeATR =
        Math.abs(ema21Slope) /
        atr14;

    const bullishSlope =
        ema9Slope > 0 &&
        ema21Slope >= 0;

    const bearishSlope =
        ema9Slope < 0 &&
        ema21Slope <= 0;

    const strongBullishSlope =
        bullishSlope &&
        ema9SlopeATR >=
        CONFIG.MIN_SLOPE_ATR &&
        ema21SlopeATR >=
        CONFIG.MIN_SLOPE_ATR;

    const strongBearishSlope =
        bearishSlope &&
        ema9SlopeATR >=
        CONFIG.MIN_SLOPE_ATR &&
        ema21SlopeATR >=
        CONFIG.MIN_SLOPE_ATR;

    // ==================================================
    // TREND
    // ==================================================

    const trendStrong =
        directionalStrength >=
        CONFIG.MIN_DIRECTIONAL_STRENGTH;

    const trendVeryStrong =
        directionalStrength >=
        CONFIG.STRONG_DIRECTIONAL_STRENGTH;

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
    // EMA EXTENSION
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
    // PULLBACK
    // ==================================================

    const pullbackDistanceATR =
        emaExtensionATR;

    const validPullback =
        pullbackDistanceATR >=
        CONFIG.MIN_PULLBACK_ATR &&
        pullbackDistanceATR <=
        CONFIG.MAX_PULLBACK_ATR;

    // ==================================================
    // ENTRY GAP
    // ==================================================

    /*
    This is calculated against the current
    candle close.

    Actual entry is next candle open.
    */

    let entryGapATR = 0;

    if (
        atr14 > 0
    ) {

        entryGapATR =
            0;

    }

    // ==================================================
    // SCORE
    // ==================================================

    let buyScore = 0;

    let sellScore = 0;

    const buyReasons = [];

    const sellReasons = [];

    // ==================================================
    // BUY CORE
    // ==================================================

    if (
        bullishEMA
    ) {

        buyScore++;

        buyReasons.push(
            "Bullish trend"
        );

    }
    else {

        diagnostics.weakBuyTrend++;

    }

    if (
        strongBullishSlope
    ) {

        buyScore++;

        buyReasons.push(
            "EMA slope bullish"
        );

    }
    else {

        diagnostics.weakBuySlope++;

    }

    if (
        strongEMASeparation
    ) {

        buyScore++;

        buyReasons.push(
            "Strong EMA separation"
        );

    }
    else {

        diagnostics.weakBuySeparation++;

    }

    if (
        trendStrong
    ) {

        buyScore++;

        buyReasons.push(
            "Trend strength"
        );

    }
    else {

        diagnostics.weakTrend++;

    }

    if (
        trendVeryStrong
    ) {

        buyScore++;

        buyReasons.push(
            "Strong trend"
        );

    }

    // ==================================================
    // BUY RSI
    // ==================================================

    const buyRSI =
        rsi14 >=
        CONFIG.BUY_RSI_MIN &&
        rsi14 <=
        CONFIG.BUY_RSI_MAX;

    const buyRSIHARD =
        rsi14 <=
        CONFIG.BUY_RSI_HARD_MAX;

    if (
        buyRSI
    ) {

        buyScore++;

        buyReasons.push(
            "RSI momentum"
        );

    }
    else {

        diagnostics.buyRSIRejected++;

    }

    if (
        !buyRSIHARD
    ) {

        diagnostics.buyRSIHardRejected++;

    }

    // ==================================================
    // BUY VWAP
    // ==================================================

    if (
        aboveVWAP &&
        vwapConfirmed
    ) {

        buyScore++;

        buyReasons.push(
            "VWAP confirmation"
        );

    }
    else {

        diagnostics.vwapTooClose++;

    }

    // ==================================================
    // BUY PULLBACK
    // ==================================================

    if (
        validPullback
    ) {

        buyScore++;

        buyReasons.push(
            "EMA9 pullback"
        );

    }
    else {

        diagnostics.invalidPullback++;

    }

    // ==================================================
    // BUY CANDLE
    // ==================================================

    if (
        bullishCandle &&
        strongCandle &&
        bullishClose
    ) {

        buyScore++;

        buyReasons.push(
            "Bullish candle"
        );

    }
    else {

        diagnostics.buyCandleRejected++;

    }

    if (
        bullishCandle &&
        strongCandle50 &&
        closeLocation >=
        CONFIG.STRONG_CLOSE_LOCATION
    ) {

        buyScore++;

        buyReasons.push(
            "Strong bullish confirmation"
        );

    }

    // ==================================================
    // BUY EXTENSION
    // ==================================================

    if (
        notOverextended
    ) {

        buyScore++;

        buyReasons.push(
            "Not overextended"
        );

    }
    else {

        diagnostics.overextended++;

    }

    // ==================================================
    // SELL CORE
    // ==================================================

    if (
        bearishEMA
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
        trendStrong
    ) {

        sellScore++;

        sellReasons.push(
            "Trend strength"
        );

    }

    if (
        trendVeryStrong
    ) {

        sellScore++;

        sellReasons.push(
            "Strong trend"
        );

    }

    // ==================================================
    // SELL RSI
    // ==================================================

    const sellRSI =
        rsi14 >=
        CONFIG.SELL_RSI_MIN &&
        rsi14 <=
        CONFIG.SELL_RSI_MAX;

    const sellRSIHARD =
        rsi14 >=
        CONFIG.SELL_RSI_HARD_MIN;

    if (
        sellRSI
    ) {

        sellScore++;

        sellReasons.push(
            "RSI momentum"
        );

    }
    else {

        diagnostics.rsiRejected++;

    }

    if (
        !sellRSIHARD
    ) {

        diagnostics.sellRSIHardRejected++;

    }

    // ==================================================
    // SELL VWAP
    // ==================================================

    if (
        belowVWAP &&
        vwapConfirmed
    ) {

        sellScore++;

        sellReasons.push(
            "VWAP confirmation"
        );

    }

    // ==================================================
    // SELL PULLBACK
    // ==================================================

    if (
        validPullback
    ) {

        sellScore++;

        sellReasons.push(
            "EMA9 pullback"
        );

    }
    else {

        diagnostics.invalidPullback++;

    }

    // ==================================================
    // SELL CANDLE
    // ==================================================

    if (
        bearishCandle &&
        strongCandle &&
        bearishClose
    ) {

        sellScore++;

        sellReasons.push(
            "Strong bearish candle"
        );

    }

    // ==================================================
    // SELL EXTENSION
    // ==================================================

    if (
        notOverextended
    ) {

        sellScore++;

        sellReasons.push(
            "Not overextended"
        );

    }
    else {

        diagnostics.overextended++;

    }

    // ==================================================
    // HARD EXTENSION PROTECTION
    // ==================================================

    if (
        hardOverextended
    ) {

        diagnostics.hardOverextended++;

        return {

            signal:
                "WAIT",

            buyScore,

            sellScore,

            reason:
                "Hard overextension",

            diagnostics: {

                bodyRatio,

                closeLocation,

                directionalStrength,

                emaSpread,

                emaExtensionATR,

                pullbackDistanceATR,

                entryGapATR

            }

        };

    }

    // ==================================================
    // FINAL BUY QUALIFICATION
    // ==================================================

    /*
    BUY is intentionally easier than V10.13,
    but still requires the core structure.

    Mandatory:
    - Bullish EMA
    - Bullish slope
    - Trend
    - VWAP
    - Pullback
    - RSI not extreme

    Score >= BUY_MIN_SCORE
    */

    const buyCore =
        bullishEMA &&
        strongBullishSlope &&
        trendStrong &&
        aboveVWAP &&
        vwapConfirmed &&
        validPullback &&
        buyRSIHARD &&
        notOverextended;

    // ==================================================
    // FINAL SELL QUALIFICATION
    // ==================================================

    /*
    SELL stays closer to V10.12.

    We deliberately avoid adding the
    aggressive V10.13 SELL restrictions.
    */

    const sellCore =
        bearishEMA &&
        strongBearishSlope &&
        trendStrong &&
        belowVWAP &&
        vwapConfirmed &&
        validPullback &&
        sellRSIHARD &&
        notOverextended;

    // ==================================================
    // SIGNAL DECISION
    // ==================================================

    let signal =
        "WAIT";

    let reason =
        "Waiting for V10.14 confirmation";

    if (
        buyCore &&
        buyScore >=
        CONFIG.BUY_MIN_SCORE &&
        buyScore >
        sellScore
    ) {

        signal =
            "BUY";

        reason =
            buyReasons.join(
                " + "
            );

    }

    else if (
        sellCore &&
        sellScore >=
        CONFIG.SELL_MIN_SCORE &&
        sellScore >
        buyScore
    ) {

        signal =
            "SELL";

        reason =
            sellReasons.join(
                " + "
            );

    }
    else {

        diagnostics.noTradeSignal++;

    }

    return {

        signal,

        buyScore,

        sellScore,

        reason,

        diagnostics: {

            bodyRatio,

            closeLocation,

            directionalStrength,

            emaSpread,

            emaExtensionATR,

            pullbackDistanceATR,

            entryGapATR,

            bullishEMA,

            bearishEMA,

            bullishSlope,

            bearishSlope,

            strongBullishSlope,

            strongBearishSlope,

            trendStrong,

            trendVeryStrong,

            aboveVWAP,

            belowVWAP,

            vwapConfirmed,

            validPullback,

            notOverextended,

            buyRSI,

            sellRSI

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
                position.ema9.toFixed(2)
            ),

        ema21:
            Number(
                position.ema21.toFixed(2)
            ),

        ema9Slope:
            Number(
                position.ema9Slope.toFixed(2)
            ),

        ema21Slope:
            Number(
                position.ema21Slope.toFixed(2)
            ),

        emaSpread:
            Number(
                position.emaSpread.toFixed(2)
            ),

        rsi14:
            Number(
                position.rsi14.toFixed(2)
            ),

        vwap:
            Number(
                position.vwap.toFixed(2)
            ),

        atr14:
            Number(
                position.atr.toFixed(2)
            ),

        directionalStrength:
            Number(
                position.directionalStrength.toFixed(3)
            ),

        bodyRatio:
            Number(
                position.bodyRatio.toFixed(3)
            ),

        closeLocation:
            Number(
                position.closeLocation.toFixed(3)
            ),

        entryGapATR:
            Number(
                position.entryGapATR.toFixed(3)
            ),

        emaExtensionATR:
            Number(
                position.emaExtensionATR.toFixed(3)
            ),

        pullbackDistanceATR:
            Number(
                position.pullbackDistanceATR.toFixed(3)
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
        // STOP before TARGET

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
        // STOP before TARGET

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

    let position =
        null;

    const equityState = {

        equity:
            0,

        peakEquity:
            0,

        maxDrawdown:
            0

    };

    let cooldown =
        0;

    let previousSession =
        null;

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

        buyRSIHardRejected: 0,

        sellRSIHardRejected: 0,

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

            CONFIG.EMA_SLOW +
            CONFIG.EMA_SLOPE_LOOKBACK +
            5,

            CONFIG.RSI_PERIOD +
            5,

            CONFIG.ATR_PERIOD +
            5

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

                    diagnostics

                );

            signal =
                signalResult.signal;

        }

        // ==================================================
        // MANAGE EXISTING POSITION
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

        if (
            signal !==
            previousSignal &&
            signal === "WAIT"
        ) {

            previousSignal =
                "WAIT";

        }

        else {

            previousSignal =
                signal;

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

            diagnostics.cooldownRejected++;

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
        // SIGNAL
        // ==================================================

        if (
            !indicators ||
            !signalResult ||
            signal === "WAIT"
        ) {

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
            ) !==
            session
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

        const atrValue =
            Number(
                indicators.atr14
            );

        if (
            !Number.isFinite(entry) ||
            entry <= 0 ||
            !Number.isFinite(atrValue) ||
            atrValue <= 0
        ) {

            continue;

        }

        // ==================================================
        // ENTRY GAP
        // ==================================================

        const entryGap =
            Math.abs(
                entry -
                candle.c
            );

        const entryGapATR =
            entryGap /
            atrValue;

        if (
            entryGapATR >
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

                ? entry -
                  risk

                : entry +
                  risk;

        const target =
            side === "BUY"

                ? entry +
                  reward

                : entry -
                  reward;

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
                    ?.bodyRatio ??
                0,

            closeLocation:
                signalResult.diagnostics
                    ?.closeLocation ??
                0,

            entryGapATR,

            emaExtensionATR:
                signalResult.diagnostics
                    ?.emaExtensionATR ??
                0,

            pullbackDistanceATR:
                signalResult.diagnostics
                    ?.pullbackDistanceATR ??
                0

        };

        console.log(
            `${CONFIG.VERSION} ENTRY:`,
            position
        );

    }

    // ==================================================
    // FINAL POSITION
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
                trade.side ===
                "BUY"
        );

    const sellTrades =
        trades.filter(
            trade =>
                trade.side ===
                "SELL"
        );

    const winningTrades =
        trades.filter(
            trade =>
                trade.points >
                0
        );

    const losingTrades =
        trades.filter(
            trade =>
                trade.points <=
                0
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
                                trade.points >
                                0
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
                                trade.points >
                                0
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
                trade.reason ===
                "TARGET"
        ).length;

    const stopLossExits =
        trades.filter(
            trade =>
                trade.reason ===
                    "STOP LOSS" ||
                trade.reason ===
                    "STOP LOSS - GAP"
        ).length;

    const sessionCloseExits =
        trades.filter(
            trade =>
                trade.reason ===
                "SESSION CLOSE"
        ).length;

    const gapExits =
        trades.filter(
            trade =>
                trade.reason.includes(
                    "GAP"
                )
        ).length;

    const endOfDataExits =
        trades.filter(
            trade =>
                trade.reason ===
                "END OF DATA"
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

            return res.status(
                500
            ).json({

                success:
                    false,

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

            return res.status(
                400
            ).json({

                success:
                    false,

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
            `TradeMind ${CONFIG.VERSION} Backtest`
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

            return res.status(
                502
            ).json({

                success:
                    false,

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

        if (
            !response.ok
        ) {

            return res.status(
                response.status
            ).json({

                success:
                    false,

                version:
                    CONFIG.VERSION,

                error:
                    result

            });

        }

        const rawCandles =
            extractCandles(
                result
            );

        const candles =
            normalizeCandles(
                rawCandles
            );

        console.log(
            `${CONFIG.VERSION} candles:`,
            candles.length
        );

        if (
            candles.length <
            50
        ) {

            return res.status(
                200
            ).json({

                success:
                    true,

                version:
                    CONFIG.VERSION,

                interval,

                status:
                    "INSUFFICIENT_DATA",

                candlesTested:
                    candles.length,

                totalTrades:
                    0,

                buyTrades:
                    0,

                sellTrades:
                    0,

                winningTrades:
                    0,

                losingTrades:
                    0,

                winRate:
                    0,

                totalPoints:
                    0,

                averageWin:
                    0,

                averageLoss:
                    0,

                profitFactor:
                    0,

                maxDrawdown:
                    0,

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
            runBacktest(
                candles
            );

        console.log(
            "================================"
        );

        console.log(
            `${CONFIG.VERSION} RESULT`
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

        return res.status(
            200
        ).json({

            success:
                true,

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
            `${CONFIG.VERSION} ERROR:`,
            error
        );

        return res.status(
            500
        ).json({

            success:
                false,

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
