/*
TradeMind Pro
V12.3
STABLE WALK-FORWARD EDGE ENGINE

V12.2 achieved:
- True walk-forward testing
- Brain-gated paper execution
- Anti-leakage protection
- Generalized pattern learning
- 44 paper trades
- 12 wins
- 28 losses
- 4 timeouts
- Net approximately -0.52R

V12.3 objective:

1. Improve pattern stability
2. Detect pattern deterioration
3. Give more importance to recent training behaviour
4. Require genuine out-of-sample evidence
5. Compare generalized pattern levels
6. Prefer the simplest robust pattern
7. Reject unstable BUY/SELL patterns
8. Keep execution conservative

PAPER ONLY.
NO REAL ORDERS.
*/

// ============================================================
// VERSION
// ============================================================

const VERSION = "V12.3";

const MODE =
    "STABLE_WALK_FORWARD_BRAIN_ENGINE";

const INTERVAL = "5minute";
const INSTRUMENT = "NIFTY 50";

const REQUESTED_DAYS = 30;

// ============================================================
// RISK MODEL
// ============================================================

const STOP_R = 1.0;

const MIN_TARGET_R = 2.0;

const PREFERRED_TARGET_R = 2.5;

const MAX_HOLD_CANDLES = 12;

// ============================================================
// WALK FORWARD
// ============================================================

const FOLD_COUNT = 4;

const MIN_TRAINING_ROWS = 250;

const MIN_TEST_ROWS = 100;

// ============================================================
// PATTERN LEVELS
// ============================================================

const MIN_LEVEL1_SAMPLES = 20;

const MIN_LEVEL2_SAMPLES = 15;

const MIN_LEVEL3_SAMPLES = 12;

const MIN_LEVEL4_SAMPLES = 10;

// ============================================================
// QUALITY REQUIREMENTS
// ============================================================

const MIN_EXPECTED_VALUE = 0.10;

const GOOD_EXPECTED_VALUE = 0.20;

const MIN_PROFIT_FACTOR = 1.10;

const GOOD_PROFIT_FACTOR = 1.30;

const MIN_STABLE_FOLDS = 2;

const MIN_OOS_TRADES = 3;

const MIN_OOS_DECISIVE_TRADES = 2;

const MIN_PATTERN_QUALITY = 45;

// ============================================================
// STABILITY REQUIREMENTS
// ============================================================

const MAX_DRAWDOWN_R = 15;

const MAX_LOSS_STREAK = 8;

const MAX_RECENT_DRAWDOWN_R = 8;

const MAX_RECENT_DETERIORATION = 0.50;

const RECENT_WINDOW_FRACTION = 0.35;

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


