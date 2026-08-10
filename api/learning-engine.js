/*
TradeMind Pro
V11.4 Hierarchical Self-Learning Engine

V11.1
Learning Dataset
        ↓
V11.2
Statistical Learning
        ↓
V11.3
Independent BUY / SELL Learning
        ↓
V11.4
Hierarchical Pattern Discovery
        ↓
Bayesian Sample-Size Weighting
        ↓
Training
Validation
Unseen Test
        ↓
Candidate / Validated / Robust Patterns

IMPORTANT
----------
PAPER ONLY
NO REAL ORDERS
NO LIVE EXECUTION

Major V11.4 improvements:

1. BUY and SELL are evaluated independently.
2. Pattern creation NEVER uses future outcome information.
3. Multiple pattern levels are tested.
4. Patterns are not over-specified.
5. Bayesian shrinkage protects against tiny samples.
6. Training patterns are tested on unseen data.
7. No forced 60% win rate.
*/

const VERSION = "V11.4";

const INTERVAL = "5minute";

const MIN_PATTERN_SAMPLES = 30;

const MIN_DECISIVE_SAMPLES = 12;

const ROBUST_MIN_TRAIN_DECISIVE = 30;

const ROBUST_MIN_VALIDATION_DECISIVE = 15;

const PRIOR_WIN_RATE = 50;

const PRIOR_STRENGTH = 20;

const TRAIN_RATIO = 0.70;

const VALIDATION_RATIO = 0.15;


// =====================================================
// BASIC HELPERS
// =====================================================

function round(value, decimals = 2) {

    if (!Number.isFinite(Number(value))) {
        return 0;
    }

    const multiplier =
        Math.pow(10, decimals);

    return (
        Math.round(
            Number(value) *
            multiplier
        ) /
        multiplier
    );
}


function safeRate(wins, total) {

    if (!total) {
        return 0;
    }

    return (
        Number(wins) /
        Number(total)
    ) * 100;
}


function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


function numberOrZero(value) {

    const n =
        Number(value);

    return Number.isFinite(n)
        ? n
        : 0;
}


// =====================================================
// BAYESIAN ESTIMATION
// =====================================================

function bayesianWinRate(
    wins,
    losses
) {

    const decisive =
        wins +
        losses;

    if (!decisive) {
        return 50;
    }

    /*
    Beta prior:

    50% expected win rate
    with 20 pseudo-observations.

    This prevents tiny samples
    from appearing artificially
    powerful.
    */

    const priorWins =
        PRIOR_STRENGTH *
        (PRIOR_WIN_RATE / 100);

    const priorLosses =
        PRIOR_STRENGTH -
        priorWins;

    return (
        (
            wins +
            priorWins
        ) /
        (
            decisive +
            PRIOR_STRENGTH
        )
    ) * 100;
}


// =====================================================
// FEATURE BUCKETS
// =====================================================

function bucketRSI(rsi) {

    const x =
        numberOrZero(rsi);

    if (x < 30) return "<30";
    if (x < 35) return "30-35";
    if (x < 40) return "35-40";
    if (x < 45) return "40-45";
    if (x < 50) return "45-50";
    if (x < 55) return "50-55";
    if (x < 60) return "55-60";
    if (x < 65) return "60-65";
    if (x < 70) return "65-70";

    return "70+";
}


function bucketSpread(value) {

    const x =
        Math.abs(
            numberOrZero(value)
        );

    if (x < 0.50) {
        return "WEAK";
    }

    if (x < 1.00) {
        return "MEDIUM";
    }

    if (x < 1.50) {
        return "STRONG";
    }

    return "VERY_STRONG";
}


function bucketSlope(value) {

    const x =
        Math.abs(
            numberOrZero(value)
        );

    if (x < 0.25) {
        return "FLAT";
    }

    if (x < 0.50) {
        return "MILD";
    }

    if (x < 0.75) {
        return "STRONG";
    }

    return "VERY_STRONG";
}


