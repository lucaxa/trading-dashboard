/*
TradeMind Pro
V12.2
TRUE BRAIN-GATED PAPER EXECUTION ENGINE

V12.1 PROBLEM:
The paper executor used directional conditions directly.
That created too many trades and produced a negative result.

V12.2 FIX:
The V11.12 generalized learning brain is now the gatekeeper.

A paper trade is allowed ONLY when:

1. A directional setup exists
2. A generalized pattern is discovered from PRIOR data
3. The pattern passes statistical quality requirements
4. The pattern is robust across walk-forward folds
5. The current TEST candle matches that trained pattern

IMPORTANT:
Historical execution is TRUE OUT-OF-SAMPLE.

For each walk-forward block:

TRAIN DATA
    ↓
LEARN PATTERNS
    ↓
QUALIFY ROBUST PATTERNS
    ↓
TEST FUTURE DATA
    ↓
PAPER EXECUTE ONLY MATCHING PATTERNS
    ↓
MOVE FORWARD
    ↓
RETRAIN

Current candle outcome is NEVER used to create
the current signal.

PAPER ONLY.
NO REAL ORDERS.
*/


// ============================================================
// VERSION
// ============================================================

const VERSION = "V12.2";

const INTERVAL = "5minute";

const INSTRUMENT = "NIFTY 50";

const REQUESTED_DAYS = 30;


// ============================================================
// SAFETY
// ============================================================

const PAPER_ONLY = true;

const REAL_ORDERS = false;

const BROKER_ORDER_ENABLED = false;


// ============================================================
// RISK MODEL
// ============================================================

const STOP_R = 1.0;

const TARGET_R = 2.0;

const PREFERRED_TARGET_R = 2.5;

const MAX_HOLD_CANDLES = 12;


// ============================================================
// PAPER ACCOUNT
// ============================================================

const STARTING_CAPITAL = 100000;


// ============================================================
// LEARNING REQUIREMENTS
// ============================================================

const MIN_LEVEL1_SAMPLES = 20;

const MIN_LEVEL2_SAMPLES = 15;

const MIN_LEVEL3_SAMPLES = 12;

const MIN_LEVEL4_SAMPLES = 10;

const MIN_DECISIVE_TRADES = 8;

const MIN_EXPECTED_VALUE = 0.10;

const GOOD_EXPECTED_VALUE = 0.20;

const MIN_PROFIT_FACTOR = 1.10;

const GOOD_PROFIT_FACTOR = 1.30;

const MIN_STABLE_FOLDS = 2;

const QUALITY_THRESHOLD = 45;

const MAX_PATTERN_DRAWDOWN_R = 15;


// ============================================================
// WALK FORWARD
// ============================================================

const FOLD_COUNT = 4;


// ============================================================
// GENERAL HELPERS
// ============================================================

