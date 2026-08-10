/*
TradeMind Pro
V11.12
TRUE WALK-FORWARD OUT-OF-SAMPLE EDGE ENGINE

V11.11 problem:
Pattern discovery was still performed across the complete dataset.
That means future/test observations could influence which patterns
were selected.

V11.12 solution:
TRUE EXPANDING WALK-FORWARD VALIDATION.

For every outer fold:

TRAIN
   ↓
learn patterns
   ↓
freeze pattern set
   ↓
TEST unseen candles
   ↓
record OOS results
   ↓
move forward
   ↓
repeat

The current-market recommendation is trained only on historical
candles BEFORE the current candle.

PAPER ONLY.
NO REAL ORDERS.
*/

// ============================================================
// VERSION
// ============================================================

const VERSION = "V11.12";

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

const FOLD_COUNT = 4;

const MAX_DRAWDOWN_R = 15;
const MAX_LOSS_STREAK = 8;

const MIN_QUALITY_SCORE = 45;

const MIN_TRAINING_FOLDS = 2;

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

    return Math.round(
        value * multiplier
    ) / multiplier;
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

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value === "string" &&
        !/^\d+(\.\d+)?$/.test(value)
    ) {

        const parsed =
            Date.parse(value);

        if (
            Number.isFinite(parsed)
        ) {

            return Math.floor(
                parsed / 1000
            );
        }
    }

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
                String(
                    row.outcome.buyOutcome ||
                    row.buyOutcome ||
                    "TIMEOUT"
                ).toUpperCase(),

            sellOutcome:
                String(
                    row.outcome.sellOutcome ||
                    row.sellOutcome ||
                    "TIMEOUT"
                ).toUpperCase()
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
            String(
                row &&
                (
                    row.buyOutcome ||
                    row.buyResult
                ) ||
                "TIMEOUT"
            ).toUpperCase(),

        sellOutcome:
            String(
                row &&
                (
                    row.sellOutcome ||
                    row.sellResult
                ) ||
                "TIMEOUT"
            ).toUpperCase()
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

    if (x < -1) return "FAR_BELOW";
    if (x < -0.25) return "BELOW";
    if (x <= 0.25) return "NEAR";
    if (x <= 1) return "ABOVE";

    return "FAR_ABOVE";
}


