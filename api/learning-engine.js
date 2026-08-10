/*
TradeMind Pro
V11.2 Statistical Pattern Learning Engine

Purpose:
- Learn historical NIFTY 50 patterns
- Discover statistically strong BUY/SELL setups
- Train / validate / test
- Prevent obvious overfitting
- Paper analysis only

NO REAL ORDERS.
*/

const VERSION = "V11.2";

const INSTRUMENT = "NIFTY 50";
const SCRIP_CODE = "NIDX_40000001";

const MIN_PATTERN_SAMPLES = 30;

const TRAIN_RATIO = 0.70;
const VALIDATION_RATIO = 0.15;
const TEST_RATIO = 0.15;


// =====================================================
// BASIC HELPERS
// =====================================================

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}


function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}


function safeRate(wins, total) {
    if (!total) return 0;
    return (wins / total) * 100;
}


function round(v, decimals = 2) {
    if (!Number.isFinite(v)) return 0;

    const p = Math.pow(10, decimals);

    return Math.round(v * p) / p;
}


function normalizeTimestamp(v) {

    let n = Number(v);

    if (!Number.isFinite(n)) {
        return null;
    }

    // Seconds -> milliseconds
    if (n < 100000000000) {
        n *= 1000;
    }

    return n;
}


function getISTDate(timestamp) {

    return new Date(timestamp)
        .toLocaleDateString(
            "en-CA",
            {
                timeZone: "Asia/Kolkata"
            }
        );
}


// =====================================================
// CANDLE VALIDATION
// =====================================================

function validRawCandle(candle) {

    if (Array.isArray(candle)) {

        if (candle.length < 6) {
            return false;
        }

        const timestamp =
            normalizeTimestamp(candle[0]);

        const open = num(candle[1]);
        const high = num(candle[2]);
        const low = num(candle[3]);
        const close = num(candle[4]);
        const volume = num(candle[5]);

        if (
            timestamp === null ||
            open === null ||
            high === null ||
            low === null ||
            close === null ||
            volume === null
        ) {
            return false;
        }

        return high >= low;
    }


    if (
        candle &&
        typeof candle === "object"
    ) {

        const timestamp =
            normalizeTimestamp(
                candle.timestamp ??
                candle.ts ??
                candle.time
            );

        const open =
            num(
                candle.open ??
                candle.o
            );

        const high =
            num(
                candle.high ??
                candle.h
            );

        const low =
            num(
                candle.low ??
                candle.l
            );

        const close =
            num(
                candle.close ??
                candle.c
            );

        const volume =
            num(
                candle.volume ??
                candle.v
            );

        if (
            timestamp === null ||
            open === null ||
            high === null ||
            low === null ||
            close === null ||
            volume === null
        ) {
            return false;
        }

        return high >= low;
    }

    return false;
}


// =====================================================
// NORMALIZE CANDLE
// =====================================================

function normalizeCandle(candle) {

    let timestamp;
    let open;
    let high;
    let low;
    let close;
    let volume;


    if (Array.isArray(candle)) {

        timestamp =
            normalizeTimestamp(candle[0]);

        open = num(candle[1]);
        high = num(candle[2]);
        low = num(candle[3]);
        close = num(candle[4]);
        volume = num(candle[5]);

    } else {

        timestamp =
            normalizeTimestamp(
                candle.timestamp ??
                candle.ts ??
                candle.time
            );

        open =
            num(
                candle.open ??
                candle.o
            );

        high =
            num(
                candle.high ??
                candle.h
            );

        low =
            num(
                candle.low ??
                candle.l
            );

        close =
            num(
                candle.close ??
                candle.c
            );

        volume =
            num(
                candle.volume ??
                candle.v
            );
    }


    return {
        timestamp,
        date: getISTDate(timestamp),
        open,
        high,
        low,
        close,
        volume
    };
}


// =====================================================
// EMA
// =====================================================

function ema(values, period) {

    if (
        !Array.isArray(values) ||
        values.length < period
    ) {
        return null;
    }

    let value = 0;

    for (let i = 0; i < period; i++) {
        value += values[i];
    }

    value /= period;

    const multiplier =
        2 / (period + 1);

    for (
        let i = period;
        i < values.length;
        i++
    ) {

        value =
            (
                values[i] - value
            ) *
            multiplier +
            value;
    }

    return value;
}


// =====================================================
// RSI
// =====================================================

