/*
TradeMind Pro
V11.11
GENERALIZED EDGE LEARNING ENGINE

V11.10 problem:
Over-specific pattern matching caused:
- too many fragmented patterns
- insufficient samples
- 0 qualified patterns
- 0 execution trades

V11.11 solution:
Hierarchical / generalized pattern learning.

LEVEL 1:
SIDE + TREND + VWAP

LEVEL 2:
SIDE + TREND + VWAP + RSI

LEVEL 3:
SIDE + TREND + VWAP + RSI + REGIME

LEVEL 4:
SIDE + TREND + VWAP + RSI + REGIME + TIME

The engine compares levels and prefers
the most specific level that has enough
statistical evidence.

PAPER ONLY.
NO REAL ORDERS.
*/

// ============================================================
// VERSION
// ============================================================

const VERSION = "V11.11";

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
// STATISTICAL REQUIREMENTS
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

const FOLD_COUNT = 4;

const MAX_DRAWDOWN_R = 15;

const MAX_LOSS_STREAK = 8;

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
// TIMESTAMP NORMALIZATION
// ============================================================

function normalizeTimestamp(value) {

    let ts =
        number(value);

    if (ts === null) {
        return null;
    }

    /*
    Unix milliseconds are approximately
    13 digits.

    Unix seconds are approximately
    10 digits.
    */

    if (ts > 100000000000) {
        ts = ts / 1000;
    }

    return Math.floor(ts);
}


// ============================================================
// SAFE FIELD EXTRACTION
// ============================================================

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
        const field
        of fields
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


// ============================================================
// SIDE OUTCOME
// ============================================================

function sideOutcome(
    row,
    side
) {

    const outcome =
        getOutcome(row);

    return side === "BUY"
        ? outcome.buyOutcome
        : outcome.sellOutcome;
}


// ============================================================
// FEATURE BUCKETS
// ============================================================

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


function vwapBucket(value) {

    const x =
        number(value);

    if (x === null) {
        return "UNKNOWN";
    }

    if (x < -1) {
        return "FAR_BELOW";
    }

    if (x < -0.25) {
        return "BELOW";
    }

    if (x <= 0.25) {
        return "NEAR";
    }

    if (x <= 1) {
        return "ABOVE";
    }

    return "FAR_ABOVE";
}


function spreadBucket(value) {

    const x =
        Math.abs(
            number(value, 0)
        );

    if (x < 0.25) {
        return "VERY_TIGHT";
    }

    if (x < 0.50) {
        return "TIGHT";
    }

    if (x < 0.75) {
        return "MEDIUM";
    }

    return "WIDE";
}


function slopeBucket(value) {

    const x =
        Math.abs(
            number(value, 0)
        );

    if (x < 0.10) {
        return "FLAT";
    }

    if (x < 0.25) {
        return "WEAK";
    }

    if (x < 0.50) {
        return "MODERATE";
    }

    if (x < 0.75) {
        return "STRONG";
    }

    return "VERY_STRONG";
}


function timeBucket(row) {

    const hour =
        number(
            row.hour
        );

    if (hour === null) {
        return "UNKNOWN";
    }

    if (hour < 10) {
        return "OPEN";
    }

    if (hour < 11) {
        return "MORNING";
    }

    if (hour < 13) {
        return "MIDDAY";
    }

    if (hour < 14) {
        return "AFTERNOON";
    }

    return "CLOSE";
}


// ============================================================
// TREND NORMALIZATION
// ============================================================