function firstValue(
    object,
    fields
) {

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
// TIMESTAMP
// ============================================================

function normalizeTimestamp(value) {

    let ts =
        number(value);

    if (ts === null) {
        return null;
    }

    if (
        ts > 100000000000
    ) {

        ts =
            ts / 1000;
    }

    return Math.floor(ts);
}


// ============================================================
// OUTCOME
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


function sideOutcome(
    row,
    side
) {

    const outcome =
        getOutcome(row);

    return (
        side === "BUY"
            ? outcome.buyOutcome
            : outcome.sellOutcome
    );
}


// ============================================================
// FEATURE NORMALIZATION
// ============================================================

function normalizeTrend(row) {

    const value =
        String(
            row.trend ||
            row.marketTrend ||
            "UNKNOWN"
        ).toUpperCase();

    if (
        value.includes("BULL")
    ) {
        return "BULLISH";
    }

    if (
        value.includes("BEAR")
    ) {
        return "BEARISH";
    }

    if (
        value.includes("SIDE") ||
        value.includes("RANGE")
    ) {
        return "RANGING";
    }

    return "UNKNOWN";
}


function normalizeRegime(row) {

    const value =
        String(
            row.regime ||
            "UNKNOWN"
        ).toUpperCase();

    if (
        value.includes("TREND")
    ) {
        return "TRENDING";
    }

    if (
        value.includes("RANGE")
    ) {
        return "RANGING";
    }

    if (
        value.includes("TRANS")
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

    const close =
        number(
            row.close
        );

    const vwap =
        number(
            row.vwap
        );

    if (
        close === null ||
        vwap === null
    ) {

        return "UNKNOWN";
    }

    if (
        close > vwap
    ) {
        return "ABOVE";
    }

    if (
        close < vwap
    ) {
        return "BELOW";
    }

    return "NEAR";
}


function slopeBucket(value) {

    const x =
        Math.abs(
            number(
                value,
                0
            )
        );

    if (x < 0.10) return "FLAT";
    if (x < 0.25) return "WEAK";
    if (x < 0.50) return "MODERATE";
    if (x < 0.75) return "STRONG";

    return "VERY_STRONG";
}


function timeBucket(row) {

    const hour =
        number(
            row.hour
        );

    if (hour === null) {

        if (
            row.timestamp
        ) {

            const date =
                new Date(
                    row.timestamp *
                    1000
                );

            const utcHour =
                date.getUTCHours();

            if (
                utcHour < 10
            ) {
                return "OPEN";
            }

            if (
                utcHour < 11
            ) {
                return "MORNING";
            }

            if (
                utcHour < 13
            ) {
                return "MIDDAY";
            }

            if (
                utcHour < 14
            ) {
                return "AFTERNOON";
            }

            return "CLOSE";
        }

        return "UNKNOWN";
    }

    if (hour < 10) return "OPEN";
    if (hour < 11) return "MORNING";
    if (hour < 13) return "MIDDAY";
    if (hour < 14) return "AFTERNOON";

    return "CLOSE";
}


function extractFeatures(row) {

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
// PATTERN KEY
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

    if (
        level >= 2
    ) {

        parts.push(
            `R:${feature.rsi}`
        );
    }

    if (
        level >= 3
    ) {

        parts.push(
            `G:${feature.regime}`,
            `S:${feature.slope}`
        );
    }

    if (
        level >= 4
    ) {

        parts.push(
            `H:${feature.time}`
        );
    }

    return parts.join("|");
}


function minimumSamples(
    level
) {

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
// DATASET
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

    if (
        !response.ok
    ) {

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

    return data;
}


// ============================================================
// NORMALIZE DATA
// ============================================================

function normalizeRows(rows) {

    const output = [];

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
                        "time"
                    ]
                )
            );

        output.push({

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

    output.sort(
        (a, b) =>
            (
                a.timestamp || 0
            ) -
            (
                b.timestamp || 0
            )
    );

    return output;
}


// ============================================================
// TRADE STATISTICS
// ============================================================

function stats(
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

    let totalWinR = 0;

    let totalLossR = 0;

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

            totalWinR += 2;

            equity += 2;

            lossStreak = 0;

        }

        else if (
            outcome === "LOSS"
        ) {

            losses++;

            totalLossR += 1;

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

    const samples =
        rows.length;

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

    const netR =
        totalWinR -
        totalLossR;

    const ev =
        samples > 0
            ? netR /
              samples
            : 0;

    const pf =
        totalLossR > 0
            ? totalWinR /
              totalLossR
            : totalWinR > 0
                ? 999
                : 0;

    return {

        samples,

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
                totalWinR,
                2
            ),

        totalLossR:
            round(
                totalLossR,
                2
            ),

        netR:
            round(
                netR,
                3
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

        maxLossStreak
    };
}


// ============================================================
// RECENT STABILITY
// ============================================================

function recentStats(
    rows,
    side
) {

    if (
        !rows.length
    ) {

        return stats(
            [],
            side
        );
    }

    const size =
        Math.max(
            5,
            Math.floor(
                rows.length *
                RECENT_WINDOW_FRACTION
            )
        );

    const recent =
        rows.slice(
            -size
        );

    return stats(
        recent,
        side
    );
}


// ============================================================
// BUILD EXPANDING FOLDS
// ============================================================

function buildFolds(
    total
) {

    const folds = [];

    if (
        total <
        (
            MIN_TRAINING_ROWS +
            MIN_TEST_ROWS
        )
    ) {

        return folds;
    }

    const testSize =
        Math.max(
            MIN_TEST_ROWS,
            Math.floor(
                (
                    total -
                    MIN_TRAINING_ROWS
                ) /
                FOLD_COUNT
            )
        );

    for (
        let i = 0;
        i < FOLD_COUNT;
        i++
    ) {

        const testStart =
            MIN_TRAINING_ROWS +
            (
                i *
                testSize
            );

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

            trainingEnd:
                testStart,

            testStart,

            testEnd,

            trainingRows:
                testStart,

            testRows:
                testEnd -
                testStart
        });
    }

    return folds;
}