function spreadBucket(value) {

    const x =
        Math.abs(
            number(value, 0)
        );

    if (x < 0.25) return "VERY_TIGHT";
    if (x < 0.50) return "TIGHT";
    if (x < 0.75) return "MEDIUM";

    return "WIDE";
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


// ============================================================
// TIME BUCKET
// ============================================================

function timeBucket(row) {

    let hour =
        number(
            firstValue(
                row,
                [
                    "hour",
                    "marketHour"
                ]
            )
        );

    if (
        hour === null &&
        row.timestamp
    ) {

        const date =
            new Date(
                row.timestamp * 1000
            );

        hour =
            date.getUTCHours();
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
// TREND NORMALIZATION
// ============================================================

function normalizeTrend(row) {

    const trend =
        String(
            firstValue(
                row,
                [
                    "trend",
                    "marketTrend"
                ]
            ) ||
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
            firstValue(
                row,
                [
                    "regime",
                    "marketRegime"
                ]
            ) ||
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
            firstValue(
                row,
                [
                    "vwapDistanceATR",
                    "vwapDistance"
                ]
            )
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
            firstValue(
                row,
                [
                    "close",
                    "c",
                    "price"
                ]
            )
        );

    const vwap =
        number(
            firstValue(
                row,
                [
                    "vwap",
                    "VWAP"
                ]
            )
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


// ============================================================
// FEATURE EXTRACTION
// ============================================================

function extractFeatureState(row) {

    return {

        trend:
            normalizeTrend(row),

        regime:
            normalizeRegime(row),

        rsi:
            rsiBucket(
                firstValue(
                    row,
                    [
                        "rsi14",
                        "rsi",
                        "RSI"
                    ]
                )
            ),

        vwap:
            vwapDirection(row),

        vwapDistance:
            vwapBucket(
                firstValue(
                    row,
                    [
                        "vwapDistanceATR",
                        "vwapDistance"
                    ]
                )
            ),

        slope:
            slopeBucket(
                firstValue(
                    row,
                    [
                        "ema9SlopeATR",
                        "emaSlopeATR",
                        "slopeATR"
                    ]
                )
            ),

        spread:
            spreadBucket(
                firstValue(
                    row,
                    [
                        "emaSpreadATR",
                        "emaSpread"
                    ]
                )
            ),

        body:
            spreadBucket(
                firstValue(
                    row,
                    [
                        "bodyRatio"
                    ]
                )
            ),

        time:
            timeBucket(row)
    };
}


// ============================================================
// GENERALIZED PATTERN KEY
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

        const close =
            number(
                firstValue(
                    row,
                    [
                        "close",
                        "c",
                        "price"
                    ]
                )
            );

        const open =
            number(
                firstValue(
                    row,
                    [
                        "open",
                        "o"
                    ]
                )
            );

        const high =
            number(
                firstValue(
                    row,
                    [
                        "high",
                        "h"
                    ]
                )
            );

        const low =
            number(
                firstValue(
                    row,
                    [
                        "low",
                        "l"
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

            open,

            high,

            low
        });
    }

    result.sort(
        (a, b) =>
            a.timestamp -
            b.timestamp
    );

    return result;
}


// ============================================================
// REMOVE DUPLICATES
// ============================================================

function removeDuplicateCandles(rows) {

    const result = [];

    let lastTimestamp =
        null;

    for (
        const row
        of rows
    ) {

        if (
            row.timestamp ===
            lastTimestamp
        ) {
            continue;
        }

        result.push(row);

        lastTimestamp =
            row.timestamp;
    }

    return result;
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

    let lossStreak = 0;
    let maxLossStreak = 0;

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

            winR +=
                MIN_TARGET_R;

            equity +=
                MIN_TARGET_R;

            lossStreak = 0;

        } else if (
            result === "LOSS"
        ) {

            losses++;

            lossR +=
                STOP_R;

            equity -=
                STOP_R;

            lossStreak++;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    lossStreak
                );

        } else {

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
// FOLD BUILDER
// ============================================================

function buildFolds(total) {

    const folds = [];

    if (
        total < 200
    ) {
        return folds;
    }

    /*
    Each test section is approximately
    one quarter of the usable dataset.

    Training is always everything BEFORE
    the test window.

    NEVER:

    test → training

    ALWAYS:

    training → test
    */

    const testSize =
        Math.floor(
            total /
            6
        );

    const minimumTraining =
        Math.max(
            100,
            Math.floor(
                total * 0.25
            )
        );

    for (
        let i = 0;
        i < FOLD_COUNT;
        i++
    ) {

        const testStart =
            minimumTraining +
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
            testStart >= total ||
            testEnd <= testStart
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
// INTERNAL TRAINING FOLDS
// ============================================================

function buildInternalFolds(total) {

    if (
        total < 120
    ) {
        return [];
    }

    const folds = [];

    const testSize =
        Math.floor(
            total /
            6
        );

    const minimumTraining =
        Math.max(
            60,
            Math.floor(
                total * 0.30
            )
        );

    for (
        let i = 0;
        i < 3;
        i++
    ) {

        const testStart =
            minimumTraining +
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
            testEnd <= testStart
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
// MINIMUM SAMPLES
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
// QUALITY SCORE
// ============================================================

function calculateQualityScore(
    foldStats
) {

    if (
        !foldStats.length
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
        foldStats.filter(
            x =>
                x.expectedValueR >
                0
        ).length;

    const strongFolds =
        foldStats.filter(
            x =>
                x.expectedValueR >=
                MIN_EXPECTED_VALUE &&
                x.profitFactor >=
                MIN_PROFIT_FACTOR
        ).length;

    const averageEV =
        foldStats.reduce(
            (
                sum,
                x
            ) =>
                sum +
                x.expectedValueR,
            0
        ) /
        foldStats.length;

    const averagePF =
        foldStats.reduce(
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
        foldStats.length;

    const averageWinRate =
        foldStats.reduce(
            (
                sum,
                x
            ) =>
                sum +
                x.winRate,
            0
        ) /
        foldStats.length;

    const averageDrawdown =
        foldStats.reduce(
            (
                sum,
                x
            ) =>
                sum +
                x.maxDrawdownR,
            0
        ) /
        foldStats.length;

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
            foldStats.length
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
                foldStats.length,
                3
            )
    };
}


// ============================================================
// EVALUATE PATTERN INSIDE TRAINING DATA
// ============================================================

function evaluateTrainingPattern(
    key,
    side,
    level,
    trainingRows
) {

    const minimumSamples =
        minimumSamplesForLevel(
            level
        );

    const patternRows =
        trainingRows.filter(
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
        patternRows.length <
        minimumSamples
    ) {
        return null;
    }

    const internalFolds =
        buildInternalFolds(
            trainingRows.length
        );

    const foldStats = [];

    /*
    If training history is large enough,
    use internal walk-forward validation.

    If not, use the training history itself
    only as a weak discovery signal.
    */

    if (
        internalFolds.length
    ) {

        for (
            const fold
            of internalFolds
        ) {

            const trainPart =
                [];

            const testPart =
                [];

            for (
                let i = 0;
                i < trainingRows.length;
                i++
            ) {

                const row =
                    trainingRows[i];

                const feature =
                    extractFeatureState(
                        row
                    );

                const rowKey =
                    createPatternKey(
                        side,
                        feature,
                        level
                    );

                if (
                    rowKey !== key
                ) {
                    continue;
                }

                if (
                    i >=
                    fold.trainingStart &&
                    i <
                    fold.trainingEnd
                ) {

                    trainPart.push(row);
                }

                if (
                    i >=
                    fold.testStart &&
                    i <
                    fold.testEnd
                ) {

                    testPart.push(row);
                }
            }

            if (
                trainPart.length <
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

            if (
                !testPart.length
            ) {
                continue;
            }

            const trainStats =
                calculateStats(
                    trainPart,
                    side
                );

            const testStats =
                calculateStats(
                    testPart,
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
    }

    /*
    If internal folds are insufficient,
    calculate historical training quality,
    but mark stability accordingly.
    */

    if (
        !foldStats.length
    ) {

        const overall =
            calculateStats(
                patternRows,
                side
            );

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
                0,

            positiveFolds:
                overall.expectedValueR > 0
                    ? 1
                    : 0,

            strongFolds:
                (
                    overall.expectedValueR >=
                    MIN_EXPECTED_VALUE &&
                    overall.profitFactor >=
                    MIN_PROFIT_FACTOR
                )
                    ? 1
                    : 0,

            averageTestEV:
                overall.expectedValueR,

            averageTestPF:
                overall.profitFactor,

            averageTestWinRate:
                overall.winRate,

            averageTestDrawdown:
                overall.maxDrawdownR,

            stability:
                0,

            qualityScore:
                0,

            robust:
                false,

            foldDetails:
                []
        };
    }

    const quality =
        calculateQualityScore(
            foldStats
        );

    const overall =
        calculateStats(
            patternRows,
            side
        );

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
// DISCOVER PATTERNS
// ============================================================

function discoverPatterns(
    trainingRows
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
                    trainingRows,
                    side,
                    level
                );

            for (
                const key
                of map.keys()
            ) {

                const evaluated =
                    evaluateTrainingPattern(
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
}


// ============================================================
// BEST PATTERN
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
                b.averageTestEV !==
                a.averageTestEV
            ) {

                return (
                    b.averageTestEV -
                    a.averageTestEV
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
// DIRECTIONAL SIGNAL
// ============================================================

function inferSide(row) {

    const trend =
        normalizeTrend(row);

    const vwap =
        vwapDirection(row);

    const rsi =
        number(
            firstValue(
                row,
                [
                    "rsi14",
                    "rsi",
                    "RSI"
                ]
            )
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
// EXECUTION STATISTICS
// ============================================================

function calculateExecutionStats(
    trades
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

        } else if (
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

        } else {

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
            maxLossStreak
    };
}


// ============================================================
// RUN ONE UNSEEN TEST WINDOW
// ============================================================

function runTestWindow(
    testRows,
    patterns,
    globalOffset
) {

    const robustPatterns =
        patterns.filter(
            pattern =>
                pattern.robust &&
                pattern.qualityScore >=
                MIN_QUALITY_SCORE
        );

    const trades = [];

    let lastTradeIndex =
        -999;

    for (
        let i = 0;
        i < testRows.length;
        i++
    ) {

        const row =
            testRows[i];

        if (
            i <=
            lastTradeIndex
        ) {
            continue;
        }

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

        const outcome =
            sideOutcome(
                row,
                side
            );

        let resultR = 0;

        if (
            outcome === "WIN"
        ) {

            resultR =
                MIN_TARGET_R;

        } else if (
            outcome === "LOSS"
        ) {

            resultR =
                -STOP_R;

        } else {

            resultR = 0;
        }

        trades.push({

            index:
                globalOffset + i,

            side,

            pattern:
                pattern.key,

            level:
                pattern.level,

            qualityScore:
                pattern.qualityScore,

            expectedValueR:
                pattern.averageTestEV,

            profitFactor:
                pattern.averageTestPF,

            outcome,

            resultR
        });

        lastTradeIndex =
            i;
    }

    return trades;
}


// ============================================================
// TRUE WALK-FORWARD EXECUTION
// ============================================================

function walkForwardExecution(
    rows,
    folds
) {

    const allTrades = [];

    const foldResults = [];

    for (
        const fold
        of folds
    ) {

        /*
        CRITICAL:

        TRAINING DATA ENDS BEFORE
        TEST DATA STARTS.

        The test data is NEVER passed
        to discoverPatterns().
        */

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
            100 ||
            !testRows.length
        ) {
            continue;
        }

        const patterns =
            discoverPatterns(
                trainingRows
            );

        const trades =
            runTestWindow(
                testRows,
                patterns,
                fold.testStart
            );

        const stats =
            calculateExecutionStats(
                trades
            );

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
                patterns.filter(
                    p =>
                        p.robust
                ).length,

            qualifiedPatterns:
                patterns.filter(
                    p =>
                        p.robust &&
                        p.qualityScore >=
                        MIN_QUALITY_SCORE
                ).length,

            ...stats
        });

        allTrades.push(
            ...trades
        );
    }

    const overall =
        calculateExecutionStats(
            allTrades
        );

    const positiveFolds =
        foldResults.filter(
            fold =>
                fold.expectedValueR >
                0
        ).length;

    const profitableFolds =
        foldResults.filter(
            fold =>
                fold.netR >
                0
        ).length;

    return {

        method:
            "TRUE_EXPANDING_WALK_FORWARD",

        leakageFree:
            true,

        trainThenTest:
            true,

        foldsEvaluated:
            foldResults.length,

        positiveFolds,

        profitableFolds,

        foldDetails:
            foldResults,

        ...overall,

        stopR:
            STOP_R,

        minimumTargetR:
            MIN_TARGET_R,

        preferredTargetR:
            PREFERRED_TARGET_R,

        executionRiskReward:
            "1:2",

        preferredRiskReward:
            "1:2.5",

        tradeLog:
            allTrades.slice(
                -150
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
            new Date(
                row.timestamp * 1000
            ).toISOString(),

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
                firstValue(
                    row,
                    [
                        "rsi14",
                        "rsi",
                        "RSI"
                    ]
                )
            ),

        rsiBucket:
            feature.rsi,

        vwap:
            number(
                firstValue(
                    row,
                    [
                        "vwap",
                        "VWAP"
                    ]
                )
            ),

        vwapDirection:
            feature.vwap,

        vwapDistanceATR:
            number(
                firstValue(
                    row,
                    [
                        "vwapDistanceATR",
                        "vwapDistance"
                    ]
                )
            ),

        ema9:
            number(
                firstValue(
                    row,
                    [
                        "ema9",
                        "EMA9"
                    ]
                )
            ),

        ema21:
            number(
                firstValue(
                    row,
                    [
                        "ema21",
                        "EMA21"
                    ]
                )
            ),

        emaSpreadATR:
            number(
                firstValue(
                    row,
                    [
                        "emaSpreadATR"
                    ]
                )
            ),

        ema9SlopeATR:
            number(
                firstValue(
                    row,
                    [
                        "ema9SlopeATR"
                    ]
                )
            ),

        bodyRatio:
            number(
                firstValue(
                    row,
                    [
                        "bodyRatio"
                    ]
                )
            ),

        time:
            feature.time,

        inferredSide:
            inferSide(row)
    };
}


// ============================================================
// FINAL CURRENT-MARKET RECOMMENDATION
// ============================================================

function finalRecommendation(
    rows
) {

    if (
        rows.length < 101
    ) {

        return {

            status:
                "NO_DATA",

            reason:
                "Insufficient historical data."
        };
    }

    /*
    IMPORTANT:

    The final candle is treated as the
    current observation.

    Its future outcome is NOT used to
    train the recommendation.

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

            reason:
                "Current market does not satisfy the directional setup."
        };
    }

    const patterns =
        discoverPatterns(
            historicalRows
        );

    const qualified =
        patterns.filter(
            p =>
                p.robust &&
                p.qualityScore >=
                MIN_QUALITY_SCORE
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

            candidatePatterns:
                qualified.length,

            reason:
                "Directional setup exists, but no leakage-free robust pattern matches the current market."
        };
    }

    const close =
        number(
            currentRow.close
        );

    const atr =
        number(
            firstValue(
                currentRow,
                [
                    "atr14",
                    "ATR14",
                    "atr"
                ]
            )
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
            "TAKE_TRADE",

        side,

        pattern:
            best.key,

        patternLevel:
            best.level,

        qualityScore:
            best.qualityScore,

        samples:
            best.samples,

        historicalWinRate:
            best.winRate,

        historicalExpectedValueR:
            best.averageTestEV,

        historicalProfitFactor:
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

        trainingRows:
            historicalRows.length,

        futureOutcomeUsed:
            false,

        reason:
            "Current setup matches a leakage-free generalized pattern learned only from historical candles."
    };
}


// ============================================================
// TRADING DAYS
// ============================================================

function getTradingDays(rows) {

    return new Set(
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

    let rows =
        normalizeRows(
            rawRows
        );

    const beforeDedup =
        rows.length;

    rows =
        removeDuplicateCandles(
            rows
        );

    const duplicateCandles =
        beforeDedup -
        rows.length;

    if (
        rows.length < 200
    ) {

        throw new Error(
            `Not enough learning rows: ${rows.length}`
        );
    }

    rows.sort(
        (a, b) =>
            a.timestamp -
            b.timestamp
    );

    const folds =
        buildFolds(
            rows.length
        );

    if (
        folds.length < 3
    ) {

        throw new Error(
            `Unable to construct sufficient walk-forward folds. Rows: ${rows.length}`
        );
    }

    /*
    ============================================================
    TRUE OOS EXECUTION
    ============================================================

    This is the key V11.12 change.

    Each fold independently learns from its
    historical training window and then tests
    against unseen candles.
    */

    const execution =
        walkForwardExecution(
            rows,
            folds
        );

    /*
    Final historical learning set.

    Current candle is excluded.
    */

    const historicalRows =
        rows.slice(
            0,
            -1
        );

    const finalPatterns =
        discoverPatterns(
            historicalRows
        );

    const robustPatterns =
        finalPatterns.filter(
            p =>
                p.robust
        );

    const qualifiedPatterns =
        robustPatterns.filter(
            p =>
                p.qualityScore >=
                MIN_QUALITY_SCORE
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

    const market =
        currentMarket(
            rows
        );

    const recommendation =
        finalRecommendation(
            rows
        );

    const tradingDays =
        getTradingDays(
            rows
        );

    const oosProfitable =
        execution.netR >
        0;

    const oosPositiveEV =
        execution.expectedValueR >
        0;

    const oosAcceptablePF =
        execution.profitFactor >=
        MIN_PROFIT_FACTOR;

    const oosControlledDrawdown =
        execution.maxDrawdownR <=
        MAX_DRAWDOWN_R;

    const oosPositiveFolds =
        execution.positiveFolds >=
        MIN_STABLE_FOLDS;

    const liveReadiness =
        oosProfitable &&
        oosPositiveEV &&
        oosAcceptablePF &&
        oosControlledDrawdown &&
        oosPositiveFolds &&
        execution.trades >=
        MIN_DECISIVE_TRADES;

    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "TRUE_WALK_FORWARD_OOS_LEARNING",

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
                "TRUE_OUT_OF_SAMPLE_EXPECTED_VALUE",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "SELECT_GENERALIZED_HIGH_QUALITY_TRADES",

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

        antiLeakage: {

            enabled:
                true,

            trainingBeforeTesting:
                true,

            shuffled:
                false,

            testDataUsedForTraining:
                false,

            currentCandleOutcomeUsed:
                false,

            patternSelectionUsesFutureData:
                false
        },

        sourceStatistics: {

            rawLearningRows:
                rawRows.length,

            normalizedRows:
                rows.length,

            candlesTested:
                rows.length,

            learningRows:
                historicalRows.length,

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
                    rows.length -
                    duplicateCandles,

                duplicateCandles,

                requestedDays:
                    REQUESTED_DAYS
            }
        },

        split: {

            method:
                "TRUE_EXPANDING_WALK_FORWARD",

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

        learning: {

            finalTrainingRows:
                historicalRows.length,

            patternsDiscovered:
                finalPatterns.length,

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
                    finalPatterns.filter(
                        p =>
                            p.level === 1
                    ).length,

                level2:
                    finalPatterns.filter(
                        p =>
                            p.level === 2
                    ).length,

                level3:
                    finalPatterns.filter(
                        p =>
                            p.level === 3
                    ).length,

                level4:
                    finalPatterns.filter(
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

        /*
        ========================================================
        MOST IMPORTANT SECTION
        ========================================================

        This is the result on candles that the
        brain had NOT seen while learning.
        */

        outOfSampleBacktest: {

            method:
                "TRUE_EXPANDING_WALK_FORWARD",

            leakageFree:
                true,

            trades:
                execution.trades,

            wins:
                execution.wins,

            losses:
                execution.losses,

            timeouts:
                execution.timeouts,

            decisiveTrades:
                execution.decisiveTrades,

            winRate:
                execution.winRate,

            totalWinR:
                execution.totalWinR,

            totalLossR:
                execution.totalLossR,

            netR:
                execution.netR,

            expectedValueR:
                execution.expectedValueR,

            profitFactor:
                execution.profitFactor,

            maxDrawdownR:
                execution.maxDrawdownR,

            maxConsecutiveLosses:
                execution.maxConsecutiveLosses,

            foldsEvaluated:
                execution.foldsEvaluated,

            positiveFolds:
                execution.positiveFolds,

            profitableFolds:
                execution.profitableFolds,

            foldDetails:
                execution.foldDetails,

            tradeLog:
                execution.tradeLog
        },

        /*
        ========================================================
        LIVE READINESS
        ========================================================
        */

        liveReadiness: {

            status:
                liveReadiness
                    ? "PAPER_VALIDATION_PASS"
                    : "PAPER_VALIDATION_NOT_READY",

            oosProfitable,

            oosPositiveEV,

            oosAcceptablePF,

            oosControlledDrawdown,

            oosPositiveFolds,

            minimumOOSTrades:
                MIN_DECISIVE_TRADES,

            actualOOSTrades:
                execution.trades,

            message:
                liveReadiness

                    ? "Out-of-sample paper results satisfy the current validation gates. Real trading is still disabled."

                    : "Out-of-sample evidence is not yet strong enough for live trading."
        },

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
                finalPatterns
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
                finalPatterns
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
            "V11.12 ERROR:",
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
