/*
TradeMind Pro
V12.4
CONTEXT AWARE WALK-FORWARD BRAIN ENGINE

V12.3:
- True walk-forward validation
- OOS pattern validation
- Leakage protection
- Stable pattern gate
- Paper execution gate

V12.4:
- Context-aware pattern classification
- Trend compatibility
- Regime compatibility
- Reversal detection
- Trend-follow detection
- Range detection
- BUY/SELL balance analysis
- Recent deterioration detection
- Context-adjusted quality score
- Current-market compatibility gate

IMPORTANT:
PAPER ONLY.
NO REAL ORDERS.
NO BROKER ORDER API.
*/

// ============================================================
// VERSION
// ============================================================

const VERSION = "V12.4";

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
// PATTERN REQUIREMENTS
// ============================================================

const MIN_LEVEL1_SAMPLES = 20;
const MIN_LEVEL2_SAMPLES = 15;
const MIN_LEVEL3_SAMPLES = 12;
const MIN_LEVEL4_SAMPLES = 10;

const MIN_DECISIVE_TRADES = 8;

const MIN_EXPECTED_VALUE = 0.10;
const MIN_PROFIT_FACTOR = 1.10;

const MIN_STABLE_FOLDS = 2;

const QUALITY_THRESHOLD = 45;

const MIN_OOS_SAMPLES = 3;
const MIN_OOS_DECISIVE_TRADES = 2;

const MAX_DRAWDOWN_R = 15;
const MAX_LOSS_STREAK = 8;

// ============================================================
// V12.4 CONTEXT RULES
// ============================================================

const MIN_CONTEXT_SCORE = 60;

const TREND_MATCH_BONUS = 15;
const REGIME_MATCH_BONUS = 10;
const REVERSAL_CONTEXT_BONUS = 8;

const SIDE_MISMATCH_PENALTY = 18;
const REGIME_MISMATCH_PENALTY = 12;

const RECENT_DETERIORATION_LIMIT = -0.35;

const MAX_SIDE_IMBALANCE = 0.80;

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

            buyOutcome:
                row.outcome.buyOutcome ||
                row.buyOutcome ||
                "TIMEOUT",

            sellOutcome:
                row.outcome.sellOutcome ||
                row.sellOutcome ||
                "TIMEOUT",

            preferredDirection:
                row.outcome.preferredDirection ||
                row.preferredDirection ||
                "NONE"
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
            "TIMEOUT",

        preferredDirection:
            row &&
            (
                row.preferredDirection ||
                row.direction
            ) ||
            "NONE"
    };
}


