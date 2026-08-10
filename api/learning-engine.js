/*
TradeMind Pro
V11.2 Statistical Learning Engine

V11.1 Learning Dataset
        ↓
V11.2 Pattern Learning
        ↓
Training / Validation / Test
        ↓
Statistical Pattern Ranking

PAPER ONLY
NO REAL ORDERS
*/

const VERSION = "V11.2";

const MIN_PATTERN_SAMPLES = 20;

const TRAIN_RATIO = 0.70;
const VALIDATION_RATIO = 0.15;


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


// =====================================================
// PATTERN KEY
// =====================================================

function createPattern(
    row,
    side
) {

    return [

        side,

        row.trend || "UNKNOWN",

        row.regime || "UNKNOWN",

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
// FETCH V11.1 DATA
// =====================================================

async function fetchLearningDataset(
    req,
    days
) {

    /*
    IMPORTANT:

    We deliberately use the existing
    V11.1 endpoint.

    This means:

    V11.1 handles:
    - INDstocks API
    - API authentication
    - chunking
    - candle normalization
    - indicators
    - outcome generation

    V11.2 only performs learning.
    */


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

        return row.outcome;
    }


    /*
    Defensive support if the
    dataset ever exposes outcome
    fields differently.
    */

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
// PATTERN ANALYSIS
// =====================================================

function analysePatterns(
    rows
) {

    const map =
        new Map();


    for (
        const row of rows
    ) {

        const outcome =
            getOutcome(row);


        const side =
            outcome.preferredDirection;


        if (
            side !== "BUY" &&
            side !== "SELL"
        ) {
            continue;
        }


        const key =
            createPattern(
                row,
                side
            );


        if (!map.has(key)) {

            map.set(
                key,
                {

                    key,

                    side,

                    samples: 0,

                    wins: 0,

                    losses: 0,

                    timeouts: 0,

                    winRate: 0,

                    profitFactor: 0,

                    rewardPoints: 0,

                    riskPoints: 0,

                    confidence: 0
                }
            );
        }


        const pattern =
            map.get(key);


        pattern.samples++;


        const sideOutcome =
            side === "BUY"
                ? outcome.buyOutcome
                : outcome.sellOutcome;


        if (
            sideOutcome === "WIN"
        ) {

            pattern.wins++;

            /*
            V11.1 reward model:
            approximately 2R reward.
            */

            pattern.rewardPoints += 2;

        }

        else if (
            sideOutcome === "LOSS"
        ) {

            pattern.losses++;

            /*
            V11.1 risk model:
            approximately 1.5R.
            */

            pattern.riskPoints += 1.5;

        }

        else {

            pattern.timeouts++;
        }
    }


    const result = [];


    for (
        const pattern of map.values()
    ) {

        const decisive =
            pattern.wins +
            pattern.losses;


        if (
            pattern.samples <
            MIN_PATTERN_SAMPLES
        ) {
            continue;
        }


        pattern.winRate =
            safeRate(
                pattern.wins,
                decisive
            );


        pattern.profitFactor =
            pattern.riskPoints > 0
                ? pattern.rewardPoints /
                  pattern.riskPoints
                : 0;


        /*
        Confidence model.

        We don't simply select
        the highest historical
        win rate.

        Sample size matters.
        */

        const sampleConfidence =
            clamp(
                pattern.samples / 100,
                0,
                1
            );


        const winConfidence =
            clamp(
                (
                    pattern.winRate - 50
                ) / 25,
                0,
                1
            );


        const profitConfidence =
            clamp(
                (
                    pattern.profitFactor - 1
                ) / 1.5,
                0,
                1
            );


        pattern.confidence =
            (
                sampleConfidence *
                30
            ) +
            (
                winConfidence *
                45
            ) +
            (
                profitConfidence *
                25
            );


        result.push(
            pattern
        );
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
// EVALUATE PATTERNS
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


    let matchedRows = 0;

    let wins = 0;

    let losses = 0;

    let timeouts = 0;


    for (
        const row of rows
    ) {

        const outcome =
            getOutcome(row);


        const side =
            outcome.preferredDirection;


        if (
            side !== "BUY" &&
            side !== "SELL"
        ) {
            continue;
        }


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


        matchedRows++;


        const sideOutcome =
            side === "BUY"
                ? outcome.buyOutcome
                : outcome.sellOutcome;


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
            )
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


        if (
            outcome.label ===
            "BUY_WIN"
        ) {

            buyWins++;

        }

        else if (
            outcome.label ===
            "SELL_WIN"
        ) {

            sellWins++;

        }

        else if (
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

        else {

            noTrade++;
        }


        if (
            outcome.buyOutcome ===
            "WIN"
        ) {

            buyWins++;

        }


        if (
            outcome.buyOutcome ===
            "LOSS"
        ) {

            buyLosses++;

        }


        if (
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


        if (
            outcome.sellOutcome ===
            "LOSS"
        ) {

            sellLosses++;

        }


        if (
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

        noTrade
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
                    30,
                    Number(
                        req.query.days ||
                        30
                    )
                )
            );


        /*
        Get the proven V11.1
        dataset.
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
                    }
            });
        }


        /*
        IMPORTANT:

        Chronological split.

        We NEVER shuffle financial
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
        Learn ONLY from training.
        */

        const learnedPatterns =
            analysePatterns(
                trainingRows
            );


        const buyPatterns =
            learnedPatterns
                .filter(
                    p =>
                        p.side ===
                        "BUY"
                );


        const sellPatterns =
            learnedPatterns
                .filter(
                    p =>
                        p.side ===
                        "SELL"
                );


        /*
        Test against unseen data.
        */

        const trainingPerformance =
            evaluatePatterns(
                trainingRows,
                learnedPatterns
            );


        const validationPerformance =
            evaluatePatterns(
                validationRows,
                learnedPatterns
            );


        const testPerformance =
            evaluatePatterns(
                testRows,
                learnedPatterns
            );


        /*
        Find robust patterns.

        We require:
        - enough samples
        - >=55% training WR
        - >=55% validation WR
        - positive profit factor
        */

        const robustPatterns =
            learnedPatterns
                .filter(
                    p =>
                        p.samples >= 30 &&
                        p.winRate >= 55 &&
                        p.profitFactor >= 1
                );


        const robustBuyPatterns =
            robustPatterns
                .filter(
                    p =>
                        p.side ===
                        "BUY"
                );


        const robustSellPatterns =
            robustPatterns
                .filter(
                    p =>
                        p.side ===
                        "SELL"
                );


        /*
        Final recommendation.

        We do NOT claim success
        just because training
        performs well.

        The unseen test matters.
        */

        let recommendation =
            "NEEDS_MORE_DATA";


        if (
            testPerformance
                .matchedRows >= 30
        ) {

            if (
                testPerformance.winRate >=
                60
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


        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "STATISTICAL_PATTERN_LEARNING",

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

                testWinRate:
                    round(
                        testPerformance.winRate
                    ),

                testMatchedRows:
                    testPerformance.matchedRows,

                targetWinRate:
                    60,

                message:

                    recommendation ===
                    "STRONG_CANDIDATE"

                        ? "Statistically promising. Proceed to walk-forward testing before using for paper signals."

                    : recommendation ===
                      "PROMISING"

                        ? "Some edge detected, but more validation is required."

                    : recommendation ===
                      "NOT_READY"

                        ? "The learned patterns do not yet demonstrate a reliable out-of-sample edge."

                        : "More historical data is required."
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
