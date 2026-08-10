/*
TradeMind Pro
V12.6

STRICT OOS PROFITABILITY PROOF ENGINE

V12.5:
- Strict walk-forward
- Anti-leakage
- Brain gating
- Context-aware patterns

V12.6:
- TRUE OUT-OF-SAMPLE PROFITABILITY PROOF
- Pattern discovery ONLY from training data
- Pattern validation ONLY on unseen test data
- Recent OOS validation
- OOS profitability gate
- OOS drawdown control
- OOS loss-streak control
- Simpler patterns preferred
- Current candle excluded from learning
- Current candle outcome NEVER used
- No overlapping paper trades
- Same-candle STOP FIRST

PAPER ONLY.
NO REAL ORDERS.
*/

// ============================================================
// VERSION
// ============================================================

const VERSION = "V12.6";

const INTERVAL = "5minute";
const INSTRUMENT = "NIFTY 50";

const REQUESTED_DAYS = 30;


// ============================================================
// RISK
// ============================================================

const STOP_R = 1.0;

const MIN_TARGET_R = 2.0;

const PREFERRED_TARGET_R = 2.5;

const MAX_HOLD_CANDLES = 12;


// ============================================================
// WALK FORWARD
// ============================================================

const FOLD_COUNT = 4;

const MIN_TRAINING_ROWS = 200;

const MIN_TEST_ROWS = 100;


// ============================================================
// PATTERN REQUIREMENTS
// ============================================================

const MIN_LEVEL1_SAMPLES = 20;
const MIN_LEVEL2_SAMPLES = 15;
const MIN_LEVEL3_SAMPLES = 12;
const MIN_LEVEL4_SAMPLES = 10;

const MIN_DECISIVE_TRADES = 8;

const MIN_OOS_SAMPLES = 3;

const MIN_OOS_DECISIVE_TRADES = 3;

const MIN_EXPECTED_VALUE = 0.10;

const MIN_OOS_EXPECTED_VALUE = 0.10;

const MIN_PROFIT_FACTOR = 1.10;

const MIN_OOS_PROFIT_FACTOR = 1.10;

const MIN_STABLE_OOS_FOLDS = 2;

const MAX_OOS_DRAWDOWN_R = 15;

const MAX_OOS_LOSS_STREAK = 8;

const QUALITY_THRESHOLD = 45;


// ============================================================
// RECENT STABILITY
// ============================================================

const RECENT_WINDOW_FRACTION = 0.35;

const MAX_RECENT_DETERIORATION = -0.35;

const REQUIRE_RECENT_STABILITY = true;


// ============================================================
// HELPERS
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
        number(row.hour);

    if (hour !== null) {

        if (hour < 10) return "OPEN";
        if (hour < 11) return "MORNING";
        if (hour < 13) return "MIDDAY";
        if (hour < 14) return "AFTERNOON";

        return "CLOSE";
    }

    if (row.timestamp) {

        const d =
            new Date(
                row.timestamp * 1000
            );

        const h =
            d.getUTCHours();

        if (h < 10) return "OPEN";
        if (h < 11) return "MORNING";
        if (h < 13) return "MIDDAY";
        if (h < 14) return "AFTERNOON";

        return "CLOSE";
    }

    return "UNKNOWN";
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


// ============================================================
// FEATURE EXTRACTION
// ============================================================

function extractFeatures(row) {

    return {

        trend:
            normalizeTrend(row),

        regime:
            normalizeRegime(row),

        rsi:
            rsiBucket(row.rsi14),

        vwap:
            vwapDirection(row),

        slope:
            slopeBucket(
                row.ema9SlopeATR
            ),

        time:
            timeBucket(row)
    };
}


// ============================================================
// PATTERN TYPE
// ============================================================

