/*
TradeMind Pro
V11.3 Statistical Learning Engine

V11.1 Learning Dataset
        ↓
V11.3 Independent BUY / SELL Learning
        ↓
Training / Validation / Unseen Test
        ↓
Statistical Pattern Ranking
        ↓
Robust Pattern Detection
        ↓
Out-of-Sample Evaluation

IMPORTANT
---------
PAPER ONLY
NO REAL ORDERS
NO LIVE EXECUTION

V11.3 fixes the major V11.2 issue where
preferredDirection === "NONE" caused useful
BUY / SELL outcome rows to be ignored.

BUY and SELL are now learned independently.
*/

const VERSION = "V11.3";


// =====================================================
// CONFIGURATION
// =====================================================

const MIN_PATTERN_SAMPLES = 20;

const MIN_DECISIVE_SAMPLES = 12;

const ROBUST_MIN_SAMPLES = 30;

const TRAIN_RATIO = 0.70;

const VALIDATION_RATIO = 0.15;

const TARGET_WIN_RATE = 60;


// =====================================================
// HELPERS
// =====================================================

function round(value, decimals = 2) {

    if (!Number.isFinite(value)) {
        return 0;
    }

    const p =
        Math.pow(10, decimals);

    return Math.round(value * p) / p;
}


function safeRate(wins, total) {

    if (!total) {
        return 0;
    }

    return (
        wins /
        total
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


// =====================================================
// FEATURE BUCKETS
// =====================================================

function bucketRSI(rsi) {

    const x =
        Number(rsi);

    if (!Number.isFinite(x)) {
        return "UNKNOWN";
    }

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
            Number(value) || 0
        );

    if (x < 0.25) return "<0.25";
    if (x < 0.50) return "0.25-0.50";
    if (x < 0.75) return "0.50-0.75";
    if (x < 1.00) return "0.75-1.00";

    return "1.00+";
}


function bucketSlope(value) {

    const x =
        Math.abs(
            Number(value) || 0
        );

    if (x < 0.10) return "<0.10";
    if (x < 0.25) return "0.10-0.25";
    if (x < 0.50) return "0.25-0.50";
    if (x < 0.75) return "0.50-0.75";

    return "0.75+";
}


function bucketVWAP(value) {

    const x =
        Number(value) || 0;

    if (x < -1) return "<-1ATR";
    if (x < -0.25) return "-1 to -0.25";
    if (x < 0.25) return "-0.25 to 0.25";
    if (x < 1) return "0.25 to 1";

    return ">1ATR";
}


function bucketBody(value) {

    const x =
        Number(value) || 0;

    if (x < 0.20) return "<20%";
    if (x < 0.40) return "20-40%";
    if (x < 0.60) return "40-60%";
    if (x < 0.80) return "60-80%";

    return "80%+";
}


function bucketTime(hour) {

    const h =
        Number(hour);

    if (!Number.isFinite(h)) {
        return "UNKNOWN";
    }

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


function bucketTrendAcceleration(
    row
) {

    const slope =
        Number(
            row.ema9SlopeATR
        ) || 0;

    if (slope > 0.75) {
        return "STRONG_UP";
    }

    if (slope > 0.25) {
        return "UP";
    }

    if (slope < -0.75) {
        return "STRONG_DOWN";
    }

    if (slope < -0.25) {
        return "DOWN";
    }

    return "FLAT";
}


function bucketRegime(
    row
) {

    return (
        row.regime ||
        "UNKNOWN"
    );
}


// =====================================================
// PATTERN KEY
// =====================================================

function createPattern(
    row,
    side
) {

    return [

        side,

        row.trend ||
            "UNKNOWN",

        bucketRegime(
            row
        ),

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

        bucketTrendAcceleration(
            row
        ),

        bucketTime(
            row.hour
        )

    ].join("|");
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
            "V11.1 learning dataset returned an unsuccessful response"
        );
    }


    if (
        !Array.isArray(data.rows)
    ) {

        throw new Error(
            "V11.1 did not return learning rows"
        );
    }


    return data;
}


// =====================================================
// NORMALIZE OUTCOME
// =====================================================

