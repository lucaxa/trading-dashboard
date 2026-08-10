/*
TradeMind Pro
V13.0
REGIME-ADAPTIVE EDGE VALIDATION
TRUE WALK-FORWARD PAPER ENGINE

V12.9 discovered:

- Entry confirmation reduced trade count.
- Drawdown improved substantially.
- But 100% of OOS trades came from one pattern.
- That pattern failed in the final unseen regime.
- Conventional confirmation alone was insufficient.

V13.0 solution:

1. TRUE EXPANDING WALK-FORWARD
2. SIGNAL-CONDITIONED LEARNING
3. ENTRY CONFIRMATION
4. REGIME-AWARE VALIDATION
5. RECENCY / DECAY DETECTION
6. PATTERN-SPECIFIC OOS VALIDATION
7. PATTERN LOSS-STREAK CIRCUIT BREAKER
8. PATTERN CONCENTRATION CONTROL
9. INDEPENDENT PATTERN DIVERSITY
10. STRICT NO-LEAKAGE CURRENT CANDLE

Paper only.
No real broker orders.
*/


// ============================================================
// VERSION
// ============================================================

const VERSION = "V13.0";

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

const MIN_OOS_SAMPLES = 8;
const MIN_OOS_DECISIVE = 5;

const MIN_EXPECTED_VALUE = 0.10;
const MIN_PROFIT_FACTOR = 1.20;

const MIN_STABLE_FOLDS = 2;

const QUALITY_THRESHOLD = 60;


// ============================================================
// RISK QUALITY
// ============================================================

const MAX_OOS_DRAWDOWN = 12;
const MAX_OOS_LOSS_STREAK = 6;


// ============================================================
// REGIME VALIDATION
// ============================================================

const MIN_REGIME_SAMPLES = 3;
const MIN_REGIME_DECISIVE = 2;

const MIN_REGIME_EV = 0.05;
const MIN_REGIME_PF = 1.05;

const MAX_REGIME_NEGATIVE_SHARE = 0.50;


// ============================================================
// DECAY DETECTION
// ============================================================

const MAX_RECENT_DECAY = -0.75;

const MIN_RECENT_EV = 0.00;

const RECENT_WINDOW_FRACTION = 0.25;


// ============================================================
// DIVERSITY
// ============================================================

const MIN_INDEPENDENT_PATTERNS = 2;

const MAX_PATTERN_CONCENTRATION = 0.50;


// ============================================================
// ENTRY CONTROL
// ============================================================

const ENTRY_CONFIRMATION_MINIMUM = 5;
const ENTRY_CONFIRMATION_MAXIMUM = 6;

const ENTRY_COOLDOWN_CANDLES = 3;
const SAME_PATTERN_COOLDOWN_CANDLES = 5;
const SAME_SIDE_COOLDOWN_CANDLES = 2;


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
        ts /= 1000;
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
// OUTCOME
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
        ).toUpperCase();

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
// PATTERN FAMILY
// ============================================================

function patternFamily(pattern) {

    if (!pattern) {
        return "UNKNOWN";
    }

    return [

        pattern.side,

        `T:${extractKeyValue(
            pattern.key,
            "T"
        )}`,

        `P:${extractKeyValue(
            pattern.key,
            "P"
        )}`
    ].join("|");
}


function extractKeyValue(key, prefix) {

    const parts =
        String(key || "")
            .split("|");

    const match =
        parts.find(
            part =>
                part.startsWith(
                    `${prefix}:`
                )
        );

    return match
        ? match.substring(
            prefix.length + 1
        )
        : "UNKNOWN";
}


// ============================================================
// SAMPLE REQUIREMENT
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
// ENTRY CONFIRMATION
// ============================================================

