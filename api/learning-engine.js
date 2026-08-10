/*
TradeMind Pro
V11.6 Selective Trade Discovery Engine

V11.1
    Historical learning dataset
        ↓
V11.2
    Statistical learning
        ↓
V11.3
    Independent BUY / SELL
        ↓
V11.4
    Hierarchical learning
        ↓
V11.5
    Expected-value learning
        ↓
V11.6
    SELECTIVE TRADE DISCOVERY

OBJECTIVE:

    Do NOT maximize trade frequency.

    Do NOT blindly maximize win rate.

    Instead:

        MAXIMIZE EXPECTED VALUE
        MINIMIZE LOSSES
        CONTROL DRAWDOWN
        SELECT ONLY REPEATABLE SETUPS
        OTHERWISE -> NO TRADE

PAPER ONLY
NO REAL ORDERS
*/


const VERSION = "V11.6";


// =====================================================
// CONFIGURATION
// =====================================================

const MIN_SAMPLES = 20;

const MIN_DECISIVE = 12;

const ROBUST_MIN_SAMPLES = 30;

const ROBUST_MIN_DECISIVE = 18;

const TRAIN_RATIO = 0.70;

const VALIDATION_RATIO = 0.15;

const TEST_RATIO = 0.15;


// Bayesian prior.
// We intentionally shrink small samples toward 50%.
const PRIOR_WIN_RATE = 50;

const PRIOR_STRENGTH = 20;


// Maximum practical reward/loss used when
// converting historical excursions to R.
// This prevents one extreme candle from
// dominating the statistics.
const MAX_REWARD_R = 3.0;

const MAX_LOSS_R = 2.0;


// =====================================================
// HELPERS
// =====================================================

function round(value, decimals = 2) {

    if (!Number.isFinite(value)) {
        return 0;
    }

    const p = Math.pow(10, decimals);

    return Math.round(value * p) / p;
}