function getOutcome(row) {

    if (
        row.outcome &&
        typeof row.outcome === "object"
    ) {

        return {

            label:
                row.outcome.label ||
                "NO_TRADE",

            preferredDirection:
                row.outcome.preferredDirection ||
                "NONE",

            buyOutcome:
                row.outcome.buyOutcome ||
                "TIMEOUT",

            sellOutcome:
                row.outcome.sellOutcome ||
                "TIMEOUT"

        };
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


    if (side === "BUY") {

        return outcome.buyOutcome;
    }


    if (side === "SELL") {

        return outcome.sellOutcome;
    }


    return "TIMEOUT";
}


// =====================================================
// CREATE EMPTY PATTERN
// =====================================================

function createEmptyPattern(
    key,
    side
) {

    return {

        key,

        side,

        samples: 0,

        wins: 0,

        losses: 0,

        timeouts: 0,

        decisive: 0,

        rawWinRate: 0,

        smoothedWinRate: 0,

        winRate: 0,

        profitFactor: 0,

        rewardPoints: 0,

        riskPoints: 0,

        confidence: 0,

        validationStable: false,

        testQualified: false
    };
}


// =====================================================
// ANALYSE PATTERNS
// =====================================================

function analysePatterns(
    rows
) {

    const map =
        new Map();


    /*
    CRITICAL V11.3 CHANGE

    We evaluate BOTH sides for every row.

    We do NOT use:

        preferredDirection

    to decide whether a row
    is learnable.
    */


    for (
        const row of rows
    ) {

        for (
            const side of [
                "BUY",
                "SELL"
            ]
        ) {

            const outcome =
                getSideOutcome(
                    row,
                    side
                );


            if (
                outcome !== "WIN" &&
                outcome !== "LOSS" &&
                outcome !== "TIMEOUT"
            ) {

                continue;
            }


            const key =
                createPattern(
                    row,
                    side
                );


            if (
                !map.has(key)
            ) {

                map.set(
                    key,
                    createEmptyPattern(
                        key,
                        side
                    )
                );
            }


            const pattern =
                map.get(key);


            pattern.samples++;


            if (
                outcome === "WIN"
            ) {

                pattern.wins++;

                /*
                V11.1 uses approximately
                2R reward.
                */

                pattern.rewardPoints += 2;

            }

            else if (
                outcome === "LOSS"
            ) {

                pattern.losses++;

                /*
                V11.1 risk model.
                */

                pattern.riskPoints += 1.5;

            }

            else {

                pattern.timeouts++;
            }
        }
    }


    const result = [];


    for (
        const pattern
        of map.values()
    ) {

        pattern.decisive =
            pattern.wins +
            pattern.losses;


        if (
            pattern.samples <
            MIN_PATTERN_SAMPLES
        ) {

            continue;
        }


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


        /*
        Bayesian-style smoothing.

        We use a neutral 50% prior
        so a pattern with 3/4 wins does
        not automatically look amazing.
        */

        const PRIOR_SAMPLES = 20;

        pattern.smoothedWinRate =
            (
                pattern.wins +
                (
                    0.50 *
                    PRIOR_SAMPLES
                )
            ) /
            (
                pattern.decisive +
                PRIOR_SAMPLES
            ) *
            100;


        pattern.winRate =
            pattern.smoothedWinRate;


        pattern.profitFactor =
            pattern.riskPoints > 0

                ? pattern.rewardPoints /
                  pattern.riskPoints

                : 0;


        /*
        SAMPLE CONFIDENCE
        */

        const sampleConfidence =
            clamp(
                pattern.samples / 100,
                0,
                1
            );


        /*
        WIN RATE EDGE
        */

        const winConfidence =
            clamp(
                (
                    pattern.smoothedWinRate -
                    50
                ) / 20,
                0,
                1
            );


        /*
        PROFIT FACTOR
        */

        const profitConfidence =
            clamp(
                (
                    pattern.profitFactor -
                    1
                ) / 1.5,
                0,
                1
            );


        /*
        TIMEOUT QUALITY

        Too many timeouts means
        the pattern does not actually
        produce decisive outcomes.
        */

        const timeoutRatio =
            pattern.samples > 0

                ? pattern.timeouts /
                  pattern.samples

                : 1;


        const timeoutConfidence =
            clamp(
                1 -
                timeoutRatio,
                0,
                1
            );


        pattern.confidence =
            (
                sampleConfidence *
                25
            ) +
            (
                winConfidence *
                40
            ) +
            (
                profitConfidence *
                25
            ) +
            (
                timeoutConfidence *
                10
            );


        result.push(
            pattern
        );
    }


    return result.sort(
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
                b.smoothedWinRate -
                a.smoothedWinRate
            );
        }
    );
}


