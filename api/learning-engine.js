/*
TradeMind Pro
V11.7 Walk-Forward Robustness Engine

Evolution:

V11.1
Historical Learning Dataset
        ↓
V11.2
Statistical Pattern Learning
        ↓
V11.3
Independent BUY / SELL Learning
        ↓
V11.4
Hierarchical Pattern Learning
        ↓
V11.5
Expected Value Learning
        ↓
V11.6
Selective Trade Quality
        ↓
V11.7
WALK-FORWARD ROBUSTNESS
        ↓
Robust Pattern Candidates
        ↓
Future Paper Signal Engine

PRIMARY OBJECTIVE:

    MAXIMIZE EXPECTED VALUE

SECONDARY:

    MINIMIZE LOSS

TERTIARY:

    SELECT ONLY STABLE / ROBUST TRADES

PAPER ONLY
NO REAL ORDERS
*/


const VERSION = "V11.7";


// =====================================================
// CONFIGURATION
// =====================================================

const MIN_PATTERN_SAMPLES = 20;

const MIN_DECISIVE_SAMPLES = 12;

const ROBUST_MIN_SAMPLES = 30;

const MIN_FOLD_SAMPLES = 8;

const MIN_FOLD_DECISIVE = 5;


// Expected-value thresholds

const MIN_EXPECTED_VALUE_R = 0.20;

const PREFERRED_EXPECTED_VALUE_R = 0.35;

const MIN_PROFIT_FACTOR = 1.25;

const PREFERRED_PROFIT_FACTOR = 1.50;


// Stability

const MIN_STABLE_FOLDS = 3;

const MIN_FOLD_WIN_RATE = 45;


// Walk-forward configuration

const FOLD_COUNT = 4;


// Approximate V11.1 trade model

const DEFAULT_WIN_R = 2.0;

const DEFAULT_LOSS_R = 1.5;


// =====================================================
// HELPERS
// =====================================================

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


