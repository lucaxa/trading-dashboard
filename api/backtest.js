/*
TradeMind Pro
V10.13 Historical Backtest Engine

V10.13 OBJECTIVE
----------------
V10.12 showed:

BUY  -> 0W / 3L
SELL -> 3W / 0L

Therefore V10.13 introduces
DIRECTION-SPECIFIC FILTERING.

SELL:
- Preserve V10.12 style logic

BUY:
- Stronger EMA slope requirement
- Stronger EMA separation
- Stronger directional strength
- Stricter RSI regime
- Stronger VWAP confirmation
- Stronger bullish candle confirmation
- Stricter close-location
- Stricter pullback
- Lower overextension
- Entry-gap protection

PAPER BACKTEST ONLY.
NO REAL ORDERS.
*/


// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {

    VERSION: "V10.13",

    EMA_FAST: 9,
    EMA_SLOW: 21,

    RSI_PERIOD: 14,
    ATR_PERIOD: 14,

    ATR_STOP_MULTIPLIER: 1.5,
    RISK_REWARD: 2,

    // ==================================================
    // COMMON TREND FILTERS
    // ==================================================

    MIN_EMA_ATR_SEPARATION: 0.12,

    MIN_DIRECTIONAL_STRENGTH: 0.12,

    MIN_VWAP_ATR_DISTANCE: 0.08,

    EMA_SLOPE_LOOKBACK: 3,

    // ==================================================
    // SELL SETTINGS
    // ==================================================

    SELL_MIN_DIRECTIONAL_STRENGTH: 0.12,

    SELL_MIN_EMA_SEPARATION: 0.12,

    SELL_RSI_MIN: 35,

    SELL_RSI_MAX: 45,

    SELL_MIN_BODY_RATIO: 0.45,

    SELL_MIN_CLOSE_LOCATION: 0.60,

    SELL_MAX_EXTENSION_ATR: 1.25,

    SELL_MIN_PULLBACK_ATR: 0.03,

    SELL_MAX_PULLBACK_ATR: 0.85,

    SELL_MAX_ENTRY_GAP_ATR: 0.20,

    // ==================================================
    // BUY SETTINGS - STRICTER IN V10.13
    // ==================================================

    BUY_MIN_DIRECTIONAL_STRENGTH: 0.50,

    BUY_MIN_EMA_SEPARATION: 0.35,

    BUY_RSI_MIN: 55,

    BUY_RSI_MAX: 63,

    BUY_MIN_BODY_RATIO: 0.45,

    BUY_MIN_CLOSE_LOCATION: 0.70,

    BUY_MAX_EXTENSION_ATR: 0.90,

    BUY_MIN_PULLBACK_ATR: 0.03,

    BUY_MAX_PULLBACK_ATR: 0.65,

    BUY_MAX_ENTRY_GAP_ATR: 0.15,

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

    if (averageLoss === 0) {
        return 100;
    }

    const rs =
        averageGain /
        averageLoss;

    return (
        100 -
        100 / (1 + rs)
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
        Math.abs(high - previousClose),
        Math.abs(low - previousClose)
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

        const range =
            trueRange(
                candles[i],
                candles[i - 1]
            );

        if (
            Number.isFinite(range)
        ) {
            ranges.push(range);
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
            (high + low + close) / 3;

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

    return totalPV / totalVolume;
}


// ======================================================
// NORMALIZE CANDLES
// ======================================================

function normalizeCandles(candles) {

    if (
        !Array.isArray(candles)
    ) {
        return [];
    }

    return candles
        .map(candle => {

            let normalized;

            if (
                Array.isArray(candle)
            ) {

                normalized = {

                    ts: Number(candle[0]),
                    o: Number(candle[1]),
                    h: Number(candle[2]),
                    l: Number(candle[3]),
                    c: Number(candle[4]),
                    v: Number(candle[5] ?? 0)

                };

            }

            else if (
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

            }

            else {
                return null;
            }

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
        Number.isFinite(ema9Previous)
            ? ema9Value - ema9Previous
            : null;

    const ema21Slope =
        Number.isFinite(ema21Previous)
            ? ema21Value - ema21Previous
            : null;

    const emaSpread =
        Math.abs(
            ema9Value -
            ema21Value
        );

    const directionalStrength =
        atrValue > 0
            ? emaSpread / atrValue
            : 0;

    return {

        ema9: ema9Value,

        ema21: ema21Value,

        ema9Slope,

        ema21Slope,

        emaSpread,

        rsi14: rsiValue,

        atr14: atrValue,

        vwap: vwapValue,

        directionalStrength

    };
}


// ======================================================
// CANDLE STRUCTURE
// ======================================================

function getCandleStructure(candle) {

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

    const bodyRatio =
        range > 0
            ? body / range
            : 0;

    const closeLocation =
        range > 0
            ? (close - low) / range
            : 0.5;

    return {

        bullish:
            close > open,

        bearish:
            close < open,

        bodyRatio,

        closeLocation,

        range

    };
}


// ======================================================
// SIGNAL ENGINE
// ======================================================

function getSignal(
    candle,
    indicators,
    nextCandle,
    diagnostics
) {

    if (
        !candle ||
        !indicators ||
        !nextCandle
    ) {

        return {

            signal: "WAIT",
            buyScore: 0,
            sellScore: 0,
            reason: "Missing data"

        };
    }

    const {

        ema9,
        ema21,
        ema9Slope,
        ema21Slope,
        emaSpread,
        rsi14,
        atr14,
        vwap,
        directionalStrength

    } = indicators;

    if (
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(ema9Slope) ||
        !Number.isFinite(ema21Slope) ||
        !Number.isFinite(emaSpread) ||
        !Number.isFinite(rsi14) ||
        !Number.isFinite(atr14) ||
        !Number.isFinite(vwap) ||
        !Number.isFinite(directionalStrength) ||
        atr14 <= 0
    ) {

        return {

            signal: "WAIT",
            buyScore: 0,
            sellScore: 0,
            reason: "Indicators unavailable"

        };
    }

    const structure =
        getCandleStructure(candle);

    const {

        bullish,
        bearish,
        bodyRatio,
        closeLocation

    } = structure;

    const close =
        Number(candle.c);

    const entry =
        Number(nextCandle.o);

    // ==================================================
    // COMMON
    // ==================================================

    const bullishEMA =
        ema9 > ema21;

    const bearishEMA =
        ema9 < ema21;

    const bullishSlope =
        ema9Slope > 0 &&
        ema21Slope > 0;

    const bearishSlope =
        ema9Slope < 0 &&
        ema21Slope < 0;

    const aboveVWAP =
        close > vwap;

    const belowVWAP =
        close < vwap;

    const vwapDistance =
        Math.abs(
            close - vwap
        );

    const awayFromVWAP =
        vwapDistance >=
        atr14 *
        CONFIG.MIN_VWAP_ATR_DISTANCE;

    const emaExtension =
        Math.abs(
            close - ema9
        ) / atr14;

    const pullbackDistance =
        Math.abs(
            close - ema9
        ) / atr14;

    const entryGapATR =
        Math.abs(
            entry - close
        ) / atr14;

    // ==================================================
    // BUY CONDITIONS
    // ==================================================

    const buyStrongTrend =
        directionalStrength >=
        CONFIG.BUY_MIN_DIRECTIONAL_STRENGTH;

    const buyStrongSeparation =
        (
            emaSpread / atr14
        ) >=
        CONFIG.BUY_MIN_EMA_SEPARATION;

    const buyRSI =
        rsi14 >= CONFIG.BUY_RSI_MIN &&
        rsi14 <= CONFIG.BUY_RSI_MAX;

    const buyVWAP =
        aboveVWAP &&
        awayFromVWAP;

    const buyPullback =
        pullbackDistance >=
            CONFIG.BUY_MIN_PULLBACK_ATR &&
        pullbackDistance <=
            CONFIG.BUY_MAX_PULLBACK_ATR;

    const buyNotExtended =
        emaExtension <=
        CONFIG.BUY_MAX_EXTENSION_ATR;

    const buyCandle =
        bullish &&
        bodyRatio >=
            CONFIG.BUY_MIN_BODY_RATIO &&
        closeLocation >=
            CONFIG.BUY_MIN_CLOSE_LOCATION;

    const buyEntryGap =
        entryGapATR <=
        CONFIG.BUY_MAX_ENTRY_GAP_ATR;

    // ==================================================
    // SELL CONDITIONS
    // ==================================================

    const sellStrongTrend =
        directionalStrength >=
        CONFIG.SELL_MIN_DIRECTIONAL_STRENGTH;

    const sellStrongSeparation =
        (
            emaSpread / atr14
        ) >=
        CONFIG.SELL_MIN_EMA_SEPARATION;

    const sellRSI =
        rsi14 >= CONFIG.SELL_RSI_MIN &&
        rsi14 <= CONFIG.SELL_RSI_MAX;

    const sellVWAP =
        belowVWAP &&
        awayFromVWAP;

    const sellPullback =
        pullbackDistance >=
            CONFIG.SELL_MIN_PULLBACK_ATR &&
        pullbackDistance <=
            CONFIG.SELL_MAX_PULLBACK_ATR;

    const sellNotExtended =
        emaExtension <=
        CONFIG.SELL_MAX_EXTENSION_ATR;

    const sellCandle =
        bearish &&
        bodyRatio >=
            CONFIG.SELL_MIN_BODY_RATIO &&
        closeLocation <=
            (
                1 -
                CONFIG.SELL_MIN_CLOSE_LOCATION
            );

    const sellEntryGap =
        entryGapATR <=
        CONFIG.SELL_MAX_ENTRY_GAP_ATR;

    // ==================================================
    // BUY SCORE
    // ==================================================

    let buyScore = 0;

    const buyReasons = [];

    if (bullishEMA) {
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

    if (buyStrongSeparation) {
        buyScore++;
        buyReasons.push(
            "Strong EMA separation"
        );
    }

    if (buyStrongTrend) {
        buyScore++;
        buyReasons.push(
            "Strong trend"
        );
    }

    if (buyRSI) {
        buyScore++;
        buyReasons.push(
            "BUY RSI regime"
        );
    }

    if (buyVWAP) {
        buyScore++;
        buyReasons.push(
            "VWAP confirmation"
        );
    }

    if (buyPullback) {
        buyScore++;
        buyReasons.push(
            "Controlled EMA9 pullback"
        );
    }

    if (buyCandle) {
        buyScore++;
        buyReasons.push(
            "Strong bullish candle"
        );
    }

    if (buyNotExtended) {
        buyScore++;
        buyReasons.push(
            "Not overextended"
        );
    }

    if (buyEntryGap) {
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

    if (bearishEMA) {
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

    if (sellStrongSeparation) {
        sellScore++;
        sellReasons.push(
            "Strong EMA separation"
        );
    }

    if (sellStrongTrend) {
        sellScore++;
        sellReasons.push(
            "Trend strength"
        );
    }

    if (sellRSI) {
        sellScore++;
        sellReasons.push(
            "RSI momentum"
        );
    }

    if (sellVWAP) {
        sellScore++;
        sellReasons.push(
            "VWAP confirmation"
        );
    }

    if (sellPullback) {
        sellScore++;
        sellReasons.push(
            "EMA9 pullback"
        );
    }

    if (sellCandle) {
        sellScore++;
        sellReasons.push(
            "Strong bearish candle"
        );
    }

    if (sellNotExtended) {
        sellScore++;
        sellReasons.push(
            "Not overextended"
        );
    }

    if (sellEntryGap) {
        sellScore++;
        sellReasons.push(
            "Entry gap acceptable"
        );
    }

    // ==================================================
    // STRICT BUY
    // ==================================================

    /*
    BUY requires ALL critical conditions.

    This is intentionally stricter than SELL.

    The purpose is NOT to maximize trade count.

    The purpose is to remove low-quality BUY
    setups which caused V10.12 losses.
    */

    const strictBuy =
        bullishEMA &&
        bullishSlope &&
        buyStrongSeparation &&
        buyStrongTrend &&
        buyRSI &&
        buyVWAP &&
        buyPullback &&
        buyNotExtended &&
        buyCandle &&
        buyEntryGap;

    // ==================================================
    // STRICT SELL
    // ==================================================

    const strictSell =
        bearishEMA &&
        bearishSlope &&
        sellStrongSeparation &&
        sellStrongTrend &&
        sellRSI &&
        sellVWAP &&
        sellPullback &&
        sellNotExtended &&
        sellCandle &&
        sellEntryGap;

    let signal = "WAIT";

    let reason =
        "Waiting for V10.13 confirmation";

    if (strictBuy) {

        signal = "BUY";

        reason =
            buyReasons.join(
                " + "
            );

    }

    else if (strictSell) {

        signal = "SELL";

        reason =
            sellReasons.join(
                " + "
            );
    }

    // ==================================================
    // DIAGNOSTICS
    // ==================================================

    if (
        signal === "WAIT"
    ) {

        if (
            bullishEMA &&
            bullishSlope &&
            !buyStrongTrend
        ) {
            diagnostics.weakBuyTrend++;
        }

        if (
            bullishEMA &&
            !buyStrongSeparation
        ) {
            diagnostics.weakBuySeparation++;
        }

        if (
            bullishEMA &&
            !bullishSlope
        ) {
            diagnostics.weakBuySlope++;
        }

        if (
            bullishEMA &&
            !buyRSI
        ) {
            diagnostics.buyRSIRejected++;
        }

        if (
            bullishEMA &&
            !buyCandle
        ) {
            diagnostics.buyCandleRejected++;
        }

        if (
            bearishEMA &&
            !sellStrongTrend
        ) {
            diagnostics.weakTrend++;
        }

        if (
            bearishEMA &&
            !sellStrongSeparation
        ) {
            diagnostics.weakEMASeparation++;
        }

        if (
            bearishEMA &&
            !bearishSlope
        ) {
            diagnostics.weakSlope++;
        }

        if (
            bearishEMA &&
            !sellRSI
        ) {
            diagnostics.rsiRejected++;
        }

        if (
            bearishEMA &&
            !sellCandle
        ) {
            diagnostics.bearishCandleRejected++;
        }
    }

    return {

        signal,

        buyScore,

        sellScore,

        reason,

        diagnostics: {

            bodyRatio,

            closeLocation,

            emaExtension,

            pullbackDistance,

            entryGapATR,

            directionalStrength,

            emaSpread,

            buyStrongTrend,

            buyStrongSeparation,

            buyRSI,

            buyVWAP,

            buyPullback,

            buyNotExtended,

            buyCandle,

            buyEntryGap,

            sellStrongTrend,

            sellStrongSeparation,

            sellRSI,

            sellVWAP,

            sellPullback,

            sellNotExtended,

            sellCandle,

            sellEntryGap

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
            position.buyScore,

        sellScore:
            position.sellScore,

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
            open <= position.stop
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
            open >= position.target
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
            low <= position.stop
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
            high >= position.target
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
            open >= position.stop
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
            open <= position.target
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
            high >= position.stop
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
            low <= position.target
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

        overextended: 0,

        rsiRejected: 0,

        buyRSIRejected: 0,

        weakCandle: 0,

        buyCandleRejected: 0,

        bullishCloseRejected: 0,

        bearishCandleRejected: 0,

        entryGapRejected: 0,

        sessionRejected: 0,

        duplicateSignalRejected: 0,

        cooldownRejected: 0,

        noTradeSignal: 0

    };

    const startIndex =
        Math.max(
            CONFIG.EMA_SLOW + 5,
            CONFIG.RSI_PERIOD + 5,
            CONFIG.ATR_PERIOD + 5
        );

    for (
        let i = startIndex;
        i < candles.length - 1;
        i++
    ) {

        const candle =
            candles[i];

        const nextCandle =
            candles[i + 1];

        const session =
            getISTDate(candle.ts);

        const minutes =
            getISTMinutes(candle.ts);

        let closedThisCandle = false;

        // ==================================================
        // SESSION CHANGE
        // ==================================================

        if (
            previousSession !== null &&
            session !== previousSession
        ) {

            if (position) {

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

                trades.push(trade);

                position = null;

                cooldown =
                    CONFIG.COOLDOWN_CANDLES;

                closedThisCandle = true;
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

        if (!indicators) {
            continue;
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
                    candle.c,
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
        // DON'T ENTER AFTER EXIT
        // ==================================================

        if (
            closedThisCandle
        ) {
            continue;
        }

        // ==================================================
        // SESSION ENTRY WINDOW
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
        // SIGNAL
        // ==================================================

        const signalResult =
            getSignal(
                candle,
                indicators,
                nextCandle,
                diagnostics
            );

        const signal =
            signalResult.signal;

        if (
            signal === "WAIT"
        ) {

            diagnostics.noTradeSignal++;

            previousSignal =
                "WAIT";

            continue;
        }

        // ==================================================
        // FRESH SIGNAL
        // ==================================================

        const freshSignal =
            signal !==
            previousSignal;

        if (
            !freshSignal
        ) {

            diagnostics.duplicateSignalRejected++;

            previousSignal =
                signal;

            continue;
        }

        previousSignal =
            signal;

        // ==================================================
        // NEXT CANDLE SESSION CHECK
        // ==================================================

        if (
            getISTDate(nextCandle.ts) !==
            session
        ) {
            continue;
        }

        // ==================================================
        // ENTRY
        // ==================================================

        const entry =
            Number(nextCandle.o);

        const atrValue =
            Number(indicators.atr14);

        if (
            !Number.isFinite(entry) ||
            !Number.isFinite(atrValue) ||
            atrValue <= 0
        ) {
            continue;
        }

        // ==================================================
        // EXTRA BUY ENTRY PROTECTION
        // ==================================================

        if (
            signal === "BUY"
        ) {

            const gapATR =
                Math.abs(
                    entry -
                    candle.c
                ) / atrValue;

            if (
                gapATR >
                CONFIG.BUY_MAX_ENTRY_GAP_ATR
            ) {

                diagnostics.entryGapRejected++;

                continue;
            }
        }

        // ==================================================
        // EXTRA SELL ENTRY PROTECTION
        // ==================================================

        if (
            signal === "SELL"
        ) {

            const gapATR =
                Math.abs(
                    entry -
                    candle.c
                ) / atrValue;

            if (
                gapATR >
                CONFIG.SELL_MAX_ENTRY_GAP_ATR
            ) {

                diagnostics.entryGapRejected++;

                continue;
            }
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
        // CREATE POSITION
        // ==================================================

        const d =
            signalResult.diagnostics;

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

            buyScore:
                signalResult.buyScore,

            sellScore:
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
                d.bodyRatio,

            closeLocation:
                d.closeLocation,

            entryGapATR:
                d.entryGapATR,

            emaExtensionATR:
                d.emaExtension,

            pullbackDistanceATR:
                d.pullbackDistance

        };

        console.log(
            "V10.13 ENTRY:",
            position
        );
    }

    // ==================================================
    // CLOSE FINAL POSITION
    // ==================================================

    if (position) {

        const last =
            candles[candles.length - 1];

        const trade =
            closePosition(
                position,
                last.c,
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
            ? wins / totalTrades * 100
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

    const buyWins =
        buyTrades.filter(
            t => t.points > 0
        ).length;

    const buyLosses =
        buyTrades.filter(
            t => t.points <= 0
        ).length;

    const sellWins =
        sellTrades.filter(
            t => t.points > 0
        ).length;

    const sellLosses =
        sellTrades.filter(
            t => t.points <= 0
        ).length;

    const buyPoints =
        buyTrades.reduce(
            (sum, trade) =>
                sum + trade.points,
            0
        );

    const sellPoints =
        sellTrades.reduce(
            (sum, trade) =>
                sum + trade.points,
            0
        );

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
                t =>
                    t.reason === "TARGET" ||
                    t.reason === "TARGET - GAP"
            ).length,

        stopLossExits:
            trades.filter(
                t =>
                    t.reason === "STOP LOSS"
            ).length,

        sessionCloseExits:
            trades.filter(
                t =>
                    t.reason === "SESSION CLOSE"
            ).length,

        gapExits:
            trades.filter(
                t =>
                    t.reason === "STOP LOSS - GAP" ||
                    t.reason === "TARGET - GAP"
            ).length,

        endOfDataExits:
            trades.filter(
                t =>
                    t.reason === "END OF DATA"
            ).length,

        directionStats: {

            BUY: {

                trades:
                    buyTrades.length,

                wins:
                    buyWins,

                losses:
                    buyLosses,

                winRate:
                    buyTrades.length > 0
                        ? buyWins /
                          buyTrades.length *
                          100
                        : 0,

                points:
                    buyPoints

            },

            SELL: {

                trades:
                    sellTrades.length,

                wins:
                    sellWins,

                losses:
                    sellLosses,

                winRate:
                    sellTrades.length > 0
                        ? sellWins /
                          sellTrades.length *
                          100
                        : 0,

                points:
                    sellPoints

            }

        },

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

        const NIFTY_ID =
            "40000001";

        const scripCode =
            `NIDX_${NIFTY_ID}`;

        const endTime =
            Date.now();

        const startTime =
            endTime -
            7 *
            24 *
            60 *
            60 *
            1000;

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

        const rawCandles =
            extractCandles(result);

        const candles =
            normalizeCandles(
                rawCandles
            );

        console.log(
            "Raw candles:",
            Array.isArray(rawCandles)
                ? rawCandles.length
                : 0
        );

        console.log(
            "Normalized candles:",
            candles.length
        );

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
            "Candles:",
            backtest.candlesTested
        );

        console.log(
            "Trades:",
            backtest.totalTrades
        );

        console.log(
            "BUY:",
            backtest.buyTrades,
            backtest.directionStats.BUY
        );

        console.log(
            "SELL:",
            backtest.sellTrades,
            backtest.directionStats.SELL
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
            "Diagnostics:",
            backtest.diagnostics
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
            `${CONFIG.VERSION} Backtest Error:`,
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