// ============================================================
// PATTERN MAP
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
            extractFeatures(
                row
            );

        const key =
            patternKey(
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

        map
            .get(key)
            .push(row);
    }

    return map;
}


// ============================================================
// PATTERN QUALITY
// ============================================================

function calculateQuality(
    foldStats,
    overall,
    recent
) {

    if (
        !foldStats.length
    ) {

        return {

            score: 0,

            stableFolds: 0,

            positiveFolds: 0,

            averageEV: 0,

            averagePF: 0,

            averageWinRate: 0,

            averageDrawdown: 0,

            recentEV:
                recent.expectedValueR,

            deterioration: 1
        };
    }

    const positiveFolds =
        foldStats.filter(
            f =>
                f.testExpectedValueR >
                0
        ).length;

    const stableFolds =
        foldStats.filter(
            f =>
                f.testExpectedValueR >=
                    MIN_EXPECTED_VALUE &&
                f.testProfitFactor >=
                    MIN_PROFIT_FACTOR
        ).length;

    const averageEV =
        foldStats.reduce(
            (
                sum,
                f
            ) =>
                sum +
                f.testExpectedValueR,
            0
        ) /
        foldStats.length;

    const averagePF =
        foldStats.reduce(
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
        foldStats.length;

    const averageWinRate =
        foldStats.reduce(
            (
                sum,
                f
            ) =>
                sum +
                f.testWinRate,
            0
        ) /
        foldStats.length;

    const averageDrawdown =
        foldStats.reduce(
            (
                sum,
                f
            ) =>
                sum +
                f.testDrawdownR,
            0
        ) /
        foldStats.length;

    /*
    Recent deterioration:

    Compare recent training EV against
    earlier training EV.

    This does NOT use test data.

    Therefore it remains safe from
    test leakage.
    */

    const earlierRows =
        overall.samples >
        0
            ? Math.max(
                1,
                overall.samples -
                Math.max(
                    5,
                    Math.floor(
                        overall.samples *
                        RECENT_WINDOW_FRACTION
                    )
                )
            )
            : 0;

    const deterioration =
        overall.expectedValueR > 0
            ? clamp(
                (
                    overall.expectedValueR -
                    recent.expectedValueR
                ) /
                Math.max(
                    Math.abs(
                        overall.expectedValueR
                    ),
                    0.10
                ),
                -1,
                1
            )
            : (
                recent.expectedValueR <
                0
                    ? 1
                    : 0
            );

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
            stableFolds /
            foldStats.length
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
                MAX_DRAWDOWN_R
            ) *
            5,
            0,
            5
        );

    /*
    Stability penalty.

    A pattern whose recent behaviour is
    deteriorating loses quality.
    */

    const deteriorationPenalty =
        clamp(
            Math.max(
                0,
                deterioration
            ) *
            10,
            0,
            10
        );

    const score =
        evScore +
        pfScore +
        stabilityScore +
        winRateScore -
        drawdownPenalty -
        deteriorationPenalty;

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

        stableFolds,

        positiveFolds,

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

        recentEV:
            round(
                recent.expectedValueR,
                4
            ),

        recentPF:
            round(
                recent.profitFactor,
                3
            ),

        recentWinRate:
            round(
                recent.winRate,
                2
            ),

        deterioration:
            round(
                deterioration,
                3
            ),

        earlierTrainingRows:
            earlierRows
    };
}


// ============================================================
// EVALUATE PATTERN
// ============================================================