function safeNumber(value, fallback = 0) {

    const n =
        Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function safeRate(
    wins,
    total
) {

    if (!total) {
        return 0;
    }

    return (
        wins /
        total
    ) * 100;
}


function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


function average(values) {

    const valid =
        values.filter(
            Number.isFinite
        );

    if (!valid.length) {
        return 0;
    }

    return (
        valid.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        valid.length
    );
}


// =====================================================
// BUCKET FUNCTIONS
// =====================================================

function bucketRSI(rsi) {

    const x =
        safeNumber(rsi);

    if (x < 30) return "RSI_LT30";
    if (x < 35) return "RSI_30_35";
    if (x < 40) return "RSI_35_40";
    if (x < 45) return "RSI_40_45";
    if (x < 50) return "RSI_45_50";
    if (x < 55) return "RSI_50_55";
    if (x < 60) return "RSI_55_60";
    if (x < 65) return "RSI_60_65";
    if (x < 70) return "RSI_65_70";

    return "RSI_70_PLUS";
}


function bucketSpread(value) {

    const x =
        Math.abs(
            safeNumber(value)
        );

    if (x < 0.25) {
        return "SPREAD_LT025";
    }

    if (x < 0.50) {
        return "SPREAD_025_050";
    }

    if (x < 0.75) {
        return "SPREAD_050_075";
    }

    if (x < 1.00) {
        return "SPREAD_075_100";
    }

    return "SPREAD_1_PLUS";
}


function bucketVWAP(value) {

    const x =
        safeNumber(value);

    if (x < -2) {
        return "VWAP_LT_MINUS2";
    }

    if (x < -1) {
        return "VWAP_MINUS2_MINUS1";
    }

    if (x < -0.25) {
        return "VWAP_MINUS1_MINUS025";
    }

    if (x < 0.25) {
        return "VWAP_MINUS025_025";
    }

    if (x < 1) {
        return "VWAP_025_1";
    }

    if (x < 2) {
        return "VWAP_1_2";
    }

    return "VWAP_GT2";
}


function bucketTime(hour) {

    const h =
        safeNumber(hour);

    if (h < 10) {
        return "TIME_OPEN";
    }

    if (h < 11) {
        return "TIME_MORNING";
    }

    if (h < 13) {
        return "TIME_MIDDAY";
    }

    if (h < 14) {
        return "TIME_AFTERNOON";
    }

    return "TIME_CLOSE";
}


function bucketTrend(trend) {

    const value =
        String(
            trend ||
            "UNKNOWN"
        ).toUpperCase();

    if (
        value.includes("BULL")
    ) {
        return "TREND_BULLISH";
    }

    if (
        value.includes("BEAR")
    ) {
        return "TREND_BEARISH";
    }

    if (
        value.includes("SIDE")
    ) {
        return "TREND_SIDEWAYS";
    }

    return "TREND_OTHER";
}


function bucketRegime(regime) {

    const value =
        String(
            regime ||
            "UNKNOWN"
        ).toUpperCase();

    if (
        value.includes("TREND")
    ) {
        return "REGIME_TRENDING";
    }

    if (
        value.includes("RANGE")
    ) {
        return "REGIME_RANGING";
    }

    if (
        value.includes("TRANS")
    ) {
        return "REGIME_TRANSITION";
    }

    return "REGIME_OTHER";
}


// =====================================================
// PATTERN GENERATION
// =====================================================

function buildPattern(
    row,
    side,
    level
) {

    const rsi =
        bucketRSI(
            row.rsi14
        );

    const vwap =
        bucketVWAP(
            row.vwapDistanceATR
        );

    const spread =
        bucketSpread(
            row.emaSpreadATR
        );

    const time =
        bucketTime(
            row.hour
        );

    const trend =
        bucketTrend(
            row.trend
        );

    const regime =
        bucketRegime(
            row.regime
        );


    /*
    Level 1:

    Very broad patterns.

    Designed to find structural
    directional behaviour.
    */

    if (level === 1) {

        const feature =
            [
                "rsi",
                "vwap",
                "spread",
                "time",
                "trend",
                "regime"
            ][
                Math.floor(
                    safeNumber(
                        row.__featureSeed,
                        0
                    )
                ) % 6
            ];


        let value;

        if (feature === "rsi") {
            value = rsi;
        }

        else if (feature === "vwap") {
            value = vwap;
        }

        else if (feature === "spread") {
            value = spread;
        }

        else if (feature === "time") {
            value = time;
        }

        else if (feature === "trend") {
            value = trend;
        }

        else {
            value = regime;
        }


        return (
            side +
            "|" +
            feature +
            "=" +
            value
        );
    }


    /*
    Level 2:

    Two-feature combinations.

    This is the main V11.7
    discovery level.
    */

    const combinations = [

        [
            "vwap",
            vwap,
            "time",
            time
        ],

        [
            "rsi",
            rsi,
            "vwap",
            vwap
        ],

        [
            "trend",
            trend,
            "vwap",
            vwap
        ],

        [
            "regime",
            regime,
            "vwap",
            vwap
        ],

        [
            "spread",
            spread,
            "time",
            time
        ],

        [
            "rsi",
            rsi,
            "time",
            time
        ],

        [
            "trend",
            trend,
            "time",
            time
        ],

        [
            "regime",
            regime,
            "time",
            time
        ],

        [
            "trend",
            trend,
            "spread",
            spread
        ],

        [
            "regime",
            regime,
            "spread",
            spread
        ]
    ];


    /*
    A deterministic pattern family
    is selected using row properties.

    We deliberately create multiple
    candidate families rather than
    using one giant feature key.
    */

    const patterns = [];


    for (
        const combination
        of combinations
    ) {

        patterns.push({

            key:
                side +
                "|" +
                combination[0] +
                "=" +
                combination[1] +
                "|" +
                combination[2] +
                "=" +
                combination[3],

            side,

            level: 2,

            features: [
                combination[0],
                combination[2]
            ]
        });
    }


    return patterns;
}


// =====================================================
// GET ALL PATTERNS FOR ROW
// =====================================================

function getRowPatterns(
    row,
    side
) {

    const patterns = [];


    /*
    Level 1 patterns
    */

    const rsi =
        bucketRSI(
            row.rsi14
        );

    const vwap =
        bucketVWAP(
            row.vwapDistanceATR
        );

    const spread =
        bucketSpread(
            row.emaSpreadATR
        );

    const time =
        bucketTime(
            row.hour
        );

    const trend =
        bucketTrend(
            row.trend
        );

    const regime =
        bucketRegime(
            row.regime
        );


    patterns.push({

        key:
            side +
            "|rsi=" +
            rsi,

        side,

        level: 1,

        features: [
            "rsi"
        ]

    });


    patterns.push({

        key:
            side +
            "|vwap=" +
            vwap,

        side,

        level: 1,

        features: [
            "vwap"
        ]

    });


    patterns.push({

        key:
            side +
            "|spread=" +
            spread,

        side,

        level: 1,

        features: [
            "spread"
        ]

    });


    patterns.push({

        key:
            side +
            "|time=" +
            time,

        side,

        level: 1,

        features: [
            "time"
        ]

    });


    patterns.push({

        key:
            side +
            "|trend=" +
            trend,

        side,

        level: 1,

        features: [
            "trend"
        ]

    });


    patterns.push({

        key:
            side +
            "|regime=" +
            regime,

        side,

        level: 1,

        features: [
            "regime"
        ]

    });


    /*
    Level 2
    */

    const pairs = [

        [
            "vwap",
            vwap,
            "time",
            time
        ],

        [
            "rsi",
            rsi,
            "vwap",
            vwap
        ],

        [
            "trend",
            trend,
            "vwap",
            vwap
        ],

        [
            "regime",
            regime,
            "vwap",
            vwap
        ],

        [
            "spread",
            spread,
            "time",
            time
        ],

        [
            "rsi",
            rsi,
            "time",
            time
        ],

        [
            "trend",
            trend,
            "time",
            time
        ],

        [
            "regime",
            regime,
            "time",
            time
        ],

        [
            "trend",
            trend,
            "spread",
            spread
        ],

        [
            "regime",
            regime,
            "spread",
            spread
        ]
    ];


    for (
        const pair
        of pairs
    ) {

        patterns.push({

            key:
                side +
                "|" +
                pair[0] +
                "=" +
                pair[1] +
                "|" +
                pair[2] +
                "=" +
                pair[3],

            side,

            level: 2,

            features: [
                pair[0],
                pair[2]
            ]

        });
    }


    return patterns;
}


// =====================================================
// OUTCOME
// =====================================================

function getOutcome(row) {

    if (
        row &&
        row.outcome &&
        typeof row.outcome ===
            "object"
    ) {

        return row.outcome;
    }


    return {

        label:
            row.label ||
            "NO_TRADE",

        preferredDirection:
            row.preferredDirection ||
            "NONE",

        buyOutcome:
            row.buyOutcome ||
            "TIMEOUT",

        sellOutcome:
            row.sellOutcome ||
            "TIMEOUT"
    };
}


// =====================================================
// SIDE OUTCOME
// =====================================================

function getSideOutcome(
    row,
    side
) {

    const outcome =
        getOutcome(row);

    return side === "BUY"
        ? outcome.buyOutcome
        : outcome.sellOutcome;
}


// =====================================================
// MAE / MFE EXTRACTION
// =====================================================

function extractMAE(
    row,
    side
) {

    const outcome =
        getOutcome(row);


    const candidates = [

        side === "BUY"
            ? outcome.buyMAE
            : outcome.sellMAE,

        side === "BUY"
            ? outcome.buyMae
            : outcome.sellMae,

        side === "BUY"
            ? outcome.buyMaxAdverseR
            : outcome.sellMaxAdverseR,

        outcome.maxAdverseR,

        outcome.maeR,

        row.maxAdverseR,

        row.maeR
    ];


    for (
        const value
        of candidates
    ) {

        const n =
            Number(value);

        if (
            Number.isFinite(n)
        ) {

            return Math.abs(n);
        }
    }


    return null;
}


function extractMFE(
    row,
    side
) {

    const outcome =
        getOutcome(row);


    const candidates = [

        side === "BUY"
            ? outcome.buyMFE
            : outcome.sellMFE,

        side === "BUY"
            ? outcome.sellMFE
            : outcome.buyMFE,

        outcome.mfeR,

        outcome.maxFavorableR,

        row.mfeR,

        row.maxFavorableR
    ];


    for (
        const value
        of candidates
    ) {

        const n =
            Number(value);

        if (
            Number.isFinite(n)
        ) {

            return Math.abs(n);
        }
    }


    return null;
}


// =====================================================
// CREATE EMPTY PATTERN
// =====================================================

function emptyPattern(
    descriptor
) {

    return {

        key:
            descriptor.key,

        side:
            descriptor.side,

        level:
            descriptor.level,

        features:
            descriptor.features,

        samples: 0,

        wins: 0,

        losses: 0,

        timeouts: 0,

        decisive: 0,

        winRate: 0,

        averageWinR: 0,

        averageLossR: 0,

        totalWinR: 0,

        totalLossR: 0,

        expectedValueR: 0,

        profitFactor: 0,

        timeoutRate: 0,

        maeSamples: 0,

        mfeSamples: 0,

        averageMAER: 0,

        averageMFER: 0,

        maxMAER: 0,

        maxMFER: 0
    };
}


// =====================================================
// UPDATE PATTERN
// =====================================================

function updatePattern(
    pattern,
    row
) {

    const side =
        pattern.side;


    const outcome =
        getSideOutcome(
            row,
            side
        );


    pattern.samples++;


    if (
        outcome === "WIN"
    ) {

        pattern.wins++;

        const winR =
            safeNumber(
                row.winR ??
                getOutcome(row).winR,
                DEFAULT_WIN_R
            );

        pattern.totalWinR +=
            Math.max(
                0,
                winR
            );
    }


    else if (
        outcome === "LOSS"
    ) {

        pattern.losses++;

        const lossR =
            safeNumber(
                row.lossR ??
                getOutcome(row).lossR,
                DEFAULT_LOSS_R
            );

        pattern.totalLossR +=
            Math.abs(
                lossR
            );
    }


    else {

        pattern.timeouts++;
    }


    const mae =
        extractMAE(
            row,
            side
        );


    if (
        mae !== null
    ) {

        pattern.maeSamples++;

        pattern.averageMAER =
            (
                (
                    pattern.averageMAER *
                    (
                        pattern.maeSamples - 1
                    )
                ) +
                mae
            ) /
            pattern.maeSamples;


        pattern.maxMAER =
            Math.max(
                pattern.maxMAER,
                mae
            );
    }


    const mfe =
        extractMFE(
            row,
            side
        );


    if (
        mfe !== null
    ) {

        pattern.mfeSamples++;

        pattern.averageMFER =
            (
                (
                    pattern.averageMFER *
                    (
                        pattern.mfeSamples - 1
                    )
                ) +
                mfe
            ) /
            pattern.mfeSamples;


        pattern.maxMFER =
            Math.max(
                pattern.maxMFER,
                mfe
            );
    }
}


// =====================================================
// FINALIZE PATTERN
// =====================================================

function finalizePattern(
    pattern
) {

    pattern.decisive =
        pattern.wins +
        pattern.losses;


    pattern.winRate =
        safeRate(
            pattern.wins,
            pattern.decisive
        );


    pattern.timeoutRate =
        safeRate(
            pattern.timeouts,
            pattern.samples
        );


    pattern.averageWinR =
        pattern.wins > 0
            ? pattern.totalWinR /
              pattern.wins
            : 0;


    pattern.averageLossR =
        pattern.losses > 0
            ? pattern.totalLossR /
              pattern.losses
            : 0;


    pattern.expectedValueR =
        pattern.samples > 0

            ? (
                (
                    pattern.wins *
                    pattern.averageWinR
                ) -
                (
                    pattern.losses *
                    pattern.averageLossR
                )
            ) /
            pattern.samples

            : 0;


    pattern.profitFactor =
        pattern.totalLossR > 0

            ? pattern.totalWinR /
              pattern.totalLossR

            : 0;


    return pattern;
}


// =====================================================
// DISCOVER PATTERNS
// =====================================================

function discoverPatterns(
    rows
) {

    const map =
        new Map();


    for (
        const row
        of rows
    ) {

        const outcome =
            getOutcome(row);


        /*
        We learn BUY and SELL
        independently.

        If the row has a preferred
        direction, use that.

        Otherwise we can still learn
        both sides from their actual
        outcomes.
        */

        const sides = [];


        if (
            outcome.buyOutcome ===
            "WIN" ||
            outcome.buyOutcome ===
            "LOSS" ||
            outcome.buyOutcome ===
            "TIMEOUT"
        ) {

            sides.push("BUY");
        }


        if (
            outcome.sellOutcome ===
            "WIN" ||
            outcome.sellOutcome ===
            "LOSS" ||
            outcome.sellOutcome ===
            "TIMEOUT"
        ) {

            sides.push("SELL");
        }


        for (
            const side
            of sides
        ) {

            const descriptors =
                getRowPatterns(
                    row,
                    side
                );


            for (
                const descriptor
                of descriptors
            ) {

                if (
                    !map.has(
                        descriptor.key
                    )
                ) {

                    map.set(
                        descriptor.key,
                        emptyPattern(
                            descriptor
                        )
                    );
                }


                updatePattern(
                    map.get(
                        descriptor.key
                    ),
                    row
                );
            }
        }
    }


    const patterns = [];


    for (
        const pattern
        of map.values()
    ) {

        finalizePattern(
            pattern
        );


        if (
            pattern.samples <
            MIN_PATTERN_SAMPLES
        ) {
            continue;
        }


        if (
            pattern.decisive <
            MIN_DECISIVE_SAMPLES
        ) {
            continue;
        }


        patterns.push(
            pattern
        );
    }


    return patterns;
}


// =====================================================
// BUILD PATTERN MAP
// =====================================================

function buildPatternMap(
    patterns
) {

    const map =
        new Map();


    for (
        const pattern
        of patterns
    ) {

        map.set(
            pattern.key,
            pattern
        );
    }


    return map;
}


// =====================================================
// EVALUATE LEARNED PATTERNS
// =====================================================

function evaluatePatterns(
    rows,
    learnedPatterns
) {

    const patternMap =
        buildPatternMap(
            learnedPatterns
        );


    const aggregate = {

        matchedRows: 0,

        wins: 0,

        losses: 0,

        timeouts: 0,

        decisiveTrades: 0,

        totalWinR: 0,

        totalLossR: 0,

        maeSamples: 0,

        mfeSamples: 0,

        totalMAER: 0,

        totalMFER: 0,

        maxMAER: 0,

        maxMFER: 0
    };


    for (
        const row
        of rows
    ) {

        const outcome =
            getOutcome(row);


        const sides = [];


        /*
        Use preferred direction
        first when available.
        */

        if (
            outcome.preferredDirection ===
            "BUY"
        ) {

            sides.push("BUY");

        }

        else if (
            outcome.preferredDirection ===
            "SELL"
        ) {

            sides.push("SELL");

        }

        else {

            if (
                outcome.buyOutcome ===
                "WIN" ||
                outcome.buyOutcome ===
                "LOSS"
            ) {

                sides.push("BUY");
            }


            if (
                outcome.sellOutcome ===
                "WIN" ||
                outcome.sellOutcome ===
                "LOSS"
            ) {

                sides.push("SELL");
            }
        }


        /*
        Prevent the same row from
        being counted twice in the
        normal preferred-direction
        case.
        */

        for (
            const side
            of sides
        ) {

            const descriptors =
                getRowPatterns(
                    row,
                    side
                );


            let matched =
                false;


            for (
                const descriptor
                of descriptors
            ) {

                if (
                    patternMap.has(
                        descriptor.key
                    )
                ) {

                    matched = true;

                    break;
                }
            }


            if (!matched) {
                continue;
            }


            aggregate.matchedRows++;


            const sideOutcome =
                getSideOutcome(
                    row,
                    side
                );


            if (
                sideOutcome ===
                "WIN"
            ) {

                aggregate.wins++;

                const winR =
                    safeNumber(
                        row.winR ??
                        outcome.winR,
                        DEFAULT_WIN_R
                    );

                aggregate.totalWinR +=
                    Math.max(
                        0,
                        winR
                    );
            }


            else if (
                sideOutcome ===
                "LOSS"
            ) {

                aggregate.losses++;

                const lossR =
                    safeNumber(
                        row.lossR ??
                        outcome.lossR,
                        DEFAULT_LOSS_R
                    );

                aggregate.totalLossR +=
                    Math.abs(
                        lossR
                    );
            }


            else {

                aggregate.timeouts++;
            }


            const mae =
                extractMAE(
                    row,
                    side
                );


            if (
                mae !== null
            ) {

                aggregate.maeSamples++;

                aggregate.totalMAER +=
                    mae;

                aggregate.maxMAER =
                    Math.max(
                        aggregate.maxMAER,
                        mae
                    );
            }


            const mfe =
                extractMFE(
                    row,
                    side
                );


            if (
                mfe !== null
            ) {

                aggregate.mfeSamples++;

                aggregate.totalMFER +=
                    mfe;

                aggregate.maxMFER =
                    Math.max(
                        aggregate.maxMFER,
                        mfe
                    );
            }
        }
    }


    aggregate.decisiveTrades =
        aggregate.wins +
        aggregate.losses;


    aggregate.winRate =
        safeRate(
            aggregate.wins,
            aggregate.decisiveTrades
        );


    aggregate.timeoutRate =
        safeRate(
            aggregate.timeouts,
            aggregate.matchedRows
        );


    aggregate.expectedValueR =
        aggregate.matchedRows > 0

            ? (
                aggregate.totalWinR -
                aggregate.totalLossR
            ) /
            aggregate.matchedRows

            : 0;


    aggregate.profitFactor =
        aggregate.totalLossR > 0

            ? aggregate.totalWinR /
              aggregate.totalLossR

            : 0;


    aggregate.averageMAER =
        aggregate.maeSamples > 0

            ? aggregate.totalMAER /
              aggregate.maeSamples

            : null;


    aggregate.averageMFER =
        aggregate.mfeSamples > 0

            ? aggregate.totalMFER /
              aggregate.mfeSamples

            : null;


    return aggregate;
}


// =====================================================
// WALK-FORWARD FOLD CREATION
// =====================================================

function createWalkForwardFolds(
    rows
) {

    const total =
        rows.length;


    /*
    We use expanding chronological
    training windows.

    No future information is used
    to create a previous fold.
    */

    const folds = [];


    const minimumTraining =
        Math.floor(
            total * 0.40
        );


    const remaining =
        total -
        minimumTraining;


    const testSize =
        Math.max(
            50,
            Math.floor(
                remaining /
                FOLD_COUNT
            )
        );


    for (
        let i = 0;
        i < FOLD_COUNT;
        i++
    ) {

        const trainEnd =
            minimumTraining +
            (
                i *
                testSize
            );


        const testEnd =
            Math.min(
                total,
                trainEnd +
                testSize
            );


        if (
            trainEnd >=
            total
        ) {
            break;
        }


        if (
            testEnd <=
            trainEnd
        ) {
            continue;
        }


        folds.push({

            fold:
                i + 1,

            trainingStart:
                0,

            trainingEnd:
                trainEnd,

            testStart:
                trainEnd,

            testEnd:

                testEnd,

            trainingRows:
                rows.slice(
                    0,
                    trainEnd
                ),

            testRows:
                rows.slice(
                    trainEnd,
                    testEnd
                )
        });
    }


    return folds;
}


// =====================================================
// FOLD PATTERN PERFORMANCE
// =====================================================

function patternFoldPerformance(
    rows,
    pattern
) {

    let samples = 0;

    let wins = 0;

    let losses = 0;

    let timeouts = 0;

    let totalWinR = 0;

    let totalLossR = 0;

    let totalMAE = 0;

    let maeSamples = 0;

    let totalMFE = 0;

    let mfeSamples = 0;


    for (
        const row
        of rows
    ) {

        const outcome =
            getOutcome(row);


        const side =
            pattern.side;


        const descriptors =
            getRowPatterns(
                row,
                side
            );


        const matched =
            descriptors.some(
                descriptor =>
                    descriptor.key ===
                    pattern.key
            );


        if (!matched) {
            continue;
        }


        samples++;


        const sideOutcome =
            getSideOutcome(
                row,
                side
            );


        if (
            sideOutcome ===
            "WIN"
        ) {

            wins++;

            totalWinR +=
                Math.max(
                    0,
                    safeNumber(
                        row.winR ??
                        outcome.winR,
                        DEFAULT_WIN_R
                    )
                );
        }


        else if (
            sideOutcome ===
            "LOSS"
        ) {

            losses++;

            totalLossR +=
                Math.abs(
                    safeNumber(
                        row.lossR ??
                        outcome.lossR,
                        DEFAULT_LOSS_R
                    )
                );
        }


        else {

            timeouts++;
        }


        const mae =
            extractMAE(
                row,
                side
            );


        if (
            mae !== null
        ) {

            totalMAE += mae;

            maeSamples++;
        }


        const mfe =
            extractMFE(
                row,
                side
            );


        if (
            mfe !== null
        ) {

            totalMFE += mfe;

            mfeSamples++;
        }
    }


    const decisive =
        wins +
        losses;


    const expectedValueR =
        samples > 0

            ? (
                totalWinR -
                totalLossR
            ) /
            samples

            : 0;


    const profitFactor =
        totalLossR > 0

            ? totalWinR /
              totalLossR

            : 0;


    return {

        samples,

        wins,

        losses,

        timeouts,

        decisive,

        winRate:
            safeRate(
                wins,
                decisive
            ),

        timeoutRate:
            safeRate(
                timeouts,
                samples
            ),

        totalWinR,

        totalLossR,

        expectedValueR,

        profitFactor,

        averageMAER:
            maeSamples > 0
                ? totalMAE /
                  maeSamples
                : null,

        averageMFER:
            mfeSamples > 0
                ? totalMFE /
                  mfeSamples
                : null
    };
}


// =====================================================
// WALK-FORWARD ANALYSIS
// =====================================================

function walkForwardAnalysis(
    rows
) {

    const folds =
        createWalkForwardFolds(
            rows
        );


    const discovered =
        discoverPatterns(
            rows
        );


    /*
    Candidate patterns must be
    discovered independently inside
    each training fold.
    */

    const candidateMap =
        new Map();


    const foldResults = [];


    for (
        const fold
        of folds
    ) {

        const trainingPatterns =
            discoverPatterns(
                fold.trainingRows
            );


        const eligible =
            trainingPatterns.filter(
                pattern =>

                    pattern.samples >=
                    ROBUST_MIN_SAMPLES &&

                    pattern.decisive >=
                    MIN_DECISIVE_SAMPLES &&

                    pattern.expectedValueR >=
                    MIN_EXPECTED_VALUE_R &&

                    pattern.profitFactor >=
                    MIN_PROFIT_FACTOR
            );


        for (
            const pattern
            of eligible
        ) {

            if (
                !candidateMap.has(
                    pattern.key
                )
            ) {

                candidateMap.set(
                    pattern.key,
                    {

                        key:
                            pattern.key,

                        side:
                            pattern.side,

                        level:
                            pattern.level,

                        features:
                            pattern.features,

                        foldsSeen: 0,

                        foldDetails: [],

                        trainExpectedValues: [],

                        testExpectedValues: [],

                        testProfitFactors: [],

                        testWinRates: [],

                        testSamples: 0,

                        stableFolds: 0,

                        positiveFolds: 0
                    }
                );
            }


            const candidate =
                candidateMap.get(
                    pattern.key
                );


            const testPerformance =
                patternFoldPerformance(
                    fold.testRows,
                    pattern
                );


            candidate.foldsSeen++;


            candidate.foldDetails.push({

                fold:
                    fold.fold,

                trainingSamples:
                    pattern.samples,

                trainingWinRate:
                    round(
                        pattern.winRate
                    ),

                trainingExpectedValueR:
                    round(
                        pattern.expectedValueR
                    ),

                trainingProfitFactor:
                    round(
                        pattern.profitFactor
                    ),

                testSamples:
                    testPerformance.samples,

                testWins:
                    testPerformance.wins,

                testLosses:
                    testPerformance.losses,

                testTimeouts:
                    testPerformance.timeouts,

                testWinRate:
                    round(
                        testPerformance.winRate
                    ),

                testExpectedValueR:
                    round(
                        testPerformance.expectedValueR
                    ),

                testProfitFactor:
                    round(
                        testPerformance.profitFactor
                    ),

                testAverageMAER:
                    testPerformance.averageMAER !==
                    null

                        ? round(
                            testPerformance.averageMAER
                        )

                        : null,

                testAverageMFER:
                    testPerformance.averageMFER !==
                    null

                        ? round(
                            testPerformance.averageMFER
                        )

                        : null
            });


            candidate.trainExpectedValues.push(
                pattern.expectedValueR
            );


            candidate.testExpectedValues.push(
                testPerformance.expectedValueR
            );


            candidate.testProfitFactors.push(
                testPerformance.profitFactor
            );


            candidate.testWinRates.push(
                testPerformance.winRate
            );


            if (
                testPerformance.samples >=
                MIN_FOLD_SAMPLES &&
                testPerformance.decisive >=
                MIN_FOLD_DECISIVE
            ) {

                candidate.testSamples +=
                    testPerformance.samples;


                if (
                    testPerformance.expectedValueR >
                    0
                ) {

                    candidate.positiveFolds++;
                }


                if (
                    testPerformance.expectedValueR >=
                    MIN_EXPECTED_VALUE_R
                ) {

                    candidate.stableFolds++;
                }
            }
        }


        foldResults.push({

            fold:
                fold.fold,

            trainingRows:
                fold.trainingRows.length,

            testRows:
                fold.testRows.length,

            trainingPatterns:
                trainingPatterns.length,

            eligiblePatterns:
                eligible.length
        });
    }


    const candidates = [];


    for (
        const candidate
        of candidateMap.values()
    ) {

        const averageTestEV =
            average(
                candidate.testExpectedValues
            );


        const averageTestPF =
            average(
                candidate.testProfitFactors
            );


        const averageTestWR =
            average(
                candidate.testWinRates
            );


        const minimumTestEV =
            candidate.testExpectedValues.length

                ? Math.min(
                    ...candidate.testExpectedValues
                )

                : 0;


        const maximumTestEV =
            candidate.testExpectedValues.length

                ? Math.max(
                    ...candidate.testExpectedValues
                )

                : 0;


        const foldStability =
            candidate.foldsSeen > 0

                ? (
                    candidate.stableFolds /
                    candidate.foldsSeen
                )

                : 0;


        const positiveFoldRate =
            candidate.foldsSeen > 0

                ? (
                    candidate.positiveFolds /
                    candidate.foldsSeen
                )

                : 0;


        /*
        Stability score.

        The engine deliberately
        rewards consistency rather
        than one spectacular fold.
        */

        const evScore =
            clamp(
                (
                    averageTestEV -
                    MIN_EXPECTED_VALUE_R
                ) /
                (
                    PREFERRED_EXPECTED_VALUE_R -
                    MIN_EXPECTED_VALUE_R
                ),
                0,
                1
            );


        const pfScore =
            clamp(
                (
                    averageTestPF -
                    MIN_PROFIT_FACTOR
                ) /
                (
                    PREFERRED_PROFIT_FACTOR -
                    MIN_PROFIT_FACTOR
                ),
                0,
                1
            );


        const stabilityScore =
            clamp(
                foldStability,
                0,
                1
            );


        const positiveScore =
            clamp(
                positiveFoldRate,
                0,
                1
            );


        const sampleScore =
            clamp(
                candidate.testSamples /
                100,
                0,
                1
            );


        candidate.averageTestEV =
            averageTestEV;


        candidate.averageTestPF =
            averageTestPF;


        candidate.averageTestWinRate =
            averageTestWR;


        candidate.minimumTestEV =
            minimumTestEV;


        candidate.maximumTestEV =
            maximumTestEV;


        candidate.foldStability =
            foldStability;


        candidate.positiveFoldRate =
            positiveFoldRate;


        candidate.testSampleCount =
            candidate.testSamples;


        candidate.robustnessScore =
            (
                evScore *
                30
            ) +
            (
                pfScore *
                20
            ) +
            (
                stabilityScore *
                25
            ) +
            (
                positiveScore *
                15
            ) +
            (
                sampleScore *
                10
            );


        /*
        Final robustness gate.

        A pattern must make money
        repeatedly, not just once.
        */

        candidate.robust =
            candidate.foldsSeen >=
            MIN_STABLE_FOLDS &&

            candidate.stableFolds >=
            MIN_STABLE_FOLDS &&

            candidate.positiveFolds >=
            MIN_STABLE_FOLDS &&

            averageTestEV >=
            MIN_EXPECTED_VALUE_R &&

            averageTestPF >=
            MIN_PROFIT_FACTOR &&

            candidate.testSamples >=
            30;
        

        candidates.push(
            candidate
        );
    }


    candidates.sort(
        (
            a,
            b
        ) =>
            b.robustnessScore -
            a.robustnessScore
    );


    return {

        folds:
            foldResults,

        candidateCount:
            candidates.length,

        robustCandidates:
            candidates.filter(
                c =>
                    c.robust
            ).length,

        robustBuyCandidates:
            candidates.filter(
                c =>
                    c.robust &&
                    c.side === "BUY"
            ).length,

        robustSellCandidates:
            candidates.filter(
                c =>
                    c.robust &&
                    c.side === "SELL"
            ).length,

        candidates
    };
}


// =====================================================
// FINAL TRADE QUALITY SCORE
// =====================================================

function finalTradeScore(
    candidate
) {

    const ev =
        clamp(
            (
                candidate.averageTestEV -
                MIN_EXPECTED_VALUE_R
            ) /
            0.75,
            0,
            1
        );


    const pf =
        clamp(
            (
                candidate.averageTestPF -
                MIN_PROFIT_FACTOR
            ) /
            1.5,
            0,
            1
        );


    const stability =
        clamp(
            candidate.foldStability,
            0,
            1
        );


    const positive =
        clamp(
            candidate.positiveFoldRate,
            0,
            1
        );


    return (
        ev * 35
    ) +
    (
        pf * 25
    ) +
    (
        stability * 25
    ) +
    (
        positive * 15
    );
}


// =====================================================
// FINAL RECOMMENDATION
// =====================================================

function buildRecommendation(
    analysis
) {

    const robust =
        analysis.candidates.filter(
            candidate =>
                candidate.robust
        );


    if (!robust.length) {

        return {

            status:
                "NO_ROBUST_EDGE",

            candidateCount:
                analysis.candidateCount,

            robustCandidates:
                0,

            message:
                "No pattern has demonstrated sufficient out-of-sample stability. Do not generate paper signals from these patterns yet."
        };
    }


    const ranked =
        robust
            .map(
                candidate => ({

                    ...candidate,

                    tradeQualityScore:
                        finalTradeScore(
                            candidate
                        )
                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    b.tradeQualityScore -
                    a.tradeQualityScore
            );


    const buy =
        ranked.filter(
            p =>
                p.side === "BUY"
        );


    const sell =
        ranked.filter(
            p =>
                p.side === "SELL"
        );


    return {

        status:
            "ROBUST_CANDIDATES_FOUND",

        candidateCount:
            analysis.candidateCount,

        robustCandidates:
            ranked.length,

        robustBuyCandidates:
            buy.length,

        robustSellCandidates:
            sell.length,

        bestExpectedValueR:
            round(
                Math.max(
                    ...ranked.map(
                        p =>
                            p.averageTestEV
                    )
                )
            ),

        bestProfitFactor:
            round(
                Math.max(
                    ...ranked.map(
                        p =>
                            p.averageTestPF
                    )
                )
            ),

        message:
            "Robust historical candidates were found, but they remain PAPER candidates and must pass forward paper testing before any live execution.",

        topBUY:
            buy
                .slice(
                    0,
                    10
                ),

        topSELL:
            sell
                .slice(
                    0,
                    10
                )
    };
}


// =====================================================
// FETCH V11.1 DATA
// =====================================================

async function fetchLearningDataset(
    req,
    days
) {

    const protocol =
        req.headers["x-forwarded-proto"] ||
        "https";


    const host =
        req.headers.host;


    if (!host) {

        throw new Error(
            "Unable to determine Vercel host"
        );
    }


    const url =
        `${protocol}://${host}` +
        `/api/learning-dataset` +
        `?interval=5minute` +
        `&days=${days}`;


    const response =
        await fetch(
            url
        );


    if (!response.ok) {

        throw new Error(
            `V11.1 dataset request failed: ${response.status}`
        );
    }


    const data =
        await response.json();


    if (
        !data ||
        data.success !== true
    ) {

        throw new Error(
            "V11.1 learning dataset returned unsuccessful response"
        );
    }


    if (
        !Array.isArray(
            data.rows
        )
    ) {

        throw new Error(
            "V11.1 did not return learning rows"
        );
    }


    return data;
}


// =====================================================
// MAIN HANDLER
// =====================================================

export default async function handler(
    req,
    res
) {

    try {

        const requestedDays =
            Math.max(
                7,
                Math.min(
                    30,
                    Number(
                        req.query.days ||
                        30
                    )
                )
            );


        /*
        V11.1 remains the ONLY
        market-data source.

        V11.7 does not directly
        access INDstocks.
        */

        const dataset =
            await fetchLearningDataset(
                req,
                requestedDays
            );


        const rows =
            dataset.rows;


        if (
            rows.length <
            300
        ) {

            return res.status(400).json({

                success:
                    false,

                version:
                    VERSION,

                error:
                    "Not enough historical rows for walk-forward analysis.",

                learningRows:
                    rows.length,

                minimumRows:
                    300,

                paperOnly:
                    true,

                realOrders:
                    false
            });
        }


        /*
        Ensure chronological order.

        V11.1 should already return
        chronological data, but we
        enforce it here.
        */

        rows.sort(
            (
                a,
                b
            ) =>
                safeNumber(
                    a.timestamp
                ) -
                safeNumber(
                    b.timestamp
                )
        );


        const analysis =
            walkForwardAnalysis(
                rows
            );


        const recommendation =
            buildRecommendation(
                analysis
            );


        /*
        Candidate summary.
        */

        const allCandidates =
            analysis.candidates;


        const robustCandidates =
            allCandidates.filter(
                candidate =>
                    candidate.robust
            );


        const buyCandidates =
            robustCandidates
                .filter(
                    candidate =>
                        candidate.side ===
                        "BUY"
                )
                .map(
                    candidate => ({

                        ...candidate,

                        tradeQualityScore:
                            round(
                                finalTradeScore(
                                    candidate
                                ),
                                2
                            )
                    })
                );


        const sellCandidates =
            robustCandidates
                .filter(
                    candidate =>
                        candidate.side ===
                        "SELL"
                )
                .map(
                    candidate => ({

                        ...candidate,

                        tradeQualityScore:
                            round(
                                finalTradeScore(
                                    candidate
                                ),
                                2
                            )
                    })
                );


        buyCandidates.sort(
            (
                a,
                b
            ) =>
                b.tradeQualityScore -
                a.tradeQualityScore
        );


        sellCandidates.sort(
            (
                a,
                b
            ) =>
                b.tradeQualityScore -
                a.tradeQualityScore
        );


        /*
        Overall dataset statistics.
        */

        const totalWins =
            rows.reduce(
                (
                    total,
                    row
                ) => {

                    const outcome =
                        getOutcome(row);

                    return (
                        total +
                        (
                            outcome.label ===
                            "BUY_WIN" ||
                            outcome.buyOutcome ===
                            "WIN"
                                ? 1
                                : 0
                        )
                    );
                },
                0
            );


        return res.status(200).json({

            success:
                true,

            version:
                VERSION,

            status:
                "COMPLETED",

            mode:
                "WALK_FORWARD_ROBUSTNESS_LEARNING",

            paperOnly:
                true,

            realOrders:
                false,

            instrument:
                "NIFTY 50",

            interval:
                "5minute",

            requestedDays,

            source:
                "V11.1_LEARNING_DATASET",


            /*
            Objective
            */

            objective: {

                primary:
                    "MAXIMIZE_EXPECTED_VALUE",

                secondary:
                    "MINIMIZE_LOSS",

                tertiary:
                    "SELECT_STABLE_HIGH_QUALITY_TRADES",

                allowNoTrade:
                    true,

                minimumExpectedValueR:
                    MIN_EXPECTED_VALUE_R,

                preferredExpectedValueR:
                    PREFERRED_EXPECTED_VALUE_R,

                minimumProfitFactor:
                    MIN_PROFIT_FACTOR,

                preferredProfitFactor:
                    PREFERRED_PROFIT_FACTOR,

                minimumStableFolds:
                    MIN_STABLE_FOLDS
            },


            /*
            Source quality
            */

            sourceStatistics: {

                candlesTested:
                    dataset.candlesTested,

                learningRows:
                    dataset.learningRows,

                tradingDays:
                    dataset.tradingDays,

                dataQuality:
                    dataset.dataQuality
            },


            /*
            Walk-forward design
            */

            walkForward: {

                foldCount:
                    analysis.folds.length,

                chronological:
                    true,

                shuffled:
                    false,

                expandingTrainingWindow:
                    true,

                folds:
                    analysis.folds
            },


            /*
            Pattern results
            */

            learning: {

                minimumPatternSamples:
                    MIN_PATTERN_SAMPLES,

                minimumDecisiveSamples:
                    MIN_DECISIVE_SAMPLES,

                robustMinimumSamples:
                    ROBUST_MIN_SAMPLES,

                patternsDiscovered:
                    analysis.candidateCount,

                robustPatterns:
                    analysis.robustCandidates,

                robustBuyPatterns:
                    analysis.robustBuyCandidates,

                robustSellPatterns:
                    analysis.robustSellCandidates
            },


            /*
            All candidates ranked by
            robustness.
            */

            candidates:
                allCandidates
                    .slice(
                        0,
                        50
                    )
                    .map(
                        candidate => ({

                            ...candidate,

                            tradeQualityScore:
                                round(
                                    finalTradeScore(
                                        candidate
                                    ),
                                    2
                                )
                        })
                    ),


            /*
            Final paper candidates
            */

            robustCandidates: {

                BUY:
                    buyCandidates
                        .slice(
                            0,
                            15
                        ),

                SELL:
                    sellCandidates
                        .slice(
                            0,
                            15
                        )
            },


            /*
            MAE / MFE status
            */

            riskAnalysis: {

                objective:
                    "MINIMIZE_LOSS_AND_MAXIMIZE_FAVORABLE_MOVE",

                maeAvailable:
                    rows.some(
                        row =>
                            extractMAE(
                                row,
                                "BUY"
                            ) !== null ||
                            extractMAE(
                                row,
                                "SELL"
                            ) !== null
                    ),

                mfeAvailable:
                    rows.some(
                        row =>
                            extractMFE(
                                row,
                                "BUY"
                            ) !== null ||
                            extractMFE(
                                row,
                                "SELL"
                            ) !== null
                    ),

                message:
                    "MAE/MFE are consumed when supplied by V11.1. If unavailable, V11.7 does not invent them."
            },


            /*
            Final recommendation
            */

            recommendation: {

                ...recommendation,

                paperOnly:
                    true,

                realOrders:
                    false
            }

        });

    }

    catch (error) {

        console.error(
            "V11.7 ERROR:",
            error
        );


        return res.status(500).json({

            success:
                false,

            version:
                VERSION,

            error:
                error.message,

            paperOnly:
                true,

            realOrders:
                false
        });
    }
}