function bucketVWAP(value) {

    const x =
        numberOrZero(value);

    if (x < -1) {
        return "FAR_BELOW";
    }

    if (x < -0.25) {
        return "BELOW";
    }

    if (x < 0.25) {
        return "NEAR";
    }

    if (x < 1) {
        return "ABOVE";
    }

    return "FAR_ABOVE";
}


function bucketBody(value) {

    const x =
        numberOrZero(value);

    if (x < 0.20) {
        return "WEAK";
    }

    if (x < 0.40) {
        return "MODERATE";
    }

    if (x < 0.60) {
        return "STRONG";
    }

    return "VERY_STRONG";
}


function bucketTime(hour) {

    const h =
        numberOrZero(hour);

    if (h < 10) {
        return "OPEN";
    }

    if (h < 11) {
        return "MORNING";
    }

    if (h < 13) {
        return "MIDDAY";
    }

    if (h < 14) {
        return "AFTERNOON";
    }

    return "CLOSE";
}


function normalizeTrend(value) {

    if (
        value ===
        "BULLISH"
    ) {
        return "BULLISH";
    }

    if (
        value ===
        "BEARISH"
    ) {
        return "BEARISH";
    }

    return "SIDEWAYS";
}


function normalizeRegime(value) {

    if (
        value ===
        "TRENDING"
    ) {
        return "TRENDING";
    }

    if (
        value ===
        "RANGING"
    ) {
        return "RANGING";
    }

    return "UNKNOWN";
}


// =====================================================
// HIERARCHICAL PATTERNS
// =====================================================

/*
IMPORTANT:

These patterns use ONLY information
available at the candle itself.

They do NOT use:

- preferredDirection
- label
- buyOutcome
- sellOutcome
- future candles

That prevents data leakage.
*/

function buildPatternLevels(
    row,
    side
) {

    const trend =
        normalizeTrend(
            row.trend
        );

    const regime =
        normalizeRegime(
            row.regime
        );

    const rsi =
        bucketRSI(
            row.rsi14
        );

    const spread =
        bucketSpread(
            row.emaSpreadATR
        );

    const slope =
        bucketSlope(
            row.ema9SlopeATR
        );

    const vwap =
        bucketVWAP(
            row.vwapDistanceATR
        );

    const body =
        bucketBody(
            row.bodyRatio
        );

    const time =
        bucketTime(
            row.hour
        );


    return [

        /*
        LEVEL 1
        Broad market structure
        */

        {
            level: 1,

            type:
                "TREND_REGIME",

            key:
                [
                    side,
                    trend,
                    regime
                ].join("|")
        },


        /*
        LEVEL 2
        Trend + RSI
        */

        {
            level: 2,

            type:
                "TREND_RSI",

            key:
                [
                    side,
                    trend,
                    regime,
                    rsi
                ].join("|")
        },


        /*
        LEVEL 3
        Trend + VWAP
        */

        {
            level: 3,

            type:
                "TREND_VWAP",

            key:
                [
                    side,
                    trend,
                    regime,
                    vwap
                ].join("|")
        },


        /*
        LEVEL 4
        Trend + EMA separation
        */

        {
            level: 4,

            type:
                "TREND_SPREAD",

            key:
                [
                    side,
                    trend,
                    regime,
                    spread
                ].join("|")
        },


        /*
        LEVEL 5
        Trend + EMA slope
        */

        {
            level: 5,

            type:
                "TREND_SLOPE",

            key:
                [
                    side,
                    trend,
                    regime,
                    slope
                ].join("|")
        },


        /*
        LEVEL 6
        Trend + candle strength
        */

        {
            level: 6,

            type:
                "TREND_BODY",

            key:
                [
                    side,
                    trend,
                    regime,
                    body
                ].join("|")
        },


        /*
        LEVEL 7
        Trend + time
        */

        {
            level: 7,

            type:
                "TREND_TIME",

            key:
                [
                    side,
                    trend,
                    regime,
                    time
                ].join("|")
        },


        /*
        LEVEL 8
        Trend + RSI + VWAP

        Still intentionally much
        less granular than V11.3.
        */

        {
            level: 8,

            type:
                "TREND_RSI_VWAP",

            key:
                [
                    side,
                    trend,
                    regime,
                    rsi,
                    vwap
                ].join("|")
        },


        /*
        LEVEL 9
        Trend + spread + slope
        */

        {
            level: 9,

            type:
                "TREND_SPREAD_SLOPE",

            key:
                [
                    side,
                    trend,
                    regime,
                    spread,
                    slope
                ].join("|")
        },


        /*
        LEVEL 10
        Trend + RSI + spread
        */

        {
            level: 10,

            type:
                "TREND_RSI_SPREAD",

            key:
                [
                    side,
                    trend,
                    regime,
                    rsi,
                    spread
                ].join("|")
        }

    ];
}