function evaluatePattern(
    key,
    side,
    level,
    trainingRows,
    fullRows,
    folds
) {

    const minSamples =
        minimumSamples(
            level
        );

    const trainingPatternRows =
        trainingRows.filter(
            row => {

                const feature =
                    extractFeatures(
                        row
                    );

                return (
                    patternKey(
                        side,
                        feature,
                        level
                    ) === key
                );
            }
        );

    if (
        trainingPatternRows.length <
        minSamples
    ) {

        return null;
    }

    const foldStats = [];

    for (
        const fold of folds
    ) {

        const trainSlice =
            fullRows.slice(
                fold.trainingStart,
                fold.trainingEnd
            );

        const testSlice =
            fullRows.slice(
                fold.testStart,
                fold.testEnd
            );

        const foldTraining =
            trainSlice.filter(
                row => {

                    const feature =
                        extractFeatures(
                            row
                        );

                    return (
                        patternKey(
                            side,
                            feature,
                            level
                        ) === key
                    );
                }
            );

        const foldTest =
            testSlice.filter(
                row => {

                    const feature =
                        extractFeatures(
                            row
                        );

                    return (
                        patternKey(
                            side,
                            feature,
                            level
                        ) === key
                    );
                }
            );

        /*
        The pattern must have existed
        BEFORE the test period.
        */

        if (
            foldTraining.length <
            Math.max(
                5,
                Math.floor(
                    minSamples /
                    2
                )
            )
        ) {

            continue;
        }

        if (
            foldTest.length === 0
        ) {

            continue;
        }

        const trainStats =
            stats(
                foldTraining,
                side
            );

        const testStats =
            stats(
                foldTest,
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
        foldStats.length <
        MIN_STABLE_FOLDS
    ) {

        return null;
    }

    const overall =
        stats(
            trainingPatternRows,
            side
        );

    const recent =
        recentStats(
            trainingPatternRows,
            side
        );

    /*
    Genuine minimum OOS evidence.
    */

    const oosSamples =
        foldStats.reduce(
            (
                sum,
                f
            ) =>
                sum +
                f.testSamples,
            0
        );

    const oosDecisive =
        foldStats.reduce(
            (
                sum,
                f
            ) =>
                sum +
                (
                    f.testWins +
                    f.testLosses
                ),
            0
        );

    const quality =
        calculateQuality(
            foldStats,
            overall,
            recent
        );

    /*
    V12.3 robustness gate.
    */

    const robust =
        overall.samples >=
            minSamples &&

        overall.decisiveTrades >=
            MIN_OOS_DECISIVE_TRADES &&

        oosSamples >=
            MIN_OOS_TRADES &&

        oosDecisive >=
            MIN_OOS_DECISIVE_TRADES &&

        quality.averageEV >=
            MIN_EXPECTED_VALUE &&

        quality.averagePF >=
            MIN_PROFIT_FACTOR &&

        quality.stableFolds >=
            MIN_STABLE_FOLDS &&

        quality.averageDrawdown <=
            MAX_DRAWDOWN_R &&

        recent.maxDrawdownR <=
            MAX_RECENT_DRAWDOWN_R &&

        recent.maxLossStreak <=
            MAX_LOSS_STREAK &&

        quality.deterioration <=
            MAX_RECENT_DETERIORATION;

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

        oosSamples,

        oosDecisiveTrades:
            oosDecisive,

        foldsEvaluated:
            foldStats.length,

        positiveFolds:
            quality.positiveFolds,

        stableFolds:
            quality.stableFolds,

        averageTestEV:
            quality.averageEV,

        averageTestPF:
            quality.averagePF,

        averageTestWinRate:
            quality.averageWinRate,

        averageTestDrawdown:
            quality.averageDrawdown,

        recentEV:
            quality.recentEV,

        recentPF:
            quality.recentPF,

        recentWinRate:
            quality.recentWinRate,

        deterioration:
            quality.deterioration,

        qualityScore:
            quality.score,

        robust,

        foldDetails:
            foldStats
    };
}


// ============================================================
// DISCOVERY
// ============================================================

