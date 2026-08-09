/*
TradeMind Pro
V10.11 Historical Backtest Engine

INDstocks → Historical Candles → V10.11 Simulation

V10.11:
- EMA 9 / EMA 21
- EMA slope alignment
- EMA separation hard filter
- Directional strength hard filter
- RSI regime hard filter
- VWAP hard filter
- EMA9 pullback requirement
- Overextension protection
- Strong candle requirement
- Close-location requirement
- Rejection candle confirmation
- Score advantage requirement
- One position at a time
- Fresh signal tracking
- Cooldown
- Next-candle execution
- Gap-aware execution
- Conservative SL/Target handling
- ATR-based stop
- 1:2 Risk/Reward
- Session close
- Detailed diagnostics

PAPER BACKTEST ONLY.
NO REAL ORDERS.
*/


// ======================================================
// CONFIG
// ======================================================

const CONFIG = {

    EMA_FAST: 9,
    EMA_SLOW: 21,

    RSI_PERIOD: 14,
    ATR_PERIOD: 14,

    ATR_STOP_MULTIPLIER: 1.5,
    RISK_REWARD: 2,

    // --------------------------------------------------
    // HARD TREND FILTERS
    // --------------------------------------------------

    MIN_EMA_ATR_SEPARATION: 0.30,

    MIN_DIRECTIONAL_STRENGTH: 0.35,

    EMA_SLOPE_LOOKBACK: 3,

    // --------------------------------------------------
    // RSI
    // --------------------------------------------------

    BUY_RSI_MIN: 52,
    BUY_RSI_MAX: 63,

    SELL_RSI_MIN: 37,
    SELL_RSI_MAX: 48,

    // --------------------------------------------------
    // VWAP
    // --------------------------------------------------

    MIN_VWAP_ATR_DISTANCE: 0.05,

    // --------------------------------------------------
    // CANDLE
    // --------------------------------------------------

    MIN_CANDLE_BODY_RATIO: 0.45,

    MIN_CLOSE_LOCATION: 0.65,

    // --------------------------------------------------
    // EXTENSION
    // --------------------------------------------------

    MAX_EMA_EXTENSION_ATR: 0.75,

    // --------------------------------------------------
    // PULLBACK
    // --------------------------------------------------

    MIN_PULLBACK_DISTANCE_ATR: 0.05,

    MAX_PULLBACK_DISTANCE_ATR: 0.75,

    // --------------------------------------------------
    // SCORE
    // --------------------------------------------------

    MIN_SCORE: 8,

    MIN_SCORE_ADVANTAGE: 2,

    // --------------------------------------------------
    // COOLDOWN
    // --------------------------------------------------

    COOLDOWN_CANDLES: 3,

    // --------------------------------------------------
    // SESSION
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
                current - value
            ) * multiplier + value;
    }

    return value;
}


// ======================================================
// RSI
// ======================================================

function rsi(values, period = 14) {

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
            values[i] -
            values[i - 1];

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
        averageGain /
        averageLoss;

    return 100 -
        (
            100 /
            (1 + rs)
        );
}


// ======================================================
// TRUE RANGE
// ======================================================

