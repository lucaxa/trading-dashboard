/*
TradeMind Pro
V11.5 Expected Value & Trade Quality Engine

V11.1
  Learning Dataset
        ↓
V11.4
  Hierarchical Pattern Learning
        ↓
V11.5
  Expected Value
  MFE / MAE
  Profit Factor
  Risk Efficiency
  Pattern Stability
  Trade Quality Ranking
        ↓
  Training / Validation / Unseen Test

PAPER ONLY
NO REAL ORDERS
*/

const VERSION = "V11.5";

const MIN_PATTERN_SAMPLES = 20;
const MIN_DECISIVE_SAMPLES = 12;

const TRAIN_RATIO = 0.70;
const VALIDATION_RATIO = 0.15;

const TARGET_PROFIT_FACTOR = 1.50;
const MIN_EXPECTANCY = 0;

const MIN_TRADE_QUALITY = 55;


// =====================================================
// HELPERS
// =====================================================

function round(value, decimals = 2) {

    if (!Number.isFinite(Number(value))) {
        return 0;
    }

    const p = Math.pow(10, decimals);

    return Math.round(
        Number(value) * p
    ) / p;
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
            Number(value) || 0
        )
    );
}


function average(values) {

    const clean =
        values
            .map(Number)
            .filter(
                Number.isFinite
            );

    if (!clean.length) {
        return 0;
    }

    return (
        clean.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        clean.length
    );
}


function median(values) {

    const clean =
        values
            .map(Number)
            .filter(
                Number.isFinite
            )
            .sort(
                (a, b) =>
                    a - b
            );

    if (!clean.length) {
        return 0;
    }

    const middle =
        Math.floor(
            clean.length / 2
        );

    if (
        clean.length % 2 === 0
    ) {

        return (
            clean[middle - 1] +
            clean[middle]
        ) / 2;

    }

    return clean[middle];
}


function standardDeviation(values) {

    const clean =
        values
            .map(Number)
            .filter(
                Number.isFinite
            );

    if (clean.length < 2) {
        return 0;
    }

    const mean =
        average(clean);

    const variance =
        clean.reduce(
            (sum, value) =>
                sum +
                Math.pow(
                    value - mean,
                    2
                ),
            0
        ) /
        clean.length;

    return Math.sqrt(
        variance
    );
}


// =====================================================
// FEATURE BUCKETS
// =====================================================

function bucketRSI(rsi) {

    const x =
        safeNumber(rsi, 50);

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
            safeNumber(value)
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
            safeNumber(value)
        );

    if (x < 0.10) return "<0.10";
    if (x < 0.25) return "0.10-0.25";
    if (x < 0.50) return "0.25-0.50";
    if (x < 0.75) return "0.50-0.75";

    return "0.75+";
}


function bucketVWAP(value) {

    const x =
        safeNumber(value);

    if (x < -1) {
        return "<-1ATR";
    }

    if (x < -0.25) {
        return "-1 to -0.25";
    }

    if (x < 0.25) {
        return "-0.25 to 0.25";
    }

    if (x < 1) {
        return "0.25 to 1";
    }

    return ">1ATR";
}


function bucketBody(value) {

    const x =
        safeNumber(value);

    if (x < 0.20) return "<20%";
    if (x < 0.40) return "20-40%";
    if (x < 0.60) return "40-60%";
    if (x < 0.80) return "60-80%";

    return "80%+";
}


