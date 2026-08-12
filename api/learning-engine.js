/*
===========================================================
 TradeMind Pro
 V22.7 — EV PERSISTENCE FAILURE ANATOMY
 ----------------------------------------------------------
 Instrument : NIFTY 50
 Interval   : 5 minute
 Data       : INDstocks Historical API

 MODE:
 PAPER ONLY
 NO REAL ORDERS

 PURPOSE
 ----------------------------------------------------------
 V22.6 showed that positive prior EV has forward persistence,
 but EV momentum alone does NOT explain the failures.

 V22.7 is DIAGNOSTIC ONLY.

 It investigates whether apparently strong prior EV activations
 fail because the PRIOR WINDOW itself is already deteriorating.

 FIXED, PRE-DECLARED FEATURES:
   1. prior EV
   2. prior EV momentum versus preceding window
   3. prior-window internal EV slope
   4. prior-window late-half EV
   5. late-half versus early-half EV change
   6. prior profit factor
   7. prior win rate
   8. prior decisive sample size
   9. prior timeout rate
  10. recent loss streak inside prior window

 The next chronological window is used ONLY as outcome.

 V22.7 DOES NOT:
   - create candidates
   - change candidate discovery
   - change qualification
   - change validation
   - change OOS
   - change exits
   - change risk
   - change live signals
   - promote a filter into trading

 IMPORTANT
 ----------------------------------------------------------
 No threshold is selected from the forward outcome.
 All diagnostic buckets are fixed before outcome aggregation.

 The purpose is to identify whether a future strategy rule
 should eventually be based on "edge health" rather than
 simply "positive EV".
===========================================================
*/

