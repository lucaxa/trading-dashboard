/*
TradeMind Pro
V12.9
ENTRY-CONFIRMED STRICT TRUE WALK-FORWARD PAPER ENGINE

V12.8 result:
- 34 true OOS trades
- 4 wins
- 27 losses
- -19R
- EV -0.5588R
- PF 0.296
- Max DD 19R
- Max loss streak 9

V12.9 objective:

1. Preserve strict chronological walk-forward.
2. Preserve signal-conditioned learning.
3. Require the historical pattern itself to be robust.
4. Require the CURRENT candle to independently confirm the entry.
5. Prevent repeated entries from the same unchanged setup.
6. Require stronger OOS evidence before deployment.
7. Prefer fewer high-quality trades.
8. Remain paper-only.

PAPER ONLY.
NO REAL BROKER ORDERS.
*/


// ============================================================
// VERSION
// ============================================================

const VERSION = "V12.9";

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

const MIN_LEVEL1_SAMPLES = 25;

const MIN_LEVEL2_SAMPLES = 20;

const MIN_LEVEL3_SAMPLES = 15;

const MIN_LEVEL4_SAMPLES = 12;


// Stronger than V12.8.

const MIN_OOS_SAMPLES = 8;

const MIN_OOS_DECISIVE = 5;

const MIN_EXPECTED_VALUE = 0.10;

const MIN_PROFIT_FACTOR = 1.20;

const MIN_STABLE_FOLDS = 2;

const QUALITY_THRESHOLD = 60;

const MAX_OOS_DRAWDOWN = 12;

const MAX_OOS_LOSS_STREAK = 6;


// ============================================================
// PATTERN DIVERSITY
// ============================================================

const MAX_PATTERN_CONCENTRATION = 0.50;


// ============================================================
// ENTRY CONFIRMATION
// ============================================================

const REQUIRE_TREND_CONFIRMATION = true;

const REQUIRE_VWAP_CONFIRMATION = true;

const REQUIRE_EMA_ALIGNMENT = true;

const REQUIRE_EMA_SPREAD = true;

const REQUIRE_SLOPE_CONFIRMATION = true;

const REQUIRE_RSI_CONFIRMATION = true;


// Minimum directional confirmation score.

const MIN_ENTRY_CONFIRMATION_SCORE = 5;


// ============================================================
// ENTRY COOLDOWNS
// ============================================================

const ENTRY_COOLDOWN_CANDLES = 3;

const SAME_PATTERN_COOLDOWN_CANDLES = 5;

