/*
TradeMind Pro
V10.20 Live Paper Signal API

INDstocks → Vercel
             ↓
      5-minute candles
             ↓
      V10.20 Engine
             ↓
       BUY / SELL / WAIT

IMPORTANT:
- PAPER ANALYSIS ONLY
- NO REAL ORDERS
- Uses the same V10.20 strategy engine
- Uses only completed candles
*/

import {
    CONFIG,
    normalizeCandles,
    calculateHistoricalIndicators,
    getSignal
} from "./backtest.js";


// ======================================================
// API HANDLER
// ======================================================

export default async function handler(req, res) {

    try {

        console.log("================================");
        console.log("🔥 V10.20 LIVE SIGNAL START");
        console.log("================================");


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
        // INTERVAL
        // ==================================================

        const interval =
            req.query?.interval ||
            "5minute";


        if (
            interval !== "5minute"
        ) {

            return res.status(400).json({

                success: false,

                version:
                    CONFIG.VERSION,

                error:
                    "Live paper engine currently supports 5minute candles only"

            });

        }


        // ==================================================
        // NIFTY
        // ==================================================

        const NIFTY_ID =
            "40000001";


        const scripCode =
            `NIDX_${NIFTY_ID}`;


        // ==================================================
        // HISTORICAL WINDOW
        // ==================================================

        /*
        We fetch several days of candles because
        V10.20 requires historical context for:

        EMA
        RSI
        ATR
        VWAP
        EMA slopes
        RSI recovery
        trend acceleration
        */

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
        // INDSTOCKS URL
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
            "V10.20 live request:",
            url
        );


        // ==================================================
        // FETCH INDSTOCKS
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
            "V10.20 INDstocks response:",
            JSON.stringify(
                result
            ).slice(
                0,
                3000
            )
        );


        // ==================================================
        // INDSTOCKS ERROR
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
        // EXTRACT NIFTY CANDLES
        // ==================================================

        let rawCandles = [];


        const direct =
            result
                ?.data
                ?.NIDX_40000001
                ?.candles;


        if (
            Array.isArray(direct)
        ) {

            rawCandles =
                direct;

        }


        // --------------------------------------------------
        // Fallback
        // --------------------------------------------------

        if (
            !rawCandles.length &&
            Array.isArray(
                result?.candles
            )
        ) {

            rawCandles =
                result.candles;

        }


        // --------------------------------------------------
        // Additional fallback
        // --------------------------------------------------

        if (
            !rawCandles.length &&
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
                    lower.includes(
                        "40000001"
                    ) ||
                    lower.includes(
                        "nidx_40000001"
                    ) ||
                    lower === "nifty" ||
                    lower === "nifty50"
                ) {

                    const block =
                        result.data[key];


                    if (
                        Array.isArray(block)
                    ) {

                        rawCandles =
                            block;

                        break;

                    }


                    if (
                        Array.isArray(
                            block?.candles
                        )
                    ) {

                        rawCandles =
                            block.candles;

                        break;

                    }


                    if (
                        Array.isArray(
                            block?.data
                        )
                    ) {

                        rawCandles =
                            block.data;

                        break;

                    }

                }

            }

        }


        console.log(
            "🔥 Raw candles:",
            rawCandles.length
        );


        // ==================================================
        // NORMALIZE
        // ==================================================

        const candles =
            normalizeCandles(
                rawCandles
            );


        console.log(
            "🔥 Normalized candles:",
            candles.length
        );


        if (
            candles.length <
            CONFIG.EMA_SLOW + 10
        ) {

            return res.status(200).json({

                success: true,

                version:
                    CONFIG.VERSION,

                signal:
                    "WAIT",

                status:
                    "INSUFFICIENT_DATA",

                candlesAvailable:
                    candles.length,

                reason:
                    "Not enough historical candles for V10.20"

            });

        }


        // ==================================================
        // REMOVE CURRENTLY FORMING CANDLE
        // ==================================================

        /*
        IMPORTANT:

        We never generate a signal from a candle
        that is still forming.

        The latest candle is considered incomplete
        if it belongs to the current 5-minute period.
        */

        const now =
            Date.now();


        const currentEpoch =
            Math.floor(
                now / 1000
            );


        const FIVE_MINUTES =
            5 * 60;


        const latest =
            candles[
                candles.length - 1
            ];


        const latestBucket =
            Math.floor(
                latest.ts /
                FIVE_MINUTES
            ) *
            FIVE_MINUTES;


        const currentBucket =
            Math.floor(
                currentEpoch /
                FIVE_MINUTES
            ) *
            FIVE_MINUTES;


        let completedCandles =
            candles;


        if (
            latestBucket >=
            currentBucket
        ) {

            completedCandles =
                candles.slice(
                    0,
                    -1
                );


            console.log(
                "🔥 Removed currently forming candle"
            );

        }


        if (
            completedCandles.length <
            CONFIG.EMA_SLOW + 10
        ) {

            return res.status(200).json({

                success: true,

                version:
                    CONFIG.VERSION,

                signal:
                    "WAIT",

                status:
                    "INSUFFICIENT_COMPLETED_DATA",

                candlesAvailable:
                    completedCandles.length,

                reason:
                    "Not enough completed candles"

            });

        }


        // ==================================================
        // SIGNAL CANDLE
        // ==================================================

        const signalIndex =
            completedCandles.length - 1;


        const signalCandle =
            completedCandles[
                signalIndex
            ];


        const previousCandle =
            signalIndex > 0
                ? completedCandles[
                    signalIndex - 1
                ]
                : null;


        const previousPreviousCandle =
            signalIndex > 1
                ? completedCandles[
                    signalIndex - 2
                ]
                : null;


        console.log(
            "🔥 Signal candle:",
            signalCandle
        );


        // ==================================================
        // CALCULATE V10.20 INDICATORS
        // ==================================================

        const indicators =
            calculateHistoricalIndicators(

                completedCandles,

                signalIndex

            );


        if (
            !indicators
        ) {

            return res.status(200).json({

                success: true,

                version:
                    CONFIG.VERSION,

                signal:
                    "WAIT",

                status:
                    "INDICATORS_UNAVAILABLE",

                reason:
                    "V10.20 indicators could not be calculated"

            });

        }


        // ==================================================
        // V10.20 SIGNAL
        // ==================================================

        const signalResult =
            getSignal(

                signalCandle,

                indicators,

                previousCandle,

                previousPreviousCandle

            );


        console.log(
            "================================"
        );


        console.log(
            "🔥 V10.20 LIVE SIGNAL RESULT"
        );


        console.log(
            signalResult
        );


        console.log(
            "================================"
        );


        // ==================================================
        // RISK CALCULATION
        // ==================================================

        let risk = null;

        let stop = null;

        let target = null;


        if (
            signalResult.signal === "BUY" ||
            signalResult.signal === "SELL"
        ) {

            risk =
                indicators.atr14 *
                CONFIG.ATR_STOP_MULTIPLIER;


            /*
            IMPORTANT:

            This is the SIGNAL candle close.

            Actual V10.20 backtest entry is
            next candle OPEN.

            Therefore these are only
            reference levels at this stage.
            */

            const referenceEntry =
                Number(
                    signalCandle.c
                );


            if (
                signalResult.signal === "BUY"
            ) {

                stop =
                    referenceEntry -
                    risk;

                target =
                    referenceEntry +
                    (
                        risk *
                        CONFIG.RISK_REWARD
                    );

            }

            else {

                stop =
                    referenceEntry +
                    risk;

                target =
                    referenceEntry -
                    (
                        risk *
                        CONFIG.RISK_REWARD
                    );

            }

        }


        // ==================================================
        // RESPONSE
        // ==================================================

        return res.status(200).json({

            success: true,

            version:
                CONFIG.VERSION,

            strategy:
                "V10.20",

            mode:
                "PAPER_ONLY",

            instrument:
                "NIFTY 50",

            interval:
                "5minute",

            status:
                "LIVE",

            signal:
                signalResult.signal,

            buyScore:
                signalResult.buyScore,

            sellScore:
                signalResult.sellScore,

            reason:
                signalResult.reason,

            diagnostics:
                signalResult.diagnostics,

            indicators: {

                ema9:
                    indicators.ema9,

                ema21:
                    indicators.ema21,

                ema9Slope:
                    indicators.ema9Slope,

                ema21Slope:
                    indicators.ema21Slope,

                previousEma9Slope:
                    indicators.previousEma9Slope,

                emaSpread:
                    indicators.emaSpread,

                rsi14:
                    indicators.rsi14,

                previousRSI:
                    indicators.previousRSI,

                previousPreviousRSI:
                    indicators.previousPreviousRSI,

                atr14:
                    indicators.atr14,

                vwap:
                    indicators.vwap,

                directionalStrength:
                    indicators.directionalStrength

            },

            signalCandle: {

                ts:
                    signalCandle.ts,

                open:
                    signalCandle.o,

                high:
                    signalCandle.h,

                low:
                    signalCandle.l,

                close:
                    signalCandle.c,

                volume:
                    signalCandle.v

            },

            referenceRisk: {

                entry:
                    signalResult.signal !== "WAIT"
                        ? signalCandle.c
                        : null,

                stop,

                target,

                risk,

                rewardRisk:
                    signalResult.signal !== "WAIT"
                        ? CONFIG.RISK_REWARD
                        : null

            },

            data: {

                rawCandles:
                    rawCandles.length,

                completedCandles:
                    completedCandles.length,

                signalTimestamp:
                    signalCandle.ts,

                signalTime:
                    new Date(
                        signalCandle.ts * 1000
                    ).toISOString()

            }

        });

    }

    catch (error) {

        console.error(
            "🔥 V10.20 LIVE SIGNAL ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            version:
                CONFIG.VERSION,

            error:
                "V10.20 live signal failed",

            details:
                error?.message ||
                "Unknown error"

        });

    }

}