function buildV227EVPersistenceFailureAnatomy(
    candles,
    records,
    foldDefinitions
) {

    const safe =
        safeArray(records)
            .filter(
                x =>
                    x &&
                    x.side === "SELL" &&
                    Number.isFinite(x.index) &&
                    Number.isFinite(x.resultR)
            )
            .sort(
                (a, b) =>
                    a.index - b.index
            );

    const MIN_WINDOW_SAMPLES = 4;
    const MIN_FORWARD_SAMPLES = 1;

    /*
    ---------------------------------------------------------
    FIXED DIAGNOSTIC BUCKETS
    These are declared before forward outcomes are inspected.
    ---------------------------------------------------------
    */

    const EV_BUCKETS = [
        {
            key: "EV_0_TO_0_10",
            test: x =>
                x.priorEV > 0 &&
                x.priorEV < 0.10
        },
        {
            key: "EV_0_10_TO_0_25",
            test: x =>
                x.priorEV >= 0.10 &&
                x.priorEV < 0.25
        },
        {
            key: "EV_0_25_TO_0_50",
            test: x =>
                x.priorEV >= 0.25 &&
                x.priorEV < 0.50
        },
        {
            key: "EV_GE_0_50",
            test: x =>
                x.priorEV >= 0.50
        }
    ];

    const MOMENTUM_BUCKETS = [
        {
            key: "MOM_NEGATIVE",
            test: x =>
                x.evMomentum < 0
        },
        {
            key: "MOM_0_TO_0_10",
            test: x =>
                x.evMomentum >= 0 &&
                x.evMomentum < 0.10
        },
        {
            key: "MOM_GE_0_10",
            test: x =>
                x.evMomentum >= 0.10
        }
    ];

    const INTERNAL_SLOPE_BUCKETS = [
        {
            key: "INTERNAL_DECAY",
            test: x =>
                x.internalEVChange < -0.10
        },
        {
            key: "INTERNAL_FLAT",
            test: x =>
                x.internalEVChange >= -0.10 &&
                x.internalEVChange <= 0.10
        },
        {
            key: "INTERNAL_IMPROVING",
            test: x =>
                x.internalEVChange > 0.10
        }
    ];

    const LATE_EV_BUCKETS = [
        {
            key: "LATE_EV_NEGATIVE",
            test: x =>
                x.lateEV < 0
        },
        {
            key: "LATE_EV_0_TO_0_10",
            test: x =>
                x.lateEV >= 0 &&
                x.lateEV < 0.10
        },
        {
            key: "LATE_EV_GE_0_10",
            test: x =>
                x.lateEV >= 0.10
        }
    ];

    const PF_BUCKETS = [
        {
            key: "PF_LT_1",
            test: x =>
                x.priorPF < 1
        },
        {
            key: "PF_1_TO_1_20",
            test: x =>
                x.priorPF >= 1 &&
                x.priorPF < 1.20
        },
        {
            key: "PF_1_20_TO_1_50",
            test: x =>
                x.priorPF >= 1.20 &&
                x.priorPF < 1.50
        },
        {
            key: "PF_GE_1_50",
            test: x =>
                x.priorPF >= 1.50
        }
    ];

    const WR_BUCKETS = [
        {
            key: "WR_LT_40",
            test: x =>
                x.priorWinRate < 40
        },
        {
            key: "WR_40_TO_50",
            test: x =>
                x.priorWinRate >= 40 &&
                x.priorWinRate < 50
        },
        {
            key: "WR_50_TO_60",
            test: x =>
                x.priorWinRate >= 50 &&
                x.priorWinRate < 60
        },
        {
            key: "WR_GE_60",
            test: x =>
                x.priorWinRate >= 60
        }
    ];

    const TIMEOUT_BUCKETS = [
        {
            key: "TIMEOUT_LT_10",
            test: x =>
                x.timeoutRate < 10
        },
        {
            key: "TIMEOUT_10_TO_20",
            test: x =>
                x.timeoutRate >= 10 &&
                x.timeoutRate < 20
        },
        {
            key: "TIMEOUT_GE_20",
            test: x =>
                x.timeoutRate >= 20
        }
    ];

    const LOSS_STREAK_BUCKETS = [
        {
            key: "RECENT_LOSS_STREAK_0_TO_1",
            test: x =>
                x.recentLossStreak <= 1
        },
        {
            key: "RECENT_LOSS_STREAK_2",
            test: x =>
                x.recentLossStreak === 2
        },
        {
            key: "RECENT_LOSS_STREAK_3_PLUS",
            test: x =>
                x.recentLossStreak >= 3
        }
    ];

    /*
    ---------------------------------------------------------
    METRICS
    ---------------------------------------------------------
    */

    function metrics(rows) {

        if (!rows.length) {
            return {
                trades: 0,
                decisiveTrades: 0,
                wins: 0,
                losses: 0,
                timeouts: 0,
                netR: 0,
                EV: 0,
                PF: 0,
                winRate: 0
            };
        }

        const m =
            calculateMetrics(rows);

        return {
            trades:
                m.trades ??
                rows.length,

            decisiveTrades:
                m.decisiveTrades ??
                0,

            wins:
                m.wins ??
                0,

            losses:
                m.losses ??
                0,

            timeouts:
                m.timeouts ??
                0,

            netR:
                round(
                    m.netR ?? 0,
                    4
                ),

            EV:
                round(
                    m.expectedValueR ?? 0,
                    4
                ),

            PF:
                round(
                    m.profitFactor ?? 0,
                    4
                ),

            winRate:
                round(
                    m.winRate ?? 0,
                    2
                )
        };
    }

    function contextKey(record) {

        return [
            record.setup ??
                "UNKNOWN",

            record.trend ??
                "UNKNOWN",

            record.regime ??
                "UNKNOWN",

            record.volatility ??
                "UNKNOWN"
        ].join("|");
    }

    function rowsBefore(
        source,
        endExclusive
    ) {
        return source.filter(
            x =>
                x.index <
                endExclusive
        );
    }

    function splitHalf(rows) {

        if (
            rows.length <
            MIN_WINDOW_SAMPLES
        ) {
            return {
                early: [],
                late: []
            };
        }

        const midpoint =
            Math.floor(
                rows.length / 2
            );

        return {
            early:
                rows.slice(
                    0,
                    midpoint
                ),

            late:
                rows.slice(
                    midpoint
                )
        };
    }

    function maxRecentLossStreak(rows) {

        let current = 0;
        let max = 0;

        for (const row of rows) {

            const r =
                Number(row.resultR);

            if (r < 0) {
                current++;
                max =
                    Math.max(
                        max,
                        current
                    );
            } else {
                current = 0;
            }
        }

        return max;
    }

    /*
    ---------------------------------------------------------
    BUILD CHRONOLOGICAL ACTIVATIONS
    ---------------------------------------------------------
    Same expanding-fold boundaries as V22.6.

    For every fold:
      earlier half = comparison window
      later half   = prior window
      next fold    = forward outcome

    No future outcome enters activation features.
    ---------------------------------------------------------
    */

    const transitions = [];

    for (const fold of safeArray(foldDefinitions)) {

        const trainingRows =
            safe.filter(
                x =>
                    x.index <
                    fold.testStart
            );

        if (
            trainingRows.length <
            MIN_WINDOW_SAMPLES * 2
        ) {
            continue;
        }

        const midpoint =
            Math.floor(
                trainingRows.length / 2
            );

        const previousRows =
            trainingRows.slice(
                0,
                midpoint
            );

        const priorRows =
            trainingRows.slice(
                midpoint
            );

        const previousByContext =
            new Map();

        const priorByContext =
            new Map();

        for (const row of previousRows) {

            const key =
                contextKey(row);

            if (
                !previousByContext.has(key)
            ) {
                previousByContext.set(
                    key,
                    []
                );
            }

            previousByContext
                .get(key)
                .push(row);
        }

        for (const row of priorRows) {

            const key =
                contextKey(row);

            if (
                !priorByContext.has(key)
            ) {
                priorByContext.set(
                    key,
                    []
                );
            }

            priorByContext
                .get(key)
                .push(row);
        }

        const forwardRows =
            safe.filter(
                x =>
                    x.index >=
                        fold.testStart &&
                    x.index <
                        fold.testEnd
            );

        const forwardByContext =
            new Map();

        for (const row of forwardRows) {

            const key =
                contextKey(row);

            if (
                !forwardByContext.has(key)
            ) {
                forwardByContext.set(
                    key,
                    []
                );
            }

            forwardByContext
                .get(key)
                .push(row);
        }

        for (
            const [
                key,
                prior
            ] of priorByContext.entries()
        ) {

            if (
                prior.length <
                MIN_WINDOW_SAMPLES
            ) {
                continue;
            }

            const previous =
                previousByContext.get(
                    key
                ) || [];

            if (
                previous.length <
                MIN_WINDOW_SAMPLES
            ) {
                continue;
            }

            const next =
                forwardByContext.get(
                    key
                ) || [];

            if (
                next.length <
                MIN_FORWARD_SAMPLES
            ) {
                continue;
            }

            const previousMetrics =
                metrics(
                    previous
                );

            const priorMetrics =
                metrics(
                    prior
                );

            /*
            Activation is eligible only when the prior
            completed window has positive EV.
            */

            if (
                !(
                    priorMetrics.EV >
                    0
                )
            ) {
                continue;
            }

            const split =
                splitHalf(
                    prior
                );

            const earlyMetrics =
                metrics(
                    split.early
                );

            const lateMetrics =
                metrics(
                    split.late
                );

            const internalEVChange =
                (
                    Number.isFinite(
                        earlyMetrics.EV
                    ) &&
                    Number.isFinite(
                        lateMetrics.EV
                    )
                )
                    ? lateMetrics.EV -
                      earlyMetrics.EV
                    : 0;

            const timeoutRate =
                priorMetrics.trades
                    ? (
                        priorMetrics.timeouts /
                        priorMetrics.trades *
                        100
                    )
                    : 0;

            const recentLossStreak =
                maxRecentLossStreak(
                    prior
                );

            const evMomentum =
                priorMetrics.EV -
                previousMetrics.EV;

            const activationWorked =
                next.length > 0
                    ? metrics(next).EV > 0
                    : null;

            transitions.push({

                fold:
                    fold.fold,

                contextKey:
                    key,

                setup:
                    prior[0]?.setup ??
                    "UNKNOWN",

                trend:
                    prior[0]?.trend ??
                    "UNKNOWN",

                regime:
                    prior[0]?.regime ??
                    "UNKNOWN",

                volatility:
                    prior[0]?.volatility ??
                    "UNKNOWN",

                fromWindow:
                    "PREVIOUS",

                toWindow:
                    "PRIOR",

                previous:
                    previousMetrics,

                prior:
                    priorMetrics,

                priorEVMomentum:
                    round(
                        evMomentum,
                        4
                    ),

                internalEarly:
                    earlyMetrics,

                internalLate:
                    lateMetrics,

                internalEVChange:
                    round(
                        internalEVChange,
                        4
                    ),

                lateEV:
                    lateMetrics.EV,

                timeoutRate:
                    round(
                        timeoutRate,
                        2
                    ),

                recentLossStreak,

                next:
                    metrics(next),

                forwardSamples:
                    next.length,

                activationWorked,

                activationFailure:
                    activationWorked ===
                    false
            });
        }
    }

    /*
    ---------------------------------------------------------
    BUCKET AGGREGATION
    ---------------------------------------------------------
    */

    function aggregateBuckets(
        rows,
        buckets
    ) {

        return buckets.map(
            bucket => {

                const matched =
                    rows.filter(
                        bucket.test
                    );

                const successful =
                    matched.filter(
                        x =>
                            x.activationWorked
                    );

                const failed =
                    matched.filter(
                        x =>
                            x.activationFailure
                    );

                const forwardRows =
                    matched.flatMap(
                        x =>
                            x.nextRows ||
                            []
                    );

                const forwardMetrics =
                    forwardRows.length
                        ? metrics(
                            forwardRows
                        )
                        : {
                            trades: matched.reduce(
                                (a, x) =>
                                    a +
                                    x.next.trades,
                                0
                            ),
                            decisiveTrades:
                                matched.reduce(
                                    (a, x) =>
                                        a +
                                        x.next.decisiveTrades,
                                    0
                                ),
                            wins:
                                matched.reduce(
                                    (a, x) =>
                                        a +
                                        x.next.wins,
                                    0
                                ),
                            losses:
                                matched.reduce(
                                    (a, x) =>
                                        a +
                                        x.next.losses,
                                    0
                                ),
                            timeouts:
                                matched.reduce(
                                    (a, x) =>
                                        a +
                                        x.next.timeouts,
                                    0
                                ),
                            netR:
                                round(
                                    matched.reduce(
                                        (a, x) =>
                                            a +
                                            x.next.netR,
                                        0
                                    ),
                                    4
                                ),
                            EV:
                                matched.length
                                    ? round(
                                        matched.reduce(
                                            (a, x) =>
                                                a +
                                                x.next.EV,
                                            0
                                        ) /
                                        matched.length,
                                        4
                                    )
                                    : 0,
                            PF: 0,
                            winRate: 0
                        };

                return {

                    bucket:
                        bucket.key,

                    activations:
                        matched.length,

                    successfulForwardContexts:
                        successful.length,

                    failedForwardContexts:
                        failed.length,

                    forwardContextSuccessRatePct:
                        matched.length
                            ? round(
                                successful.length /
                                matched.length *
                                100,
                                2
                            )
                            : 0,

                    forwardNetR:
                        forwardMetrics.netR,

                    forwardEV:
                        forwardMetrics.EV,

                    forwardPF:
                        forwardMetrics.PF,

                    forwardDecisiveTrades:
                        forwardMetrics.decisiveTrades
                };
            }
        );
    }

    /*
    ---------------------------------------------------------
    FIXED COMBINATIONS
    ---------------------------------------------------------
    These combinations are NOT selected as trading rules.
    They simply expose failure anatomy.

    A particularly important diagnostic is:

      HIGH_EV_FALSE_STRENGTH
        prior EV >= 0.25
        AND internal EV is decaying
        AND late-half EV <= 0

    This is deliberately fixed before outcomes.
    ---------------------------------------------------------
    */

    const COMBINED_DIAGNOSTIC_TIERS = [

        {
            key:
                "HEALTHY_PERSISTENCE",

            label:
                "Positive EV + internal EV improving + late-half EV positive",

            test: x =>
                x.priorEV > 0 &&
                x.internalEVChange > 0.10 &&
                x.lateEV > 0
        },

        {
            key:
                "INTERNAL_DECAY",

            label:
                "Positive EV + internal EV decay",

            test: x =>
                x.priorEV > 0 &&
                x.internalEVChange < -0.10
        },

        {
            key:
                "LATE_HALF_NEGATIVE",

            label:
                "Positive full-window EV + negative late-half EV",

            test: x =>
                x.priorEV > 0 &&
                x.lateEV < 0
        },

        {
            key:
                "HIGH_EV_FALSE_STRENGTH",

            label:
                "High prior EV >= +0.25R but internal decay and late-half EV <= 0",

            test: x =>
                x.priorEV >= 0.25 &&
                x.internalEVChange < -0.10 &&
                x.lateEV <= 0
        },

        {
            key:
                "HIGH_EV_HEALTHY",

            label:
                "High prior EV >= +0.25R with no internal decay",

            test: x =>
                x.priorEV >= 0.25 &&
                x.internalEVChange >= -0.10
        },

        {
            key:
                "HIGH_MOMENTUM_BUT_LATE_DECAY",

            label:
                "EV momentum >= +0.10R but late-half EV <= 0",

            test: x =>
                x.evMomentum >= 0.10 &&
                x.lateEV <= 0
        }
    ];

    /*
    ---------------------------------------------------------
    OVERALL
    ---------------------------------------------------------
    */

    const successful =
        transitions.filter(
            x =>
                x.activationWorked
        );

    const failed =
        transitions.filter(
            x =>
                x.activationFailure
        );

    const overallForward =
        transitions.reduce(
            (sum, x) =>
                sum +
                x.next.EV,
            0
        );

    const overallForwardEV =
        transitions.length
            ? round(
                overallForward /
                transitions.length,
                4
            )
            : 0;

    const result = {

        version:
            "V22.7",

        purpose:
            "Diagnose why positive prior-EV activations fail despite apparently strong prior evidence, with special focus on internal deterioration inside the completed prior window.",

        hypothesis:
            "A context can have positive or improving aggregate EV while its most recent internal evidence is already deteriorating; internal edge health may therefore explain failures that EV momentum alone cannot.",

        antiLeakage: {

            chronological:
                true,

            expandingTraining:
                true,

            priorWindowOnly:
                true,

            nextWindowUsedOnlyAsOutcome:
                true,

            futureOutcomeUsedForActivation:
                false,

            strategyPipelineModified:
                false,

            thresholdsSelectedFromOutcome:
                false
        },

        design: {

            foldCount:
                safeArray(
                    foldDefinitions
                ).length,

            priorEligibility:
                "Completed prior context window must have EV > 0 and at least 4 samples.",

            forwardOutcome:
                "Immediately following chronological fold/test segment.",

            internalWindowMethod:
                "The completed prior context window is split chronologically into equal early and late halves.",

            fixedFeatures: [
                "priorEV",
                "EV momentum versus preceding window",
                "internal EV change: late-half EV minus early-half EV",
                "late-half EV",
                "prior profit factor",
                "prior win rate",
                "prior decisive sample size",
                "prior timeout rate",
                "recent loss streak"
            ],

            fixedCombinedDiagnostics: [
                "HEALTHY_PERSISTENCE",
                "INTERNAL_DECAY",
                "LATE_HALF_NEGATIVE",
                "HIGH_EV_FALSE_STRENGTH",
                "HIGH_EV_HEALTHY",
                "HIGH_MOMENTUM_BUT_LATE_DECAY"
            ]
        },

        sample: {

            eligibleActivations:
                transitions.length,

            successfulForwardContexts:
                successful.length,

            failedForwardContexts:
                failed.length,

            forwardContextSuccessRatePct:
                transitions.length
                    ? round(
                        successful.length /
                        transitions.length *
                        100,
                        2
                    )
                    : 0,

            forwardEV:
                overallForwardEV,

            forwardNetR:
                round(
                    transitions.reduce(
                        (sum, x) =>
                            sum +
                            x.next.netR,
                        0
                    ),
                    4
                )
        },

        featureStudies: {

            priorEV:
                aggregateBuckets(
                    transitions,
                    EV_BUCKETS
                ),

            evMomentum:
                aggregateBuckets(
                    transitions,
                    MOMENTUM_BUCKETS
                ),

            internalEVChange:
                aggregateBuckets(
                    transitions,
                    INTERNAL_SLOPE_BUCKETS
                ),

            lateHalfEV:
                aggregateBuckets(
                    transitions,
                    LATE_EV_BUCKETS
                ),

            priorProfitFactor:
                aggregateBuckets(
                    transitions,
                    PF_BUCKETS
                ),

            priorWinRate:
                aggregateBuckets(
                    transitions,
                    WR_BUCKETS
                ),

            timeoutRate:
                aggregateBuckets(
                    transitions,
                    TIMEOUT_BUCKETS
                ),

            recentLossStreak:
                aggregateBuckets(
                    transitions,
                    LOSS_STREAK_BUCKETS
                )
        },

        combinedDiagnostics:
            COMBINED_DIAGNOSTIC_TIERS.map(
                tier => {

                    const rows =
                        transitions.filter(
                            tier.test
                        );

                    const success =
                        rows.filter(
                            x =>
                                x.activationWorked
                        ).length;

                    const failure =
                        rows.filter(
                            x =>
                                x.activationFailure
                        ).length;

                    return {

                        key:
                            tier.key,

                        label:
                            tier.label,

                        activations:
                            rows.length,

                        successfulForwardContexts:
                            success,

                        failedForwardContexts:
                            failure,

                        forwardContextSuccessRatePct:
                            rows.length
                                ? round(
                                    success /
                                    rows.length *
                                    100,
                                    2
                                )
                                : 0,

                        forwardEV:
                            rows.length
                                ? round(
                                    rows.reduce(
                                        (sum, x) =>
                                            sum +
                                            x.next.EV,
                                        0
                                    ) /
                                    rows.length,
                                    4
                                )
                                : 0,

                        forwardNetR:
                            round(
                                rows.reduce(
                                    (sum, x) =>
                                        sum +
                                        x.next.netR,
                                    0
                                ),
                                4
                            ),

                        diagnosticOnly:
                            true
                    };
                }
            ),

        failureCases:
            failed
                .map(
                    x => ({
                        fold:
                            x.fold,

                        contextKey:
                            x.contextKey,

                        setup:
                            x.setup,

                        trend:
                            x.trend,

                        regime:
                            x.regime,

                        volatility:
                            x.volatility,

                        previous:
                            x.previous,

                        prior:
                            x.prior,

                        priorEVMomentum:
                            x.priorEVMomentum,

                        internalEarly:
                            x.internalEarly,

                        internalLate:
                            x.internalLate,

                        internalEVChange:
                            x.internalEVChange,

                        lateEV:
                            x.lateEV,

                        timeoutRate:
                            x.timeoutRate,

                        recentLossStreak:
                            x.recentLossStreak,

                        next:
                            x.next,

                        diagnosticFlags: {

                            internalDecay:
                                x.internalEVChange < -0.10,

                            lateHalfNegative:
                                x.lateEV < 0,

                            highEVFalseStrength:
                                x.prior.EV >= 0.25 &&
                                x.internalEVChange < -0.10 &&
                                x.lateEV <= 0,

                            highMomentumLateDecay:
                                x.priorEVMomentum >= 0.10 &&
                                x.lateEV <= 0
                        }
                    })
                ),

        transitionDetail:
            transitions.map(
                x => ({
                    fold:
                        x.fold,

                    contextKey:
                        x.contextKey,

                    setup:
                        x.setup,

                    trend:
                        x.trend,

                    regime:
                        x.regime,

                    volatility:
                        x.volatility,

                    previous:
                        x.previous,

                    prior:
                        x.prior,

                    priorEVMomentum:
                        x.priorEVMomentum,

                    internalEarly:
                        x.internalEarly,

                    internalLate:
                        x.internalLate,

                    internalEVChange:
                        x.internalEVChange,

                    lateEV:
                        x.lateEV,

                    timeoutRate:
                        x.timeoutRate,

                    recentLossStreak:
                        x.recentLossStreak,

                    next:
                        x.next,

                    activationWorked:
                        x.activationWorked,

                    activationFailure:
                        x.activationFailure
                })
            ),

        interpretationGuard:
            "Diagnostic only. V22.7 cannot create candidates, modify thresholds, change validation/OOS, select exits, alter risk, generate live signals, or use forward outcomes to modify activation features.",

        decisionGuard:
            "No V22.7 diagnostic category is a strategy rule. Any apparently useful failure signature must survive a separate chronological validation experiment before it can influence trading."
    };

    return result;
}


/*
===========================================================
 V22.7 INTEGRATION INTO V22.6
 ----------------------------------------------------------

 1. Keep the entire V22.6 engine unchanged.

 2. Add this function after the V22.6 diagnostic function.

 3. Immediately after the V22.6 audit is built, add:

     const v227EVPersistenceFailureAnatomy =
         buildV227EVPersistenceFailureAnatomy(
             historicalCandles,
             learningRecords,
             folds
         );

 4. In the existing learning diagnostics object add:

     v227EVPersistenceFailureAnatomy:
         v227EVPersistenceFailureAnatomy

 5. Change only the top-level VERSION string from V22.6
    to V22.7 and the diagnostic mode/purpose labels if
    your existing response exposes them.

 DO NOT:
   - modify candidate discovery
   - modify qualification
   - modify validation
   - modify diversification
   - modify OOS
   - modify exits
   - modify risk
   - modify current-signal generation
   - add any V22.7 filter to trading

 V22.7 is an observation layer only.
===========================================================
*/