function discoverPatterns(
    trainingRows,
    fullRows,
    folds
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
                const [
                    key
                ]
                of map
            ) {

                const result =
                    evaluatePattern(
                        key,
                        side,
                        level,
                        trainingRows,
                        fullRows,
                        folds
                    );

                if (
                    result
                ) {

                    results.push(
                        result
                    );
                }
            }
        }
    }

    return results.sort(
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

            /*
            V12.3:

            Quality first,
            then stability,
            then simplicity.
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
            statistical quality is similar.
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
                b.samples -
                a.samples
            );
        }
    );
}


// ============================================================
// SIDE INFERENCE
// ============================================================

function inferSide(row) {

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

    /*
    Controlled reversal conditions.
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
// MATCH PATTERN
// ============================================================

function matchingPatterns(
    row,
    side,
    patterns
) {

    const feature =
        extractFeatures(
            row
        );

    return patterns.filter(
        pattern => {

            if (
                pattern.side !==
                side
            ) {
                return false;
            }

            return (
                patternKey(
                    side,
                    feature,
                    pattern.level
                ) ===
                pattern.key
            );
        }
    );
}


// ============================================================
// SELECT PATTERN
// ============================================================

function selectBestPattern(
    row,
    side,
    patterns
) {

    const matches =
        matchingPatterns(
            row,
            side,
            patterns.filter(
                p =>
                    p.robust &&
                    p.qualityScore >=
                    MIN_PATTERN_QUALITY
            )
        );

    if (
        !matches.length
    ) {

        return null;
    }

    /*
    V12.3 preference:

    1. quality
    2. stability
    3. recent EV
    4. simplicity
    5. samples
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
                b.stableFolds !==
                a.stableFolds
            ) {

                return (
                    b.stableFolds -
                    a.stableFolds
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
                a.level !==
                b.level
            ) {

                return (
                    a.level -
                    b.level
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
// CURRENT MARKET
// ============================================================

function currentMarket(
    rows
) {

    if (
        !rows.length
    ) {

        return {
            available:
                false
        };
    }

    const row =
        rows[
            rows.length - 1
        ];

    const feature =
        extractFeatures(
            row
        );

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

        time:
            feature.time,

        inferredSide:
            inferSide(
                row
            )
    };
}


// ============================================================
// PAPER TRADE SIMULATION
// ============================================================

function simulateTrade(
    rows,
    signalIndex,
    side
) {

    const entryRow =
        rows[
            signalIndex
        ];

    const entry =
        number(
            entryRow.close
        );

    const atr =
        number(
            entryRow.atr14
        );

    if (
        entry === null ||
        atr === null ||
        atr <= 0
    ) {

        return {

            resultR:
                0,

            outcome:
                "INVALID",

            candlesHeld:
                0,

            exitPrice:
                entry
        };
    }

    const stop =
        side === "BUY"
            ? entry -
              atr
            : entry +
              atr;

    const target =
        side === "BUY"
            ? entry +
              (
                  atr *
                  MIN_TARGET_R
              )
            : entry -
              (
                  atr *
                  MIN_TARGET_R
              );

    const preferredTarget =
        side === "BUY"
            ? entry +
              (
                  atr *
                  PREFERRED_TARGET_R
              )
            : entry -
              (
                  atr *
                  PREFERRED_TARGET_R
              );

    const end =
        Math.min(
            rows.length - 1,
            signalIndex +
            MAX_HOLD_CANDLES
        );

    for (
        let i =
            signalIndex + 1;
        i <= end;
        i++
    ) {

        const row =
            rows[i];

        const high =
            number(
                row.high
            );

        const low =
            number(
                row.low
            );

        if (
            high === null ||
            low === null
        ) {
            continue;
        }

        /*
        Conservative rule:

        If both stop and target are
        touched in the same candle,
        assume STOP happened first.

        This prevents optimistic
        backtest bias.
        */

        if (
            side === "BUY"
        ) {

            const stopHit =
                low <= stop;

            const targetHit =
                high >= target;

            if (
                stopHit &&
                targetHit
            ) {

                return {

                    resultR:
                        -STOP_R,

                    outcome:
                        "LOSS",

                    candlesHeld:
                        i -
                        signalIndex,

                    exitPrice:
                        stop,

                    exitType:
                        "STOP"
                };
            }

            if (
                stopHit
            ) {

                return {

                    resultR:
                        -STOP_R,

                    outcome:
                        "LOSS",

                    candlesHeld:
                        i -
                        signalIndex,

                    exitPrice:
                        stop,

                    exitType:
                        "STOP"
                };
            }

            if (
                targetHit
            ) {

                return {

                    resultR:
                        MIN_TARGET_R,

                    outcome:
                        "WIN",

                    candlesHeld:
                        i -
                        signalIndex,

                    exitPrice:
                        target,

                    preferredTarget,

                    exitType:
                        "TARGET"
                };
            }

        }

        else {

            const stopHit =
                high >= stop;

            const targetHit =
                low <= target;

            if (
                stopHit &&
                targetHit
            ) {

                return {

                    resultR:
                        -STOP_R,

                    outcome:
                        "LOSS",

                    candlesHeld:
                        i -
                        signalIndex,

                    exitPrice:
                        stop,

                    exitType:
                        "STOP"
                };
            }

            if (
                stopHit
            ) {

                return {

                    resultR:
                        -STOP_R,

                    outcome:
                        "LOSS",

                    candlesHeld:
                        i -
                        signalIndex,

                    exitPrice:
                        stop,

                    exitType:
                        "STOP"
                };
            }

            if (
                targetHit
            ) {

                return {

                    resultR:
                        MIN_TARGET_R,

                    outcome:
                        "WIN",

                    candlesHeld:
                        i -
                        signalIndex,

                    exitPrice:
                        target,

                    preferredTarget,

                    exitType:
                        "TARGET"
                };
            }
        }
    }

    const exitRow =
        rows[end];

    const exitPrice =
        number(
            exitRow.close,
            entry
        );

    const move =
        side === "BUY"
            ? (
                exitPrice -
                entry
            ) / atr
            : (
                entry -
                exitPrice
            ) / atr;

    /*
    Timeout receives actual normalized
    mark-to-market R, but is capped.

    This avoids pretending every timeout
    is exactly zero.
    */

    const timeoutR =
        clamp(
            move,
            -STOP_R,
            MIN_TARGET_R
        );

    return {

        resultR:
            round(
                timeoutR,
                4
            ),

        outcome:
            "TIMEOUT",

        candlesHeld:
            end -
            signalIndex,

        exitPrice,

        exitType:
            "TIMEOUT"
    };
}