// =====================================================
// EVALUATE PATTERNS
// =====================================================

function evaluatePatterns(
    rows,
    learnedPatterns,
    options = {}
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


    let matchedRows = 0;

    let wins = 0;

    let losses = 0;

    let timeouts = 0;


    let buyMatches = 0;

    let sellMatches = 0;

    let buyWins = 0;

    let buyLosses = 0;

    let sellWins = 0;

    let sellLosses = 0;


    for (
        const row of rows
    ) {

        /*
        Evaluate BUY independently.
        */

        for (
            const side of [
                "BUY",
                "SELL"
            ]
        ) {

            const key =
                createPattern(
                    row,
                    side
                );


            const pattern =
                patternMap.get(key);


            if (!pattern) {
                continue;
            }


            /*
            Optional minimum learned
            quality requirement.
            */

            if (
                options.minimumWinRate &&
                pattern.smoothedWinRate <
                options.minimumWinRate
            ) {

                continue;
            }


            matchedRows++;


            if (side === "BUY") {
                buyMatches++;
            }

            else {
                sellMatches++;
            }


            const sideOutcome =
                getSideOutcome(
                    row,
                    side
                );


            if (
                sideOutcome === "WIN"
            ) {

                wins++;


                if (
                    side === "BUY"
                ) {
                    buyWins++;
                }

                else {
                    sellWins++;
                }

            }

            else if (
                sideOutcome === "LOSS"
            ) {

                losses++;


                if (
                    side === "BUY"
                ) {
                    buyLosses++;
                }

                else {
                    sellLosses++;
                }

            }

            else {

                timeouts++;
            }
        }
    }


    const decisive =
        wins +
        losses;


    const buyDecisive =
        buyWins +
        buyLosses;


    const sellDecisive =
        sellWins +
        sellLosses;


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

        buy: {

            matchedRows:
                buyMatches,

            wins:
                buyWins,

            losses:
                buyLosses,

            decisiveTrades:
                buyDecisive,

            winRate:
                safeRate(
                    buyWins,
                    buyDecisive
                )
        },

        sell: {

            matchedRows:
                sellMatches,

            wins:
                sellWins,

            losses:
                sellLosses,

            decisiveTrades:
                sellDecisive,

            winRate:
                safeRate(
                    sellWins,
                    sellDecisive
                )
        }
    };
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
        const row of rows
    ) {

        const outcome =
            getOutcome(row);


        /*
        IMPORTANT:

        V11.2 accidentally counted
        the label AND the individual
        outcomes.

        V11.3 counts each side once.
        */


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

        else {

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

        else {

            sellTimeouts++;
        }


        if (
            outcome.label ===
            "BOTH_WIN"
        ) {

            bothWins++;

        }


        if (
            outcome.label ===
            "BOTH_LOSS"
        ) {

            bothLosses++;

        }


        if (
            outcome.label ===
            "NO_TRADE"
        ) {

            noTrade++;

        }
    }


    const buyDecisive =
        buyWins +
        buyLosses;


    const sellDecisive =
        sellWins +
        sellLosses;


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
            buyDecisive,

        sellDecisiveTrades:
            sellDecisive,

        buyWinRate:
            safeRate(
                buyWins,
                buyDecisive
            ),

        sellWinRate:
            safeRate(
                sellWins,
                sellDecisive
            )
    };
}


// =====================================================
// VALIDATION OF PATTERN STABILITY
// =====================================================

