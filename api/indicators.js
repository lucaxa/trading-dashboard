/*
TradeMind Pro
V5 Technical Indicator API

INDstocks → Vercel → Indicators

Indicators:
- EMA 9
- EMA 21
- RSI 14
- VWAP

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

    let cumulativeTPV = 0;
    let cumulativeVolume = 0;

    for (
        const candle of candles
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

            lastCandle: null

        };

    }

    const closes =
        candles.map(
            candle =>
                Number(candle.c)
        );

    const lastCandle =
        candles[
            candles.length - 1
        ];

    return {

        candleCount:
            candles.length,

        ema9:
            ema(
                closes,
                9
            ),

        ema21:
            ema(
                closes,
                21
            ),

        rsi14:
            rsi(
                closes,
                14
            ),

        vwap:
            vwap(candles),

        lastCandle

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
        // EXTRACT BOTH INSTRUMENTS
        // =========================

        const niftyData =
            rawData?.NIDX_40000001;

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