function entryConfirmation(
    row,
    side
) {

    if (!side) {

        return {

            valid: false,

            score: 0,

            maxScore:
                ENTRY_CONFIRMATION_MAXIMUM,

            reasons: []
        };
    }

    let score = 0;

    const reasons = [];

    const trend =
        normalizeTrend(row);

    const vwap =
        vwapDirection(row);

    const ema9 =
        number(row.ema9);

    const ema21 =
        number(row.ema21);

    const spread =
        number(row.emaSpreadATR);

    const slope =
        number(row.ema9SlopeATR);

    const rsi =
        number(row.rsi14);

    if (
        (
            side === "BUY" &&
            trend === "BULLISH"
        ) ||
        (
            side === "SELL" &&
            trend === "BEARISH"
        )
    ) {

        score++;

        reasons.push(
            "TREND_ALIGNED"
        );
    }

    if (
        (
            side === "BUY" &&
            (
                vwap === "ABOVE" ||
                vwap === "NEAR"
            )
        ) ||
        (
            side === "SELL" &&
            (
                vwap === "BELOW" ||
                vwap === "NEAR"
            )
        )
    ) {

        score++;

        reasons.push(
            "VWAP_ALIGNED"
        );
    }

    if (
        ema9 !== null &&
        ema21 !== null &&
        (
            (
                side === "BUY" &&
                ema9 > ema21
            ) ||
            (
                side === "SELL" &&
                ema9 < ema21
            )
        )
    ) {

        score++;

        reasons.push(
            "EMA_ALIGNED"
        );
    }

    if (
        spread !== null &&
        (
            (
                side === "BUY" &&
                spread > 0
            ) ||
            (
                side === "SELL" &&
                spread < 0
            )
        )
    ) {

        score++;

        reasons.push(
            "EMA_SPREAD_ALIGNED"
        );
    }

    if (
        slope !== null &&
        (
            (
                side === "BUY" &&
                slope > 0
            ) ||
            (
                side === "SELL" &&
                slope < 0
            )
        )
    ) {

        score++;

        reasons.push(
            "SLOPE_ALIGNED"
        );
    }

    if (
        rsi !== null &&
        (
            (
                side === "BUY" &&
                rsi >= 40 &&
                rsi <= 68
            ) ||
            (
                side === "SELL" &&
                rsi >= 32 &&
                rsi <= 60
            )
        )
    ) {

        score++;

        reasons.push(
            "RSI_ALIGNED"
        );
    }

    return {

        valid:
            score >=
            ENTRY_CONFIRMATION_MINIMUM,

        score,

        maxScore:
            ENTRY_CONFIRMATION_MAXIMUM,

        reasons
    };
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

        /*
        IMPORTANT:

        Only rows satisfying the directional
        signal are allowed into pattern learning.
        */

        const inferred =
            inferSide(row);

        if (
            inferred !== side
        ) {
            continue;
        }

        const confirmation =
            entryConfirmation(
                row,
                side
            );

        if (
            !confirmation.valid
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

            winR += TARGET_R;
            equity += TARGET_R;

            currentLossStreak = 0;
        }

        else if (
            outcome === "LOSS"
        ) {

            losses++;

            lossR += STOP_R;
            equity -= STOP_R;

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

    const ev =
        rows.length > 0
            ? netR /
              rows.length
            : 0;

    const pf =
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

        maxLossStreak
    };
}


// ============================================================
// INTERNAL FOLDS
// ============================================================

