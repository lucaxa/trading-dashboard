/*
TradeMind Pro
V9 Historical Data + Technical Indicator API

INDstocks → Vercel → Historical Candles → Indicators → V9 Backtest

Indicators:
- EMA 9
- EMA 21
- RSI 14
- VWAP
- ATR 14
- Swing High
- Swing Low
- Latest Candle
- Previous Candle

V9:
- Full historical candle array exposed
- Designed for historical backtesting
- Paper analysis only
- NO REAL ORDERS
*/


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


    let emaValue =
        values
            .slice(0, period)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / period;


    for (
        let i = period;
        i < values.length;
        i++
    ) {

        emaValue =
            (
                values[i] -
                emaValue
            ) * multiplier +
            emaValue;

    }


    return emaValue;

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


        if (change > 0) {

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
        100 / (1 + rs)
    );

}


// ======================================================
// IST DATE
// ======================================================

function istDate(ts) {

    const date =
        new Date(
            Number(ts) * 1000
        );


    return new Date(
        date.getTime() +
        (
            5.5 *
            60 *
            60 *
            1000
        )
    )
        .toISOString()
        .slice(0, 10);

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


    const latestCandle =
        candles[
            candles.length - 1
        ];


    const sessionDate =
        istDate(
            latestCandle.ts
        );


    const sessionCandles =
        candles.filter(
            candle =>
                istDate(candle.ts) ===
                sessionDate
        );


    let cumulativeTPV = 0;

    let cumulativeVolume = 0;


    for (
        const candle of sessionCandles
    ) {

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


        cumulativeTPV +=
            typicalPrice *
            volume;


        cumulativeVolume +=
            volume;

    }


    if (
        cumulativeVolume === 0
    ) {

        return null;

    }


    return (
        cumulativeTPV /
        cumulativeVolume
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
        Number(current.h);


    const low =
        Number(current.l);


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

        return (
            high -
            low
        );

    }


    const range1 =
        high - low;


    const range2 =
        Math.abs(
            high -
            previousClose
        );


    const range3 =
        Math.abs(
            low -
            previousClose
        );


    return Math.max(
        range1,
        range2,
        range3
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

        candles.length <
        period + 1

    ) {

        return null;

    }


    const trueRanges = [];


    for (
        let i = 1;
        i < candles.length;
        i++
    ) {

        const tr =
            trueRange(
                candles[i],
                candles[i - 1]
            );


        if (
            Number.isFinite(tr)
        ) {

            trueRanges.push(tr);

        }

    }


    if (
        trueRanges.length <
        period
    ) {

        return null;

    }


    let atrValue =
        trueRanges
            .slice(0, period)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / period;


    for (
        let i = period;
        i < trueRanges.length;
        i++
    ) {

        atrValue =
            (
                (
                    atrValue *
                    (period - 1)
                ) +
                trueRanges[i]
            ) / period;

    }


    return atrValue;

}


// ======================================================
// SWING HIGH
// ======================================================

function findSwingHigh(
    candles,
    lookback = 5
) {

    if (

        !Array.isArray(candles) ||

        candles.length <
        lookback

    ) {

        return null;

    }


    const recent =
        candles.slice(
            -lookback
        );


    let highest =
        -Infinity;


    let swingCandle =
        null;


    for (
        const candle of recent
    ) {

        const high =
            Number(candle.h);


        if (
            Number.isFinite(high) &&
            high > highest
        ) {

            highest =
                high;


            swingCandle =
                candle;

        }

    }


    if (
        !Number.isFinite(highest)
    ) {

        return null;

    }


    return {

        price:
            highest,

        ts:
            swingCandle?.ts ??
            null

    };

}


// ======================================================
// SWING LOW
// ======================================================

function findSwingLow(
    candles,
    lookback = 5
) {

    if (

        !Array.isArray(candles) ||

        candles.length <
        lookback

    ) {

        return null;

    }


    const recent =
        candles.slice(
            -lookback
        );


    let lowest =
        Infinity;


    let swingCandle =
        null;


    for (
        const candle of recent
    ) {

        const low =
            Number(candle.l);


        if (
            Number.isFinite(low) &&
            low < lowest
        ) {

            lowest =
                low;


            swingCandle =
                candle;

        }

    }


    if (
        !Number.isFinite(lowest)
    ) {

        return null;

    }


    return {

        price:
            lowest,

        ts:
            swingCandle?.ts ??
            null

    };

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


    const normalized =
        candles
            .map(candle => {

                if (
                    !candle ||
                    typeof candle !== "object"
                ) {

                    return null;

                }


                const ts =
                    Number(
                        candle.ts
                    );


                const o =
                    Number(
                        candle.o
                    );


                const h =
                    Number(
                        candle.h
                    );


                const l =
                    Number(
                        candle.l
                    );


                const c =
                    Number(
                        candle.c
                    );


                const v =
                    Number(
                        candle.v
                    );


                if (

                    !Number.isFinite(ts) ||

                    !Number.isFinite(o) ||

                    !Number.isFinite(h) ||

                    !Number.isFinite(l) ||

                    !Number.isFinite(c)

                ) {

                    return null;

                }


                return {

                    ts,
                    o,
                    h,
                    l,
                    c,

                    v:
                        Number.isFinite(v)
                            ? v
                            : 0

                };

            })


            .filter(
                candle =>
                    candle !== null
            );


    /*
    Ensure chronological order.

    This is VERY important for
    historical backtesting.
    */

    normalized.sort(
        (a, b) =>
            a.ts - b.ts
    );


    return normalized;

}


// ======================================================
// INDICATOR CALCULATION
// ======================================================

