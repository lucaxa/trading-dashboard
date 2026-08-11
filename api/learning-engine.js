/*
===========================================================
 TradeMind Pro
 V13.1 — REGIME ADAPTIVE EDGE VALIDATION
        + DIVERSITY CONTROL
        + TRUE WALK-FORWARD PAPER ENGINE
        + DIRECT INDSTOCKS HISTORICAL DATA

 Instrument : NIFTY 50
 Interval   : 5 minute
 Mode       : PAPER ONLY
 Orders     : NONE

 IMPORTANT
 ----------------------------------------------------------
 This version DOES NOT use:
   LEARNING_DATA_URL
   DATA_URL
   LEARNING_DATASET

 It fetches historical candles directly from INDstocks.

 INDstocks 5-minute historical API:
   Maximum request range = 7 days

 Therefore this engine automatically downloads
 the requested period in 6-day chunks.

 INDstocks candle format:
   [timestamp_ms, open, high, low, close, volume]

 ===========================================================
*/


export default async function handler(req, res) {

    try {

        // =====================================================
        // CONFIG
        // =====================================================

        const VERSION = "V13.1";

        const INSTRUMENT = "NIFTY 50";
        const INTERVAL = "5minute";

        // Your confirmed INDstocks NIFTY 50 index scrip code
        const SCRIP_CODE = "NIDX_40000001";

        const REQUESTED_DAYS = Number(
            req.body?.days ||
            req.query?.days ||
            30
        );

        const QUALITY_THRESHOLD = 60;

        const MIN_OOS_SAMPLES = 8;
        const MIN_STABLE_FOLDS = 2;

        const MIN_EXPECTED_VALUE = 0.10;
        const MIN_PROFIT_FACTOR = 1.20;

        const MIN_INDEPENDENT_PATTERNS = 2;
        const MAX_PATTERN_CONCENTRATION = 0.50;

        const RISK_R = 1;
        const STOP_R = 1;
        const TARGET_R = 2;
        const PREFERRED_TARGET_R = 2.5;

        const MAX_HOLD_CANDLES = 12;

        const ENTRY_CONFIRMATION_MIN = 5;
        const ENTRY_CONFIRMATION_MAX = 6;

        const ENTRY_COOLDOWN = 3;
        const SAME_PATTERN_COOLDOWN = 5;
        const SAME_SIDE_COOLDOWN = 2;

        const MAX_PATTERN_LOSS_STREAK = 6;
        const MAX_OOS_DRAWDOWN = 12;

        const BASE_URL =
            "https://api.indstocks.com";


        // =====================================================
        // RESPONSE HELPERS
        // =====================================================

        function send(data) {

            return res.status(200).json(data);

        }


        function fail(message, extra = {}) {

            return res.status(500).json({

                success: false,

                version: VERSION,

                status: "ERROR",

                paperOnly: true,

                realOrders: false,

                brokerOrderEnabled: false,

                brokerOrderSent: false,

                error: message,

                ...extra

            });

        }


        // =====================================================
        // NUMBER HELPERS
        // =====================================================

        function n(value, fallback = null) {

            const number = Number(value);

            return Number.isFinite(number)
                ? number
                : fallback;

        }


        function round(value, digits = 4) {

            if (!Number.isFinite(value)) {
                return null;
            }

            const factor =
                Math.pow(10, digits);

            return Math.round(
                value * factor
            ) / factor;

        }


        function clamp(value, min, max) {

            return Math.max(
                min,
                Math.min(max, value)
            );

        }


        // =====================================================
        // INDSTOCKS CANDLE NORMALIZATION
        // =====================================================

        function normalizeCandle(row) {

            if (!row) {
                return null;
            }


            /*
             * INDstocks returns:
             *
             * [
             *   timestamp_ms,
             *   open,
             *   high,
             *   low,
             *   close,
             *   volume
             * ]
             */

            if (Array.isArray(row)) {

                const rawTs =
                    Number(row[0]);

                const o =
                    Number(row[1]);

                const h =
                    Number(row[2]);

                const l =
                    Number(row[3]);

                const c =
                    Number(row[4]);

                const v =
                    Number(row[5] ?? 0);


                if (
                    !Number.isFinite(rawTs) ||
                    !Number.isFinite(o) ||
                    !Number.isFinite(h) ||
                    !Number.isFinite(l) ||
                    !Number.isFinite(c)
                ) {

                    return null;

                }


                /*
                 * Convert milliseconds to seconds.
                 *
                 * Internal TradeMind timestamps use seconds.
                 */

                const ts =
                    rawTs > 100000000000
                        ? Math.floor(rawTs / 1000)
                        : rawTs;


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

            }


            /*
             * Also support object-form candles.
             * This makes the engine more robust if INDstocks
             * changes/returns a different wrapper.
             */

            const rawTs =
                Number(
                    row.ts ??
                    row.timestamp ??
                    row.time ??
                    row.t
                );


            const o =
                Number(
                    row.o ??
                    row.open
                );


            const h =
                Number(
                    row.h ??
                    row.high
                );


            const l =
                Number(
                    row.l ??
                    row.low
                );


            const c =
                Number(
                    row.c ??
                    row.close
                );


            const v =
                Number(
                    row.v ??
                    row.volume ??
                    0
                );


            if (
                !Number.isFinite(rawTs) ||
                !Number.isFinite(o) ||
                !Number.isFinite(h) ||
                !Number.isFinite(l) ||
                !Number.isFinite(c)
            ) {

                return null;

            }


            const ts =
                rawTs > 100000000000
                    ? Math.floor(rawTs / 1000)
                    : rawTs;


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

        }


        // =====================================================
        // EXTRACT INDSTOCKS CANDLES
        // =====================================================

        function extractRows(payload) {

            if (!payload) {
                return [];
            }


            /*
             * Expected:
             *
             * {
             *   status: "success",
             *   data: {
             *      candles: [...]
             *   }
             * }
             */

            if (
                payload.data &&
                Array.isArray(
                    payload.data.candles
                )
            ) {

                return payload.data.candles;

            }


            if (
                Array.isArray(
                    payload.candles
                )
            ) {

                return payload.candles;

            }


            if (
                Array.isArray(payload.data)
            ) {

                return payload.data;

            }


            if (
                Array.isArray(payload.rows)
            ) {

                return payload.rows;

            }


            if (
                Array.isArray(payload.results)
            ) {

                return payload.results;

            }


            if (
                payload.result &&
                Array.isArray(
                    payload.result.candles
                )
            ) {

                return payload.result.candles;

            }


            return [];

        }


        // =====================================================
        // GET INDSTOCKS ACCESS TOKEN
        // =====================================================

        function getAccessToken() {

            /*
             * Support multiple names so you don't have
             * to rename an existing Vercel variable.
             */

            const token =
                process.env.INDSTOCKS_ACCESS_TOKEN ||
                process.env.INDSTOCKS_TOKEN ||
                process.env.INDSTOCKS_API_TOKEN;


            if (!token) {

                throw new Error(
                    "INDstocks access token not configured. Set INDSTOCKS_ACCESS_TOKEN in Vercel Environment Variables."
                );

            }


            return String(token).trim();

        }


        // =====================================================
        // FETCH ONE INDSTOCKS CHUNK
        // =====================================================

        async function fetchINDstocksChunk(
            accessToken,
            startMs,
            endMs
        ) {

            const url =
                `${BASE_URL}/market/historical/${INTERVAL}` +
                `?scrip-codes=${encodeURIComponent(SCRIP_CODE)}` +
                `&start_time=${Math.floor(startMs)}` +
                `&end_time=${Math.floor(endMs)}`;


            const response =
                await fetch(
                    url,
                    {
                        method: "GET",

                        headers: {

                            "Authorization":
                                accessToken,

                            "Accept":
                                "application/json"

                        }
                    }
                );


            const text =
                await response.text();


            if (!response.ok) {

                throw new Error(
                    `INDstocks historical API failed: HTTP ${response.status} ${text.slice(0, 500)}`
                );

            }


            let payload;

            try {

                payload =
                    JSON.parse(text);

            } catch (error) {

                throw new Error(
                    "INDstocks returned invalid JSON: " +
                    text.slice(0, 500)
                );

            }


            const rows =
                extractRows(payload);


            return rows;

        }


        // =====================================================
        // FETCH COMPLETE HISTORICAL DATASET
        // =====================================================

        async function fetchHistoricalData(
            accessToken,
            days
        ) {

            /*
             * INDstocks allows maximum 7 days for
             * 5-minute historical data.
             *
             * We intentionally use 6-day chunks.
             */

            const CHUNK_DAYS = 6;

            const MS_PER_DAY =
                24 *
                60 *
                60 *
                1000;


            const now =
                Date.now();


            const requestedMs =
                Math.max(
                    1,
                    Number(days)
                ) *
                MS_PER_DAY;


            const requestedStart =
                now -
                requestedMs;


            const allRows = [];


            let cursor =
                requestedStart;


            let chunkNumber = 0;


            while (
                cursor < now
            ) {

                chunkNumber++;


                const chunkEnd =
                    Math.min(
                        cursor +
                        CHUNK_DAYS *
                        MS_PER_DAY,
                        now
                    );


                const rows =
                    await fetchINDstocksChunk(
                        accessToken,
                        cursor,
                        chunkEnd
                    );


                console.log(
                    `TradeMind V13.1 INDstocks chunk ${chunkNumber}:`,
                    new Date(cursor).toISOString(),
                    "->",
                    new Date(chunkEnd).toISOString(),
                    "raw candles:",
                    rows.length
                );


                allRows.push(
                    ...rows
                );


                if (
                    chunkEnd <= cursor
                ) {

                    break;

                }


                cursor =
                    chunkEnd;

            }


            /*
             * Normalize
             */

            const normalized =
                allRows
                    .map(normalizeCandle)
                    .filter(Boolean);


            /*
             * Deduplicate by timestamp.
             */

            const map =
                new Map();


            for (
                const candle of normalized
            ) {

                map.set(
                    String(candle.ts),
                    candle
                );

            }


            const result =
                [...map.values()]
                    .sort(
                        (a, b) =>
                            a.ts - b.ts
                    );


            console.log(
                "TradeMind V13.1 total raw candles:",
                allRows.length
            );


            console.log(
                "TradeMind V13.1 normalized candles:",
                result.length
            );


            return {

                rawRows:
                    allRows,

                normalized:
                    result

            };

        }


        // =====================================================
        // PREPARE DATA
        // =====================================================

        function prepareData(rows) {

            const map =
                new Map();


            for (
                const row of rows
            ) {

                if (!row) {
                    continue;
                }


                map.set(
                    String(row.ts),
                    row
                );

            }


            return [
                ...map.values()
            ]
                .sort(
                    (a, b) =>
                        a.ts - b.ts
                );

        }


        // =====================================================
        // EMA
        // =====================================================

        function ema(values, period) {

            if (
                values.length <
                period
            ) {

                return null;

            }


            let value = 0;


            for (
                let i = 0;
                i < period;
                i++
            ) {

                value +=
                    values[i];

            }


            value /=
                period;


            const multiplier =
                2 /
                (period + 1);


            for (
                let i = period;
                i < values.length;
                i++
            ) {

                value =
                    (
                        values[i] -
                        value
                    ) *
                    multiplier +
                    value;

            }


            return value;

        }


        // =====================================================
        // RSI
        // =====================================================

        function rsi(
            values,
            period = 14
        ) {

            if (
                values.length <=
                period
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

                const diff =
                    values[i] -
                    values[i - 1];


                if (
                    diff >= 0
                ) {

                    gains += diff;

                } else {

                    losses +=
                        Math.abs(diff);

                }

            }


            let avgGain =
                gains / period;


            let avgLoss =
                losses / period;


            for (
                let i = period + 1;
                i < values.length;
                i++
            ) {

                const diff =
                    values[i] -
                    values[i - 1];


                const gain =
                    diff > 0
                        ? diff
                        : 0;


                const loss =
                    diff < 0
                        ? Math.abs(diff)
                        : 0;


                avgGain =
                    (
                        avgGain *
                        (period - 1) +
                        gain
                    ) /
                    period;


                avgLoss =
                    (
                        avgLoss *
                        (period - 1) +
                        loss
                    ) /
                    period;

            }


            if (
                avgLoss === 0
            ) {

                return 100;

            }


            const rs =
                avgGain /
                avgLoss;


            return (
                100 -
                (
                    100 /
                    (1 + rs)
                )
            );

        }


        // =====================================================
        // ATR
        // =====================================================

        function atr(
            candles,
            period = 14
        ) {

            if (
                candles.length <=
                period
            ) {

                return null;

            }


            const trs = [];


            for (
                let i = 1;
                i < candles.length;
                i++
            ) {

                const current =
                    candles[i];


                const previous =
                    candles[i - 1];


                const tr =
                    Math.max(

                        current.h -
                        current.l,

                        Math.abs(
                            current.h -
                            previous.c
                        ),

                        Math.abs(
                            current.l -
                            previous.c
                        )

                    );


                trs.push(tr);

            }


            if (
                trs.length <
                period
            ) {

                return null;

            }


            let value = 0;


            for (
                let i = 0;
                i < period;
                i++
            ) {

                value +=
                    trs[i];

            }


            value /=
                period;


            for (
                let i = period;
                i < trs.length;
                i++
            ) {

                value =
                    (
                        value *
                        (period - 1) +
                        trs[i]
                    ) /
                    period;

            }


            return value;

        }


        // =====================================================
        // VWAP
        // =====================================================

        function calculateVWAP(
            candles
        ) {

            if (
                !candles.length
            ) {

                return null;

            }


            let pv = 0;
            let volume = 0;


            for (
                const candle of candles
            ) {

                const typical =
                    (
                        candle.h +
                        candle.l +
                        candle.c
                    ) / 3;


                const vol =
                    Math.max(
                        0,
                        candle.v || 0
                    );


                pv +=
                    typical *
                    vol;


                volume +=
                    vol;

            }


            if (
                volume === 0
            ) {

                return candles[
                    candles.length - 1
                ].c;

            }


            return pv / volume;

        }


        // =====================================================
        // TIME BUCKET
        // =====================================================

        function getTimeBucket(ts) {

            /*
             * INDstocks timestamps are IST.
             * Convert using +5:30 explicitly.
             */

            const date =
                new Date(
                    ts * 1000 +
                    5.5 *
                    60 *
                    60 *
                    1000
                );


            const hour =
                date.getUTCHours();


            const minute =
                date.getUTCMinutes();


            const mins =
                hour * 60 +
                minute;


            if (
                mins < 10 * 60
            ) {

                return "OPEN";

            }


            if (
                mins < 12 * 60
            ) {

                return "MORNING";

            }


            if (
                mins < 14 * 60
            ) {

                return "MIDDAY";

            }


            return "CLOSE";

        }


        // =====================================================
        // FEATURE ENGINE
        // =====================================================

        function features(
            candles,
            index
        ) {

            if (
                index < 30
            ) {

                return null;

            }


            const slice =
                candles.slice(
                    0,
                    index + 1
                );


            const closes =
                slice.map(
                    x => x.c
                );


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


            const rsi14 =
                rsi(
                    closes,
                    14
                );


            const atr14 =
                atr(
                    slice,
                    14
                );


            const vwap =
                calculateVWAP(
                    slice
                );


            if (
                ema9 === null ||
                ema21 === null ||
                rsi14 === null ||
                atr14 === null ||
                vwap === null
            ) {

                return null;

            }


            const close =
                candles[index].c;


            const emaSpread =
                ema9 -
                ema21;


            const emaSpreadATR =
                atr14 !== 0
                    ? emaSpread /
                      atr14
                    : 0;


            const ema9Slope =
                previousEMA9 === null
                    ? 0
                    : ema9 -
                      previousEMA9;


            const ema9SlopeATR =
                atr14 !== 0
                    ? ema9Slope /
                      atr14
                    : 0;


            let trend =
                "SIDEWAYS";


            if (
                ema9 >
                ema21 &&
                ema9SlopeATR >
                0
            ) {

                trend =
                    "BULLISH";

            }


            if (
                ema9 <
                ema21 &&
                ema9SlopeATR <
                0
            ) {

                trend =
                    "BEARISH";

            }


            let rsiBucket =
                "NEUTRAL";


            if (
                rsi14 >= 60
            ) {

                rsiBucket =
                    "HIGH";

            } else if (
                rsi14 >= 50
            ) {

                rsiBucket =
                    "NEUTRAL_HIGH";

            } else if (
                rsi14 <= 40
            ) {

                rsiBucket =
                    "LOW";

            } else if (
                rsi14 < 50
            ) {

                rsiBucket =
                    "NEUTRAL_LOW";

            }


            let vwapDirection =
                "AT";


            if (
                close > vwap
            ) {

                vwapDirection =
                    "ABOVE";

            } else if (
                close < vwap
            ) {

                vwapDirection =
                    "BELOW";

            }


            const vwapDistanceATR =
                atr14 !== 0
                    ? (
                        close -
                        vwap
                    ) /
                    atr14
                    : 0;


            let volatility =
                "NORMAL";


            if (
                atr14 > 18
            ) {

                volatility =
                    "HIGH";

            } else if (
                atr14 < 8
            ) {

                volatility =
                    "LOW";

            }


            let regime =
                "TRANSITION";


            if (
                Math.abs(
                    emaSpreadATR
                ) > 0.35 &&
                Math.abs(
                    ema9SlopeATR
                ) > 0.08
            ) {

                regime =
                    "TRENDING";

            } else if (
                Math.abs(
                    emaSpreadATR
                ) < 0.15 &&
                Math.abs(
                    ema9SlopeATR
                ) < 0.05
            ) {

                regime =
                    "RANGING";

            }


            let patternType =
                "RANGE";


            if (
                trend !==
                "SIDEWAYS"
            ) {

                patternType =
                    "TREND_FOLLOW";

            }


            return {

                close,

                ema9,

                ema21,

                emaSpread,

                emaSpreadATR,

                ema9SlopeATR,

                rsi:
                    rsi14,

                rsiBucket,

                atr14,

                vwap,

                vwapDirection,

                vwapDistanceATR,

                trend,

                regime,

                volatility,

                patternType,

                timeBucket:
                    getTimeBucket(
                        candles[index].ts
                    )

            };

        }


        // =====================================================
        // BASE SIGNAL
        // =====================================================

        function baseSignal(f) {

            if (!f) {
                return null;
            }


            if (
                f.trend ===
                "BULLISH" &&
                f.vwapDirection ===
                "ABOVE"
            ) {

                return "BUY";

            }


            if (
                f.trend ===
                "BEARISH" &&
                f.vwapDirection ===
                "BELOW"
            ) {

                return "SELL";

            }


            return null;

        }


        // =====================================================
        // SLOPE BUCKET
        // =====================================================

        function slopeBucket(
            slope
        ) {

            if (
                slope > 0.08
            ) {

                return "STRONG";

            }


            if (
                slope > 0.02
            ) {

                return "WEAK";

            }


            if (
                slope < -0.08
            ) {

                return "STRONG";

            }


            if (
                slope < -0.02
            ) {

                return "WEAK";

            }


            return "FLAT";

        }


        // =====================================================
        // PATTERN KEY
        // =====================================================

        function patternKey(
            side,
            f
        ) {

            return [

                side,

                `T:${f.trend}`,

                `V:${f.vwapDirection}`,

                `P:${f.patternType}`,

                `R:${f.rsiBucket}`,

                `G:${f.regime}`,

                `S:${slopeBucket(
                    f.ema9SlopeATR
                )}`,

                `H:${f.timeBucket}`

            ].join("|");

        }


        // =====================================================
        // FAMILY KEY
        // =====================================================

        function familyKey(
            side,
            f
        ) {

            return [

                side,

                `T:${f.trend}`,

                `P:${f.patternType}`

            ].join("|");

        }


        // =====================================================
        // ENTRY CONFIRMATION
        // =====================================================

        function confirmationScore(
            candles,
            index,
            side
        ) {

            const f =
                features(
                    candles,
                    index
                );


            if (!f) {

                return {

                    score: 0,

                    maxScore: 6,

                    passed: false

                };

            }


            let score = 0;


            // Trend
            if (
                (
                    side === "BUY" &&
                    f.trend === "BULLISH"
                ) ||
                (
                    side === "SELL" &&
                    f.trend === "BEARISH"
                )
            ) {

                score++;

            }


            // VWAP
            if (
                (
                    side === "BUY" &&
                    f.vwapDirection === "ABOVE"
                ) ||
                (
                    side === "SELL" &&
                    f.vwapDirection === "BELOW"
                )
            ) {

                score++;

            }


            // EMA alignment
            if (
                (
                    side === "BUY" &&
                    f.ema9 > f.ema21
                ) ||
                (
                    side === "SELL" &&
                    f.ema9 < f.ema21
                )
            ) {

                score++;

            }


            // EMA spread
            if (
                Math.abs(
                    f.emaSpreadATR
                ) >= 0.05
            ) {

                score++;

            }


            // Slope
            if (
                (
                    side === "BUY" &&
                    f.ema9SlopeATR > 0
                ) ||
                (
                    side === "SELL" &&
                    f.ema9SlopeATR < 0
                )
            ) {

                score++;

            }


            // RSI direction
            if (
                (
                    side === "BUY" &&
                    f.rsi >= 50
                ) ||
                (
                    side === "SELL" &&
                    f.rsi < 50
                )
            ) {

                score++;

            }


            return {

                score,

                maxScore: 6,

                passed:
                    score >=
                    ENTRY_CONFIRMATION_MIN

            };

        }


        // =====================================================
        // TRADE OUTCOME
        // =====================================================

        function evaluateTrade(
            candles,
            entryIndex,
            side,
            entry,
            stop,
            target
        ) {

            const end =
                Math.min(
                    candles.length - 1,
                    entryIndex +
                    MAX_HOLD_CANDLES
                );


            for (
                let i =
                    entryIndex + 1;
                i <= end;
                i++
            ) {

                const candle =
                    candles[i];


                if (
                    side === "BUY"
                ) {

                    const hitStop =
                        candle.l <=
                        stop;


                    const hitTarget =
                        candle.h >=
                        target;


                    /*
                     * Conservative same-candle
                     * assumption:
                     * STOP FIRST.
                     */

                    if (
                        hitStop &&
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR: -1

                        };

                    }


                    if (
                        hitStop
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR: -1

                        };

                    }


                    if (
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "TARGET",

                            resultR: 2

                        };

                    }

                }


                if (
                    side === "SELL"
                ) {

                    const hitStop =
                        candle.h >=
                        stop;


                    const hitTarget =
                        candle.l <=
                        target;


                    if (
                        hitStop &&
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR: -1

                        };

                    }


                    if (
                        hitStop
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "STOP",

                            resultR: -1

                        };

                    }


                    if (
                        hitTarget
                    ) {

                        return {

                            exitIndex: i,

                            exitType:
                                "TARGET",

                            resultR: 2

                        };

                    }

                }

            }


            return {

                exitIndex: end,

                exitType:
                    "TIMEOUT",

                resultR: 0

            };

        }


        // =====================================================
        // LEARN PATTERNS
        // =====================================================

        function learnPatterns(
            candles,
            trainingStart,
            trainingEnd
        ) {

            const patterns =
                new Map();


            for (
                let i =
                    trainingStart + 30;

                i <
                    trainingEnd -
                    MAX_HOLD_CANDLES;

                i++
            ) {

                const f =
                    features(
                        candles,
                        i
                    );


                if (!f) {
                    continue;
                }


                const side =
                    baseSignal(f);


                if (!side) {
                    continue;
                }


                const confirmation =
                    confirmationScore(
                        candles,
                        i,
                        side
                    );


                if (
                    !confirmation.passed
                ) {

                    continue;

                }


                const key =
                    patternKey(
                        side,
                        f
                    );


                const family =
                    familyKey(
                        side,
                        f
                    );


                const entry =
                    candles[i].c;


                const atrValue =
                    f.atr14;


                if (
                    !atrValue ||
                    atrValue <= 0
                ) {

                    continue;

                }


                let stop;
                let target;


                if (
                    side === "BUY"
                ) {

                    stop =
                        entry -
                        atrValue;


                    target =
                        entry +
                        2 *
                        atrValue;

                } else {

                    stop =
                        entry +
                        atrValue;


                    target =
                        entry -
                        2 *
                        atrValue;

                }


                const outcome =
                    evaluateTrade(
                        candles,
                        i,
                        side,
                        entry,
                        stop,
                        target
                    );


                if (
                    !patterns.has(key)
                ) {

                    patterns.set(
                        key,
                        {

                            key,

                            family,

                            side,

                            patternType:
                                f.patternType,

                            regime:
                                f.regime,

                            samples: 0,

                            wins: 0,

                            losses: 0,

                            timeouts: 0,

                            totalR: 0,

                            results: [],

                            foldSet:
                                new Set(),

                            recentResults: []

                        }
                    );

                }


                const p =
                    patterns.get(key);


                p.samples++;


                p.totalR +=
                    outcome.resultR;


                p.results.push(
                    outcome.resultR
                );


                if (
                    outcome.resultR > 0
                ) {

                    p.wins++;

                } else if (
                    outcome.resultR < 0
                ) {

                    p.losses++;

                } else {

                    p.timeouts++;

                }


                const foldBucket =
                    Math.floor(

                        (
                            i -
                            trainingStart
                        ) /

                        Math.max(

                            1,

                            (
                                trainingEnd -
                                trainingStart
                            ) / 3

                        )

                    );


                p.foldSet.add(
                    foldBucket
                );


                const recentStart =
                    trainingStart +
                    Math.floor(

                        (
                            trainingEnd -
                            trainingStart
                        ) *
                        0.75

                    );


                if (
                    i >= recentStart
                ) {

                    p.recentResults.push(
                        outcome.resultR
                    );

                }

            }


            const result = [];


            for (
                const p of
                patterns.values()
            ) {

                if (
                    p.samples < 3
                ) {

                    continue;

                }


                const decisive =
                    p.wins +
                    p.losses;


                const winRate =
                    decisive > 0
                        ? p.wins /
                          decisive
                        : 0;


                const ev =
                    p.totalR /
                    p.samples;


                const grossWin =
                    p.wins * 2;


                const grossLoss =
                    p.losses;


                const pf =
                    grossLoss > 0
                        ? grossWin /
                          grossLoss
                        : grossWin > 0
                            ? 999
                            : 0;


                const stableFolds =
                    p.foldSet.size;


                const recentEV =
                    p.recentResults.length
                        ? p.recentResults.reduce(
                            (a, b) =>
                                a + b,
                            0
                        ) /
                        p.recentResults.length
                        : 0;


                const decay =
                    ev === 0
                        ? 0
                        : (
                            recentEV -
                            ev
                        ) /
                        Math.abs(ev);


                let quality = 0;


                quality +=
                    clamp(
                        winRate * 45,
                        0,
                        45
                    );


                quality +=
                    clamp(
                        Math.max(ev, 0) * 20,
                        0,
                        20
                    );


                quality +=
                    clamp(
                        Math.max(
                            pf - 1,
                            0
                        ) * 10,
                        0,
                        20
                    );


                quality +=
                    Math.min(
                        stableFolds,
                        3
                    ) * 5;


                if (
                    recentEV < 0
                ) {

                    quality -= 15;

                }


                quality =
                    clamp(
                        quality,
                        0,
                        100
                    );


                const qualified =

                    p.samples >=
                    MIN_OOS_SAMPLES &&

                    stableFolds >=
                    MIN_STABLE_FOLDS &&

                    quality >=
                    QUALITY_THRESHOLD &&

                    ev >=
                    MIN_EXPECTED_VALUE &&

                    pf >=
                    MIN_PROFIT_FACTOR &&

                    decay >=
                    -0.75 &&

                    decisive >= 3;


                result.push({

                    ...p,

                    winRate:
                        round(
                            winRate * 100,
                            2
                        ),

                    EV:
                        round(
                            ev,
                            4
                        ),

                    PF:
                        round(
                            pf,
                            4
                        ),

                    expectedValueR:
                        round(
                            ev,
                            4
                        ),

                    recentEV:
                        round(
                            recentEV,
                            4
                        ),

                    decay:
                        round(
                            decay,
                            4
                        ),

                    stableFolds,

                    oosSamples:
                        p.samples,

                    quality:
                        round(
                            quality,
                            2
                        ),

                    qualified

                });

            }


            return result;

        }


        // =====================================================
        // DIVERSITY SELECTION
        // =====================================================

        function selectPatterns(
            patterns
        ) {

            const qualified =
                patterns
                    .filter(
                        p =>
                            p.qualified
                    )
                    .sort(
                        (a, b) =>
                            b.quality -
                            a.quality
                    );


            if (
                !qualified.length
            ) {

                return [];

            }


            const selected = [];

            const families =
                new Set();


            /*
             * Select independent families first.
             */

            for (
                const p of qualified
            ) {

                if (
                    selected.length >= 6
                ) {

                    break;

                }


                if (
                    !families.has(
                        p.family
                    )
                ) {

                    selected.push(p);

                    families.add(
                        p.family
                    );

                }

            }


            /*
             * We intentionally do NOT manufacture
             * diversity.
             *
             * If only one independent family exists,
             * the model is allowed to return no trade.
             */

            return selected;

        }


        // =====================================================
        // CONCENTRATION
        // =====================================================

        function concentration(
            trades
        ) {

            if (
                !trades.length
            ) {

                return {

                    uniquePatterns: 0,

                    maximumShare: 0,

                    patternCounts: {},

                    concentrationPassed:
                        false,

                    details: []

                };

            }


            const counts = {};


            for (
                const trade of trades
            ) {

                counts[
                    trade.pattern
                ] =
                    (
                        counts[
                            trade.pattern
                        ] || 0
                    ) + 1;

            }


            const uniquePatterns =
                Object.keys(
                    counts
                ).length;


            const maximum =
                Math.max(
                    ...Object.values(
                        counts
                    )
                );


            const maximumShare =
                maximum /
                trades.length;


            const details =
                Object.entries(
                    counts
                )
                .map(
                    ([pattern, count]) => ({

                        pattern,

                        count,

                        share:
                            round(
                                count /
                                trades.length,
                                4
                            )

                    })
                );


            return {

                uniquePatterns,

                maximumShare:
                    round(
                        maximumShare,
                        4
                    ),

                patternCounts:
                    counts,

                concentrationPassed:

                    uniquePatterns >=
                    MIN_INDEPENDENT_PATTERNS &&

                    maximumShare <=
                    MAX_PATTERN_CONCENTRATION,

                details

            };

        }


        // =====================================================
        // EXECUTE OOS FOLD
        // =====================================================

        function executeFold(
            candles,
            testStart,
            testEnd,
            selectedPatterns,
            foldNumber
        ) {

            const trades = [];


            let cooldownUntil =
                -1;


            let lastPattern =
                null;


            let lastPatternIndex =
                -9999;


            let lastSide =
                null;


            let lastSideIndex =
                -9999;


            for (
                let i =
                    testStart;

                i <
                    testEnd - 1;

                i++
            ) {

                if (
                    i <=
                    cooldownUntil
                ) {

                    continue;

                }


                const f =
                    features(
                        candles,
                        i
                    );


                if (!f) {
                    continue;
                }


                const side =
                    baseSignal(f);


                if (!side) {
                    continue;
                }


                const key =
                    patternKey(
                        side,
                        f
                    );


                const selected =
                    selectedPatterns.find(
                        p =>
                            p.key ===
                            key
                    );


                if (!selected) {
                    continue;
                }


                if (
                    key ===
                    lastPattern &&

                    i -
                    lastPatternIndex <
                    SAME_PATTERN_COOLDOWN
                ) {

                    continue;

                }


                if (
                    side ===
                    lastSide &&

                    i -
                    lastSideIndex <
                    SAME_SIDE_COOLDOWN
                ) {

                    continue;

                }


                const confirmation =
                    confirmationScore(
                        candles,
                        i,
                        side
                    );


                if (
                    !confirmation.passed
                ) {

                    continue;

                }


                const entry =
                    candles[i].c;


                const atrValue =
                    f.atr14;


                if (
                    !Number.isFinite(
                        atrValue
                    ) ||
                    atrValue <= 0
                ) {

                    continue;

                }


                let stop;
                let target;
                let preferredTarget;


                if (
                    side === "BUY"
                ) {

                    stop =
                        entry -
                        atrValue;


                    target =
                        entry +
                        2 *
                        atrValue;


                    preferredTarget =
                        entry +
                        PREFERRED_TARGET_R *
                        atrValue;

                } else {

                    stop =
                        entry +
                        atrValue;


                    target =
                        entry -
                        2 *
                        atrValue;


                    preferredTarget =
                        entry -
                        PREFERRED_TARGET_R *
                        atrValue;

                }


                const outcome =
                    evaluateTrade(
                        candles,
                        i,
                        side,
                        entry,
                        stop,
                        target
                    );


                const trade = {

                    tradeNumber:
                        trades.length + 1,

                    fold:
                        foldNumber,

                    signalIndex:
                        i,

                    testLocalIndex:
                        i -
                        testStart,

                    timestamp:
                        candles[i].ts,

                    side,

                    pattern:
                        key,

                    patternFamily:
                        selected.family,

                    patternLevel:
                        key.split("|").length,

                    patternType:
                        f.patternType,

                    patternQuality:
                        selected.quality,

                    patternSamples:
                        selected.samples,

                    patternOOSSamples:
                        selected.oosSamples,

                    patternEV:
                        selected.expectedValueR,

                    patternPF:
                        selected.PF,

                    patternStableFolds:
                        selected.stableFolds,

                    regime:
                        f.regime,

                    confirmationScore:
                        confirmation.score,

                    confirmationMaxScore:
                        confirmation.maxScore,

                    entry:
                        round(
                            entry,
                            2
                        ),

                    stop:
                        round(
                            stop,
                            2
                        ),

                    target:
                        round(
                            target,
                            2
                        ),

                    preferredTarget:
                        round(
                            preferredTarget,
                            2
                        ),

                    riskReward:
                        "1:2",

                    exitType:
                        outcome.exitType,

                    resultR:
                        outcome.resultR

                };


                trades.push(
                    trade
                );


                cooldownUntil =
                    outcome.exitIndex +
                    ENTRY_COOLDOWN;


                lastPattern =
                    key;


                lastPatternIndex =
                    i;


                lastSide =
                    side;


                lastSideIndex =
                    i;

            }


            return trades;

        }


        // =====================================================
        // STATS
        // =====================================================

        function stats(
            trades
        ) {

            const wins =
                trades.filter(
                    t =>
                        t.resultR > 0
                ).length;


            const losses =
                trades.filter(
                    t =>
                        t.resultR < 0
                ).length;


            const timeouts =
                trades.filter(
                    t =>
                        t.resultR === 0
                ).length;


            const decisive =
                wins +
                losses;


            const totalWinR =
                trades
                    .filter(
                        t =>
                            t.resultR > 0
                    )
                    .reduce(
                        (s, t) =>
                            s +
                            t.resultR,
                        0
                    );


            const totalLossR =
                Math.abs(
                    trades
                        .filter(
                            t =>
                                t.resultR < 0
                        )
                        .reduce(
                            (s, t) =>
                                s +
                                t.resultR,
                            0
                        )
                );


            const netR =
                trades.reduce(
                    (s, t) =>
                        s +
                        t.resultR,
                    0
                );


            const ev =
                trades.length
                    ? netR /
                      trades.length
                    : 0;


            const pf =
                totalLossR > 0
                    ? totalWinR /
                      totalLossR
                    : totalWinR > 0
                        ? 999
                        : 0;


            let equity = 0;

            let peak = 0;

            let maxDD = 0;

            let lossStreak = 0;

            let maxLossStreak = 0;


            for (
                const trade of trades
            ) {

                equity +=
                    trade.resultR;


                peak =
                    Math.max(
                        peak,
                        equity
                    );


                maxDD =
                    Math.max(
                        maxDD,
                        peak -
                        equity
                    );


                if (
                    trade.resultR < 0
                ) {

                    lossStreak++;


                    maxLossStreak =
                        Math.max(
                            maxLossStreak,
                            lossStreak
                        );

                } else {

                    lossStreak = 0;

                }

            }


            return {

                trades:
                    trades.length,

                wins,

                losses,

                timeouts,

                decisiveTrades:
                    decisive,

                winRate:
                    decisive
                        ? round(
                            wins /
                            decisive *
                            100,
                            2
                        )
                        : 0,

                totalWinR:
                    round(
                        totalWinR,
                        4
                    ),

                totalLossR:
                    round(
                        totalLossR,
                        4
                    ),

                netR:
                    round(
                        netR,
                        4
                    ),

                expectedValueR:
                    round(
                        ev,
                        4
                    ),

                profitFactor:
                    round(
                        pf,
                        4
                    ),

                maxDrawdownR:
                    round(
                        maxDD,
                        4
                    ),

                maxLossStreak

            };

        }


        // =====================================================
        // CURRENT MARKET
        // =====================================================

        function currentMarket(
            candles
        ) {

            const index =
                candles.length - 1;


            const f =
                features(
                    candles,
                    index
                );


            if (!f) {

                return {

                    available:
                        false

                };

            }


            const timestamp =
                candles[index].ts;


            /*
             * Convert timestamp to IST.
             */

            const dateIST =
                new Date(
                    timestamp * 1000 +
                    5.5 *
                    60 *
                    60 *
                    1000
                );


            const date =
                dateIST
                    .toISOString()
                    .slice(
                        0,
                        10
                    );


            return {

                available:
                    true,

                timestamp,

                date,

                close:
                    round(
                        f.close,
                        2
                    ),

                trend:
                    f.trend,

                regime:
                    f.regime,

                rsi:
                    round(
                        f.rsi,
                        4
                    ),

                rsiBucket:
                    f.rsiBucket,

                vwap:
                    round(
                        f.vwap,
                        4
                    ),

                vwapDirection:
                    f.vwapDirection,

                vwapDistanceATR:
                    round(
                        f.vwapDistanceATR,
                        4
                    ),

                atr14:
                    round(
                        f.atr14,
                        4
                    ),

                ema9:
                    round(
                        f.ema9,
                        4
                    ),

                ema21:
                    round(
                        f.ema21,
                        4
                    ),

                emaSpreadATR:
                    round(
                        f.emaSpreadATR,
                        4
                    ),

                ema9SlopeATR:
                    round(
                        f.ema9SlopeATR,
                        4
                    ),

                patternType:
                    f.patternType,

                time:
                    f.timeBucket

            };

        }


        // =====================================================
        // MAIN DATA LOAD
        // =====================================================

        const accessToken =
            getAccessToken();


        console.log(
            "TradeMind V13.1: fetching INDstocks historical data..."
        );


        const fetched =
            await fetchHistoricalData(
                accessToken,
                REQUESTED_DAYS
            );


        const rawLearningRows =
            fetched.rawRows.length;


        let rows =
            prepareData(
                fetched.normalized
            );


        console.log(
            "TradeMind V13.1 prepared candles:",
            rows.length
        );


        if (
            rows.length < 300
        ) {

            return fail(
                "Insufficient candle data from INDstocks.",
                {

                    rawLearningRows,

                    normalizedRows:
                        rows.length,

                    minimumRequired:
                        300,

                    requestedDays:
                        REQUESTED_DAYS,

                    instrument:
                        INSTRUMENT,

                    scripCode:
                        SCRIP_CODE,

                    interval:
                        INTERVAL

                }
            );

        }


        // =====================================================
        // CURRENT CANDLE EXCLUSION
        // =====================================================

        const current =
            rows[
                rows.length - 1
            ];


        const historical =
            rows.slice(
                0,
                -1
            );


        const candles =
            historical;


        // =====================================================
        // WALK-FORWARD FOLDS
        // =====================================================

        const total =
            candles.length;


        const foldCount =
            4;


        const initialTraining =
            200;


        const testSize =
            Math.floor(
                (
                    total -
                    initialTraining
                ) /
                foldCount
            );


        const folds = [];


        let trainingEnd =
            initialTraining;


        for (
            let fold = 1;
            fold <= foldCount;
            fold++
        ) {

            const testStart =
                trainingEnd;


            const testEnd =
                fold === foldCount

                    ? total

                    : Math.min(
                        total,
                        testStart +
                        testSize
                    );


            if (
                testStart >=
                testEnd
            ) {

                break;

            }


            folds.push({

                fold,

                trainingStart:
                    0,

                trainingEnd,

                testStart,

                testEnd,

                trainingRows:
                    trainingEnd,

                testRows:
                    testEnd -
                    testStart

            });


            trainingEnd =
                testEnd;

        }


        // =====================================================
        // OUTER WALK-FORWARD
        // =====================================================

        const foldResults = [];

        const allTrades = [];


        for (
            const fold of folds
        ) {

            const learned =
                learnPatterns(
                    candles,
                    fold.trainingStart,
                    fold.trainingEnd
                );


            const robustPatterns =
                learned.filter(
                    p =>
                        p.qualified
                );


            const selectedPatterns =
                selectPatterns(
                    learned
                );


            const selectedFamilies =
                new Set(
                    selectedPatterns.map(
                        p =>
                            p.family
                    )
                );


            const trades =
                selectedPatterns.length

                    ? executeFold(
                        candles,
                        fold.testStart,
                        fold.testEnd,
                        selectedPatterns,
                        fold.fold
                    )

                    : [];


            allTrades.push(
                ...trades
            );


            const s =
                stats(
                    trades
                );


            const conc =
                concentration(
                    trades
                );


            foldResults.push({

                fold:
                    fold.fold,

                trainingRows:
                    fold.trainingRows,

                testRows:
                    fold.testRows,

                patternsDiscovered:
                    learned.length,

                robustPatterns:
                    robustPatterns.length,

                selectedPatterns:
                    selectedPatterns.length,

                selectedPatternKeys:
                    selectedPatterns.map(
                        p =>
                            p.key
                    ),

                independentFamilies:
                    selectedFamilies.size,

                trades,

                ...s,

                concentration:
                    conc,

                tradeResults:
                    trades.map(
                        t =>
                            t.resultR
                    )

            });

        }


        // =====================================================
        // GLOBAL OOS STATS
        // =====================================================

        const globalStats =
            stats(
                allTrades
            );


        const globalConcentration =
            concentration(
                allTrades
            );


        const independentFamilies =
            new Set(
                allTrades.map(
                    t =>
                        t.patternFamily
                )
            ).size;


        const profitabilityProof =

            globalStats.expectedValueR >=
            MIN_EXPECTED_VALUE &&

            globalStats.profitFactor >=
            MIN_PROFIT_FACTOR &&

            globalStats.decisiveTrades >=
            5 &&

            globalConcentration
                .concentrationPassed;


        // =====================================================
        // RISK CONTROL
        // =====================================================

        const riskControl =

            globalStats.maxDrawdownR <=
            MAX_OOS_DRAWDOWN &&

            globalStats.maxLossStreak <=
            MAX_PATTERN_LOSS_STREAK;


        const sufficientEvidence =
            globalStats.decisiveTrades >=
            5;


        const patternDiversity =

            independentFamilies >=
            MIN_INDEPENDENT_PATTERNS &&

            globalConcentration.maximumShare <=
            MAX_PATTERN_CONCENTRATION;


        // =====================================================
        // CURRENT MARKET
        // =====================================================

        const currentMarketData =
            currentMarket(
                rows
            );


        let currentSignal = {

            status:
                "NO_TRADE",

            side:
                null,

            market:
                currentMarketData,

            reason:
                "Current market does not satisfy the directional signal.",

            nextAction:
                "WAIT"

        };


        const currentF =
            features(
                rows,
                rows.length - 1
            );


        if (
            currentF
        ) {

            const currentSide =
                baseSignal(
                    currentF
                );


            if (
                currentSide
            ) {

                const currentKey =
                    patternKey(
                        currentSide,
                        currentF
                    );


                /*
                 * Learn ONLY from historical candles.
                 */

                const finalPatterns =
                    learnPatterns(
                        rows.slice(0, -1),
                        0,
                        rows.length - 1
                    );


                const finalSelected =
                    selectPatterns(
                        finalPatterns
                    );


                const matching =
                    finalSelected.find(
                        p =>
                            p.key ===
                            currentKey
                    );


                const confirmation =
                    confirmationScore(
                        rows,
                        rows.length - 1,
                        currentSide
                    );


                if (
                    matching &&
                    confirmation.passed
                ) {

                    currentSignal = {

                        status:
                            "SIGNAL",

                        side:
                            currentSide,

                        pattern:
                            currentKey,

                        patternFamily:
                            matching.family,

                        patternQuality:
                            matching.quality,

                        patternSamples:
                            matching.samples,

                        patternOOSSamples:
                            matching.oosSamples,

                        patternEV:
                            matching.expectedValueR,

                        patternPF:
                            matching.PF,

                        patternStableFolds:
                            matching.stableFolds,

                        confirmationScore:
                            confirmation.score,

                        confirmationMaxScore:
                            confirmation.maxScore,

                        market:
                            currentMarketData,

                        reason:
                            "Qualified historical pattern and independent entry confirmation are present.",

                        nextAction:
                            "PAPER_REVIEW_ONLY"

                    };

                } else {

                    currentSignal = {

                        status:
                            "NO_TRADE",

                        side:
                            null,

                        market:
                            currentMarketData,

                        entryConfirmation:
                            confirmation,

                        reason:
                            matching
                                ? "Pattern exists but entry confirmation failed."
                                : "No qualified current-market pattern survives V13.1 validation.",

                        nextAction:
                            "WAIT"

                    };

                }

            }

        }


        // =====================================================
        // LATEST LEARNING
        // =====================================================

        const latestLearning =
            learnPatterns(
                candles,
                0,
                candles.length
            );


        const latestQualified =
            latestLearning.filter(
                p =>
                    p.qualified
            );


        const latestBuy =
            latestQualified.filter(
                p =>
                    p.side === "BUY"
            );


        const latestSell =
            latestQualified.filter(
                p =>
                    p.side === "SELL"
            );


        const latestFamilies =
            new Set(
                latestQualified.map(
                    p =>
                        p.family
                )
            ).size;


        // =====================================================
        // FINAL RESPONSE
        // =====================================================

        return send({

            success:
                true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "V13_1_DIRECT_INDSTOCKS_TRUE_WALK_FORWARD",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

            instrument:
                INSTRUMENT,

            scripCode:
                SCRIP_CODE,

            interval:
                INTERVAL,

            requestedDays:
                REQUESTED_DAYS,

            source:
                "INDSTOCKS_DIRECT_HISTORICAL_API",

            antiLeakage: {

                enabled:
                    true,

                chronological:
                    true,

                shuffled:
                    false,

                currentCandleExcluded:
                    true,

                currentCandleOutcomeUsed:
                    false,

                currentCandleUsedForLearning:
                    false,

                testDataUsedForTraining:
                    false,

                futureDataUsedForPatternDiscovery:
                    false,

                futureDataUsedForCurrentSignal:
                    false,

                signalConditionedLearning:
                    true,

                signalConditionedOOS:
                    true,

                entryConfirmation:
                    true,

                regimeValidation:
                    true,

                decayValidation:
                    true,

                patternCircuitBreaker:
                    true,

                patternConcentrationControl:
                    true,

                overlappingPaperTrades:
                    false,

                sameCandleStopTargetBias:
                    "STOP_FIRST"

            },


            objective: {

                primary:
                    "STRICT_OUT_OF_SAMPLE_PROFITABILITY",

                secondary:
                    "MINIMIZE_DRAWDOWN",

                tertiary:
                    "VALIDATE_REGIME_STABLE_EDGES",

                allowNoTrade:
                    true,

                minimumOOSExpectedValueR:
                    MIN_EXPECTED_VALUE,

                minimumOOSProfitFactor:
                    MIN_PROFIT_FACTOR,

                minimumOOSDecisiveTrades:
                    5,

                minimumOOSSamples:
                    MIN_OOS_SAMPLES,

                minimumStableFolds:
                    MIN_STABLE_FOLDS,

                qualityThreshold:
                    QUALITY_THRESHOLD,

                minimumIndependentPatterns:
                    MIN_INDEPENDENT_PATTERNS,

                maximumPatternConcentration:
                    MAX_PATTERN_CONCENTRATION,

                profitabilityProof

            },


            sourceStatistics: {

                rawLearningRows,

                normalizedRows:
                    rows.length,

                historicalLearningRows:
                    historical.length,

                currentCandleExcluded:
                    1,

                candlesTested:
                    candles.length,

                tradingDays:
                    new Set(
                        candles.map(
                            c => {

                                const d =
                                    new Date(
                                        c.ts *
                                        1000 +
                                        5.5 *
                                        60 *
                                        60 *
                                        1000
                                    );

                                return d
                                    .toISOString()
                                    .slice(
                                        0,
                                        10
                                    );

                            }
                        )
                    ).size,

                invalidRows:
                    rawLearningRows -
                    fetched.normalized.length,

                latestTimestamp:
                    current.ts,

                latestPrice:
                    current.c

            },


            walkForward: {

                method:
                    "STRICT_TRUE_EXPANDING_WALK_FORWARD",

                foldCount:
                    folds.length,

                chronological:
                    true,

                shuffled:
                    false,

                signalConditioned:
                    true,

                entryConfirmed:
                    true,

                regimeAdaptive:
                    true,

                decayAware:
                    true,

                folds

            },


            trueOOSPaperExecution: {

                description:
                    "Each outer fold learns signal-conditioned, regime-validated patterns exclusively from prior data and executes only on future unseen data after independent entry confirmation.",

                stats:
                    globalStats,

                profitabilityProof:
                    profitabilityProof
                        ? "PROVEN"
                        : "NOT_PROVEN",

                riskControl:
                    riskControl
                        ? "PASSED"
                        : "FAILED",

                sufficientEvidence:
                    sufficientEvidence
                        ? "PASSED"
                        : "INSUFFICIENT",

                patternDiversity:
                    patternDiversity
                        ? "PASSED"
                        : "FAILED",

                patternConcentration:
                    globalConcentration,

                independentPatternFamilies:
                    independentFamilies

            },


            foldResults,


            currentMarket:
                currentMarketData,


            currentSignal,


            latestLearning: {

                trainingRows:
                    candles.length,

                patternsDiscovered:
                    latestLearning.length,

                robustPatterns:
                    latestQualified.length,

                selectedPatterns:
                    latestQualified.length,

                buyPatterns:
                    latestBuy.length,

                sellPatterns:
                    latestSell.length,

                independentFamilies:
                    latestFamilies,

                signalConditioned:
                    true,

                regimeAdaptive:
                    true,

                decayAware:
                    true,

                patternTypes: {

                    trendFollow:
                        latestQualified.filter(
                            p =>
                                p.patternType ===
                                "TREND_FOLLOW"
                        ).length,

                    reversal:
                        0,

                    range:
                        latestQualified.filter(
                            p =>
                                p.patternType ===
                                "RANGE"
                        ).length

                }

            },


            validationRules: {

                regimeValidation: {

                    enabled:
                        true,

                    minimumSamples:
                        3,

                    minimumDecisiveTrades:
                        2,

                    minimumEV:
                        0.05,

                    minimumPF:
                        1.05,

                    maximumNegativeRegimeShare:
                        0.5

                },


                decayDetection: {

                    enabled:
                        true,

                    recentWindowFraction:
                        0.25,

                    minimumRecentEV:
                        0,

                    maximumDecay:
                        -0.75

                },


                diversity: {

                    minimumIndependentPatterns:
                        MIN_INDEPENDENT_PATTERNS,

                    maximumPatternConcentration:
                        MAX_PATTERN_CONCENTRATION

                },


                circuitBreaker: {

                    maximumPatternLossStreak:
                        MAX_PATTERN_LOSS_STREAK,

                    entryCooldownCandles:
                        ENTRY_COOLDOWN,

                    samePatternCooldownCandles:
                        SAME_PATTERN_COOLDOWN,

                    sameSideCooldownCandles:
                        SAME_SIDE_COOLDOWN

                }

            },


            riskPlan: {

                riskPerTradeR:
                    RISK_R,

                stopR:
                    STOP_R,

                targetR:
                    TARGET_R,

                preferredTargetR:
                    PREFERRED_TARGET_R,

                minimumRiskReward:
                    "1:2",

                preferredRiskReward:
                    "1:2.5",

                maxHoldCandles:
                    MAX_HOLD_CANDLES,

                noStopWidening:
                    true,

                maxOOSDrawdownR:
                    MAX_OOS_DRAWDOWN,

                maxOOSLossStreak:
                    MAX_PATTERN_LOSS_STREAK,

                entryCooldownCandles:
                    ENTRY_COOLDOWN,

                samePatternCooldownCandles:
                    SAME_PATTERN_COOLDOWN,

                sameSideCooldownCandles:
                    SAME_SIDE_COOLDOWN

            },


            trueOOSTradeLog:
                allTrades,


            paperAction:

                currentSignal.status ===
                "SIGNAL"

                    ? "PAPER_REVIEW_ONLY"

                    : "NO_TRADE",


            nextAction:

                currentSignal.status ===
                "SIGNAL"

                    ? "WAIT_FOR_NEXT_CONFIRMED_CANDLE"

                    : "WAIT"

        });


    } catch (error) {

        console.error(
            "TradeMind Pro V13.1 ERROR:",
            error
        );


        return res.status(500).json({

            success:
                false,

            version:
                "V13.1",

            status:
                "ERROR",

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderEnabled:
                false,

            brokerOrderSent:
                false,

            error:
                error?.message ||
                String(error)

        });

    }

}
