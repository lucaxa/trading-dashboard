/*
===========================================================
 TradeMind Pro
 V22.8 — EDGE HEALTH FORWARD VALIDATION MODULE
 ----------------------------------------------------------
 Diagnostic / validation only.
 PAPER ONLY
 NO REAL ORDERS

 PURPOSE
 ----------------------------------------------------------
 V22.7 diagnosed internal deterioration inside apparently
 positive prior-EV windows.

 V22.8 tests that hypothesis chronologically.

 IMPORTANT:
 This module does NOT modify:
   - candidate discovery
   - qualification
   - validation
   - diversification
   - true OOS
   - exits
   - risk
   - live signal generation

 It is a parallel experiment.

 FIXED ARMS
 ----------------------------------------------------------
 BASELINE:
   priorEV > 0

 HEALTHY:
   priorEV > 0
   AND internalEVChange >= -0.10
   AND lateEV > 0

 STABLE:
   priorEV > 0
   AND internalEVChange >= -0.10
   AND lateEV <= 0

 DECAYING:
   priorEV > 0
   AND internalEVChange < -0.10
   AND lateEV > 0

 BROKEN:
   priorEV > 0
   AND internalEVChange < -0.10
   AND lateEV <= 0

 The state thresholds are fixed before forward outcomes are
 aggregated. The next chronological segment is outcome-only.
===========================================================
*/