// ============================================================
// PAPER EXECUTION BACKTEST
// ============================================================

function paperExecution(
    rows,
    folds
) {

    const allTrades = [];

    const foldResults = [];

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

        /*
        CRITICAL:

        Patterns are learned ONLY from
        the training section of this fold.

        The test section is never used
        for pattern selection.
        */

        const trainingFolds =
            buildLocalTrainingFolds(
                trainingRows
            );

        const patterns =
            discoverPatterns(
                trainingRows,
                trainingRows,
                trainingFolds
            );

        const robust =
            patterns.filter(
                p =>
                    p.robust &&
                    p.qualityScore >=
                    MIN_PATTERN_QUALITY
            );

        const foldTrades = [];

        let localIndex = 0;

        while (
            localIndex <
            testRows.length
        ) {

            const row =
                testRows[
                    localIndex
                ];

            const side =
                inferSide(
                    row
                );

            if (!side) {

                localIndex++;

                continue;
            }

            const pattern =
                selectBestPattern(
                    row,
                    side,
                    robust
                );

            if (!pattern) {

                localIndex++;

                continue;
            }

            /*
            Translate local test index
            back to global dataset index.
            */

            const globalIndex =
                fold.testStart +
                localIndex;

            const futureRows =
                rows.slice(
                    0
                );

            const result =
                simulateTrade(
                    futureRows,
                    globalIndex,
                    side
                );

            const trade = {

                fold:
                    fold.fold,

                signalIndex:
                    globalIndex,

                timestamp:
                    row.timestamp,

                side,

                pattern:
                    pattern.key,

                patternLevel:
                    pattern.level,

                patternQuality:
                    pattern.qualityScore,

                patternEV:
                    pattern.averageTestEV,

                patternPF:
                    pattern.averageTestPF,

                entry:
                    number(
                        row.close
                    ),

                stop:
                    side === "BUY"
                        ? round(
                            row.close -
                            number(
                                row.atr14,
                                0
                            ),
                            2
                        )
                        : round(
                            row.close +
                            number(
                                row.atr14,
                                0
                            ),
                            2
                        ),

                target:
                    side === "BUY"
                        ? round(
                            row.close +
                            (
                                number(
                                    row.atr14,
                                    0
                                ) *
                                MIN_TARGET_R
                            ),
                            2
                        )
                        : round(
                            row.close -
                            (
                                number(
                                    row.atr14,
                                    0
                                ) *
                                MIN_TARGET_R
                            ),
                            2
                        ),

                resultR:
                    result.resultR,

                outcome:
                    result.outcome,

                exitType:
                    result.exitType,

                exitPrice:
                    result.exitPrice,

                candlesHeld:
                    result.candlesHeld
            };

            foldTrades.push(
                trade
            );

            allTrades.push(
                trade
            );

            /*
            Prevent overlapping trades.

            We advance beyond the simulated
            holding period.
            */

            localIndex +=
                Math.max(
                    1,
                    result.candlesHeld
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
                robust.length,

            trades:
                foldTrades.length,

            wins:
                foldTrades.filter(
                    t =>
                        t.outcome ===
                        "WIN"
                ).length,

            losses:
                foldTrades.filter(
                    t =>
                        t.outcome ===
                        "LOSS"
                ).length,

            timeouts:
                foldTrades.filter(
                    t =>
                        t.outcome ===
                        "TIMEOUT"
                ).length,

            tradeResults:
                foldTrades.map(
                    t =>
                        t.resultR
                )
        });
    }

    return {

        foldResults,

        trades:
            allTrades
    };
}


