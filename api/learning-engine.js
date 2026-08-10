/*
TradeMind Pro
V12.7
TRUE WALK-FORWARD PAPER EXECUTION ENGINE

V12.6 problem:
Patterns were validated OOS, but the final historical paper
execution could still use patterns selected from the complete
historical dataset.

V12.7 solution:
TRUE WALK-FORWARD EXECUTION.

For every outer fold:

    TRAIN DATA
        ↓
    LEARN PATTERNS
        ↓
    QUALIFY PATTERNS
        ↓
    FREEZE PATTERNS
        ↓
    TEST ONLY ON FUTURE DATA
        ↓
    RECORD OOS TRADES

Then the engine moves forward and repeats.

Current candle:
- NEVER used for historical learning
- NEVER used as historical trade outcome
- Used only for CURRENT SIGNAL analysis

Paper only.
No real broker orders.
*/

// ============================================================
// VERSION
// ============================================================

const VERSION = "V12.7";

const INTERVAL = "5minute";
const INSTRUMENT = "NIFTY 50";

const REQUESTED_DAYS = 30;


// ============================================================
// RISK MODEL
// ============================================================

const STOP_R = 1.0;

const TARGET_R = 2.0;

const PREFERRED_TARGET_R = 2.5;

const MAX_HOLD_CANDLES = 12;


// ============================================================
// PATTERN REQUIREMENTS
// ============================================================

const MIN_LEVEL1_SAMPLES = 20;
const MIN_LEVEL2_SAMPLES = 15;
const MIN_LEVEL3_SAMPLES = 12;
const MIN_LEVEL4_SAMPLES = 10;

const MIN_OOS_SAMPLES = 3;
const MIN_OOS_DECISIVE = 3;

const MIN_EXPECTED_VALUE = 0.10;
const MIN_PROFIT_FACTOR = 1.10;

const MIN_STABLE_FOLDS = 2;

const QUALITY_THRESHOLD = 45;

const MAX_OOS_DRAWDOWN = 15;
const MAX_OOS_LOSS_STREAK = 8;


// ============================================================
// WALK-FORWARD
// ============================================================

const OUTER_FOLD_COUNT = 4;

const MIN_TRAINING_ROWS = 200;

const MIN_TEST_ROWS = 100;


// ============================================================
// GENERAL HELPERS
// ============================================================