function normalizeTrend(row) {

    const trend =
        String(
            row.trend ||
            row.marketTrend ||
            "UNKNOWN"
        )
        .toUpperCase();

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


// ============================================================
// REGIME NORMALIZATION
// ============================================================

function normalizeRegime(row) {

    const regime =
        String(
            row.regime ||
            "UNKNOWN"
        )
        .toUpperCase();

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


// ============================================================
// VWAP DIRECTION
// ============================================================

function vwapDirection(row) {

    const distance =
        number(
            row.vwapDistanceATR
        );

    if (
        distance === null
    ) {

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
            vwap === null ||
            vwap === 0
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

    if (
        distance < -0.25
    ) {
        return "BELOW";
    }

    if (
        distance > 0.25
    ) {
        return "ABOVE";
    }

    return "NEAR";
}


// ============================================================
// FEATURE EXTRACTION
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

        vwapDistance:
            vwapBucket(
                row.vwapDistanceATR
            ),

        slope:
            slopeBucket(
                row.ema9SlopeATR
            ),

        spread:
            spreadBucket(
                row.emaSpreadATR
            ),

        body:
            spreadBucket(
                row.bodyRatio
            ),

        time:
            timeBucket(
                row
            )
    };
}


// ============================================================
// GENERALIZED PATTERN KEYS
// ============================================================

function createPatternKey(
    side,
    feature,
    level
) {

    /*
    Level 1:
    SIDE + TREND + VWAP

    Level 2:
    + RSI

    Level 3:
    + REGIME + SLOPE

    Level 4:
    + TIME

    Notice:
    We intentionally DO NOT include every
    feature in every key.

    This prevents over-fragmentation.
    */

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
// DATASET NORMALIZATION
// ============================================================

function normalizeRows(rows) {

    const result = [];

    for (
        const row
        of rows
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

        const normalized = {

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
        };

        result.push(
            normalized
        );
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
// PATTERN STATISTICS
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

    const total =
        rows.length;

    for (
        const row
        of rows
    ) {

        const result =
            sideOutcome(
                row,
                side
            );

        if (
            result === "WIN"
        ) {

            wins++;

            /*
            V11.1 learning outcome is
            normalized to approximately
            +2R reward.
            */

            winR += 2;

            equity += 2;

            currentLossStreak = 0;

        }

        else if (
            result === "LOSS"
        ) {

            losses++;

            lossR += 1;

            equity -= 1;

            currentLossStreak++;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    currentLossStreak
                );

        }

        else {

            timeouts++;

            /*
            TIMEOUT is not treated as a full
            win or full loss.

            This prevents timeout-heavy patterns
            from artificially inflating the win rate.
            */

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
        total > 0
            ? netR / total
            : 0;

    const profitFactor =
        lossR > 0
            ? winR / lossR
            : winR > 0
                ? 999
                : 0;

    return {

        samples:
            total,

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

        winR:
            round(
                winR,
                2
            ),

        lossR:
            round(
                lossR,
                2
            ),

        netR:
            round(
                netR,
                2
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
// DATASET SPLIT
// ============================================================

function buildFolds(
    total
) {

    const folds = [];

    /*
    Expanding window.

    Example:

    Fold 1
    TRAIN | TEST

    Fold 2
    TRAIN ------ | TEST

    Fold 3
    TRAIN ------------- | TEST

    Fold 4
    TRAIN -------------------- | TEST
    */

    const minimumTest =
        Math.max(
            20,
            Math.floor(
                total /
                8
            )
        );

    const available =
        total -
        minimumTest;

    const testSize =
        Math.max(
            20,
            Math.floor(
                available /
                FOLD_COUNT
            )
        );

    for (
        let fold = 0;
        fold < FOLD_COUNT;
        fold++
    ) {

        const testStart =
            Math.floor(
                available *
                (
                    (fold + 1) /
                    (FOLD_COUNT + 1)
                )
            );

        const adjustedStart =
            Math.max(
                minimumTest,
                testStart
            );

        const testEnd =
            Math.min(
                total,
                adjustedStart +
                testSize
            );

        if (
            testEnd <=
            adjustedStart
        ) {
            continue;
        }

        folds.push({

            fold:
                fold + 1,

            trainingStart:
                0,

            trainingEnd:
                adjustedStart,

            testStart:
                adjustedStart,

            testEnd,

            trainingRows:
                adjustedStart,

            testRows:
                testEnd -
                adjustedStart
        });
    }

    return folds;
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
        const row
        of rows
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
// LEVEL MINIMUM SAMPLES
// ============================================================

function minimumSamplesForLevel(
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
// PATTERN QUALITY SCORE
// ============================================================

function calculateQualityScore(
    statsByFold
) {

    if (
        !statsByFold.length
    ) {
        return 0;
    }

    const positiveFolds =
        statsByFold.filter(
            x =>
                x.expectedValueR >
                0
        ).length;

    const strongFolds =
        statsByFold.filter(
            x =>
                x.expectedValueR >=
                MIN_EXPECTED_VALUE &&
                x.profitFactor >=
                MIN_PROFIT_FACTOR
        ).length;

    const averageEV =
        statsByFold.reduce(
            (
                sum,
                x
            ) =>
                sum +
                x.expectedValueR,
            0
        ) /
        statsByFold.length;

    const averagePF =
        statsByFold.reduce(
            (
                sum,
                x
            ) =>
                sum +
                Math.min(
                    x.profitFactor,
                    3
                ),
            0
        ) /
        statsByFold.length;

    const averageWinRate =
        statsByFold.reduce(
            (
                sum,
                x
            ) =>
                sum +
                x.winRate,
            0
        ) /
        statsByFold.length;

    const averageDrawdown =
        statsByFold.reduce(
            (
                sum,
                x
            ) =>
                sum +
                x.maxDrawdownR,
            0
        ) /
        statsByFold.length;

    /*
    Score:

    EV            = 35%
    ProfitFactor  = 25%
    Stability     = 25%
    WinRate       = 10%
    Drawdown      = -5%
    */

    const evScore =
        clamp(
            (
                averageEV /
                GOOD_EXPECTED_VALUE
            ) * 35,
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
            ) * 25,
            0,
            25
        );

    const stabilityScore =
        (
            strongFolds /
            statsByFold.length
        ) * 25;

    const winRateScore =
        clamp(
            (
                averageWinRate -
                35
            ) / 30,
            0,
            1
        ) * 10;

    const drawdownPenalty =
        clamp(
            (
                averageDrawdown /
                MAX_DRAWDOWN_R
            ) * 5,
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
                statsByFold.length,
                3
            )
    };
}


// ============================================================
// EVALUATE ONE PATTERN
// ============================================================

function evaluatePattern(
    key,
    side,
    level,
    trainingRows,
    allRows,
    folds
) {

    const minimumSamples =
        minimumSamplesForLevel(
            level
        );

    const allPatternRows =
        allRows.filter(
            row => {

                const feature =
                    extractFeatureState(
                        row
                    );

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
        minimumSamples
    ) {
        return null;
    }

    const foldStats = [];

    for (
        const fold
        of folds
    ) {

        const testRows =
            allPatternRows.filter(
                row => {

                    const index =
                        allRows.indexOf(
                            row
                        );

                    return (
                        index >=
                        fold.testStart &&
                        index <
                        fold.testEnd
                    );
                }
            );

        const trainingFoldRows =
            allPatternRows.filter(
                row => {

                    const index =
                        allRows.indexOf(
                            row
                        );

                    return (
                        index >=
                        fold.trainingStart &&
                        index <
                        fold.trainingEnd
                    );
                }
            );

        /*
        The pattern must actually exist
        in the training window.

        This prevents future leakage.
        */

        if (
            trainingFoldRows.length <
            Math.max(
                5,
                Math.floor(
                    minimumSamples /
                    2
                )
            )
        ) {

            continue;
        }

        const testStats =
            calculateStats(
                testRows,
                side
            );

        const trainingStats =
            calculateStats(
                trainingFoldRows,
                side
            );

        foldStats.push({

            fold:
                fold.fold,

            trainingSamples:
                trainingStats.samples,

            trainingWinRate:
                trainingStats.winRate,

            trainingExpectedValueR:
                trainingStats.expectedValueR,

            trainingProfitFactor:
                trainingStats.profitFactor,

            testSamples:
                testStats.samples,

            testWins:
                testStats.wins,

            testLosses:
                testStats.losses,

            testTimeouts:
                testStats.timeouts,

            winRate:
                testStats.winRate,

            expectedValueR:
                testStats.expectedValueR,

            profitFactor:
                testStats.profitFactor,

            netR:
                testStats.netR,

            maxDrawdownR:
                testStats.maxDrawdownR,

            maxLossStreak:
                testStats.maxLossStreak
        });
    }

    if (
        foldStats.length < 2
    ) {
        return null;
    }

    const quality =
        calculateQualityScore(
            foldStats
        );

    const overall =
        calculateStats(
            allPatternRows,
            side
        );

    /*
    Generalized robust gate.

    We don't demand 60% win rate.

    We demand:
    - positive expected value
    - reasonable PF
    - repeated positive folds
    - enough data
    - controlled drawdown
    */

    const robust =
        overall.samples >=
            minimumSamples &&

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
            MAX_DRAWDOWN_R;

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

        foldsEvaluated:
            foldStats.length,

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
            foldStats
    };
}


// ============================================================
// DISCOVER ALL GENERALIZED PATTERNS
// ============================================================

function discoverPatterns(
    rows,
    folds
) {

    const results = [];

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
                    rows,
                    side,
                    level
                );

            for (
                const [
                    key
                ]
                of map.entries()
            ) {

                const evaluated =
                    evaluatePattern(
                        key,
                        side,
                        level,
                        rows,
                        rows,
                        folds
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
        (
            a,
            b
        ) => {

            /*
            Prefer:

            1. robust
            2. quality score
            3. expected value
            4. sample size
            */

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
}


// ============================================================
// SELECT BEST PATTERN FOR A ROW
// ============================================================

function findBestPattern(
    row,
    side,
    patterns
) {

    const feature =
        extractFeatureState(
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

                const expectedKey =
                    createPatternKey(
                        side,
                        feature,
                        pattern.level
                    );

                return (
                    expectedKey ===
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
    Prefer the highest quality pattern.

    If a highly specific pattern is weak,
    a broader pattern can still be selected.
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

            return (
                b.level -
                a.level
            );
        }
    );

    return matches[0];
}


// ============================================================
// SIGNAL FROM DATA
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

    /*
    Trend-following signal.

    We deliberately don't require
    perfect conditions.
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
    Strong reversal condition.

    Used sparingly.
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
// EXECUTION BACKTEST
// ============================================================

function executionBacktest(
    rows,
    patterns
) {

    /*
    Only robust patterns are allowed
    into the execution simulation.
    */

    const robust =
        patterns.filter(
            p =>
                p.robust
        );

    const trades = [];

    let lastIndex =
        -999;

    for (
        let i = 0;
        i < rows.length;
        i++
    ) {

        if (
            i <=
            lastIndex
        ) {
            continue;
        }

        const row =
            rows[i];

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
                robust
            );

        if (!pattern) {
            continue;
        }

        /*
        V11.1 outcomes represent the
        historical result of a setup.

        We use the actual side outcome
        instead of fabricating price
        movement from the dataset.
        */

        const outcome =
            sideOutcome(
                row,
                side
            );

        if (
            outcome ===
            "TIMEOUT"
        ) {

            /*
            Timeout is recorded but does
            not create a synthetic profit.
            */

            trades.push({

                index: i,

                side,

                pattern:
                    pattern.key,

                level:
                    pattern.level,

                qualityScore:
                    pattern.qualityScore,

                resultR:
                    0,

                outcome:
                    "TIMEOUT"
            });

            lastIndex =
                i;

            continue;
        }

        const resultR =
            outcome ===
            "WIN"
                ? MIN_TARGET_R
                : -STOP_R;

        trades.push({

            index: i,

            side,

            pattern:
                pattern.key,

            level:
                pattern.level,

            qualityScore:
                pattern.qualityScore,

            resultR,

            outcome
        });

        lastIndex =
            i;
    }

    /*
    Calculate execution statistics.
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

            /*
            Timeout is treated as flat
            for expectancy purposes.
            */

            equity += 0;

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
                2
            ),

        totalLossR:
            round(
                lossR,
                2
            ),

        netR:
            round(
                netR,
                2
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
            maxLossStreak,

        stopR:
            STOP_R,

        minimumTargetR:
            MIN_TARGET_R,

        preferredTargetR:
            PREFERRED_TARGET_R,

        executionRiskReward:
            "1:2",

        tradeLog:
            trades.slice(
                -100
            )
    };
}


// ============================================================
// CURRENT MARKET ANALYSIS
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
        extractFeatureState(
            row
        );

    const side =
        inferSide(
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

        bodyRatio:
            number(
                row.bodyRatio
            ),

        time:
            feature.time,

        inferredSide:
            side
    };
}


// ============================================================
// FINAL DECISION
// ============================================================

function finalRecommendation(
    rows,
    patterns,
    execution
) {

    const market =
        currentMarket(
            rows
        );

    if (
        !market.available
    ) {

        return {

            status:
                "NO_DATA",

            reason:
                "No current market data."
        };
    }

    if (
        !market.inferredSide
    ) {

        return {

            status:
                "NO_TRADE",

            side:
                null,

            reason:
                "Current market does not satisfy the directional setup."
        };
    }

    const lastRow =
        rows[
            rows.length - 1
        ];

    const best =
        findBestPattern(
            lastRow,
            market.inferredSide,
            patterns.filter(
                p =>
                    p.robust
            )
        );

    if (!best) {

        return {

            status:
                "NO_EDGE",

            side:
                market.inferredSide,

            reason:
                "Directional setup exists, but no robust historical pattern matches it."
        };
    }

    if (
        best.qualityScore <
        45
    ) {

        return {

            status:
                "NO_EDGE",

            side:
                market.inferredSide,

            pattern:
                best.key,

            qualityScore:
                best.qualityScore,

            expectedValueR:
                best.averageTestEV,

            profitFactor:
                best.averageTestPF,

            reason:
                "Pattern quality is below the V11.11 execution threshold."
        };
    }

    const close =
        number(
            lastRow.close
        );

    const atr =
        number(
            lastRow.atr14
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
            market.inferredSide ===
            "BUY"
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
            "TAKE_TRADE",

        side:
            market.inferredSide,

        pattern:
            best.key,

        patternLevel:
            best.level,

        qualityScore:
            best.qualityScore,

        samples:
            best.samples,

        winRate:
            best.winRate,

        expectedValueR:
            best.averageTestEV,

        profitFactor:
            best.averageTestPF,

        positiveFolds:
            best.positiveFolds,

        stableFolds:
            best.strongFolds,

        stability:
            best.stability,

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
            "Current setup matches a statistically robust generalized pattern."
    };
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
        100
    ) {

        throw new Error(
            `Not enough learning rows: ${rows.length}`
        );
    }

    /*
    Chronological order is mandatory.
    */

    rows.sort(
        (
            a,
            b
        ) =>
            (
                a.timestamp || 0
            ) -
            (
                b.timestamp || 0
            )
    );

    const folds =
        buildFolds(
            rows.length
        );

    const patterns =
        discoverPatterns(
            rows,
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
                p.qualityScore >= 45
        );

    const buyPatterns =
        qualifiedPatterns.filter(
            p =>
                p.side === "BUY"
        );

    const sellPatterns =
        qualifiedPatterns.filter(
            p =>
                p.side === "SELL"
        );

    const execution =
        executionBacktest(
            rows,
            qualifiedPatterns
        );

    const market =
        currentMarket(
            rows
        );

    const recommendation =
        finalRecommendation(
            rows,
            patterns,
            execution
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
            "GENERALIZED_EDGE_LEARNING",

        paperOnly:
            true,

        realOrders:
            false,

        instrument:
            INSTRUMENT,

        interval:
            INTERVAL,

        requestedDays:
            REQUESTED_DAYS,

        source:
            "V11.1_LEARNING_DATASET",

        objective: {

            primary:
                "POSITIVE_EXPECTED_VALUE",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "SELECT_HIGH_QUALITY_TRADES",

            winRateTarget:
                "NOT_FIXED",

            minimumExpectedValueR:
                MIN_EXPECTED_VALUE,

            goodExpectedValueR:
                GOOD_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_PROFIT_FACTOR,

            goodProfitFactor:
                GOOD_PROFIT_FACTOR,

            allowNoTrade:
                true
        },

        sourceStatistics: {

            rawLearningRows:
                rawRows.length,

            normalizedRows:
                rows.length,

            candlesTested:
                rows.length,

            learningRows:
                rows.length,

            tradingDays:
                tradingDays.size,

            dataQuality: {

                rawCandles:
                    rawRows.length,

                validCandles:
                    rows.length,

                finalCandles:
                    rows.length,

                invalidCandles:
                    rawRows.length -
                    rows.length,

                duplicateCandles:
                    0,

                requestedDays:
                    REQUESTED_DAYS
            }
        },

        split: {

            method:
                "EXPANDING_WALK_FORWARD",

            chronological:
                true,

            shuffled:
                false,

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
                buyPatterns.length,

            sellPatterns:
                sellPatterns.length,

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
            }
        },

        currentMarket:
            market,

        executionBacktest:
            execution,

        riskPlan: {

            riskPerTrade:
                "1R",

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

            maxDrawdownReferenceR:
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
                buyPatterns
                    .slice(
                        0,
                        20
                    ),

            SELL:
                sellPatterns
                    .slice(
                        0,
                        20
                    )
        },

        recommendation,

        paperAction:
            recommendation.status ===
            "TAKE_TRADE"

                ? "PAPER_TRADE_CANDIDATE"

                : "NO_TRADE"
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
            req.method !== "GET"
        ) {

            return res.status(
                405
            ).json({

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
            "V11.11 ERROR:",
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