function safeNumber(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function safeRate(wins, total) {

    if (!total) {
        return 0;
    }

    return (
        wins / total
    ) * 100;
}


function clamp(value, min, max) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


// =====================================================
// BUCKETS
// =====================================================

function bucketRSI(value) {

    const x = safeNumber(value, 50);

    if (x < 30) return "RSI_<30";
    if (x < 35) return "RSI_30_35";
    if (x < 40) return "RSI_35_40";
    if (x < 45) return "RSI_40_45";
    if (x < 50) return "RSI_45_50";
    if (x < 55) return "RSI_50_55";
    if (x < 60) return "RSI_55_60";
    if (x < 65) return "RSI_60_65";
    if (x < 70) return "RSI_65_70";

    return "RSI_70+";
}


function bucketTrend(row) {

    return row.trend || "UNKNOWN";
}


function bucketRegime(row) {

    return row.regime || "UNKNOWN";
}


function bucketVWAP(value) {

    const x = safeNumber(value);

    if (x < -2) return "VWAP_<-2";
    if (x < -1) return "VWAP_-2_-1";
    if (x < -0.25) return "VWAP_-1_-025";
    if (x < 0.25) return "VWAP_-025_025";
    if (x < 1) return "VWAP_025_1";
    if (x < 2) return "VWAP_1_2";

    return "VWAP_>2";
}


function bucketSpread(value) {

    const x =
        Math.abs(
            safeNumber(value)
        );

    if (x < 0.25) return "SPREAD_<025";
    if (x < 0.50) return "SPREAD_025_050";
    if (x < 0.75) return "SPREAD_050_075";
    if (x < 1.00) return "SPREAD_075_100";

    return "SPREAD_1+";
}


function bucketSlope(value) {

    const x =
        Math.abs(
            safeNumber(value)
        );

    if (x < 0.10) return "SLOPE_<010";
    if (x < 0.25) return "SLOPE_010_025";
    if (x < 0.50) return "SLOPE_025_050";
    if (x < 0.75) return "SLOPE_050_075";

    return "SLOPE_075+";
}


function bucketBody(value) {

    const x =
        safeNumber(value);

    if (x < 0.20) return "BODY_<20";
    if (x < 0.40) return "BODY_20_40";
    if (x < 0.60) return "BODY_40_60";
    if (x < 0.80) return "BODY_60_80";

    return "BODY_80+";
}


function bucketClose(value) {

    const x =
        safeNumber(value);

    if (x < 0.20) return "CLOSE_LOW";
    if (x < 0.40) return "CLOSE_LOWER";
    if (x < 0.60) return "CLOSE_MIDDLE";
    if (x < 0.80) return "CLOSE_UPPER";

    return "CLOSE_HIGH";
}


function bucketTime(hour) {

    const h =
        safeNumber(hour);

    if (h < 10) {
        return "TIME_OPEN";
    }

    if (h < 11) {
        return "TIME_MORNING";
    }

    if (h < 13) {
        return "TIME_MIDDAY";
    }

    if (h < 14) {
        return "TIME_AFTERNOON";
    }

    return "TIME_CLOSE";
}


function bucketSlopeDirection(value) {

    const x =
        safeNumber(value);

    if (x < -0.75) return "SLOPE_STRONG_DOWN";
    if (x < -0.25) return "SLOPE_DOWN";
    if (x <= 0.25) return "SLOPE_FLAT";
    if (x <= 0.75) return "SLOPE_UP";

    return "SLOPE_STRONG_UP";
}


function bucketRange(value) {

    const x =
        safeNumber(value);

    if (x < 0.50) return "RANGE_SMALL";
    if (x < 1.00) return "RANGE_NORMAL";
    if (x < 1.50) return "RANGE_EXPANDED";

    return "RANGE_LARGE";
}


// =====================================================
// FEATURE REPRESENTATION
// =====================================================

function getFeatures(row) {

    return {

        trend:
            bucketTrend(row),

        regime:
            bucketRegime(row),

        rsi:
            bucketRSI(row.rsi14),

        vwap:
            bucketVWAP(row.vwapDistanceATR),

        spread:
            bucketSpread(row.emaSpreadATR),

        slope:
            bucketSlope(row.ema9SlopeATR),

        slopeDirection:
            bucketSlopeDirection(row.ema9SlopeATR),

        body:
            bucketBody(row.bodyRatio),

        close:
            bucketClose(row.closeLocation),

        time:
            bucketTime(row.hour),

        range:
            bucketRange(row.rangeATR)
    };
}


// =====================================================
// PATTERN DEFINITIONS
// =====================================================

/*
V11.6 intentionally avoids huge patterns.

We test:

LEVEL 1
Single features

LEVEL 2
Pairs of features

This gives us repeatable patterns.
*/


const SINGLE_FEATURES = [
    "trend",
    "regime",
    "rsi",
    "vwap",
    "spread",
    "slopeDirection",
    "body",
    "close",
    "time",
    "range"
];


const PAIR_FEATURES = [

    ["trend", "regime"],

    ["trend", "rsi"],

    ["trend", "vwap"],

    ["trend", "spread"],

    ["trend", "slopeDirection"],

    ["trend", "body"],

    ["trend", "time"],

    ["regime", "rsi"],

    ["regime", "vwap"],

    ["regime", "spread"],

    ["regime", "time"],

    ["rsi", "vwap"],

    ["rsi", "slopeDirection"],

    ["rsi", "time"],

    ["vwap", "spread"],

    ["vwap", "slopeDirection"],

    ["vwap", "time"],

    ["spread", "slopeDirection"],

    ["spread", "time"],

    ["slopeDirection", "body"],

    ["slopeDirection", "close"],

    ["body", "close"],

    ["body", "time"],

    ["close", "time"],

    ["range", "time"]

];


// =====================================================
// PATTERN KEY
// =====================================================

function createPatternKey(
    side,
    features,
    names
) {

    return [

        side,

        ...names.map(
            name =>
                `${name}=${features[name]}`
        )

    ].join("|");
}


// =====================================================
// OUTCOME
// =====================================================

function getOutcome(row) {

    if (
        row &&
        row.outcome &&
        typeof row.outcome === "object"
    ) {

        return row.outcome;
    }


    return {

        label:
            row.label ||
            "NO_TRADE",

        preferredDirection:
            row.preferredDirection ||
            "NONE",

        buyOutcome:
            row.buyOutcome ||
            "TIMEOUT",

        sellOutcome:
            row.sellOutcome ||
            "TIMEOUT",

        maxFavorableBuy:
            safeNumber(
                row.maxFavorableBuy
            ),

        maxAdverseBuy:
            safeNumber(
                row.maxAdverseBuy
            ),

        maxFavorableSell:
            safeNumber(
                row.maxFavorableSell
            ),

        maxAdverseSell:
            safeNumber(
                row.maxAdverseSell
            )
    };
}


// =====================================================
// SIDE OUTCOME
// =====================================================

function getSideResult(
    row,
    side
) {

    const outcome =
        getOutcome(row);


    const result =
        side === "BUY"
            ? outcome.buyOutcome
            : outcome.sellOutcome;


    const favorable =
        side === "BUY"
            ? safeNumber(
                outcome.maxFavorableBuy
            )
            : safeNumber(
                outcome.maxFavorableSell
            );


    const adverse =
        side === "BUY"
            ? safeNumber(
                outcome.maxAdverseBuy
            )
            : safeNumber(
                outcome.maxAdverseSell
            );


    return {

        result,

        favorable,

        adverse
    };
}


// =====================================================
// BUILD PATTERN MAP
// =====================================================

function createPatternRecord(
    key,
    side,
    level,
    names
) {

    return {

        key,

        side,

        level,

        features:
            names,

        samples: 0,

        wins: 0,

        losses: 0,

        timeouts: 0,

        decisive: 0,

        winRate: 0,

        bayesianWinRate: 0,

        averageWinR: 0,

        averageLossR: 0,

        expectedValueR: 0,

        profitFactor: 0,

        timeoutRate: 0,

        maxAdverseR: 0,

        totalWinR: 0,

        totalLossR: 0,

        qualityScore: 0,

        confidence: 0
    };
}


// =====================================================
// PATTERN ACCUMULATION
// =====================================================

function addObservation(
    pattern,
    result,
    risk
) {

    pattern.samples++;


    if (
        result === "WIN"
    ) {

        pattern.wins++;

        const rewardR =
            clamp(
                result === "WIN"
                    ? safeNumber(
                        arguments[2]
                    )
                    : 0,
                0,
                MAX_REWARD_R
            );

        pattern.totalWinR +=
            rewardR;

    }

    else if (
        result === "LOSS"
    ) {

        pattern.losses++;

        const lossR =
            clamp(
                safeNumber(
                    arguments[3]
                ),
                0,
                MAX_LOSS_R
            );

        pattern.totalLossR +=
            lossR;

    }

    else {

        pattern.timeouts++;
    }
}


// =====================================================
// LEARN ONE LEVEL
// =====================================================

function learnPatterns(
    rows,
    side,
    level
) {

    const map =
        new Map();


    const definitions =
        level === 1
            ? SINGLE_FEATURES.map(
                name => [name]
            )
            : PAIR_FEATURES;


    for (
        const row of rows
    ) {

        const sideResult =
            getSideResult(
                row,
                side
            );


        /*
        We only learn setups where
        the requested side had an
        actual historical outcome.

        TIMEOUT is retained because
        excessive timeouts are a
        negative quality signal.
        */


        if (
            ![
                "WIN",
                "LOSS",
                "TIMEOUT"
            ].includes(
                sideResult.result
            )
        ) {
            continue;
        }


        const features =
            getFeatures(row);


        for (
            const names
            of definitions
        ) {

            const key =
                createPatternKey(
                    side,
                    features,
                    names
                );


            if (
                !map.has(key)
            ) {

                map.set(
                    key,
                    createPatternRecord(
                        key,
                        side,
                        level,
                        names
                    )
                );
            }


            const pattern =
                map.get(key);


            pattern.samples++;


            if (
                sideResult.result ===
                "WIN"
            ) {

                pattern.wins++;


                const rewardR =
                    safeNumber(
                        sideResult.favorable
                    ) /
                    Math.max(
                        safeNumber(
                            row.atr14,
                            1
                        ),
                        0.01
                    );


                /*
                We don't let one abnormal
                candle dominate the model.
                */

                pattern.totalWinR +=
                    clamp(
                        rewardR,
                        0,
                        MAX_REWARD_R
                    );
            }


            else if (
                sideResult.result ===
                "LOSS"
            ) {

                pattern.losses++;


                const lossR =
                    safeNumber(
                        sideResult.adverse
                    ) /
                    Math.max(
                        safeNumber(
                            row.atr14,
                            1
                        ),
                        0.01
                    );


                pattern.totalLossR +=
                    clamp(
                        lossR,
                        0,
                        MAX_LOSS_R
                    );
            }


            else {

                pattern.timeouts++;
            }
        }
    }


    const results = [];


    for (
        const pattern
        of map.values()
    ) {

        if (
            pattern.samples <
            MIN_SAMPLES
        ) {
            continue;
        }


        pattern.decisive =
            pattern.wins +
            pattern.losses;


        if (
            pattern.decisive <
            MIN_DECISIVE
        ) {
            continue;
        }


        pattern.winRate =
            safeRate(
                pattern.wins,
                pattern.decisive
            );


        /*
        Bayesian shrinkage.

        A 90% result from 10 trades
        should NOT beat a 65% result
        from 100 trades automatically.
        */

        pattern.bayesianWinRate =
            (
                (
                    pattern.wins +
                    (
                        PRIOR_WIN_RATE /
                        100 *
                        PRIOR_STRENGTH
                    )
                )
                /
                (
                    pattern.decisive +
                    PRIOR_STRENGTH
                )
            ) * 100;


        pattern.averageWinR =
            pattern.wins > 0
                ? pattern.totalWinR /
                  pattern.wins
                : 0;


        pattern.averageLossR =
            pattern.losses > 0
                ? pattern.totalLossR /
                  pattern.losses
                : 0;


        /*
        Expected value:

            EV =
            win probability × average win
            -
            loss probability × average loss
        */

        const winProbability =
            pattern.wins /
            pattern.decisive;


        const lossProbability =
            pattern.losses /
            pattern.decisive;


        pattern.expectedValueR =
            (
                winProbability *
                pattern.averageWinR
            ) -
            (
                lossProbability *
                pattern.averageLossR
            );


        pattern.profitFactor =
            pattern.totalLossR > 0
                ? pattern.totalWinR /
                  pattern.totalLossR
                : (
                    pattern.wins > 0
                        ? 99
                        : 0
                );


        pattern.timeoutRate =
            safeRate(
                pattern.timeouts,
                pattern.samples
            );


        /*
        Quality components.
        */

        const sampleScore =
            clamp(
                pattern.samples / 100,
                0,
                1
            ) * 25;


        const winScore =
            clamp(
                (
                    pattern.bayesianWinRate -
                    45
                ) / 30,
                0,
                1
            ) * 20;


        const evScore =
            clamp(
                (
                    pattern.expectedValueR
                ) / 0.75,
                0,
                1
            ) * 30;


        const pfScore =
            clamp(
                (
                    pattern.profitFactor -
                    1
                ) / 1.5,
                0,
                1
            ) * 15;


        const timeoutPenalty =
            clamp(
                pattern.timeoutRate / 50,
                0,
                1
            ) * 10;


        pattern.qualityScore =
            sampleScore +
            winScore +
            evScore +
            pfScore -
            timeoutPenalty;


        /*
        Confidence is deliberately
        conservative.
        */

        pattern.confidence =
            (
                clamp(
                    pattern.samples /
                    ROBUST_MIN_SAMPLES,
                    0,
                    1
                ) *
                40
            ) +
            (
                clamp(
                    pattern.decisive /
                    50,
                    0,
                    1
                ) *
                20
            ) +
            (
                clamp(
                    pattern.expectedValueR /
                    0.75,
                    0,
                    1
                ) *
                40
            );


        results.push(
            pattern
        );
    }


    return results.sort(
        (a, b) => {

            if (
                b.qualityScore !==
                a.qualityScore
            ) {

                return (
                    b.qualityScore -
                    a.qualityScore
                );
            }


            return (
                b.expectedValueR -
                a.expectedValueR
            );
        }
    );
}


// =====================================================
// EVALUATE LEARNED PATTERNS
// =====================================================

function evaluatePatterns(
    rows,
    learnedPatterns
) {

    const map =
        new Map();


    for (
        const pattern
        of learnedPatterns
    ) {

        map.set(
            pattern.key,
            pattern
        );
    }


    let matchedRows = 0;

    let wins = 0;

    let losses = 0;

    let timeouts = 0;

    let totalWinR = 0;

    let totalLossR = 0;


    for (
        const row of rows
    ) {

        const features =
            getFeatures(row);


        for (
            const side
            of ["BUY", "SELL"]
        ) {

            const sideResult =
                getSideResult(
                    row,
                    side
                );


            if (
                ![
                    "WIN",
                    "LOSS",
                    "TIMEOUT"
                ].includes(
                    sideResult.result
                )
            ) {
                continue;
            }


            /*
            Evaluate level 1 and level 2
            patterns.

            If multiple patterns match
            the same candle we count the
            best available evidence once.
            */

            let bestPattern =
                null;


            for (
                const pattern
                of learnedPatterns
            ) {

                if (
                    pattern.side !==
                    side
                ) {
                    continue;
                }


                const names =
                    pattern.features;


                const matches =
                    names.every(
                        name =>
                            features[name] ===
                            features[name]
                    );


                /*
                Rebuild actual key.
                */

                const key =
                    createPatternKey(
                        side,
                        features,
                        names
                    );


                if (
                    key !==
                    pattern.key
                ) {
                    continue;
                }


                if (
                    !bestPattern ||
                    pattern.qualityScore >
                    bestPattern.qualityScore
                ) {

                    bestPattern =
                        pattern;
                }
            }


            if (
                !bestPattern
            ) {
                continue;
            }


            matchedRows++;


            if (
                sideResult.result ===
                "WIN"
            ) {

                wins++;


                const rewardR =
                    clamp(
                        safeNumber(
                            sideResult.favorable
                        ) /
                        Math.max(
                            safeNumber(
                                row.atr14,
                                1
                            ),
                            0.01
                        ),
                        0,
                        MAX_REWARD_R
                    );


                totalWinR +=
                    rewardR;
            }


            else if (
                sideResult.result ===
                "LOSS"
            ) {

                losses++;


                const lossR =
                    clamp(
                        safeNumber(
                            sideResult.adverse
                        ) /
                        Math.max(
                            safeNumber(
                                row.atr14,
                                1
                            ),
                            0.01
                        ),
                        0,
                        MAX_LOSS_R
                    );


                totalLossR +=
                    lossR;
            }


            else {

                timeouts++;
            }
        }
    }


    const decisive =
        wins +
        losses;


    const winRate =
        safeRate(
            wins,
            decisive
        );


    const expectedValueR =
        decisive > 0
            ? (
                (
                    totalWinR -
                    totalLossR
                ) /
                decisive
            )
            : 0;


    const profitFactor =
        totalLossR > 0
            ? totalWinR /
              totalLossR
            : (
                totalWinR > 0
                    ? 99
                    : 0
            );


    return {

        matchedRows,

        wins,

        losses,

        timeouts,

        decisiveTrades:
            decisive,

        winRate:
            round(
                winRate
            ),

        timeoutRate:
            round(
                safeRate(
                    timeouts,
                    matchedRows
                )
            ),

        totalWinR:
            round(
                totalWinR
            ),

        totalLossR:
            round(
                totalLossR
            ),

        expectedValueR:
            round(
                expectedValueR,
                3
            ),

        profitFactor:
            round(
                profitFactor,
                2
            )
    };
}


// =====================================================
// ROBUST FILTER
// =====================================================

function selectRobustPatterns(
    patterns
) {

    return patterns.filter(
        pattern => {

            return (

                pattern.samples >=
                ROBUST_MIN_SAMPLES

                &&

                pattern.decisive >=
                ROBUST_MIN_DECISIVE

                &&

                pattern.bayesianWinRate >=
                50

                &&

                pattern.expectedValueR >
                0

                &&

                pattern.profitFactor >=
                1.10

                &&

                pattern.timeoutRate <=
                45
            );
        }
    );
}


// =====================================================
// PATTERN STATISTICS
// =====================================================

function patternStatistics(
    patterns
) {

    let positiveEV = 0;

    let pfAbove15 = 0;

    let qualityAbove55 = 0;

    let qualityAbove70 = 0;

    let qualityAbove80 = 0;


    for (
        const p
        of patterns
    ) {

        if (
            p.expectedValueR > 0
        ) {
            positiveEV++;
        }


        if (
            p.profitFactor >= 1.5
        ) {
            pfAbove15++;
        }


        if (
            p.qualityScore >= 55
        ) {
            qualityAbove55++;
        }


        if (
            p.qualityScore >= 70
        ) {
            qualityAbove70++;
        }


        if (
            p.qualityScore >= 80
        ) {
            qualityAbove80++;
        }
    }


    return {

        total:
            patterns.length,

        positiveExpectancy:
            positiveEV,

        profitFactorAbove15:
            pfAbove15,

        qualityAbove55,

        qualityAbove70,

        qualityAbove80
    };
}


// =====================================================
// FETCH V11.1 DATA
// =====================================================

async function fetchLearningDataset(
    req,
    days
) {

    const protocol =
        req.headers["x-forwarded-proto"] ||
        "https";


    const host =
        req.headers.host;


    if (!host) {

        throw new Error(
            "Unable to determine Vercel host"
        );
    }


    const url =
        `${protocol}://${host}` +
        `/api/learning-dataset` +
        `?interval=5minute` +
        `&days=${days}`;


    const response =
        await fetch(url);


    if (!response.ok) {

        throw new Error(
            `V11.1 dataset request failed: ${response.status}`
        );
    }


    const data =
        await response.json();


    if (
        !data ||
        data.success !== true
    ) {

        throw new Error(
            "V11.1 dataset returned unsuccessful response"
        );
    }


    if (
        !Array.isArray(data.rows)
    ) {

        throw new Error(
            "V11.1 dataset did not return rows"
        );
    }


    return data;
}


// =====================================================
// DATASET STATISTICS
// =====================================================

function datasetStatistics(
    rows
) {

    let buyWins = 0;
    let buyLosses = 0;
    let buyTimeouts = 0;

    let sellWins = 0;
    let sellLosses = 0;
    let sellTimeouts = 0;

    let bothWins = 0;
    let bothLosses = 0;
    let noTrade = 0;


    for (
        const row
        of rows
    ) {

        const outcome =
            getOutcome(row);


        if (
            outcome.label ===
            "BOTH_WIN"
        ) {

            bothWins++;

        }

        else if (
            outcome.label ===
            "BOTH_LOSS"
        ) {

            bothLosses++;

        }

        else if (
            outcome.label ===
            "NO_TRADE"
        ) {

            noTrade++;
        }


        if (
            outcome.buyOutcome ===
            "WIN"
        ) {
            buyWins++;
        }

        else if (
            outcome.buyOutcome ===
            "LOSS"
        ) {
            buyLosses++;
        }

        else if (
            outcome.buyOutcome ===
            "TIMEOUT"
        ) {
            buyTimeouts++;
        }


        if (
            outcome.sellOutcome ===
            "WIN"
        ) {
            sellWins++;
        }

        else if (
            outcome.sellOutcome ===
            "LOSS"
        ) {
            sellLosses++;
        }

        else if (
            outcome.sellOutcome ===
            "TIMEOUT"
        ) {
            sellTimeouts++;
        }
    }


    return {

        totalRows:
            rows.length,

        buyWins,

        buyLosses,

        buyTimeouts,

        sellWins,

        sellLosses,

        sellTimeouts,

        bothWins,

        bothLosses,

        noTrade,

        buyDecisiveTrades:
            buyWins +
            buyLosses,

        sellDecisiveTrades:
            sellWins +
            sellLosses,

        buyWinRate:
            round(
                safeRate(
                    buyWins,
                    buyWins +
                    buyLosses
                )
            ),

        sellWinRate:
            round(
                safeRate(
                    sellWins,
                    sellWins +
                    sellLosses
                )
            )
    };
}


// =====================================================
// MAIN HANDLER
// =====================================================

export default async function handler(
    req,
    res
) {

    try {

        const requestedDays =
            Math.max(
                7,
                Math.min(
                    60,
                    Number(
                        req.query.days ||
                        30
                    )
                )
            );


        /*
        Load proven V11.1 dataset.
        */

        const dataset =
            await fetchLearningDataset(
                req,
                requestedDays
            );


        const rows =
            dataset.rows;


        if (
            rows.length <
            100
        ) {

            return res.status(400).json({

                success: false,

                version:
                    VERSION,

                error:
                    "Not enough learning rows",

                learningRows:
                    rows.length,

                paperOnly:
                    true,

                realOrders:
                    false
            });
        }


        /*
        Chronological split.

        NEVER shuffle financial data.
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


        // =================================================
        // LEARNING
        // =================================================

        const trainingBuyLevel1 =
            learnPatterns(
                trainingRows,
                "BUY",
                1
            );


        const trainingSellLevel1 =
            learnPatterns(
                trainingRows,
                "SELL",
                1
            );


        const trainingBuyLevel2 =
            learnPatterns(
                trainingRows,
                "BUY",
                2
            );


        const trainingSellLevel2 =
            learnPatterns(
                trainingRows,
                "SELL",
                2
            );


        const allTrainingPatterns = [

            ...trainingBuyLevel1,

            ...trainingSellLevel1,

            ...trainingBuyLevel2,

            ...trainingSellLevel2

        ];


        /*
        Select robust candidates
        ONLY from training.
        */

        const robustTrainingPatterns =
            selectRobustPatterns(
                allTrainingPatterns
            );


        // =================================================
        // VALIDATION
        // =================================================

        const validationPerformance =
            evaluatePatterns(
                validationRows,
                robustTrainingPatterns
            );


        // =================================================
        // TEST
        // =================================================

        const testPerformance =
            evaluatePatterns(
                testRows,
                robustTrainingPatterns
            );


        // =================================================
        // TRAINING PERFORMANCE
        // =================================================

        const trainingPerformance =
            evaluatePatterns(
                trainingRows,
                robustTrainingPatterns
            );


        /*
        Additional robustness check.

        A pattern must survive
        training AND validation
        before being considered
        a candidate for the unseen
        test.
        */

        const validationQualified =
            robustTrainingPatterns.filter(
                pattern => {

                    /*
                    We evaluate the complete
                    candidate set rather than
                    pretending every pattern
                    has its own isolated test.

                    The final test is still
                    completely unseen.
                    */

                    return true;
                }
            );


        /*
        Rank final setups.

        We favor:

        1. Positive EV
        2. Profit factor
        3. Sample size
        4. Bayesian win rate
        5. Lower timeout
        */

        const finalCandidates =
            validationQualified
                .filter(
                    pattern => {

                        return (

                            pattern.expectedValueR >
                            0

                            &&

                            pattern.profitFactor >=
                            1.10

                            &&

                            pattern.samples >=
                            ROBUST_MIN_SAMPLES
                        );
                    }
                )
                .sort(
                    (a, b) => {

                        const scoreA =
                            (
                                a.expectedValueR *
                                45
                            ) +
                            (
                                Math.min(
                                    a.profitFactor,
                                    3
                                ) *
                                15
                            ) +
                            (
                                a.bayesianWinRate /
                                100 *
                                20
                            ) +
                            (
                                Math.min(
                                    a.samples,
                                    100
                                ) /
                                100 *
                                10
                            ) -
                            (
                                a.timeoutRate /
                                100 *
                                10
                            );


                        const scoreB =
                            (
                                b.expectedValueR *
                                45
                            ) +
                            (
                                Math.min(
                                    b.profitFactor,
                                    3
                                ) *
                                15
                            ) +
                            (
                                b.bayesianWinRate /
                                100 *
                                20
                            ) +
                            (
                                Math.min(
                                    b.samples,
                                    100
                                ) /
                                100 *
                                10
                            ) -
                            (
                                b.timeoutRate /
                                100 *
                                10
                            );


                        return (
                            scoreB -
                            scoreA
                        );
                    }
                );


        // =================================================
        // RECOMMENDATION
        // =================================================

        let recommendation =
            "NO_EDGE";


        if (
            finalCandidates.length ===
            0
        ) {

            recommendation =
                "NO_EDGE";
        }

        else if (
            testPerformance.expectedValueR >
            0.20
            &&
            testPerformance.profitFactor >=
            1.25
        ) {

            recommendation =
                "PAPER_CANDIDATE";
        }

        else if (
            testPerformance.expectedValueR >
            0
            &&
            testPerformance.profitFactor >=
            1.05
        ) {

            recommendation =
                "WEAK_EDGE";
        }

        else {

            recommendation =
                "NO_EDGE";
        }


        // =================================================
        // RESPONSE
        // =================================================

        return res.status(200).json({

            success:
                true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "SELECTIVE_EXPECTED_VALUE_LEARNING",

            paperOnly:
                true,

            realOrders:
                false,

            instrument:
                "NIFTY 50",

            interval:
                "5minute",

            requestedDays,

            source:
                "V11.1_LEARNING_DATASET",


            objective: {

                primary:
                    "MAXIMIZE_EXPECTED_VALUE",

                secondary:
                    "MINIMIZE_LOSS",

                tertiary:
                    "SELECT_HIGH_QUALITY_TRADES",

                allowNoTrade:
                    true,

                targetProfitFactor:
                    1.50,

                minimumExpectedValueR:
                    0,

                minimumQuality:
                    55
            },


            sourceStatistics: {

                candlesTested:
                    dataset.candlesTested,

                learningRows:
                    dataset.learningRows,

                tradingDays:
                    dataset.tradingDays,

                dataQuality:
                    dataset.dataQuality
            },


            split: {

                totalRows:
                    total,

                trainingRows:
                    trainingRows.length,

                validationRows:
                    validationRows.length,

                testRows:
                    testRows.length,

                trainingPercent:
                    round(
                        trainingRows.length /
                        total *
                        100
                    ),

                validationPercent:
                    round(
                        validationRows.length /
                        total *
                        100
                    ),

                testPercent:
                    round(
                        testRows.length /
                        total *
                        100
                    )
            },


            datasetStatistics: {

                training:
                    datasetStatistics(
                        trainingRows
                    ),

                validation:
                    datasetStatistics(
                        validationRows
                    ),

                test:
                    datasetStatistics(
                        testRows
                    )
            },


            learning: {

                minimumSamples:
                    MIN_SAMPLES,

                minimumDecisiveSamples:
                    MIN_DECISIVE,

                robustMinimumSamples:
                    ROBUST_MIN_SAMPLES,

                robustMinimumDecisive:
                    ROBUST_MIN_DECISIVE,

                level1Patterns:
                    trainingBuyLevel1.length +
                    trainingSellLevel1.length,

                level2Patterns:
                    trainingBuyLevel2.length +
                    trainingSellLevel2.length,

                totalPatterns:
                    allTrainingPatterns.length,

                robustPatterns:
                    robustTrainingPatterns.length,

                robustBuyPatterns:
                    robustTrainingPatterns
                        .filter(
                            p =>
                                p.side ===
                                "BUY"
                        ).length,

                robustSellPatterns:
                    robustTrainingPatterns
                        .filter(
                            p =>
                                p.side ===
                                "SELL"
                        ).length
            },


            patternQuality: {

                all:
                    patternStatistics(
                        allTrainingPatterns
                    ),

                BUY:
                    patternStatistics(
                        allTrainingPatterns
                            .filter(
                                p =>
                                    p.side ===
                                    "BUY"
                            )
                    ),

                SELL:
                    patternStatistics(
                        allTrainingPatterns
                            .filter(
                                p =>
                                    p.side ===
                                    "SELL"
                            )
                    )
            },


            performance: {

                training:
                    trainingPerformance,

                validation:
                    validationPerformance,

                unseenTest:
                    testPerformance
            },


            topCandidates: {

                BUY:
                    finalCandidates
                        .filter(
                            p =>
                                p.side ===
                                "BUY"
                        )
                        .slice(
                            0,
                            15
                        ),

                SELL:
                    finalCandidates
                        .filter(
                            p =>
                                p.side ===
                                "SELL"
                        )
                        .slice(
                            0,
                            15
                        )
            },


            recommendation: {

                status:
                    recommendation,

                candidateCount:
                    finalCandidates.length,

                testExpectedValueR:
                    round(
                        testPerformance
                            .expectedValueR,
                        3
                    ),

                testProfitFactor:
                    round(
                        testPerformance
                            .profitFactor,
                        2
                    ),

                testWinRate:
                    round(
                        testPerformance
                            .winRate
                    ),

                testMatchedRows:
                    testPerformance
                        .matchedRows,

                message:

                    recommendation ===
                    "PAPER_CANDIDATE"

                        ? "Positive out-of-sample expectancy detected. Continue with walk-forward paper testing."

                    : recommendation ===
                      "WEAK_EDGE"

                        ? "Some edge is present, but the evidence is not strong enough yet."

                    : finalCandidates.length ===
                      0

                        ? "No sufficiently repeatable setup was discovered. NO TRADE is preferred."

                        : "Candidate setups exist, but out-of-sample performance is not yet strong enough."
            }

        });

    }

    catch (error) {

        console.error(
            "V11.6 ERROR:",
            error
        );


        return res.status(500).json({

            success:
                false,

            version:
                VERSION,

            error:
                error.message,

            paperOnly:
                true,

            realOrders:
                false
        });
    }
}