function number(value, fallback = null) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function round(value, decimals = 4) {

    if (!Number.isFinite(value)) {
        return 0;
    }

    const multiplier =
        Math.pow(10, decimals);

    return (
        Math.round(
            value * multiplier
        ) / multiplier
    );
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


function normalizeTimestamp(value) {

    let ts =
        number(value);

    if (ts === null) {
        return null;
    }

    if (ts > 100000000000) {
        ts =
            ts / 1000;
    }

    return Math.floor(ts);
}


function firstValue(object, fields) {

    if (
        !object ||
        typeof object !== "object"
    ) {
        return null;
    }

    for (
        const field of fields
    ) {

        if (
            object[field] !== undefined &&
            object[field] !== null
        ) {

            return object[field];
        }
    }

    return null;
}


// ============================================================
// OUTCOME NORMALIZATION
// ============================================================

function getOutcome(row) {

    if (
        row &&
        row.outcome &&
        typeof row.outcome === "object"
    ) {

        return {

            buy:
                String(
                    row.outcome.buyOutcome ||
                    row.buyOutcome ||
                    "TIMEOUT"
                ).toUpperCase(),

            sell:
                String(
                    row.outcome.sellOutcome ||
                    row.sellOutcome ||
                    "TIMEOUT"
                ).toUpperCase()
        };
    }

    return {

        buy:
            String(
                row?.buyOutcome ||
                row?.buyResult ||
                "TIMEOUT"
            ).toUpperCase(),

        sell:
            String(
                row?.sellOutcome ||
                row?.sellResult ||
                "TIMEOUT"
            ).toUpperCase()
    };
}


function sideOutcome(row, side) {

    const outcome =
        getOutcome(row);

    return side === "BUY"
        ? outcome.buy
        : outcome.sell;
}


// ============================================================
// FEATURE NORMALIZATION
// ============================================================

function normalizeTrend(row) {

    const trend =
        String(
            row.trend ||
            row.marketTrend ||
            "UNKNOWN"
        ).toUpperCase();

    if (
        trend.includes("BULL")
    ) {
        return "BULLISH";
    }

    if (
        trend.includes("BEAR")
    ) {
        return "BEARISH";
    }

    if (
        trend.includes("SIDE") ||
        trend.includes("RANGE")
    ) {
        return "RANGING";
    }

    return "UNKNOWN";
}


function normalizeRegime(row) {

    const regime =
        String(
            row.regime ||
            "UNKNOWN"
        ).toUpperCase();

    if (
        regime.includes("TREND")
    ) {
        return "TRENDING";
    }

    if (
        regime.includes("RANGE")
    ) {
        return "RANGING";
    }

    if (
        regime.includes("TRANS")
    ) {
        return "TRANSITION";
    }

    return "UNKNOWN";
}


function rsiBucket(value) {

    const r =
        number(value);

    if (r === null) {
        return "UNKNOWN";
    }

    if (r < 30) return "EXTREME_LOW";
    if (r < 35) return "LOW";
    if (r < 40) return "LOW_MID";
    if (r < 45) return "MID_LOW";
    if (r < 50) return "NEUTRAL_LOW";
    if (r < 55) return "NEUTRAL_HIGH";
    if (r < 60) return "MID_HIGH";
    if (r < 65) return "HIGH";
    if (r < 70) return "VERY_HIGH";

    return "EXTREME_HIGH";
}


function vwapDirection(row) {

    const distance =
        number(
            row.vwapDistanceATR
        );

    if (distance !== null) {

        if (distance < -0.25) {
            return "BELOW";
        }

        if (distance > 0.25) {
            return "ABOVE";
        }

        return "NEAR";
    }

    const price =
        number(row.close);

    const vwap =
        number(row.vwap);

    if (
        price === null ||
        vwap === null
    ) {
        return "UNKNOWN";
    }

    if (price > vwap) {
        return "ABOVE";
    }

    if (price < vwap) {
        return "BELOW";
    }

    return "NEAR";
}


function slopeBucket(value) {

    const x =
        Math.abs(
            number(value, 0)
        );

    if (x < 0.10) return "FLAT";
    if (x < 0.25) return "WEAK";
    if (x < 0.50) return "MODERATE";
    if (x < 0.75) return "STRONG";

    return "VERY_STRONG";
}


function timeBucket(row) {

    const hour =
        number(row.hour);

    if (hour === null) {
        return "UNKNOWN";
    }

    if (hour < 10) return "OPEN";
    if (hour < 11) return "MORNING";
    if (hour < 13) return "MIDDAY";
    if (hour < 14) return "AFTERNOON";

    return "CLOSE";
}


// ============================================================
// PATTERN TYPE
// ============================================================

function patternType(row) {

    const trend =
        normalizeTrend(row);

    const vwap =
        vwapDirection(row);

    const rsi =
        number(row.rsi14);

    /*
    Trend-following:
    trend and VWAP agree.
    */

    if (
        trend === "BULLISH" &&
        (
            vwap === "ABOVE" ||
            vwap === "NEAR"
        )
    ) {

        return "TREND_FOLLOW";
    }

    if (
        trend === "BEARISH" &&
        (
            vwap === "BELOW" ||
            vwap === "NEAR"
        )
    ) {

        return "TREND_FOLLOW";
    }

    /*
    Reversal:
    price is extended from VWAP and RSI
    suggests exhaustion.
    */

    if (
        rsi !== null &&
        rsi < 35 &&
        vwap === "BELOW"
    ) {

        return "REVERSAL";
    }

    if (
        rsi !== null &&
        rsi > 65 &&
        vwap === "ABOVE"
    ) {

        return "REVERSAL";
    }

    /*
    Otherwise classify as range.
    */

    return "RANGE";
}


// ============================================================
// FEATURE STATE
// ============================================================

function extractFeatureState(row) {

    return {

        trend:
            normalizeTrend(row),

        regime:
            normalizeRegime(row),

        rsi:
            rsiBucket(
                row.rsi14
            ),

        vwap:
            vwapDirection(row),

        slope:
            slopeBucket(
                row.ema9SlopeATR
            ),

        time:
            timeBucket(row),

        type:
            patternType(row)
    };
}


// ============================================================
// PATTERN KEY
// ============================================================

function createPatternKey(
    side,
    feature,
    level
) {

    const parts = [

        side,

        `T:${feature.trend}`,

        `V:${feature.vwap}`,

        `P:${feature.type}`
    ];

    if (level >= 2) {

        parts.push(
            `R:${feature.rsi}`
        );
    }

    if (level >= 3) {

        parts.push(
            `G:${feature.regime}`,
            `S:${feature.slope}`
        );
    }

    if (level >= 4) {

        parts.push(
            `H:${feature.time}`
        );
    }

    return parts.join("|");
}


// ============================================================
// LEVEL SAMPLE REQUIREMENT
// ============================================================

function minimumSamples(level) {

    if (level === 1) {
        return MIN_LEVEL1_SAMPLES;
    }

    if (level === 2) {
        return MIN_LEVEL2_SAMPLES;
    }

    if (level === 3) {
        return MIN_LEVEL3_SAMPLES;
    }

    return MIN_LEVEL4_SAMPLES;
}


// ============================================================
// DATASET FETCH
// ============================================================

async function fetchDataset(req) {

    const host =
        req.headers["x-forwarded-host"] ||
        req.headers.host;

    const protocol =
        req.headers["x-forwarded-proto"] ||
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
                method: "GET",

                headers: {
                    Accept:
                        "application/json"
                }
            }
        );

    if (!response.ok) {

        throw new Error(
            `Learning dataset failed: HTTP ${response.status}`
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
            "learning-dataset rows[] missing"
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

function normalizeRows(rows) {

    const result = [];

    for (
        const row of rows
    ) {

        if (
            !row ||
            typeof row !== "object"
        ) {
            continue;
        }

        const timestamp =
            normalizeTimestamp(
                firstValue(
                    row,
                    [
                        "timestamp",
                        "ts",
                        "time",
                        "date"
                    ]
                )
            );

        result.push({

            ...row,

            timestamp,

            close:
                number(
                    firstValue(
                        row,
                        [
                            "close",
                            "c"
                        ]
                    )
                ),

            open:
                number(
                    firstValue(
                        row,
                        [
                            "open",
                            "o"
                        ]
                    )
                ),

            high:
                number(
                    firstValue(
                        row,
                        [
                            "high",
                            "h"
                        ]
                    )
                ),

            low:
                number(
                    firstValue(
                        row,
                        [
                            "low",
                            "l"
                        ]
                    )
                )
        });
    }

    result.sort(
        (a, b) =>
            (
                a.timestamp || 0
            ) -
            (
                b.timestamp || 0
            )
    );

    return result;
}


// ============================================================
// SIGNAL ENGINE
// ============================================================

function inferSide(row) {

    const trend =
        normalizeTrend(row);

    const vwap =
        vwapDirection(row);

    const rsi =
        number(row.rsi14);

    /*
    Trend-following BUY
    */

    if (
        trend === "BULLISH" &&
        (
            vwap === "ABOVE" ||
            vwap === "NEAR"
        ) &&
        rsi !== null &&
        rsi >= 40 &&
        rsi <= 68
    ) {

        return "BUY";
    }


    /*
    Trend-following SELL
    */

    if (
        trend === "BEARISH" &&
        (
            vwap === "BELOW" ||
            vwap === "NEAR"
        ) &&
        rsi !== null &&
        rsi >= 32 &&
        rsi <= 60
    ) {

        return "SELL";
    }


    /*
    Reversal BUY
    */

    if (
        rsi !== null &&
        rsi < 30 &&
        vwap === "BELOW"
    ) {

        return "BUY";
    }


    /*
    Reversal SELL
    */

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
// BUILD PATTERN MAP
// ============================================================

function buildPatternMap(
    rows,
    side,
    level
) {

    const map =
        new Map();

    for (
        const row of rows
    ) {

        const feature =
            extractFeatureState(row);

        const key =
            createPatternKey(
                side,
                feature,
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

        map.get(key).push(row);
    }

    return map;
}


// ============================================================
// STATISTICS
// ============================================================

function calculateStats(
    rows,
    side
) {

    let wins = 0;
    let losses = 0;
    let timeouts = 0;

    let winR = 0;
    let lossR = 0;

    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;

    let currentLossStreak = 0;
    let maxLossStreak = 0;

    for (
        const row of rows
    ) {

        const outcome =
            sideOutcome(
                row,
                side
            );

        if (
            outcome === "WIN"
        ) {

            wins++;

            winR +=
                TARGET_R;

            equity +=
                TARGET_R;

            currentLossStreak = 0;
        }

        else if (
            outcome === "LOSS"
        ) {

            losses++;

            lossR +=
                STOP_R;

            equity -=
                STOP_R;

            currentLossStreak++;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    currentLossStreak
                );
        }

        else {

            timeouts++;

            currentLossStreak = 0;
        }

        peak =
            Math.max(
                peak,
                equity
            );

        maxDrawdown =
            Math.max(
                maxDrawdown,
                peak - equity
            );
    }

    const decisive =
        wins + losses;

    const winRate =
        decisive > 0
            ? (
                wins /
                decisive
            ) * 100
            : 0;

    const netR =
        winR -
        lossR;

    const expectedValue =
        rows.length > 0
            ? netR /
              rows.length
            : 0;

    const profitFactor =
        lossR > 0
            ? winR /
              lossR
            : winR > 0
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
                4
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
// INTERNAL WALK-FORWARD FOLDS
// ============================================================

function buildInternalFolds(
    total
) {

    const folds = [];

    if (
        total <
        MIN_TRAINING_ROWS
    ) {
        return folds;
    }

    /*
    Use the last ~40% of training data
    for internal validation.

    This means pattern qualification itself
    never sees future data.
    */

    const testSize =
        Math.max(
            20,
            Math.floor(
                total /
                5
            )
        );

    const starts = [

        Math.floor(
            total * 0.50
        ),

        Math.floor(
            total * 0.65
        ),

        Math.floor(
            total * 0.80
        )
    ];

    let foldNumber = 1;

    for (
        const testStart of starts
    ) {

        if (
            testStart <= 30 ||
            testStart >= total
        ) {
            continue;
        }

        const testEnd =
            Math.min(
                total,
                testStart +
                testSize
            );

        if (
            testEnd <= testStart
        ) {
            continue;
        }

        folds.push({

            fold:
                foldNumber++,

            trainingStart:
                0,

            trainingEnd:
                testStart,

            testStart,

            testEnd
        });
    }

    return folds;
}


// ============================================================
// EVALUATE PATTERN ON INTERNAL OOS DATA
// ============================================================

function evaluatePattern(
    key,
    side,
    level,
    trainingRows
) {

    const minimum =
        minimumSamples(level);

    const allPatternRows =
        trainingRows.filter(
            row => {

                const feature =
                    extractFeatureState(row);

                return (
                    createPatternKey(
                        side,
                        feature,
                        level
                    ) === key
                );
            }
        );

    if (
        allPatternRows.length <
        minimum
    ) {
        return null;
    }

    const folds =
        buildInternalFolds(
            trainingRows.length
        );

    const foldStats = [];

    for (
        const fold of folds
    ) {

        const trainPart =
            trainingRows.slice(
                fold.trainingStart,
                fold.trainingEnd
            );

        const testPart =
            trainingRows.slice(
                fold.testStart,
                fold.testEnd
            );

        const trainingPatternRows =
            trainPart.filter(
                row => {

                    const feature =
                        extractFeatureState(row);

                    return (
                        createPatternKey(
                            side,
                            feature,
                            level
                        ) === key
                    );
                }
            );

        const testPatternRows =
            testPart.filter(
                row => {

                    const feature =
                        extractFeatureState(row);

                    return (
                        createPatternKey(
                            side,
                            feature,
                            level
                        ) === key
                    );
                }
            );

        if (
            trainingPatternRows.length < 5
        ) {
            continue;
        }

        const testStats =
            calculateStats(
                testPatternRows,
                side
            );

        const trainStats =
            calculateStats(
                trainingPatternRows,
                side
            );

        foldStats.push({

            fold:
                fold.fold,

            trainingSamples:
                trainStats.samples,

            trainingWinRate:
                trainStats.winRate,

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

            testDecisiveTrades:
                testStats.decisiveTrades,

            testWinRate:
                testStats.winRate,

            testExpectedValueR:
                testStats.expectedValueR,

            testProfitFactor:
                testStats.profitFactor,

            testNetR:
                testStats.netR,

            testDrawdownR:
                testStats.maxDrawdownR,

            testLossStreak:
                testStats.maxLossStreak
        });
    }

    if (
        foldStats.length < 2
    ) {
        return null;
    }

    const positiveFolds =
        foldStats.filter(
            x =>
                x.testExpectedValueR >
                0
        ).length;

    const stableFolds =
        foldStats.filter(
            x =>
                x.testExpectedValueR >=
                    MIN_EXPECTED_VALUE &&
                x.testProfitFactor >=
                    MIN_PROFIT_FACTOR &&
                x.testDrawdownR <=
                    MAX_OOS_DRAWDOWN &&
                x.testLossStreak <=
                    MAX_OOS_LOSS_STREAK
        ).length;

    const averageEV =
        foldStats.reduce(
            (sum, x) =>
                sum +
                x.testExpectedValueR,
            0
        ) /
        foldStats.length;

    const averagePF =
        foldStats.reduce(
            (sum, x) =>
                sum +
                Math.min(
                    x.testProfitFactor,
                    5
                ),
            0
        ) /
        foldStats.length;

    const averageWinRate =
        foldStats.reduce(
            (sum, x) =>
                sum +
                x.testWinRate,
            0
        ) /
        foldStats.length;

    const averageDrawdown =
        foldStats.reduce(
            (sum, x) =>
                sum +
                x.testDrawdownR,
            0
        ) /
        foldStats.length;

    const qualityScore =
        clamp(

            (
                clamp(
                    (
                        averageEV /
                        0.20
                    ) * 35,
                    0,
                    35
                )
            )

            +

            (
                clamp(
                    (
                        (
                            averagePF -
                            1
                        ) /
                        0.30
                    ) * 25,
                    0,
                    25
                )
            )

            +

            (
                (
                    stableFolds /
                    foldStats.length
                ) * 25
            )

            +

            (
                clamp(
                    (
                        averageWinRate -
                        35
                    ) / 30,
                    0,
                    1
                ) * 10
            )

            -

            (
                clamp(
                    (
                        averageDrawdown /
                        MAX_OOS_DRAWDOWN
                    ) * 5,
                    0,
                    5
                )
            ),

            0,
            100
        );

    const overall =
        calculateStats(
            allPatternRows,
            side
        );

    /*
    RECENCY CHECK

    Compare the most recent internal fold
    with earlier folds.
    */

    const recent =
        foldStats[
            foldStats.length - 1
        ];

    const earlier =
        foldStats.length > 1
            ? foldStats
                .slice(
                    0,
                    -1
                )
                .reduce(
                    (sum, x) =>
                        sum +
                        x.testExpectedValueR,
                    0
                ) /
                (
                    foldStats.length -
                    1
                )
            : 0;

    const recentDeterioration =
        earlier !== 0
            ? (
                recent.testExpectedValueR -
                earlier
            ) / Math.abs(earlier)
            : recent.testExpectedValueR;

    const recentStable =
        recent.testExpectedValueR >=
            MIN_EXPECTED_VALUE &&
        recent.testProfitFactor >=
            MIN_PROFIT_FACTOR &&
        recent.testDrawdownR <=
            MAX_OOS_DRAWDOWN &&
        recent.testLossStreak <=
            MAX_OOS_LOSS_STREAK;

    const robust =
        overall.samples >=
            minimum &&

        overall.decisiveTrades >=
            5 &&

        averageEV >=
            MIN_EXPECTED_VALUE &&

        averagePF >=
            MIN_PROFIT_FACTOR &&

        stableFolds >=
            MIN_STABLE_FOLDS &&

        recentStable &&

        averageDrawdown <=
            MAX_OOS_DRAWDOWN;

    return {

        key,

        side,

        level,

        patternType:
            key.includes("P:REVERSAL")
                ? "REVERSAL"
                : key.includes("P:TREND_FOLLOW")
                    ? "TREND_FOLLOW"
                    : "RANGE",

        trainingSamples:
            overall.samples,

        samples:
            overall.samples,

        wins:
            overall.wins,

        losses:
            overall.losses,

        timeouts:
            overall.timeouts,

        decisiveTrades:
            overall.decisiveTrades,

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

        foldsEvaluated:
            foldStats.length,

        positiveFolds,

        stableFolds,

        averageTestEV:
            round(
                averageEV,
                4
            ),

        averageTestPF:
            round(
                averagePF,
                3
            ),

        averageTestWinRate:
            round(
                averageWinRate,
                2
            ),

        averageTestDrawdown:
            round(
                averageDrawdown,
                2
            ),

        recentEV:
            round(
                recent.testExpectedValueR,
                4
            ),

        earlierEV:
            round(
                earlier,
                4
            ),

        recentDeterioration:
            round(
                recentDeterioration,
                4
            ),

        recentStable,

        qualityScore:
            round(
                qualityScore,
                2
            ),

        robust,

        foldDetails:
            foldStats
    };
}


// ============================================================
// LEARN PATTERNS FROM TRAINING DATA ONLY
// ============================================================

function learnPatterns(
    trainingRows
) {

    const results = [];

    const sides = [
        "BUY",
        "SELL"
    ];

    for (
        const side of sides
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
                const key of map.keys()
            ) {

                const evaluated =
                    evaluatePattern(
                        key,
                        side,
                        level,
                        trainingRows
                    );

                if (
                    evaluated
                ) {

                    results.push(
                        evaluated
                    );
                }
            }
        }
    }

    return results
        .sort(
            (a, b) => {

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
                    b.recentEV !==
                    a.recentEV
                ) {

                    return (
                        b.recentEV -
                        a.recentEV
                    );
                }

                return (
                    b.samples -
                    a.samples
                );
            }
        );
}


// ============================================================
// FIND BEST PATTERN
// ============================================================

function findBestPattern(
    row,
    side,
    patterns
) {

    const feature =
        extractFeatureState(row);

    const matches =
        patterns.filter(
            pattern => {

                if (
                    pattern.side !==
                    side
                ) {
                    return false;
                }

                const key =
                    createPatternKey(
                        side,
                        feature,
                        pattern.level
                    );

                return (
                    key ===
                    pattern.key
                );
            }
        );

    if (
        !matches.length
    ) {
        return null;
    }

    matches.sort(
        (a, b) => {

            /*
            Highest quality first.
            */

            if (
                b.qualityScore !==
                a.qualityScore
            ) {

                return (
                    b.qualityScore -
                    a.qualityScore
                );
            }

            /*
            Prefer recent stability.
            */

            if (
                b.recentEV !==
                a.recentEV
            ) {

                return (
                    b.recentEV -
                    a.recentEV
                );
            }

            /*
            Prefer simpler pattern
            when quality is similar.
            */

            return (
                a.level -
                b.level
            );
        }
    );

    return matches[0];
}


// ============================================================
// TRUE WALK-FORWARD PAPER EXECUTION
// ============================================================

function trueWalkForward(
    rows,
    folds
) {

    const allTrades = [];

    const foldResults = [];

    let tradeNumber = 0;

    /*
    IMPORTANT:

    No pattern is learned from future test data.

    Each fold learns independently from
    its own training window.
    */

    for (
        const fold of folds
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

        if (
            trainingRows.length <
            MIN_TRAINING_ROWS
        ) {
            continue;
        }

        if (
            testRows.length <
            MIN_TEST_ROWS
        ) {
            continue;
        }

        /*
        LEARN ONLY FROM TRAINING.
        */

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

        const trades = [];

        let lastTradeIndex =
            -1;

        for (
            let i = 0;
            i < testRows.length;
            i++
        ) {

            /*
            Prevent overlapping trades.
            */

            if (
                i <=
                lastTradeIndex
            ) {
                continue;
            }

            const row =
                testRows[i];

            const side =
                inferSide(row);

            if (!side) {
                continue;
            }

            /*
            Pattern was learned BEFORE this
            test period began.
            */

            const pattern =
                findBestPattern(
                    row,
                    side,
                    robustPatterns
                );

            if (!pattern) {
                continue;
            }

            const outcome =
                sideOutcome(
                    row,
                    side
                );

            let resultR = 0;

            let exitType =
                "TIMEOUT";

            if (
                outcome ===
                "WIN"
            ) {

                resultR =
                    TARGET_R;

                exitType =
                    "TARGET";
            }

            else if (
                outcome ===
                "LOSS"
            ) {

                resultR =
                    -STOP_R;

                exitType =
                    "STOP";
            }

            /*
            TIMEOUT = 0R
            */

            const close =
                number(
                    row.close
                );

            const atr =
                number(
                    row.atr14
                );

            let stop = null;
            let target = null;
            let preferredTarget = null;

            if (
                close !== null &&
                atr !== null &&
                atr > 0
            ) {

                if (
                    side ===
                    "BUY"
                ) {

                    stop =
                        close -
                        atr;

                    target =
                        close +
                        (
                            atr *
                            TARGET_R
                        );

                    preferredTarget =
                        close +
                        (
                            atr *
                            PREFERRED_TARGET_R
                        );

                } else {

                    stop =
                        close +
                        atr;

                    target =
                        close -
                        (
                            atr *
                            TARGET_R
                        );

                    preferredTarget =
                        close -
                        (
                            atr *
                            PREFERRED_TARGET_R
                        );
                }
            }

            tradeNumber++;

            trades.push({

                tradeNumber,

                fold:
                    fold.fold,

                signalIndex:
                    fold.testStart +
                    i,

                timestamp:
                    row.timestamp,

                side,

                pattern:
                    pattern.key,

                patternLevel:
                    pattern.level,

                patternType:
                    pattern.patternType,

                patternQuality:
                    pattern.qualityScore,

                patternSamples:
                    pattern.samples,

                patternEV:
                    pattern.recentEV,

                patternPF:
                    pattern.averageTestPF,

                entry:
                    close,

                stop:

                    stop !== null
                        ? round(
                            stop,
                            2
                        )
                        : null,

                target:

                    target !== null
                        ? round(
                            target,
                            2
                        )
                        : null,

                preferredTarget:

                    preferredTarget !== null
                        ? round(
                            preferredTarget,
                            2
                        )
                        : null,

                riskReward:
                    "1:2",

                exitType,

                resultR:
                    round(
                        resultR,
                        4
                    )
            });

            lastTradeIndex =
                i;
        }

        /*
        Fold statistics.
        */

        let wins = 0;
        let losses = 0;
        let timeouts = 0;

        let winR = 0;
        let lossR = 0;

        let equity = 0;
        let peak = 0;
        let maxDrawdown = 0;

        let lossStreak = 0;
        let maxLossStreak = 0;

        for (
            const trade of trades
        ) {

            if (
                trade.resultR >
                0
            ) {

                wins++;

                winR +=
                    trade.resultR;

                equity +=
                    trade.resultR;

                lossStreak = 0;
            }

            else if (
                trade.resultR <
                0
            ) {

                losses++;

                lossR +=
                    Math.abs(
                        trade.resultR
                    );

                equity +=
                    trade.resultR;

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
                    peak - equity
                );
        }

        const decisive =
            wins + losses;

        const winRate =
            decisive > 0
                ? (
                    wins /
                    decisive
                ) * 100
                : 0;

        const netR =
            winR -
            lossR;

        const ev =
            trades.length > 0
                ? netR /
                  trades.length
                : 0;

        const pf =
            lossR > 0
                ? winR /
                  lossR
                : winR > 0
                    ? 999
                    : 0;

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
                    winR,
                    4
                ),

            totalLossR:
                round(
                    lossR,
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
                    3
                ),

            maxDrawdownR:
                round(
                    maxDrawdown,
                    2
                ),

            maxLossStreak,

            tradeResults:
                trades.map(
                    t =>
                        t.resultR
                ),

            trades: trades
        });

        allTrades.push(
            ...trades
        );
    }

    /*
    GLOBAL TRUE OOS STATISTICS.
    */

    let wins = 0;
    let losses = 0;
    let timeouts = 0;

    let winR = 0;
    let lossR = 0;

    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;

    let lossStreak = 0;
    let maxLossStreak = 0;

    for (
        const trade of allTrades
    ) {

        if (
            trade.resultR >
            0
        ) {

            wins++;

            winR +=
                trade.resultR;

            equity +=
                trade.resultR;

            lossStreak = 0;
        }

        else if (
            trade.resultR <
            0
        ) {

            losses++;

            lossR +=
                Math.abs(
                    trade.resultR
                );

            equity +=
                trade.resultR;

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
                peak - equity
            );
    }

    const decisive =
        wins + losses;

    const winRate =
        decisive > 0
            ? (
                wins /
                decisive
            ) * 100
            : 0;

    const netR =
        winR -
        lossR;

    const expectedValue =
        allTrades.length > 0
            ? netR /
              allTrades.length
            : 0;

    const profitFactor =
        lossR > 0
            ? winR /
              lossR
            : winR > 0
                ? 999
                : 0;

    return {

        stats: {

            trades:
                allTrades.length,

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
                    winR,
                    4
                ),

            totalLossR:
                round(
                    lossR,
                    4
                ),

            netR:
                round(
                    netR,
                    4
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

            maxConsecutiveLosses:
                maxLossStreak
        },

        folds:
            foldResults,

        tradeLog:
            allTrades.slice(
                -100
            )
    };
}