function calculateRSI(closes, period = 14) {

    if (
        closes.length <
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
            closes[i] -
            closes[i - 1];

        if (change >= 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    let avgGain =
        gains / period;

    let avgLoss =
        losses / period;

    for (
        let i = period + 1;
        i < closes.length;
        i++
    ) {

        const change =
            closes[i] -
            closes[i - 1];

        const gain =
            Math.max(change, 0);

        const loss =
            Math.max(-change, 0);

        avgGain =
            (
                avgGain *
                (period - 1) +
                gain
            ) / period;

        avgLoss =
            (
                avgLoss *
                (period - 1) +
                loss
            ) / period;
    }

    if (avgLoss === 0) {
        return 100;
    }

    const rs =
        avgGain /
        avgLoss;

    return 100 -
        (
            100 /
            (1 + rs)
        );
}


// =====================================================
// ATR
// =====================================================

function calculateATR(candles, period = 14) {

    if (
        candles.length <
        period + 1
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

        trs.push(tr);
    }

    if (trs.length < period) {
        return null;
    }

    let atr = 0;

    for (
        let i = 0;
        i < period;
        i++
    ) {
        atr += trs[i];
    }

    atr /= period;

    for (
        let i = period;
        i < trs.length;
        i++
    ) {

        atr =
            (
                atr *
                (period - 1) +
                trs[i]
            ) / period;
    }

    return atr;
}


// =====================================================
// VWAP
// =====================================================

function calculateVWAP(candles) {

    if (!candles.length) {
        return null;
    }

    const latestDate =
        candles[candles.length - 1].date;

    let cumulativePV = 0;
    let cumulativeVolume = 0;

    for (const candle of candles) {

        if (candle.date !== latestDate) {
            continue;
        }

        const typical =
            (
                candle.high +
                candle.low +
                candle.close
            ) / 3;

        cumulativePV +=
            typical *
            candle.volume;

        cumulativeVolume +=
            candle.volume;
    }

    if (!cumulativeVolume) {
        return null;
    }

    return (
        cumulativePV /
        cumulativeVolume
    );
}


// =====================================================
// TREND
// =====================================================

function getTrend(ema9, ema21) {

    if (
        ema9 === null ||
        ema21 === null
    ) {
        return "UNKNOWN";
    }

    if (ema9 > ema21) {
        return "BULLISH";
    }

    if (ema9 < ema21) {
        return "BEARISH";
    }

    return "SIDEWAYS";
}


// =====================================================
// REGIME
// =====================================================

function getRegime(
    atr,
    close,
    emaSpread
) {

    if (
        atr === null ||
        close === null
    ) {
        return "UNKNOWN";
    }

    const atrPercent =
        (
            atr /
            close
        ) * 100;

    const spreadPercent =
        Math.abs(
            emaSpread
        ) /
        close *
        100;

    if (
        spreadPercent > 0.04 &&
        atrPercent > 0.04
    ) {
        return "TRENDING";
    }

    if (
        atrPercent < 0.025
    ) {
        return "LOW_VOLATILITY";
    }

    return "RANGING";
}


// =====================================================
// FEATURE ENGINE
// =====================================================

function buildFeatureRow(
    candles,
    index
) {

    if (index < 30) {
        return null;
    }

    const current =
        candles[index];

    const closes =
        candles
            .slice(0, index + 1)
            .map(c => c.close);

    const ema9 =
        ema(closes, 9);

    const ema21 =
        ema(closes, 21);

    const previousCloses =
        candles
            .slice(
                Math.max(
                    0,
                    index - 3
                ),
                index + 1
            )
            .map(c => c.close);

    const previousEMA9 =
        ema(
            previousCloses,
            Math.min(
                3,
                previousCloses.length
            )
        );

    const rsi =
        calculateRSI(
            closes,
            14
        );

    const previousRSI =
        index > 0
            ? calculateRSI(
                candles
                    .slice(
                        0,
                        index
                    )
                    .map(c => c.close),
                14
            )
            : null;

    const atr =
        calculateATR(
            candles.slice(
                0,
                index + 1
            ),
            14
        );

    const vwap =
        calculateVWAP(
            candles.slice(
                0,
                index + 1
            )
        );

    if (
        ema9 === null ||
        ema21 === null ||
        rsi === null ||
        atr === null ||
        vwap === null
    ) {
        return null;
    }


    const emaSpread =
        ema9 -
        ema21;

    const emaSpreadATR =
        emaSpread /
        atr;

    const ema9Slope =
        previousEMA9 !== null
            ? ema9 -
              previousEMA9
            : 0;

    const ema9SlopeATR =
        ema9Slope /
        atr;

    const ema21Previous =
        ema(
            candles
                .slice(
                    0,
                    Math.max(
                        9,
                        index - 3
                    )
                )
                .map(
                    c => c.close
                ),
            21
        );

    const ema21Slope =
        ema21Previous !== null
            ? ema21 -
              ema21Previous
            : 0;

    const ema21SlopeATR =
        ema21Slope /
        atr;

    const rsiChange =
        previousRSI !== null
            ? rsi -
              previousRSI
            : 0;

    const vwapDistance =
        current.close -
        vwap;

    const vwapDistanceATR =
        vwapDistance /
        atr;

    const ema9Distance =
        current.close -
        ema9;

    const ema9DistanceATR =
        ema9Distance /
        atr;

    const ema21Distance =
        current.close -
        ema21;

    const ema21DistanceATR =
        ema21Distance /
        atr;

    const range =
        current.high -
        current.low;

    const rangeATR =
        range /
        atr;

    const body =
        Math.abs(
            current.close -
            current.open
        );

    const bodyRatio =
        range > 0
            ? body / range
            : 0;

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
                current.close -
                current.low
            ) / range
            : 0;

    const bullish =
        current.close >
        current.open;

    const bearish =
        current.close <
        current.open;

    const trend =
        getTrend(
            ema9,
            ema21
        );

    const regime =
        getRegime(
            atr,
            current.close,
            emaSpread
        );

    const dateObj =
        new Date(
            current.timestamp
        );

    const istTime =
        new Date(
            dateObj.toLocaleString(
                "en-US",
                {
                    timeZone:
                        "Asia/Kolkata"
                }
            )
        );

    const hour =
        istTime.getHours();

    const minute =
        istTime.getMinutes();

    const minutesFromOpen =
        (
            hour * 60 +
            minute
        ) -
        (
            9 * 60 +
            15
        );


    return {

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

        ema9,

        ema21,

        emaSpread,

        emaSpreadATR,

        ema9Slope,

        ema21Slope,

        ema9SlopeATR,

        ema21SlopeATR,

        rsi14:
            rsi,

        previousRSI,

        rsiChange,

        atr14:
            atr,

        vwap,

        vwapDistance,

        vwapDistanceATR,

        ema9Distance,

        ema9DistanceATR,

        ema21Distance,

        ema21DistanceATR,

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

        trend,

        regime,

        hour,

        minute,

        minutesFromOpen
    };
}


// =====================================================
// BUCKETING
// =====================================================

function bucketRSI(rsi) {

    if (rsi < 30) return "<30";
    if (rsi < 35) return "30-35";
    if (rsi < 40) return "35-40";
    if (rsi < 45) return "40-45";
    if (rsi < 50) return "45-50";
    if (rsi < 55) return "50-55";
    if (rsi < 60) return "55-60";
    if (rsi < 65) return "60-65";
    if (rsi < 70) return "65-70";

    return "70+";
}


function bucketSpread(v) {

    const x =
        Math.abs(v);

    if (x < 0.25) return "<0.25";
    if (x < 0.50) return "0.25-0.50";
    if (x < 0.75) return "0.50-0.75";
    if (x < 1.00) return "0.75-1.00";

    return "1.00+";
}


function bucketSlope(v) {

    const x =
        Math.abs(v);

    if (x < 0.10) return "<0.10";
    if (x < 0.25) return "0.10-0.25";
    if (x < 0.50) return "0.25-0.50";
    if (x < 0.75) return "0.50-0.75";

    return "0.75+";
}


function bucketVWAP(v) {

    if (v < -1.0) return "<-1ATR";
    if (v < -0.25) return "-1 to -0.25";
    if (v < 0.25) return "-0.25 to 0.25";
    if (v < 1.0) return "0.25 to 1";
    
    return ">1ATR";
}


function bucketBody(v) {

    if (v < 0.20) return "<20%";
    if (v < 0.40) return "20-40%";
    if (v < 0.60) return "40-60%";
    if (v < 0.80) return "60-80%";

    return "80%+";
}


function bucketTime(hour) {

    if (hour < 10) {
        return "OPEN";
    }

    if (hour < 11) {
        return "MORNING";
    }

    if (hour < 13) {
        return "MIDDAY";
    }

    if (hour < 14) {
        return "AFTERNOON";
    }

    return "CLOSE";
}


// =====================================================
// CREATE PATTERN KEY
// =====================================================

function createPattern(row, side) {

    return [

        side,

        row.trend,

        row.regime,

        bucketRSI(
            row.rsi14
        ),

        bucketSpread(
            row.emaSpreadATR
        ),

        bucketSlope(
            row.ema9SlopeATR
        ),

        bucketVWAP(
            row.vwapDistanceATR
        ),

        bucketBody(
            row.bodyRatio
        ),

        bucketTime(
            row.hour
        )

    ].join("|");
}


// =====================================================
// OUTCOME SIMULATION
// =====================================================

function evaluateFuture(
    candles,
    index
) {

    const entry =
        candles[index].close;

    const atr =
        calculateATR(
            candles.slice(
                0,
                index + 1
            ),
            14
        );

    if (!atr) {
        return null;
    }

    const risk =
        atr * 1.5;

    const reward =
        atr * 2.0;

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

    const futureBars =
        Math.min(
            12,
            candles.length -
            index -
            1
        );

    let buyOutcome =
        "TIMEOUT";

    let sellOutcome =
        "TIMEOUT";


    for (
        let j = 1;
        j <= futureBars;
        j++
    ) {

        const candle =
            candles[index + j];


        if (
            buyOutcome ===
            "TIMEOUT"
        ) {

            if (
                candle.low <=
                buyStop
            ) {
                buyOutcome =
                    "LOSS";
            }

            else if (
                candle.high >=
                buyTarget
            ) {
                buyOutcome =
                    "WIN";
            }
        }


        if (
            sellOutcome ===
            "TIMEOUT"
        ) {

            if (
                candle.high >=
                sellStop
            ) {
                sellOutcome =
                    "LOSS";
            }

            else if (
                candle.low <=
                sellTarget
            ) {
                sellOutcome =
                    "WIN";
            }
        }
    }


    let preferredDirection =
        "NONE";

    let label =
        "NO_TRADE";

    if (
        buyOutcome ===
        "WIN" &&
        sellOutcome !==
        "WIN"
    ) {

        preferredDirection =
            "BUY";

        label =
            "BUY_WIN";
    }

    else if (
        sellOutcome ===
        "WIN" &&
        buyOutcome !==
        "WIN"
    ) {

        preferredDirection =
            "SELL";

        label =
            "SELL_WIN";
    }

    else if (
        buyOutcome ===
        "WIN" &&
        sellOutcome ===
        "WIN"
    ) {

        label =
            "BOTH_WIN";
    }

    else if (
        buyOutcome ===
        "LOSS" &&
        sellOutcome ===
        "LOSS"
    ) {

        label =
            "BOTH_LOSS";
    }


    return {

        buyOutcome,

        sellOutcome,

        preferredDirection,

        label
    };
}


// =====================================================
// PATTERN ANALYSIS
// =====================================================

function analysePatterns(
    rows
) {

    const patterns =
        new Map();


    for (const row of rows) {

        const key =
            createPattern(
                row,
                row.outcome.preferredDirection
            );

        if (
            row.outcome.preferredDirection ===
            "NONE"
        ) {
            continue;
        }


        if (!patterns.has(key)) {

            patterns.set(
                key,
                {
                    key,

                    side:
                        row.outcome
                            .preferredDirection,

                    samples: 0,

                    wins: 0,

                    losses: 0,

                    winRate: 0,

                    profitFactor: 0,

                    totalReward: 0,

                    totalRisk: 0
                }
            );
        }


        const p =
            patterns.get(key);

        p.samples++;


        if (
            row.outcome
                .preferredDirection ===
            p.side
        ) {

            const outcome =
                p.side === "BUY"
                    ? row.outcome.buyOutcome
                    : row.outcome.sellOutcome;

            if (
                outcome ===
                "WIN"
            ) {

                p.wins++;

                p.totalReward +=
                    2.0;
            }

            else if (
                outcome ===
                "LOSS"
            ) {

                p.losses++;

                p.totalRisk +=
                    1.5;
            }
        }
    }


    const result = [];


    for (
        const p of patterns.values()
    ) {

        if (
            p.samples <
            MIN_PATTERN_SAMPLES
        ) {
            continue;
        }


        p.winRate =
            safeRate(
                p.wins,
                p.wins +
                p.losses
            );


        p.profitFactor =
            p.totalRisk > 0
                ? p.totalReward /
                  p.totalRisk
                : 0;


        /*
        Confidence score:

        - Win rate
        - Sample size
        - Profit factor
        */

        const sampleConfidence =
            clamp(
                p.samples /
                100,
                0,
                1
            );

        const winConfidence =
            clamp(
                (
                    p.winRate -
                    50
                ) / 25,
                0,
                1
            );

        const pfConfidence =
            clamp(
                (
                    p.profitFactor -
                    1
                ) / 1.5,
                0,
                1
            );


        p.confidence =
            (
                sampleConfidence *
                30 +
                winConfidence *
                45 +
                pfConfidence *
                25
            );


        result.push(p);
    }


    return result.sort(
        (
            a,
            b
        ) =>
            b.confidence -
            a.confidence
    );
}


// =====================================================
// FETCH HISTORICAL DATA
// =====================================================

async function fetchHistoricalData(
    days
) {

    /*
    IMPORTANT:

    This endpoint expects the same
    historical API configuration used
    by V11.1.

    Replace API_URL only if your
    existing V11.1 endpoint uses a
    different source.
    */

    const apiUrl =
        process.env.INDSTOCKS_API_URL;

    const token =
        process.env.INDSTOCKS_API_TOKEN;


    if (
        !apiUrl ||
        !token
    ) {

        throw new Error(
            "INDSTOCKS_API_URL or INDSTOCKS_API_TOKEN is missing"
        );
    }


    const end =
        new Date();

    const start =
        new Date(
            end.getTime() -
            days *
            24 *
            60 *
            60 *
            1000
        );


    const url =
        new URL(apiUrl);

    url.searchParams.set(
        "scripCode",
        SCRIP_CODE
    );

    url.searchParams.set(
        "interval",
        "5minute"
    );

    url.searchParams.set(
        "startTime",
        start.toISOString()
    );

    url.searchParams.set(
        "endTime",
        end.toISOString()
    );


    const response =
        await fetch(
            url.toString(),
            {
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );


    if (!response.ok) {

        throw new Error(
            `Historical API failed: ${response.status}`
        );
    }


    const data =
        await response.json();


    let raw =
        data.candles ??
        data.data ??
        data.results ??
        data;


    if (
        !Array.isArray(raw)
    ) {

        throw new Error(
            "Historical API did not return a candle array"
        );
    }


    return raw
        .filter(
            validRawCandle
        )
        .map(
            normalizeCandle
        )
        .sort(
            (
                a,
                b
            ) =>
                a.timestamp -
                b.timestamp
        );
}


// =====================================================
// MAIN
// =====================================================

export default async function handler(
    req,
    res
) {

    try {

        const days =
            Math.max(
                7,
                Math.min(
                    30,
                    Number(
                        req.query.days ||
                        30
                    )
                )
            );


        const candles =
            await fetchHistoricalData(
                days
            );


        if (
            candles.length <
            100
        ) {

            return res.status(400).json({

                success: false,

                version: VERSION,

                error:
                    "Not enough historical candles",

                candles:
                    candles.length
            });
        }


        const rows = [];


        /*
        Build feature rows.
        */

        for (
            let i = 30;
            i <
            candles.length - 12;
            i++
        ) {

            const features =
                buildFeatureRow(
                    candles,
                    i
                );

            if (!features) {
                continue;
            }


            const outcome =
                evaluateFuture(
                    candles,
                    i
                );

            if (!outcome) {
                continue;
            }


            rows.push({

                ...features,

                outcome
            });
        }


        /*
        Chronological split.

        NEVER shuffle financial
        time-series data.
        */

        const total =
            rows.length;

        const trainEnd =
            Math.floor(
                total *
                TRAIN_RATIO
            );

        const validationEnd =
            trainEnd +
            Math.floor(
                total *
                VALIDATION_RATIO
            );


        const trainingRows =
            rows.slice(
                0,
                trainEnd
            );

        const validationRows =
            rows.slice(
                trainEnd,
                validationEnd
            );

        const testRows =
            rows.slice(
                validationEnd
            );


        /*
        Discover patterns ONLY
        from training data.
        */

        const trainingPatterns =
            analysePatterns(
                trainingRows
            );


        /*
        Evaluate discovered
        patterns on unseen data.
        */

        function evaluateSet(
            dataset
        ) {

            const stats = {

                matchedRows: 0,

                wins: 0,

                losses: 0,

                winRate: 0
            };


            for (
                const row of dataset
            ) {

                const side =
                    row.outcome
                        .preferredDirection;

                if (
                    side ===
                    "NONE"
                ) {
                    continue;
                }


                const key =
                    createPattern(
                        row,
                        side
                    );


                const pattern =
                    trainingPatterns
                        .find(
                            p =>
                                p.key ===
                                key
                        );


                if (!pattern) {
                    continue;
                }


                stats.matchedRows++;


                const outcome =
                    side === "BUY"
                        ? row.outcome.buyOutcome
                        : row.outcome.sellOutcome;


                if (
                    outcome ===
                    "WIN"
                ) {

                    stats.wins++;
                }

                else if (
                    outcome ===
                    "LOSS"
                ) {

                    stats.losses++;
                }
            }


            stats.winRate =
                safeRate(
                    stats.wins,
                    stats.wins +
                    stats.losses
                );


            return stats;
        }


        const validationStats =
            evaluateSet(
                validationRows
            );


        const testStats =
            evaluateSet(
                testRows
            );


        /*
        Best patterns.
        */

        const buyPatterns =
            trainingPatterns
                .filter(
                    p =>
                        p.side ===
                        "BUY"
                );

        const sellPatterns =
            trainingPatterns
                .filter(
                    p =>
                        p.side ===
                        "SELL"
                );


        /*
        Dataset statistics.
        */

        function datasetStats(
            dataset
        ) {

            let buyWins = 0;
            let buyLosses = 0;

            let sellWins = 0;
            let sellLosses = 0;

            let bothLoss = 0;
            let bothWin = 0;

            let noTrade = 0;


            for (
                const row of dataset
            ) {

                switch (
                    row.outcome.label
                ) {

                    case "BUY_WIN":
                        buyWins++;
                        break;

                    case "SELL_WIN":
                        sellWins++;
                        break;

                    case "BOTH_WIN":
                        bothWin++;
                        break;

                    case "BOTH_LOSS":
                        bothLoss++;
                        break;

                    default:
                        noTrade++;
                }
            }


            return {

                totalRows:
                    dataset.length,

                buyWins,

                buyLosses,

                sellWins,

                sellLosses,

                bothWin,

                bothLoss,

                noTrade
            };
        }


        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "STATISTICAL_LEARNING",

            paperOnly:
                true,

            realOrders:
                false,

            instrument:
                INSTRUMENT,

            scripCode:
                SCRIP_CODE,

            interval:
                "5minute",

            requestedDays:
                days,

            candlesTested:
                candles.length,

            learningRows:
                rows.length,


            split: {

                trainingRows:
                    trainingRows.length,

                validationRows:
                    validationRows.length,

                testRows:
                    testRows.length,

                trainingPercent:
                    round(
                        (
                            trainingRows.length /
                            total
                        ) * 100
                    ),

                validationPercent:
                    round(
                        (
                            validationRows.length /
                            total
                        ) * 100
                    ),

                testPercent:
                    round(
                        (
                            testRows.length /
                            total
                        ) * 100
                    )
            },


            datasetStatistics: {

                all:
                    datasetStats(
                        rows
                    ),

                training:
                    datasetStats(
                        trainingRows
                    ),

                validation:
                    datasetStats(
                        validationRows
                    ),

                test:
                    datasetStats(
                        testRows
                    )
            },


            learning: {

                minimumPatternSamples:
                    MIN_PATTERN_SAMPLES,

                patternsDiscovered:
                    trainingPatterns.length,

                buyPatterns:
                    buyPatterns.length,

                sellPatterns:
                    sellPatterns.length,

                topBuyPatterns:
                    buyPatterns
                        .slice(
                            0,
                            10
                        ),

                topSellPatterns:
                    sellPatterns
                        .slice(
                            0,
                            10
                        )
            },


            validation:

                validationStats,


            finalTest:

                testStats,


            interpretation: {

                trainingWinRate:

                    round(
                        safeRate(
                            trainingPatterns.reduce(
                                (
                                    sum,
                                    p
                                ) =>
                                    sum +
                                    p.wins,
                                0
                            ),

                            trainingPatterns.reduce(
                                (
                                    sum,
                                    p
                                ) =>
                                    sum +
                                    p.wins +
                                    p.losses,
                                0
                            )
                        )
                    ),

                validationWinRate:
                    round(
                        validationStats.winRate
                    ),

                finalTestWinRate:
                    round(
                        testStats.winRate
                    ),

                recommendation:

                    testStats.matchedRows >= 30 &&
                    testStats.winRate >= 55

                        ? "PROMISING"

                        : "NEEDS_MORE_RESEARCH"
            }

        });

    }

    catch (error) {

        console.error(
            "V11.2 ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            version: VERSION,

            error:
                error.message,

            paperOnly:
                true,

            realOrders:
                false
        });
    }
}