// =====================================================
// OUTCOME NORMALIZATION
// =====================================================

function getOutcome(row) {

    if (
        row &&
        row.outcome &&
        typeof row.outcome ===
        "object"
    ) {

        return row.outcome;
    }


    return {

        label:
            row?.label ||
            "NO_TRADE",

        preferredDirection:
            row?.preferredDirection ||
            "NONE",

        buyOutcome:
            row?.buyOutcome ||
            "TIMEOUT",

        sellOutcome:
            row?.sellOutcome ||
            "TIMEOUT"
    };
}


// =====================================================
// SIDE OUTCOME
// =====================================================

function getSideOutcome(
    row,
    side
) {

    const outcome =
        getOutcome(row);


    if (
        side ===
        "BUY"
    ) {

        return (
            outcome.buyOutcome ||
            "TIMEOUT"
        );
    }


    return (
        outcome.sellOutcome ||
        "TIMEOUT"
    );
}


// =====================================================
// CREATE EMPTY PATTERN
// =====================================================

function createEmptyPattern(
    descriptor
) {

    return {

        key:
            descriptor.key,

        level:
            descriptor.level,

        type:
            descriptor.type,

        side:
            descriptor.key
                .split("|")[0],

        samples:
            0,

        wins:
            0,

        losses:
            0,

        timeouts:
            0,

        decisive:
            0,

        rawWinRate:
            0,

        bayesianWinRate:
            0,

        profitFactor:
            0,

        edge:
            0,

        confidence:
            0
    };
}


// =====================================================
// LEARN PATTERNS
// =====================================================