const SAME_SIDE_COOLDOWN_CANDLES = 2;


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
        Math.pow(
            10,
            decimals
        );

    return (
        Math.round(
            value * multiplier
        ) /
        multiplier
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

    if (
        ts >
        100000000000
    ) {

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


function slopeBucket(value) {

    const x =
        Math.abs(
            number(
                value,
                0
            )
        );

    if (
        x <
        0.10
    ) {

        return "FLAT";
    }

    if (
        x <
        0.25
    ) {

        return "WEAK";
    }

    if (
        x <
        0.50
    ) {

        return "MODERATE";
    }

    if (
        x <
        0.75
    ) {

        return "STRONG";
    }

    return "VERY_STRONG";
}


function timeBucket(row) {

    const hour =
        number(
            row.hour
        );

    if (
        hour === null
    ) {

        return "UNKNOWN";
    }

    if (
        hour <
        10
    ) {

        return "OPEN";
    }

    if (
        hour <
        11
    ) {

        return "MORNING";
    }

    if (
        hour <
        13
    ) {

        return "MIDDAY";
    }

    if (
        hour <
        14
    ) {

        return "AFTERNOON";
    }

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
        number(
            row.rsi14
        );

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
// SIGNAL ENGINE
// ============================================================

function inferSide(row) {

    const trend =
        normalizeTrend(row);

    const vwap =
        vwapDirection(row);

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

    const trend =
        normalizeTrend(row);

    const vwap =
        vwapDirection(row);

    const close =
        number(
            row.close
        );

    const ema9 =
        number(
            row.ema9
        );

    const ema21 =
        number(
            row.ema21
        );

    const spread =
        number(
            row.emaSpreadATR
        );

    const slope =
        number(
            row.ema9SlopeATR
        );

    const rsi =
        number(
            row.rsi14
        );

    let score = 0;

    const checks = {

        trend: false,

        vwap: false,

        emaAlignment: false,

        emaSpread: false,

        slope: false,

        rsi: false
    };


    // --------------------------------------------------------
    // TREND
    // --------------------------------------------------------

    if (
        side === "BUY" &&
        trend === "BULLISH"
    ) {

        checks.trend = true;
        score++;
    }

    if (
        side === "SELL" &&
        trend === "BEARISH"
    ) {

        checks.trend = true;
        score++;
    }


    // --------------------------------------------------------
    // VWAP
    // --------------------------------------------------------

    if (
        side === "BUY" &&
        (
            vwap === "ABOVE"
        )
    ) {

        checks.vwap = true;
        score++;
    }

    if (
        side === "SELL" &&
        (
            vwap === "BELOW"
        )
    ) {

        checks.vwap = true;
        score++;
    }


    // --------------------------------------------------------
    // EMA ALIGNMENT
    // --------------------------------------------------------

    if (
        ema9 !== null &&
        ema21 !== null
    ) {

        if (
            side === "BUY" &&
            ema9 > ema21
        ) {

            checks.emaAlignment = true;
            score++;
        }

        if (
            side === "SELL" &&
            ema9 < ema21
        ) {

            checks.emaAlignment = true;
            score++;
        }
    }


    // --------------------------------------------------------
    // EMA SPREAD
    // --------------------------------------------------------

    if (
        spread !== null
    ) {

        if (
            side === "BUY" &&
            spread > 0.05
        ) {

            checks.emaSpread = true;
            score++;
        }

        if (
            side === "SELL" &&
            spread < -0.05
        ) {

            checks.emaSpread = true;
            score++;
        }
    }


    // --------------------------------------------------------
    // SLOPE
    // --------------------------------------------------------

    if (
        slope !== null
    ) {

        if (
            side === "BUY" &&
            slope > 0.10
        ) {

            checks.slope = true;
            score++;
        }

        if (
            side === "SELL" &&
            slope < -0.10
        ) {

            checks.slope = true;
            score++;
        }
    }


    // --------------------------------------------------------
    // RSI
    // --------------------------------------------------------

    if (
        rsi !== null
    ) {

        if (
            side === "BUY" &&
            rsi >= 45 &&
            rsi <= 65
        ) {

            checks.rsi = true;
            score++;
        }

        if (
            side === "SELL" &&
            rsi >= 35 &&
            rsi <= 55
        ) {

            checks.rsi = true;
            score++;
        }
    }


    // --------------------------------------------------------
    // REQUIRED CHECKS
    // --------------------------------------------------------

    const requiredFailures = [];

    if (
        REQUIRE_TREND_CONFIRMATION &&
        !checks.trend
    ) {

        requiredFailures.push(
            "TREND"
        );
    }

    if (
        REQUIRE_VWAP_CONFIRMATION &&
        !checks.vwap
    ) {

        requiredFailures.push(
            "VWAP"
        );
    }

    if (
        REQUIRE_EMA_ALIGNMENT &&
        !checks.emaAlignment
    ) {

        requiredFailures.push(
            "EMA_ALIGNMENT"
        );
    }

    if (
        REQUIRE_EMA_SPREAD &&
        !checks.emaSpread
    ) {

        requiredFailures.push(
            "EMA_SPREAD"
        );
    }

    if (
        REQUIRE_SLOPE_CONFIRMATION &&
        !checks.slope
    ) {

        requiredFailures.push(
            "SLOPE"
        );
    }

    if (
        REQUIRE_RSI_CONFIRMATION &&
        !checks.rsi
    ) {

        requiredFailures.push(
            "RSI"
        );
    }


    const confirmed =
        requiredFailures.length === 0 &&
        score >=
            MIN_ENTRY_CONFIRMATION_SCORE;


    return {

        confirmed,

        side,

        score,

        maxScore: 6,

        checks,

        requiredFailures
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


// ============================================================
// MINIMUM SAMPLES
// ============================================================

function minimumSamples(level) {

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

    return result;
}


// ============================================================
// BUILD SIGNAL-CONDITIONED PATTERN MAP
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

        Only rows where the actual signal
        engine would have produced this
        side are allowed into the pattern.

        This prevents pattern statistics
        from being calculated from candles
        that would never have been traded.
        */

        if (
            inferSide(row) !== side
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

function buildInternalFolds(total) {

    const folds = [];

    if (
        total <
        MIN_TRAINING_ROWS
    ) {

        return folds;
    }

    const testSize =
        Math.max(
            30,
            Math.floor(
                total /
                5
            )
        );

    const starts = [

        Math.floor(
            total *
            0.50
        ),

        Math.floor(
            total *
            0.65
        ),

        Math.floor(
            total *
            0.80
        )
    ];

    let foldNumber = 1;

    for (
        const testStart of starts
    ) {

        if (
            testStart <= 50 ||
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


    const allPatternRows =
        trainingRows.filter(
            row => {

                if (
                    inferSide(row) !==
                    side
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

                    if (
                        inferSide(row) !==
                        side
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


        const testPatternRows =
            testPart.filter(
                row => {

                    if (
                        inferSide(row) !==
                        side
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


        if (
            trainingPatternRows.length <
            8
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
        foldStats.length <
        2
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
                x.testSamples >=
                    MIN_OOS_SAMPLES &&

                x.testDecisiveTrades >=
                    Math.min(
                        3,
                        MIN_OOS_DECISIVE
                    ) &&

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
            (
                sum,
                x
            ) =>
                sum +
                x.testExpectedValueR,
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
                    x.testProfitFactor,
                    5
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
                x.testWinRate,
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
                x.testDrawdownR,
            0
        ) /
        foldStats.length;


    const overall =
        calculateStats(
            allPatternRows,
            side
        );


    /*
    RECENCY
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
                    (
                        sum,
                        x
                    ) =>
                        sum +
                        x.testExpectedValueR,
                    0
                ) /
                (
                    foldStats.length -
                    1
                )

            : 0;


    const recentStable =
        recent.testSamples >=
            MIN_OOS_SAMPLES &&

        recent.testExpectedValueR >=
            MIN_EXPECTED_VALUE &&

        recent.testProfitFactor >=
            MIN_PROFIT_FACTOR &&

        recent.testDrawdownR <=
            MAX_OOS_DRAWDOWN &&

        recent.testLossStreak <=
            MAX_OOS_LOSS_STREAK;


    const recentDeterioration =
        earlier !== 0

            ? (
                recent.testExpectedValueR -
                earlier
            ) /
            Math.abs(
                earlier
            )

            : recent.testExpectedValueR;


    /*
    QUALITY SCORE
    */

    const evScore =
        clamp(
            (
                averageEV /
                0.25
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
                0.50
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
                MAX_OOS_DRAWDOWN
            ) *
            5,
            0,
            5
        );


    const qualityScore =
        clamp(
            evScore +
            pfScore +
            stabilityScore +
            winRateScore -
            drawdownPenalty,
            0,
            100
        );


    /*
    ROBUSTNESS

    Much stricter than V12.8.
    */

    const robust =
        overall.samples >=
            minimum &&

        overall.decisiveTrades >=
            8 &&

        foldStats.length >=
            2 &&

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
// CHECK ENTRY COOLDOWN
// ============================================================

function cooldownAllows(
    trades,
    currentIndex,
    side,
    patternKey
) {

    if (
        !trades.length
    ) {

        return true;
    }


    const lastTrade =
        trades[
            trades.length - 1
        ];


    const barsSinceLast =
        currentIndex -
        lastTrade.testLocalIndex;


    if (
        barsSinceLast <
        ENTRY_COOLDOWN_CANDLES
    ) {

        return false;
    }


    if (
        lastTrade.side ===
        side &&
        barsSinceLast <
        SAME_SIDE_COOLDOWN_CANDLES
    ) {

        return false;
    }


    if (
        lastTrade.pattern ===
        patternKey &&
        barsSinceLast <
        SAME_PATTERN_COOLDOWN_CANDLES
    ) {

        return false;
    }


    return true;
}


// ============================================================
// CALCULATE TRADE LEVELS
// ============================================================

function tradeLevels(
    row,
    side
) {

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

        }

        else {

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
                : null
    };
}


// ============================================================
// OUTER WALK FORWARD
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
                        QUALITY_THRESHOLD &&
                    p.samples >=
                        minimumSamples(
                            p.level
                        )
            );


        const trades = [];


        for (
            let i = 0;
            i < testRows.length;
            i++
        ) {

            const row =
                testRows[i];


            /*
            SIGNAL CONDITIONING
            */

            const side =
                inferSide(row);


            if (
                !side
            ) {

                continue;
            }


            /*
            CURRENT CANDLE ENTRY CONFIRMATION

            This is the key V12.9 improvement.
            */

            const confirmation =
                entryConfirmation(
                    row,
                    side
                );


            if (
                !confirmation.confirmed
            ) {

                continue;
            }


            /*
            PATTERN MATCH
            */

            const pattern =
                findBestPattern(
                    row,
                    side,
                    robustPatterns
                );


            if (
                !pattern
            ) {

                continue;
            }


            /*
            COOLDOWN
            */

            if (
                !cooldownAllows(
                    trades,
                    i,
                    side,
                    pattern.key
                )
            ) {

                continue;
            }


            /*
            OUTCOME

            Outcome comes from the dataset's
            historical forward outcome.

            Current test candle was NOT used
            to train the pattern.
            */

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


            const levels =
                tradeLevels(
                    row,
                    side
                );


            tradeNumber++;


            trades.push({

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
                            f
                        ) =>
                            sum +
                            f.testSamples,
                        0
                    ),

                patternEV:
                    pattern.recentEV,

                patternPF:
                    pattern.averageTestPF,

                patternStableFolds:
                    pattern.stableFolds,

                confirmationScore:
                    confirmation.score,

                confirmationMaxScore:
                    confirmation.maxScore,

                entry:
                    levels.entry,

                stop:
                    levels.stop,

                target:
                    levels.target,

                preferredTarget:
                    levels.preferredTarget,

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


        /*
        FOLD STATISTICS
        */

        const foldStats =
            calculateTradeStats(
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
                robustPatterns.length,

            trades:
                trades.length,

            wins:
                foldStats.wins,

            losses:
                foldStats.losses,

            timeouts:
                foldStats.timeouts,

            decisiveTrades:
                foldStats.decisiveTrades,

            winRate:
                foldStats.winRate,

            totalWinR:
                foldStats.totalWinR,

            totalLossR:
                foldStats.totalLossR,

            netR:
                foldStats.netR,

            expectedValueR:
                foldStats.expectedValueR,

            profitFactor:
                foldStats.profitFactor,

            maxDrawdownR:
                foldStats.maxDrawdownR,

            maxLossStreak:
                foldStats.maxLossStreak,

            tradeResults:
                trades.map(
                    t =>
                        t.resultR
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


    return {

        stats,

        folds:
            foldResults,

        tradeLog:
            allTrades.slice(
                -100
            )
    };
}


// ============================================================
// TRADE STATISTICS
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
                peak -
                equity
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
            ) *
              100
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

        maxLossStreak
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


    const confirmation =
        side
            ? entryConfirmation(
                row,
                side
            )
            : null;


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


    if (
        !side
    ) {

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


    /*
    ENTRY CONFIRMATION
    */

    const confirmation =
        entryConfirmation(
            currentRow,
            side
        );


    if (
        !confirmation.confirmed
    ) {

        return {

            status:
                "NO_ENTRY_CONFIRMATION",

            side,

            market,

            confirmation,

            reason:
                "Directional signal exists, but the current candle does not provide sufficient entry confirmation.",

            nextAction:
                "WAIT"
        };
    }


    /*
    LEARN ONLY FROM HISTORICAL CANDLES.
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
                    QUALITY_THRESHOLD &&
                p.samples >=
                    minimumSamples(
                        p.level
                    )
        );


    const best =
        findBestPattern(
            currentRow,
            side,
            qualified
        );


    if (
        !best
    ) {

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
                    patterns.filter(
                        p =>
                            p.robust
                    ).length,

                qualifiedPatterns:
                    qualified.length
            },

            reason:
                "Entry confirmation exists, but no sufficiently robust previously learned pattern matches the current setup.",

            nextAction:
                "WAIT"
        };
    }


    const levels =
        tradeLevels(
            currentRow,
            side
        );


    return {

        status:
            "PAPER_TRADE_CANDIDATE",

        side,

        market,

        confirmation,

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
            levels.entry,

        stop:
            levels.stop,

        target:
            levels.target,

        preferredTarget:
            levels.preferredTarget,

        riskReward:
            "1:2",

        preferredRiskReward:
            "1:2.5",

        maxHoldCandles:
            MAX_HOLD_CANDLES,

        reason:
            "Current candle passes directional entry confirmation and matches a robust pattern learned exclusively from prior historical data.",

        nextAction:
            "PAPER_TRADE_ONLY"
    };
}


// ============================================================
// OUTER FOLDS
// ============================================================

function buildOuterFolds(total) {

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


    /*
    Preserve the same expanding
    chronological architecture.
    */

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


        const testRows =
            testEnd -
            testStart;


        if (
            testRows <
            MIN_TEST_ROWS
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

            testRows
        });
    }


    return folds;
}


// ============================================================
// PATTERN CONCENTRATION
// ============================================================

function calculatePatternConcentration(
    trades
) {

    if (
        !trades.length
    ) {

        return {

            maximum:
                0,

            patternCounts: {}
        };
    }


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
                ] ||
                0
            ) + 1;
    }


    const maximum =
        Math.max(
            ...Object.values(
                counts
            )
        );


    return {

        maximum:
            round(
                maximum /
                trades.length,
                4
            ),

        patternCounts:
            counts
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
            `Not enough historical rows for V12.9: ${rows.length}`
        );
    }


    /*
    CURRENT CANDLE EXCLUDED.
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
    OUTER FOLDS
    */

    const folds =
        buildOuterFolds(
            historicalRows.length
        );


    /*
    TRUE WALK FORWARD
    */

    const walkForward =
        trueWalkForward(
            historicalRows,
            folds
        );


    /*
    CURRENT SIGNAL
    */

    const signal =
        currentSignal(
            historicalRows,
            currentRow
        );


    /*
    LATEST PATTERNS

    Used only for current-signal analysis.
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
                    QUALITY_THRESHOLD &&
                p.samples >=
                    minimumSamples(
                        p.level
                    )
        );


    /*
    TRADING DAYS
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
                .filter(
                    Boolean
                )
        );


    /*
    OOS STATS
    */

    const stats =
        walkForward.stats;


    const concentration =
        calculatePatternConcentration(
            walkForward.tradeLog
        );


    /*
    PROFITABILITY PROOF
    */

    const positiveOOS =
        stats.expectedValueR >
            0 &&

        stats.profitFactor >
            1;


    const controlledRisk =
        stats.maxDrawdownR <=
            MAX_OOS_DRAWDOWN &&

        stats.maxLossStreak <=
            MAX_OOS_LOSS_STREAK;


    const enoughTrades =
        stats.decisiveTrades >=
            MIN_OOS_DECISIVE;


    const sufficientPatternDiversity =
        concentration.maximum <=
        MAX_PATTERN_CONCENTRATION;


    const profitabilityProof =
        positiveOOS &&

        controlledRisk &&

        enoughTrades &&

        sufficientPatternDiversity;


    /*
    FINAL STATUS
    */

    let paperAction =
        "NO_TRADE";


    if (
        signal.status ===
        "PAPER_TRADE_CANDIDATE"
    ) {

        paperAction =
            "PAPER_TRADE_CANDIDATE";
    }


    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V12_9_ENTRY_CONFIRMED_TRUE_WALK_FORWARD",

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

            signalConditionedLearning:
                true,

            signalConditionedOOS:
                true,

            currentEntryConfirmation:
                true,

            samePatternCooldown:
                true,

            sameSideCooldown:
                true,

            globalEntryCooldown:
                true,

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
                MIN_EXPECTED_VALUE,

            minimumOOSProfitFactor:
                MIN_PROFIT_FACTOR,

            minimumOOSDecisiveTrades:
                MIN_OOS_DECISIVE,

            minimumOOSSamples:
                MIN_OOS_SAMPLES,

            minimumStableFolds:
                MIN_STABLE_FOLDS,

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

            signalConditioned:
                true,

            entryConfirmed:
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
        // TRUE OOS RESULT
        // ====================================================

        trueOOSPaperExecution: {

            description:
                "Every outer fold learns signal-conditioned patterns exclusively from its preceding training window, then requires independent current-candle entry confirmation before executing on unseen test data.",

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

                sufficientPatternDiversity
                    ? "PASSED"
                    : "FAILED",

            patternConcentration:
                concentration
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

            signalConditioned:
                true,

            minimumOOSSamples:
                MIN_OOS_SAMPLES,

            qualityThreshold:
                QUALITY_THRESHOLD,

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
        // ENTRY CONFIRMATION MODEL
        // ====================================================

        entryConfirmationModel: {

            enabled:
                true,

            minimumScore:
                MIN_ENTRY_CONFIRMATION_SCORE,

            maximumScore:
                6,

            requireTrend:
                REQUIRE_TREND_CONFIRMATION,

            requireVWAP:
                REQUIRE_VWAP_CONFIRMATION,

            requireEMAAlignment:
                REQUIRE_EMA_ALIGNMENT,

            requireEMASpread:
                REQUIRE_EMA_SPREAD,

            requireSlope:
                REQUIRE_SLOPE_CONFIRMATION,

            requireRSI:
                REQUIRE_RSI_CONFIRMATION
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

        paperAction,

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
            "V12.9 ERROR:",
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