function buildV228EdgeHealthValidation(
    candles,
    records,
    foldDefinitions
) {

    const safeArrayLocal = value =>
        Array.isArray(value) ? value : [];

    const roundLocal = (value, digits = 4) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        const p = 10 ** digits;
        return Math.round(n * p) / p;
    };

    const safe =
        safeArrayLocal(records)
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

    const folds =
        safeArrayLocal(foldDefinitions)
            .slice()
            .sort(
                (a, b) =>
                    Number(a.testStart ?? a.start ?? 0) -
                    Number(b.testStart ?? b.start ?? 0)
            );

    const MIN_WINDOW_SAMPLES = 4;
    const MIN_FORWARD_SAMPLES = 1;

    /*
    ---------------------------------------------------------
    FIXED ARM DEFINITIONS
    ---------------------------------------------------------
    */

    const ARM_DEFINITIONS = [
        {
            key: "BASELINE_PRIOR_EV_GT_0",
            label: "Prior EV > 0",
            test: x =>
                x.priorEV > 0
        },
        {
            key: "HEALTHY",
            label: "Positive EV + no internal decay + positive late-half EV",
            test: x =>
                x.priorEV > 0 &&
                x.internalEVChange >= -0.10 &&
                x.lateEV > 0
        },
        {
            key: "STABLE",
            label: "Positive EV + no internal decay + non-positive late-half EV",
            test: x =>
                x.priorEV > 0 &&
                x.internalEVChange >= -0.10 &&
                x.lateEV <= 0
        },
        {
            key: "DECAYING",
            label: "Positive EV + internal decay + positive late-half EV",
            test: x =>
                x.priorEV > 0 &&
                x.internalEVChange < -0.10 &&
                x.lateEV > 0
        },
        {
            key: "BROKEN",
            label: "Positive EV + internal decay + non-positive late-half EV",
            test: x =>
                x.priorEV > 0 &&
                x.internalEVChange < -0.10 &&
                x.lateEV <= 0
        }
    ];

    /*
    ---------------------------------------------------------
    METRICS
    ---------------------------------------------------------
    */

    function metrics(rows) {

        const list =
            safeArrayLocal(rows);

        const samples =
            list.length;

        const wins =
            list.filter(
                x => x.resultR > 0
            ).length;

        const losses =
            list.filter(
                x => x.resultR < 0
            ).length;

        const timeouts =
            list.filter(
                x => x.resultR === 0
            ).length;

        const decisive =
            wins + losses;

        const netR =
            list.reduce(
                (sum, x) =>
                    sum +
                    Number(x.resultR || 0),
                0
            );

        const totalWinR =
            list
                .filter(x => x.resultR > 0)
                .reduce(
                    (sum, x) =>
                        sum +
                        Number(x.resultR || 0),
                    0
                );

        const totalLossR =
            Math.abs(
                list
                    .filter(x => x.resultR < 0)
                    .reduce(
                        (sum, x) =>
                            sum +
                            Number(x.resultR || 0),
                        0
                    )
            );

        return {
            samples,
            decisiveTrades: decisive,
            wins,
            losses,
            timeouts,
            winRatePct:
                decisive
                    ? roundLocal(
                        wins /
                        decisive *
                        100,
                        2
                    )
                    : 0,
            EV:
                samples
                    ? roundLocal(
                        netR /
                        samples,
                        4
                    )
                    : 0,
            PF:
                totalLossR > 0
                    ? roundLocal(
                        totalWinR /
                        totalLossR,
                        4
                    )
                    : (
                        totalWinR > 0
                            ? null
                            : 0
                    ),
            netR:
                roundLocal(
                    netR,
                    4
                )
        };
    }

    /*
    ---------------------------------------------------------
    PRIOR CONTEXT CONSTRUCTION
    ---------------------------------------------------------
    */

    function contextForFold(fold) {

        const testStart =
            Number(
                fold?.testStart ??
                fold?.start ??
                fold?.validationStart ??
                0
            );

        const prior =
            safe
                .filter(
                    x =>
                        x.index < testStart
                );

        if (
            prior.length <
            MIN_WINDOW_SAMPLES
        ) {
            return null;
        }

        /*
         * Use the most recent completed chronological context
         * window available before the fold.
         *
         * V22.7's hypothesis is about the internal health of
         * that completed prior window, so we use the same
         * equal-half construction rather than inventing a new
         * adaptive window.
         */

        const windowSize =
            Math.max(
                MIN_WINDOW_SAMPLES,
                Math.floor(
                    prior.length / 4
                )
            );

        const previousStart =
            Math.max(
                0,
                prior.length -
                windowSize * 2
            );

        const priorWindow =
            prior.slice(
                previousStart,
                previousStart +
                windowSize * 2
            );

        if (
            priorWindow.length <
            MIN_WINDOW_SAMPLES
        ) {
            return null;
        }

        const half =
            Math.floor(
                priorWindow.length / 2
            );

        if (half < 2) {
            return null;
        }

        const early =
            priorWindow.slice(
                0,
                half
            );

        const late =
            priorWindow.slice(
                half
            );

        const preceding =
            prior.slice(
                Math.max(
                    0,
                    previousStart -
                    windowSize
                ),
                previousStart
            );

        const priorMetrics =
            metrics(
                priorWindow
            );

        const earlyMetrics =
            metrics(
                early
            );

        const lateMetrics =
            metrics(
                late
            );

        const previousMetrics =
            metrics(
                preceding
            );

        const evMomentum =
            preceding.length >= MIN_WINDOW_SAMPLES
                ? roundLocal(
                    priorMetrics.EV -
                    previousMetrics.EV,
                    4
                )
                : null;

        return {
            priorEV:
                priorMetrics.EV,

            evMomentum,

            internalEarlyEV:
                earlyMetrics.EV,

            internalLateEV:
                lateMetrics.EV,

            internalEVChange:
                roundLocal(
                    lateMetrics.EV -
                    earlyMetrics.EV,
                    4
                ),

            lateEV:
                lateMetrics.EV,

            priorPF:
                priorMetrics.PF,

            priorWinRate:
                priorMetrics.winRatePct,

            priorSamples:
                priorMetrics.samples,

            priorDecisive:
                priorMetrics.decisiveTrades,

            priorTimeoutRate:
                priorMetrics.samples
                    ? roundLocal(
                        priorMetrics.timeouts /
                        priorMetrics.samples *
                        100,
                        2
                    )
                    : 0,

            windowStartIndex:
                priorWindow[0]?.index ?? null,

            windowEndIndex:
                priorWindow[
                    priorWindow.length - 1
                ]?.index ?? null
        };
    }

    /*
    ---------------------------------------------------------
    FORWARD OUTCOME
    ---------------------------------------------------------
    */

    function forwardForFold(fold) {

        const testStart =
            Number(
                fold?.testStart ??
                fold?.start ??
                0
            );

        const testEnd =
            Number(
                fold?.testEnd ??
                fold?.end ??
                Infinity
            );

        const rows =
            safe.filter(
                x =>
                    x.index >= testStart &&
                    x.index < testEnd
            );

        return rows;
    }

    /*
    ---------------------------------------------------------
    TRANSITIONS
    ---------------------------------------------------------
    */

    const transitions = [];

    for (
        const fold of folds
    ) {

        const context =
            contextForFold(
                fold
            );

        if (!context) {
            continue;
        }

        if (
            context.priorEV <= 0
        ) {
            continue;
        }

        const next =
            forwardForFold(
                fold
            );

        if (
            next.length <
            MIN_FORWARD_SAMPLES
        ) {
            continue;
        }

        const outcome =
            metrics(
                next
            );

        let healthState =
            "UNKNOWN";

        if (
            context.internalEVChange >= -0.10 &&
            context.lateEV > 0
        ) {
            healthState =
                "HEALTHY";
        }
        else if (
            context.internalEVChange >= -0.10 &&
            context.lateEV <= 0
        ) {
            healthState =
                "STABLE";
        }
        else if (
            context.internalEVChange < -0.10 &&
            context.lateEV > 0
        ) {
            healthState =
                "DECAYING";
        }
        else if (
            context.internalEVChange < -0.10 &&
            context.lateEV <= 0
        ) {
            healthState =
                "BROKEN";
        }

        transitions.push({
            fold:
                fold.fold ??
                fold.id ??
                null,

            testStart,
            testEnd,

            healthState,

            context,

            next:
                outcome,

            forwardSuccess:
                outcome.EV > 0,

            forwardFailure:
                outcome.EV <= 0
        });
    }

    /*
    ---------------------------------------------------------
    ARM AGGREGATION
    ---------------------------------------------------------
    */

    function aggregateArm(
        key,
        label,
        predicate
    ) {

        const rows =
            transitions.filter(
                x =>
                    predicate(
                        x.context
                    )
            );

        const successful =
            rows.filter(
                x =>
                    x.forwardSuccess
            ).length;

        const forwardEV =
            rows.length
                ? roundLocal(
                    rows.reduce(
                        (sum, x) =>
                            sum +
                            x.next.EV,
                        0
                    ) /
                    rows.length,
                    4
                )
                : 0;

        const forwardNetR =
            roundLocal(
                rows.reduce(
                    (sum, x) =>
                        sum +
                        x.next.netR,
                    0
                ),
                4
            );

        const profitableFoldCount =
            rows.filter(
                x =>
                    x.next.EV > 0
            ).length;

        return {
            key,
            label,

            activations:
                rows.length,

            successfulForwardContexts:
                successful,

            failedForwardContexts:
                rows.length -
                successful,

            forwardContextSuccessRatePct:
                rows.length
                    ? roundLocal(
                        successful /
                        rows.length *
                        100,
                        2
                    )
                    : 0,

            forwardEV,

            forwardNetR,

            profitableFoldCount,

            foldsTested:
                rows.map(
                    x => x.fold
                ),

            diagnosticOnly:
                true
        };
    }

    const arms =
        ARM_DEFINITIONS.map(
            arm =>
                aggregateArm(
                    arm.key,
                    arm.label,
                    arm.test
                )
        );

    const stateArms =
        arms.filter(
            x =>
                x.key !==
                "BASELINE_PRIOR_EV_GT_0"
        );

    const baseline =
        arms.find(
            x =>
                x.key ===
                "BASELINE_PRIOR_EV_GT_0"
        );

    /*
    ---------------------------------------------------------
    RELATIVE TESTS
    ---------------------------------------------------------
    */

    const comparison =
        stateArms.map(
            arm => ({
                state:
                    arm.key,

                activations:
                    arm.activations,

                forwardEV:
                    arm.forwardEV,

                forwardNetR:
                    arm.forwardNetR,

                successRatePct:
                    arm.forwardContextSuccessRatePct,

                EVDeltaVsBaseline:
                    baseline &&
                    arm.activations
                        ? roundLocal(
                            arm.forwardEV -
                            baseline.forwardEV,
                            4
                        )
                        : null,

                netRDeltaVsBaseline:
                    baseline
                        ? roundLocal(
                            arm.forwardNetR -
                            baseline.forwardNetR,
                            4
                        )
                        : null,

                diagnosticOnly:
                    true
            })
        );

    /*
    ---------------------------------------------------------
    FOLD-BY-FOLD VIEW
    ---------------------------------------------------------
    */

    const foldResults =
        transitions.map(
            x => ({
                fold:
                    x.fold,

                healthState:
                    x.healthState,

                priorEV:
                    x.context.priorEV,

                evMomentum:
                    x.context.evMomentum,

                internalEarlyEV:
                    x.context.internalEarlyEV,

                internalLateEV:
                    x.context.internalLateEV,

                internalEVChange:
                    x.context.internalEVChange,

                lateEV:
                    x.context.lateEV,

                nextEV:
                    x.next.EV,

                nextPF:
                    x.next.PF,

                nextWinRate:
                    x.next.winRatePct,

                nextNetR:
                    x.next.netR,

                forwardSuccess:
                    x.forwardSuccess
            })
        );

    const result = {

        version:
            "V22.8",

        purpose:
            "Controlled chronological validation of edge-health states identified by V22.7.",

        hypothesis:
            "A positive prior-EV context whose internal evidence is deteriorating should have weaker forward persistence than a positive prior-EV context whose late-half evidence remains healthy.",

        diagnosticOnly:
            true,

        strategyPipelineModified:
            false,

        arms: {
            definitions:
                ARM_DEFINITIONS.map(
                    x => ({
                        key: x.key,
                        label: x.label
                    })
                ),

            results:
                arms
        },

        comparison,

        sample: {
            sellRecords:
                safe.length,

            foldsAvailable:
                folds.length,

            eligibleForwardTransitions:
                transitions.length
        },

        foldResults,

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

            thresholdsSelectedFromOutcome:
                false,

            strategyPipelineModified:
                false
        },

        decisionRules: {

            promoteHealthy:
                "Only if HEALTHY shows superior forward persistence across independent chronological folds with sufficient sample support.",

            rejectDecayHypothesis:
                "If DECAYING/BROKEN do not consistently underperform HEALTHY/STABLE, do not create an edge-health filter.",

            minimumEvidence:
                "Do not promote any state from aggregate EV alone. Require cross-fold consistency and adequate activation count.",

            noTradingChange:
                true
        },

        interpretationGuard:
            "V22.8 is a controlled validation experiment only. It does not create candidates, change thresholds, alter validation/OOS, select exits, change risk, or generate live signals.",

        decisionGuard:
            "No HEALTHY, STABLE, DECAYING or BROKEN state is a trading rule unless a later separately declared experiment promotes it after independent chronological evidence."
    };

    return result;
}

export {
    buildV228EdgeHealthValidation
};