function number(
    value,
    fallback = null
) {

    const n =
        Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function round(
    value,
    decimals = 3
) {

    if (
        !Number.isFinite(value)
    ) {
        return 0;
    }

    const multiplier =
        Math.pow(
            10,
            decimals
        );

    return (
        Math.round(
            value *
            multiplier
        ) /
        multiplier
    );
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


function normalizeTimestamp(
    value
) {

    let ts =
        number(value);

    if (
        ts === null
    ) {
        return null;
    }

    if (
        ts >
        100000000000
    ) {
        ts =
            ts /
            1000;
    }

    return Math.floor(ts);
}


function getField(
    object,
    fields
) {

    if (
        !object ||
        typeof object !==
            "object"
    ) {
        return null;
    }

    for (
        const field
        of fields
    ) {

        if (
            object[field] !==
                undefined &&
            object[field] !==
                null
        ) {

            return object[field];
        }
    }

    return null;
}


// ============================================================
// DATASET FETCH
// ============================================================

async function fetchDataset(
    req
) {

    const host =
        req.headers[
            "x-forwarded-host"
        ] ||
        req.headers.host;

    const protocol =
        req.headers[
            "x-forwarded-proto"
        ] ||
        "https";

    if (!host) {

        throw new Error(
            "Unable to determine Vercel host"
        );
    }

    const url =
        `${protocol}://${host}` +
        `/api/learning-dataset` +
        `?interval=${INTERVAL}` +
        `&days=${REQUESTED_DAYS}`;

    const response =
        await fetch(
            url,
            {
                method:
                    "GET",

                headers: {
                    Accept:
                        "application/json"
                }
            }
        );

    if (
        !response.ok
    ) {

        throw new Error(
            `Learning dataset HTTP ${response.status}`
        );
    }

    const data =
        await response.json();

    if (
        !data ||
        data.success !== true
    ) {

        throw new Error(
            "Learning dataset unsuccessful"
        );
    }

    if (
        !Array.isArray(
            data.rows
        )
    ) {

        throw new Error(
            "Learning dataset rows[] missing"
        );
    }

    return {
        data,
        url
    };
}


// ============================================================
// NORMALIZE DATA
// ============================================================

function normalizeRows(
    rows
) {

    const result = [];

    for (
        const row
        of rows
    ) {

        if (
            !row ||
            typeof row !==
                "object"
        ) {
            continue;
        }

        const normalized = {

            ...row,

            timestamp:
                normalizeTimestamp(
                    getField(
                        row,
                        [
                            "timestamp",
                            "ts",
                            "time",
                            "date"
                        ]
                    )
                ),

            open:
                number(
                    getField(
                        row,
                        [
                            "open",
                            "o"
                        ]
                    )
                ),

            high:
                number(
                    getField(
                        row,
                        [
                            "high",
                            "h"
                        ]
                    )
                ),

            low:
                number(
                    getField(
                        row,
                        [
                            "low",
                            "l"
                        ]
                    )
                ),

            close:
                number(
                    getField(
                        row,
                        [
                            "close",
                            "c"
                        ]
                    )
                ),

            rsi14:
                number(
                    row.rsi14
                ),

            vwap:
                number(
                    row.vwap
                ),

            vwapDistanceATR:
                number(
                    row.vwapDistanceATR
                ),

            emaSpreadATR:
                number(
                    row.emaSpreadATR
                ),

            ema9SlopeATR:
                number(
                    row.ema9SlopeATR
                ),

            bodyRatio:
                number(
                    row.bodyRatio
                ),

            atr14:
                number(
                    row.atr14
                )
        };

        if (
            normalized.close ===
                null ||
            normalized.high ===
                null ||
            normalized.low ===
                null
        ) {
            continue;
        }

        result.push(
            normalized
        );
    }

    result.sort(
        (
            a,
            b
        ) =>
            (
                a.timestamp ||
                0
            ) -
            (
                b.timestamp ||
                0
            )
    );

    return result;
}


// ============================================================
// OUTCOME EXTRACTION
// ============================================================

function getOutcome(
    row
) {

    if (
        row &&
        row.outcome &&
        typeof row.outcome ===
            "object"
    ) {

        return {

            buyOutcome:
                row.outcome.buyOutcome ||
                row.buyOutcome ||
                "TIMEOUT",

            sellOutcome:
                row.outcome.sellOutcome ||
                row.sellOutcome ||
                "TIMEOUT"
        };
    }

    return {

        buyOutcome:
            row &&
            (
                row.buyOutcome ||
                row.buyResult
            ) ||
            "TIMEOUT",

        sellOutcome:
            row &&
            (
                row.sellOutcome ||
                row.sellResult
            ) ||
            "TIMEOUT"
    };
}


function sideOutcome(
    row,
    side
) {

    const outcome =
        getOutcome(row);

    return side ===
        "BUY"

        ? outcome.buyOutcome

        : outcome.sellOutcome;
}


// ============================================================
// FEATURE BUCKETS
// ============================================================

function rsiBucket(
    value
) {

    const r =
        number(value);

    if (
        r === null
    ) {
        return "UNKNOWN";
    }

    if (r < 30)
        return "EXTREME_LOW";

    if (r < 35)
        return "LOW";

    if (r < 40)
        return "LOW_MID";

    if (r < 45)
        return "MID_LOW";

    if (r < 50)
        return "NEUTRAL_LOW";

    if (r < 55)
        return "NEUTRAL_HIGH";

    if (r < 60)
        return "MID_HIGH";

    if (r < 65)
        return "HIGH";

    if (r < 70)
        return "VERY_HIGH";

    return "EXTREME_HIGH";
}


function vwapDirection(
    row
) {

    const distance =
        number(
            row.vwapDistanceATR
        );

    if (
        distance !== null
    ) {

        if (
            distance <
            -0.25
        ) {
            return "BELOW";
        }

        if (
            distance >
            0.25
        ) {
            return "ABOVE";
        }

        return "NEAR";
    }

    const price =
        number(
            row.close
        );

    const vwap =
        number(
            row.vwap
        );

    if (
        price === null ||
        vwap === null
    ) {

        return "UNKNOWN";
    }

    if (
        price >
        vwap
    ) {
        return "ABOVE";
    }

    if (
        price <
        vwap
    ) {
        return "BELOW";
    }

    return "NEAR";
}


function slopeBucket(
    value
) {

    const x =
        Math.abs(
            number(
                value,
                0
            )
        );

    if (
        x < 0.10
    ) {
        return "FLAT";
    }

    if (
        x < 0.25
    ) {
        return "WEAK";
    }

    if (
        x < 0.50
    ) {
        return "MODERATE";
    }

    if (
        x < 0.75
    ) {
        return "STRONG";
    }

    return "VERY_STRONG";
}


function timeBucket(
    row
) {

    const hour =
        number(
            row.hour
        );

    if (
        hour === null &&
        row.timestamp
    ) {

        const date =
            new Date(
                row.timestamp *
                1000
            );

        /*
        NIFTY market time is IST.
        UTC + 5:30.
        */

        const utcHour =
            date.getUTCHours();

        const utcMinute =
            date.getUTCMinutes();

        const istMinutes =
            (
                utcHour *
                60
            ) +
            utcMinute +
            330;

        const normalized =
            (
                istMinutes %
                1440
            );

        const hourIST =
            Math.floor(
                normalized /
                60
            );

        return bucketHour(
            hourIST
        );
    }

    if (
        hour === null
    ) {
        return "UNKNOWN";
    }

    return bucketHour(
        hour
    );
}


function bucketHour(
    hour
) {

    if (
        hour < 10
    ) {
        return "OPEN";
    }

    if (
        hour < 11
    ) {
        return "MORNING";
    }

    if (
        hour < 13
    ) {
        return "MIDDAY";
    }

    if (
        hour < 14
    ) {
        return "AFTERNOON";
    }

    return "CLOSE";
}


// ============================================================
// TREND
// ============================================================

function normalizeTrend(
    row
) {

    const trend =
        String(
            row.trend ||
            row.marketTrend ||
            "UNKNOWN"
        )
        .toUpperCase();

    if (
        trend.includes(
            "BULL"
        )
    ) {
        return "BULLISH";
    }

    if (
        trend.includes(
            "BEAR"
        )
    ) {
        return "BEARISH";
    }

    if (
        trend.includes(
            "SIDE"
        ) ||
        trend.includes(
            "RANGE"
        )
    ) {
        return "RANGING";
    }

    return "UNKNOWN";
}


// ============================================================
// REGIME
// ============================================================

function normalizeRegime(
    row
) {

    const regime =
        String(
            row.regime ||
            "UNKNOWN"
        )
        .toUpperCase();

    if (
        regime.includes(
            "TREND"
        )
    ) {
        return "TRENDING";
    }

    if (
        regime.includes(
            "RANGE"
        )
    ) {
        return "RANGING";
    }

    if (
        regime.includes(
            "TRANS"
        )
    ) {
        return "TRANSITION";
    }

    return "UNKNOWN";
}


// ============================================================
// FEATURES
// ============================================================

function extractFeatures(
    row
) {

    return {

        trend:
            normalizeTrend(
                row
            ),

        vwap:
            vwapDirection(
                row
            ),

        rsi:
            rsiBucket(
                row.rsi14
            ),

        regime:
            normalizeRegime(
                row
            ),

        slope:
            slopeBucket(
                row.ema9SlopeATR
            ),

        time:
            timeBucket(
                row
            )
    };
}


// ============================================================
// GENERALIZED PATTERN KEY
// ============================================================

function patternKey(
    side,
    feature,
    level
) {

    const parts = [

        side,

        `T:${feature.trend}`,

        `V:${feature.vwap}`
    ];

    /*
    LEVEL 1
    SIDE + TREND + VWAP
    */

    if (
        level >= 2
    ) {

        parts.push(
            `R:${feature.rsi}`
        );
    }

    /*
    LEVEL 3
    + REGIME + SLOPE
    */

    if (
        level >= 3
    ) {

        parts.push(
            `G:${feature.regime}`,

            `S:${feature.slope}`
        );
    }

    /*
    LEVEL 4
    + TIME
    */

    if (
        level >= 4
    ) {

        parts.push(
            `H:${feature.time}`
        );
    }

    return parts.join(
        "|"
    );
}


function minimumSamples(
    level
) {

    if (
        level === 1
    ) {
        return MIN_LEVEL1_SAMPLES;
    }

    if (
        level === 2
    ) {
        return MIN_LEVEL2_SAMPLES;
    }

    if (
        level === 3
    ) {
        return MIN_LEVEL3_SAMPLES;
    }

    return MIN_LEVEL4_SAMPLES;
}


// ============================================================
// LEARNING STATISTICS
// ============================================================

function calculateLearningStats(
    rows,
    side
) {

    let wins = 0;

    let losses = 0;

    let timeouts = 0;

    let equity = 0;

    let peak = 0;

    let maxDrawdown = 0;

    let lossStreak = 0;

    let maxLossStreak = 0;

    for (
        const row
        of rows
    ) {

        const outcome =
            sideOutcome(
                row,
                side
            );

        if (
            outcome ===
            "WIN"
        ) {

            wins++;

            equity +=
                TARGET_R;

            lossStreak = 0;
        }

        else if (
            outcome ===
            "LOSS"
        ) {

            losses++;

            equity -=
                STOP_R;

            lossStreak++;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    lossStreak
                );
        }

        else {

            timeouts++;

            lossStreak = 0;
        }

        peak =
            Math.max(
                peak,
                equity
            );

        maxDrawdown =
            Math.max(
                maxDrawdown,
                peak -
                equity
            );
    }

    const decisive =
        wins +
        losses;

    const netR =
        equity;

    const expectedValue =
        rows.length > 0
            ? netR /
              rows.length
            : 0;

    const winRate =
        decisive > 0
            ? (
                wins /
                decisive
            ) *
              100
            : 0;

    const grossProfit =
        wins *
        TARGET_R;

    const grossLoss =
        losses *
        STOP_R;

    const profitFactor =
        grossLoss > 0
            ? grossProfit /
              grossLoss
            : grossProfit > 0
                ? 999
                : 0;

    return {

        samples:
            rows.length,

        wins,

        losses,

        timeouts,

        decisiveTrades:
            decisive,

        winRate:
            round(
                winRate,
                2
            ),

        netR:
            round(
                netR,
                3
            ),

        expectedValueR:
            round(
                expectedValue,
                4
            ),

        profitFactor:
            round(
                profitFactor,
                3
            ),

        maxDrawdownR:
            round(
                maxDrawdown,
                2
            ),

        maxLossStreak
    };
}


// ============================================================
// FOLD QUALITY
// ============================================================

function calculateQuality(
    folds
) {

    if (
        !folds.length
    ) {
        return {

            score: 0,

            averageEV: 0,

            averagePF: 0,

            averageWinRate: 0,

            averageDrawdown: 0,

            positiveFolds: 0,

            strongFolds: 0,

            stability: 0
        };
    }

    const positiveFolds =
        folds.filter(
            f =>
                f.testExpectedValueR >
                0
        ).length;

    const strongFolds =
        folds.filter(
            f =>
                f.testExpectedValueR >=
                    MIN_EXPECTED_VALUE &&
                f.testProfitFactor >=
                    MIN_PROFIT_FACTOR
        ).length;

    const averageEV =
        folds.reduce(
            (
                sum,
                f
            ) =>
                sum +
                f.testExpectedValueR,
            0
        ) /
        folds.length;

    const averagePF =
        folds.reduce(
            (
                sum,
                f
            ) =>
                sum +
                Math.min(
                    f.testProfitFactor,
                    3
                ),
            0
        ) /
        folds.length;

    const averageWinRate =
        folds.reduce(
            (
                sum,
                f
            ) =>
                sum +
                f.testWinRate,
            0
        ) /
        folds.length;

    const averageDrawdown =
        folds.reduce(
            (
                sum,
                f
            ) =>
                sum +
                f.testMaxDrawdownR,
            0
        ) /
        folds.length;

    const evScore =
        clamp(
            (
                averageEV /
                GOOD_EXPECTED_VALUE
            ) *
            35,
            0,
            35
        );

    const pfScore =
        clamp(
            (
                (
                    averagePF -
                    1
                ) /
                (
                    GOOD_PROFIT_FACTOR -
                    1
                )
            ) *
            25,
            0,
            25
        );

    const stabilityScore =
        (
            strongFolds /
            folds.length
        ) *
        25;

    const winRateScore =
        clamp(
            (
                averageWinRate -
                35
            ) /
            30,
            0,
            1
        ) *
        10;

    const drawdownPenalty =
        clamp(
            (
                averageDrawdown /
                MAX_PATTERN_DRAWDOWN_R
            ) *
            5,
            0,
            5
        );

    const score =
        evScore +
        pfScore +
        stabilityScore +
        winRateScore -
        drawdownPenalty;

    return {

        score:
            round(
                clamp(
                    score,
                    0,
                    100
                ),
                2
            ),

        averageEV:
            round(
                averageEV,
                4
            ),

        averagePF:
            round(
                averagePF,
                3
            ),

        averageWinRate:
            round(
                averageWinRate,
                2
            ),

        averageDrawdown:
            round(
                averageDrawdown,
                2
            ),

        positiveFolds,

        strongFolds,

        stability:
            round(
                strongFolds /
                folds.length,
                3
            )
    };
}


// ============================================================
// BUILD TRAINING PATTERN MAP
// ============================================================

function buildPatternMap(
    rows,
    side,
    level
) {

    const map =
        new Map();

    for (
        const row
        of rows
    ) {

        const features =
            extractFeatures(
                row
            );

        const key =
            patternKey(
                side,
                features,
                level
            );

        if (
            !map.has(key)
        ) {

            map.set(
                key,
                []
            );
        }

        map.get(key).push(
            row
        );
    }

    return map;
}


// ============================================================
// EVALUATE PATTERN
// ============================================================

function evaluatePattern(
    key,
    side,
    level,
    trainingRows
) {

    const minimum =
        minimumSamples(
            level
        );

    const map =
        buildPatternMap(
            trainingRows,
            side,
            level
        );

    const patternRows =
        map.get(key) ||
        [];

    if (
        patternRows.length <
        minimum
    ) {

        return null;
    }

    const overall =
        calculateLearningStats(
            patternRows,
            side
        );

    if (
        overall.decisiveTrades <
        MIN_DECISIVE_TRADES
    ) {

        return null;
    }

    /*
    Internal chronological validation
    inside the training data.

    IMPORTANT:
    This validation uses ONLY the
    training period.

    No future TEST data is touched.
    */

    const foldCount = 3;

    const folds = [];

    const total =
        patternRows.length;

    for (
        let f = 1;
        f <= foldCount;
        f++
    ) {

        const testStart =
            Math.floor(
                total *
                (
                    f /
                    (foldCount + 1)
                )
            );

        const testEnd =
            Math.min(
                total,
                testStart +
                Math.max(
                    5,
                    Math.floor(
                        total /
                        5
                    )
                )
            );

        if (
            testEnd <=
            testStart
        ) {
            continue;
        }

        const train =
            patternRows.slice(
                0,
                testStart
            );

        const test =
            patternRows.slice(
                testStart,
                testEnd
            );

        if (
            train.length <
            Math.max(
                5,
                Math.floor(
                    minimum /
                    2
                )
            )
        ) {
            continue;
        }

        const trainStats =
            calculateLearningStats(
                train,
                side
            );

        const testStats =
            calculateLearningStats(
                test,
                side
            );

        folds.push({

            fold: f,

            trainingSamples:
                trainStats.samples,

            trainingExpectedValueR:
                trainStats.expectedValueR,

            trainingProfitFactor:
                trainStats.profitFactor,

            testSamples:
                testStats.samples,

            testWins:
                testStats.wins,

            testLosses:
                testStats.losses,

            testTimeouts:
                testStats.timeouts,

            testWinRate:
                testStats.winRate,

            testExpectedValueR:
                testStats.expectedValueR,

            testProfitFactor:
                testStats.profitFactor,

            testNetR:
                testStats.netR,

            testMaxDrawdownR:
                testStats.maxDrawdownR,

            testMaxLossStreak:
                testStats.maxLossStreak
        });
    }

    if (
        folds.length <
        2
    ) {
        return null;
    }

    const quality =
        calculateQuality(
            folds
        );

    const robust =
        overall.samples >=
            minimum &&

        overall.decisiveTrades >=
            MIN_DECISIVE_TRADES &&

        quality.averageEV >=
            MIN_EXPECTED_VALUE &&

        quality.averagePF >=
            MIN_PROFIT_FACTOR &&

        quality.positiveFolds >=
            MIN_STABLE_FOLDS &&

        quality.strongFolds >=
            MIN_STABLE_FOLDS &&

        quality.averageDrawdown <=
            MAX_PATTERN_DRAWDOWN_R;

    return {

        key,

        side,

        level,

        samples:
            overall.samples,

        wins:
            overall.wins,

        losses:
            overall.losses,

        timeouts:
            overall.timeouts,

        winRate:
            overall.winRate,

        netR:
            overall.netR,

        expectedValueR:
            overall.expectedValueR,

        profitFactor:
            overall.profitFactor,

        maxDrawdownR:
            overall.maxDrawdownR,

        maxLossStreak:
            overall.maxLossStreak,

        positiveFolds:
            quality.positiveFolds,

        strongFolds:
            quality.strongFolds,

        averageTestEV:
            quality.averageEV,

        averageTestPF:
            quality.averagePF,

        averageTestWinRate:
            quality.averageWinRate,

        averageTestDrawdown:
            quality.averageDrawdown,

        stability:
            quality.stability,

        qualityScore:
            quality.score,

        robust,

        foldDetails:
            folds
    };
}


// ============================================================
// LEARN FROM A TRAINING WINDOW
// ============================================================

function learnPatterns(
    trainingRows
) {

    const patterns = [];

    const sides = [
        "BUY",
        "SELL"
    ];

    for (
        const side
        of sides
    ) {

        for (
            let level = 1;
            level <= 4;
            level++
        ) {

            const map =
                buildPatternMap(
                    trainingRows,
                    side,
                    level
                );

            for (
                const key
                of map.keys()
            ) {

                const pattern =
                    evaluatePattern(
                        key,
                        side,
                        level,
                        trainingRows
                    );

                if (
                    pattern
                ) {

                    patterns.push(
                        pattern
                    );
                }
            }
        }
    }

    patterns.sort(
        (
            a,
            b
        ) => {

            if (
                a.robust !==
                b.robust
            ) {

                return a.robust
                    ? -1
                    : 1;
            }

            if (
                b.qualityScore !==
                a.qualityScore
            ) {

                return (
                    b.qualityScore -
                    a.qualityScore
                );
            }

            if (
                b.averageTestEV !==
                a.averageTestEV
            ) {

                return (
                    b.averageTestEV -
                    a.averageTestEV
                );
            }

            return (
                b.samples -
                a.samples
            );
        }
    );

    return patterns;
}


// ============================================================
// MATCH CURRENT ROW TO TRAINED PATTERN
// ============================================================

function findBestPattern(
    row,
    side,
    patterns
) {

    const features =
        extractFeatures(
            row
        );

    const matches =
        patterns.filter(
            pattern => {

                if (
                    pattern.side !==
                    side
                ) {
                    return false;
                }

                if (
                    !pattern.robust
                ) {
                    return false;
                }

                if (
                    pattern.qualityScore <
                    QUALITY_THRESHOLD
                ) {
                    return false;
                }

                const expected =
                    patternKey(
                        side,
                        features,
                        pattern.level
                    );

                return (
                    expected ===
                    pattern.key
                );
            }
        );

    if (
        !matches.length
    ) {
        return null;
    }

    /*
    Prefer higher quality.

    If quality is similar,
    prefer the more specific pattern.
    */

    matches.sort(
        (
            a,
            b
        ) => {

            if (
                b.qualityScore !==
                a.qualityScore
            ) {

                return (
                    b.qualityScore -
                    a.qualityScore
                );
            }

            if (
                b.level !==
                a.level
            ) {

                return (
                    b.level -
                    a.level
                );
            }

            return (
                b.samples -
                a.samples
            );
        }
    );

    return matches[0];
}


// ============================================================
// DIRECTIONAL SETUP
// ============================================================

function inferSide(
    row
) {

    const trend =
        normalizeTrend(
            row
        );

    const vwap =
        vwapDirection(
            row
        );

    const rsi =
        number(
            row.rsi14
        );

    if (
        trend ===
            "BULLISH" &&

        (
            vwap ===
                "ABOVE" ||
            vwap ===
                "NEAR"
        ) &&

        rsi !== null &&

        rsi >= 40 &&

        rsi <= 68
    ) {

        return "BUY";
    }

    if (
        trend ===
            "BEARISH" &&

        (
            vwap ===
                "BELOW" ||
            vwap ===
                "NEAR"
        ) &&

        rsi !== null &&

        rsi >= 32 &&

        rsi <= 60
    ) {

        return "SELL";
    }

    /*
    Reversal conditions are allowed
    only if the learned pattern also
    confirms them.
    */

    if (
        rsi !== null &&
        rsi < 30 &&
        vwap === "BELOW"
    ) {

        return "BUY";
    }

    if (
        rsi !== null &&
        rsi > 70 &&
        vwap === "ABOVE"
    ) {

        return "SELL";
    }

    return null;
}


// ============================================================
// TRADE LEVELS
// ============================================================

function buildTradeLevels(
    side,
    entry,
    atr
) {

    if (
        entry === null ||
        atr === null ||
        atr <= 0
    ) {

        return null;
    }

    const risk =
        atr *
        STOP_R;

    if (
        side === "BUY"
    ) {

        return {

            entry:
                round(
                    entry,
                    2
                ),

            stop:
                round(
                    entry -
                    risk,
                    2
                ),

            target:
                round(
                    entry +
                    (
                        risk *
                        TARGET_R
                    ),
                    2
                ),

            preferredTarget:
                round(
                    entry +
                    (
                        risk *
                        PREFERRED_TARGET_R
                    ),
                    2
                ),

            riskPoints:
                round(
                    risk,
                    2
                ),

            rewardPoints:
                round(
                    risk *
                    TARGET_R,
                    2
                ),

            riskReward:
                "1:2",

            preferredRiskReward:
                "1:2.5"
        };
    }

    return {

        entry:
            round(
                entry,
                2
            ),

        stop:
            round(
                entry +
                risk,
                2
            ),

        target:
            round(
                entry -
                (
                    risk *
                    TARGET_R
                ),
                2
            ),

        preferredTarget:
            round(
                entry -
                (
                    risk *
                    PREFERRED_TARGET_R
                ),
                2
            ),

        riskPoints:
            round(
                risk,
                2
            ),

        rewardPoints:
            round(
                risk *
                TARGET_R,
                2
            ),

        riskReward:
            "1:2",

        preferredRiskReward:
            "1:2.5"
    };
}


// ============================================================
// PAPER EXIT
// ============================================================

function checkExit(
    candle,
    side,
    levels
) {

    if (
        side ===
        "BUY"
    ) {

        const stopHit =
            candle.low <=
            levels.stop;

        const targetHit =
            candle.high >=
            levels.target;

        /*
        Conservative assumption:
        if both occur in one candle,
        STOP is assumed first.
        */

        if (
            stopHit &&
            targetHit
        ) {

            return {

                type:
                    "STOP",

                price:
                    levels.stop,

                resultR:
                    -STOP_R,

                reason:
                    "STOP_AND_TARGET_SAME_CANDLE_CONSERVATIVE_STOP"
            };
        }

        if (
            stopHit
        ) {

            return {

                type:
                    "STOP",

                price:
                    levels.stop,

                resultR:
                    -STOP_R,

                reason:
                    "STOP_HIT"
            };
        }

        if (
            targetHit
        ) {

            return {

                type:
                    "TARGET",

                price:
                    levels.target,

                resultR:
                    TARGET_R,

                reason:
                    "TARGET_HIT"
            };
        }
    }


    if (
        side ===
        "SELL"
    ) {

        const stopHit =
            candle.high >=
            levels.stop;

        const targetHit =
            candle.low <=
            levels.target;

        if (
            stopHit &&
            targetHit
        ) {

            return {

                type:
                    "STOP",

                price:
                    levels.stop,

                resultR:
                    -STOP_R,

                reason:
                    "STOP_AND_TARGET_SAME_CANDLE_CONSERVATIVE_STOP"
            };
        }

        if (
            stopHit
        ) {

            return {

                type:
                    "STOP",

                price:
                    levels.stop,

                resultR:
                    -STOP_R,

                reason:
                    "STOP_HIT"
            };
        }

        if (
            targetHit
        ) {

            return {

                type:
                    "TARGET",

                price:
                    levels.target,

                resultR:
                    TARGET_R,

                reason:
                    "TARGET_HIT"
            };
        }
    }

    return null;
}


// ============================================================
// EXECUTE ONE PAPER TRADE
// ============================================================

function executePaperTrade(
    rows,
    signalIndex,
    side,
    levels
) {

    const future =
        rows.slice(
            signalIndex + 1,
            signalIndex +
            1 +
            MAX_HOLD_CANDLES
        );

    const candleLog = [];

    for (
        let i = 0;
        i < future.length;
        i++
    ) {

        const candle =
            future[i];

        const exit =
            checkExit(
                candle,
                side,
                levels
            );

        candleLog.push({

            candleNumber:
                i + 1,

            timestamp:
                candle.timestamp,

            open:
                candle.open,

            high:
                candle.high,

            low:
                candle.low,

            close:
                candle.close,

            state:
                exit
                    ? exit.type
                    : "OPEN"
        });

        if (
            exit
        ) {

            return {

                status:
                    "CLOSED",

                exitType:
                    exit.type,

                exitPrice:
                    round(
                        exit.price,
                        2
                    ),

                resultR:
                    round(
                        exit.resultR,
                        3
                    ),

                candlesHeld:
                    i + 1,

                reason:
                    exit.reason,

                candleLog
            };
        }
    }

    /*
    Timeout.

    We close at the final available
    candle rather than pretending that
    a future target/stop was hit.
    */

    if (
        future.length > 0
    ) {

        const last =
            future[
                future.length - 1
            ];

        const price =
            last.close;

        let resultR = 0;

        if (
            levels.riskPoints >
            0
        ) {

            if (
                side ===
                "BUY"
            ) {

                resultR =
                    (
                        price -
                        levels.entry
                    ) /
                    levels.riskPoints;
            }

            else {

                resultR =
                    (
                        levels.entry -
                        price
                    ) /
                    levels.riskPoints;
            }
        }

        return {

            status:
                "CLOSED",

            exitType:
                "TIMEOUT",

            exitPrice:
                round(
                    price,
                    2
                ),

            resultR:
                round(
                    resultR,
                    3
                ),

            candlesHeld:
                future.length,

            reason:
                "MAX_HOLD_TIMEOUT",

            candleLog
        };
    }

    return {

        status:
            "OPEN",

        exitType:
            "OPEN",

        exitPrice:
            null,

        resultR:
            0,

        candlesHeld:
            0,

        reason:
            "NO_FUTURE_CANDLES",

        candleLog
    };
}


// ============================================================
// TRUE WALK FORWARD FOLDS
// ============================================================

function buildWalkForwardFolds(
    total
) {

    const folds = [];

    /*
    We reserve approximately the final
    2/3 of the data for sequential OOS
    blocks while keeping expanding
    training windows.

    For ~1523 rows this produces
    approximately:

    Fold 1
    TRAIN ~380
    TEST  ~253

    Fold 2
    TRAIN ~633
    TEST  ~253

    Fold 3
    TRAIN ~886
    TEST  ~253

    Fold 4
    TRAIN ~1139
    TEST  ~253

    This mirrors the V11.12 structure.
    */

    const testSize =
        Math.floor(
            total /
            6
        );

    const firstTraining =
        Math.floor(
            total /
            4
        );

    for (
        let i = 0;
        i < FOLD_COUNT;
        i++
    ) {

        const trainingEnd =
            firstTraining +
            (
                i *
                testSize
            );

        const testStart =
            trainingEnd;

        const testEnd =
            Math.min(
                total,
                testStart +
                testSize
            );

        if (
            testEnd <=
            testStart
        ) {
            continue;
        }

        folds.push({

            fold:
                i + 1,

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
    }

    return folds;
}


// ============================================================
// TRUE OOS PAPER BACKTEST
// ============================================================

function runTrueWalkForward(
    rows
) {

    const folds =
        buildWalkForwardFolds(
            rows.length
        );

    const allTrades = [];

    const foldResults = [];

    let globalTradeNumber = 0;

    /*
    Each fold learns ONLY from data before
    its test block.

    No test outcome is used for learning.
    */

    for (
        const fold
        of folds
    ) {

        const trainingRows =
            rows.slice(
                fold.trainingStart,
                fold.trainingEnd
            );

        const testRows =
            rows.slice(
                fold.testStart,
                fold.testEnd
            );

        const patterns =
            learnPatterns(
                trainingRows
            );

        const robustPatterns =
            patterns.filter(
                p =>
                    p.robust &&
                    p.qualityScore >=
                        QUALITY_THRESHOLD
            );

        const foldTrades = [];

        let lastExitIndex =
            fold.testStart - 1;

        for (
            let i =
                fold.testStart;
            i <
                fold.testEnd;
            i++
        ) {

            /*
            Prevent overlapping positions.
            */

            if (
                i <=
                lastExitIndex
            ) {
                continue;
            }

            const row =
                rows[i];

            /*
            IMPORTANT:

            The current row is used only
            for its FEATURES.

            Its future outcome is NOT used
            to decide whether to enter.
            */

            const side =
                inferSide(
                    row
                );

            if (!side) {
                continue;
            }

            const pattern =
                findBestPattern(
                    row,
                    side,
                    robustPatterns
                );

            /*
            THIS IS THE MAIN V12.2 GATE.

            No robust learned pattern =
            NO PAPER TRADE.
            */

            if (
                !pattern
            ) {
                continue;
            }

            const atr =
                number(
                    row.atr14
                );

            if (
                atr === null ||
                atr <= 0
            ) {
                continue;
            }

            const levels =
                buildTradeLevels(
                    side,
                    row.close,
                    atr
                );

            if (!levels) {
                continue;
            }

            const execution =
                executePaperTrade(
                    rows,
                    i,
                    side,
                    levels
                );

            globalTradeNumber++;

            const trade = {

                tradeNumber:
                    globalTradeNumber,

                fold:
                    fold.fold,

                signalIndex:
                    i,

                timestamp:
                    row.timestamp,

                side,

                pattern:
                    pattern.key,

                patternLevel:
                    pattern.level,

                patternQuality:
                    pattern.qualityScore,

                patternSamples:
                    pattern.samples,

                patternEV:
                    pattern.averageTestEV,

                patternPF:
                    pattern.averageTestPF,

                entry:
                    levels.entry,

                stop:
                    levels.stop,

                target:
                    levels.target,

                preferredTarget:
                    levels.preferredTarget,

                riskReward:
                    levels.riskReward,

                exitType:
                    execution.exitType,

                exitPrice:
                    execution.exitPrice,

                resultR:
                    execution.resultR,

                candlesHeld:
                    execution.candlesHeld,

                reason:
                    execution.reason
            };

            foldTrades.push(
                trade
            );

            allTrades.push(
                trade
            );

            /*
            Estimate last candle consumed
            by this trade.

            This prevents overlapping
            paper positions.
            */

            lastExitIndex =
                Math.min(
                    fold.testEnd - 1,
                    i +
                    Math.max(
                        1,
                        execution.candlesHeld
                    )
                );
        }

        foldResults.push({

            fold:
                fold.fold,

            trainingRows:
                trainingRows.length,

            testRows:
                testRows.length,

            patternsDiscovered:
                patterns.length,

            robustPatterns:
                robustPatterns.length,

            trades:
                foldTrades.length,

            wins:
                foldTrades.filter(
                    t =>
                        t.exitType ===
                        "TARGET"
                ).length,

            losses:
                foldTrades.filter(
                    t =>
                        t.exitType ===
                        "STOP"
                ).length,

            timeouts:
                foldTrades.filter(
                    t =>
                        t.exitType ===
                        "TIMEOUT"
                ).length,

            tradeResults:
                foldTrades.map(
                    t =>
                        t.resultR
                )
        });
    }

    const stats =
        calculateExecutionStats(
            allTrades
        );

    return {

        folds:
            foldResults,

        stats,

        trades:
            allTrades
    };
}


// ============================================================
// EXECUTION STATISTICS
// ============================================================

function calculateExecutionStats(
    trades
) {

    let wins = 0;

    let losses = 0;

    let timeouts = 0;

    let netR = 0;

    let equityR = 0;

    let peakR = 0;

    let maxDrawdownR = 0;

    let lossStreak = 0;

    let maxLossStreak = 0;

    let grossProfit = 0;

    let grossLoss = 0;

    for (
        const trade
        of trades
    ) {

        const r =
            number(
                trade.resultR,
                0
            );

        netR +=
            r;

        equityR +=
            r;

        peakR =
            Math.max(
                peakR,
                equityR
            );

        maxDrawdownR =
            Math.max(
                maxDrawdownR,
                peakR -
                equityR
            );

        if (
            trade.exitType ===
            "TARGET"
        ) {

            wins++;

            grossProfit +=
                Math.max(
                    r,
                    0
                );

            lossStreak = 0;
        }

        else if (
            trade.exitType ===
            "STOP"
        ) {

            losses++;

            grossLoss +=
                Math.abs(
                    r
                );

            lossStreak++;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    lossStreak
                );
        }

        else {

            timeouts++;

            if (
                r > 0
            ) {

                grossProfit +=
                    r;

                lossStreak = 0;

            }

            else if (
                r < 0
            ) {

                grossLoss +=
                    Math.abs(
                        r
                    );

                lossStreak++;

                maxLossStreak =
                    Math.max(
                        maxLossStreak,
                        lossStreak
                    );

            }

            else {

                lossStreak = 0;
            }
        }
    }

    const decisive =
        wins +
        losses;

    const winRate =
        decisive > 0
            ? (
                wins /
                decisive
            ) *
            100
            : 0;

    const profitFactor =
        grossLoss > 0
            ? grossProfit /
              grossLoss
            : grossProfit > 0
                ? 999
                : 0;

    const expectedValue =
        trades.length > 0
            ? netR /
              trades.length
            : 0;

    return {

        trades:
            trades.length,

        wins,

        losses,

        timeouts,

        decisiveTrades:
            decisive,

        winRate:
            round(
                winRate,
                2
            ),

        totalWinR:
            round(
                grossProfit,
                3
            ),

        totalLossR:
            round(
                grossLoss,
                3
            ),

        netR:
            round(
                netR,
                3
            ),

        expectedValueR:
            round(
                expectedValue,
                4
            ),

        profitFactor:
            round(
                profitFactor,
                3
            ),

        maxDrawdownR:
            round(
                maxDrawdownR,
                2
            ),

        maxConsecutiveLosses:
            maxLossStreak,

        startingCapital:
            STARTING_CAPITAL,

        simulatedEquity:
            round(
                STARTING_CAPITAL +
                (
                    netR *
                    100
                ),
                2
            )
    };
}


// ============================================================
// CURRENT LIVE PAPER SIGNAL
// ============================================================

function currentSignal(
    rows
) {

    if (
        rows.length <
        100
    ) {

        return {

            status:
                "NO_DATA",

            side:
                null,

            reason:
                "Insufficient market data."
        };
    }

    /*
    IMPORTANT:

    Current signal is trained only on
    candles BEFORE the current candle.

    Current candle outcome is never used.
    */

    const currentIndex =
        rows.length -
        1;

    const current =
        rows[
            currentIndex
        ];

    const training =
        rows.slice(
            0,
            currentIndex
        );

    const patterns =
        learnPatterns(
            training
        );

    const robustPatterns =
        patterns.filter(
            p =>
                p.robust &&
                p.qualityScore >=
                    QUALITY_THRESHOLD
        );

    const side =
        inferSide(
            current
        );

    const market = {

        timestamp:
            current.timestamp,

        date:
            current.date ||
            null,

        close:
            current.close,

        trend:
            normalizeTrend(
                current
            ),

        regime:
            normalizeRegime(
                current
            ),

        rsi:
            current.rsi14,

        rsiBucket:
            rsiBucket(
                current.rsi14
            ),

        vwap:
            current.vwap,

        vwapDirection:
            vwapDirection(
                current
            ),

        vwapDistanceATR:
            current.vwapDistanceATR,

        atr14:
            current.atr14
    };

    if (!side) {

        return {

            status:
                "NO_TRADE",

            side:
                null,

            market,

            learning: {

                trainingRows:
                    training.length,

                patternsDiscovered:
                    patterns.length,

                robustPatterns:
                    robustPatterns.length
            },

            reason:
                "Current market does not satisfy the directional setup."
        };
    }

    const pattern =
        findBestPattern(
            current,
            side,
            robustPatterns
        );

    if (!pattern) {

        return {

            status:
                "NO_EDGE",

            side,

            market,

            learning: {

                trainingRows:
                    training.length,

                patternsDiscovered:
                    patterns.length,

                robustPatterns:
                    robustPatterns.length
            },

            reason:
                "Directional setup exists, but no robust V11.12 pattern matches the current market."
        };
    }

    const atr =
        number(
            current.atr14
        );

    if (
        atr === null ||
        atr <= 0
    ) {

        return {

            status:
                "NO_TRADE",

            side,

            market,

            pattern:
                pattern.key,

            reason:
                "Pattern matches, but ATR is unavailable."
        };
    }

    const levels =
        buildTradeLevels(
            side,
            current.close,
            atr
        );

    return {

        status:
            "PAPER_TRADE_CANDIDATE",

        side,

        market,

        pattern: {

            key:
                pattern.key,

            level:
                pattern.level,

            samples:
                pattern.samples,

            wins:
                pattern.wins,

            losses:
                pattern.losses,

            winRate:
                pattern.winRate,

            expectedValueR:
                pattern.averageTestEV,

            profitFactor:
                pattern.averageTestPF,

            positiveFolds:
                pattern.positiveFolds,

            strongFolds:
                pattern.strongFolds,

            stability:
                pattern.stability,

            qualityScore:
                pattern.qualityScore
        },

        levels,

        execution: {

            paperOnly:
                true,

            realOrders:
                false,

            brokerOrderSent:
                false
        },

        reason:
            "Current market matches a robust V11.12 learned pattern."
    };
}


// ============================================================
// MAIN ENGINE
// ============================================================

async function runEngine(
    req
) {

    const source =
        await fetchDataset(
            req
        );

    const rawRows =
        source.data.rows;

    const rows =
        normalizeRows(
            rawRows
        );

    if (
        rows.length <
        300
    ) {

        throw new Error(
            `Not enough learning rows: ${rows.length}`
        );
    }

    /*
    TRUE OOS PAPER BACKTEST
    */

    const walkForward =
        runTrueWalkForward(
            rows
        );

    /*
    CURRENT SIGNAL

    Trained only on candles before
    the latest candle.
    */

    const signal =
        currentSignal(
            rows
        );

    const tradingDays =
        new Set(
            rows
                .map(
                    row => {

                        if (
                            !row.timestamp
                        ) {
                            return null;
                        }

                        const date =
                            new Date(
                                row.timestamp *
                                1000
                            );

                        return [
                            date.getUTCFullYear(),
                            date.getUTCMonth(),
                            date.getUTCDate()
                        ].join(
                            "-"
                        );
                    }
                )
                .filter(Boolean)
        );

    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "TRUE_WALK_FORWARD_BRAIN_GATED_PAPER",

        paperOnly:
            PAPER_ONLY,

        realOrders:
            REAL_ORDERS,

        brokerOrderEnabled:
            BROKER_ORDER_ENABLED,

        brokerOrderSent:
            false,

        instrument:
            INSTRUMENT,

        interval:
            INTERVAL,

        requestedDays:
            REQUESTED_DAYS,

        source:
            "V11.1_LEARNING_DATASET",

        antiLeakage: {

            enabled:
                true,

            chronological:
                true,

            shuffled:
                false,

            trainingBeforeTesting:
                true,

            currentCandleOutcomeUsed:
                false,

            patternSelectionUsesFutureData:
                false,

            testOutcomeUsedForTraining:
                false,

            overlappingTradesPrevented:
                true
        },

        sourceStatistics: {

            rawLearningRows:
                rawRows.length,

            normalizedRows:
                rows.length,

            tradingDays:
                tradingDays.size,

            invalidRows:
                rawRows.length -
                rows.length
        },

        walkForward: {

            foldCount:
                walkForward.folds.length,

            folds:
                walkForward.folds
        },

        learningGate: {

            description:
                "Paper execution is permitted only when the current/test candle matches a robust generalized pattern learned exclusively from prior data.",

            qualityThreshold:
                QUALITY_THRESHOLD,

            minimumExpectedValueR:
                MIN_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_PROFIT_FACTOR,

            minimumStableFolds:
                MIN_STABLE_FOLDS
        },

        paperExecution: {

            stats:
                walkForward.stats,

            tradeCount:
                walkForward.trades.length,

            trades:
                walkForward.trades.slice(
                    -100
                )
        },

        currentSignal:
            signal,

        riskPlan: {

            riskPerTradeR:
                1,

            stopR:
                STOP_R,

            minimumTargetR:
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
                true
        },

        nextAction:

            signal.status ===
            "PAPER_TRADE_CANDIDATE"

                ? "FRONTEND_PAPER_ENTRY"

                : "WAIT"
    };
}


// ============================================================
// VERCEL HANDLER
// ============================================================

export default async function handler(
    req,
    res
) {

    try {

        if (
            req.method !==
            "GET"
        ) {

            return res
                .status(405)
                .json({

                    success:
                        false,

                    version:
                        VERSION,

                    error:
                        "Method not allowed. Use GET.",

                    paperOnly:
                        true,

                    realOrders:
                        false
                });
        }

        const result =
            await runEngine(
                req
            );

        return res
            .status(200)
            .json(
                result
            );

    }

    catch (error) {

        console.error(
            "V12.2 ERROR:",
            error
        );

        return res
            .status(500)
            .json({

                success:
                    false,

                version:
                    VERSION,

                status:
                    "ERROR",

                paperOnly:
                    true,

                realOrders:
                    false,

                brokerOrderSent:
                    false,

                error:
                    error &&
                    error.message
                        ? error.message
                        : String(error)
            });
    }
}
