/*
TradeMind Pro
V6 Technical Indicator API

INDstocks → Vercel → Indicators

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

Paper analysis only.
No orders are placed.
*/


// =========================
// EMA
// =========================

function ema(values, period) {

    if (values.length < period) {
        return null;
    }

    const multiplier =
        2 / (period + 1);

    let emaValue =
        values
            .slice(0, period)
            .reduce(
                (sum, value) => sum + value,
                0
            ) / period;

    for (
        let i = period;
        i < values.length;
        i++
    ) {

        emaValue =
            (
                values[i] - emaValue
            ) * multiplier +
            emaValue;

    }

    return emaValue;
}


// =========================
// RSI
// =========================

function rsi(
    values,
    period = 14
) {

    if (
        values.length <
        period + 1
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


// =========================
// VWAP
// =========================

function vwap(candles) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        return null;

    }


    /*
    Use the most recent
    trading session.

    Candle timestamps are
    Unix seconds.

    Convert to IST.
    */

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


    const latestCandle =
        candles[
            candles.length - 1
        ];


    const sessionDate =
        istDate(
            latestCandle.ts
        );


    /*
    Keep only candles
    from latest session.
    */

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


// =========================
// TRUE RANGE
// =========================

function trueRange(
    current,
    previous
) {

    const high =
        Number(current.h);

    const low =
        Number(current.l);

    const previousClose =
        Number(previous.c);


    if (

        !Number.isFinite(high) ||

        !Number.isFinite(low)

    ) {

        return null;

    }


    /*
    First candle or missing
    previous close.

    */

    if (
        !Number.isFinite(
            previousClose
        )
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


// =========================
// ATR
// =========================

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


    /*
    Initial ATR:
    Simple average of the
    first 14 True Ranges.
    */

    let atrValue =
        trueRanges
            .slice(0, period)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / period;


    /*
    Wilder smoothing.
    */

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


// =========================
// SWING HIGH
// =========================

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


    /*
    Look at recent candles
    and find the highest high.

    This is intentionally simple
    for the first V6 version.
    */

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

        price: highest,

        ts:
            swingCandle?.ts ??
            null

    };

}


// =========================
// SWING LOW
// =========================

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


    /*
    Look at recent candles
    and find the lowest low.
    */

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

        price: lowest,

        ts:
            swingCandle?.ts ??
            null

    };

}


// =========================
// INDICATOR CALCULATION
// =========================

function calculateIndicators(
    candles
) {

    if (

        !Array.isArray(candles) ||

        candles.length === 0

    ) {

        return {

            candleCount: 0,

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


    // ---------------------------------
    // CLOSES
    // ---------------------------------

    const closes =
        candles.map(
            candle =>
                Number(candle.c)
        );


    // ---------------------------------
    // LAST CANDLES
    // ---------------------------------

    const lastCandle =
        candles[
            candles.length - 1
        ];


    const previousCandle =
        candles.length >= 2

            ? candles[
                candles.length - 2
            ]

            : null;


    // ---------------------------------
    // CALCULATIONS
    // ---------------------------------

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


    // ---------------------------------
    // RESPONSE
    // ---------------------------------

    return {

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


// =========================
// API HANDLER
// =========================

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

                error:
                    "INDSTOCKS_TOKEN is not configured"

            });

        }


        // =========================
        // INTERVAL
        // =========================

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


        // =========================
        // INSTRUMENTS
        // =========================

        const NIFTY_ID =
            "40000001";


        const BANKNIFTY_ID =
            "40000003";


        const scripCodes =

            `NIDX_${NIFTY_ID},NIDX_${BANKNIFTY_ID}`;


        // =========================
        // TIME RANGE
        // =========================

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


        // =========================
        // INDSTOCKS REQUEST
        // =========================

        const url =

            "https://api.indstocks.com" +

            `/market/historical/${interval}` +

            `?scrip-codes=${encodeURIComponent(
                scripCodes
            )}` +

            `&start_time=${startTime}` +

            `&end_time=${endTime}`;


        console.log(
            "TradeMind historical request:",
            url
        );


        const response =

            await fetch(

                url,

                {

                    method: "GET",

                    headers: {

                        Authorization:
                            token

                    }

                }

            );


        const result =
            await response.json();


        if (!response.ok) {

            console.error(
                "INDstocks historical error:",
                result
            );


            return res.status(
                response.status
            ).json({

                success: false,

                error: result

            });

        }


        const rawData =
            result.data;


        // =========================
        // EXTRACT NIFTY
        // =========================

        const niftyData =
            rawData?.NIDX_40000001;


        // =========================
        // EXTRACT BANKNIFTY
        // =========================

        const bankNiftyData =
            rawData?.NIDX_40000003;


        const niftyCandles =

            Array.isArray(
                niftyData?.candles
            )

                ? niftyData.candles

                : [];


        const bankNiftyCandles =

            Array.isArray(
                bankNiftyData?.candles
            )

                ? bankNiftyData.candles

                : [];


        console.log(

            "TradeMind candle counts:",

            {

                nifty:
                    niftyCandles.length,

                banknifty:
                    bankNiftyCandles.length

            }

        );


        // =========================
        // CALCULATE
        // =========================

        const nifty =
            calculateIndicators(
                niftyCandles
            );


        const banknifty =
            calculateIndicators(
                bankNiftyCandles
            );


        // =========================
        // RESPONSE
        // =========================

        return res.status(200).json({

            success: true,

            version:
                "V6",

            interval,

            startTime,

            endTime,

            nifty,

            banknifty

        });

    }


    catch (error) {

        console.error(

            "Indicator API error:",

            error

        );


        return res.status(500).json({

            success: false,

            error:
                "Failed to calculate indicators"

        });

    }

}
