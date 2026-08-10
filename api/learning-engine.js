/*
============================================================
TradeMind Pro
V11.9 REAL EXECUTION RISK/REWARD BACKTEST
============================================================

V11.9 PURPOSE

V11.8 proved that some patterns can be statistically robust.

V11.9 now asks the more important question:

    "Does the actual historical trade make money?"

The existing V11.1 dataset already creates:

    Entry
    1R ATR Stop
    2R ATR Target
    BUY outcome
    SELL outcome
    MAE
    MFE

V11.9 uses those ACTUAL historical execution outcomes.

NO REAL ORDERS.
PAPER ONLY.
============================================================
*/

const VERSION = "V11.9";


// ============================================================
// CONFIGURATION
// ============================================================

const MIN_PATTERN_SAMPLES = 20;
const MIN_DECISIVE_SAMPLES = 12;

const MIN_FOLD_SAMPLES = 8;
const MIN_FOLD_DECISIVE = 5;

const FOLD_COUNT = 4;
const MIN_STABLE_FOLDS = 3;

const MIN_EXPECTED_VALUE_R = 0.20;
const PREFERRED_EXPECTED_VALUE_R = 0.35;

const MIN_PROFIT_FACTOR = 1.25;
const PREFERRED_PROFIT_FACTOR = 1.50;

const MIN_RISK_REWARD = 2.00;
const PREFERRED_RISK_REWARD = 2.50;

const MIN_TRADE_SCORE = 65;

const MIN_TEST_TRADES = 30;


// ============================================================
// HELPERS
// ============================================================

function safeNumber(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;

}


function round(value, decimals = 3) {

    if (!Number.isFinite(value)) {
        return 0;
    }

    return Number(
        Number(value).toFixed(decimals)
    );

}