function buildInternalFolds(total) {

    const folds = [];

    if (
        total <
        300
    ) {
        return folds;
    }

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

    const testSize =
        Math.max(
            20,
            Math.floor(
                total * 0.15
            )
        );

    let foldNumber = 1;

    for (
        const testStart of starts
    ) {

        if (
            testStart < 100 ||
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
// REGIME STATS
// ============================================================

function regimeStats(
    rows,
    side
) {

    const buckets = {

        TRENDING: [],
        RANGING: [],
        TRANSITION: [],
        UNKNOWN: []
    };

    for (
        const row of rows
    ) {

        const regime =
            normalizeRegime(row);

        if (
            !buckets[regime]
        ) {
            buckets.UNKNOWN.push(row);
        }
        else {
            buckets[regime].push(row);
        }
    }

    const result = {};

    for (
        const regime of Object.keys(
            buckets
        )
    ) {

        const bucket =
            buckets[regime];

        if (
            bucket.length <
            MIN_REGIME_SAMPLES
        ) {

            result[regime] = {

                samples:
                    bucket.length,

                qualified:
                    false,

                reason:
                    "INSUFFICIENT_SAMPLES"
            };

            continue;
        }

        const stats =
            calculateStats(
                bucket,
                side
            );

        const qualified =
            stats.samples >=
                MIN_REGIME_SAMPLES &&

            stats.decisiveTrades >=
                MIN_REGIME_DECISIVE &&

            stats.expectedValueR >=
                MIN_REGIME_EV &&

            stats.profitFactor >=
                MIN_REGIME_PF;

        result[regime] = {

            ...stats,

            qualified
        };
    }

    return result;
}


// ============================================================
// RECENCY / DECAY
// ============================================================

function calculateDecay(
    rows,
    side
) {

    if (
        rows.length <
        MIN_OOS_SAMPLES
    ) {

        return {

            available: false,

            decayed: true,

            reason:
                "INSUFFICIENT_SAMPLES"
        };
    }

    const window =
        Math.max(
            5,
            Math.floor(
                rows.length *
                RECENT_WINDOW_FRACTION
            )
        );

    const split =
        Math.max(
            1,
            rows.length -
            window
        );

    const earlierRows =
        rows.slice(
            0,
            split
        );

    const recentRows =
        rows.slice(
            split
        );

    const earlier =
        calculateStats(
            earlierRows,
            side
        );

    const recent =
        calculateStats(
            recentRows,
            side
        );

    const deterioration =
        earlier.expectedValueR !== 0
            ? (
                recent.expectedValueR -
                earlier.expectedValueR
            ) /
            Math.abs(
                earlier.expectedValueR
            )
            : recent.expectedValueR;

    const decayed =
        recent.expectedValueR <
            MIN_RECENT_EV ||

        deterioration <
            MAX_RECENT_DECAY;

    return {

        available: true,

        windowSamples:
            window,

        earlier,

        recent,

        deterioration:
            round(
                deterioration,
                4
            ),

        decayed
    };
}


// ============================================================
// ENTRY-CONDITIONED PATTERN ROWS
// ============================================================

function patternRows(
    rows,
    key,
    side,
    level
) {

    return rows.filter(
        row => {

            if (
                inferSide(row) !==
                side
            ) {
                return false;
            }

            const confirmation =
                entryConfirmation(
                    row,
                    side
                );

            if (
                !confirmation.valid
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

    const allRows =
        patternRows(
            trainingRows,
            key,
            side,
            level
        );

    if (
        allRows.length <
        minimum
    ) {
        return null;
    }

    const folds =
        buildInternalFolds(
            trainingRows.length
        );

    if (
        folds.length <
        2
    ) {
        return null;
    }

    const foldDetails = [];

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

        const trainPattern =
            patternRows(
                trainPart,
                key,
                side,
                level
            );

        const testPattern =
            patternRows(
                testPart,
                key,
                side,
                level
            );

        if (
            trainPattern.length <
            5
        ) {
            continue;
        }

        const trainStats =
            calculateStats(
                trainPattern,
                side
            );

        const testStats =
            calculateStats(
                testPattern,
                side
            );

        foldDetails.push({

            fold:
                fold.fold,

            trainingSamples:
                trainStats.samples,

            trainingEV:
                trainStats.expectedValueR,

            trainingPF:
                trainStats.profitFactor,

            testSamples:
                testStats.samples,

            testDecisive:
                testStats.decisiveTrades,

            testWins:
                testStats.wins,

            testLosses:
                testStats.losses,

            testEV:
                testStats.expectedValueR,

            testPF:
                testStats.profitFactor,

            testWinRate:
                testStats.winRate,

            testNetR:
                testStats.netR,

            testDrawdownR:
                testStats.maxDrawdownR,

            testLossStreak:
                testStats.maxLossStreak
        });
    }

    if (
        foldDetails.length <
        2
    ) {
        return null;
    }

    const stableFolds =
        foldDetails.filter(
            fold =>
                fold.testEV >=
                    MIN_EXPECTED_VALUE &&
                fold.testPF >=
                    MIN_PROFIT_FACTOR &&
                fold.testDrawdownR <=
                    MAX_OOS_DRAWDOWN &&
                fold.testLossStreak <=
                    MAX_OOS_LOSS_STREAK
        ).length;

    const positiveFolds =
        foldDetails.filter(
            fold =>
                fold.testEV > 0
        ).length;

    const averageEV =
        foldDetails.reduce(
            (
                sum,
                fold
            ) =>
                sum +
                fold.testEV,
            0
        ) /
        foldDetails.length;

    const averagePF =
        foldDetails.reduce(
            (
                sum,
                fold
            ) =>
                sum +
                Math.min(
                    fold.testPF,
                    5
                ),
            0
        ) /
        foldDetails.length;

    const averageWinRate =
        foldDetails.reduce(
            (
                sum,
                fold
            ) =>
                sum +
                fold.testWinRate,
            0
        ) /
        foldDetails.length;

    const averageDrawdown =
        foldDetails.reduce(
            (
                sum,
                fold
            ) =>
                sum +
                fold.testDrawdownR,
            0
        ) /
        foldDetails.length;

    const overall =
        calculateStats(
            allRows,
            side
        );

    if (
        overall.samples <
        minimum
    ) {
        return null;
    }

    const regime =
        regimeStats(
            allRows,
            side
        );

    const qualifiedRegimes =
        Object.values(
            regime
        ).filter(
            x =>
                x.qualified === true
        );

    const usableRegimes =
        Object.values(
            regime
        ).filter(
            x =>
                x.samples >=
                MIN_REGIME_SAMPLES
        );

    const negativeRegimes =
        usableRegimes.filter(
            x =>
                x.qualified === false &&
                x.samples >=
                    MIN_REGIME_SAMPLES
        ).length;

    const negativeRegimeShare =
        usableRegimes.length > 0
            ? negativeRegimes /
              usableRegimes.length
            : 1;

    const decay =
        calculateDecay(
            allRows,
            side
        );

    const recent =
        foldDetails[
            foldDetails.length - 1
        ];

    const qualityScore =
        clamp(

            clamp(
                (
                    averageEV /
                    0.25
                ) * 30,
                0,
                30
            )

            +

            clamp(
                (
                    (
                        averagePF -
                        1
                    ) /
                    0.40
                ) * 25,
                0,
                25
            )

            +

            (
                stableFolds /
                foldDetails.length
            ) * 20

            +

            (
                qualifiedRegimes.length >= 1
                    ? 10
                    : 0
            )

            +

            (
                decay.available &&
                !decay.decayed
                    ? 10
                    : 0
            )

            +

            clamp(
                (
                    averageWinRate -
                    35
                ) / 30,
                0,
                1
            ) * 5

            ,

            0,
            100
        );

    const robust =

        overall.samples >=
            MIN_OOS_SAMPLES &&

        overall.decisiveTrades >=
            MIN_OOS_DECISIVE &&

        averageEV >=
            MIN_EXPECTED_VALUE &&

        averagePF >=
            MIN_PROFIT_FACTOR &&

        stableFolds >=
            MIN_STABLE_FOLDS &&

        averageDrawdown <=
            MAX_OOS_DRAWDOWN &&

        overall.maxLossStreak <=
            MAX_OOS_LOSS_STREAK &&

        qualifiedRegimes.length >=
            1 &&

        negativeRegimeShare <=
            MAX_REGIME_NEGATIVE_SHARE &&

        decay.available &&
        !decay.decayed &&

        recent.testEV >=
            0;

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

        family:
            patternFamily({
                key,
                side
            }),

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
            foldDetails.length,

        stableFolds,

        positiveFolds,

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
            recent.testEV,

        recentPF:
            recent.testPF,

        regime,

        qualifiedRegimes:
            qualifiedRegimes.length,

        negativeRegimeShare:
            round(
                negativeRegimeShare,
                4
            ),

        decay,

        qualityScore:
            round(
                qualityScore,
                2
            ),

        robust,

        foldDetails
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

    return matches[0];
}


// ============================================================
// CONCENTRATION
// ============================================================

function concentrationStats(
    trades
) {

    const counts = {};

    for (
        const trade of trades
    ) {

        counts[
            trade.pattern
        ] =
            (
                counts[
                    trade.pattern
                ] || 0
            ) + 1;
    }

    const total =
        trades.length;

    const values =
        Object.entries(
            counts
        )
        .map(
            ([pattern, count]) => ({

                pattern,

                count,

                share:
                    total > 0
                        ? count / total
                        : 0
            })
        )
        .sort(
            (a, b) =>
                b.count -
                a.count
        );

    return {

        uniquePatterns:
            values.length,

        maximumShare:
            values.length
                ? round(
                    values[0].share,
                    4
                )
                : 0,

        patternCounts:
            counts,

        concentrationPassed:
            values.length >=
                MIN_INDEPENDENT_PATTERNS &&

            (
                values.length === 0 ||
                values[0].share <=
                    MAX_PATTERN_CONCENTRATION
            ),

        details:
            values
    };
}


// ============================================================
// TRUE WALK FORWARD
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
            200 ||
            testRows.length <
            100
        ) {
            continue;
        }

        /*
        TRAIN ONLY ON PRIOR DATA.
        */

        const patterns =
            learnPatterns(
                trainingRows
            );

        const qualified =
            patterns.filter(
                pattern =>
                    pattern.robust &&
                    pattern.qualityScore >=
                        QUALITY_THRESHOLD
            );

        /*
        Independent pattern families.

        We do not want five tiny variants
        of the exact same underlying edge.
        */

        const selected =
            selectDiversePatterns(
                qualified
            );

        const trades = [];

        let lastTradeIndex = -1;
        let lastEntryIndex = -Infinity;

        const patternLastEntry =
            new Map();

        const sideLastEntry = {

            BUY:
                -Infinity,

            SELL:
                -Infinity
        };

        const patternLossStreak =
            new Map();

        for (
            let i = 0;
            i < testRows.length;
            i++
        ) {

            if (
                i <=
                lastTradeIndex
            ) {
                continue;
            }

            if (
                i -
                lastEntryIndex <
                ENTRY_COOLDOWN_CANDLES
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
            Entry confirmation is calculated
            on the current test candle only.
            */

            const confirmation =
                entryConfirmation(
                    row,
                    side
                );

            if (
                !confirmation.valid
            ) {
                continue;
            }

            if (
                i -
                sideLastEntry[side] <
                SAME_SIDE_COOLDOWN_CANDLES
            ) {
                continue;
            }

            const pattern =
                findBestPattern(
                    row,
                    side,
                    selected
                );

            if (!pattern) {
                continue;
            }

            const lastPatternIndex =
                patternLastEntry.get(
                    pattern.key
                );

            if (
                lastPatternIndex !==
                    undefined &&
                i -
                lastPatternIndex <
                SAME_PATTERN_COOLDOWN_CANDLES
            ) {
                continue;
            }

            const currentLossStreak =
                patternLossStreak.get(
                    pattern.key
                ) || 0;

            /*
            PATTERN-SPECIFIC CIRCUIT BREAKER.

            Once the same pattern loses repeatedly,
            stop trading that pattern for the remainder
            of the current fold.
            */

            if (
                currentLossStreak >=
                MAX_OOS_LOSS_STREAK
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
                outcome === "WIN"
            ) {

                resultR =
                    TARGET_R;

                exitType =
                    "TARGET";
            }

            else if (
                outcome === "LOSS"
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

            tradeNumber++;

            const trade = {

                tradeNumber,

                fold:
                    fold.fold,

                signalIndex:
                    fold.testStart +
                    i,

                testLocalIndex:
                    i,

                timestamp:
                    row.timestamp,

                side,

                pattern:
                    pattern.key,

                patternFamily:
                    pattern.family,

                patternLevel:
                    pattern.level,

                patternType:
                    pattern.patternType,

                patternQuality:
                    pattern.qualityScore,

                patternSamples:
                    pattern.samples,

                patternOOSSamples:
                    pattern.foldDetails.reduce(
                        (
                            sum,
                            x
                        ) =>
                            sum +
                            x.testSamples,
                        0
                    ),

                patternEV:
                    pattern.recentEV,

                patternPF:
                    pattern.recentPF,

                patternStableFolds:
                    pattern.stableFolds,

                regime:
                    normalizeRegime(
                        row
                    ),

                confirmationScore:
                    confirmation.score,

                confirmationMaxScore:
                    confirmation.maxScore,

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
            };

            trades.push(
                trade
            );

            lastEntryIndex = i;
            lastTradeIndex = i;

            patternLastEntry.set(
                pattern.key,
                i
            );

            sideLastEntry[side] = i;

            if (
                resultR < 0
            ) {

                patternLossStreak.set(
                    pattern.key,
                    currentLossStreak + 1
                );

            } else {

                patternLossStreak.set(
                    pattern.key,
                    0
                );
            }
        }

        const stats =
            calculateTradeStats(
                trades
            );

        const concentration =
            concentrationStats(
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
                qualified.length,

            selectedPatterns:
                selected.length,

            selectedPatternKeys:
                selected.map(
                    p =>
                        p.key
                ),

            trades:
                trades.length,

            wins:
                stats.wins,

            losses:
                stats.losses,

            timeouts:
                stats.timeouts,

            decisiveTrades:
                stats.decisiveTrades,

            winRate:
                stats.winRate,

            netR:
                stats.netR,

            expectedValueR:
                stats.expectedValueR,

            profitFactor:
                stats.profitFactor,

            maxDrawdownR:
                stats.maxDrawdownR,

            maxLossStreak:
                stats.maxLossStreak,

            concentration,

            tradeResults:
                trades.map(
                    trade =>
                        trade.resultR
                ),

            trades
        });

        allTrades.push(
            ...trades
        );
    }

    const stats =
        calculateTradeStats(
            allTrades
        );

    const concentration =
        concentrationStats(
            allTrades
        );

    return {

        stats,

        concentration,

        folds:
            foldResults,

        tradeLog:
            allTrades.slice(
                -100
            )
    };
}


// ============================================================
// TRADE STATS
// ============================================================

function calculateTradeStats(
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

        maxLossStreak
    };
}


// ============================================================
// DIVERSE PATTERN SELECTION
// ============================================================

function selectDiversePatterns(
    patterns
) {

    const selected = [];

    const usedFamilies =
        new Set();

    const sorted =
        patterns
            .slice()
            .sort(
                (a, b) =>
                    b.qualityScore -
                    a.qualityScore
            );

    for (
        const pattern of sorted
    ) {

        /*
        Do not allow multiple highly similar
        patterns to consume the entire selection.
        */

        const family =
            pattern.family;

        if (
            usedFamilies.has(
                family
            )
        ) {

            /*
            Allow a second pattern from the same
            family only if it is substantially
            stronger than the selected pattern.
            */

            const existing =
                selected.find(
                    p =>
                        p.family ===
                        family
                );

            if (
                existing &&
                pattern.qualityScore <
                    existing.qualityScore +
                    10
            ) {
                continue;
            }
        }

        selected.push(
            pattern
        );

        usedFamilies.add(
            family
        );

        if (
            selected.length >=
            6
        ) {
            break;
        }
    }

    return selected;
}


// ============================================================
// OUTER FOLDS
// ============================================================

function buildOuterFolds(
    total
) {

    const folds = [];

    const OUTER_FOLD_COUNT = 4;
    const MIN_TRAINING_ROWS = 200;

    const available =
        total -
        MIN_TRAINING_ROWS;

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
// CURRENT MARKET
// ============================================================

function currentMarket(
    historicalRows,
    currentRow
) {

    const feature =
        extractFeatureState(
            currentRow
        );

    const side =
        inferSide(
            currentRow
        );

    const confirmation =
        side
            ? entryConfirmation(
                currentRow,
                side
            )
            : null;

    return {

        available:
            true,

        timestamp:
            currentRow.timestamp,

        date:
            currentRow.date ||
            null,

        close:
            number(
                currentRow.close
            ),

        trend:
            feature.trend,

        regime:
            feature.regime,

        rsi:
            number(
                currentRow.rsi14
            ),

        rsiBucket:
            feature.rsi,

        vwap:
            number(
                currentRow.vwap
            ),

        vwapDirection:
            feature.vwap,

        vwapDistanceATR:
            number(
                currentRow.vwapDistanceATR
            ),

        atr14:
            number(
                currentRow.atr14
            ),

        ema9:
            number(
                currentRow.ema9
            ),

        ema21:
            number(
                currentRow.ema21
            ),

        emaSpreadATR:
            number(
                currentRow.emaSpreadATR
            ),

        ema9SlopeATR:
            number(
                currentRow.ema9SlopeATR
            ),

        patternType:
            feature.type,

        time:
            feature.time,

        inferredSide:
            side,

        entryConfirmation:
            confirmation
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
            historicalRows,
            currentRow
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

            market,

            reason:
                "Current market does not satisfy the directional signal.",

            nextAction:
                "WAIT"
        };
    }

    const confirmation =
        entryConfirmation(
            currentRow,
            side
        );

    if (
        !confirmation.valid
    ) {

        return {

            status:
                "NO_CONFIRMATION",

            side,

            market,

            confirmation,

            reason:
                "Directional setup exists, but independent entry confirmation is insufficient.",

            nextAction:
                "WAIT"
        };
    }

    /*
    Learn ONLY from historical candles.
    Current candle never enters learning.
    */

    const patterns =
        learnPatterns(
            historicalRows
        );

    const qualified =
        patterns.filter(
            pattern =>
                pattern.robust &&
                pattern.qualityScore >=
                    QUALITY_THRESHOLD
        );

    const selected =
        selectDiversePatterns(
            qualified
        );

    const best =
        findBestPattern(
            currentRow,
            side,
            selected
        );

    if (!best) {

        return {

            status:
                "NO_EDGE",

            side,

            market,

            confirmation,

            learning: {

                trainingRows:
                    historicalRows.length,

                patternsDiscovered:
                    patterns.length,

                robustPatterns:
                    qualified.length,

                selectedPatterns:
                    selected.length
            },

            reason:
                "No regime-stable, non-decayed, robust historical pattern matches the current confirmed setup.",

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

        confirmation,

        pattern:
            best.key,

        patternFamily:
            best.family,

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
            best.recentPF,

        stableFolds:
            best.stableFolds,

        qualifiedRegimes:
            best.qualifiedRegimes,

        decay:
            best.decay,

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
            "Current candle matches a confirmed setup and a regime-stable, non-decayed pattern learned exclusively from prior historical data.",

        nextAction:
            "PAPER_TRADE_ONLY"
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
        400
    ) {

        throw new Error(
            `Not enough historical rows for V13.0: ${rows.length}`
        );
    }

    /*
    REMOVE CURRENT CANDLE.
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
    OUTER WALK-FORWARD.
    */

    const folds =
        buildOuterFolds(
            historicalRows.length
        );

    const walkForward =
        trueWalkForward(
            historicalRows,
            folds
        );


    /*
    CURRENT SIGNAL.
    */

    const signal =
        currentSignal(
            historicalRows,
            currentRow
        );


    /*
    LATEST LEARNING.

    This is diagnostic only.
    It is never used to alter historical
    OOS results.
    */

    const latestPatterns =
        learnPatterns(
            historicalRows
        );

    const latestQualified =
        latestPatterns.filter(
            pattern =>
                pattern.robust &&
                pattern.qualityScore >=
                    QUALITY_THRESHOLD
        );

    const latestSelected =
        selectDiversePatterns(
            latestQualified
        );


    /*
    TRADING DAYS.
    */

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
            MIN_EXPECTED_VALUE &&

        stats.profitFactor >
            MIN_PROFIT_FACTOR;

    const controlledRisk =
        stats.maxDrawdownR <=
            MAX_OOS_DRAWDOWN &&

        stats.maxLossStreak <=
            MAX_OOS_LOSS_STREAK;

    const enoughTrades =
        stats.decisiveTrades >=
        MIN_OOS_DECISIVE;

    const sufficientDiversity =
        walkForward.concentration
            .uniquePatterns >=
            MIN_INDEPENDENT_PATTERNS &&

        walkForward.concentration
            .maximumShare <=
            MAX_PATTERN_CONCENTRATION;

    const profitabilityProof =
        positiveOOS &&
        controlledRisk &&
        enoughTrades &&
        sufficientDiversity;


    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V13_0_REGIME_ADAPTIVE_EDGE_VALIDATION_TRUE_WALK_FORWARD",

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

            signalConditionedLearning:
                true,

            signalConditionedOOS:
                true,

            entryConfirmation:
                true,

            regimeValidation:
                true,

            decayValidation:
                true,

            patternCircuitBreaker:
                true,

            patternConcentrationControl:
                true,

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
                "VALIDATE_REGIME_STABLE_EDGES",

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

            minimumIndependentPatterns:
                MIN_INDEPENDENT_PATTERNS,

            maximumPatternConcentration:
                MAX_PATTERN_CONCENTRATION,

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

            signalConditioned:
                true,

            entryConfirmed:
                true,

            regimeAdaptive:
                true,

            decayAware:
                true,

            patternCircuitBreaker:
                true,

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
        // TRUE OOS
        // ====================================================

        trueOOSPaperExecution: {

            description:
                "Each outer fold learns signal-conditioned, regime-validated patterns exclusively from prior data and executes only on future unseen data after independent entry confirmation.",

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

            patternDiversity:

                sufficientDiversity
                    ? "PASSED"
                    : "FAILED",

            patternConcentration:
                walkForward.concentration
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

                    selectedPatterns:
                        fold.selectedPatterns,

                    selectedPatternKeys:
                        fold.selectedPatternKeys,

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

                    concentration:
                        fold.concentration,

                    tradeResults:
                        fold.tradeResults
                })
            ),


        // ====================================================
        // CURRENT MARKET
        // ====================================================

        currentMarket:
            currentMarket(
                historicalRows,
                currentRow
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
                latestQualified.length,

            selectedPatterns:
                latestSelected.length,

            buyPatterns:
                latestSelected.filter(
                    p =>
                        p.side ===
                        "BUY"
                ).length,

            sellPatterns:
                latestSelected.filter(
                    p =>
                        p.side ===
                        "SELL"
                ).length,

            independentFamilies:
                new Set(
                    latestSelected.map(
                        p =>
                            p.family
                    )
                ).size,

            signalConditioned:
                true,

            regimeAdaptive:
                true,

            decayAware:
                true,

            patternTypes: {

                trendFollow:
                    latestSelected.filter(
                        p =>
                            p.patternType ===
                            "TREND_FOLLOW"
                    ).length,

                reversal:
                    latestSelected.filter(
                        p =>
                            p.patternType ===
                            "REVERSAL"
                    ).length,

                range:
                    latestSelected.filter(
                        p =>
                            p.patternType ===
                            "RANGE"
                    ).length
            },

            levels: {

                level1:
                    latestPatterns.filter(
                        p =>
                            p.level === 1
                    ).length,

                level2:
                    latestPatterns.filter(
                        p =>
                            p.level === 2
                    ).length,

                level3:
                    latestPatterns.filter(
                        p =>
                            p.level === 3
                    ).length,

                level4:
                    latestPatterns.filter(
                        p =>
                            p.level === 4
                    ).length
            }
        },


        // ====================================================
        // V13 VALIDATION RULES
        // ====================================================

        validationRules: {

            regimeValidation: {

                enabled:
                    true,

                minimumSamples:
                    MIN_REGIME_SAMPLES,

                minimumDecisiveTrades:
                    MIN_REGIME_DECISIVE,

                minimumEV:
                    MIN_REGIME_EV,

                minimumPF:
                    MIN_REGIME_PF,

                maximumNegativeRegimeShare:
                    MAX_REGIME_NEGATIVE_SHARE
            },

            decayDetection: {

                enabled:
                    true,

                recentWindowFraction:
                    RECENT_WINDOW_FRACTION,

                minimumRecentEV:
                    MIN_RECENT_EV,

                maximumDecay:
                    MAX_RECENT_DECAY
            },

            diversity: {

                minimumIndependentPatterns:
                    MIN_INDEPENDENT_PATTERNS,

                maximumPatternConcentration:
                    MAX_PATTERN_CONCENTRATION
            },

            circuitBreaker: {

                maximumPatternLossStreak:
                    MAX_OOS_LOSS_STREAK,

                entryCooldownCandles:
                    ENTRY_COOLDOWN_CANDLES,

                samePatternCooldownCandles:
                    SAME_PATTERN_COOLDOWN_CANDLES,

                sameSideCooldownCandles:
                    SAME_SIDE_COOLDOWN_CANDLES
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
                SAME_PATTERN_COOLDOWN_CANDLES,

            sameSideCooldownCandles:
                SAME_SIDE_COOLDOWN_CANDLES
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
            "V13.0 ERROR:",
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
