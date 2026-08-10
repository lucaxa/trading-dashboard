/*
TradeMind Pro
V11.0 Learning Dataset Engine

PURPOSE:
- Historical NIFTY 50 data
- Feature generation
- Future outcome labeling
- Foundation for self-learning model

IMPORTANT:
- PAPER / RESEARCH ONLY
- NO REAL ORDERS
- NO LIVE TRADING
- No predictive model yet
- No future data is used in the FEATURES
- Future candles are used ONLY to create historical labels

V11.0 FEATURES:
- EMA 9
- EMA 21
- RSI 14
- ATR 14
- VWAP
- EMA separation
- EMA slopes
- RSI momentum
- VWAP distance
- Pullback distance
- Candle structure
- Volatility
- Time of day
- Trend regime

OUTCOME:
- BUY outcome
- SELL outcome
- WIN / LOSS / TIMEOUT
*/


// ======================================================
// CONFIG
// ======================================================

export const CONFIG = {

    VERSION: "V11.0",

    NIFTY_ID: "40000001",

    DEFAULT_INTERVAL: "5minute",

    DEFAULT_DAYS: 7,

    MAX_DAYS: 30,

    EMA_FAST: 9,

    EMA_SLOW: 21,

    RSI_PERIOD: 14,

    ATR_PERIOD: 14,

    ATR_STOP_MULTIPLIER: 1.5,

    RISK_REWARD: 2,

    // Number of candles into the future
    // used to determine the outcome.
    FUTURE_CANDLES: 12,

    MIN_TRAINING_HISTORY: 50

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

function getISTDate(timestamp) {

    const date =
        new Date(
            Number(timestamp) * 1000 +
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

function getISTMinutes(timestamp) {

    const date =
        new Date(
            Number(timestamp) * 1000 +
            (
                5.5 *
                60 *
                60 *
                1000
            )
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

function normalizeCandles(candles) {

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
// CANDLE FEATURES
// ======================================================

function candleFeatures(candle) {

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

    const upperWickRatio =
        range > 0
            ? upperWick / range
            : 0;

    const lowerWickRatio =
        range > 0
            ? lowerWick / range
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

        bodyRatio,

        upperWick,

        lowerWick,

        upperWickRatio,

        lowerWickRatio,

        closeLocation,

        bullish:
            close > open,

        bearish:
            close < open

    };
}


// ======================================================
// INDICATORS FOR ONE CANDLE
// ======================================================

function calculateFeatures(
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
        CONFIG.MIN_TRAINING_HISTORY
    ) {
        return null;
    }

    const closes =
        history.map(
            candle =>
                Number(candle.c)
        );

    const ema9 =
        ema(
            closes,
            CONFIG.EMA_FAST
        );

    const ema21 =
        ema(
            closes,
            CONFIG.EMA_SLOW
        );

    const rsi14 =
        rsi(
            closes,
            CONFIG.RSI_PERIOD
        );

    const atr14 =
        atr(
            history,
            CONFIG.ATR_PERIOD
        );

    const vwapValue =
        vwap(history);

    if (
        !Number.isFinite(ema9) ||
        !Number.isFinite(ema21) ||
        !Number.isFinite(rsi14) ||
        !Number.isFinite(atr14) ||
        !Number.isFinite(vwapValue) ||
        atr14 <= 0
    ) {
        return null;
    }


    // --------------------------------------------------
    // PREVIOUS EMA VALUES
    // --------------------------------------------------

    let previousEma9 = null;

    let previousEma21 = null;

    if (history.length > CONFIG.EMA_SLOW + 3) {

        const previousCloses =
            history
                .slice(0, -3)
                .map(
                    candle =>
                        Number(candle.c)
                );

        previousEma9 =
            ema(
                previousCloses,
                CONFIG.EMA_FAST
            );

        previousEma21 =
            ema(
                previousCloses,
                CONFIG.EMA_SLOW
            );
    }


    const ema9Slope =
        Number.isFinite(previousEma9)
            ? ema9 - previousEma9
            : 0;

    const ema21Slope =
        Number.isFinite(previousEma21)
            ? ema21 - previousEma21
            : 0;


    // --------------------------------------------------
    // PREVIOUS RSI
    // --------------------------------------------------

    let previousRSI = null;

    if (
        history.length >
        CONFIG.RSI_PERIOD + 2
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
    }


    // --------------------------------------------------
    // PRICE
    // --------------------------------------------------

    const candle =
        candles[index];

    const close =
        Number(candle.c);

    const candleInfo =
        candleFeatures(candle);


    // --------------------------------------------------
    // TREND
    // --------------------------------------------------

    let trend =
        "NEUTRAL";

    if (
        ema9 > ema21 &&
        ema9Slope > 0 &&
        ema21Slope >= 0
    ) {

        trend =
            "BULLISH";

    } else if (
        ema9 < ema21 &&
        ema9Slope < 0 &&
        ema21Slope <= 0
    ) {

        trend =
            "BEARISH";
    }


    // --------------------------------------------------
    // REGIME
    // --------------------------------------------------

    const emaSpread =
        Math.abs(
            ema9 -
            ema21
        );

    const emaSpreadATR =
        emaSpread /
        atr14;

    let regime =
        "RANGING";

    if (
        emaSpreadATR >= 0.60
    ) {

        regime =
            "TRENDING";

    } else if (
        emaSpreadATR <= 0.20
    ) {

        regime =
            "RANGING";
    }


    // --------------------------------------------------
    // VWAP
    // --------------------------------------------------

    const vwapDistance =
        close -
        vwapValue;

    const vwapDistanceATR =
        vwapDistance /
        atr14;


    // --------------------------------------------------
    // EMA DISTANCE
    // --------------------------------------------------

    const ema9Distance =
        close -
        ema9;

    const ema9DistanceATR =
        ema9Distance /
        atr14;

    const ema21Distance =
        close -
        ema21;

    const ema21DistanceATR =
        ema21Distance /
        atr14;


    // --------------------------------------------------
    // VOLATILITY
    // --------------------------------------------------

    const rangeATR =
        candleInfo.range /
        atr14;


    // --------------------------------------------------
    // TIME
    // --------------------------------------------------

    const minutes =
        getISTMinutes(
            candle.ts
        );

    const hour =
        Math.floor(
            minutes / 60
        );

    const minute =
        minutes % 60;


    // --------------------------------------------------
    // RSI MOMENTUM
    // --------------------------------------------------

    const rsiChange =
        Number.isFinite(previousRSI)
            ? rsi14 - previousRSI
            : 0;


    // --------------------------------------------------
    // RETURN FEATURE VECTOR
    // --------------------------------------------------

    return {

        timestamp:
            candle.ts,

        date:
            getISTDate(candle.ts),

        open:
            Number(candle.o),

        high:
            Number(candle.h),

        low:
            Number(candle.l),

        close,

        volume:
            Number(candle.v),

        // ----------------------------------------------
        // INDICATORS
        // ----------------------------------------------

        ema9,

        ema21,

        emaSpread,

        emaSpreadATR,

        ema9Slope,

        ema21Slope,

        ema9SlopeATR:
            ema9Slope / atr14,

        ema21SlopeATR:
            ema21Slope / atr14,

        rsi14,

        previousRSI,

        rsiChange,

        atr14,

        vwap:
            vwapValue,

        vwapDistance,

        vwapDistanceATR,

        // ----------------------------------------------
        // PRICE STRUCTURE
        // ----------------------------------------------

        ema9Distance,

        ema9DistanceATR,

        ema21Distance,

        ema21DistanceATR,

        range:
            candleInfo.range,

        rangeATR,

        body:
            candleInfo.body,

        bodyRatio:
            candleInfo.bodyRatio,

        upperWick:
            candleInfo.upperWick,

        lowerWick:
            candleInfo.lowerWick,

        upperWickRatio:
            candleInfo.upperWickRatio,

        lowerWickRatio:
            candleInfo.lowerWickRatio,

        closeLocation:
            candleInfo.closeLocation,

        bullish:
            candleInfo.bullish,

        bearish:
            candleInfo.bearish,

        // ----------------------------------------------
        // MARKET STATE
        // ----------------------------------------------

        trend,

        regime,

        // ----------------------------------------------
        // TIME
        // ----------------------------------------------

        hour,

        minute,

        minutesFromOpen:
            minutes -
            (
                9 * 60 + 15
            )

    };
}


// ======================================================
// FUTURE OUTCOME
// ======================================================

function calculateOutcome(
    candles,
    index,
    features
) {

    if (
        !features
    ) {
        return null;
    }

    const entryIndex =
        index + 1;

    const finalIndex =
        Math.min(
            candles.length - 1,
            index +
            CONFIG.FUTURE_CANDLES
        );

    if (
        entryIndex >= candles.length ||
        finalIndex <= entryIndex
    ) {
        return null;
    }


    // --------------------------------------------------
    // ENTRY
    // --------------------------------------------------

    const entry =
        Number(
            candles[entryIndex].o
        );

    if (
        !Number.isFinite(entry)
    ) {
        return null;
    }


    // --------------------------------------------------
    // RISK
    // --------------------------------------------------

    const risk =
        features.atr14 *
        CONFIG.ATR_STOP_MULTIPLIER;

    const reward =
        risk *
        CONFIG.RISK_REWARD;


    // --------------------------------------------------
    // BUY
    // --------------------------------------------------

    const buyStop =
        entry -
        risk;

    const buyTarget =
        entry +
        reward;


    // --------------------------------------------------
    // SELL
    // --------------------------------------------------

    const sellStop =
        entry +
        risk;

    const sellTarget =
        entry -
        reward;


    let buyHit =
        false;

    let sellHit =
        false;

    let buyStopHit =
        false;

    let sellStopHit =
        false;

    let buyTargetIndex =
        null;

    let sellTargetIndex =
        null;

    let buyStopIndex =
        null;

    let sellStopIndex =
        null;


    // --------------------------------------------------
    // FUTURE PATH
    // --------------------------------------------------

    for (
        let j = entryIndex;
        j <= finalIndex;
        j++
    ) {

        const future =
            candles[j];

        const high =
            Number(future.h);

        const low =
            Number(future.l);


        // BUY

        if (
            !buyTargetIndex &&
            high >= buyTarget
        ) {

            buyTargetIndex =
                j;
        }

        if (
            !buyStopIndex &&
            low <= buyStop
        ) {

            buyStopIndex =
                j;
        }


        // SELL

        if (
            !sellTargetIndex &&
            low <= sellTarget
        ) {

            sellTargetIndex =
                j;
        }

        if (
            !sellStopIndex &&
            high >= sellStop
        ) {

            sellStopIndex =
                j;
        }
    }


    buyHit =
        Number.isFinite(
            buyTargetIndex
        );

    sellHit =
        Number.isFinite(
            sellTargetIndex
        );

    buyStopHit =
        Number.isFinite(
            buyStopIndex
        );

    sellStopHit =
        Number.isFinite(
            sellStopIndex
        );


    // --------------------------------------------------
    // DETERMINE BUY OUTCOME
    // --------------------------------------------------

    let buyOutcome =
        "TIMEOUT";

    let buyOutcomeIndex =
        null;

    if (
        buyHit &&
        buyStopHit
    ) {

        if (
            buyTargetIndex <
            buyStopIndex
        ) {

            buyOutcome =
                "WIN";

            buyOutcomeIndex =
                buyTargetIndex;

        } else {

            buyOutcome =
                "LOSS";

            buyOutcomeIndex =
                buyStopIndex;
        }

    } else if (
        buyHit
    ) {

        buyOutcome =
            "WIN";

        buyOutcomeIndex =
            buyTargetIndex;

    } else if (
        buyStopHit
    ) {

        buyOutcome =
            "LOSS";

        buyOutcomeIndex =
            buyStopIndex;
    }


    // --------------------------------------------------
    // DETERMINE SELL OUTCOME
    // --------------------------------------------------

    let sellOutcome =
        "TIMEOUT";

    let sellOutcomeIndex =
        null;

    if (
        sellHit &&
        sellStopHit
    ) {

        if (
            sellTargetIndex <
            sellStopIndex
        ) {

            sellOutcome =
                "WIN";

            sellOutcomeIndex =
                sellTargetIndex;

        } else {

            sellOutcome =
                "LOSS";

            sellOutcomeIndex =
                sellStopIndex;
        }

    } else if (
        sellHit
    ) {

        sellOutcome =
            "WIN";

        sellOutcomeIndex =
            sellTargetIndex;

    } else if (
        sellStopHit
    ) {

        sellOutcome =
            "LOSS";

        sellOutcomeIndex =
            sellStopIndex;
    }


    // --------------------------------------------------
    // MFE / MAE
    // --------------------------------------------------

    let maxHigh =
        entry;

    let minLow =
        entry;

    for (
        let j = entryIndex;
        j <= finalIndex;
        j++
    ) {

        maxHigh =
            Math.max(
                maxHigh,
                Number(
                    candles[j].h
                )
            );

        minLow =
            Math.min(
                minLow,
                Number(
                    candles[j].l
                )
            );
    }


    const maxFavorableBuy =
        maxHigh -
        entry;

    const maxAdverseBuy =
        entry -
        minLow;

    const maxFavorableSell =
        entry -
        minLow;

    const maxAdverseSell =
        maxHigh -
        entry;


    // --------------------------------------------------
    // LABEL
    // --------------------------------------------------

    let preferredDirection =
        "NONE";

    let label =
        "NO_TRADE";

    if (
        buyOutcome === "WIN" &&
        sellOutcome !== "WIN"
    ) {

        preferredDirection =
            "BUY";

        label =
            "BUY_WIN";

    } else if (
        sellOutcome === "WIN" &&
        buyOutcome !== "WIN"
    ) {

        preferredDirection =
            "SELL";

        label =
            "SELL_WIN";

    } else if (
        buyOutcome === "LOSS" &&
        sellOutcome === "LOSS"
    ) {

        label =
            "BOTH_LOSS";

    } else if (
        buyOutcome === "TIMEOUT" &&
        sellOutcome === "TIMEOUT"
    ) {

        label =
            "NO_TRADE";
    }


    return {

        entryTimestamp:
            candles[entryIndex].ts,

        entryTime:
            new Date(
                candles[entryIndex].ts * 1000
            ).toISOString(),

        entry,

        risk,

        reward,

        buyStop,

        buyTarget,

        sellStop,

        sellTarget,

        buyOutcome,

        sellOutcome,

        preferredDirection,

        label,

        maxFavorableBuy,

        maxAdverseBuy,

        maxFavorableSell,

        maxAdverseSell,

        futureCandles:
            finalIndex -
            entryIndex +
            1,

        outcomeTimestamp:
            buyOutcomeIndex !== null
                ? candles[buyOutcomeIndex].ts
                : sellOutcomeIndex !== null
                    ? candles[sellOutcomeIndex].ts
                    : candles[finalIndex].ts
    };
}


// ======================================================
// DATASET GENERATOR
// ======================================================

function generateDataset(
    candles
) {

    const rows = [];

    let skipped = 0;

    for (
        let i =
            CONFIG.MIN_TRAINING_HISTORY;
        i <
            candles.length -
            CONFIG.FUTURE_CANDLES -
            1;
        i++
    ) {

        const features =
            calculateFeatures(
                candles,
                i
            );

        if (
            !features
        ) {

            skipped++;

            continue;
        }

        const outcome =
            calculateOutcome(
                candles,
                i,
                features
            );

        if (
            !outcome
        ) {

            skipped++;

            continue;
        }


        rows.push({

            ...features,

            outcome

        });
    }

    return {

        rows,

        skipped

    };
}


// ======================================================
// DATA QUALITY
// ======================================================

function analyzeDataQuality(
    candles
) {

    const timestamps =
        new Set();

    let duplicates = 0;

    let invalid = 0;

    const dates =
        new Set();

    for (
        const candle of candles
    ) {

        if (
            timestamps.has(
                candle.ts
            )
        ) {

            duplicates++;

        } else {

            timestamps.add(
                candle.ts
            );
        }

        if (
            !Number.isFinite(candle.o) ||
            !Number.isFinite(candle.h) ||
            !Number.isFinite(candle.l) ||
            !Number.isFinite(candle.c)
        ) {

            invalid++;
        }

        dates.add(
            getISTDate(
                candle.ts
            )
        );
    }

    return {

        duplicateCandles:
            duplicates,

        invalidCandles:
            invalid,

        tradingDays:
            dates.size,

        firstCandle:
            candles.length > 0
                ? {
                    timestamp:
                        candles[0].ts,

                    time:
                        new Date(
                            candles[0].ts * 1000
                        ).toISOString(),

                    date:
                        getISTDate(
                            candles[0].ts
                        ),

                    close:
                        candles[0].c
                }
                : null,

        lastCandle:
            candles.length > 0
                ? {
                    timestamp:
                        candles[
                            candles.length - 1
                        ].ts,

                    time:
                        new Date(
                            candles[
                                candles.length - 1
                            ].ts * 1000
                        ).toISOString(),

                    date:
                        getISTDate(
                            candles[
                                candles.length - 1
                            ].ts
                        ),

                    close:
                        candles[
                            candles.length - 1
                        ].c
                }
                : null
    };
}


// ======================================================
// DATASET STATISTICS
// ======================================================

function datasetStatistics(rows) {

    const stats = {

        totalRows:
            rows.length,

        BUY_WIN: 0,

        SELL_WIN: 0,

        BOTH_LOSS: 0,

        NO_TRADE: 0,

        buyWins: 0,

        buyLosses: 0,

        buyTimeouts: 0,

        sellWins: 0,

        sellLosses: 0,

        sellTimeouts: 0

    };


    for (
        const row of rows
    ) {

        stats[row.outcome.label] =
            (
                stats[row.outcome.label] || 0
            ) + 1;

        if (
            row.outcome.buyOutcome ===
            "WIN"
        ) {

            stats.buyWins++;

        } else if (
            row.outcome.buyOutcome ===
            "LOSS"
        ) {

            stats.buyLosses++;

        } else {

            stats.buyTimeouts++;
        }


        if (
            row.outcome.sellOutcome ===
            "WIN"
        ) {

            stats.sellWins++;

        } else if (
            row.outcome.sellOutcome ===
            "LOSS"
        ) {

            stats.sellLosses++;

        } else {

            stats.sellTimeouts++;
        }
    }


    stats.buyDecisiveTrades =
        stats.buyWins +
        stats.buyLosses;

    stats.sellDecisiveTrades =
        stats.sellWins +
        stats.sellLosses;


    stats.buyWinRate =
        stats.buyDecisiveTrades > 0
            ? (
                stats.buyWins /
                stats.buyDecisiveTrades
            ) * 100
            : 0;

    stats.sellWinRate =
        stats.sellDecisiveTrades > 0
            ? (
                stats.sellWins /
                stats.sellDecisiveTrades
            ) * 100
            : 0;


    return stats;
}


// ======================================================
// API HANDLER
// ======================================================

export default async function handler(
    req,
    res
) {

    try {

        // ==================================================
        // TOKEN
        // ==================================================

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


        // ==================================================
        // PARAMETERS
        // ==================================================

        const interval =
            req.query?.interval ||
            CONFIG.DEFAULT_INTERVAL;

        const requestedDays =
            Number(
                req.query?.days ||
                CONFIG.DEFAULT_DAYS
            );


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


        if (
            !Number.isFinite(
                requestedDays
            ) ||
            requestedDays < 1 ||
            requestedDays >
            CONFIG.MAX_DAYS
        ) {

            return res.status(400).json({

                success: false,

                version:
                    CONFIG.VERSION,

                error:
                    `days must be between 1 and ${CONFIG.MAX_DAYS}`

            });
        }


        // ==================================================
        // TIME WINDOW
        // ==================================================

        const endTime =
            Date.now();

        const startTime =
            endTime -
            (
                requestedDays *
                24 *
                60 *
                60 *
                1000
            );


        // ==================================================
        // API URL
        // ==================================================

        const scripCode =
            `NIDX_${CONFIG.NIFTY_ID}`;

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
            `${CONFIG.VERSION} LEARNING DATASET`
        );

        console.log(
            "Interval:",
            interval
        );

        console.log(
            "Days:",
            requestedDays
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
            "Raw candles:",
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
            "Normalized candles:",
            candles.length
        );


        // ==================================================
        // DATA QUALITY
        // ==================================================

        const dataQuality =
            analyzeDataQuality(
                candles
            );


        // ==================================================
        // INSUFFICIENT DATA
        // ==================================================

        if (
            candles.length <
            CONFIG.MIN_TRAINING_HISTORY +
            CONFIG.FUTURE_CANDLES +
            5
        ) {

            return res.status(200).json({

                success: true,

                version:
                    CONFIG.VERSION,

                status:
                    "INSUFFICIENT_DATA",

                interval,

                requestedDays,

                candlesTested:
                    candles.length,

                dataQuality,

                learningRows: 0,

                datasetStatistics: {},

                rows: []

            });
        }


        // ==================================================
        // GENERATE DATASET
        // ==================================================

        const dataset =
            generateDataset(
                candles
            );


        const statistics =
            datasetStatistics(
                dataset.rows
            );


        // ==================================================
        // LOG
        // ==================================================

        console.log(
            "================================"
        );

        console.log(
            `${CONFIG.VERSION} DATASET RESULT`
        );

        console.log(
            "Candles:",
            candles.length
        );

        console.log(
            "Learning rows:",
            dataset.rows.length
        );

        console.log(
            "Skipped:",
            dataset.skipped
        );

        console.log(
            "BUY wins:",
            statistics.buyWins
        );

        console.log(
            "BUY losses:",
            statistics.buyLosses
        );

        console.log(
            "BUY win rate:",
            statistics.buyWinRate
        );

        console.log(
            "SELL wins:",
            statistics.sellWins
        );

        console.log(
            "SELL losses:",
            statistics.sellLosses
        );

        console.log(
            "SELL win rate:",
            statistics.sellWinRate
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

            status:
                "COMPLETED",

            mode:
                "LEARNING_DATASET_ONLY",

            paperOnly:
                true,

            realOrders:
                false,

            instrument:
                "NIFTY 50",

            scripCode,

            interval,

            requestedDays,

            candlesTested:
                candles.length,

            firstCandle:
                dataQuality.firstCandle,

            lastCandle:
                dataQuality.lastCandle,

            tradingDays:
                dataQuality.tradingDays,

            dataQuality,

            learningRows:
                dataset.rows.length,

            skippedRows:
                dataset.skipped,

            datasetStatistics:
                statistics,

            featureList: [

                "timestamp",

                "date",

                "open",
                "high",
                "low",
                "close",
                "volume",

                "ema9",
                "ema21",

                "emaSpread",
                "emaSpreadATR",

                "ema9Slope",
                "ema21Slope",

                "ema9SlopeATR",
                "ema21SlopeATR",

                "rsi14",
                "previousRSI",
                "rsiChange",

                "atr14",

                "vwap",
                "vwapDistance",
                "vwapDistanceATR",

                "ema9Distance",
                "ema9DistanceATR",

                "ema21Distance",
                "ema21DistanceATR",

                "range",
                "rangeATR",

                "body",
                "bodyRatio",

                "upperWick",
                "lowerWick",

                "upperWickRatio",
                "lowerWickRatio",

                "closeLocation",

                "bullish",
                "bearish",

                "trend",
                "regime",

                "hour",
                "minute",

                "minutesFromOpen"

            ],

            rows:
                dataset.rows

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
                `${CONFIG.VERSION} learning dataset failed`,

            details:
                error?.message ||
                "Unknown error"

        });
    }
}
