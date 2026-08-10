/*
============================================================
TradeMind Pro
V11.1 LEARNING DATASET ENGINE
============================================================

PURPOSE
------------------------------------------------------------
Build a large historical learning dataset for NIFTY 50.

V11.1 improvements:
- Multi-request historical download
- 6-day chunks
- 30-day default dataset
- Robust INDstocks candle extraction
- Timestamp normalization
- Duplicate removal
- OHLCV validation
- Technical feature generation
- Future outcome generation
- BUY / SELL outcome labels
- Market regime classification
- IST session/time features

IMPORTANT
------------------------------------------------------------
PAPER / LEARNING DATA ONLY
NO REAL ORDERS
NO ORDER API
NO LIVE TRADING

============================================================
*/


// ==========================================================
// API HANDLER
// ==========================================================

export default async function handler(req, res) {

    try {

        // ==================================================
        // CONFIG
        // ==================================================

        const VERSION = "V11.1";

        const TOKEN =
            process.env.INDSTOCKS_TOKEN;

        if (!TOKEN) {

            return res.status(500).json({

                success: false,

                version: VERSION,

                error:
                    "INDSTOCKS_TOKEN is not configured",

                mode:
                    "LEARNING_DATASET_ONLY",

                paperOnly: true,

                realOrders: false

            });

        }


        // ==================================================
        // REQUEST PARAMETERS
        // ==================================================

        const interval =
            String(
                req.query?.interval ||
                "5minute"
            );


        let requestedDays =
            Number(
                req.query?.days ||
                30
            );


        if (
            !Number.isFinite(
                requestedDays
            )
        ) {

            requestedDays = 30;

        }


        requestedDays =
            Math.min(
                Math.max(
                    Math.floor(
                        requestedDays
                    ),
                    1
                ),
                60
            );


        // ==================================================
        // SUPPORTED INTERVALS
        // ==================================================

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
            "240minute"

        ];


        if (
            !allowedIntervals.includes(
                interval
            )
        ) {

            return res.status(400).json({

                success: false,

                version: VERSION,

                error:
                    "Invalid interval",

                allowedIntervals

            });

        }


        // ==================================================
        // NIFTY 50
        // ==================================================

        const NIFTY_ID =
            "40000001";


        const scripCode =
            `NIDX_${NIFTY_ID}`;


        const instrument =
            "NIFTY 50";


        // ==================================================
        // BASE API
        // ==================================================

        const BASE_URL =
            "https://api.indstocks.com";


        // ==================================================
        // CHUNK SIZE
        //
        // INDstocks allows up to 7 days for 5-minute data.
        // We intentionally use 6 days.
        // ==================================================

        const CHUNK_DAYS = 6;


        const DAY_MS =
            24 *
            60 *
            60 *
            1000;


        const CHUNK_MS =
            CHUNK_DAYS *
            DAY_MS;


        // ==================================================
        // HELPER
        // ==================================================

        function sleep(ms) {

            return new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        ms
                    )
            );

        }


        // ==================================================
        // TIMESTAMP NORMALIZATION
        // ==================================================

        function normalizeTimestamp(
            value
        ) {

            let timestamp =
                Number(value);


            if (
                !Number.isFinite(
                    timestamp
                )
            ) {

                return null;

            }


            /*
            Official INDstocks documentation
            uses milliseconds.

            Our previous working response
            contained second-based values.

            Therefore this function safely
            supports both formats.
            */

            if (
                timestamp <
                100000000000
            ) {

                timestamp *= 1000;

            }


            return timestamp;

        }


        // ==================================================
        // IST DATE
        // ==================================================

        function getISTDate(
            timestamp
        ) {

            const date =
                new Date(
                    timestamp +
                    (
                        5.5 *
                        60 *
                        60 *
                        1000
                    )
                );


            return date
                .toISOString()
                .slice(
                    0,
                    10
                );

        }


        // ==================================================
        // IST TIME
        // ==================================================

        function getISTTime(
            timestamp
        ) {

            const date =
                new Date(
                    timestamp +
                    (
                        5.5 *
                        60 *
                        60 *
                        1000
                    )
                );


            return {

                hour:
                    date.getUTCHours(),

                minute:
                    date.getUTCMinutes()

            };

        }


        // ==================================================
        // VALIDATE RAW CANDLE
        // ==================================================

        function validRawCandle(
            candle
        ) {

            if (
                !Array.isArray(
                    candle
                )
            ) {

                return false;

            }


            if (
                candle.length <
                6
            ) {

                return false;

            }


            const timestamp =
                normalizeTimestamp(
                    candle[0]
                );


            const open =
                Number(
                    candle[1]
                );


            const high =
                Number(
                    candle[2]
                );


            const low =
                Number(
                    candle[3]
                );


            const close =
                Number(
                    candle[4]
                );


            const volume =
                Number(
                    candle[5]
                );


            if (
                !Number.isFinite(
                    timestamp
                )
            ) {

                return false;

            }


            if (
                !Number.isFinite(
                    open
                )
            ) {

                return false;

            }


            if (
                !Number.isFinite(
                    high
                )
            ) {

                return false;

            }


            if (
                !Number.isFinite(
                    low
                )
            ) {

                return false;

            }


            if (
                !Number.isFinite(
                    close
                )
            ) {

                return false;

            }


            if (
                !Number.isFinite(
                    volume
                )
            ) {

                return false;

            }


            if (
                high < low
            ) {

                return false;

            }


            return true;

        }


        // ==================================================
        // NORMALIZE CANDLE
        // ==================================================

        function normalizeCandle(
            candle
        ) {

            const timestamp =
                normalizeTimestamp(
                    candle[0]
                );


            return {

                timestamp,

                date:
                    getISTDate(
                        timestamp
                    ),

                open:
                    Number(
                        candle[1]
                    ),

                high:
                    Number(
                        candle[2]
                    ),

                low:
                    Number(
                        candle[3]
                    ),

                close:
                    Number(
                        candle[4]
                    ),

                volume:
                    Number(
                        candle[5]
                    )

            };

        }


        // ==================================================
        // ROBUST CANDLE EXTRACTION
        // ==================================================

        function extractCandles(
            result
        ) {

            const directCandidates = [

                result
                    ?.data
                    ?.candles,

                result
                    ?.candles,

                result
                    ?.data
                    ?.NIDX_40000001
                    ?.candles,

                result
                    ?.data
                    ?.[scripCode]
                    ?.candles,

                result
                    ?.data
                    ?.NIDX_40000001,

                result
                    ?.data
                    ?.[scripCode],

                result
                    ?.data
                    ?.NIDX_40000001
                    ?.data,

                result
                    ?.data
                    ?.[scripCode]
                    ?.data

            ];


            for (
                const candidate
                of directCandidates
            ) {

                if (
                    Array.isArray(
                        candidate
                    ) &&
                    candidate.length > 0
                ) {

                    return candidate;

                }

            }


            // ==================================================
            // RECURSIVE SEARCH
            // ==================================================

            function recursiveSearch(
                node,
                depth = 0
            ) {

                if (
                    depth > 6
                ) {

                    return [];

                }


                if (
                    Array.isArray(
                        node
                    )
                ) {

                    /*
                    Candle arrays look like:

                    [
                        timestamp,
                        open,
                        high,
                        low,
                        close,
                        volume
                    ]
                    */

                    if (
                        node.length > 0 &&
                        Array.isArray(
                            node[0]
                        ) &&
                        node[0].length >= 6
                    ) {

                        return node;

                    }


                    return [];

                }


                if (
                    !node ||
                    typeof node !==
                    "object"
                ) {

                    return [];

                }


                const keys =
                    Object.keys(
                        node
                    );


                /*
                Prefer candle-related keys.
                */

                const preferredKeys =
                    keys.filter(
                        key => {

                            const lower =
                                key.toLowerCase();

                            return (
                                lower.includes(
                                    "candle"
                                ) ||
                                lower.includes(
                                    "nidx"
                                ) ||
                                lower.includes(
                                    "40000001"
                                ) ||
                                lower ===
                                    "data"
                            );

                        }
                    );


                const remainingKeys =
                    keys.filter(
                        key =>
                            !preferredKeys.includes(
                                key
                            )
                    );


                const orderedKeys =
                    [
                        ...preferredKeys,
                        ...remainingKeys
                    ];


                for (
                    const key
                    of orderedKeys
                ) {

                    const found =
                        recursiveSearch(
                            node[key],
                            depth + 1
                        );


                    if (
                        found.length > 0
                    ) {

                        return found;

                    }

                }


                return [];

            }


            return recursiveSearch(
                result
            );

        }


        // ==================================================
        // FETCH ONE CHUNK
        // ==================================================

        async function fetchChunk(
            startTime,
            endTime
        ) {

            const url =
                BASE_URL +
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
                `${VERSION} CHUNK REQUEST`
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
                "Start:",
                new Date(
                    startTime
                ).toISOString()
            );


            console.log(
                "End:",
                new Date(
                    endTime
                ).toISOString()
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
                                TOKEN,

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
                    JSON.parse(
                        text
                    );

            } catch {

                throw new Error(
                    "INDstocks returned invalid JSON: " +
                    text.slice(
                        0,
                        1000
                    )
                );

            }


            console.log(
                `${VERSION} HTTP STATUS:`,
                response.status
            );


            if (
                !response.ok
            ) {

                throw new Error(
                    `INDstocks HTTP ${response.status}: ` +
                    JSON.stringify(
                        result
                    )
                );

            }


            const candles =
                extractCandles(
                    result
                );


            console.log(
                `${VERSION} EXTRACTED CANDLES:`,
                candles.length
            );


            /*
            Debug only.

            This helps us identify the actual
            response structure if extraction
            fails again.
            */

            if (
                candles.length === 0
            ) {

                console.log(
                    `${VERSION} NO CANDLES FOUND`
                );


                console.log(
                    `${VERSION} RESPONSE PREVIEW:`,
                    JSON.stringify(
                        result
                    ).slice(
                        0,
                        5000
                    )
                );

            }


            return candles;

        }


        // ==================================================
        // HISTORICAL WINDOW
        // ==================================================

        const endTime =
            Date.now();


        const requestedStartTime =
            endTime -
            (
                requestedDays *
                DAY_MS
            );


        // ==================================================
        // FETCH ALL CHUNKS
        // ==================================================

        const allRawCandles = [];


        const chunkInformation = [];


        let chunkEnd =
            endTime;


        let chunksRequested =
            0;


        while (
            chunkEnd >
            requestedStartTime
        ) {

            const chunkStart =
                Math.max(
                    requestedStartTime,
                    chunkEnd -
                    CHUNK_MS
                );


            chunksRequested++;


            try {

                const chunkCandles =
                    await fetchChunk(
                        chunkStart,
                        chunkEnd
                    );


                allRawCandles.push(
                    ...chunkCandles
                );


                chunkInformation.push({

                    start:
                        new Date(
                            chunkStart
                        ).toISOString(),

                    end:
                        new Date(
                            chunkEnd
                        ).toISOString(),

                    candles:
                        chunkCandles.length

                });


            } catch (
                error
            ) {

                console.error(
                    `${VERSION} CHUNK ERROR:`,
                    error
                );


                return res.status(502).json({

                    success: false,

                    version: VERSION,

                    error:
                        "Historical data fetch failed",

                    details:
                        error?.message ||
                        "Unknown error",

                    failedChunk: {

                        start:
                            new Date(
                                chunkStart
                            ).toISOString(),

                        end:
                            new Date(
                                chunkEnd
                            ).toISOString()

                    },

                    chunksCompleted:
                        chunkInformation,

                    mode:
                        "LEARNING_DATASET_ONLY",

                    paperOnly: true,

                    realOrders: false

                });

            }


            /*
            Small pause to avoid sending
            requests back-to-back.
            */

            await sleep(
                150
            );


            chunkEnd =
                chunkStart;

        }


        // ==================================================
        // RAW DATA QUALITY
        // ==================================================

        const rawCandleCount =
            allRawCandles.length;


        const validRawCandles =
            allRawCandles.filter(
                validRawCandle
            );


        const invalidCandles =
            rawCandleCount -
            validRawCandles.length;


        // ==================================================
        // NORMALIZE + DEDUPLICATE
        // ==================================================

        const candleMap =
            new Map();


        for (
            const raw
            of validRawCandles
        ) {

            const normalized =
                normalizeCandle(
                    raw
                );


            /*
            Timestamp is the unique candle
            identifier.
            */

            candleMap.set(
                normalized.timestamp,
                normalized
            );

        }


        const duplicateCandles =
            validRawCandles.length -
            candleMap.size;


        const candles =
            Array.from(
                candleMap.values()
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.timestamp -
                    b.timestamp
            );


        // ==================================================
        // TRADING DAYS
        // ==================================================

        const tradingDaySet =
            new Set();


        for (
            const candle
            of candles
        ) {

            tradingDaySet.add(
                candle.date
            );

        }


        const tradingDays =
            tradingDaySet.size;


        // ==================================================
        // INDICATOR FUNCTIONS
        // ==================================================

        function ema(
            values,
            period
        ) {

            if (
                !Array.isArray(
                    values
                ) ||
                values.length <
                period
            ) {

                return null;

            }


            const multiplier =
                2 /
                (
                    period +
                    1
                );


            let value =
                values
                    .slice(
                        0,
                        period
                    )
                    .reduce(
                        (
                            sum,
                            item
                        ) =>
                            sum +
                            Number(
                                item
                            ),
                        0
                    ) /
                    period;


            for (
                let i =
                    period;
                i <
                    values.length;
                i++
            ) {

                const current =
                    Number(
                        values[i]
                    );


                value =
                    (
                        (
                            current -
                            value
                        ) *
                        multiplier
                    ) +
                    value;

            }


            return value;

        }


        // ==================================================
        // RSI
        // ==================================================

        function rsi(
            values,
            period = 14
        ) {

            if (
                !Array.isArray(
                    values
                ) ||
                values.length <
                    period +
                    1
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
                    Number(
                        values[i]
                    ) -
                    Number(
                        values[
                            i - 1
                        ]
                    );


                if (
                    change > 0
                ) {

                    gains +=
                        change;

                } else {

                    losses +=
                        Math.abs(
                            change
                        );

                }

            }


            let averageGain =
                gains /
                period;


            let averageLoss =
                losses /
                period;


            for (
                let i =
                    period + 1;
                i <
                    values.length;
                i++
            ) {

                const change =
                    Number(
                        values[i]
                    ) -
                    Number(
                        values[
                            i - 1
                        ]
                    );


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
                        (
                            period -
                            1
                        ) +
                        gain
                    ) /
                    period;


                averageLoss =
                    (
                        averageLoss *
                        (
                            period -
                            1
                        ) +
                        loss
                    ) /
                    period;

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
                    (
                        1 +
                        rs
                    )
                )
            );

        }


        // ==================================================
        // ATR
        // ==================================================

        function atr(
            history,
            period = 14
        ) {

            if (
                !Array.isArray(
                    history
                ) ||
                history.length <
                    period +
                    1
            ) {

                return null;

            }


            const ranges = [];


            for (
                let i = 1;
                i <
                    history.length;
                i++
            ) {

                const current =
                    history[i];


                const previous =
                    history[
                        i - 1
                    ];


                const trueRange =
                    Math.max(

                        current.high -
                        current.low,

                        Math.abs(
                            current.high -
                            previous.close
                        ),

                        Math.abs(
                            current.low -
                            previous.close
                        )

                    );


                if (
                    Number.isFinite(
                        trueRange
                    )
                ) {

                    ranges.push(
                        trueRange
                    );

                }

            }


            if (
                ranges.length <
                period
            ) {

                return null;

            }


            let value =
                ranges
                    .slice(
                        0,
                        period
                    )
                    .reduce(
                        (
                            sum,
                            item
                        ) =>
                            sum +
                            item,
                        0
                    ) /
                    period;


            for (
                let i =
                    period;
                i <
                    ranges.length;
                i++
            ) {

                value =
                    (
                        value *
                        (
                            period -
                            1
                        ) +
                        ranges[i]
                    ) /
                    period;

            }


            return value;

        }


        // ==================================================
        // SESSION VWAP
        // ==================================================

        function sessionVWAP(
            history
        ) {

            if (
                history.length === 0
            ) {

                return null;

            }


            const latest =
                history[
                    history.length -
                    1
                ];


            const sessionDate =
                latest.date;


            let totalPV = 0;

            let totalVolume = 0;


            for (
                const candle
                of history
            ) {

                if (
                    candle.date !==
                    sessionDate
                ) {

                    continue;

                }


                const typicalPrice =
                    (
                        candle.high +
                        candle.low +
                        candle.close
                    ) /
                    3;


                const volume =
                    Number(
                        candle.volume
                    );


                if (
                    !Number.isFinite(
                        typicalPrice
                    ) ||
                    !Number.isFinite(
                        volume
                    )
                ) {

                    continue;

                }


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


        // ==================================================
        // LEARNING DATA
        // ==================================================

        const rows = [];


        /*
        Minimum historical candles required.
        */

        const LOOKBACK =
            40;


        /*
        Future horizon:

        12 x 5-minute candles
        = approximately 60 minutes.
        */

        const FUTURE_CANDLES =
            interval === "5minute"
                ? 12
                : 12;


        // ==================================================
        // BUILD DATASET
        // ==================================================

        for (
            let i =
                LOOKBACK;

            i <
                candles.length -
                FUTURE_CANDLES;

            i++
        ) {

            const current =
                candles[i];


            const history =
                candles.slice(
                    0,
                    i + 1
                );


            const closes =
                history.map(
                    candle =>
                        candle.close
                );


            // ==============================================
            // EMA
            // ==============================================

            const ema9 =
                ema(
                    closes,
                    9
                );


            const ema21 =
                ema(
                    closes,
                    21
                );


            const previousCloses =
                closes.slice(
                    0,
                    -1
                );


            const previousEMA9 =
                ema(
                    previousCloses,
                    9
                );


            const previousEMA21 =
                ema(
                    previousCloses,
                    21
                );


            // ==============================================
            // RSI
            // ==============================================

            const rsi14 =
                rsi(
                    closes,
                    14
                );


            const previousRSI =
                rsi(
                    previousCloses,
                    14
                );


            // ==============================================
            // ATR
            // ==============================================

            const atr14 =
                atr(
                    history,
                    14
                );


            // ==============================================
            // VWAP
            // ==============================================

            const vwap =
                sessionVWAP(
                    history
                );


            if (
                !Number.isFinite(
                    ema9
                ) ||
                !Number.isFinite(
                    ema21
                ) ||
                !Number.isFinite(
                    previousEMA9
                ) ||
                !Number.isFinite(
                    previousEMA21
                ) ||
                !Number.isFinite(
                    rsi14
                ) ||
                !Number.isFinite(
                    previousRSI
                ) ||
                !Number.isFinite(
                    atr14
                ) ||
                !Number.isFinite(
                    vwap
                ) ||
                atr14 <= 0
            ) {

                continue;

            }


            // ==============================================
            // EMA SLOPES
            // ==============================================

            const ema9Slope =
                ema9 -
                previousEMA9;


            const ema21Slope =
                ema21 -
                previousEMA21;


            const emaSpread =
                ema9 -
                ema21;


            const emaSpreadATR =
                emaSpread /
                atr14;


            const ema9SlopeATR =
                ema9Slope /
                atr14;


            const ema21SlopeATR =
                ema21Slope /
                atr14;


            // ==============================================
            // RSI CHANGE
            // ==============================================

            const rsiChange =
                rsi14 -
                previousRSI;


            // ==============================================
            // PRICE DISTANCES
            // ==============================================

            const vwapDistance =
                current.close -
                vwap;


            const vwapDistanceATR =
                vwapDistance /
                atr14;


            const ema9Distance =
                current.close -
                ema9;


            const ema9DistanceATR =
                ema9Distance /
                atr14;


            const ema21Distance =
                current.close -
                ema21;


            const ema21DistanceATR =
                ema21Distance /
                atr14;


            // ==============================================
            // CANDLE
            // ==============================================

            const range =
                current.high -
                current.low;


            const body =
                Math.abs(
                    current.close -
                    current.open
                );


            const upperWick =
                current.high -
                Math.max(
                    current.open,
                    current.close
                );


            const lowerWick =
                Math.min(
                    current.open,
                    current.close
                ) -
                current.low;


            const bodyRatio =
                range > 0
                    ? body /
                      range
                    : 0;


            const upperWickRatio =
                range > 0
                    ? upperWick /
                      range
                    : 0;


            const lowerWickRatio =
                range > 0
                    ? lowerWick /
                      range
                    : 0;


            const closeLocation =
                range > 0
                    ? (
                        current.close -
                        current.low
                    ) /
                    range
                    : 0.5;


            const rangeATR =
                range /
                atr14;


            const bullish =
                current.close >
                current.open;


            const bearish =
                current.close <
                current.open;


            // ==============================================
            // TREND
            // ==============================================

            let trend =
                "SIDEWAYS";


            if (
                ema9 >
                    ema21 &&
                ema9Slope >
                    0 &&
                ema21Slope >=
                    0
            ) {

                trend =
                    "BULLISH";

            }


            if (
                ema9 <
                    ema21 &&
                ema9Slope <
                    0 &&
                ema21Slope <=
                    0
            ) {

                trend =
                    "BEARISH";

            }


            // ==============================================
            // MARKET REGIME
            // ==============================================

            let regime =
                "RANGING";


            const spreadStrength =
                Math.abs(
                    emaSpreadATR
                );


            const slopeStrength =
                Math.max(

                    Math.abs(
                        ema9SlopeATR
                    ),

                    Math.abs(
                        ema21SlopeATR
                    )

                );


            if (
                spreadStrength >=
                    0.80 &&
                slopeStrength >=
                    0.15
            ) {

                regime =
                    "TRENDING";

            } else if (
                spreadStrength >=
                    0.40
            ) {

                regime =
                    "TRANSITION";

            }


            // ==============================================
            // TIME
            // ==============================================

            const ist =
                getISTTime(
                    current.timestamp
                );


            const hour =
                ist.hour;


            const minute =
                ist.minute;


            const minutesFromOpen =
                (
                    hour *
                    60 +
                    minute
                ) -
                (
                    9 *
                    60 +
                    15
                );


            // ==============================================
            // FUTURE DATA
            // ==============================================

            const future =
                candles.slice(
                    i + 1,
                    i +
                    1 +
                    FUTURE_CANDLES
                );


            if (
                future.length === 0
            ) {

                continue;

            }


            // ==============================================
            // LEARNING RISK MODEL
            // ==============================================

            const entry =
                current.close;


            /*
            Learning labels:

            Risk = 1 ATR
            Reward = 2 ATR

            This is NOT the final trading
            strategy.

            It is only the supervised
            learning target.
            */

            const risk =
                atr14;


            const reward =
                atr14 *
                2;


            const buyStop =
                entry -
                risk;


            const buyTarget =
                entry +
                reward;


            const sellStop =
                entry +
                risk;


            const sellTarget =
                entry -
                reward;


            // ==============================================
            // OUTCOME
            // ==============================================

            let buyOutcome =
                "TIMEOUT";


            let sellOutcome =
                "TIMEOUT";


            let maxFavorableBuy =
                0;


            let maxAdverseBuy =
                0;


            let maxFavorableSell =
                0;


            let maxAdverseSell =
                0;


            // ==============================================
            // FUTURE SIMULATION
            // ==============================================

            for (
                const futureCandle
                of future
            ) {

                // ------------------------------------------
                // BUY MFE / MAE
                // ------------------------------------------

                maxFavorableBuy =
                    Math.max(

                        maxFavorableBuy,

                        futureCandle.high -
                        entry

                    );


                maxAdverseBuy =
                    Math.max(

                        maxAdverseBuy,

                        entry -
                        futureCandle.low

                    );


                // ------------------------------------------
                // SELL MFE / MAE
                // ------------------------------------------

                maxFavorableSell =
                    Math.max(

                        maxFavorableSell,

                        entry -
                        futureCandle.low

                    );


                maxAdverseSell =
                    Math.max(

                        maxAdverseSell,

                        futureCandle.high -
                        entry

                    );


                // ------------------------------------------
                // BUY OUTCOME
                // ------------------------------------------

                if (
                    buyOutcome ===
                    "TIMEOUT"
                ) {

                    const hitStop =
                        futureCandle.low <=
                        buyStop;


                    const hitTarget =
                        futureCandle.high >=
                        buyTarget;


                    /*
                    Conservative rule:

                    If both happen in one candle,
                    classify as LOSS.

                    This avoids artificially
                    inflating the learning result.
                    */

                    if (
                        hitStop &&
                        hitTarget
                    ) {

                        buyOutcome =
                            "LOSS";

                    } else if (
                        hitStop
                    ) {

                        buyOutcome =
                            "LOSS";

                    } else if (
                        hitTarget
                    ) {

                        buyOutcome =
                            "WIN";

                    }

                }


                // ------------------------------------------
                // SELL OUTCOME
                // ------------------------------------------

                if (
                    sellOutcome ===
                    "TIMEOUT"
                ) {

                    const hitStop =
                        futureCandle.high >=
                        sellStop;


                    const hitTarget =
                        futureCandle.low <=
                        sellTarget;


                    if (
                        hitStop &&
                        hitTarget
                    ) {

                        sellOutcome =
                            "LOSS";

                    } else if (
                        hitStop
                    ) {

                        sellOutcome =
                            "LOSS";

                    } else if (
                        hitTarget
                    ) {

                        sellOutcome =
                            "WIN";

                    }

                }

            }


            // ==============================================
            // LABEL
            // ==============================================

            let preferredDirection =
                "NONE";


            let label =
                "NO_TRADE";


            const buyWin =
                buyOutcome ===
                "WIN";


            const sellWin =
                sellOutcome ===
                "WIN";


            const buyLoss =
                buyOutcome ===
                "LOSS";


            const sellLoss =
                sellOutcome ===
                "LOSS";


            if (
                buyWin &&
                !sellWin
            ) {

                preferredDirection =
                    "BUY";


                label =
                    "BUY_WIN";

            } else if (
                sellWin &&
                !buyWin
            ) {

                preferredDirection =
                    "SELL";


                label =
                    "SELL_WIN";

            } else if (
                buyWin &&
                sellWin
            ) {

                label =
                    "BOTH_WIN";

            } else if (
                buyLoss &&
                sellLoss
            ) {

                label =
                    "BOTH_LOSS";

            }


            // ==============================================
            // ADD ROW
            // ==============================================

            rows.push({

                timestamp:
                    current.timestamp,

                date:
                    current.date,

                open:
                    current.open,

                high:
                    current.high,

                low:
                    current.low,

                close:
                    current.close,

                volume:
                    current.volume,


                // EMA
                ema9,

                ema21,

                emaSpread,

                emaSpreadATR,

                ema9Slope,

                ema21Slope,

                ema9SlopeATR,

                ema21SlopeATR,


                // RSI
                rsi14,

                previousRSI,

                rsiChange,


                // ATR
                atr14,


                // VWAP
                vwap,

                vwapDistance,

                vwapDistanceATR,


                // EMA distances
                ema9Distance,

                ema9DistanceATR,

                ema21Distance,

                ema21DistanceATR,


                // Candle
                range,

                rangeATR,

                body,

                bodyRatio,

                upperWick,

                lowerWick,

                upperWickRatio,

                lowerWickRatio,

                closeLocation,

                bullish,

                bearish,


                // Market
                trend,

                regime,


                // Time
                hour,

                minute,

                minutesFromOpen,


                // Outcome
                outcome: {

                    entryTimestamp:
                        current.timestamp,

                    entryTime:
                        new Date(
                            current.timestamp
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
                        future.length,

                    outcomeTimestamp:
                        future[
                            future.length -
                            1
                        ].timestamp

                }

            });

        }


        // ==================================================
        // STATISTICS
        // ==================================================

        const totalRows =
            rows.length;


        const BUY_WIN =
            rows.filter(
                row =>
                    row.outcome.label ===
                    "BUY_WIN"
            ).length;


        const SELL_WIN =
            rows.filter(
                row =>
                    row.outcome.label ===
                    "SELL_WIN"
            ).length;


        const BOTH_WIN =
            rows.filter(
                row =>
                    row.outcome.label ===
                    "BOTH_WIN"
            ).length;


        const BOTH_LOSS =
            rows.filter(
                row =>
                    row.outcome.label ===
                    "BOTH_LOSS"
            ).length;


        const NO_TRADE =
            rows.filter(
                row =>
                    row.outcome.label ===
                    "NO_TRADE"
            ).length;


        const buyWins =
            rows.filter(
                row =>
                    row.outcome.buyOutcome ===
                    "WIN"
            ).length;


        const buyLosses =
            rows.filter(
                row =>
                    row.outcome.buyOutcome ===
                    "LOSS"
            ).length;


        const buyTimeouts =
            rows.filter(
                row =>
                    row.outcome.buyOutcome ===
                    "TIMEOUT"
            ).length;


        const sellWins =
            rows.filter(
                row =>
                    row.outcome.sellOutcome ===
                    "WIN"
            ).length;


        const sellLosses =
            rows.filter(
                row =>
                    row.outcome.sellOutcome ===
                    "LOSS"
            ).length;


        const sellTimeouts =
            rows.filter(
                row =>
                    row.outcome.sellOutcome ===
                    "TIMEOUT"
            ).length;


        const buyDecisiveTrades =
            buyWins +
            buyLosses;


        const sellDecisiveTrades =
            sellWins +
            sellLosses;


        const buyWinRate =
            buyDecisiveTrades >
            0
                ? (
                    buyWins /
                    buyDecisiveTrades
                ) *
                100
                : 0;


        const sellWinRate =
            sellDecisiveTrades >
            0
                ? (
                    sellWins /
                    sellDecisiveTrades
                ) *
                100
                : 0;


        // ==================================================
        // FEATURE LIST
        // ==================================================

        const featureList = [

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

        ];


        // ==================================================
        // FINAL RESPONSE
        // ==================================================

        return res.status(200).json({

            success: true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "LEARNING_DATASET_ONLY",

            paperOnly:
                true,

            realOrders:
                false,


            // ----------------------------------------------
            // MARKET
            // ----------------------------------------------

            instrument,

            scripCode,

            interval,


            // ----------------------------------------------
            // REQUEST
            // ----------------------------------------------

            requestedDays,

            chunkDays:
                CHUNK_DAYS,

            chunksRequested,


            // ----------------------------------------------
            // FETCH DETAILS
            // ----------------------------------------------

            chunkInformation,


            // ----------------------------------------------
            // CANDLES
            // ----------------------------------------------

            candlesTested:
                candles.length,


            firstCandle:
                candles.length > 0
                    ? {

                        timestamp:
                            candles[
                                0
                            ].timestamp,

                        time:
                            new Date(
                                candles[
                                    0
                                ].timestamp
                            ).toISOString(),

                        date:
                            candles[
                                0
                            ].date,

                        close:
                            candles[
                                0
                            ].close

                    }
                    : null,


            lastCandle:
                candles.length > 0
                    ? {

                        timestamp:
                            candles[
                                candles.length -
                                1
                            ].timestamp,

                        time:
                            new Date(
                                candles[
                                    candles.length -
                                    1
                                ].timestamp
                            ).toISOString(),

                        date:
                            candles[
                                candles.length -
                                1
                            ].date,

                        close:
                            candles[
                                candles.length -
                                1
                            ].close

                    }
                    : null,


            tradingDays,


            // ----------------------------------------------
            // DATA QUALITY
            // ----------------------------------------------

            dataQuality: {

                rawCandles:
                    rawCandleCount,

                validCandles:
                    validRawCandles.length,

                finalCandles:
                    candles.length,

                duplicateCandles,

                invalidCandles,

                requestedDays,

                actualTradingDays:
                    tradingDays

            },


            // ----------------------------------------------
            // LEARNING DATA
            // ----------------------------------------------

            learningRows:
                totalRows,

            skippedRows:
                candles.length -
                totalRows,


            // ----------------------------------------------
            // STATISTICS
            // ----------------------------------------------

            datasetStatistics: {

                totalRows,

                BUY_WIN,

                SELL_WIN,

                BOTH_WIN,

                BOTH_LOSS,

                NO_TRADE,

                buyWins,

                buyLosses,

                buyTimeouts,

                sellWins,

                sellLosses,

                sellTimeouts,

                buyDecisiveTrades,

                sellDecisiveTrades,

                buyWinRate,

                sellWinRate

            },


            // ----------------------------------------------
            // FEATURES
            // ----------------------------------------------

            featureList,


            // ----------------------------------------------
            // DATA
            // ----------------------------------------------

            rows

        });

    } catch (
        error
    ) {

        console.error(
            "================================"
        );

        console.error(
            "V11.1 FATAL ERROR"
        );

        console.error(
            error
        );

        console.error(
            "================================"
        );


        return res.status(500).json({

            success: false,

            version:
                "V11.1",

            status:
                "FAILED",

            mode:
                "LEARNING_DATASET_ONLY",

            paperOnly:
                true,

            realOrders:
                false,

            error:
                error?.message ||
                "Unknown error"

        });

    }

}