function findStablePatterns(
    trainingPatterns,
    validationRows
) {

    const stable = [];


    /*
    We evaluate every learned pattern
    against validation data individually.
    */

    const validationMap =
        new Map();


    for (
        const row of validationRows
    ) {

        for (
            const side of [
                "BUY",
                "SELL"
            ]
        ) {

            const key =
                createPattern(
                    row,
                    side
                );


            if (
                !validationMap.has(key)
            ) {

                validationMap.set(
                    key,
                    {

                        samples: 0,

                        wins: 0,

                        losses: 0,

                        timeouts: 0
                    }
                );
            }


            const stat =
                validationMap.get(
                    key
                );


            stat.samples++;


            const outcome =
                getSideOutcome(
                    row,
                    side
                );


            if (
                outcome === "WIN"
            ) {

                stat.wins++;

            }

            else if (
                outcome === "LOSS"
            ) {

                stat.losses++;

            }

            else {

                stat.timeouts++;
            }
        }
    }


    for (
        const pattern
        of trainingPatterns
    ) {

        const validation =
            validationMap.get(
                pattern.key
            );


        if (!validation) {
            continue;
        }


        const decisive =
            validation.wins +
            validation.losses;


        if (
            decisive < 5
        ) {
            continue;
        }


        const validationWinRate =
            safeRate(
                validation.wins,
                decisive
            );


        /*
        Stability rule.

        The validation result does
        not need to equal training,
        but it must remain above 50%.
        */

        const stable =
            validationWinRate >= 50;


        if (stable) {

            stable.push;
        }


        if (stable) {

            pattern.validationStable =
                true;

            pattern.validationSamples =
                validation.samples;

            pattern.validationWins =
                validation.wins;

            pattern.validationLosses =
                validation.losses;

            pattern.validationTimeouts =
                validation.timeouts;

            pattern.validationWinRate =
                validationWinRate;


            stable.push(
                pattern
            );
        }
    }


    return stable;
}


// =====================================================
// PATTERN QUALITY FILTER
// =====================================================

function isRobustPattern(
    pattern
) {

    /*
    Training quality
    */

    if (
        pattern.samples <
        ROBUST_MIN_SAMPLES
    ) {

        return false;
    }


    if (
        pattern.decisive <
        MIN_DECISIVE_SAMPLES
    ) {

        return false;
    }


    if (
        pattern.smoothedWinRate <
        55
    ) {

        return false;
    }


    if (
        pattern.profitFactor <
        1
    ) {

        return false;
    }


    /*
    Validation must support it.
    */

    if (
        !pattern.validationStable
    ) {

        return false;
    }


    if (
        pattern.validationWinRate <
        50
    ) {

        return false;
    }


    return true;
}


// =====================================================
// RANK PATTERNS
// =====================================================