function bucketTime(hour) {

    const h =
        safeNumber(hour);

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
// PATTERN
// =====================================================

function createPattern(
    row,
    side
) {

    return [

        side,

        row.trend ||
            "UNKNOWN",

        row.regime ||
            "UNKNOWN",

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
// OUTCOME
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

function getSideOutcome(
    row,
    side
) {

    const outcome =
        getOutcome(row);

    if (side === "BUY") {

        return {

            result:
                outcome.buyOutcome ||
                "TIMEOUT",

            mfe:
                Math.max(
                    0,
                    safeNumber(
                        outcome.maxFavorableBuy
                    )
                ),

            mae:
                Math.max(
                    0,
                    safeNumber(
                        outcome.maxAdverseBuy
                    )
                )
        };
    }


    return {

        result:
            outcome.sellOutcome ||
            "TIMEOUT",

        mfe:
            Math.max(
                0,
                safeNumber(
                    outcome.maxFavorableSell
                )
            ),

        mae:
            Math.max(
                0,
                safeNumber(
                    outcome.maxAdverseSell
                )
            )
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
// PATTERN LEARNING
// =====================================================

function analysePatterns(rows) {

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

                    decisiveTrades: 0,

                    winRate: 0,

                    averageWin: 0,

                    averageLoss: 0,

                    averageMFE: 0,

                    averageMAE: 0,

                    medianMFE: 0,

                    medianMAE: 0,

                    mfeMaeRatio: 0,

                    grossProfit: 0,

                    grossLoss: 0,

                    profitFactor: 0,

                    expectancy: 0,

                    payoffRatio: 0,

                    consistency: 0,

                    confidence: 0,

                    tradeQuality: 0,

                    winsMFE: [],

                    lossesMAE: [],

                    allMFE: [],

                    allMAE: [],

                    returns: []
                }
            );
        }


        const pattern =
            map.get(key);


        pattern.samples++;


        const sideData =
            getSideOutcome(
                row,
                side
            );


        pattern.allMFE.push(
            sideData.mfe
        );


        pattern.allMAE.push(
            sideData.mae
        );


        if (
            sideData.result ===
            "WIN"
        ) {

            pattern.wins++;


            pattern.winsMFE.push(
                sideData.mfe
            );


            pattern.returns.push(
                sideData.mfe
            );
        }

        else if (
            sideData.result ===
            "LOSS"
        ) {

            pattern.losses++;


            pattern.lossesMAE.push(
                sideData.mae
            );


            /*
            Loss is represented
            by adverse excursion.
            */

            pattern.returns.push(
                -sideData.mae
            );

        }

        else {

            pattern.timeouts++;

        }
    }


    const patterns = [];


    for (
        const pattern
        of map.values()
    ) {

        pattern.decisiveTrades =
            pattern.wins +
            pattern.losses;


        if (
            pattern.samples <
            MIN_PATTERN_SAMPLES
        ) {
            continue;
        }


        if (
            pattern.decisiveTrades <
            MIN_DECISIVE_SAMPLES
        ) {
            continue;
        }


        pattern.winRate =
            safeRate(
                pattern.wins,
                pattern.decisiveTrades
            );


        pattern.averageWin =
            average(
                pattern.winsMFE
            );


        pattern.averageLoss =
            average(
                pattern.lossesMAE
            );


        pattern.averageMFE =
            average(
                pattern.allMFE
            );


        pattern.averageMAE =
            average(
                pattern.allMAE
            );


        pattern.medianMFE =
            median(
                pattern.allMFE
            );


        pattern.medianMAE =
            median(
                pattern.allMAE
            );


        pattern.mfeMaeRatio =
            pattern.averageMAE > 0
                ? pattern.averageMFE /
                  pattern.averageMAE
                : 0;


        pattern.grossProfit =
            pattern.wins *
            pattern.averageWin;


        pattern.grossLoss =
            pattern.losses *
            pattern.averageLoss;


        pattern.profitFactor =
            pattern.grossLoss > 0
                ? pattern.grossProfit /
                  pattern.grossLoss
                : 0;


        /*
        Actual expectancy
        per decisive trade.

        Positive = potentially
        profitable setup.
        */

        const winProbability =
            pattern.wins /
            pattern.decisiveTrades;


        const lossProbability =
            pattern.losses /
            pattern.decisiveTrades;


        pattern.expectancy =
            (
                winProbability *
                pattern.averageWin
            ) -
            (
                lossProbability *
                pattern.averageLoss
            );


        pattern.payoffRatio =
            pattern.averageLoss > 0
                ? pattern.averageWin /
                  pattern.averageLoss
                : 0;


        /*
        Consistency.

        Lower return volatility
        relative to average
        return is preferred.
        */

        const returnMean =
            average(
                pattern.returns
            );


        const returnStd =
            standardDeviation(
                pattern.returns
            );


        if (
            returnStd > 0
        ) {

            pattern.consistency =
                clamp(
                    (
                        returnMean /
                        returnStd
                    ) * 50 + 50,
                    0,
                    100
                );

        } else {

            pattern.consistency =
                returnMean > 0
                    ? 100
                    : 0;
        }


        /*
        Sample confidence.

        More observations =
        more confidence.
        */

        const sampleConfidence =
            clamp(
                pattern.samples / 100,
                0,
                1
            );


        /*
        Expectancy score.

        Positive expectancy gets
        rewarded strongly.

        Negative expectancy is
        heavily penalized.
        */

        const expectancyScore =
            clamp(
                (
                    pattern.expectancy /
                    Math.max(
                        pattern.averageLoss,
                        1
                    )
                ) * 50 + 50,
                0,
                100
            );


        const profitFactorScore =
            clamp(
                (
                    pattern.profitFactor /
                    TARGET_PROFIT_FACTOR
                ) * 100,
                0,
                100
            );


        const payoffScore =
            clamp(
                (
                    pattern.payoffRatio /
                    2
                ) * 100,
                0,
                100
            );


        const mfeMaeScore =
            clamp(
                (
                    pattern.mfeMaeRatio /
                    2
                ) * 100,
                0,
                100
            );


        /*
        Trade Quality Score.

        This is deliberately NOT
        dominated by win rate.
        */

        pattern.tradeQuality =
            (
                expectancyScore *
                0.30
            ) +
            (
                profitFactorScore *
                0.25
            ) +
            (
                payoffScore *
                0.15
            ) +
            (
                mfeMaeScore *
                0.15
            ) +
            (
                pattern.consistency *
                0.10
            ) +
            (
                sampleConfidence *
                100 *
                0.05
            );


        /*
        Confidence adjusts quality.

        A 90-quality setup with
        20 observations shouldn't
        be treated the same as one
        with hundreds of samples.
        */

        pattern.confidence =
            (
                sampleConfidence *
                60
            ) +
            (
                clamp(
                    pattern.profitFactor /
                    TARGET_PROFIT_FACTOR,
                    0,
                    1
                ) *
                20
            ) +
            (
                clamp(
                    pattern.expectancy /
                    Math.max(
                        pattern.averageLoss,
                        1
                    ),
                    0,
                    1
                ) *
                20
            );


        /*
        Remove internal arrays
        before returning.
        */

        delete pattern.winsMFE;
        delete pattern.lossesMAE;
        delete pattern.allMFE;
        delete pattern.allMAE;
        delete pattern.returns;


        patterns.push(
            pattern
        );
    }


    return patterns.sort(
        (a, b) =>
            b.tradeQuality -
            a.tradeQuality
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


    let matchedRows = 0;

    let wins = 0;

    let losses = 0;

    let timeouts = 0;

    let grossProfit = 0;

    let grossLoss = 0;

    const favorable = [];

    const adverse = [];

    const returns = [];


    for (
        const row
        of rows
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


        const sideData =
            getSideOutcome(
                row,
                side
            );


        favorable.push(
            sideData.mfe
        );


        adverse.push(
            sideData.mae
        );


        if (
            sideData.result ===
            "WIN"
        ) {

            wins++;

            grossProfit +=
                sideData.mfe;

            returns.push(
                sideData.mfe
            );

        }

        else if (
            sideData.result ===
            "LOSS"
        ) {

            losses++;

            grossLoss +=
                sideData.mae;

            returns.push(
                -sideData.mae
            );

        }

        else {

            timeouts++;
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


    const averageWin =
        wins > 0
            ? grossProfit / wins
            : 0;


    const averageLoss =
        losses > 0
            ? grossLoss / losses
            : 0;


    const profitFactor =
        grossLoss > 0
            ? grossProfit /
              grossLoss
            : 0;


    const expectancy =
        decisive > 0
            ? (
                grossProfit -
                grossLoss
              ) /
              decisive
            : 0;


    const payoffRatio =
        averageLoss > 0
            ? averageWin /
              averageLoss
            : 0;


    const averageMFE =
        average(
            favorable
        );


    const averageMAE =
        average(
            adverse
        );


    const mfeMaeRatio =
        averageMAE > 0
            ? averageMFE /
              averageMAE
            : 0;


    const returnStd =
        standardDeviation(
            returns
        );


    const consistency =
        returnStd > 0
            ? clamp(
                (
                    expectancy /
                    returnStd
                ) * 50 + 50,
                0,
                100
            )
            : expectancy > 0
                ? 100
                : 0;


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

        grossProfit:
            round(
                grossProfit
            ),

        grossLoss:
            round(
                grossLoss
            ),

        averageWin:
            round(
                averageWin
            ),

        averageLoss:
            round(
                averageLoss
            ),

        expectancy:
            round(
                expectancy
            ),

        profitFactor:
            round(
                profitFactor,
                3
            ),

        payoffRatio:
            round(
                payoffRatio,
                3
            ),

        averageMFE:
            round(
                averageMFE
            ),

        averageMAE:
            round(
                averageMAE
            ),

        mfeMaeRatio:
            round(
                mfeMaeRatio,
                3
            ),

        consistency:
            round(
                consistency
            ),

        totalPoints:
            round(
                grossProfit -
                grossLoss
            )
    };
}


// =====================================================
// DRAWDOWN
// =====================================================

function calculateDrawdown(
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


    let equity = 0;

    let peak = 0;

    let maxDrawdown = 0;


    const equityCurve = [];


    for (
        const row
        of rows
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


        if (
            !patternMap.has(key)
        ) {
            continue;
        }


        const sideData =
            getSideOutcome(
                row,
                side
            );


        if (
            sideData.result ===
            "WIN"
        ) {

            equity +=
                sideData.mfe;

        }

        else if (
            sideData.result ===
            "LOSS"
        ) {

            equity -=
                sideData.mae;
        }


        peak =
            Math.max(
                peak,
                equity
            );


        const drawdown =
            peak -
            equity;


        maxDrawdown =
            Math.max(
                maxDrawdown,
                drawdown
            );


        equityCurve.push(
            equity
        );
    }


    return {

        finalEquity:
            round(
                equity
            ),

        maxDrawdown:
            round(
                maxDrawdown
            ),

        equityCurvePoints:
            equityCurve.length
    };
}


// =====================================================
// ROBUST PATTERNS
// =====================================================

function findRobustPatterns(
    trainingPatterns,
    validationRows,
    testRows
) {

    /*
    We first identify
    economically attractive
    patterns in training.

    Then validation and test
    are checked independently.
    */

    const robust = [];


    for (
        const pattern
        of trainingPatterns
    ) {

        if (
            pattern.samples <
            30
        ) {
            continue;
        }


        if (
            pattern.decisiveTrades <
            MIN_DECISIVE_SAMPLES
        ) {
            continue;
        }


        if (
            pattern.expectancy <=
            MIN_EXPECTANCY
        ) {
            continue;
        }


        if (
            pattern.profitFactor <
            TARGET_PROFIT_FACTOR
        ) {
            continue;
        }


        if (
            pattern.tradeQuality <
            MIN_TRADE_QUALITY
        ) {
            continue;
        }


        /*
        Keep it for later
        validation/testing.
        */

        robust.push(
            pattern
        );
    }


    return robust;
}


// =====================================================
// DATASET SUMMARY
// =====================================================

function datasetSummary(rows) {

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
// PATTERN SUMMARY
// =====================================================

function patternSummary(
    patterns
) {

    return {

        total:
            patterns.length,

        positiveExpectancy:
            patterns.filter(
                p =>
                    p.expectancy > 0
            ).length,

        profitFactorAbove15:
            patterns.filter(
                p =>
                    p.profitFactor >=
                    1.5
            ).length,

        qualityAbove55:
            patterns.filter(
                p =>
                    p.tradeQuality >=
                    55
            ).length,

        qualityAbove70:
            patterns.filter(
                p =>
                    p.tradeQuality >=
                    70
            ).length,

        qualityAbove80:
            patterns.filter(
                p =>
                    p.tradeQuality >=
                    80
            ).length
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


        // -------------------------------------------------
        // GET V11.1 LEARNING DATA
        // -------------------------------------------------

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

                paperOnly:
                    true,

                realOrders:
                    false
            });
        }


        // -------------------------------------------------
        // CHRONOLOGICAL SPLIT
        // -------------------------------------------------

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


        // -------------------------------------------------
        // LEARN ONLY FROM TRAINING
        // -------------------------------------------------

        const learnedPatterns =
            analysePatterns(
                trainingRows
            );


        const buyPatterns =
            learnedPatterns.filter(
                p =>
                    p.side ===
                    "BUY"
            );


        const sellPatterns =
            learnedPatterns.filter(
                p =>
                    p.side ===
                    "SELL"
            );


        // -------------------------------------------------
        // PERFORMANCE
        // -------------------------------------------------

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


        // -------------------------------------------------
        // DRAWDOWN
        // -------------------------------------------------

        const trainingDrawdown =
            calculateDrawdown(
                trainingRows,
                learnedPatterns
            );


        const validationDrawdown =
            calculateDrawdown(
                validationRows,
                learnedPatterns
            );


        const testDrawdown =
            calculateDrawdown(
                testRows,
                learnedPatterns
            );


        // -------------------------------------------------
        // ROBUST PATTERNS
        // -------------------------------------------------

        const robustPatterns =
            findRobustPatterns(
                learnedPatterns,
                validationRows,
                testRows
            );


        const robustBuyPatterns =
            robustPatterns.filter(
                p =>
                    p.side ===
                    "BUY"
            );


        const robustSellPatterns =
            robustPatterns.filter(
                p =>
                    p.side ===
                    "SELL"
            );


        // -------------------------------------------------
        // VALIDATE ROBUST PATTERNS
        // -------------------------------------------------

        const robustValidation =
            evaluatePatterns(
                validationRows,
                robustPatterns
            );


        const robustTest =
            evaluatePatterns(
                testRows,
                robustPatterns
            );


        const robustTestDrawdown =
            calculateDrawdown(
                testRows,
                robustPatterns
            );


        // -------------------------------------------------
        // FINAL STATUS
        // -------------------------------------------------

        let recommendation =
            "NEEDS_MORE_DATA";


        if (
            robustTest.matchedRows >= 20 &&
            robustTest.expectancy > 0 &&
            robustTest.profitFactor >= 1.2
        ) {

            recommendation =
                "PROFITABLE_CANDIDATE";

        }

        else if (
            testPerformance.matchedRows >= 20 &&
            testPerformance.expectancy > 0
        ) {

            recommendation =
                "PROMISING";

        }

        else if (
            learnedPatterns.length > 0
        ) {

            recommendation =
                "NOT_READY";
        }


        // -------------------------------------------------
        // TOP PATTERNS
        // -------------------------------------------------

        const topBuy =
            buyPatterns
                .slice(0, 20);


        const topSell =
            sellPatterns
                .slice(0, 20);


        // -------------------------------------------------
        // RESPONSE
        // -------------------------------------------------

        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "EXPECTED_VALUE_TRADE_QUALITY_LEARNING",

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
                    "MINIMIZE_DRAWDOWN",

                tertiary:
                    "SELECT_HIGH_QUALITY_TRADES",

                targetProfitFactor:
                    TARGET_PROFIT_FACTOR,

                minimumExpectancy:
                    MIN_EXPECTANCY,

                minimumTradeQuality:
                    MIN_TRADE_QUALITY
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
                    datasetSummary(
                        trainingRows
                    ),

                validation:
                    datasetSummary(
                        validationRows
                    ),

                test:
                    datasetSummary(
                        testRows
                    )
            },


            learning: {

                minimumPatternSamples:
                    MIN_PATTERN_SAMPLES,

                minimumDecisiveSamples:
                    MIN_DECISIVE_SAMPLES,

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


            patternQuality: {

                all:
                    patternSummary(
                        learnedPatterns
                    ),

                BUY:
                    patternSummary(
                        buyPatterns
                    ),

                SELL:
                    patternSummary(
                        sellPatterns
                    ),

                robust:
                    patternSummary(
                        robustPatterns
                    )
            },


            performance: {

                allLearnedPatterns: {

                    training:
                        trainingPerformance,

                    validation:
                        validationPerformance,

                    unseenTest:
                        testPerformance
                },


                robustPatterns: {

                    validation:
                        robustValidation,

                    unseenTest:
                        robustTest
                }
            },


            drawdown: {

                training:
                    trainingDrawdown,

                validation:
                    validationDrawdown,

                unseenTest:
                    testDrawdown,

                robustUnseenTest:
                    robustTestDrawdown
            },


            topPatterns: {

                BUY:
                    topBuy,

                SELL:
                    topSell
            },


            robustPatterns: {

                BUY:
                    robustBuyPatterns
                        .slice(0, 20),

                SELL:
                    robustSellPatterns
                        .slice(0, 20)
            },


            recommendation: {

                status:
                    recommendation,

                targetProfitFactor:
                    TARGET_PROFIT_FACTOR,

                testExpectancy:
                    round(
                        testPerformance.expectancy
                    ),

                testProfitFactor:
                    round(
                        testPerformance.profitFactor,
                        3
                    ),

                testWinRate:
                    round(
                        testPerformance.winRate
                    ),

                testMatchedRows:
                    testPerformance.matchedRows,

                testMaxDrawdown:
                    testDrawdown.maxDrawdown,

                robustTestExpectancy:
                    round(
                        robustTest.expectancy
                    ),

                robustTestProfitFactor:
                    round(
                        robustTest.profitFactor,
                        3
                    ),

                robustTestMatchedRows:
                    robustTest.matchedRows,

                message:

                    recommendation ===
                    "PROFITABLE_CANDIDATE"

                        ? "Promising positive-expectancy candidate. Continue with walk-forward paper testing before any live consideration."

                    : recommendation ===
                      "PROMISING"

                        ? "Positive edge detected, but the evidence is not yet strong enough. Continue validation."

                    : recommendation ===
                      "NOT_READY"

                        ? "Current patterns do not demonstrate sufficient out-of-sample profitability."

                        : "More historical data is required."
            }

        });

    }

    catch (error) {

        console.error(
            "V11.5 ERROR:",
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