// ============================================================
// CURRENT MARKET
// ============================================================

function currentMarket(rows) {

    if (
        !rows.length
    ) {

        return {
            available: false
        };
    }

    /*
    Latest candle is used ONLY for
    current analysis.

    It is NOT included in learning.
    */

    const row =
        rows[
            rows.length - 1
        ];

    const feature =
        extractFeatureState(row);

    return {

        available:
            true,

        timestamp:
            row.timestamp,

        date:
            row.date ||
            null,

        close:
            number(
                row.close
            ),

        trend:
            feature.trend,

        regime:
            feature.regime,

        rsi:
            number(
                row.rsi14
            ),

        rsiBucket:
            feature.rsi,

        vwap:
            number(
                row.vwap
            ),

        vwapDirection:
            feature.vwap,

        vwapDistanceATR:
            number(
                row.vwapDistanceATR
            ),

        atr14:
            number(
                row.atr14
            ),

        ema9:
            number(
                row.ema9
            ),

        ema21:
            number(
                row.ema21
            ),

        emaSpreadATR:
            number(
                row.emaSpreadATR
            ),

        ema9SlopeATR:
            number(
                row.ema9SlopeATR
            ),

        patternType:
            feature.type,

        time:
            feature.time,

        inferredSide:
            inferSide(row)
    };
}