// ============================================================
// LOCAL FOLDS
// ============================================================

function buildLocalTrainingFolds(
    total
) {

    if (
        total <
        200
    ) {

        return [
            {
                fold:
                    1,

                trainingStart:
                    0,

                trainingEnd:
                    total,

                testStart:
                    0,

                testEnd:
                    total
            }
        ];
    }

    const folds = [];

    const testSize =
        Math.max(
            50,
            Math.floor(
                total /
                5
            )
        );

    for (
        let i = 0;
        i < 4;
        i++
    ) {

        const testStart =
            Math.floor(
                total *
                (
                    (
                        i + 1
                    ) /
                    5
                )
            );

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

            trainingEnd:
                testStart,

            testStart,

            testEnd
        });
    }

    return folds;
}


// ============================================================
// EXECUTION STATISTICS
// ============================================================

function executionStats(
    trades
) {

    let wins = 0;

    let losses = 0;

    let timeouts = 0;

    let netR = 0;

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

        const r =
            number(
                trade.resultR,
                0
            );

        netR += r;

        equity += r;

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

        if (
            trade.outcome ===
            "WIN"
        ) {

            wins++;

            winR +=
                Math.max(
                    0,
                    r
                );

            lossStreak = 0;
        }

        else if (
            trade.outcome ===
            "LOSS"
        ) {

            losses++;

            lossR +=
                Math.abs(
                    Math.min(
                        0,
                        r
                    )
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

            lossStreak = 0;
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

        startingCapital:
            100000,

        simulatedEquity:
            round(
                100000 +
                netR,
                3
            )
    };
}


// ============================================================
// CURRENT SIGNAL
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
                "NO_DATA"
        };
    }

    /*
    VERY IMPORTANT:

    Current candle is NEVER used to
    train the pattern.

    We train on rows before the latest
    candle and evaluate the latest candle
    only as a new signal.
    */

    const current =
        rows[
            rows.length - 1
        ];

    const training =
        rows.slice(
            0,
            rows.length - 1
        );

    const folds =
        buildFolds(
            training.length
        );

    const patterns =
        discoverPatterns(
            training,
            training,
            folds
        );

    const robust =
        patterns.filter(
            p =>
                p.robust &&
                p.qualityScore >=
                MIN_PATTERN_QUALITY
        );

    const side =
        inferSide(
            current
        );

    if (!side) {

        return {

            status:
                "NO_TRADE",

            side:
                null,

            reason:
                "Current market does not satisfy the directional setup."
        };
    }

    const best =
        selectBestPattern(
            current,
            side,
            robust
        );

    if (!best) {

        return {

            status:
                "NO_EDGE",

            side,

            reason:
                "Directional setup exists, but no stable out-of-sample pattern matches it."
        };
    }

    const close =
        number(
            current.close
        );

    const atr =
        number(
            current.atr14
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

        patternLevel:
            best.level,

        patternQuality:
            best.qualityScore,

        patternSamples:
            best.samples,

        patternEV:
            best.averageTestEV,

        patternPF:
            best.averageTestPF,

        recentEV:
            best.recentEV,

        deterioration:
            best.deterioration,

        stableFolds:
            best.stableFolds,

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
            "Current candle matches a stable generalized pattern learned exclusively from prior data."
    };
}


// ============================================================
// MAIN ENGINE
// ============================================================