function rankPatterns(
    patterns
) {

    return patterns
        .slice()
        .sort(
            (
                a,
                b
            ) => {

                const aScore =
                    (
                        a.smoothedWinRate *
                        0.50
                    ) +
                    (
                        a.confidence *
                        0.30
                    ) +
                    (
                        (
                            a.validationWinRate ||
                            0
                        ) *
                        0.20
                    );


                const bScore =
                    (
                        b.smoothedWinRate *
                        0.50
                    ) +
                    (
                        b.confidence *
                        0.30
                    ) +
                    (
                        (
                            b.validationWinRate ||
                            0
                        ) *
                        0.20
                    );


                return (
                    bScore -
                    aScore
                );
            }
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

        /*
        ---------------------------------------------
        REQUEST DAYS
        ---------------------------------------------
        */

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
        ---------------------------------------------
        FETCH V11.1 DATASET
        ---------------------------------------------
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

                version: VERSION,

                error:
                    "Not enough learning rows",

                learningRows:
                    rows.length,

                v11_1:
                    {

                        candlesTested:
                            dataset.candlesTested,

                        learningRows:
                            dataset.learningRows
                    },

                paperOnly:
                    true,

                realOrders:
                    false
            });
        }


        /*
        ---------------------------------------------
        CHRONOLOGICAL SPLIT
        ---------------------------------------------

        70% training
        15% validation
        15% unseen test

        NEVER shuffle market data.
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
        ---------------------------------------------
        LEARN FROM TRAINING ONLY
        ---------------------------------------------
        */

        const learnedPatterns =
            analysePatterns(
                trainingRows
            );


        /*
        ---------------------------------------------
        VALIDATION STABILITY
        ---------------------------------------------
        */

        const stablePatterns =
            findStablePatterns(
                learnedPatterns,
                validationRows
            );


        /*
        ---------------------------------------------
        ROBUST PATTERNS
        ---------------------------------------------
        */

        const robustPatterns =
            stablePatterns
                .filter(
                    isRobustPattern
                );


        const rankedPatterns =
            rankPatterns(
                stablePatterns
            );


        const rankedRobustPatterns =
            rankPatterns(
                robustPatterns
            );


        /*
        ---------------------------------------------
        SIDE SPLITS
        ---------------------------------------------
        */

        const buyPatterns =
            rankedPatterns
                .filter(
                    p =>
                        p.side ===
                        "BUY"
                );


        const sellPatterns =
            rankedPatterns
                .filter(
                    p =>
                        p.side ===
                        "SELL"
                );


        const robustBuyPatterns =
            rankedRobustPatterns
                .filter(
                    p =>
                        p.side ===
                        "BUY"
                );


        const robustSellPatterns =
            rankedRobustPatterns
                .filter(
                    p =>
                        p.side ===
                        "SELL"
                );


        /*
        ---------------------------------------------
        PERFORMANCE
        ---------------------------------------------
        */

        const trainingPerformance =
            evaluatePatterns(
                trainingRows,
                learnedPatterns
            );


        const validationPerformance =
            evaluatePatterns(
                validationRows,
                stablePatterns
            );


        const testPerformance =
            evaluatePatterns(
                testRows,
                robustPatterns
            );


        /*
        ---------------------------------------------
        RECOMMENDATION
        ---------------------------------------------
        */

        let recommendation =
            "NEEDS_MORE_DATA";


        const testDecisive =
            testPerformance
                .decisiveTrades;


        if (
            testDecisive >= 20
        ) {

            if (
                testPerformance.winRate >=
                TARGET_WIN_RATE
            ) {

                recommendation =
                    "STRONG_CANDIDATE";

            }

            else if (
                testPerformance.winRate >=
                55
            ) {

                recommendation =
                    "PROMISING";

            }

            else {

                recommendation =
                    "NOT_READY";
            }
        }


        /*
        ---------------------------------------------
        CONFIDENCE
        ---------------------------------------------
        */

        let confidenceLevel =
            "LOW";


        if (
            testDecisive >= 50 &&
            testPerformance.winRate >= 60
        ) {

            confidenceLevel =
                "HIGH";

        }

        else if (
            testDecisive >= 30 &&
            testPerformance.winRate >= 55
        ) {

            confidenceLevel =
                "MEDIUM";
        }


        /*
        ---------------------------------------------
        RESPONSE
        ---------------------------------------------
        */

        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "INDEPENDENT_BUY_SELL_STATISTICAL_LEARNING",

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

                minimumPatternSamples:
                    MIN_PATTERN_SAMPLES,

                minimumDecisiveSamples:
                    MIN_DECISIVE_SAMPLES,

                robustMinimumSamples:
                    ROBUST_MIN_SAMPLES,

                patternsDiscovered:
                    learnedPatterns.length,

                stablePatterns:
                    stablePatterns.length,

                robustPatterns:
                    robustPatterns.length,

                buyPatterns:
                    buyPatterns.length,

                sellPatterns:
                    sellPatterns.length,

                robustBuyPatterns:
                    robustBuyPatterns.length,

                robustSellPatterns:
                    robustSellPatterns.length
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
                    buyPatterns
                        .slice(
                            0,
                            15
                        ),

                SELL:
                    sellPatterns
                        .slice(
                            0,
                            15
                        )
            },


            robustPatterns: {

                BUY:
                    robustBuyPatterns
                        .slice(
                            0,
                            15
                        ),

                SELL:
                    robustSellPatterns
                        .slice(
                            0,
                            15
                        )
            },


            recommendation: {

                status:
                    recommendation,

                confidence:
                    confidenceLevel,

                testWinRate:
                    round(
                        testPerformance.winRate
                    ),

                testDecisiveTrades:
                    testPerformance
                        .decisiveTrades,

                testMatchedRows:
                    testPerformance
                        .matchedRows,

                buyTestWinRate:
                    round(
                        testPerformance.buy.winRate
                    ),

                sellTestWinRate:
                    round(
                        testPerformance.sell.winRate
                    ),

                targetWinRate:
                    TARGET_WIN_RATE,

                message:

                    recommendation ===
                    "STRONG_CANDIDATE"

                        ? "The learned patterns demonstrate a potentially useful unseen-data edge. Continue with walk-forward testing before using even for paper signals."

                    : recommendation ===
                      "PROMISING"

                        ? "The model shows some out-of-sample edge, but additional data and walk-forward testing are required."

                    : recommendation ===
                      "NOT_READY"

                        ? "The learned patterns do not currently demonstrate a reliable unseen-data edge."

                        : "There are not enough decisive unseen-test trades to judge the model reliably."
            }

        });

    }

    catch (error) {

        console.error(
            "V11.3 ERROR:",
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
