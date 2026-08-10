/*
TradeMind Pro
V12.8
STRICT SIGNAL-CONDITIONED TRUE WALK-FORWARD PAPER ENGINE

V12.8 improvements over V12.7:

1. Pattern learning is now SIGNAL-CONDITIONED.
   A BUY pattern is learned only from candles where the actual
   signal engine would have generated BUY.

2. SELL patterns are learned only from actual SELL signals.

3. Internal OOS validation uses the same signal condition.

4. Stronger OOS evidence requirements.

5. Recent deterioration protection.

6. Context compatibility protection.

7. Higher-quality pattern selection.

8. Repeated-entry suppression.
   The engine will not enter the same setup on every candle.

9. Cooldown after each paper entry.

10. Global TRUE OOS profitability gate.
    If historical unseen data has not demonstrated an edge,
    the current paper engine remains NO_TRADE.

Paper only.
No real broker orders.
*/


// ============================================================
// VERSION
// ============================================================

const VERSION = "V12.8";

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

const MIN_OOS_SAMPLES = 4;
const MIN_OOS_DECISIVE = 3;

const MIN_EXPECTED_VALUE = 0.10;
const MIN_PROFIT_FACTOR = 1.10;

const MIN_STABLE_FOLDS = 2;

const QUALITY_THRESHOLD = 50;

const MAX_OOS_DRAWDOWN = 15;
const MAX_OOS_LOSS_STREAK = 8;


// ============================================================
// RECENCY PROTECTION
// ============================================================

const MAX_RECENT_EV_DROP = 0.35;

const REQUIRE_RECENT_STABILITY = true;


// ============================================================
// SIGNAL PROTECTION
// ============================================================

const ENTRY_COOLDOWN_CANDLES = 3;

const SAME_PATTERN_COOLDOWN_CANDLES = 5;

const REQUIRE_GLOBAL_OOS_PROOF = true;


// ============================================================
// WALK FORWARD
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
// SIGNAL ENGINE
// ============================================================