function trueRange(current, previous) {

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

function atr(candles, period = 14) {

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
                (sum, value) =>
                    sum + value,
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

        totalVolume += volume;
    }

    if (totalVolume <= 0) {
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

function normalizeCandles(candles) {

    if (!Array.isArray(candles)) {
        return [];
    }

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
                normalized.h < normalized.l
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
        CONFIG.EMA_SLOW + 10
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

    // --------------------------------------------------
    // EMA SLOPE
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
// V10.11 SIGNAL ENGINE
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
            reason: "Missing data"

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
        !Number.isFinite(rsi14) ||
        !Number.isFinite(atr14) ||
        !Number.isFinite(vwapValue) ||
        atr14 <= 0
    ) {

        return {

            signal: "WAIT",
            buyScore: 0,
            sellScore: 0,
            reason: "Indicators unavailable"

        };
    }

    // ==================================================
    // CANDLE METRICS
    // ==================================================

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
            ? (
                close - low
            ) / range
            : 0.5;

    const strongCandle =
        bodyRatio >=
        CONFIG.MIN_CANDLE_BODY_RATIO;

    const bullishCandle =
        close > open;

    const bearishCandle =
        close < open;

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
    // TREND
    // ==================================================

    const bullishTrend =
        ema9 > ema21;

    const bearishTrend =
        ema9 < ema21;

    const bullishSlope =
        ema9Slope > 0 &&
        ema21Slope > 0;

    const bearishSlope =
        ema9Slope < 0 &&
        ema21Slope < 0;

    const strongEMASeparation =
        (
            emaSpread /
            atr14
        ) >=
        CONFIG.MIN_EMA_ATR_SEPARATION;

    const strongTrend =
        directionalStrength >=
        CONFIG.MIN_DIRECTIONAL_STRENGTH;

    // ==================================================
    // VWAP
    // ==================================================

    const aboveVWAP =
        close > vwapValue;

    const belowVWAP =
        close < vwapValue;

    const vwapDistance =
        Math.abs(
            close -
            vwapValue
        );

    const vwapConfirmed =
        vwapDistance >=
        (
            atr14 *
            CONFIG.MIN_VWAP_ATR_DISTANCE
        );

    // ==================================================
    // EMA9 PULLBACK
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
            CONFIG.MIN_PULLBACK_DISTANCE_ATR &&

        pullbackDistanceATR <=
            CONFIG.MAX_PULLBACK_DISTANCE_ATR;

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

    // ==================================================
    // REJECTION CANDLE
    // ==================================================

    const lowerWick =
        Math.min(open, close) -
        low;

    const upperWick =
        high -
        Math.max(open, close);

    const bullishRejection =
        bullishCandle &&
        lowerWick > body &&
        bullishClose;

    const bearishRejection =
        bearishCandle &&
        upperWick > body &&
        bearishClose;

    // ==================================================
    // HARD BUY CONDITIONS
    // ==================================================

    const buyConditions = {

        trend:
            bullishTrend,

        slope:
            bullishSlope,

        separation:
            strongEMASeparation,

        strength:
            strongTrend,

        rsi:
            rsi14 >= CONFIG.BUY_RSI_MIN &&
            rsi14 <= CONFIG.BUY_RSI_MAX,

        vwap:
            aboveVWAP &&
            vwapConfirmed,

        pullback:
            validPullback,

        extension:
            notOverextended,

        candle:
            bullishCandle &&
            strongCandle,

        closeLocation:
            bullishClose,

        confirmation:
            bullishRejection ||
            (
                bullishCandle &&
                strongCandle &&
                bullishClose
            )

    };

    // ==================================================
    // HARD SELL CONDITIONS
    // ==================================================

    const sellConditions = {

        trend:
            bearishTrend,

        slope:
            bearishSlope,

        separation:
            strongEMASeparation,

        strength:
            strongTrend,

        rsi:
            rsi14 >= CONFIG.SELL_RSI_MIN &&
            rsi14 <= CONFIG.SELL_RSI_MAX,

        vwap:
            belowVWAP &&
            vwapConfirmed,

        pullback:
            validPullback,

        extension:
            notOverextended,

        candle:
            bearishCandle &&
            strongCandle,

        closeLocation:
            bearishClose,

        confirmation:
            bearishRejection ||
            (
                bearishCandle &&
                strongCandle &&
                bearishClose
            )

    };

    // ==================================================
    // SCORE
    // ==================================================

    let buyScore = 0;
    let sellScore = 0;

    if (buyConditions.trend) buyScore++;
    if (buyConditions.slope) buyScore++;
    if (buyConditions.separation) buyScore++;
    if (buyConditions.strength) buyScore++;
    if (buyConditions.rsi) buyScore++;
    if (buyConditions.vwap) buyScore++;
    if (buyConditions.pullback) buyScore++;
    if (buyConditions.extension) buyScore++;
    if (buyConditions.candle) buyScore++;
    if (buyConditions.closeLocation) buyScore++;
    if (buyConditions.confirmation) buyScore++;

    if (sellConditions.trend) sellScore++;
    if (sellConditions.slope) sellScore++;
    if (sellConditions.separation) sellScore++;
    if (sellConditions.strength) sellScore++;
    if (sellConditions.rsi) sellScore++;
    if (sellConditions.vwap) sellScore++;
    if (sellConditions.pullback) sellScore++;
    if (sellConditions.extension) sellScore++;
    if (sellConditions.candle) sellScore++;
    if (sellConditions.closeLocation) sellScore++;
    if (sellConditions.confirmation) sellScore++;

    // ==================================================
    // STRICT BUY
    // ==================================================

    const buyHardPass =
        Object.values(
            buyConditions
        ).every(Boolean);

    // ==================================================
    // STRICT SELL
    // ==================================================

    const sellHardPass =
        Object.values(
            sellConditions
        ).every(Boolean);

    // ==================================================
    // FINAL SIGNAL
    // ==================================================

    let signal = "WAIT";

    let reason =
        "Waiting for V10.11 hard confirmation";

    if (
        buyHardPass &&
        buyScore >= CONFIG.MIN_SCORE &&
        (
            buyScore -
            sellScore
        ) >= CONFIG.MIN_SCORE_ADVANTAGE
    ) {

        signal = "BUY";

        reason =
            "Strict bullish confirmation";

    }

    else if (
        sellHardPass &&
        sellScore >= CONFIG.MIN_SCORE &&
        (
            sellScore -
            buyScore
        ) >= CONFIG.MIN_SCORE_ADVANTAGE
    ) {

        signal = "SELL";

        reason =
            "Strict bearish confirmation";

    }

    // ==================================================
    // FAILED FILTER DIAGNOSTICS
    // ==================================================

    const failedBuy =
        Object.entries(
            buyConditions
        )
            .filter(
                ([, passed]) =>
                    !passed
            )
            .map(
                ([name]) =>
                    name
            );

    const failedSell =
        Object.entries(
            sellConditions
        )
            .filter(
                ([, passed]) =>
                    !passed
            )
            .map(
                ([name]) =>
                    name
            );

    return {

        signal,

        buyScore,

        sellScore,

        reason,

        diagnostics: {

            bodyRatio,

            closeLocation,

            emaSpread,

            directionalStrength,

            emaExtensionATR,

            pullbackDistanceATR,

            rsi14,

            vwapDistance,

            bullishRejection,

            bearishRejection,

            buyHardPass,

            sellHardPass,

            failedBuy,

            failedSell

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

        confirmationTs:
            position.confirmationTs,

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

        confirmationTime:
            new Date(
                position.confirmationTs * 1000
            ).toISOString(),

        signal:
            position.signal,

        buyScore:
            position.buyScore,

        sellScore:
            position.sellScore,

        signalReason:
            position.signalReason,

        confirmationReason:
            position.confirmationReason,

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
// RUN BACKTEST
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

    let bullishCandleRejections = 0;

    let bearishCandleRejections = 0;

    let targetExits = 0;

    let stopLossExits = 0;

    let sessionCloseExits = 0;

    let gapExits = 0;

    let endOfDataExits = 0;

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

        const session =
            getISTDate(candle.ts);

        const minutes =
            getISTMinutes(candle.ts);

        let closedThisCandle = false;

        // ==================================================
        // NEW SESSION
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

                sessionCloseExits++;

                position = null;

                cooldown =
                    CONFIG.COOLDOWN_CANDLES;

                closedThisCandle = true;
            }

            previousSignal = "WAIT";
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
                    indicators
                );

            signal =
                signalResult.signal;
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

                if (
                    trade.reason.includes(
                        "TARGET"
                    )
                ) {
                    targetExits++;
                }

                else if (
                    trade.reason.includes(
                        "STOP LOSS"
                    )
                ) {
                    stopLossExits++;
                }

                if (
                    trade.reason.includes(
                        "GAP"
                    )
                ) {
                    gapExits++;
                }

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

            sessionCloseExits++;

            position = null;

            cooldown =
                CONFIG.COOLDOWN_CANDLES;

            closedThisCandle = true;
        }

        // ==================================================
        // SIGNAL CHANGE
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
        // NO SAME-CANDLE REENTRY
        // ==================================================

        if (closedThisCandle) {
            continue;
        }

        // ==================================================
        // COOLDOWN
        // ==================================================

        if (cooldown > 0) {

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
        // SIGNAL DATA
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

        if (!freshSignal) {
            continue;
        }

        // ==================================================
        // REJECTION DIAGNOSTICS
        // ==================================================

        if (
            signal === "WAIT"
        ) {

            const diagnostics =
                signalResult.diagnostics;

            if (
                diagnostics &&
                diagnostics.failedBuy?.includes(
                    "candle"
                )
            ) {
                bullishCandleRejections++;
            }

            if (
                diagnostics &&
                diagnostics.failedSell?.includes(
                    "candle"
                )
            ) {
                bearishCandleRejections++;
            }
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
        // ENTRY GAP
        // ==================================================

        const entryGap =
            side === "BUY"
                ? entry - candle.c
                : candle.c - entry;

        const entryGapATR =
            atrValue > 0
                ? entryGap / atrValue
                : 0;

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

            buyScore:
                signalResult.buyScore,

            sellScore:
                signalResult.sellScore,

            signalReason:
                signalResult.reason,

            confirmationReason:
                side === "BUY"
                    ? "Bullish strict confirmation"
                    : "Bearish strict confirmation",

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

            bodyRatio:
                signalResult.diagnostics
                    .bodyRatio,

            closeLocation:
                signalResult.diagnostics
                    .closeLocation,

            entryGapATR,

            emaExtensionATR:
                signalResult.diagnostics
                    .emaExtensionATR,

            pullbackDistanceATR:
                signalResult.diagnostics
                    .pullbackDistanceATR

        };

        console.log(
            "V10.11 ENTRY:",
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
                last.c,
                last.ts,
                "END OF DATA",
                equityState
            );

        trades.push(trade);

        endOfDataExits++;
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

        targetExits,

        stopLossExits,

        sessionCloseExits,

        gapExits,

        endOfDataExits,

        bullishCandleRejections,

        bearishCandleRejections,

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

                version: "V10.11",

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

                version: "V10.11",

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
            "TradeMind V10.11 Backtest Request"
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

                version: "V10.11",

                error:
                    "INDstocks returned invalid JSON",

                details:
                    text.slice(0, 1000)

            });
        }

        console.log(
            "V10.11 INDstocks response:",
            JSON.stringify(result)
                .slice(0, 3000)
        );

        if (!response.ok) {

            return res.status(
                response.status
            ).json({

                success: false,

                version: "V10.11",

                error:
                    result

            });
        }

        const rawCandles =
            extractCandles(result);

        console.log(
            "V10.11 raw candle count:",
            Array.isArray(rawCandles)
                ? rawCandles.length
                : 0
        );

        const candles =
            normalizeCandles(
                rawCandles
            );

        console.log(
            "V10.11 normalized candle count:",
            candles.length
        );

        if (
            candles.length < 50
        ) {

            return res.status(200).json({

                success: true,

                version: "V10.11",

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

                bullishCandleRejections: 0,

                bearishCandleRejections: 0,

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
            "TradeMind V10.11 RESULT"
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
            "Target exits:",
            backtest.targetExits
        );

        console.log(
            "Stop exits:",
            backtest.stopLossExits
        );

        console.log(
            "================================"
        );

        console.table(
            backtest.trades
        );

        return res.status(200).json({

            success: true,

            version: "V10.11",

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

            bullishCandleRejections:
                backtest.bullishCandleRejections,

            bearishCandleRejections:
                backtest.bearishCandleRejections,

            trades:
                backtest.trades

        });

    }

    catch (error) {

        console.error(
            "TradeMind V10.11 Backtest Error:",
            error
        );

        return res.status(500).json({

            success: false,

            version: "V10.11",

            error:
                "V10.11 backtest failed",

            details:
                error?.message ||
                "Unknown error"

        });
    }
}