// ============================================================
// CURRENT SIGNAL
// ============================================================

function currentSignal(
    historicalRows,
    currentRow
) {

    const market =
        currentMarket(
            [
                ...historicalRows,
                currentRow
            ]
        );

    if (
        !market.available
    ) {

        return {

            status:
                "NO_DATA",

            reason:
                "No current candle available."
        };
    }

    const side =
        inferSide(
            currentRow
        );

    if (!side) {

        return {

            status:
                "NO_TRADE",

            side:
                null,

            market,

            reason:
                "Current market does not satisfy the directional setup.",

            nextAction:
                "WAIT"
        };
    }

    /*
    Learn ONLY from candles BEFORE
    the current candle.
    */

    const patterns =
        learnPatterns(
            historicalRows
        );

    const qualified =
        patterns.filter(
            p =>
                p.robust &&
                p.qualityScore >=
                    QUALITY_THRESHOLD
        );

    const best =
        findBestPattern(
            currentRow,
            side,
            qualified
        );

    if (!best) {

        return {

            status:
                "NO_EDGE",

            side,

            market,

            learning: {

                trainingRows:
                    historicalRows.length,

                patternsDiscovered:
                    patterns.length,

                robustPatterns:
                    qualified.length
            },

            reason:
                "Directional setup exists, but no previously learned robust pattern matches the current candle.",

            nextAction:
                "WAIT"
        };
    }

    const close =
        number(
            currentRow.close
        );

    const atr =
        number(
            currentRow.atr14
        );

    let stop = null;
    let target = null;
    let preferredTarget = null;

    if (
        close !== null &&
        atr !== null &&
        atr > 0
    ) {

        if (
            side === "BUY"
        ) {

            stop =
                close -
                atr;

            target =
                close +
                (
                    atr *
                    TARGET_R
                );

            preferredTarget =
                close +
                (
                    atr *
                    PREFERRED_TARGET_R
                );

        } else {

            stop =
                close +
                atr;

            target =
                close -
                (
                    atr *
                    TARGET_R
                );

            preferredTarget =
                close -
                (
                    atr *
                    PREFERRED_TARGET_R
                );
        }
    }

    return {

        status:
            "PAPER_TRADE_CANDIDATE",

        side,

        market,

        pattern:
            best.key,

        patternLevel:
            best.level,

        patternType:
            best.patternType,

        patternQuality:
            best.qualityScore,

        patternSamples:
            best.samples,

        patternEV:
            best.recentEV,

        patternPF:
            best.averageTestPF,

        stableFolds:
            best.stableFolds,

        positiveFolds:
            best.positiveFolds,

        entry:
            close,

        stop:

            stop !== null
                ? round(
                    stop,
                    2
                )
                : null,

        target:

            target !== null
                ? round(
                    target,
                    2
                )
                : null,

        preferredTarget:

            preferredTarget !== null
                ? round(
                    preferredTarget,
                    2
                )
                : null,

        riskReward:
            "1:2",

        preferredRiskReward:
            "1:2.5",

        maxHoldCandles:
            MAX_HOLD_CANDLES,

        reason:
            "Current candle matches a robust pattern learned exclusively from prior historical data.",

        nextAction:
            "PAPER_TRADE_ONLY"
    };
}