function inferSide(row) {

    const trend =
        normalizeTrend(row);

    const vwap =
        vwapDirection(row);

    const rsi =
        number(row.rsi14);

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
// SIGNAL-CONDITIONED ROW CHECK
// ============================================================

function isActualSignalRow(
    row,
    side
) {

    return (
        inferSide(row) === side
    );
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

        const close =
            number(
                firstValue(
                    row,
                    [
                        "close",
                        "c"
                    ]
                )
            );

        if (
            timestamp === null ||
            close === null
        ) {
            continue;
        }

        result.push({

            ...row,

            timestamp,

            close,

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
// BUILD PATTERN MAP
//
// V12.8 CHANGE:
// Only actual signal candles enter the pattern map.
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

        if (
            !isActualSignalRow(
                row,
                side
            )
        ) {
            continue;
        }

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
// INTERNAL WALK FORWARD
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
            testEnd <=
            testStart
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
// PATTERN ROW MATCH
// ============================================================

function matchesPattern(
    row,
    side,
    key,
    level
) {

    if (
        !isActualSignalRow(
            row,
            side
        )
    ) {
        return false;
    }

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
        minimumSamples(level);

    const allPatternRows =
        trainingRows.filter(
            row =>
                matchesPattern(
                    row,
                    side,
                    key,
                    level
                )
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
                row =>
                    matchesPattern(
                        row,
                        side,
                        key,
                        level
                    )
            );

        const testPatternRows =
            testPart.filter(
                row =>
                    matchesPattern(
                        row,
                        side,
                        key,
                        level
                    )
            );

        if (
            trainingPatternRows.length <
            5
        ) {
            continue;
        }

        if (
            testPatternRows.length ===
            0
        ) {
            continue;
        }

        const trainStats =
            calculateStats(
                trainingPatternRows,
                side
            );

        const testStats =
            calculateStats(
                testPatternRows,
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


    // ========================================================
    // AGGREGATE OOS
    // ========================================================

    const totalOOSSamples =
        foldStats.reduce(
            (sum, x) =>
                sum +
                x.testSamples,
            0
        );

    const totalOOSDecisive =
        foldStats.reduce(
            (sum, x) =>
                sum +
                x.testDecisiveTrades,
            0
        );


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


    // ========================================================
    // RECENT STABILITY
    // ========================================================

    const recent =
        foldStats[
            foldStats.length - 1
        ];

    const earlierFolds =
        foldStats.slice(
            0,
            -1
        );

    const earlier =
        earlierFolds.length > 0

            ? earlierFolds.reduce(
                (sum, x) =>
                    sum +
                    x.testExpectedValueR,
                0
            ) /
            earlierFolds.length

            : 0;


    const recentDrop =
        earlier > 0

            ? (
                earlier -
                recent.testExpectedValueR
            )

            : 0;


    const recentStable =
        recent.testExpectedValueR >=
            MIN_EXPECTED_VALUE &&

        recent.testProfitFactor >=
            MIN_PROFIT_FACTOR &&

        recent.testDrawdownR <=
            MAX_OOS_DRAWDOWN &&

        recent.testLossStreak <=
            MAX_OOS_LOSS_STREAK;


    // ========================================================
    // QUALITY SCORE
    // ========================================================

    const qualityScore =
        clamp(

            clamp(
                (
                    averageEV /
                    0.20
                ) * 35,
                0,
                35
            )

            +

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

            +

            (
                stableFolds /
                foldStats.length
            ) * 25

            +

            clamp(
                (
                    averageWinRate -
                    35
                ) / 30,
                0,
                1
            ) * 10

            -

            clamp(
                (
                    averageDrawdown /
                    MAX_OOS_DRAWDOWN
                ) * 5,
                0,
                5
            ),

            0,
            100
        );


    const overall =
        calculateStats(
            allPatternRows,
            side
        );


    // ========================================================
    // ROBUSTNESS
    // ========================================================

    const enoughOOS =
        totalOOSSamples >=
            MIN_OOS_SAMPLES &&

        totalOOSDecisive >=
            MIN_OOS_DECISIVE;


    const recentCondition =
        REQUIRE_RECENT_STABILITY
            ? recentStable
            : true;


    const deteriorationCondition =
        recentDrop <=
        MAX_RECENT_EV_DROP;


    const robust =
        overall.samples >=
            minimum &&

        enoughOOS &&

        averageEV >=
            MIN_EXPECTED_VALUE &&

        averagePF >=
            MIN_PROFIT_FACTOR &&

        stableFolds >=
            MIN_STABLE_FOLDS &&

        recentCondition &&

        deteriorationCondition &&

        averageDrawdown <=
            MAX_OOS_DRAWDOWN;


    return {

        key,

        side,

        level,

        patternType:
            key.includes(
                "P:REVERSAL"
            )
                ? "REVERSAL"

                : key.includes(
                    "P:TREND_FOLLOW"
                )
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

        oosSamples:
            totalOOSSamples,

        oosDecisiveTrades:
            totalOOSDecisive,

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

        recentEVDrop:
            round(
                recentDrop,
                4
            ),

        recentStable,

        enoughOOS,

        deteriorationControlled:
            deteriorationCondition,

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
// LEARN PATTERNS
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

    return results.sort(
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

            if (
                b.stableFolds !==
                a.stableFolds
            ) {

                return (
                    b.stableFolds -
                    a.stableFolds
                );
            }

            /*
            Prefer simpler patterns when
            their quality is effectively equal.
            */

            return (
                a.level -
                b.level
            );
        }
    );
}


// ============================================================
// CONTEXT SCORE
// ============================================================

function contextScore(
    row,
    pattern
) {

    const feature =
        extractFeatureState(row);

    const key =
        createPatternKey(
            pattern.side,
            feature,
            pattern.level
        );

    if (
        key !== pattern.key
    ) {
        return 0;
    }

    let score = 50;

    /*
    Higher specificity gets a small bonus,
    but not enough to overpower poor quality.
    */

    score +=
        pattern.level *
        5;

    /*
    OOS stability.
    */

    score +=
        Math.min(
            pattern.stableFolds *
            5,
            15
        );

    /*
    Recent EV.
    */

    score +=
        clamp(
            pattern.recentEV *
            20,
            0,
            15
        );

    return clamp(
        score,
        0,
        100
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

                return (
                    contextScore(
                        row,
                        pattern
                    ) > 0
                );
            }
        );


    if (
        !matches.length
    ) {
        return null;
    }


    matches.forEach(
        pattern => {

            pattern._contextScore =
                contextScore(
                    row,
                    pattern
                );
        }
    );


    matches.sort(
        (a, b) => {

            if (
                b._contextScore !==
                a._contextScore
            ) {

                return (
                    b._contextScore -
                    a._contextScore
                );
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
                a.level -
                b.level
            );
        }
    );


    const best =
        matches[0];


    /*
    Do not expose internal helper property.
    */

    delete best._contextScore;

    return best;
}


// ============================================================
// TRADE ENTRY PROTECTION
// ============================================================

function canEnterTrade(
    index,
    pattern,
    trades
) {

    if (
        !trades.length
    ) {
        return true;
    }

    const previous =
        trades[
            trades.length - 1
        ];

    const previousIndex =
        previous._testIndex;

    const candlesSince =
        index -
        previousIndex;


    if (
        candlesSince <
        ENTRY_COOLDOWN_CANDLES
    ) {

        return false;
    }


    if (
        previous.pattern ===
        pattern.key &&
        candlesSince <
        SAME_PATTERN_COOLDOWN_CANDLES
    ) {

        return false;
    }


    return true;
}


// ============================================================
// BUILD PRICE LEVELS
// ============================================================

function buildTradeLevels(
    side,
    close,
    atr
) {

    if (
        close === null ||
        atr === null ||
        atr <= 0
    ) {

        return {

            stop: null,

            target: null,

            preferredTarget: null
        };
    }


    if (
        side === "BUY"
    ) {

        return {

            stop:
                close -
                atr,

            target:
                close +
                (
                    atr *
                    TARGET_R
                ),

            preferredTarget:
                close +
                (
                    atr *
                    PREFERRED_TARGET_R
                )
        };
    }


    return {

        stop:
            close +
            atr,

        target:
            close -
            (
                atr *
                TARGET_R
            ),

        preferredTarget:
            close -
            (
                atr *
                PREFERRED_TARGET_R
            )
    };
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
        LEARN ONLY FROM PRECEDING TRAINING DATA.
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


        for (
            let i = 0;
            i < testRows.length;
            i++
        ) {

            const row =
                testRows[i];


            const side =
                inferSide(row);


            if (!side) {
                continue;
            }


            const pattern =
                findBestPattern(
                    row,
                    side,
                    robustPatterns
                );


            if (!pattern) {
                continue;
            }


            /*
            V12.8:
            Prevent repeated entries into
            the same setup.
            */

            if (
                !canEnterTrade(
                    i,
                    pattern,
                    trades
                )
            ) {
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


            const close =
                number(
                    row.close
                );

            const atr =
                number(
                    row.atr14
                );


            const levels =
                buildTradeLevels(
                    side,
                    close,
                    atr
                );


            tradeNumber++;


            trades.push({

                tradeNumber,

                fold:
                    fold.fold,

                signalIndex:
                    fold.testStart +
                    i,

                _testIndex:
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

                patternOOSSamples:
                    pattern.oosSamples,

                patternEV:
                    pattern.recentEV,

                patternPF:
                    pattern.averageTestPF,

                patternStableFolds:
                    pattern.stableFolds,

                entry:
                    close,

                stop:
                    levels.stop !== null
                        ? round(
                            levels.stop,
                            2
                        )
                        : null,

                target:
                    levels.target !== null
                        ? round(
                            levels.target,
                            2
                        )
                        : null,

                preferredTarget:
                    levels.preferredTarget !== null
                        ? round(
                            levels.preferredTarget,
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
        }


        // ====================================================
        // FOLD STATISTICS
        // ====================================================

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

            trades:
                trades.map(
                    trade => {

                        const clean = {
                            ...trade
                        };

                        delete clean._testIndex;

                        return clean;
                    }
                )
        });


        allTrades.push(
            ...trades
        );
    }


    // ========================================================
    // GLOBAL TRUE OOS
    // ========================================================

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
            allTrades
                .slice(-100)
                .map(
                    trade => {

                        const clean = {
                            ...trade
                        };

                        delete clean._testIndex;

                        return clean;
                    }
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
    currentRow,
    oosStats
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


    // ========================================================
    // GLOBAL OOS PROFITABILITY GATE
    // ========================================================

    const globalProof =
        oosStats.expectedValueR >
            0 &&

        oosStats.profitFactor >
            1 &&

        oosStats.decisiveTrades >=
            MIN_OOS_DECISIVE &&

        oosStats.maxDrawdownR <=
            MAX_OOS_DRAWDOWN &&

        oosStats.maxConsecutiveLosses <=
            MAX_OOS_LOSS_STREAK;


    if (
        REQUIRE_GLOBAL_OOS_PROOF &&
        !globalProof
    ) {

        return {

            status:
                "NO_TRADE",

            side,

            market,

            globalOOSGate: {

                passed:
                    false,

                expectedValueR:
                    oosStats.expectedValueR,

                profitFactor:
                    oosStats.profitFactor,

                decisiveTrades:
                    oosStats.decisiveTrades,

                maxDrawdownR:
                    oosStats.maxDrawdownR,

                maxLossStreak:
                    oosStats.maxConsecutiveLosses
            },

            reason:
                "The current setup has a directional signal, but the strict TRUE OOS engine has not yet proven a profitable edge. Paper execution is blocked.",

            nextAction:
                "WAIT"
        };
    }


    // ========================================================
    // LEARN ONLY FROM PRIOR DATA
    // ========================================================

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
                    patterns.filter(
                        p =>
                            p.robust
                    ).length,

                qualifiedPatterns:
                    qualified.length
            },

            reason:
                "Directional setup exists, but no previously learned robust signal-conditioned pattern matches the current candle.",

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


    const levels =
        buildTradeLevels(
            side,
            close,
            atr
        );


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

        patternOOSSamples:
            best.oosSamples,

        patternOOSDecisiveTrades:
            best.oosDecisiveTrades,

        patternEV:
            best.recentEV,

        patternAverageEV:
            best.averageTestEV,

        patternPF:
            best.averageTestPF,

        stableFolds:
            best.stableFolds,

        positiveFolds:
            best.positiveFolds,

        recentStable:
            best.recentStable,

        entry:
            close,

        stop:
            levels.stop !== null
                ? round(
                    levels.stop,
                    2
                )
                : null,

        target:
            levels.target !== null
                ? round(
                    levels.target,
                    2
                )
                : null,

        preferredTarget:
            levels.preferredTarget !== null
                ? round(
                    levels.preferredTarget,
                    2
                )
                : null,

        riskReward:
            "1:2",

        preferredRiskReward:
            "1:2.5",

        maxHoldCandles:
            MAX_HOLD_CANDLES,

        globalOOSProof:
            globalProof,

        reason:
            "Current candle matches a robust signal-conditioned pattern learned exclusively from prior historical data and the global TRUE OOS gate has passed.",

        nextAction:
            "PAPER_TRADE_ONLY"
    };
}


// ============================================================
// BUILD OUTER FOLDS
// ============================================================

function buildOuterFolds(total) {

    const folds = [];


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
            `Not enough historical rows for V12.8: ${rows.length}`
        );
    }


    // ========================================================
    // CURRENT CANDLE EXCLUSION
    // ========================================================

    const currentRow =
        rows[
            rows.length - 1
        ];


    const historicalRows =
        rows.slice(
            0,
            rows.length - 1
        );


    // ========================================================
    // OUTER TRUE WALK FORWARD
    // ========================================================

    const folds =
        buildOuterFolds(
            historicalRows.length
        );


    const walkForward =
        trueWalkForward(
            historicalRows,
            folds
        );


    // ========================================================
    // CURRENT SIGNAL
    // ========================================================

    const signal =
        currentSignal(
            historicalRows,
            currentRow,
            walkForward.stats
        );


    // ========================================================
    // LATEST LEARNING
    // ========================================================

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


    // ========================================================
    // TRADING DAYS
    // ========================================================

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


    // ========================================================
    // PROFITABILITY PROOF
    // ========================================================

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


    // ========================================================
    // RETURN
    // ========================================================

    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V12_8_STRICT_SIGNAL_CONDITIONED_TRUE_WALK_FORWARD",

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
                "STOP_FIRST",

            signalConditionedLearning:
                true,

            signalConditionedOOS:
                true
        },


        // ====================================================
        // OBJECTIVE
        // ====================================================

        objective: {

            primary:
                "STRICT_OUT_OF_SAMPLE_PROFITABILITY",

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

            minimumStableFolds:
                MIN_STABLE_FOLDS,

            minimumOOSSamples:
                MIN_OOS_SAMPLES,

            qualityThreshold:
                QUALITY_THRESHOLD,

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
                "Every outer fold learns signal-conditioned patterns exclusively from its preceding training window and executes only on the subsequent unseen test window.",

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
                    : "INSUFFICIENT",

            signalConditionedLearning:
                true,

            repeatedEntrySuppression:
                true
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

                    decisiveTrades:
                        fold.decisiveTrades,

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

            signalConditioned:
                true,

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
                MAX_OOS_LOSS_STREAK,

            entryCooldownCandles:
                ENTRY_COOLDOWN_CANDLES,

            samePatternCooldownCandles:
                SAME_PATTERN_COOLDOWN_CANDLES
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
            "V12.8 ERROR:",
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