function learnPatterns(
    rows
) {

    const map =
        new Map();


    for (
        const row of rows
    ) {

        /*
        CRITICAL:

        We evaluate BOTH sides
        independently.

        We do NOT use
        preferredDirection.
        */

        const sides =
            [
                "BUY",
                "SELL"
            ];


        for (
            const side
            of sides
        ) {

            const descriptors =
                buildPatternLevels(
                    row,
                    side
                );


            const sideOutcome =
                getSideOutcome(
                    row,
                    side
                );


            for (
                const descriptor
                of descriptors
            ) {

                if (
                    !map.has(
                        descriptor.key
                    )
                ) {

                    map.set(
                        descriptor.key,
                        createEmptyPattern(
                            descriptor
                        )
                    );
                }


                const pattern =
                    map.get(
                        descriptor.key
                    );


                pattern.samples++;


                if (
                    sideOutcome ===
                    "WIN"
                ) {

                    pattern.wins++;

                }

                else if (
                    sideOutcome ===
                    "LOSS"
                ) {

                    pattern.losses++;

                }

                else {

                    pattern.timeouts++;
                }
            }
        }
    }


    const patterns =
        [];


    for (
        const pattern
        of map.values()
    ) {

        pattern.decisive =
            pattern.wins +
            pattern.losses;


        /*
        We require enough
        total observations.
        */

        if (
            pattern.samples <
            MIN_PATTERN_SAMPLES
        ) {
            continue;
        }


        /*
        And enough decisive
        observations.
        */

        if (
            pattern.decisive <
            MIN_DECISIVE_SAMPLES
        ) {
            continue;
        }


        pattern.rawWinRate =
            safeRate(
                pattern.wins,
                pattern.decisive
            );


        pattern.bayesianWinRate =
            bayesianWinRate(
                pattern.wins,
                pattern.losses
            );


        /*
        Approximate R model.

        WIN  = +2R
        LOSS = -1.5R

        This is only a statistical
        comparison until the actual
        execution engine is connected.
        */

        const reward =
            pattern.wins *
            2;

        const risk =
            pattern.losses *
            1.5;


        pattern.profitFactor =
            risk > 0
                ? reward / risk
                : reward > 0
                    ? 999
                    : 0;


        pattern.edge =
            pattern.bayesianWinRate -
            50;


        /*
        Confidence components.
        */

        const sampleConfidence =
            clamp(
                pattern.decisive /
                150,
                0,
                1
            );


        const edgeConfidence =
            clamp(
                pattern.edge /
                15,
                0,
                1
            );


        const profitConfidence =
            clamp(
                (
                    pattern.profitFactor -
                    1
                ) /
                1.5,
                0,
                1
            );


        pattern.confidence =
            (
                sampleConfidence *
                35
            ) +
            (
                edgeConfidence *
                40
            ) +
            (
                profitConfidence *
                25
            );


        patterns.push(
            pattern
        );
    }


    return patterns.sort(
        (
            a,
            b
        ) => {

            if (
                b.confidence !==
                a.confidence
            ) {

                return (
                    b.confidence -
                    a.confidence
                );
            }


            return (
                b.decisive -
                a.decisive
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

    const patternMap =
        new Map();


    for (
        const pattern
        of learnedPatterns
    ) {

        patternMap.set(
            pattern.key,
            pattern
        );
    }


    const stats = {};


    for (
        const pattern
        of learnedPatterns
    ) {

        stats[
            pattern.key
        ] = {

            key:
                pattern.key,

            level:
                pattern.level,

            type:
                pattern.type,

            side:
                pattern.side,

            matchedRows:
                0,

            wins:
                0,

            losses:
                0,

            timeouts:
                0,

            decisiveTrades:
                0,

            winRate:
                0,

            bayesianWinRate:
                0
        };
    }


    for (
        const row
        of rows
    ) {

        const sides =
            [
                "BUY",
                "SELL"
            ];


        for (
            const side
            of sides
        ) {

            const descriptors =
                buildPatternLevels(
                    row,
                    side
                );


            const sideOutcome =
                getSideOutcome(
                    row,
                    side
                );


            for (
                const descriptor
                of descriptors
            ) {

                const pattern =
                    patternMap.get(
                        descriptor.key
                    );


                if (!pattern) {
                    continue;
                }


                const result =
                    stats[
                        descriptor.key
                    ];


                result.matchedRows++;


                if (
                    sideOutcome ===
                    "WIN"
                ) {

                    result.wins++;

                }

                else if (
                    sideOutcome ===
                    "LOSS"
                ) {

                    result.losses++;

                }

                else {

                    result.timeouts++;
                }
            }
        }
    }


    const results =
        Object.values(
            stats
        );


    for (
        const result
        of results
    ) {

        result.decisiveTrades =
            result.wins +
            result.losses;


        result.winRate =
            safeRate(
                result.wins,
                result.decisiveTrades
            );


        result.bayesianWinRate =
            bayesianWinRate(
                result.wins,
                result.losses
            );
    }


    return results;
}


// =====================================================
// AGGREGATE PERFORMANCE
// =====================================================

function aggregatePerformance(
    rows,
    learnedPatterns
) {

    const patternMap =
        new Map();


    for (
        const pattern
        of learnedPatterns
    ) {

        patternMap.set(
            pattern.key,
            pattern
        );
    }


    let matchedRows =
        0;

    let wins =
        0;

    let losses =
        0;

    let timeouts =
        0;


    const matchedKeys =
        new Set();


    for (
        const row
        of rows
    ) {

        const sides =
            [
                "BUY",
                "SELL"
            ];


        for (
            const side
            of sides
        ) {

            const descriptors =
                buildPatternLevels(
                    row,
                    side
                );


            const sideOutcome =
                getSideOutcome(
                    row,
                    side
                );


            for (
                const descriptor
                of descriptors
            ) {

                const pattern =
                    patternMap.get(
                        descriptor.key
                    );


                if (!pattern) {
                    continue;
                }


                /*
                Avoid counting the same
                pattern multiple times
                for one candle.
                */

                const uniqueKey =
                    `${row.timestamp}|${descriptor.key}`;


                if (
                    matchedKeys.has(
                        uniqueKey
                    )
                ) {
                    continue;
                }


                matchedKeys.add(
                    uniqueKey
                );


                matchedRows++;


                if (
                    sideOutcome ===
                    "WIN"
                ) {

                    wins++;

                }

                else if (
                    sideOutcome ===
                    "LOSS"
                ) {

                    losses++;

                }

                else {

                    timeouts++;
                }
            }
        }
    }


    const decisive =
        wins +
        losses;


    return {

        matchedRows,

        wins,

        losses,

        timeouts,

        decisiveTrades:
            decisive,

        winRate:
            safeRate(
                wins,
                decisive
            ),

        bayesianWinRate:
            bayesianWinRate(
                wins,
                losses
            )
    };
}


// =====================================================
// DATASET STATISTICS
// =====================================================

function calculateDatasetStatistics(
    rows
) {

    const stats = {

        totalRows:
            rows.length,

        buyWins:
            0,

        buyLosses:
            0,

        buyTimeouts:
            0,

        sellWins:
            0,

        sellLosses:
            0,

        sellTimeouts:
            0,

        bothWins:
            0,

        bothLosses:
            0,

        noTrade:
            0
    };


    for (
        const row
        of rows
    ) {

        const outcome =
            getOutcome(row);


        if (
            outcome.buyOutcome ===
            "WIN"
        ) {

            stats.buyWins++;

        }

        else if (
            outcome.buyOutcome ===
            "LOSS"
        ) {

            stats.buyLosses++;

        }

        else {

            stats.buyTimeouts++;
        }


        if (
            outcome.sellOutcome ===
            "WIN"
        ) {

            stats.sellWins++;

        }

        else if (
            outcome.sellOutcome ===
            "LOSS"
        ) {

            stats.sellLosses++;

        }

        else {

            stats.sellTimeouts++;
        }


        if (
            outcome.label ===
            "BOTH_WIN"
        ) {

            stats.bothWins++;

        }

        else if (
            outcome.label ===
            "BOTH_LOSS"
        ) {

            stats.bothLosses++;

        }

        else if (
            outcome.label ===
            "NO_TRADE"
        ) {

            stats.noTrade++;
        }
    }


    const buyDecisive =
        stats.buyWins +
        stats.buyLosses;


    const sellDecisive =
        stats.sellWins +
        stats.sellLosses;


    return {

        ...stats,

        buyDecisiveTrades:
            buyDecisive,

        sellDecisiveTrades:
            sellDecisive,

        buyWinRate:
            safeRate(
                stats.buyWins,
                buyDecisive
            ),

        sellWinRate:
            safeRate(
                stats.sellWins,
                sellDecisive
            )
    };
}


// =====================================================
// ROBUST PATTERN FILTER
// =====================================================

function findRobustPatterns(
    learnedPatterns,
    validationResults
) {

    const validationMap =
        new Map();


    for (
        const result
        of validationResults
    ) {

        validationMap.set(
            result.key,
            result
        );
    }


    const robust =
        [];


    for (
        const pattern
        of learnedPatterns
    ) {

        const validation =
            validationMap.get(
                pattern.key
            );


        if (!validation) {
            continue;
        }


        /*
        Training requirement:
        meaningful sample + positive
        statistical edge.
        */

        const trainingGood =
            pattern.decisive >=
            ROBUST_MIN_TRAIN_DECISIVE &&
            pattern.bayesianWinRate >=
            54;


        /*
        Validation requirement:
        the pattern must survive
        outside the training sample.
        */

        const validationGood =
            validation.decisiveTrades >=
            ROBUST_MIN_VALIDATION_DECISIVE &&
            validation.bayesianWinRate >=
            52;


        if (
            trainingGood &&
            validationGood
        ) {

            robust.push({

                ...pattern,

                validation: {

                    matchedRows:
                        validation.matchedRows,

                    wins:
                        validation.wins,

                    losses:
                        validation.losses,

                    timeouts:
                        validation.timeouts,

                    decisiveTrades:
                        validation.decisiveTrades,

                    winRate:
                        round(
                            validation.winRate
                        ),

                    bayesianWinRate:
                        round(
                            validation.bayesianWinRate
                        )
                }
            });
        }
    }


    return robust.sort(
        (
            a,
            b
        ) => {

            const aScore =
                (
                    a.confidence *
                    0.6
                ) +
                (
                    (
                        a.validation
                            .bayesianWinRate -
                        50
                    ) *
                    0.4
                );


            const bScore =
                (
                    b.confidence *
                    0.6
                ) +
                (
                    (
                        b.validation
                            .bayesianWinRate -
                        50
                    ) *
                    0.4
                );


            return (
                bScore -
                aScore
            );
        }
    );
}


// =====================================================
// FETCH V11.1 DATASET
// =====================================================

async function fetchLearningDataset(
    req,
    days
) {

    const protocol =
        req.headers[
            "x-forwarded-proto"
        ] ||
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
        `?interval=${INTERVAL}` +
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
            "V11.1 learning dataset returned unsuccessful response"
        );
    }


    if (
        !Array.isArray(
            data.rows
        )
    ) {

        throw new Error(
            "V11.1 did not return learning rows"
        );
    }


    return data;
}


// =====================================================
// PATTERN SUMMARY
// =====================================================

function summarizePatterns(
    patterns
) {

    const byLevel = {};


    for (
        const pattern
        of patterns
    ) {

        if (
            !byLevel[
                pattern.level
            ]
        ) {

            byLevel[
                pattern.level
            ] = {

                level:
                    pattern.level,

                count:
                    0
            };
        }


        byLevel[
            pattern.level
        ].count++;
    }


    return Object.values(
        byLevel
    ).sort(
        (
            a,
            b
        ) =>
            a.level -
            b.level
    );
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
                    30,
                    Number(
                        req.query.days ||
                        30
                    )
                )
            );


        /*
        =========================================
        LOAD V11.1
        =========================================
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
            200
        ) {

            return res.status(400).json({

                success:
                    false,

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
        =========================================
        CHRONOLOGICAL SPLIT
        =========================================
        */

        const total =
            rows.length;


        const trainingEnd =
            Math.floor(
                total *
                TRAIN_RATIO
            );


        const validationEnd =
            trainingEnd +
            Math.floor(
                total *
                VALIDATION_RATIO
            );


        const trainingRows =
            rows.slice(
                0,
                trainingEnd
            );


        const validationRows =
            rows.slice(
                trainingEnd,
                validationEnd
            );


        const testRows =
            rows.slice(
                validationEnd
            );


        /*
        =========================================
        LEARN ONLY FROM TRAINING DATA
        =========================================
        */

        const learnedPatterns =
            learnPatterns(
                trainingRows
            );


        const buyPatterns =
            learnedPatterns.filter(
                pattern =>
                    pattern.side ===
                    "BUY"
            );


        const sellPatterns =
            learnedPatterns.filter(
                pattern =>
                    pattern.side ===
                    "SELL"
            );


        /*
        =========================================
        VALIDATE LEARNED PATTERNS
        =========================================
        */

        const validationResults =
            evaluatePatterns(
                validationRows,
                learnedPatterns
            );


        /*
        =========================================
        TEST ON COMPLETELY UNSEEN DATA
        =========================================
        */

        const testResults =
            evaluatePatterns(
                testRows,
                learnedPatterns
            );


        /*
        =========================================
        AGGREGATE PERFORMANCE
        =========================================
        */

        const trainingPerformance =
            aggregatePerformance(
                trainingRows,
                learnedPatterns
            );


        const validationPerformance =
            aggregatePerformance(
                validationRows,
                learnedPatterns
            );


        const testPerformance =
            aggregatePerformance(
                testRows,
                learnedPatterns
            );


        /*
        =========================================
        ROBUST PATTERNS
        =========================================
        */

        const robustPatterns =
            findRobustPatterns(
                learnedPatterns,
                validationResults
            );


        const robustBuyPatterns =
            robustPatterns.filter(
                pattern =>
                    pattern.side ===
                    "BUY"
            );


        const robustSellPatterns =
            robustPatterns.filter(
                pattern =>
                    pattern.side ===
                    "SELL"
            );


        /*
        =========================================
        DATASET STATISTICS
        =========================================
        */

        const datasetStats = {

            training:
                calculateDatasetStatistics(
                    trainingRows
                ),

            validation:
                calculateDatasetStatistics(
                    validationRows
                ),

            test:
                calculateDatasetStatistics(
                    testRows
                )
        };


        /*
        =========================================
        FIND BEST TESTED PATTERNS
        =========================================
        */

        const validationMap =
            new Map();


        for (
            const result
            of validationResults
        ) {

            validationMap.set(
                result.key,
                result
            );
        }


        const testMap =
            new Map();


        for (
            const result
            of testResults
        ) {

            testMap.set(
                result.key,
                result
            );
        }


        const rankedPatterns =
            learnedPatterns.map(
                pattern => {

                    const validation =
                        validationMap.get(
                            pattern.key
                        );


                    const test =
                        testMap.get(
                            pattern.key
                        );


                    return {

                        ...pattern,

                        validation:
                            validation
                                ? {

                                    matchedRows:
                                        validation.matchedRows,

                                    wins:
                                        validation.wins,

                                    losses:
                                        validation.losses,

                                    timeouts:
                                        validation.timeouts,

                                    decisiveTrades:
                                        validation.decisiveTrades,

                                    winRate:
                                        round(
                                            validation.winRate
                                        ),

                                    bayesianWinRate:
                                        round(
                                            validation.bayesianWinRate
                                        )

                                }
                                : null,

                        unseenTest:
                            test
                                ? {

                                    matchedRows:
                                        test.matchedRows,

                                    wins:
                                        test.wins,

                                    losses:
                                        test.losses,

                                    timeouts:
                                        test.timeouts,

                                    decisiveTrades:
                                        test.decisiveTrades,

                                    winRate:
                                        round(
                                            test.winRate
                                        ),

                                    bayesianWinRate:
                                        round(
                                            test.bayesianWinRate
                                        )

                                }
                                : null
                    };
                }
            );


        /*
        =========================================
        RECOMMENDATION
        =========================================
        */

        let recommendation =
            "NEEDS_MORE_DATA";


        if (
            learnedPatterns.length ===
            0
        ) {

            recommendation =
                "NO_PATTERNS_FOUND";

        }

        else if (
            robustPatterns.length ===
            0
        ) {

            recommendation =
                "NO_ROBUST_EDGE";

        }

        else if (
            testPerformance
                .decisiveTrades >=
            30 &&
            testPerformance
                .bayesianWinRate >=
            60
        ) {

            recommendation =
                "STRONG_OUT_OF_SAMPLE_EDGE";

        }

        else if (
            testPerformance
                .decisiveTrades >=
            30 &&
            testPerformance
                .bayesianWinRate >=
            55
        ) {

            recommendation =
                "PROMISING_OUT_OF_SAMPLE_EDGE";

        }

        else {

            recommendation =
                "REQUIRES_MORE_VALIDATION";
        }


        /*
        =========================================
        RESPONSE
        =========================================
        */

        return res.status(200).json({

            success:
                true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "HIERARCHICAL_SELF_LEARNING",

            paperOnly:
                true,

            realOrders:
                false,

            instrument:
                "NIFTY 50",

            interval:
                INTERVAL,

            requestedDays,

            source:
                "V11.1_LEARNING_DATASET",


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


            datasetStatistics:
                datasetStats,


            learning: {

                minimumPatternSamples:
                    MIN_PATTERN_SAMPLES,

                minimumDecisiveSamples:
                    MIN_DECISIVE_SAMPLES,

                bayesianPriorWinRate:
                    PRIOR_WIN_RATE,

                bayesianPriorStrength:
                    PRIOR_STRENGTH,

                patternsDiscovered:
                    learnedPatterns.length,

                buyPatterns:
                    buyPatterns.length,

                sellPatterns:
                    sellPatterns.length,

                robustPatterns:
                    robustPatterns.length,

                robustBuyPatterns:
                    robustBuyPatterns.length,

                robustSellPatterns:
                    robustSellPatterns.length,

                patternsByLevel:
                    summarizePatterns(
                        learnedPatterns
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


            topPatterns: {

                BUY:
                    rankedPatterns
                        .filter(
                            p =>
                                p.side ===
                                "BUY"
                        )
                        .slice(
                            0,
                            20
                        ),

                SELL:
                    rankedPatterns
                        .filter(
                            p =>
                                p.side ===
                                "SELL"
                        )
                        .slice(
                            0,
                            20
                        )
            },


            robustPatterns: {

                BUY:
                    robustBuyPatterns
                        .slice(
                            0,
                            20
                        ),

                SELL:
                    robustSellPatterns
                        .slice(
                            0,
                            20
                        )
            },


            recommendation: {

                status:
                    recommendation,

                trainingWinRate:
                    round(
                        trainingPerformance
                            .winRate
                    ),

                validationWinRate:
                    round(
                        validationPerformance
                            .winRate
                    ),

                unseenTestWinRate:
                    round(
                        testPerformance
                            .winRate
                    ),

                unseenTestBayesianWinRate:
                    round(
                        testPerformance
                            .bayesianWinRate
                    ),

                unseenTestDecisiveTrades:
                    testPerformance
                        .decisiveTrades,

                targetWinRate:
                    60,

                message:

                    recommendation ===
                    "STRONG_OUT_OF_SAMPLE_EDGE"

                        ? "Strong statistical edge detected on unseen data. Proceed to walk-forward testing."

                    : recommendation ===
                      "PROMISING_OUT_OF_SAMPLE_EDGE"

                        ? "Promising edge detected, but additional walk-forward validation is required."

                    : recommendation ===
                      "NO_ROBUST_EDGE"

                        ? "Patterns were discovered but did not survive training and validation requirements."

                    : recommendation ===
                      "NO_PATTERNS_FOUND"

                        ? "No sufficiently reliable patterns were found. More data or broader feature structure is required."

                        : "The learner is working, but the current evidence is not strong enough for deployment."
            }

        });

    }

    catch (error) {

        console.error(
            "V11.4 ERROR:",
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