function rate(wins, total) {

    if (!total) {
        return 0;
    }

    return (
        wins /
        total
    ) * 100;

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


function clamp(
    value,
    minimum,
    maximum
) {

    return Math.max(
        minimum,
        Math.min(
            maximum,
            value
        )
    );

}


// ============================================================
// BUCKET FUNCTIONS
// ============================================================

function bucketRSI(value) {

    const x =
        safeNumber(value);

    if (x < 30)
        return "RSI_LT30";

    if (x < 35)
        return "RSI_30_35";

    if (x < 40)
        return "RSI_35_40";

    if (x < 45)
        return "RSI_40_45";

    if (x < 50)
        return "RSI_45_50";

    if (x < 55)
        return "RSI_50_55";

    if (x < 60)
        return "RSI_55_60";

    if (x < 65)
        return "RSI_60_65";

    if (x < 70)
        return "RSI_65_70";

    return "RSI_70_PLUS";

}


function bucketVWAP(value) {

    const x =
        safeNumber(value);

    if (x < -2)
        return "VWAP_LT_MINUS2";

    if (x < -1)
        return "VWAP_MINUS2_MINUS1";

    if (x < -0.25)
        return "VWAP_MINUS1_MINUS025";

    if (x < 0.25)
        return "VWAP_MINUS025_025";

    if (x < 1)
        return "VWAP_025_1";

    if (x < 2)
        return "VWAP_1_2";

    return "VWAP_GT2";

}


function bucketSpread(value) {

    const x =
        Math.abs(
            safeNumber(value)
        );

    if (x < 0.25)
        return "SPREAD_LT025";

    if (x < 0.50)
        return "SPREAD_025_050";

    if (x < 0.75)
        return "SPREAD_050_075";

    if (x < 1)
        return "SPREAD_075_100";

    return "SPREAD_1_PLUS";

}


function bucketTime(hour) {

    const h =
        safeNumber(hour);

    if (h < 10)
        return "TIME_OPEN";

    if (h < 11)
        return "TIME_MORNING";

    if (h < 13)
        return "TIME_MIDDAY";

    if (h < 14)
        return "TIME_AFTERNOON";

    return "TIME_CLOSE";

}


function bucketTrend(value) {

    const text =
        String(
            value || ""
        ).toUpperCase();

    if (
        text.includes("BULL")
    ) {
        return "TREND_BULLISH";
    }

    if (
        text.includes("BEAR")
    ) {
        return "TREND_BEARISH";
    }

    if (
        text.includes("SIDE")
    ) {
        return "TREND_SIDEWAYS";
    }

    return "TREND_OTHER";

}


function bucketRegime(value) {

    const text =
        String(
            value || ""
        ).toUpperCase();

    if (
        text.includes("TREND")
    ) {
        return "REGIME_TRENDING";
    }

    if (
        text.includes("RANGE")
    ) {
        return "REGIME_RANGING";
    }

    if (
        text.includes("TRANS")
    ) {
        return "REGIME_TRANSITION";
    }

    return "REGIME_OTHER";

}


// ============================================================
// PATTERN DESCRIPTORS
// ============================================================

function getDescriptors(
    row,
    side
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


    const descriptors = [];


    // -------------------------
    // LEVEL 1
    // -------------------------

    descriptors.push({
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


    descriptors.push({
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


    descriptors.push({
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


    descriptors.push({
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


    descriptors.push({
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


    descriptors.push({
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


    // -------------------------
    // LEVEL 2
    // -------------------------

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

        descriptors.push({

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


    return descriptors;

}


// ============================================================
// OUTCOME
// ============================================================

function getSideOutcome(
    row,
    side
) {

    const outcome =
        row &&
        row.outcome
            ? row.outcome
            : {};

    return side === "BUY"
        ? outcome.buyOutcome
        : outcome.sellOutcome;

}


// ============================================================
// ACTUAL EXECUTION EXTRACTION
// ============================================================

function getExecution(
    row,
    side
) {

    const outcome =
        row &&
        row.outcome
            ? row.outcome
            : {};


    const result =
        getSideOutcome(
            row,
            side
        );


    const entry =
        safeNumber(
            outcome.entry,
            row.close
        );


    const risk =
        safeNumber(
            outcome.risk,
            row.atr14
        );


    /*
    V11.1 historical execution model:

        Risk = 1 ATR
        Reward = 2 ATR

    Therefore:

        LOSS = -1R
        WIN  = +2R

    This is now explicitly calculated
    from the historical execution model.
    */

    const reward =
        risk * 2;


    return {

        outcome:
            result,

        entry,

        risk,

        reward,

        riskReward:
            risk > 0
                ? reward / risk
                : 0,

        winR:
            result === "WIN"
                ? 2
                : 0,

        lossR:
            result === "LOSS"
                ? 1
                : 0,

        stop:
            side === "BUY"
                ? entry - risk
                : entry + risk,

        target:
            side === "BUY"
                ? entry + reward
                : entry - reward,

        mae:
            side === "BUY"
                ? safeNumber(
                    outcome.maxAdverseBuy,
                    NaN
                )
                : safeNumber(
                    outcome.maxAdverseSell,
                    NaN
                ),

        mfe:
            side === "BUY"
                ? safeNumber(
                    outcome.maxFavorableBuy,
                    NaN
                )
                : safeNumber(
                    outcome.maxFavorableSell,
                    NaN
                )

    };

}


// ============================================================
// EMPTY PATTERN
// ============================================================

function createPattern(
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

        totalWinR: 0,

        totalLossR: 0,

        maeValues: [],

        mfeValues: []

    };

}


// ============================================================
// UPDATE PATTERN
// ============================================================

function updatePattern(
    pattern,
    row
) {

    const execution =
        getExecution(
            row,
            pattern.side
        );


    pattern.samples++;


    if (
        execution.outcome ===
        "WIN"
    ) {

        pattern.wins++;

        pattern.totalWinR +=
            execution.winR;

    }

    else if (
        execution.outcome ===
        "LOSS"
    ) {

        pattern.losses++;

        pattern.totalLossR +=
            execution.lossR;

    }

    else {

        pattern.timeouts++;

    }


    if (
        Number.isFinite(
            execution.mae
        ) &&
        execution.risk > 0
    ) {

        pattern.maeValues.push(
            execution.mae /
            execution.risk
        );

    }


    if (
        Number.isFinite(
            execution.mfe
        ) &&
        execution.risk > 0
    ) {

        pattern.mfeValues.push(
            execution.mfe /
            execution.risk
        );

    }

}


// ============================================================
// FINALIZE PATTERN
// ============================================================

function finalizePattern(
    pattern
) {

    pattern.decisive =
        pattern.wins +
        pattern.losses;


    pattern.winRate =
        rate(
            pattern.wins,
            pattern.decisive
        );


    pattern.timeoutRate =
        rate(
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
                pattern.totalWinR -
                pattern.totalLossR
            ) /
            pattern.samples
            : 0;


    pattern.profitFactor =
        pattern.totalLossR > 0
            ? pattern.totalWinR /
              pattern.totalLossR
            : 0;


    pattern.averageMAER =
        pattern.maeValues.length
            ? average(
                pattern.maeValues
            )
            : null;


    pattern.averageMFER =
        pattern.mfeValues.length
            ? average(
                pattern.mfeValues
            )
            : null;


    /*
    Actual observed MFE/MAE ratio.

    This is supplementary.
    The actual execution RR remains
    the 1R stop / 2R target model.
    */

    pattern.observedRiskReward =
        pattern.averageMAER > 0 &&
        pattern.averageMFER !== null
            ? pattern.averageMFER /
              pattern.averageMAER
            : null;


    return pattern;

}


// ============================================================
// DISCOVER PATTERNS
// ============================================================

function discoverPatterns(
    rows
) {

    const map =
        new Map();


    for (
        const row
        of rows
    ) {

        for (
            const side
            of [
                "BUY",
                "SELL"
            ]
        ) {

            const outcome =
                getSideOutcome(
                    row,
                    side
                );


            if (
                ![
                    "WIN",
                    "LOSS",
                    "TIMEOUT"
                ].includes(
                    outcome
                )
            ) {

                continue;

            }


            const descriptors =
                getDescriptors(
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
                        createPattern(
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


// ============================================================
// MATCH
// ============================================================

function patternMatches(
    row,
    pattern
) {

    return getDescriptors(
        row,
        pattern.side
    ).some(
        descriptor =>
            descriptor.key ===
            pattern.key
    );

}


// ============================================================
// PERFORMANCE
// ============================================================

function calculatePerformance(
    rows,
    pattern
) {

    const performance =
        createPattern(
            pattern
        );


    for (
        const row
        of rows
    ) {

        if (
            !patternMatches(
                row,
                pattern
            )
        ) {

            continue;

        }


        updatePattern(
            performance,
            row
        );

    }


    return finalizePattern(
        performance
    );

}


// ============================================================
// WALK FORWARD FOLDS
// ============================================================

function createWalkForwardFolds(
    rows
) {

    const total =
        rows.length;


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


    const folds = [];


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


// ============================================================
// WALK FORWARD ANALYSIS
// ============================================================

function walkForwardAnalysis(
    rows
) {

    const folds =
        createWalkForwardFolds(
            rows
        );


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
                        MIN_PATTERN_SAMPLES &&
                    pattern.decisive >=
                        MIN_DECISIVE_SAMPLES
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

                        ...pattern,

                        foldsSeen: 0,

                        stableFolds: 0,

                        positiveFolds: 0,

                        testSamples: 0,

                        testExpectedValues: [],

                        testProfitFactors: [],

                        testWinRates: [],

                        foldDetails: []

                    }
                );

            }


            const candidate =
                candidateMap.get(
                    pattern.key
                );


            const testPerformance =
                calculatePerformance(
                    fold.testRows,
                    pattern
                );


            candidate.foldsSeen++;


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


            candidate.foldDetails.push({

                fold:
                    fold.fold,

                trainingSamples:
                    pattern.samples,

                trainingWinRate:
                    round(
                        pattern.winRate,
                        3
                    ),

                trainingExpectedValueR:
                    round(
                        pattern.expectedValueR,
                        3
                    ),

                trainingProfitFactor:
                    round(
                        pattern.profitFactor,
                        3
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
                        testPerformance.winRate,
                        3
                    ),

                testExpectedValueR:
                    round(
                        testPerformance.expectedValueR,
                        3
                    ),

                testProfitFactor:
                    round(
                        testPerformance.profitFactor,
                        3
                    ),

                testAverageMAER:
                    testPerformance.averageMAER ===
                    null
                        ? null
                        : round(
                            testPerformance.averageMAER,
                            3
                        ),

                testAverageMFER:
                    testPerformance.averageMFER ===
                    null
                        ? null
                        : round(
                            testPerformance.averageMFER,
                            3
                        ),

                testObservedRiskReward:
                    testPerformance.observedRiskReward ===
                    null
                        ? null
                        : round(
                            testPerformance.observedRiskReward,
                            3
                        ),

                actualExecutionRiskReward:
                    2

            });

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


        const averageTestWinRate =
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
                ? candidate.stableFolds /
                  candidate.foldsSeen
                : 0;


        const positiveFoldRate =
            candidate.foldsSeen > 0
                ? candidate.positiveFolds /
                  candidate.foldsSeen
                : 0;


        /*
        Actual execution RR is fixed by
        the historical V11.1 execution model:

            1R risk
            2R reward

        */

        const actualExecutionRR =
            MIN_RISK_REWARD;


        const observedRRValues =
            candidate.foldDetails
                .map(
                    fold =>
                        Number(
                            fold.testObservedRiskReward
                        )
                )
                .filter(
                    Number.isFinite
                );


        const observedRR =
            observedRRValues.length
                ? average(
                    observedRRValues
                )
                : null;


        candidate.averageTestEV =
            averageTestEV;

        candidate.averageTestPF =
            averageTestPF;

        candidate.averageTestWinRate =
            averageTestWinRate;

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


        candidate.actualExecutionRiskReward =
            actualExecutionRR;


        candidate.observedRiskReward =
            observedRR;


        /*
        Score components.
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


        const rrScore =
            clamp(
                (
                    actualExecutionRR -
                    MIN_RISK_REWARD
                ) /
                (
                    PREFERRED_RISK_REWARD -
                    MIN_RISK_REWARD
                ),
                0,
                1
            );


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
                20
            ) +

            (
                positiveScore *
                15
            ) +

            (
                sampleScore *
                5
            ) +

            (
                rrScore *
                10
            );


        candidate.tradeQualityScore =
            candidate.robustnessScore;


        /*
        ROBUST candidate.

        Every requirement must pass.
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
            MIN_TEST_TRADES &&

            actualExecutionRR >=
            MIN_RISK_REWARD;


        candidates.push(
            candidate
        );

    }


    candidates.sort(
        (
            a,
            b
        ) =>
            b.tradeQualityScore -
            a.tradeQualityScore
    );


    return {

        folds:
            foldResults,

        candidateCount:
            candidates.length,

        robustCandidates:
            candidates.filter(
                candidate =>
                    candidate.robust
            ).length,

        robustBuyCandidates:
            candidates.filter(
                candidate =>
                    candidate.robust &&
                    candidate.side ===
                    "BUY"
            ).length,

        robustSellCandidates:
            candidates.filter(
                candidate =>
                    candidate.robust &&
                    candidate.side ===
                    "SELL"
            ).length,

        candidates

    };

}


// ============================================================
// ACTUAL TRADE-BY-TRADE BACKTEST
// ============================================================

function executionBacktest(
    rows,
    pattern
) {

    let equityR = 0;

    let peakR = 0;

    let maxDrawdownR = 0;

    let wins = 0;

    let losses = 0;

    let timeouts = 0;

    let trades = 0;

    let consecutiveLosses = 0;

    let maxConsecutiveLosses = 0;


    const tradeResults = [];


    for (
        const row
        of rows
    ) {

        if (
            !patternMatches(
                row,
                pattern
            )
        ) {

            continue;

        }


        const execution =
            getExecution(
                row,
                pattern.side
            );


        if (
            execution.outcome ===
            "WIN"
        ) {

            equityR += 2;

            wins++;

            trades++;

            consecutiveLosses = 0;

            tradeResults.push(
                2
            );

        }

        else if (
            execution.outcome ===
            "LOSS"
        ) {

            equityR -= 1;

            losses++;

            trades++;

            consecutiveLosses++;

            maxConsecutiveLosses =
                Math.max(
                    maxConsecutiveLosses,
                    consecutiveLosses
                );

            tradeResults.push(
                -1
            );

        }

        else {

            timeouts++;

            /*
            TIMEOUT is not counted
            as a loss.

            It remains a neutral
            non-decisive trade.
            */

        }


        peakR =
            Math.max(
                peakR,
                equityR
            );


        maxDrawdownR =
            Math.max(
                maxDrawdownR,
                peakR -
                equityR
            );

    }


    const decisiveTrades =
        wins +
        losses;


    const totalWinR =
        wins * 2;


    const totalLossR =
        losses * 1;


    return {

        trades,

        wins,

        losses,

        timeouts,

        decisiveTrades,

        winRate:
            rate(
                wins,
                decisiveTrades
            ),

        totalWinR,

        totalLossR,

        netR:
            equityR,

        expectedValueR:
            trades > 0
                ? equityR /
                  trades
                : 0,

        profitFactor:
            totalLossR > 0
                ? totalWinR /
                  totalLossR
                : 0,

        maxDrawdownR,

        maxConsecutiveLosses,

        finalEquityR:
            equityR,

        executionRiskReward:
            2,

        stopR:
            1,

        targetR:
            2,

        preferredTargetR:
            2.5,

        tradeResults

    };

}


// ============================================================
// QUALIFICATION
// ============================================================

function qualifiesForV119(
    candidate
) {

    return (

        candidate.robust === true &&

        candidate.averageTestEV >=
            MIN_EXPECTED_VALUE_R &&

        candidate.averageTestPF >=
            MIN_PROFIT_FACTOR &&

        candidate.positiveFolds >=
            MIN_STABLE_FOLDS &&

        candidate.stableFolds >=
            MIN_STABLE_FOLDS &&

        candidate.testSamples >=
            MIN_TEST_TRADES &&

        candidate.actualExecutionRiskReward >=
            MIN_RISK_REWARD &&

        candidate.tradeQualityScore >=
            MIN_TRADE_SCORE

    );

}


// ============================================================
// FETCH LEARNING DATASET
// ============================================================

async function fetchLearningDataset(
    req,
    days
) {

    const protocol =
        req.headers[
            "x-forwarded-proto"
        ] ||
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


    if (
        !response.ok
    ) {

        throw new Error(
            `Learning dataset request failed: ${response.status}`
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
            "Learning dataset did not return rows"
        );

    }


    return data;

}


// ============================================================
// RECOMMENDATION
// ============================================================

function buildRecommendation(
    analysis,
    rows
) {

    const qualified =
        analysis.candidates
            .filter(
                qualifiesForV119
            )
            .map(
                candidate => ({

                    ...candidate,

                    executionBacktest:
                        executionBacktest(
                            rows,
                            candidate
                        ),

                    riskPlan: {

                        riskPerTradeR:
                            1,

                        stopR:
                            1,

                        minimumTargetR:
                            2,

                        preferredTargetR:
                            2.5,

                        actualExecutionRiskReward:
                            2,

                        observedMFERiskReward:
                            candidate.observedRiskReward,

                        riskRewardSource:
                            "ACTUAL_V11_1_EXECUTION_MODEL",

                        riskRewardQualified:
                            true,

                        stopRule:
                            "Stop is fixed at 1R. Never widen the initial stop.",

                        profitRule:
                            "Base target is 2R. Prefer 2.5R only when market structure supports it."

                    }

                })
            );


    qualified.sort(
        (
            a,
            b
        ) =>
            b.tradeQualityScore -
            a.tradeQualityScore
    );


    const buy =
        qualified.filter(
            candidate =>
                candidate.side ===
                "BUY"
        );


    const sell =
        qualified.filter(
            candidate =>
                candidate.side ===
                "SELL"
        );


    if (
        !qualified.length
    ) {

        return {

            status:
                "NO_V119_EXECUTION_EDGE",

            candidateCount:
                analysis.candidateCount,

            robustCandidates:
                analysis.robustCandidates,

            riskQualifiedCandidates:
                0,

            riskQualifiedBUY:
                0,

            riskQualifiedSELL:
                0,

            paperAction:
                "NO_TRADE",

            message:
                "No pattern passed the V11.9 real execution backtest. PAPER NO-TRADE."

        };

    }


    return {

        status:
            "V119_EXECUTION_EDGE_FOUND",

        candidateCount:
            analysis.candidateCount,

        robustCandidates:
            analysis.robustCandidates,

        riskQualifiedCandidates:
            qualified.length,

        riskQualifiedBUY:
            buy.length,

        riskQualifiedSELL:
            sell.length,

        bestExpectedValueR:
            round(
                Math.max(
                    ...qualified.map(
                        candidate =>
                            candidate.averageTestEV
                    )
                ),
                3
            ),

        bestProfitFactor:
            round(
                Math.max(
                    ...qualified.map(
                        candidate =>
                            candidate.averageTestPF
                    )
                ),
                3
            ),

        bestTradeQualityScore:
            round(
                Math.max(
                    ...qualified.map(
                        candidate =>
                            candidate.tradeQualityScore
                    )
                ),
                2
            ),

        actualExecutionModel:
            "1R STOP / 2R TARGET",

        paperAction:
            "WAIT_FOR_LIVE_PATTERN_MATCH",

        message:
            "V11.9 found patterns with positive walk-forward expected value and an actual historical 1R stop / 2R target execution model.",

        topBUY:
            buy.slice(
                0,
                5
            ),

        topSELL:
            sell.slice(
                0,
                5
            )

    };

}


// ============================================================
// MAIN HANDLER
// ============================================================

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
                        req.query?.days ||
                        30
                    )
                )
            );


        /*
        --------------------------------------------------------
        FETCH HISTORICAL DATA
        --------------------------------------------------------
        */

        const dataset =
            await fetchLearningDataset(
                req,
                requestedDays
            );


        const rows =
            dataset.rows
                .slice()
                .sort(
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


        if (
            rows.length <
            300
        ) {

            return res
                .status(400)
                .json({

                    success:
                        false,

                    version:
                        VERSION,

                    status:
                        "INSUFFICIENT_DATA",

                    error:
                        "Not enough historical rows for walk-forward execution testing.",

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
        --------------------------------------------------------
        WALK FORWARD
        --------------------------------------------------------
        */

        const analysis =
            walkForwardAnalysis(
                rows
            );


        /*
        --------------------------------------------------------
        ACTUAL EXECUTION RECOMMENDATION
        --------------------------------------------------------
        */

        const recommendation =
            buildRecommendation(
                analysis,
                rows
            );


        /*
        --------------------------------------------------------
        QUALIFIED CANDIDATES
        --------------------------------------------------------
        */

        const qualifiedCandidates =
            analysis.candidates
                .filter(
                    qualifiesForV119
                )
                .map(
                    candidate => ({

                        ...candidate,

                        executionBacktest:
                            executionBacktest(
                                rows,
                                candidate
                            ),

                        riskPlan: {

                            riskPerTradeR:
                                1,

                            minimumRewardR:
                                2,

                            preferredRewardR:
                                2.5,

                            actualExecutionRiskReward:
                                2,

                            observedRiskReward:
                                candidate.observedRiskReward,

                            riskRewardSource:
                                "ACTUAL_V11_1_EXECUTION_MODEL",

                            riskRewardQualified:
                                true

                        }

                    })
                );


        /*
        --------------------------------------------------------
        FINAL RESPONSE
        --------------------------------------------------------
        */

        return res
            .status(200)
            .json({

                success:
                    true,

                version:
                    VERSION,

                status:
                    "COMPLETED",

                mode:
                    "REAL_EXECUTION_RISK_REWARD_BACKTEST",

                paperOnly:
                    true,

                realOrders:
                    false,

                instrument:
                    "NIFTY 50",

                interval:
                    "5minute",

                requestedDays,

                /*
                ------------------------------------------------
                OBJECTIVE
                ------------------------------------------------
                */

                objective: {

                    primary:
                        "ACTUAL_EXECUTION_EXPECTANCY",

                    secondary:
                        "MINIMIZE_DRAWDOWN",

                    tertiary:
                        "MAXIMIZE_ASYMMETRIC_WINNING_TRADES",

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

                    minimumRiskReward:
                        MIN_RISK_REWARD,

                    preferredRiskReward:
                        PREFERRED_RISK_REWARD,

                    minimumTradeQualityScore:
                        MIN_TRADE_SCORE

                },


                /*
                ------------------------------------------------
                SOURCE
                ------------------------------------------------
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
                ------------------------------------------------
                WALK FORWARD
                ------------------------------------------------
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
                ------------------------------------------------
                LEARNING
                ------------------------------------------------
                */

                learning: {

                    minimumPatternSamples:
                        MIN_PATTERN_SAMPLES,

                    minimumDecisiveSamples:
                        MIN_DECISIVE_SAMPLES,

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
                ------------------------------------------------
                CANDIDATES
                ------------------------------------------------
                */

                candidates:
                    analysis.candidates
                        .slice(
                            0,
                            50
                        ),


                /*
                ------------------------------------------------
                V11.9 EXECUTION RESULTS
                ------------------------------------------------
                */

                executionBacktest: {

                    model:
                        "1R STOP / 2R TARGET",

                    stopR:
                        1,

                    targetR:
                        2,

                    preferredTargetR:
                        2.5,

                    note:
                        "Historical execution outcomes are taken from the V11.1 dataset. A WIN is +2R and a LOSS is -1R.",

                    qualifiedCandidateCount:
                        qualifiedCandidates.length,

                    qualifiedCandidates:
                        qualifiedCandidates
                            .slice(
                                0,
                                10
                            )

                },


                /*
                ------------------------------------------------
                FINAL RECOMMENDATION
                ------------------------------------------------
                */

                recommendation

            });


    }

    catch (
        error
    ) {

        return res
            .status(500)
            .json({

                success:
                    false,

                version:
                    VERSION,

                status:
                    "ERROR",

                error:
                    error?.message ||
                    String(error),

                paperOnly:
                    true,

                realOrders:
                    false

            });

    }

}