// ============================================================
// BUILD OUTER FOLDS
// ============================================================

function buildOuterFolds(total) {

    const folds = [];

    /*
    Reserve approximately 80% for
    sequential expanding walk-forward.

    4 future test blocks.
    */

    const available =
        total -
        MIN_TEST_ROWS;

    const testSize =
        Math.floor(
            available /
            OUTER_FOLD_COUNT
        );

    for (
        let i = 0;
        i < OUTER_FOLD_COUNT;
        i++
    ) {

        const trainingEnd =
            MIN_TRAINING_ROWS +
            (
                i *
                testSize
            );

        const testStart =
            trainingEnd;

        const testEnd =
            i ===
            OUTER_FOLD_COUNT - 1

                ? total

                : Math.min(
                    total,
                    testStart +
                    testSize
                );

        if (
            trainingEnd <
            MIN_TRAINING_ROWS
        ) {
            continue;
        }

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
// ENGINE
// ============================================================

async function runEngine(req) {

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
        400
    ) {

        throw new Error(
            `Not enough historical rows for V12.7: ${rows.length}`
        );
    }

    /*
    CURRENT CANDLE IS REMOVED
    FROM HISTORICAL TESTING.

    This is critical.
    */

    const currentRow =
        rows[
            rows.length - 1
        ];

    const historicalRows =
        rows.slice(
            0,
            rows.length - 1
        );


    /*
    Build outer folds from historical
    candles only.
    */

    const folds =
        buildOuterFolds(
            historicalRows.length
        );


    /*
    TRUE WALK-FORWARD EXECUTION.
    */

    const walkForward =
        trueWalkForward(
            historicalRows,
            folds
        );


    /*
    Current signal learns only from
    historical candles BEFORE current.
    */

    const signal =
        currentSignal(
            historicalRows,
            currentRow
        );


    /*
    Pattern summary from the most recent
    training universe.

    This is NOT used for historical
    backtest selection.
    */

    const latestPatterns =
        learnPatterns(
            historicalRows
        );

    const latestQualified =
        latestPatterns.filter(
            p =>
                p.robust &&
                p.qualityScore >=
                    QUALITY_THRESHOLD
        );


    const tradingDays =
        new Set(
            historicalRows
                .map(
                    row => {

                        if (
                            !row.timestamp
                        ) {
                            return null;
                        }

                        const d =
                            new Date(
                                row.timestamp *
                                1000
                            );

                        return [
                            d.getUTCFullYear(),
                            d.getUTCMonth(),
                            d.getUTCDate()
                        ].join("-");
                    }
                )
                .filter(Boolean)
        );


    /*
    Determine profitability proof.
    */

    const stats =
        walkForward.stats;

    const positiveOOS =
        stats.expectedValueR >
            0 &&

        stats.profitFactor >
            1;

    const controlledRisk =
        stats.maxDrawdownR <=
            MAX_OOS_DRAWDOWN &&

        stats.maxConsecutiveLosses <=
            MAX_OOS_LOSS_STREAK;

    const enoughTrades =
        stats.decisiveTrades >=
        MIN_OOS_DECISIVE;

    const profitabilityProof =
        positiveOOS &&
        controlledRisk &&
        enoughTrades;


    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V12_7_TRUE_WALK_FORWARD_PAPER",

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

        interval:
            INTERVAL,

        requestedDays:
            REQUESTED_DAYS,

        source:
            "V11.1_LEARNING_DATASET",


        // ====================================================
        // ANTI LEAKAGE
        // ====================================================

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

            overlappingPaperTrades:
                false,

            sameCandleStopTargetBias:
                "STOP_FIRST"
        },


        // ====================================================
        // OBJECTIVE
        // ====================================================

        objective: {

            primary:
                "TRUE_OUT_OF_SAMPLE_PROFITABILITY",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "SELECT_FEWER_HIGH_QUALITY_TRADES",

            allowNoTrade:
                true,

            minimumOOSExpectedValueR:
                MIN_EXPECTED_VALUE,

            minimumOOSProfitFactor:
                MIN_PROFIT_FACTOR,

            minimumOOSDecisiveTrades:
                MIN_OOS_DECISIVE,

            profitabilityProof:
                profitabilityProof
        },


        // ====================================================
        // DATA
        // ====================================================

        sourceStatistics: {

            rawLearningRows:
                rawRows.length,

            normalizedRows:
                rows.length,

            historicalLearningRows:
                historicalRows.length,

            currentCandleExcluded:
                1,

            candlesTested:
                historicalRows.length,

            tradingDays:
                tradingDays.size,

            invalidRows:
                rawRows.length -
                rows.length,

            latestTimestamp:
                currentRow.timestamp,

            latestPrice:
                currentRow.close
        },


        // ====================================================
        // WALK FORWARD
        // ====================================================

        walkForward: {

            method:
                "STRICT_TRUE_EXPANDING_WALK_FORWARD",

            foldCount:
                folds.length,

            chronological:
                true,

            shuffled:
                false,

            folds:
                folds.map(
                    fold => ({

                        fold:
                            fold.fold,

                        trainingStart:
                            fold.trainingStart,

                        trainingEnd:
                            fold.trainingEnd,

                        testStart:
                            fold.testStart,

                        testEnd:
                            fold.testEnd,

                        trainingRows:
                            fold.trainingRows,

                        testRows:
                            fold.testRows
                    })
                )
        },


        // ====================================================
        // TRUE OOS RESULT
        // ====================================================

        trueOOSPaperExecution: {

            description:
                "Every fold learns patterns exclusively from its preceding training window and executes only on the subsequent unseen test window.",

            stats:
                stats,

            profitabilityProof:

                profitabilityProof
                    ? "PASSED"
                    : "NOT_PROVEN",

            riskControl:

                controlledRisk
                    ? "PASSED"
                    : "FAILED",

            sufficientEvidence:

                enoughTrades
                    ? "PASSED"
                    : "INSUFFICIENT"
        },


        // ====================================================
        // FOLD RESULTS
        // ====================================================

        foldResults:
            walkForward.folds.map(
                fold => ({

                    fold:
                        fold.fold,

                    trainingRows:
                        fold.trainingRows,

                    testRows:
                        fold.testRows,

                    patternsDiscovered:
                        fold.patternsDiscovered,

                    robustPatterns:
                        fold.robustPatterns,

                    trades:
                        fold.trades,

                    wins:
                        fold.wins,

                    losses:
                        fold.losses,

                    timeouts:
                        fold.timeouts,

                    winRate:
                        fold.winRate,

                    netR:
                        fold.netR,

                    expectedValueR:
                        fold.expectedValueR,

                    profitFactor:
                        fold.profitFactor,

                    maxDrawdownR:
                        fold.maxDrawdownR,

                    maxLossStreak:
                        fold.maxLossStreak,

                    tradeResults:
                        fold.tradeResults
                })
            ),


        // ====================================================
        // CURRENT MARKET
        // ====================================================

        currentMarket:
            currentMarket(
                [
                    ...historicalRows,
                    currentRow
                ]
            ),


        // ====================================================
        // CURRENT SIGNAL
        // ====================================================

        currentSignal:
            signal,


        // ====================================================
        // LATEST LEARNING
        // ====================================================

        latestLearning: {

            trainingRows:
                historicalRows.length,

            patternsDiscovered:
                latestPatterns.length,

            robustPatterns:
                latestPatterns.filter(
                    p =>
                        p.robust
                ).length,

            qualifiedPatterns:
                latestQualified.length,

            buyPatterns:
                latestQualified.filter(
                    p =>
                        p.side ===
                        "BUY"
                ).length,

            sellPatterns:
                latestQualified.filter(
                    p =>
                        p.side ===
                        "SELL"
                ).length,

            patternTypes: {

                trendFollow:
                    latestQualified.filter(
                        p =>
                            p.patternType ===
                            "TREND_FOLLOW"
                    ).length,

                reversal:
                    latestQualified.filter(
                        p =>
                            p.patternType ===
                            "REVERSAL"
                    ).length,

                range:
                    latestQualified.filter(
                        p =>
                            p.patternType ===
                            "RANGE"
                    ).length
            },

            levels: {

                level1:
                    latestPatterns.filter(
                        p =>
                            p.level ===
                            1
                    ).length,

                level2:
                    latestPatterns.filter(
                        p =>
                            p.level ===
                            2
                    ).length,

                level3:
                    latestPatterns.filter(
                        p =>
                            p.level ===
                            3
                    ).length,

                level4:
                    latestPatterns.filter(
                        p =>
                            p.level ===
                            4
                    ).length
            }
        },


        // ====================================================
        // RISK PLAN
        // ====================================================

        riskPlan: {

            riskPerTradeR:
                1,

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
                MAX_OOS_LOSS_STREAK
        },


        // ====================================================
        // TRADE LOG
        // ====================================================

        trueOOSTradeLog:
            walkForward.tradeLog,


        // ====================================================
        // FINAL ACTION
        // ====================================================

        paperAction:

            signal.status ===
            "PAPER_TRADE_CANDIDATE"

                ? "PAPER_TRADE_CANDIDATE"

                : "NO_TRADE",

        nextAction:

            signal.status ===
            "PAPER_TRADE_CANDIDATE"

                ? "WAIT_FOR_NEXT_CANDLE_CONFIRMATION"

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
                        "Method not allowed. Use GET."
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
            "V12.7 ERROR:",
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

                error:
                    error &&
                    error.message
                        ? error.message
                        : String(error)
            });
    }
}