async function runEngine(req) {

    const data =
        await fetchDataset(
            req
        );

    const rawRows =
        data.rows;

    const rows =
        normalizeRows(
            rawRows
        );

    if (
        rows.length <
        MIN_TRAINING_ROWS
    ) {

        throw new Error(
            `Not enough learning rows: ${rows.length}`
        );
    }

    /*
    Remove final candle from training.
    */

    const trainingRows =
        rows.slice(
            0,
            rows.length - 1
        );

    const folds =
        buildFolds(
            trainingRows.length
        );

    if (
        folds.length < 2
    ) {

        throw new Error(
            "Unable to build sufficient walk-forward folds"
        );
    }

    /*
    Discover patterns using ONLY training data.
    */

    const patterns =
        discoverPatterns(
            trainingRows,
            trainingRows,
            folds
        );

    const robustPatterns =
        patterns.filter(
            p =>
                p.robust
        );

    const qualifiedPatterns =
        robustPatterns.filter(
            p =>
                p.qualityScore >=
                MIN_PATTERN_QUALITY
        );

    /*
    True walk-forward paper execution.
    */

    const paper =
        paperExecution(
            rows,
            folds
        );

    const execution =
        executionStats(
            paper.trades
        );

    const market =
        currentMarket(
            rows
        );

    const signal =
        currentSignal(
            rows
        );

    /*
    Trading days.
    */

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

    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            MODE,

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

            testOutcomeUsedForTraining:
                false,

            patternSelectionUsesFutureData:
                false,

            currentSignalUsesFutureData:
                false,

            overlappingTradesPrevented:
                true,

            sameCandleStopTargetBias:
                "STOP_FIRST"
        },

        objective: {

            primary:
                "STABLE_POSITIVE_EXPECTED_VALUE",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "PREFER_SIMPLE_ROBUST_PATTERNS",

            recentStability:
                true,

            allowNoTrade:
                true,

            minimumExpectedValueR:
                MIN_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_PROFIT_FACTOR,

            minimumStableFolds:
                MIN_STABLE_FOLDS,

            minimumOOSSamples:
                MIN_OOS_TRADES,

            minimumOOSDecisiveTrades:
                MIN_OOS_DECISIVE_TRADES
        },

        sourceStatistics: {

            rawLearningRows:
                rawRows.length,

            normalizedRows:
                rows.length,

            trainingRows:
                trainingRows.length,

            candlesTested:
                rows.length,

            tradingDays:
                tradingDays.size,

            invalidRows:
                rawRows.length -
                rows.length
        },

        walkForward: {

            method:
                "TRUE_EXPANDING_WALK_FORWARD",

            chronological:
                true,

            shuffled:
                false,

            foldCount:
                folds.length,

            folds:
                folds.map(
                    fold => ({
                        fold:
                            fold.fold,

                        trainingRows:
                            fold.trainingRows,

                        testRows:
                            fold.testRows
                    })
                )
        },

        learning: {

            patternsDiscovered:
                patterns.length,

            robustPatterns:
                robustPatterns.length,

            qualifiedPatterns:
                qualifiedPatterns.length,

            buyPatterns:
                qualifiedPatterns.filter(
                    p =>
                        p.side === "BUY"
                ).length,

            sellPatterns:
                qualifiedPatterns.filter(
                    p =>
                        p.side === "SELL"
                ).length,

            levels: {

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
            },

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

                recentWindowFraction:
                    RECENT_WINDOW_FRACTION,

                maxRecentDeterioration:
                    MAX_RECENT_DETERIORATION,

                maxRecentDrawdownR:
                    MAX_RECENT_DRAWDOWN_R,

                maxLossStreak:
                    MAX_LOSS_STREAK,

                preferSimplerPatterns:
                    true
            }
        },

        currentMarket:
            market,

        currentSignal:
            signal,

        paperExecution: {

            description:
                "True walk-forward historical paper execution using sequential candles.",

            stats:
                execution,

            foldResults:
                paper.foldResults,

            tradeLog:
                paper.trades.slice(
                    -100
                )
        },

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

            maxHoldCandles:
                MAX_HOLD_CANDLES,

            noStopWidening:
                true,

            maxDrawdownR:
                MAX_DRAWDOWN_R,

            maxLossStreak:
                MAX_LOSS_STREAK
        },

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

        robustPatterns: {

            BUY:
                qualifiedPatterns
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
                qualifiedPatterns
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

        learningGate: {

            status:
                signal.status ===
                "PAPER_TRADE_CANDIDATE"
                    ? "PASSED"
                    : "BLOCKED",

            qualityThreshold:
                MIN_PATTERN_QUALITY,

            minimumExpectedValueR:
                MIN_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_PROFIT_FACTOR,

            minimumStableFolds:
                MIN_STABLE_FOLDS,

            minimumOOSSamples:
                MIN_OOS_TRADES,

            minimumOOSDecisiveTrades:
                MIN_OOS_DECISIVE_TRADES,

            recentStabilityRequired:
                true,

            description:
                "Paper execution is permitted only when the current candle matches a stable pattern learned exclusively from prior data."
        },

        nextAction:
            signal.status ===
            "PAPER_TRADE_CANDIDATE"

                ? "PAPER_TRADE_READY"

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
            "V12.3 ERROR:",
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