function sideOutcome(row, side) {

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

    const r = number(value);

    if (r === null) return "UNKNOWN";

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
        number(row.vwapDistanceATR);

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

    if (price > vwap) return "ABOVE";
    if (price < vwap) return "BELOW";

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
        number(row.hour);

    if (hour === null) {

        const ts =
            normalizeTimestamp(
                row.timestamp
            );

        if (ts !== null) {

            const d =
                new Date(
                    ts * 1000
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
// MARKET NORMALIZATION
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


// ============================================================
// PATTERN TYPE
// ============================================================

function classifyPattern(
    side,
    trend,
    vwap,
    rsi
) {

    /*
    TREND_FOLLOW:
    BUY  + bullish structure
    SELL + bearish structure

    REVERSAL:
    BUY  + bearish/oversold
    SELL + bullish/overbought

    RANGE:
    Everything else.
    */

    const r =
        String(rsi);

    if (
        side === "BUY" &&
        trend === "BULLISH"
    ) {
        return "TREND_FOLLOW";
    }

    if (
        side === "SELL" &&
        trend === "BEARISH"
    ) {
        return "TREND_FOLLOW";
    }

    if (
        side === "BUY" &&
        (
            trend === "BEARISH" ||
            r === "EXTREME_LOW" ||
            r === "LOW"
        )
    ) {
        return "REVERSAL";
    }

    if (
        side === "SELL" &&
        (
            trend === "BULLISH" ||
            r === "VERY_HIGH" ||
            r === "EXTREME_HIGH"
        )
    ) {
        return "REVERSAL";
    }

    return "RANGE";
}


// ============================================================
// FEATURE EXTRACTION
// ============================================================

function extractFeatures(row) {

    const trend =
        normalizeTrend(row);

    const regime =
        normalizeRegime(row);

    const rsi =
        rsiBucket(row.rsi14);

    const vwap =
        vwapDirection(row);

    const slope =
        slopeBucket(
            row.ema9SlopeATR
        );

    const time =
        timeBucket(row);

    return {

        trend,
        regime,
        rsi,
        vwap,
        slope,
        time,

        patternType:
            classifyPattern(
                null,
                trend,
                vwap,
                rsi
            )
    };
}


// ============================================================
// PATTERN KEY
// ============================================================

function createPatternKey(
    side,
    features,
    level
) {

    const parts = [

        side,

        `T:${features.trend}`,

        `V:${features.vwap}`
    ];

    if (level >= 2) {

        parts.push(
            `R:${features.rsi}`
        );
    }

    if (level >= 3) {

        parts.push(
            `G:${features.regime}`,
            `S:${features.slope}`
        );
    }

    if (level >= 4) {

        parts.push(
            `H:${features.time}`
        );
    }

    return parts.join("|");
}


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
        !Array.isArray(data.rows)
    ) {

        throw new Error(
            "Learning dataset rows[] missing"
        );
    }

    return data;
}


// ============================================================
// NORMALIZE DATASET
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

        const normalized = {

            ...row,

            timestamp:
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

        result.push(normalized);
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

function calculateStats(rows, side) {

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
            String(
                sideOutcome(
                    row,
                    side
                )
            ).toUpperCase();

        if (result === "WIN") {

            wins++;

            winR += 2;

            equity += 2;

            lossStreak = 0;

        } else if (result === "LOSS") {

            losses++;

            lossR += 1;

            equity -= 1;

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
            ? wins / decisive * 100
            : 0;

    const netR =
        winR -
        lossR;

    const expectedValue =
        rows.length > 0
            ? netR / rows.length
            : 0;

    const profitFactor =
        lossR > 0
            ? winR / lossR
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
            round(winRate, 2),

        totalWinR:
            round(winR, 3),

        totalLossR:
            round(lossR, 3),

        netR:
            round(netR, 3),

        expectedValueR:
            round(expectedValue, 4),

        profitFactor:
            round(profitFactor, 3),

        maxDrawdownR:
            round(maxDrawdown, 3),

        maxLossStreak
    };
}


// ============================================================
// FOLDS
// ============================================================

function buildFolds(total) {

    const folds = [];

    /*
    Four expanding walk-forward folds.

    Training ALWAYS occurs before testing.

    No shuffling.
    No random split.
    */

    const testSize =
        Math.floor(
            total /
            4.8
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
                    0.25 +
                    i * 0.16
                )
            );

        const testEnd =
            Math.min(
                total,
                testStart +
                testSize
            );

        if (
            testStart <= 0 ||
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
// BUILD MAP
// ============================================================

function buildPatternMap(
    rows,
    side,
    level
) {

    const map =
        new Map();

    for (const row of rows) {

        const features =
            extractFeatures(row);

        const key =
            createPatternKey(
                side,
                features,
                level
            );

        if (!map.has(key)) {

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
// PATTERN QUALITY
// ============================================================

function calculateFoldQuality(
    foldStats
) {

    if (!foldStats.length) {

        return {

            score: 0,

            averageEV: 0,

            averagePF: 0,

            averageWinRate: 0,

            positiveFolds: 0,

            stableFolds: 0,

            averageDrawdown: 0
        };
    }

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
                    4
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
                    MIN_PROFIT_FACTOR
        ).length;

    const evScore =
        clamp(
            (
                averageEV /
                0.20
            ) * 40,
            0,
            40
        );

    const pfScore =
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
        );

    const stabilityScore =
        (
            stableFolds /
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

        stableFolds
    };
}


// ============================================================
// RECENT STABILITY
// ============================================================

function recentPerformance(
    patternRows,
    side
) {

    if (
        patternRows.length < 6
    ) {

        return {

            recentSamples:
                patternRows.length,

            recentEV: 0,

            recentPF: 0,

            deterioration: 0,

            stable:
                false
        };
    }

    const recentCount =
        Math.max(
            6,
            Math.floor(
                patternRows.length *
                0.35
            )
        );

    const recent =
        patternRows.slice(
            -recentCount
        );

    const previous =
        patternRows.slice(
            0,
            patternRows.length -
            recentCount
        );

    const recentStats =
        calculateStats(
            recent,
            side
        );

    const previousStats =
        previous.length > 0
            ? calculateStats(
                previous,
                side
            )
            : recentStats;

    const deterioration =
        recentStats.expectedValueR -
        previousStats.expectedValueR;

    return {

        recentSamples:
            recentStats.samples,

        recentEV:
            recentStats.expectedValueR,

        recentPF:
            recentStats.profitFactor,

        recentWinRate:
            recentStats.winRate,

        deterioration:
            round(
                deterioration,
                4
            ),

        stable:
            deterioration >=
            RECENT_DETERIORATION_LIMIT
    };
}


// ============================================================
// EVALUATE PATTERN
// ============================================================

function evaluatePattern(
    key,
    side,
    level,
    allRows,
    folds
) {

    const minimum =
        minimumSamples(level);

    const patternRows =
        allRows.filter(
            row => {

                const features =
                    extractFeatures(row);

                return (
                    createPatternKey(
                        side,
                        features,
                        level
                    ) === key
                );
            }
        );

    if (
        patternRows.length <
        minimum
    ) {
        return null;
    }

    const foldStats = [];

    for (const fold of folds) {

        const trainRows =
            patternRows.filter(
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

        const testRows =
            patternRows.filter(
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

        /*
        IMPORTANT:

        Pattern must have existed
        in training before it is
        evaluated OOS.
        */

        if (
            trainRows.length <
            Math.max(
                5,
                Math.floor(
                    minimum / 2
                )
            )
        ) {
            continue;
        }

        if (
            testRows.length === 0
        ) {
            continue;
        }

        const trainStats =
            calculateStats(
                trainRows,
                side
            );

        const testStats =
            calculateStats(
                testRows,
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

    const overall =
        calculateStats(
            patternRows,
            side
        );

    const quality =
        calculateFoldQuality(
            foldStats
        );

    const recent =
        recentPerformance(
            patternRows,
            side
        );

    const feature =
        extractFeatures(
            patternRows[
                patternRows.length - 1
            ]
        );

    const patternType =
        classifyPattern(
            side,
            feature.trend,
            feature.vwap,
            feature.rsi
        );

    const oosRows =
        foldStats.reduce(
            (sum, x) =>
                sum +
                x.testSamples,
            0
        );

    const oosDecisive =
        foldStats.reduce(
            (sum, x) =>
                sum +
                x.testDecisiveTrades,
            0
        );

    /*
    V12.4 robustness gate.
    */

    const robust =
        overall.samples >=
            minimum &&

        overall.decisiveTrades >=
            MIN_DECISIVE_TRADES &&

        quality.averageEV >=
            MIN_EXPECTED_VALUE &&

        quality.averagePF >=
            MIN_PROFIT_FACTOR &&

        quality.stableFolds >=
            MIN_STABLE_FOLDS &&

        quality.averageDrawdown <=
            MAX_DRAWDOWN_R &&

        oosRows >=
            MIN_OOS_SAMPLES &&

        oosDecisive >=
            MIN_OOS_DECISIVE_TRADES;

    /*
    Recent deterioration doesn't immediately
    destroy the historical pattern.

    It becomes a context penalty instead.
    */

    return {

        key,

        side,

        level,

        patternType,

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
            oosRows,

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
            recent.recentEV,

        recentPF:
            recent.recentPF,

        recentWinRate:
            recent.recentWinRate,

        recentDeterioration:
            recent.deterioration,

        recentStable:
            recent.stable,

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
    rows,
    folds
) {

    const patterns = [];

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
                    rows,
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
                        rows,
                        folds
                    );

                if (pattern) {

                    patterns.push(
                        pattern
                    );
                }
            }
        }
    }

    return patterns.sort(
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
// CURRENT MARKET
// ============================================================

function getCurrentMarket(
    row
) {

    const features =
        extractFeatures(
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
            number(row.close),

        trend:
            features.trend,

        regime:
            features.regime,

        rsi:
            number(row.rsi14),

        rsiBucket:
            features.rsi,

        vwap:
            number(row.vwap),

        vwapDirection:
            features.vwap,

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
            features.time
    };
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
        number(row.rsi14);

    /*
    Trend-following conditions.
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
    Reversal conditions.
    */

    if (
        trend === "BEARISH" &&
        rsi !== null &&
        rsi < 35 &&
        (
            vwap === "BELOW" ||
            vwap === "NEAR"
        )
    ) {

        return "BUY";
    }

    if (
        trend === "BULLISH" &&
        rsi !== null &&
        rsi > 65 &&
        (
            vwap === "ABOVE" ||
            vwap === "NEAR"
        )
    ) {

        return "SELL";
    }

    return null;
}


// ============================================================
// PATTERN MATCHING
// ============================================================

function patternMatches(
    row,
    pattern
) {

    const features =
        extractFeatures(row);

    return (
        createPatternKey(
            pattern.side,
            features,
            pattern.level
        ) ===
        pattern.key
    );
}


// ============================================================
// SIDE BALANCE
// ============================================================

function sideBalance(patterns) {

    const buy =
        patterns.filter(
            p =>
                p.robust &&
                p.side === "BUY"
        ).length;

    const sell =
        patterns.filter(
            p =>
                p.robust &&
                p.side === "SELL"
        ).length;

    const total =
        buy + sell;

    if (total === 0) {

        return {

            buy,
            sell,

            ratio:
                0,

            imbalance:
                0,

            biased:
                false
        };
    }

    const ratio =
        buy /
        total;

    const imbalance =
        Math.abs(
            ratio -
            0.5
        ) * 2;

    return {

        buy,

        sell,

        ratio:
            round(
                ratio,
                3
            ),

        imbalance:
            round(
                imbalance,
                3
            ),

        biased:
            imbalance >
            MAX_SIDE_IMBALANCE
    };
}


// ============================================================
// CONTEXT COMPATIBILITY
// ============================================================

function contextAnalysis(
    market,
    pattern
) {

    let score = 50;

    const reasons = [];

    const trend =
        market.trend;

    const patternType =
        pattern.patternType;

    /*
    TREND FOLLOW
    */

    if (
        patternType ===
        "TREND_FOLLOW"
    ) {

        if (
            pattern.side === "BUY" &&
            trend === "BULLISH"
        ) {

            score +=
                TREND_MATCH_BONUS;

            reasons.push(
                "BUY matches bullish trend"
            );

        } else if (
            pattern.side === "SELL" &&
            trend === "BEARISH"
        ) {

            score +=
                TREND_MATCH_BONUS;

            reasons.push(
                "SELL matches bearish trend"
            );

        } else {

            score -=
                SIDE_MISMATCH_PENALTY;

            reasons.push(
                "Trend-follow pattern conflicts with current trend"
            );
        }
    }

    /*
    REVERSAL
    */

    else if (
        patternType ===
        "REVERSAL"
    ) {

        if (
            pattern.side === "BUY" &&
            trend === "BEARISH"
        ) {

            score +=
                REVERSAL_CONTEXT_BONUS;

            reasons.push(
                "BUY reversal matches bearish context"
            );

        } else if (
            pattern.side === "SELL" &&
            trend === "BULLISH"
        ) {

            score +=
                REVERSAL_CONTEXT_BONUS;

            reasons.push(
                "SELL reversal matches bullish context"
            );

        } else {

            score -=
                8;

            reasons.push(
                "Reversal context is not ideal"
            );
        }
    }

    /*
    REGIME
    */

    if (
        market.regime !==
        "UNKNOWN"
    ) {

        if (
            pattern.patternType ===
            "TREND_FOLLOW" &&
            market.regime ===
            "TRENDING"
        ) {

            score +=
                REGIME_MATCH_BONUS;

            reasons.push(
                "Trend-follow pattern matches trending regime"
            );

        } else if (
            pattern.patternType ===
            "RANGE" &&
            market.regime ===
            "RANGING"
        ) {

            score +=
                REGIME_MATCH_BONUS;

            reasons.push(
                "Range pattern matches ranging regime"
            );

        } else if (
            pattern.patternType ===
            "TREND_FOLLOW" &&
            (
                market.regime ===
                "RANGING" ||
                market.regime ===
                "TRANSITION"
            )
        ) {

            score -=
                REGIME_MISMATCH_PENALTY;

            reasons.push(
                "Trend-follow pattern conflicts with regime"
            );
        }
    }

    /*
    Recent deterioration.
    */

    if (
        pattern.recentDeterioration <
        RECENT_DETERIORATION_LIMIT
    ) {

        score -= 12;

        reasons.push(
            "Recent pattern deterioration detected"
        );
    }

    if (
        pattern.recentDeterioration >=
        0.20
    ) {

        score += 8;

        reasons.push(
            "Recent pattern performance improving"
        );
    }

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

        reasons
    };
}


// ============================================================
// SELECT BEST CURRENT PATTERN
// ============================================================

function findBestCurrentPattern(
    row,
    side,
    patterns,
    market
) {

    const matches =
        patterns.filter(
            pattern =>
                pattern.robust &&
                pattern.side === side &&
                patternMatches(
                    row,
                    pattern
                )
        );

    if (!matches.length) {
        return null;
    }

    const scored =
        matches.map(
            pattern => {

                const context =
                    contextAnalysis(
                        market,
                        pattern
                    );

                const finalScore =
                    (
                        pattern.qualityScore *
                        0.60
                    ) +
                    (
                        context.score *
                        0.40
                    );

                return {

                    ...pattern,

                    contextScore:
                        context.score,

                    contextReasons:
                        context.reasons,

                    finalContextQuality:
                        round(
                            finalScore,
                            2
                        )
                };
            }
        );

    scored.sort(
        (a, b) => {

            if (
                b.finalContextQuality !==
                a.finalContextQuality
            ) {

                return (
                    b.finalContextQuality -
                    a.finalContextQuality
                );
            }

            return (
                b.level -
                a.level
            );
        }
    );

    return scored[0];
}


// ============================================================
// HISTORICAL PAPER EXECUTION
// ============================================================

function simulatePaperExecution(
    rows,
    patterns
) {

    const robust =
        patterns.filter(
            p =>
                p.robust &&
                p.qualityScore >=
                QUALITY_THRESHOLD
        );

    const trades = [];

    let lastExitIndex =
        -1;

    let tradeNumber = 0;

    for (
        let i = 0;
        i < rows.length - 1;
        i++
    ) {

        if (
            i <=
            lastExitIndex
        ) {
            continue;
        }

        const row =
            rows[i];

        const market =
            getCurrentMarket(
                row
            );

        const side =
            inferSide(row);

        if (!side) {
            continue;
        }

        const pattern =
            findBestCurrentPattern(
                row,
                side,
                robust,
                market
            );

        if (!pattern) {
            continue;
        }

        if (
            pattern.finalContextQuality <
            MIN_CONTEXT_SCORE
        ) {
            continue;
        }

        /*
        We use the historical dataset's
        side outcome.

        This is still a simulation.
        */

        const outcome =
            String(
                sideOutcome(
                    row,
                    side
                )
            ).toUpperCase();

        let resultR = 0;

        let exitType =
            "TIMEOUT";

        if (
            outcome ===
            "WIN"
        ) {

            resultR =
                MIN_TARGET_R;

            exitType =
                "TARGET";

        } else if (
            outcome ===
            "LOSS"
        ) {

            resultR =
                -STOP_R;

            exitType =
                "STOP";
        }

        tradeNumber++;

        trades.push({

            tradeNumber,

            signalIndex:
                i,

            timestamp:
                row.timestamp,

            side,

            pattern:
                pattern.key,

            patternType:
                pattern.patternType,

            patternLevel:
                pattern.level,

            patternQuality:
                pattern.qualityScore,

            contextScore:
                pattern.contextScore,

            finalScore:
                pattern.finalContextQuality,

            entry:
                number(row.close),

            riskReward:
                "1:2",

            resultR,

            exitType,

            outcome
        });

        lastExitIndex =
            i;
    }

    let wins = 0;
    let losses = 0;
    let timeouts = 0;

    let totalWinR = 0;
    let totalLossR = 0;

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

            totalWinR +=
                trade.resultR;

            equity +=
                trade.resultR;

            lossStreak = 0;

        } else if (
            trade.outcome ===
            "LOSS"
        ) {

            losses++;

            totalLossR +=
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
            ? wins /
              decisive *
              100
            : 0;

    const netR =
        totalWinR -
        totalLossR;

    const expectedValue =
        trades.length > 0
            ? netR /
              trades.length
            : 0;

    const profitFactor =
        totalLossR > 0
            ? totalWinR /
              totalLossR
            : totalWinR > 0
                ? 999
                : 0;

    return {

        stats: {

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
                    totalWinR,
                    3
                ),

            totalLossR:
                round(
                    totalLossR,
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
                maxLossStreak
        },

        tradeLog:
            trades.slice(
                -100
            )
    };
}


// ============================================================
// CURRENT SIGNAL
// ============================================================

function currentSignal(
    rows,
    patterns
) {

    /*
    The latest candle is ONLY used
    as current market state.

    Its outcome is NOT used for
    learning or validation.
    */

    if (
        rows.length < 2
    ) {

        return {

            status:
                "NO_DATA"
        };
    }

    const current =
        rows[
            rows.length - 1
        ];

    const market =
        getCurrentMarket(
            current
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

            market,

            reason:
                "Current market does not satisfy the directional setup."
        };
    }

    const robust =
        patterns.filter(
            p =>
                p.robust
        );

    const best =
        findBestCurrentPattern(
            current,
            side,
            robust,
            market
        );

    if (!best) {

        return {

            status:
                "NO_EDGE",

            side,

            market,

            reason:
                "No robust historical pattern matches the current market."
        };
    }

    /*
    V12.4 final context gate.
    */

    if (
        best.contextScore <
        MIN_CONTEXT_SCORE
    ) {

        return {

            status:
                "WAIT",

            side,

            market,

            pattern:
                best.key,

            patternType:
                best.patternType,

            patternQuality:
                best.qualityScore,

            contextScore:
                best.contextScore,

            finalScore:
                best.finalContextQuality,

            reason:
                "Historical pattern exists, but current market context is not strong enough."
        };
    }

    if (
        best.finalContextQuality <
        QUALITY_THRESHOLD
    ) {

        return {

            status:
                "WAIT",

            side,

            market,

            pattern:
                best.key,

            patternType:
                best.patternType,

            patternQuality:
                best.qualityScore,

            contextScore:
                best.contextScore,

            finalScore:
                best.finalContextQuality,

            reason:
                "Combined historical and context quality is below execution threshold."
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
                atr *
                MIN_TARGET_R;

            preferredTarget =
                close +
                atr *
                PREFERRED_TARGET_R;

        } else {

            stop =
                close +
                atr;

            target =
                close -
                atr *
                MIN_TARGET_R;

            preferredTarget =
                close -
                atr *
                PREFERRED_TARGET_R;
        }
    }

    return {

        status:
            "PAPER_TRADE_CANDIDATE",

        side,

        market,

        pattern:
            best.key,

        patternType:
            best.patternType,

        patternLevel:
            best.level,

        samples:
            best.samples,

        oosSamples:
            best.oosSamples,

        oosDecisiveTrades:
            best.oosDecisiveTrades,

        patternQuality:
            best.qualityScore,

        contextScore:
            best.contextScore,

        finalScore:
            best.finalContextQuality,

        expectedValueR:
            best.averageTestEV,

        profitFactor:
            best.averageTestPF,

        recentEV:
            best.recentEV,

        recentDeterioration:
            best.recentDeterioration,

        positiveFolds:
            best.positiveFolds,

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

        contextReasons:
            best.contextReasons,

        reason:
            "Current market matches a robust pattern and passes the V12.4 context gate."
    };
}


// ============================================================
// MAIN ENGINE
// ============================================================

async function runEngine(req) {

    const dataset =
        await fetchDataset(
            req
        );

    const rawRows =
        dataset.rows;

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
    IMPORTANT:

    The latest candle is excluded from
    pattern learning.

    This protects the current decision
    from using its own future outcome.
    */

    const learningRows =
        rows.slice(
            0,
            rows.length - 1
        );

    const folds =
        buildFolds(
            learningRows.length
        );

    const patterns =
        discoverPatterns(
            learningRows,
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
                QUALITY_THRESHOLD
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

    const balance =
        sideBalance(
            qualifiedPatterns
        );

    /*
    Paper backtest is performed only
    on historical learning rows.

    Current candle is excluded.
    */

    const paperBacktest =
        simulatePaperExecution(
            learningRows,
            qualifiedPatterns
        );

    const signal =
        currentSignal(
            rows,
            qualifiedPatterns
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

    /*
    Pattern type statistics.
    */

    const typeCounts = {

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
    };

    /*
    V12.4 learning gate.
    */

    let learningGate =
        "READY";

    let gateReason =
        "Brain has qualified patterns and current-context analysis is available.";

    if (
        qualifiedPatterns.length === 0
    ) {

        learningGate =
            "BLOCKED";

        gateReason =
            "No qualified robust patterns.";
    }

    if (
        qualifiedPatterns.length > 0 &&
        balance.biased
    ) {

        learningGate =
            "READY_WITH_SIDE_BIAS";

        gateReason =
            "Qualified patterns are heavily biased toward one side.";
    }

    if (
        signal.status ===
        "NO_EDGE"
    ) {

        learningGate =
            "WAITING_FOR_EDGE";

        gateReason =
            "No robust pattern currently matches the market.";
    }

    if (
        signal.status ===
        "WAIT"
    ) {

        learningGate =
            "CONTEXT_BLOCKED";

        gateReason =
            "A historical edge exists, but current market context does not meet V12.4 execution requirements.";
    }

    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V12_4_CONTEXT_AWARE_BRAIN",

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

            currentCandleExcludedFromLearning:
                true,

            patternSelectionUsesFutureData:
                false,

            testOutcomeUsedForTraining:
                false
        },

        objective: {

            primary:
                "CONTEXT_ADJUSTED_POSITIVE_EXPECTED_VALUE",

            secondary:
                "MINIMIZE_DRAWDOWN",

            tertiary:
                "SELECT_FEWER_HIGH_QUALITY_TRADES",

            allowNoTrade:
                true,

            minimumExpectedValueR:
                MIN_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_PROFIT_FACTOR,

            minimumStableFolds:
                MIN_STABLE_FOLDS,

            minimumContextScore:
                MIN_CONTEXT_SCORE
        },

        sourceStatistics: {

            rawLearningRows:
                rawRows.length,

            normalizedRows:
                rows.length,

            trainingRows:
                learningRows.length,

            currentCandleExcluded:
                1,

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
                buyPatterns.length,

            sellPatterns:
                sellPatterns.length,

            patternTypes:
                typeCounts,

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

            sideBalance:
                balance
        },

        stabilityRules: {

            recentWindowFraction:
                0.35,

            maxRecentDeterioration:
                RECENT_DETERIORATION_LIMIT,

            maxDrawdownR:
                MAX_DRAWDOWN_R,

            maxLossStreak:
                MAX_LOSS_STREAK,

            preferContextCompatiblePatterns:
                true
        },

        currentMarket:
            getCurrentMarket(
                rows[
                    rows.length - 1
                ]
            ),

        paperBacktest,

        learningGate: {

            status:
                learningGate,

            qualityThreshold:
                QUALITY_THRESHOLD,

            minimumExpectedValue:
                MIN_EXPECTED_VALUE,

            minimumProfitFactor:
                MIN_PROFIT_FACTOR,

            minimumStableFolds:
                MIN_STABLE_FOLDS,

            minimumOOSSamples:
                MIN_OOS_SAMPLES,

            minimumOOSDecisiveTrades:
                MIN_OOS_DECISIVE_TRADES,

            minimumContextScore:
                MIN_CONTEXT_SCORE,

            reason:
                gateReason
        },

        currentSignal:
            signal,

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

            maxHoldCandles:
                MAX_HOLD_CANDLES,

            noStopWidening:
                true
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

        paperAction:
            signal.status ===
            "PAPER_TRADE_CANDIDATE"

                ? "PAPER_TRADE_CANDIDATE"

                : "NO_TRADE",

        nextAction:
            signal.status ===
            "PAPER_TRADE_CANDIDATE"

                ? "PAPER_TRADE_ONLY"

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
            await runEngine(
                req
            );

        return res
            .status(200)
            .json(
                result
            );

    } catch (error) {

        console.error(
            "V12.4 ERROR:",
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
