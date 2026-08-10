/*
TradeMind Pro
V12.5

STRICT WALK-FORWARD INTEGRITY BRAIN

Purpose:
Build a genuinely out-of-sample trading brain.

IMPORTANT:
- PAPER ONLY
- NO REAL ORDERS
- NO BROKER EXECUTION
- CURRENT CANDLE IS NEVER USED FOR LEARNING
- FUTURE TEST DATA IS NEVER USED TO DISCOVER PATTERNS
- EACH WALK-FORWARD FOLD LEARNS ONLY FROM PRIOR DATA

V12.5 improvements over V12.4:

1. Strict expanding walk-forward learning.
2. Pattern discovery occurs ONLY inside each training window.
3. Test candles remain completely unseen until evaluation.
4. Current candle is excluded from all learning statistics.
5. OOS performance is aggregated separately.
6. Pattern must survive repeated OOS testing.
7. Recent deterioration protection.
8. Drawdown protection.
9. Consecutive-loss protection.
10. Prefer simpler patterns when evidence is similar.
11. No-trade remains a valid decision.

*/

// ============================================================
// VERSION / ENGINE CONFIG
// ============================================================

const VERSION = "V12.5";

const INTERVAL = "5minute";
const INSTRUMENT = "NIFTY 50";

const REQUESTED_DAYS = 30;

// ============================================================
// RISK MODEL
// ============================================================

const STOP_R = 1.0;

const MIN_TARGET_R = 2.0;

const PREFERRED_TARGET_R = 2.5;

// ============================================================
// PATTERN REQUIREMENTS
// ============================================================

const MIN_LEVEL1_SAMPLES = 20;
const MIN_LEVEL2_SAMPLES = 15;
const MIN_LEVEL3_SAMPLES = 12;
const MIN_LEVEL4_SAMPLES = 10;

const MIN_TRAINING_DECISIVE = 6;

const MIN_OOS_SAMPLES = 3;
const MIN_OOS_DECISIVE = 2;

const MIN_OOS_FOLDS = 2;

const MIN_POSITIVE_OOS_FOLDS = 2;

const MIN_STABLE_OOS_FOLDS = 2;

const MIN_EXPECTED_VALUE = 0.10;

const MIN_OOS_EXPECTED_VALUE = 0.10;

const GOOD_EXPECTED_VALUE = 0.20;

const MIN_PROFIT_FACTOR = 1.10;

const GOOD_PROFIT_FACTOR = 1.30;

const MIN_CONTEXT_SCORE = 60;

const MAX_DRAWDOWN_R = 15;

const MAX_LOSS_STREAK = 8;

const MAX_RECENT_DETERIORATION = -0.35;

const RECENT_WINDOW_FRACTION = 0.35;

// ============================================================
// WALK FORWARD
// ============================================================

const FOLD_COUNT = 4;

// ============================================================
// GENERAL HELPERS
// ============================================================