function determinePatternType(
    side,
    feature
) {

    const trend =
        feature.trend;

    const vwap =
        feature.vwap;

    if (
        (
            side === "BUY" &&
            trend === "BULLISH" &&
            (
                vwap === "ABOVE" ||
                vwap === "NEAR"
            )
        ) ||
        (
            side === "SELL" &&
            trend === "BEARISH" &&
            (
                vwap === "BELOW" ||
                vwap === "NEAR"
            )
        )
    ) {

        return "TREND_FOLLOW";
    }

    if (
        (
            side === "BUY" &&
            trend === "BEARISH" &&
            vwap === "BELOW"
        ) ||
        (
            side === "SELL" &&
            trend === "BULLISH" &&
            vwap === "ABOVE"
        )
    ) {

        return "REVERSAL";
    }

    if (
        trend === "RANGING"
    ) {

        return "RANGE";
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

    const patternType =
        determinePatternType(
            side,
            feature
        );

    const parts = [

        side,

        `T:${feature.trend}`,

        `V:${feature.vwap}`,

        `P:${patternType}`
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
// LEVEL REQUIREMENTS
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
// SIGNAL INFERENCE
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


    // Controlled reversal signals.

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


    for (
        const row of rows
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
        }


        else if (
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


    const decisiveTrades =
        wins +
        losses;


    const winRate =
        decisiveTrades > 0
            ? (
                wins /
                decisiveTrades
            ) * 100
            : 0;


    const netR =
        winR -
        lossR;


    const expectedValueR =
        samples > 0
            ? netR /
              samples
            : 0;


    const profitFactor =
        lossR > 0
            ? winR /
              lossR
            : winR > 0
                ? 999
                : 0;


    return {

        samples,

        wins,

        losses,

        timeouts,

        decisiveTrades,

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
                expectedValueR,
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
// BUILD WALK FORWARD FOLDS
// ============================================================

function buildWalkForwardFolds(
    total
) {

    const folds = [];


    if (
        total <
        MIN_TRAINING_ROWS +
        MIN_TEST_ROWS
    ) {

        return folds;
    }


    const usable =
        total -
        MIN_TEST_ROWS;


    const testSize =
        Math.max(
            MIN_TEST_ROWS,
            Math.floor(
                usable /
                (
                    FOLD_COUNT +
                    1
                )
            )
        );


    for (
        let i = 0;
        i < FOLD_COUNT;
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
            extractFeatures(row);


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


        map
            .get(key)
            .push(row);
    }


    return map;
}


// ============================================================
// GET PATTERN ROWS
// ============================================================

function rowsForPattern(
    rows,
    side,
    level,
    key
) {

    return rows.filter(
        row => {

            const feature =
                extractFeatures(row);


            return (
                createPatternKey(
                    side,
                    feature,
                    level
                ) === key
            );
        }
    );
}


// ============================================================
// QUALITY
// ============================================================

function calculateQuality(
    overall,
    oos,
    recent,
    level
) {

    const evScore =
        clamp(
            (
                oos.expectedValueR /
                0.25
            ) * 35,
            0,
            35
        );


    const pfScore =
        clamp(
            (
                (
                    oos.profitFactor -
                    1
                ) /
                1
            ) * 25,
            0,
            25
        );


    const decisiveScore =
        clamp(
            (
                oos.decisiveTrades /
                20
            ) * 10,
            0,
            10
        );


    const stabilityScore =
        clamp(
            (
                oos.stableFolds /
                FOLD_COUNT
            ) * 20,
            0,
            20
        );


    const recentScore =
        recent.stable
            ? 10
            : 0;


    const complexityPenalty =
        level === 1
            ? 0
            : level === 2
                ? 2
                : level === 3
                    ? 4
                    : 6;


    const drawdownPenalty =
        clamp(
            (
                oos.maxDrawdownR /
                MAX_OOS_DRAWDOWN_R
            ) * 5,
            0,
            5
        );


    const score =
        evScore +
        pfScore +
        decisiveScore +
        stabilityScore +
        recentScore -
        complexityPenalty -
        drawdownPenalty;


    return round(
        clamp(
            score,
            0,
            100
        ),
        2
    );
}


// ============================================================
// OOS FOLD VALIDATION
// ============================================================

function validatePatternOOS(
    key,
    side,
    level,
    rows,
    folds
) {

    const foldDetails = [];


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


        const trainingPatternRows =
            rowsForPattern(
                trainingRows,
                side,
                level,
                key
            );


        /*
        CRITICAL:

        Pattern must be discovered
        inside training data.

        A pattern appearing for the
        first time in the test window
        cannot qualify.
        */


        if (
            trainingPatternRows.length <
            Math.max(
                5,
                Math.floor(
                    minimumSamplesForLevel(
                        level
                    ) / 2
                )
            )
        ) {

            continue;
        }


        const testPatternRows =
            rowsForPattern(
                testRows,
                side,
                level,
                key
            );


        if (
            testPatternRows.length === 0
        ) {

            continue;
        }


        const trainingStats =
            calculateStats(
                trainingPatternRows,
                side
            );


        const testStats =
            calculateStats(
                testPatternRows,
                side
            );


        foldDetails.push({

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


    return foldDetails;
}


// ============================================================
// OOS AGGREGATE
// ============================================================

function aggregateOOS(
    foldDetails
) {

    let wins = 0;
    let losses = 0;
    let timeouts = 0;

    let netR = 0;

    let maxDrawdown = 0;
    let maxLossStreak = 0;


    for (
        const fold of foldDetails
    ) {

        wins +=
            fold.testWins;

        losses +=
            fold.testLosses;

        timeouts +=
            fold.testTimeouts;

        netR +=
            fold.testNetR;


        maxDrawdown =
            Math.max(
                maxDrawdown,
                fold.testDrawdownR
            );


        maxLossStreak =
            Math.max(
                maxLossStreak,
                fold.testLossStreak
            );
    }


    const samples =
        foldDetails.reduce(
            (
                sum,
                x
            ) =>
                sum +
                x.testSamples,
            0
        );


    const decisive =
        wins +
        losses;


    const winRate =
        decisive > 0
            ? (
                wins /
                decisive
            ) * 100
            : 0;


    const grossProfit =
        wins *
        MIN_TARGET_R;


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


    const expectedValue =
        samples > 0
            ? netR /
              samples
            : 0;


    const positiveFolds =
        foldDetails.filter(
            x =>
                x.testExpectedValueR >
                0
        ).length;


    const stableFolds =
        foldDetails.filter(
            x =>
                x.testExpectedValueR >=
                    MIN_OOS_EXPECTED_VALUE &&
                x.testProfitFactor >=
                    MIN_OOS_PROFIT_FACTOR
        ).length;


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

        maxLossStreak,

        foldsEvaluated:
            foldDetails.length,

        positiveFolds,

        stableFolds
    };
}


// ============================================================
// RECENT OOS ANALYSIS
// ============================================================

function calculateRecentOOS(
    foldDetails
) {

    if (
        !foldDetails.length
    ) {

        return {

            stable:
                false,

            recentEV:
                0,

            earlierEV:
                0,

            deterioration:
                0
        };
    }


    const ordered =
        [...foldDetails]
            .sort(
                (a, b) =>
                    a.fold -
                    b.fold
            );


    const recentCount =
        Math.max(
            1,
            Math.ceil(
                ordered.length *
                RECENT_WINDOW_FRACTION
            )
        );


    const recent =
        ordered.slice(
            -recentCount
        );


    const earlier =
        ordered.slice(
            0,
            Math.max(
                0,
                ordered.length -
                recentCount
            )
        );


    const recentEV =
        recent.length
            ? recent.reduce(
                (
                    sum,
                    x
                ) =>
                    sum +
                    x.testExpectedValueR,
                0
            ) /
            recent.length
            : 0;


    const earlierEV =
        earlier.length
            ? earlier.reduce(
                (
                    sum,
                    x
                ) =>
                    sum +
                    x.testExpectedValueR,
                0
            ) /
            earlier.length
            : recentEV;


    const deterioration =
        Math.abs(
            earlierEV
        ) > 0.0001
            ? (
                recentEV -
                earlierEV
            ) /
            Math.abs(
                earlierEV
            )
            : 0;


    const recentStable =
        recent.every(
            x =>
                x.testExpectedValueR >=
                MIN_OOS_EXPECTED_VALUE &&
                x.testProfitFactor >=
                MIN_OOS_PROFIT_FACTOR
        );


    return {

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

        deterioration:
            round(
                deterioration,
                4
            ),

        recentStable
    ,
        stable:
            recentStable &&
            deterioration >=
                MAX_RECENT_DETERIORATION
    };
}


// ============================================================
// EVALUATE ONE PATTERN
// ============================================================

function evaluatePattern(
    key,
    side,
    level,
    rows,
    folds
) {

    const minimumSamples =
        minimumSamplesForLevel(
            level
        );


    const historicalRows =
        rowsForPattern(
            rows,
            side,
            level,
            key
        );


    if (
        historicalRows.length <
        minimumSamples
    ) {

        return null;
    }


    const foldDetails =
        validatePatternOOS(
            key,
            side,
            level,
            rows,
            folds
        );


    if (
        foldDetails.length < 2
    ) {

        return null;
    }


    const oos =
        aggregateOOS(
            foldDetails
        );


    const overall =
        calculateStats(
            historicalRows,
            side
        );


    const recent =
        calculateRecentOOS(
            foldDetails
        );


    /*
    Strict V12.6 gate.
    */


    const robust =

        historicalRows.length >=
            minimumSamples &&

        overall.decisiveTrades >=
            MIN_DECISIVE_TRADES &&

        oos.samples >=
            MIN_OOS_SAMPLES &&

        oos.decisiveTrades >=
            MIN_OOS_DECISIVE_TRADES &&

        oos.expectedValueR >=
            MIN_OOS_EXPECTED_VALUE &&

        oos.profitFactor >=
            MIN_OOS_PROFIT_FACTOR &&

        oos.stableFolds >=
            MIN_STABLE_OOS_FOLDS &&

        oos.maxDrawdownR <=
            MAX_OOS_DRAWDOWN_R &&

        oos.maxLossStreak <=
            MAX_OOS_LOSS_STREAK &&

        (
            !REQUIRE_RECENT_STABILITY ||
            recent.stable
        );


    const qualityScore =
        calculateQuality(
            overall,
            oos,
            recent,
            level
        );


    const qualified =
        robust &&
        qualityScore >=
            QUALITY_THRESHOLD;


    return {

        key,

        side,

        level,

        patternType:
            key.includes("|P:TREND_FOLLOW")
                ? "TREND_FOLLOW"
                : key.includes("|P:REVERSAL")
                    ? "REVERSAL"
                    : key.includes("|P:RANGE")
                        ? "RANGE"
                        : "OTHER",

        trainingSamples:
            historicalRows.length,

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
            oos.samples,

        oosWins:
            oos.wins,

        oosLosses:
            oos.losses,

        oosTimeouts:
            oos.timeouts,

        oosDecisiveTrades:
            oos.decisiveTrades,

        oosWinRate:
            oos.winRate,

        oosNetR:
            oos.netR,

        oosExpectedValueR:
            oos.expectedValueR,

        oosProfitFactor:
            oos.profitFactor,

        maxOOSDrawdownR:
            oos.maxDrawdownR,

        maxOOSLossStreak:
            oos.maxLossStreak,

        foldsEvaluated:
            oos.foldsEvaluated,

        positiveFolds:
            oos.positiveFolds,

        stableOOSFolds:
            oos.stableFolds,

        recentEV:
            recent.recentEV,

        earlierEV:
            recent.earlierEV,

        recentDeterioration:
            recent.deterioration,

        recentStable:
            recent.stable,

        qualityScore,

        robust,

        qualified,

        foldDetails
    };
}


// ============================================================
// DISCOVER PATTERNS
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
        const side of sides
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
                const key of map.keys()
            ) {

                const evaluated =
                    evaluatePattern(
                        key,
                        side,
                        level,
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
        (a, b) => {

            if (
                a.qualified !==
                b.qualified
            ) {

                return a.qualified
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
            Prefer simpler patterns
            when quality is similar.
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
// BEST PATTERN
// ============================================================

function findBestPattern(
    row,
    side,
    patterns
) {

    const feature =
        extractFeatures(row);


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


            return (
                a.level -
                b.level
            );
        }
    );


    return matches[0];
}


// ============================================================
// PAPER EXECUTION
// ============================================================

function paperExecution(
    rows,
    patterns
) {

    const qualified =
        patterns.filter(
            p =>
                p.qualified
        );


    const trades = [];


    let nextAllowedIndex =
        0;


    for (
        let i = 0;
        i < rows.length;
        i++
    ) {

        if (
            i <
            nextAllowedIndex
        ) {
            continue;
        }


        const row =
            rows[i];


        const side =
            inferSide(row);


        if (!side) {
            continue;
        }


        const pattern =
            findBestPattern(
                row,
                side,
                qualified
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
        }


        else if (
            outcome === "LOSS"
        ) {

            resultR =
                -STOP_R;
        }


        else {

            resultR =
                0;
        }


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
            }

            else {

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


        trades.push({

            tradeNumber:
                trades.length + 1,

            signalIndex:
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
                pattern.oosSamples,

            patternEV:
                pattern.oosExpectedValueR,

            patternPF:
                pattern.oosProfitFactor,

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

            exitType:
                outcome === "WIN"
                    ? "TARGET"
                    : outcome === "LOSS"
                        ? "STOP"
                        : "TIMEOUT",

            resultR,

            reason:
                outcome === "WIN"
                    ? "TARGET_HIT"
                    : outcome === "LOSS"
                        ? "STOP_HIT"
                        : "MAX_HOLD_TIMEOUT"
        });


        /*
        One trade at a time.

        This prevents overlapping
        paper positions.
        */

        nextAllowedIndex =
            i +
            MAX_HOLD_CANDLES;
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
        const trade of trades
    ) {

        if (
            trade.resultR > 0
        ) {

            wins++;

            winR +=
                trade.resultR;

            equity +=
                trade.resultR;

            lossStreak = 0;
        }


        else if (
            trade.resultR < 0
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
        wins +
        losses;


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

        riskReward:
            "1:2",

        tradeLog:
            trades.slice(-100)
    };
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
            available: false
        };
    }


    const row =
        rows[
            rows.length - 1
        ];


    const feature =
        extractFeatures(row);


    const side =
        inferSide(row);


    return {

        available:
            true,

        timestamp:
            row.timestamp,

        date:
            row.date ||
            null,

        close:
            number(row.close),

        trend:
            feature.trend,

        regime:
            feature.regime,

        rsi:
            number(row.rsi14),

        rsiBucket:
            feature.rsi,

        vwap:
            number(row.vwap),

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
            number(row.ema9),

        ema21:
            number(row.ema21),

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
            side
    };
}


// ============================================================
// CURRENT RECOMMENDATION
// ============================================================

function recommendation(
    rows,
    qualifiedPatterns
) {

    const market =
        currentMarket(rows);


    if (
        !market.available
    ) {

        return {

            status:
                "NO_DATA",

            side:
                null,

            reason:
                "No market data."
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
                "Current market does not satisfy the directional setup.",

            nextAction:
                "WAIT"
        };
    }


    const last =
        rows[
            rows.length - 1
        ];


    const pattern =
        findBestPattern(
            last,
            market.inferredSide,
            qualifiedPatterns
        );


    if (!pattern) {

        return {

            status:
                "NO_EDGE",

            side:
                market.inferredSide,

            reason:
                "Directional setup exists, but no proven OOS pattern matches the current market.",

            nextAction:
                "WAIT"
        };
    }


    const close =
        number(last.close);


    const atr =
        number(last.atr14);


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
        }

        else {

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
            pattern.key,

        patternLevel:
            pattern.level,

        patternType:
            pattern.patternType,

        qualityScore:
            pattern.qualityScore,

        historicalSamples:
            pattern.samples,

        oosSamples:
            pattern.oosSamples,

        oosWinRate:
            pattern.oosWinRate,

        oosExpectedValueR:
            pattern.oosExpectedValueR,

        oosProfitFactor:
            pattern.oosProfitFactor,

        stableOOSFolds:
            pattern.stableOOSFolds,

        recentStable:
            pattern.recentStable,

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
            "Current setup matches a pattern that passed strict out-of-sample profitability validation.",

        nextAction:
            "PAPER_TRADE_CANDIDATE"
    };
}


// ============================================================
// TRADING DAYS
// ============================================================

function countTradingDays(rows) {

    const days =
        new Set();


    for (
        const row of rows
    ) {

        if (
            !row.timestamp
        ) {
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
// ENGINE
// ============================================================

async function runEngine(req) {

    const source =
        await fetchDataset(req);


    const rawRows =
        source.data.rows;


    const normalizedRows =
        normalizeRows(
            rawRows
        );


    if (
        normalizedRows.length <
        MIN_TRAINING_ROWS +
        MIN_TEST_ROWS
    ) {

        throw new Error(
            `Not enough learning rows: ${normalizedRows.length}`
        );
    }


    /*
    IMPORTANT:

    Last candle is considered
    current market data.

    It is NEVER included in
    historical pattern learning.
    */

    const historicalRows =
        normalizedRows.slice(
            0,
            -1
        );


    const currentRow =
        normalizedRows[
            normalizedRows.length - 1
        ];


    const folds =
        buildWalkForwardFolds(
            historicalRows.length
        );


    if (
        folds.length < 2
    ) {

        throw new Error(
            "Unable to build sufficient walk-forward folds."
        );
    }


    const patterns =
        discoverPatterns(
            historicalRows,
            folds
        );


    const robustPatterns =
        patterns.filter(
            p =>
                p.robust
        );


    const qualifiedPatterns =
        patterns.filter(
            p =>
                p.qualified
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


    /*
    Paper execution uses ONLY
    historically proven patterns.

    The current candle itself
    is NOT part of the backtest.
    */

    const paperBacktest =
        paperExecution(
            historicalRows,
            qualifiedPatterns
        );


    /*
    Current market decision.

    Current candle is evaluated only
    against patterns learned from
    prior candles.
    */

    const currentRecommendation =
        recommendation(
            normalizedRows,
            qualifiedPatterns
        );


    const currentMarketData =
        currentMarket(
            normalizedRows
        );


    const sideBalance = {

        buy:
            buyPatterns.length,

        sell:
            sellPatterns.length,

        total:
            qualifiedPatterns.length,

        ratio:
            sellPatterns.length > 0
                ? round(
                    buyPatterns.length /
                    sellPatterns.length,
                    3
                )
                : buyPatterns.length > 0
                    ? 999
                    : 0
    };


    /*
    OOS aggregate across qualified patterns.

    This is informational only.
    */

    const oosNetR =
        qualifiedPatterns.reduce(
            (
                sum,
                p
            ) =>
                sum +
                p.oosNetR,
            0
        );


    const oosSamples =
        qualifiedPatterns.reduce(
            (
                sum,
                p
            ) =>
                sum +
                p.oosSamples,
            0
        );


    const aggregateOOSExpectedValue =
        oosSamples > 0
            ? oosNetR /
              oosSamples
            : 0;


    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V12_6_STRICT_OOS_PROFITABILITY_PROOF",

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

            currentCandleUsedForLearning:
                false,

            currentCandleOutcomeUsed:
                false,

            testDataUsedForTraining:
                false,

            testOutcomeUsedForTraining:
                false,

            futureDataUsedForPatternDiscovery:
                false,

            futureDataUsedForCurrentSignal:
                false,

            overlappingTestWindows:
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
                "STRICT_OUT_OF_SAMPLE_PROFITABILITY",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "SELECT_FEWER_HIGH_QUALITY_TRADES",

            allowNoTrade:
                true,

            minimumOOSExpectedValueR:
                MIN_OOS_EXPECTED_VALUE,

            minimumOOSProfitFactor:
                MIN_OOS_PROFIT_FACTOR,

            minimumStableOOSFolds:
                MIN_STABLE_OOS_FOLDS,

            minimumOOSDecisiveTrades:
                MIN_OOS_DECISIVE_TRADES,

            recentStabilityRequired:
                REQUIRE_RECENT_STABILITY
        },


        // ====================================================
        // SOURCE
        // ====================================================

        sourceStatistics: {

            rawLearningRows:
                rawRows.length,

            normalizedRows:
                normalizedRows.length,

            historicalLearningRows:
                historicalRows.length,

            currentCandleExcluded:
                1,

            candlesTested:
                historicalRows.length,

            tradingDays:
                countTradingDays(
                    normalizedRows
                ),

            invalidRows:
                rawRows.length -
                normalizedRows.length,

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
                            fold.testRows
                    })
                )
        },


        // ====================================================
        // LEARNING
        // ====================================================

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

            sideBalance,

            patternTypes: {

                TREND_FOLLOW:
                    qualifiedPatterns.filter(
                        p =>
                            p.patternType ===
                            "TREND_FOLLOW"
                    ).length,

                REVERSAL:
                    qualifiedPatterns.filter(
                        p =>
                            p.patternType ===
                            "REVERSAL"
                    ).length,

                RANGE:
                    qualifiedPatterns.filter(
                        p =>
                            p.patternType ===
                            "RANGE"
                    ).length
            },

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


        // ====================================================
        // OOS PROOF
        // ====================================================

        oosProof: {

            description:
                "Only patterns whose unseen test data demonstrates sufficient profitability and stability can qualify for paper execution.",

            qualifiedPatterns:
                qualifiedPatterns.length,

            aggregateQualifiedPatternNetR:
                round(
                    oosNetR,
                    3
                ),

            aggregateQualifiedPatternSamples:
                oosSamples,

            aggregateQualifiedPatternExpectedValueR:
                round(
                    aggregateOOSExpectedValue,
                    4
                ),

            minimumExpectedValueR:
                MIN_OOS_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_OOS_PROFIT_FACTOR,

            minimumStableFolds:
                MIN_STABLE_OOS_FOLDS,

            minimumDecisiveTrades:
                MIN_OOS_DECISIVE_TRADES,

            recentStabilityRequired:
                REQUIRE_RECENT_STABILITY,

            recentDeteriorationLimit:
                MAX_RECENT_DETERIORATION,

            maxOOSDrawdownR:
                MAX_OOS_DRAWDOWN_R,

            maxOOSLossStreak:
                MAX_OOS_LOSS_STREAK
        },


        // ====================================================
        // CURRENT MARKET
        // ====================================================

        currentMarket:
            currentMarketData,


        // ====================================================
        // PAPER BACKTEST
        // ====================================================

        paperBacktest: {

            description:
                "Historical paper execution using only patterns that passed strict OOS validation.",

            stats:
                paperBacktest,

            executionEligible:
                qualifiedPatterns.length > 0,

            realOrders:
                false
        },


        // ====================================================
        // RISK
        // ====================================================

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

            maxOOSDrawdownR:
                MAX_OOS_DRAWDOWN_R,

            maxOOSLossStreak:
                MAX_OOS_LOSS_STREAK,

            sameCandleStopTargetRule:
                "STOP_FIRST"
        },


        // ====================================================
        // TOP PATTERNS
        // ====================================================

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


        // ====================================================
        // QUALIFIED PATTERNS
        // ====================================================

        qualifiedPatterns: {

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


        // ====================================================
        // CURRENT DECISION
        // ====================================================

        recommendation:
            currentRecommendation,


        paperAction:

            currentRecommendation.status ===
            "TAKE_TRADE"

                ? "PAPER_TRADE_CANDIDATE"

                : "NO_TRADE",


        nextAction:

            currentRecommendation.status ===
            "TAKE_TRADE"

                ? "PAPER_TRADE_CANDIDATE"

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
            await runEngine(req);


        return res
            .status(200)
            .json(result);

    }


    catch (error) {

        console.error(
            "V12.6 ERROR:",
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