function calculateIndicators(
    rawCandles
) {

    const candles =
        normalizeCandles(
            rawCandles
        );


    if (
        candles.length === 0
    ) {

        return {

            candleCount: 0,

            candles: [],

            ema9: null,

            ema21: null,

            rsi14: null,

            vwap: null,

            atr14: null,

            swingHigh: null,

            swingLow: null,

            lastCandle: null,

            previousCandle: null

        };

    }


    // ==================================================
    // CLOSES
    // ==================================================

    const closes =
        candles.map(
            candle =>
                Number(candle.c)
        );


    // ==================================================
    // LAST CANDLE
    // ==================================================

    const lastCandle =
        candles[
            candles.length - 1
        ];


    // ==================================================
    // PREVIOUS CANDLE
    // ==================================================

    const previousCandle =
        candles.length >= 2

            ? candles[
                candles.length - 2
            ]

            : null;


    // ==================================================
    // INDICATORS
    // ==================================================

    const ema9Value =
        ema(
            closes,
            9
        );


    const ema21Value =
        ema(
            closes,
            21
        );


    const rsi14Value =
        rsi(
            closes,
            14
        );


    const vwapValue =
        vwap(
            candles
        );


    const atr14Value =
        atr(
            candles,
            14
        );


    const swingHigh =
        findSwingHigh(
            candles,
            5
        );


    const swingLow =
        findSwingLow(
            candles,
            5
        );


    // ==================================================
    // RESPONSE
    // ==================================================

    return {

        /*
        ==================================================
        IMPORTANT V9 ADDITION
        ==================================================

        The FULL historical candle
        array is now exposed.

        V9 backtest can replay these
        candles chronologically.
        */

        candles,

        candleCount:
            candles.length,

        ema9:
            ema9Value,

        ema21:
            ema21Value,

        rsi14:
            rsi14Value,

        vwap:
            vwapValue,

        atr14:
            atr14Value,

        swingHigh,

        swingLow,

        lastCandle,

        previousCandle

    };

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

                error:
                    "INDSTOCKS_TOKEN is not configured"

            });

        }


        // ==================================================
        // INTERVAL
        // ==================================================

        const interval =
            req.query.interval ||
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

                error:
                    "Invalid candle interval"

            });

        }


        // ==================================================
        // INSTRUMENT IDS
        // ==================================================

        const NIFTY_ID =
            "40000001";


        const BANKNIFTY_ID =
            "40000003";


        const scripCodes =
            `NIDX_${NIFTY_ID},NIDX_${BANKNIFTY_ID}`;


        // ==================================================
        // TIME RANGE
        // ==================================================

        const endTime =
            Date.now();


        /*
        Seven days gives us enough
        recent 5-minute candles for
        the V9 historical simulation.
        */

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
        // INDSTOCKS URL
        // ==================================================

        const url =
            "https://api.indstocks.com" +

            `/market/historical/${interval}` +

            `?scrip-codes=${encodeURIComponent(
                scripCodes
            )}` +

            `&start_time=${startTime}` +

            `&end_time=${endTime}`;


        console.log(
            "================================"
        );


        console.log(
            "TradeMind V9 historical request:"
        );


        console.log(
            url
        );


        // ==================================================
        // REQUEST INDSTOCKS
        // ==================================================

        const response =
            await fetch(
                url,
                {

                    method:
                        "GET",

                    headers: {

                        Authorization:
                            token

                    }

                }
            );


        const result =
            await response.json();


        // ==================================================
        // API ERROR
        // ==================================================

        if (
            !response.ok
        ) {

            console.error(
                "INDstocks historical error:",
                result
            );


            return res.status(
                response.status
            ).json({

                success: false,

                error:
                    result

            });

        }


        // ==================================================
        // RAW DATA
        // ==================================================

        const rawData =
            result.data;


        // ==================================================
        // NIFTY
        // ==================================================

        const niftyData =
            rawData?.NIDX_40000001;


        // ==================================================
        // BANKNIFTY
        // ==================================================

        const bankNiftyData =
            rawData?.NIDX_40000003;


        const rawNiftyCandles =
            Array.isArray(
                niftyData?.candles
            )
                ? niftyData.candles
                : [];


        const rawBankNiftyCandles =
            Array.isArray(
                bankNiftyData?.candles
            )
                ? bankNiftyData.candles
                : [];


        // ==================================================
        // NORMALIZE
        // ==================================================

        const niftyCandles =
            normalizeCandles(
                rawNiftyCandles
            );


        const bankNiftyCandles =
            normalizeCandles(
                rawBankNiftyCandles
            );


        // ==================================================
        // LOG COUNTS
        // ==================================================

        console.log(
            "TradeMind V9 candle counts:",
            {

                nifty:
                    niftyCandles.length,

                banknifty:
                    bankNiftyCandles.length

            }
        );


        // ==================================================
        // CALCULATE
        // ==================================================

        const nifty =
            calculateIndicators(
                niftyCandles
            );


        const banknifty =
            calculateIndicators(
                bankNiftyCandles
            );


        // ==================================================
        // V9 DATA VALIDATION
        // ==================================================

        const validation = {

            niftyCandles:
                nifty.candles.length,

            bankniftyCandles:
                banknifty.candles.length,

            niftyReady:
                nifty.candles.length >= 50,

            bankniftyReady:
                banknifty.candles.length >= 50

        };


        console.log(
            "TradeMind V9 validation:",
            validation
        );


        // ==================================================
        // FINAL RESPONSE
        // ==================================================

        return res.status(200).json({

            success: true,

            version:
                "V9",

            interval,

            startTime,

            endTime,

            validation,

            nifty,

            banknifty

        });

    }


    catch (error) {

        console.error(
            "TradeMind V9 Indicator API error:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                "Failed to fetch historical market data",

            details:
                error?.message ||
                "Unknown error"

        });

    }

}