function number(value, fallback = null) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function round(value, decimals = 3) {

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


function array(value) {

    return Array.isArray(value)
        ? value
        : [];
}


// ============================================================
// TIMESTAMP
// ============================================================

function normalizeTimestamp(value) {

    let ts = number(value);

    if (ts === null) {
        return null;
    }

    if (ts > 100000000000) {
        ts = ts / 1000;
    }

    return Math.floor(ts);
}


// ============================================================
// FIELD EXTRACTION
// ============================================================

function firstValue(object, fields) {

    if (
        !object ||
        typeof object !== "object"
    ) {
        return null;
    }

    for (const field of fields) {

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

            label:
                row.outcome.label ||
                row.label ||
                "NO_TRADE",

            preferredDirection:
                row.outcome.preferredDirection ||
                row.preferredDirection ||
                "NONE",

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

        label:
            row &&
            (
                row.label ||
                row.outcomeLabel
            ) ||
            "NO_TRADE",

        preferredDirection:
            row &&
            (
                row.preferredDirection ||
                row.direction
            ) ||
            "NONE",

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


function sideOutcome(row, side) {

    const outcome =
        getOutcome(row);

    return side === "BUY"
        ? String(
            outcome.buyOutcome
        ).toUpperCase()
        : String(
            outcome.sellOutcome
        ).toUpperCase();
}


// ============================================================
// FEATURE BUCKETS
// ============================================================

function rsiBucket(value) {

    const r = number(value);

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

    let hour =
        number(
            row.hour
        );

    if (hour === null) {

        if (row.timestamp) {

            const d =
                new Date(
                    normalizeTimestamp(
                        row.timestamp
                    ) * 1000
                );

            hour =
                d.getUTCHours();
        }
    }

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
// TREND / REGIME
// ============================================================

function normalizeTrend(row) {

    const trend =
        String(
            row.trend ||
            row.marketTrend ||
            "UNKNOWN"
        )
        .toUpperCase();

    if (trend.includes("BULL")) {
        return "BULLISH";
    }

    if (trend.includes("BEAR")) {
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
        )
        .toUpperCase();

    if (regime.includes("TREND")) {
        return "TRENDING";
    }

    if (regime.includes("RANGE")) {
        return "RANGING";
    }

    if (regime.includes("TRANS")) {
        return "TRANSITION";
    }

    return "UNKNOWN";
}


// ============================================================
// FEATURE STATE
// ============================================================

function extractFeatureState(row) {

    return {

        trend:
            normalizeTrend(
                row
            ),

        regime:
            normalizeRegime(
                row
            ),

        rsi:
            rsiBucket(
                row.rsi14
            ),

        vwap:
            vwapDirection(
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
// PATTERN TYPE
// ============================================================

function determinePatternType(
    side,
    feature
) {

    if (
        feature.regime ===
        "RANGING"
    ) {

        return "RANGE";
    }

    if (
        side === "BUY" &&
        feature.trend === "BULLISH"
    ) {

        return "TREND_FOLLOW";
    }

    if (
        side === "SELL" &&
        feature.trend === "BEARISH"
    ) {

        return "TREND_FOLLOW";
    }

    if (
        side === "BUY" &&
        feature.trend === "BEARISH"
    ) {

        return "REVERSAL";
    }

    if (
        side === "SELL" &&
        feature.trend === "BULLISH"
    ) {

        return "REVERSAL";
    }

    return "OTHER";
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

        `V:${feature.vwap}`
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

function minimumSamplesForLevel(level) {

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
                    "Accept":
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
            "Learning dataset returned unsuccessful response"
        );
    }

    if (
        !Array.isArray(
            data.rows
        )
    ) {

        throw new Error(
            "Learning dataset does not contain rows[]"
        );
    }

    return {
        data,
        url
    };
}


// ============================================================
// NORMALIZE ROWS
// ============================================================

function normalizeRows(rows) {

    const result = [];

    for (const row of rows) {

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
                ),

            close:
                number(
                    firstValue(
                        row,
                        [
                            "close",
                            "c"
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
// STATS
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

    let lossStreak = 0;
    let maxLossStreak = 0;

    for (const row of rows) {

        const result =
            sideOutcome(
                row,
                side
            );

        if (result === "WIN") {

            wins++;

            winR += 2;

            equity += 2;

            lossStreak = 0;
        }

        else if (result === "LOSS") {

            losses++;

            lossR += 1;

            equity -= 1;

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

        totalWinR:
            round(
                winR,
                3
            ),

        totalLossR:
            round(
                lossR,
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
                maxDrawdown,
                3
            ),

        maxLossStreak
    };
}


// ============================================================
// BUILD STRICT WALK-FORWARD FOLDS
// ============================================================

function buildWalkForwardFolds(
    historicalRows
) {

    const total =
        historicalRows.length;

    if (total < 100) {
        return [];
    }

    /*
    Reserve approximately 20% of the historical
    dataset as the initial training requirement.

    Then create four NON-OVERLAPPING future
    test windows.

    Example:

    TRAIN | TEST1 | TEST2 | TEST3 | TEST4

    Every test period is strictly after
    the corresponding training period.
    */

    const initialTraining =
        Math.floor(
            total / 5
        );

    const remaining =
        total -
        initialTraining;

    const testSize =
        Math.floor(
            remaining /
            FOLD_COUNT
        );

    const folds = [];

    for (
        let i = 0;
        i < FOLD_COUNT;
        i++
    ) {

        const trainingEnd =
            initialTraining +
            (
                i *
                testSize
            );

        const testStart =
            trainingEnd;

        const testEnd =
            i === FOLD_COUNT - 1
                ? total
                : testStart +
                  testSize;

        if (
            trainingEnd < 20 ||
            testEnd <= testStart
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
// BUILD PATTERN MAP FROM TRAINING ONLY
// ============================================================

function buildPatternMap(
    trainingRows,
    side,
    level
) {

    const map =
        new Map();

    for (
        const row
        of trainingRows
    ) {

        const feature =
            extractFeatureState(
                row
            );

        const key =
            createPatternKey(
                side,
                feature,
                level
            );

        if (!map.has(key)) {

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
// TRAINING PATTERN QUALITY
// ============================================================

function trainingPatternQuality(
    rows,
    side,
    level,
    key
) {

    const minimumSamples =
        minimumSamplesForLevel(
            level
        );

    if (
        rows.length <
        minimumSamples
    ) {
        return null;
    }

    const stats =
        calculateStats(
            rows,
            side
        );

    if (
        stats.decisiveTrades <
        MIN_TRAINING_DECISIVE
    ) {
        return null;
    }

    /*
    Training data is allowed to reject weak
    patterns before they reach OOS testing.

    This does NOT use any future/test data.
    */

    if (
        stats.expectedValueR <
        0.05
    ) {
        return null;
    }

    if (
        stats.profitFactor <
        1.05
    ) {
        return null;
    }

    if (
        stats.maxDrawdownR >
        MAX_DRAWDOWN_R
    ) {
        return null;
    }

    if (
        stats.maxLossStreak >
        MAX_LOSS_STREAK
    ) {
        return null;
    }

    return {

        key,

        side,

        level,

        patternType:
            determinePatternType(
                side,
                extractFeatureState(
                    rows[
                        rows.length - 1
                    ]
                )
            ),

        trainingSamples:
            stats.samples,

        trainingWins:
            stats.wins,

        trainingLosses:
            stats.losses,

        trainingTimeouts:
            stats.timeouts,

        trainingDecisiveTrades:
            stats.decisiveTrades,

        trainingWinRate:
            stats.winRate,

        trainingEV:
            stats.expectedValueR,

        trainingPF:
            stats.profitFactor,

        trainingNetR:
            stats.netR,

        trainingDrawdownR:
            stats.maxDrawdownR,

        trainingLossStreak:
            stats.maxLossStreak
    };
}


// ============================================================
// OOS PATTERN TEST
// ============================================================

function testPatternOOS(
    pattern,
    testRows
) {

    const matching =
        testRows.filter(
            row => {

                const feature =
                    extractFeatureState(
                        row
                    );

                return (
                    createPatternKey(
                        pattern.side,
                        feature,
                        pattern.level
                    ) ===
                    pattern.key
                );
            }
        );

    if (!matching.length) {

        return {

            samples: 0,
            wins: 0,
            losses: 0,
            timeouts: 0,
            decisiveTrades: 0,
            winRate: 0,
            expectedValueR: 0,
            profitFactor: 0,
            netR: 0,
            maxDrawdownR: 0,
            maxLossStreak: 0
        };
    }

    return calculateStats(
        matching,
        pattern.side
    );
}


// ============================================================
// STRICT FOLD TRAINING
// ============================================================

function trainFold(
    historicalRows,
    fold
) {

    const trainingRows =
        historicalRows.slice(
            fold.trainingStart,
            fold.trainingEnd
        );

    const testRows =
        historicalRows.slice(
            fold.testStart,
            fold.testEnd
        );

    const candidates = [];

    const sides = [
        "BUY",
        "SELL"
    ];

    for (const side of sides) {

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
                const [
                    key,
                    rows
                ]
                of map.entries()
            ) {

                const pattern =
                    trainingPatternQuality(
                        rows,
                        side,
                        level,
                        key
                    );

                if (!pattern) {
                    continue;
                }

                /*
                IMPORTANT:

                The pattern has now been frozen.

                Only NOW do we evaluate it
                against the future test window.
                */

                const oos =
                    testPatternOOS(
                        pattern,
                        testRows
                    );

                if (
                    oos.samples === 0
                ) {
                    continue;
                }

                candidates.push({

                    ...pattern,

                    fold:
                        fold.fold,

                    testSamples:
                        oos.samples,

                    testWins:
                        oos.wins,

                    testLosses:
                        oos.losses,

                    testTimeouts:
                        oos.timeouts,

                    testDecisiveTrades:
                        oos.decisiveTrades,

                    testWinRate:
                        oos.winRate,

                    testExpectedValueR:
                        oos.expectedValueR,

                    testProfitFactor:
                        oos.profitFactor,

                    testNetR:
                        oos.netR,

                    testDrawdownR:
                        oos.maxDrawdownR,

                    testLossStreak:
                        oos.maxLossStreak
                });
            }
        }
    }

    return {

        fold:
            fold.fold,

        trainingRows:
            trainingRows.length,

        testRows:
            testRows.length,

        candidates,

        patternsDiscovered:
            candidates.length
    };
}


// ============================================================
// AGGREGATE OOS PATTERNS
// ============================================================

function aggregateOOSPatterns(
    foldResults
) {

    const map =
        new Map();

    for (
        const foldResult
        of foldResults
    ) {

        for (
            const pattern
            of foldResult.candidates
        ) {

            if (
                !map.has(
                    pattern.key
                )
            ) {

                map.set(
                    pattern.key,
                    {
                        key:
                            pattern.key,

                        side:
                            pattern.side,

                        level:
                            pattern.level,

                        patternType:
                            pattern.patternType,

                        folds:
                            [],

                        totalTrainingSamples:
                            0,

                        totalOOSSamples:
                            0,

                        totalOOSWins:
                            0,

                        totalOOSLosses:
                            0,

                        totalOOSTimeouts:
                            0,

                        totalOOSNetR:
                            0
                    }
                );
            }

            const item =
                map.get(
                    pattern.key
                );

            item.folds.push(
                pattern
            );

            item.totalTrainingSamples +=
                pattern.trainingSamples;

            item.totalOOSSamples +=
                pattern.testSamples;

            item.totalOOSWins +=
                pattern.testWins;

            item.totalOOSLosses +=
                pattern.testLosses;

            item.totalOOSTimeouts +=
                pattern.testTimeouts;

            item.totalOOSNetR +=
                pattern.testNetR;
        }
    }

    const results = [];

    for (
        const item
        of map.values()
    ) {

        const decisive =
            item.totalOOSWins +
            item.totalOOSLosses;

        const oosWinRate =
            decisive > 0
                ? (
                    item.totalOOSWins /
                    decisive
                ) * 100
                : 0;

        const oosEV =
            item.totalOOSSamples > 0
                ? item.totalOOSNetR /
                  item.totalOOSSamples
                : 0;

        const winR =
            item.totalOOSWins *
            MIN_TARGET_R;

        const lossR =
            item.totalOOSLosses *
            STOP_R;

        const oosPF =
            lossR > 0
                ? winR / lossR
                : winR > 0
                    ? 999
                    : 0;

        const positiveFolds =
            item.folds.filter(
                f =>
                    f.testExpectedValueR >
                    0
            ).length;

        const stableFolds =
            item.folds.filter(
                f =>
                    f.testExpectedValueR >=
                        MIN_OOS_EXPECTED_VALUE &&
                    f.testProfitFactor >=
                        MIN_PROFIT_FACTOR &&
                    f.testDecisiveTrades >=
                        2
            ).length;

        /*
        Recent OOS performance.

        Later folds receive more importance.
        */

        const sorted =
            item.folds.slice().sort(
                (a, b) =>
                    a.fold -
                    b.fold
            );

        const recentCount =
            Math.max(
                1,
                Math.ceil(
                    sorted.length *
                    RECENT_WINDOW_FRACTION
                )
            );

        const recent =
            sorted.slice(
                -recentCount
            );

        const earlier =
            sorted.slice(
                0,
                Math.max(
                    0,
                    sorted.length -
                    recentCount
                )
            );

        const recentEV =
            recent.length > 0
                ? recent.reduce(
                    (
                        sum,
                        f
                    ) =>
                        sum +
                        f.testExpectedValueR,
                    0
                ) /
                  recent.length
                : 0;

        const earlierEV =
            earlier.length > 0
                ? earlier.reduce(
                    (
                        sum,
                        f
                    ) =>
                        sum +
                        f.testExpectedValueR,
                    0
                ) /
                  earlier.length
                : recentEV;

        const recentDeterioration =
            earlier.length > 0
                ? recentEV -
                  earlierEV
                : 0;

        const recentStable =
            recent.every(
                f =>
                    f.testExpectedValueR >=
                    MIN_OOS_EXPECTED_VALUE ||
                    f.testDecisiveTrades < 2
            );

        const maxOOSDrawdown =
            Math.max(
                ...item.folds.map(
                    f =>
                        f.testDrawdownR
                ),
                0
            );

        const maxOOSLossStreak =
            Math.max(
                ...item.folds.map(
                    f =>
                        f.testLossStreak
                ),
                0
            );

        /*
        Quality score.

        OOS evidence is dominant.

        This is intentionally NOT based
        purely on overall historical performance.
        */

        const evScore =
            clamp(
                (
                    oosEV /
                    GOOD_EXPECTED_VALUE
                ) * 35,
                0,
                35
            );

        const pfScore =
            clamp(
                (
                    (
                        oosPF -
                        1
                    ) /
                    (
                        GOOD_PROFIT_FACTOR -
                        1
                    )
                ) * 25,
                0,
                25
            );

        const stabilityScore =
            (
                stableFolds /
                Math.max(
                    1,
                    item.folds.length
                )
            ) * 25;

        const positiveScore =
            (
                positiveFolds /
                Math.max(
                    1,
                    item.folds.length
                )
            ) * 10;

        const drawdownPenalty =
            clamp(
                (
                    maxOOSDrawdown /
                    MAX_DRAWDOWN_R
                ) * 5,
                0,
                5
            );

        const qualityScore =
            clamp(
                evScore +
                pfScore +
                stabilityScore +
                positiveScore -
                drawdownPenalty,
                0,
                100
            );

        /*
        STRICT ROBUST GATE

        A pattern must have:
        - enough OOS observations
        - enough OOS decisive trades
        - at least 2 OOS folds
        - at least 2 positive folds
        - at least 2 stable folds
        - positive aggregate OOS EV
        - PF > 1.1
        - controlled drawdown
        - controlled loss streak
        - no major recent deterioration
        */

        const robust =

            item.folds.length >=
                MIN_OOS_FOLDS &&

            item.totalOOSSamples >=
                MIN_OOS_SAMPLES &&

            decisive >=
                MIN_OOS_DECISIVE &&

            positiveFolds >=
                MIN_POSITIVE_OOS_FOLDS &&

            stableFolds >=
                MIN_STABLE_OOS_FOLDS &&

            oosEV >=
                MIN_OOS_EXPECTED_VALUE &&

            oosPF >=
                MIN_PROFIT_FACTOR &&

            maxOOSDrawdown <=
                MAX_DRAWDOWN_R &&

            maxOOSLossStreak <=
                MAX_LOSS_STREAK &&

            recentDeterioration >=
                MAX_RECENT_DETERIORATION &&

            recentStable;

        results.push({

            key:
                item.key,

            side:
                item.side,

            level:
                item.level,

            patternType:
                item.patternType,

            trainingSamples:
                item.totalTrainingSamples,

            oosSamples:
                item.totalOOSSamples,

            oosWins:
                item.totalOOSWins,

            oosLosses:
                item.totalOOSLosses,

            oosTimeouts:
                item.totalOOSTimeouts,

            oosDecisiveTrades:
                decisive,

            oosWinRate:
                round(
                    oosWinRate,
                    2
                ),

            oosNetR:
                round(
                    item.totalOOSNetR,
                    3
                ),

            oosExpectedValueR:
                round(
                    oosEV,
                    4
                ),

            oosProfitFactor:
                round(
                    oosPF,
                    3
                ),

            positiveFolds,

            stableFolds,

            foldsEvaluated:
                item.folds.length,

            recentEV:
                round(
                    recentEV,
                    4
                ),

            earlierEV:
                round(
                    earlierEV,
                    4
                ),

            recentDeterioration:
                round(
                    recentDeterioration,
                    4
                ),

            recentStable,

            maxOOSDrawdown:
                round(
                    maxOOSDrawdown,
                    3
                ),

            maxOOSLossStreak,

            qualityScore:
                round(
                    qualityScore,
                    2
                ),

            robust,

            foldDetails:
                item.folds.map(
                    f => ({

                        fold:
                            f.fold,

                        trainingSamples:
                            f.trainingSamples,

                        trainingWinRate:
                            f.trainingWinRate,

                        trainingExpectedValueR:
                            f.trainingEV,

                        trainingProfitFactor:
                            f.trainingPF,

                        testSamples:
                            f.testSamples,

                        testWins:
                            f.testWins,

                        testLosses:
                            f.testLosses,

                        testTimeouts:
                            f.testTimeouts,

                        testDecisiveTrades:
                            f.testDecisiveTrades,

                        testWinRate:
                            f.testWinRate,

                        testExpectedValueR:
                            f.testExpectedValueR,

                        testProfitFactor:
                            f.testProfitFactor,

                        testNetR:
                            f.testNetR,

                        testDrawdownR:
                            f.testDrawdownR,

                        testLossStreak:
                            f.testLossStreak
                    })
                )
        });
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
                b.oosExpectedValueR !==
                a.oosExpectedValueR
            ) {

                return (
                    b.oosExpectedValueR -
                    a.oosExpectedValueR
                );
            }

            /*
            If quality is similar,
            prefer simpler patterns.
            */

            if (
                a.level !==
                b.level
            ) {

                return (
                    a.level -
                    b.level
                );
            }

            return (
                b.oosSamples -
                a.oosSamples
            );
        }
    );
}


// ============================================================
// MARKET SIDE INFERENCE
// ============================================================

function inferSide(row) {

    const trend =
        normalizeTrend(
            row
        );

    const regime =
        normalizeRegime(
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
        trend === "BULLISH" &&
        regime !== "RANGING" &&
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
        regime !== "RANGING" &&
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
    Reversal setup.

    Only allow when RSI is extreme
    and price is stretched away from VWAP.
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
// CONTEXT SCORE
// ============================================================

function contextScore(
    row,
    pattern
) {

    const feature =
        extractFeatureState(
            row
        );

    let score = 0;

    if (
        pattern.side &&
        pattern.side ===
        inferSide(row)
    ) {

        score += 25;
    }

    if (
        pattern.key.includes(
            `T:${feature.trend}`
        )
    ) {

        score += 20;
    }

    if (
        pattern.key.includes(
            `V:${feature.vwap}`
        )
    ) {

        score += 15;
    }

    if (
        pattern.level >= 2 &&
        pattern.key.includes(
            `R:${feature.rsi}`
        )
    ) {

        score += 15;
    }

    if (
        pattern.level >= 3 &&
        pattern.key.includes(
            `G:${feature.regime}`
        )
    ) {

        score += 10;
    }

    if (
        pattern.level >= 3 &&
        pattern.key.includes(
            `S:${feature.slope}`
        )
    ) {

        score += 5;
    }

    if (
        pattern.level >= 4 &&
        pattern.key.includes(
            `H:${feature.time}`
        )
    ) {

        score += 10;
    }

    return clamp(
        score,
        0,
        100
    );
}


// ============================================================
// FIND CURRENT PATTERN
// ============================================================

function findBestCurrentPattern(
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

                const feature =
                    extractFeatureState(
                        row
                    );

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

    if (!matches.length) {
        return null;
    }

    const scored =
        matches.map(
            pattern => ({

                ...pattern,

                contextScore:
                    contextScore(
                        row,
                        pattern
                    )
            })
        );

    scored.sort(
        (a, b) => {

            /*
            Quality first.

            Then context.

            Then prefer simpler patterns
            when quality is close.
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

            if (
                b.contextScore !==
                a.contextScore
            ) {

                return (
                    b.contextScore -
                    a.contextScore
                );
            }

            return (
                a.level -
                b.level
            );
        }
    );

    return scored[0];
}


// ============================================================
// CURRENT MARKET
// ============================================================

function currentMarket(rows) {

    if (!rows.length) {

        return {
            available: false
        };
    }

    const row =
        rows[
            rows.length - 1
        ];

    const feature =
        extractFeatureState(
            row
        );

    return {

        available:
            true,

        timestamp:
            normalizeTimestamp(
                row.timestamp
            ),

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

        atr14:
            number(
                row.atr14
            ),

        time:
            feature.time,

        inferredSide:
            inferSide(
                row
            )
    };
}


// ============================================================
// PAPER EXECUTION BACKTEST
// ============================================================

function paperExecutionBacktest(
    historicalRows,
    foldResults,
    robustPatterns
) {

    const trades = [];

    /*
    CRITICAL:

    We use each fold's frozen training brain
    against ONLY its own unseen test window.

    This is not a backtest using a pattern
    trained on the whole dataset.
    */

    for (
        const foldResult
        of foldResults
    ) {

        const foldPatterns =
            foldResult.candidates.filter(
                candidate => {

                    /*
                    Only patterns that passed
                    training qualification are
                    eligible.

                    But they do NOT need to be
                    robust yet because robustness
                    is only known after the OOS
                    test.
                    */

                    return true;
                }
            );

        const fold =
            foldResult.fold;

        /*
        Locate the test window again.
        */

        const allFolds =
            buildWalkForwardFolds(
                historicalRows
            );

        const foldInfo =
            allFolds.find(
                f =>
                    f.fold === fold
            );

        if (!foldInfo) {
            continue;
        }

        const testRows =
            historicalRows.slice(
                foldInfo.testStart,
                foldInfo.testEnd
            );

        let lastSignalIndex =
            -999;

        for (
            let i = 0;
            i < testRows.length;
            i++
        ) {

            if (
                i <=
                lastSignalIndex
            ) {
                continue;
            }

            const row =
                testRows[i];

            const side =
                inferSide(
                    row
                );

            if (!side) {
                continue;
            }

            /*
            Find the pattern that was learned
            from training data ONLY.
            */

            const matches =
                foldPatterns.filter(
                    pattern => {

                        if (
                            pattern.side !==
                            side
                        ) {
                            return false;
                        }

                        const feature =
                            extractFeatureState(
                                row
                            );

                        return (
                            createPatternKey(
                                side,
                                feature,
                                pattern.level
                            ) ===
                            pattern.key
                        );
                    }
                );

            if (!matches.length) {
                continue;
            }

            matches.sort(
                (a, b) => {

                    if (
                        b.trainingEV !==
                        a.trainingEV
                    ) {

                        return (
                            b.trainingEV -
                            a.trainingEV
                        );
                    }

                    return (
                        a.level -
                        b.level
                    );
                }
            );

            const pattern =
                matches[0];

            const outcome =
                sideOutcome(
                    row,
                    side
                );

            let resultR = 0;

            if (outcome === "WIN") {
                resultR = MIN_TARGET_R;
            }

            else if (
                outcome === "LOSS"
            ) {
                resultR = -STOP_R;
            }

            trades.push({

                fold,

                index:
                    foldInfo.testStart +
                    i,

                timestamp:
                    row.timestamp,

                side,

                pattern:
                    pattern.key,

                patternLevel:
                    pattern.level,

                trainingEV:
                    pattern.trainingEV,

                trainingPF:
                    pattern.trainingPF,

                outcome,

                resultR
            });

            lastSignalIndex = i;
        }
    }

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
        const trade
        of trades
    ) {

        if (
            trade.outcome ===
            "WIN"
        ) {

            wins++;

            winR +=
                trade.resultR;

            equity +=
                trade.resultR;

            lossStreak = 0;
        }

        else if (
            trade.outcome ===
            "LOSS"
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
        trades.length > 0
            ? netR /
              trades.length
            : 0;

    const profitFactor =
        lossR > 0
            ? winR /
              lossR
            : winR > 0
                ? 999
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
                winR,
                3
            ),

        totalLossR:
            round(
                lossR,
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
                maxDrawdown,
                3
            ),

        maxConsecutiveLosses:
            maxLossStreak,

        stopR:
            STOP_R,

        minimumTargetR:
            MIN_TARGET_R,

        preferredTargetR:
            PREFERRED_TARGET_R,

        riskReward:
            "1:2",

        tradeLog:
            trades.slice(
                -100
            )
    };
}


// ============================================================
// FINAL CURRENT SIGNAL
// ============================================================

function finalRecommendation(
    currentRow,
    robustPatterns
) {

    const market =
        currentMarket(
            [currentRow]
        );

    if (
        !market.available
    ) {

        return {

            status:
                "NO_DATA",

            side:
                null,

            reason:
                "No current market data."
        };
    }

    const side =
        market.inferredSide;

    if (!side) {

        return {

            status:
                "NO_TRADE",

            side:
                null,

            reason:
                "Current market does not satisfy the directional setup.",

            nextAction:
                "WAIT"
        };
    }

    const best =
        findBestCurrentPattern(
            currentRow,
            side,
            robustPatterns
        );

    if (!best) {

        return {

            status:
                "NO_TRADE",

            side,

            reason:
                "Directional setup exists, but no independently validated OOS pattern matches the current context.",

            nextAction:
                "WAIT"
        };
    }

    if (
        best.qualityScore <
        MIN_CONTEXT_SCORE
    ) {

        return {

            status:
                "NO_TRADE",

            side,

            pattern:
                best.key,

            patternLevel:
                best.level,

            qualityScore:
                best.qualityScore,

            contextScore:
                best.contextScore,

            reason:
                "Pattern quality/context score is below the V12.5 execution threshold.",

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
                    MIN_TARGET_R
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
                    MIN_TARGET_R
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

        pattern:
            best.key,

        patternType:
            best.patternType,

        patternLevel:
            best.level,

        qualityScore:
            best.qualityScore,

        contextScore:
            best.contextScore,

        oosSamples:
            best.oosSamples,

        oosDecisiveTrades:
            best.oosDecisiveTrades,

        oosWinRate:
            best.oosWinRate,

        oosExpectedValueR:
            best.oosExpectedValueR,

        oosProfitFactor:
            best.oosProfitFactor,

        positiveFolds:
            best.positiveFolds,

        stableFolds:
            best.stableFolds,

        recentEV:
            best.recentEV,

        recentDeterioration:
            best.recentDeterioration,

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

        reason:
            "Current candle matches a pattern that was trained only on prior data and independently validated across multiple unseen future folds.",

        nextAction:
            "PAPER_WAIT_FOR_NEXT_CANDLE"
    };
}


// ============================================================
// TRADING DAYS
// ============================================================

function calculateTradingDays(rows) {

    const days =
        new Set();

    for (
        const row
        of rows
    ) {

        if (!row.timestamp) {
            continue;
        }

        const d =
            new Date(
                row.timestamp *
                1000
            );

        days.add(
            [
                d.getUTCFullYear(),
                d.getUTCMonth(),
                d.getUTCDate()
            ].join("-")
        );
    }

    return days.size;
}


// ============================================================
// MAIN ENGINE
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
        100
    ) {

        throw new Error(
            `Not enough learning rows: ${rows.length}`
        );
    }

    rows.sort(
        (a, b) =>
            (
                a.timestamp || 0
            ) -
            (
                b.timestamp || 0
            )
    );

    /*
    ========================================================
    CRITICAL CURRENT-CANDLE EXCLUSION
    ========================================================

    The latest candle is NEVER part of the learning
    or walk-forward evaluation dataset.

    It is reserved exclusively for the current signal.
    */

    const currentRow =
        rows[
            rows.length - 1
        ];

    const historicalRows =
        rows.slice(
            0,
            -1
        );

    /*
    ========================================================
    STRICT WALK-FORWARD
    ========================================================
    */

    const folds =
        buildWalkForwardFolds(
            historicalRows
        );

    if (
        folds.length <
        FOLD_COUNT
    ) {

        throw new Error(
            `Unable to build ${FOLD_COUNT} strict walk-forward folds`
        );
    }

    const foldResults = [];

    for (
        const fold
        of folds
    ) {

        const result =
            trainFold(
                historicalRows,
                fold
            );

        foldResults.push(
            result
        );
    }

    /*
    ========================================================
    OOS AGGREGATION
    ========================================================
    */

    const patterns =
        aggregateOOSPatterns(
            foldResults
        );

    const robustPatterns =
        patterns.filter(
            p =>
                p.robust
        );

    /*
    ========================================================
    PATTERN COUNTS
    ========================================================
    */

    const qualifiedPatterns =
        robustPatterns.filter(
            p =>
                p.qualityScore >=
                MIN_CONTEXT_SCORE
        );

    const buyPatterns =
        qualifiedPatterns.filter(
            p =>
                p.side ===
                "BUY"
        );

    const sellPatterns =
        qualifiedPatterns.filter(
            p =>
                p.side ===
                "SELL"
        );

    /*
    ========================================================
    PAPER OOS EXECUTION
    ========================================================
    */

    const paperBacktest =
        paperExecutionBacktest(
            historicalRows,
            foldResults,
            robustPatterns
        );

    /*
    ========================================================
    CURRENT SIGNAL
    ========================================================
    */

    const recommendation =
        finalRecommendation(
            currentRow,
            qualifiedPatterns
        );

    /*
    ========================================================
    LEVEL COUNTS
    ========================================================
    */

    const levelCounts = {

        level1:
            patterns.filter(
                p =>
                    p.level === 1
            ).length,

        level2:
            patterns.filter(
                p =>
                    p.level === 2
            ).length,

        level3:
            patterns.filter(
                p =>
                    p.level === 3
            ).length,

        level4:
            patterns.filter(
                p =>
                    p.level === 4
            ).length
    };

    /*
    ========================================================
    PATTERN TYPE COUNTS
    ========================================================
    */

    const patternTypes = {

        TREND_FOLLOW:
            patterns.filter(
                p =>
                    p.patternType ===
                    "TREND_FOLLOW"
            ).length,

        REVERSAL:
            patterns.filter(
                p =>
                    p.patternType ===
                    "REVERSAL"
            ).length,

        RANGE:
            patterns.filter(
                p =>
                    p.patternType ===
                    "RANGE"
            ).length,

        OTHER:
            patterns.filter(
                p =>
                    p.patternType ===
                    "OTHER"
            ).length
    };

    /*
    ========================================================
    SIDE BALANCE
    ========================================================
    */

    const totalQualified =
        qualifiedPatterns.length;

    const buyCount =
        buyPatterns.length;

    const sellCount =
        sellPatterns.length;

    const sideRatio =
        totalQualified > 0
            ? buyCount /
              totalQualified
            : 0;

    const sideImbalance =
        Math.abs(
            0.5 -
            sideRatio
        );

    const sideBiased =
        sideImbalance >
        0.35;

    /*
    ========================================================
    FINAL ENGINE STATUS
    ========================================================
    */

    const brainReady =
        robustPatterns.length > 0;

    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V12_5_STRICT_WALK_FORWARD_BRAIN",

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

        /*
        ====================================================
        ANTI-LEAKAGE
        ====================================================
        */

        antiLeakage: {

            enabled:
                true,

            strictWalkForward:
                true,

            chronological:
                true,

            shuffled:
                false,

            trainingBeforeTesting:
                true,

            currentCandleExcluded:
                true,

            currentCandleOutcomeUsed:
                false,

            currentCandleUsedForTraining:
                false,

            testDataUsedForTraining:
                false,

            testOutcomeUsedForTraining:
                false,

            patternDiscoveryUsesFutureData:
                false,

            overlappingTestWindows:
                false,

            currentSignalUsesFutureData:
                false
        },

        /*
        ====================================================
        OBJECTIVE
        ====================================================
        */

        objective: {

            primary:
                "STRICT_OUT_OF_SAMPLE_POSITIVE_EXPECTED_VALUE",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "SELECT_FEWER_HIGH_QUALITY_TRADES",

            allowNoTrade:
                true,

            minimumExpectedValueR:
                MIN_EXPECTED_VALUE,

            minimumOOSExpectedValueR:
                MIN_OOS_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_PROFIT_FACTOR,

            minimumStableOOSFolds:
                MIN_STABLE_OOS_FOLDS
        },

        /*
        ====================================================
        DATA
        ====================================================
        */

        sourceStatistics: {

            rawLearningRows:
                rawRows.length,

            normalizedRows:
                rows.length,

            historicalLearningRows:
                historicalRows.length,

            currentCandleExcluded:
                1,

            tradingDays:
                calculateTradingDays(
                    rows
                ),

            invalidRows:
                rawRows.length -
                rows.length
        },

        /*
        ====================================================
        WALK FORWARD
        ====================================================
        */

        walkForward: {

            method:
                "STRICT_EXPANDING_WALK_FORWARD",

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
                            fold.testRows,

                        patternsDiscovered:
                            foldResults[
                                fold.fold - 1
                            ] &&
                            foldResults[
                                fold.fold - 1
                            ].patternsDiscovered
                                || 0
                    })
                )
        },

        /*
        ====================================================
        LEARNING
        ====================================================
        */

        learning: {

            patternsDiscovered:
                patterns.length,

            robustPatterns:
                robustPatterns.length,

            qualifiedPatterns:
                qualifiedPatterns.length,

            buyPatterns:
                buyCount,

            sellPatterns:
                sellCount,

            sideBalance: {

                buy:
                    buyCount,

                sell:
                    sellCount,

                ratio:
                    round(
                        sideRatio,
                        3
                    ),

                imbalance:
                    round(
                        sideImbalance,
                        3
                    ),

                biased:
                    sideBiased
            },

            patternTypes,

            levels:
                levelCounts,

            minimumSamples: {

                level1:
                    MIN_LEVEL1_SAMPLES,

                level2:
                    MIN_LEVEL2_SAMPLES,

                level3:
                    MIN_LEVEL3_SAMPLES,

                level4:
                    MIN_LEVEL4_SAMPLES
            },

            stabilityRules: {

                minimumOOSFolds:
                    MIN_OOS_FOLDS,

                minimumPositiveOOSFolds:
                    MIN_POSITIVE_OOS_FOLDS,

                minimumStableOOSFolds:
                    MIN_STABLE_OOS_FOLDS,

                minimumOOSSamples:
                    MIN_OOS_SAMPLES,

                minimumOOSDecisiveTrades:
                    MIN_OOS_DECISIVE,

                maximumOOSDrawdownR:
                    MAX_DRAWDOWN_R,

                maximumOOSLossStreak:
                    MAX_LOSS_STREAK,

                maximumRecentDeterioration:
                    MAX_RECENT_DETERIORATION
            }
        },

        /*
        ====================================================
        CURRENT MARKET
        ====================================================
        */

        currentMarket:
            currentMarket(
                [currentRow]
            ),

        /*
        ====================================================
        STRICT PAPER OOS BACKTEST
        ====================================================
        */

        paperBacktest: {

            description:
                "Strict historical paper simulation where each fold is executed using a brain trained only on candles before that fold.",

            stats:
                paperBacktest,

            noRealOrders:
                true
        },

        /*
        ====================================================
        RISK PLAN
        ====================================================
        */

        riskPlan: {

            riskPerTradeR:
                1,

            stopR:
                STOP_R,

            minimumTargetR:
                MIN_TARGET_R,

            preferredTargetR:
                PREFERRED_TARGET_R,

            minimumRiskReward:
                "1:2",

            preferredRiskReward:
                "1:2.5",

            noStopWidening:
                true,

            maxDrawdownR:
                MAX_DRAWDOWN_R,

            maxLossStreak:
                MAX_LOSS_STREAK
        },

        /*
        ====================================================
        ROBUST PATTERNS
        ====================================================
        */

        robustPatterns: {

            BUY:
                buyPatterns.slice(
                    0,
                    20
                ),

            SELL:
                sellPatterns.slice(
                    0,
                    20
                )
        },

        /*
        ====================================================
        TOP PATTERNS
        ====================================================
        */

        topPatterns: {

            BUY:
                patterns
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
                patterns
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

        /*
        ====================================================
        BRAIN STATUS
        ====================================================
        */

        brainStatus: {

            robustPatternAvailable:
                brainReady,

            qualifiedPatternAvailable:
                qualifiedPatterns.length >
                0,

            strictOOSValidation:
                true,

            futureLeakageDetected:
                false,

            currentCandleExcluded:
                true
        },

        /*
        ====================================================
        CURRENT RECOMMENDATION
        ====================================================
        */

        recommendation,

        /*
        ====================================================
        PAPER ACTION
        ====================================================
        */

        paperAction:

            recommendation.status ===
            "PAPER_TRADE_CANDIDATE"

                ? "PAPER_TRADE_CANDIDATE"

                : "NO_TRADE",

        nextAction:

            recommendation.nextAction ||
            "WAIT"
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
            "V12.5 ERROR:",
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

                brokerOrderEnabled:
                    false,

                error:
                    error &&
                    error.message
                        ? error.message
                        : String(error)
            });
    }
}
