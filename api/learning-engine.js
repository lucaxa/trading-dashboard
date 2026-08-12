/*
===========================================================
 TradeMind Pro
 V23.0 — EDGE HEALTH × CONTEXT INTERACTION AUDIT
 ----------------------------------------------------------
 MODE:
 PAPER ONLY
 NO REAL ORDERS

 PURPOSE
 ----------------------------------------------------------
 V22.9 showed that HEALTHY generally outperformed DECAYING,
 but BROKEN unexpectedly remained positive in the expanded
 rolling sample.

 V23.0 asks:

   DOES EDGE HEALTH BEHAVE DIFFERENTLY DEPENDING ON
   SETUP / TREND / REGIME / VOLATILITY / TIME / VWAP /
   RSI / EV MOMENTUM?

 This is DIAGNOSTIC ONLY.

 V23.0 DOES NOT:
   - change candidate discovery
   - change qualification
   - change validation
   - change diversification
   - change true OOS
   - change exits
   - change risk
   - create a trade filter
   - suppress HEALTHY/DECAYING/BROKEN contexts
   - generate live orders

 IMPORTANT:
 ----------------------------------------------------------
 The V22.8/V22.9 health definitions are frozen.

 HEALTHY:
   prior EV > 0
   AND internal EV change >= -0.10R
   AND late-half EV > 0

 STABLE:
   prior EV > 0
   AND internal EV change >= -0.10R
   AND late-half EV <= 0

 DECAYING:
   prior EV > 0
   AND internal EV change < -0.10R
   AND late-half EV > 0

 BROKEN:
   prior EV > 0
   AND internal EV change < -0.10R
   AND late-half EV <= 0

 V23 adds CONTEXT INTERACTIONS only.
===========================================================
*/

function buildV230EdgeHealthContextInteractionAudit({
    candles,
    records,
    featureResolver
}) {

    const safe = Array.isArray(records)
        ? records
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
            )
        : [];

    const PRIOR_RECORDS = 40;
    const FORWARD_RECORDS = 20;
    const STEP_RECORDS = 10;
    const MIN_CONTEXT_SAMPLES = 4;
    const MIN_FORWARD_SAMPLES = 1;

    /*
    ---------------------------------------------------------
    LOCAL HELPERS
    ---------------------------------------------------------
    */

    function r(value, digits = 4) {
        return Number.isFinite(value)
            ? Number(value.toFixed(digits))
            : null;
    }

    function arr(value) {
        return Array.isArray(value)
            ? value
            : [];
    }

    function metrics(rows) {

        const data = arr(rows);

        if (!data.length) {
            return {
                trades: 0,
                wins: 0,
                losses: 0,
                timeouts: 0,
                decisiveTrades: 0,
                winRate: 0,
                netR: 0,
                EV: 0,
                PF: 0
            };
        }

        const wins =
            data.filter(
                x => Number(x.resultR) > 0
            ).length;

        const losses =
            data.filter(
                x => Number(x.resultR) < 0
            ).length;

        const timeouts =
            data.filter(
                x =>
                    String(
                        x.exitReason ??
                        x.exit ??
                        ""
                    ).toUpperCase()
                    .includes("TIMEOUT")
            ).length;

        const decisive =
            data.filter(
                x =>
                    Number.isFinite(
                        Number(x.resultR)
                    ) &&
                    Number(x.resultR) !== 0
            ).length;

        const netR =
            data.reduce(
                (sum, x) =>
                    sum +
                    Number(x.resultR || 0),
                0
            );

        const grossWin =
            data.reduce(
                (sum, x) =>
                    Number(x.resultR) > 0
                        ? sum +
                          Number(x.resultR)
                        : sum,
                0
            );

        const grossLoss =
            data.reduce(
                (sum, x) =>
                    Number(x.resultR) < 0
                        ? sum +
                          Math.abs(
                              Number(x.resultR)
                          )
                        : sum,
                0
            );

        return {
            trades: data.length,
            wins,
            losses,
            timeouts,
            decisiveTrades: decisive,
            winRate:
                decisive
                    ? r(
                        wins /
                        decisive *
                        100,
                        2
                    )
                    : 0,
            netR:
                r(netR),
            EV:
                r(
                    netR /
                    data.length
                ),
            PF:
                grossLoss > 0
                    ? r(
                        grossWin /
                        grossLoss
                    )
                    : grossWin > 0
                        ? Infinity
                        : 0
        };
    }

    function getFeature(record) {

        if (
            typeof featureResolver ===
            "function"
        ) {
            try {
                const f =
                    featureResolver(
                        candles,
                        record.index
                    );

                if (f) {
                    return f;
                }
            } catch (_) {
                // Diagnostic layer must remain
                // crash-safe.
            }
        }

        return null;
    }

    function contextValue(
        record,
        field,
        fallback = "UNKNOWN"
    ) {

        const f =
            getFeature(record);

        const value =
            f?.[field] ??
            record?.[field];

        return (
            value == null ||
            value === "undefined"
        )
            ? fallback
            : String(value);
    }

    function contextObject(record) {

        const setup =
            record.setup ??
            "UNKNOWN";

        return {

            setup:
                String(setup),

            trend:
                contextValue(
                    record,
                    "trend"
                ),

            regime:
                contextValue(
                    record,
                    "regime"
                ),

            volatility:
                contextValue(
                    record,
                    "volatility"
                ),

            timeBucket:
                contextValue(
                    record,
                    "timeBucket"
                ),

            vwapDirection:
                contextValue(
                    record,
                    "vwapDirection"
                ),

            rsiBucket:
                contextValue(
                    record,
                    "rsiBucket"
                )
        };
    }

    function keyFor(
        context
    ) {

        return [
            context.setup,
            context.trend,
            context.regime,
            context.volatility,
            context.timeBucket,
            context.vwapDirection,
            context.rsiBucket
        ].join("|");
    }

    function grouped(
        rows
    ) {

        const map =
            new Map();

        for (const row of rows) {

            const context =
                contextObject(row);

            const key =
                keyFor(context);

            if (
                !map.has(key)
            ) {
                map.set(
                    key,
                    {
                        key,
                        context,
                        rows: []
                    }
                );
            }

            map.get(key)
                .rows
                .push(row);
        }

        return map;
    }

    function healthState(
        priorEV,
        internalChange,
        lateEV
    ) {

        if (
            !Number.isFinite(
                priorEV
            ) ||
            priorEV <= 0
        ) {
            return null;
        }

        if (
            internalChange >=
                -0.10
        ) {
            return lateEV > 0
                ? "HEALTHY"
                : "STABLE";
        }

        return lateEV > 0
            ? "DECAYING"
            : "BROKEN";
    }

    function fixedStateTest(
        state,
        row
    ) {

        const h =
            healthState(
                row.priorEV,
                row.internalEVChange,
                row.lateEV
            );

        if (
            state ===
            "BASELINE_PRIOR_EV_GT_0"
        ) {
            return row.priorEV > 0;
        }

        return h === state;
    }

    /*
    ---------------------------------------------------------
    BUILD ROLLING CHRONOLOGICAL CHECKPOINTS
    ---------------------------------------------------------
    Each checkpoint uses:
      prior = 40 records
      forward = next 20 records
      step = 10 records

    Forward outcomes never enter health classification.
    ---------------------------------------------------------
    */

    const transitions = [];

    for (
        let start = 0;
        start +
            PRIOR_RECORDS +
            FORWARD_RECORDS <=
            safe.length;
        start += STEP_RECORDS
    ) {

        const priorRows =
            safe.slice(
                start,
                start +
                    PRIOR_RECORDS
            );

        const forwardRows =
            safe.slice(
                start +
                    PRIOR_RECORDS,
                start +
                    PRIOR_RECORDS +
                    FORWARD_RECORDS
            );

        const priorGroups =
            grouped(
                priorRows
            );

        const forwardGroups =
            grouped(
                forwardRows
            );

        for (
            const [
                key,
                group
            ] of priorGroups.entries()
        ) {

            if (
                group.rows.length <
                MIN_CONTEXT_SAMPLES
            ) {
                continue;
            }

            const forwardGroup =
                forwardGroups.get(
                    key
                );

            if (
                !forwardGroup ||
                forwardGroup.rows.length <
                MIN_FORWARD_SAMPLES
            ) {
                continue;
            }

            /*
            Split ONLY the completed prior context
            chronologically.
            */

            const midpoint =
                Math.floor(
                    group.rows.length /
                    2
                );

            if (
                midpoint < 2 ||
                group.rows.length -
                    midpoint <
                    2
            ) {
                continue;
            }

            const early =
                group.rows.slice(
                    0,
                    midpoint
                );

            const late =
                group.rows.slice(
                    midpoint
                );

            const previous =
                safe.slice(
                    Math.max(
                        0,
                        start -
                            PRIOR_RECORDS
                    ),
                    start
                );

            const previousGroupRows =
                previous.filter(
                    x =>
                        keyFor(
                            contextObject(x)
                        ) === key
                );

            const priorMetrics =
                metrics(
                    group.rows
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
                    previousGroupRows
                );

            const internalEVChange =
                lateMetrics.EV -
                earlyMetrics.EV;

            const evMomentum =
                previousGroupRows.length >=
                    MIN_CONTEXT_SAMPLES
                    ? priorMetrics.EV -
                      previousMetrics.EV
                    : null;

            const state =
                healthState(
                    priorMetrics.EV,
                    internalEVChange,
                    lateMetrics.EV
                );

            if (!state) {
                continue;
            }

            const forwardMetrics =
                metrics(
                    forwardGroup.rows
                );

            transitions.push({

                checkpoint:
                    Math.floor(
                        start /
                        STEP_RECORDS
                    ) + 1,

                priorStart:
                    start,

                priorEnd:
                    start +
                    PRIOR_RECORDS,

                forwardStart:
                    start +
                    PRIOR_RECORDS,

                forwardEnd:
                    start +
                    PRIOR_RECORDS +
                    FORWARD_RECORDS,

                contextKey:
                    key,

                context:
                    group.context,

                healthState:
                    state,

                priorEV:
                    priorMetrics.EV,

                priorPF:
                    priorMetrics.PF,

                priorWinRate:
                    priorMetrics.winRate,

                priorSamples:
                    priorMetrics.trades,

                priorDecisive:
                    priorMetrics.decisiveTrades,

                previousEV:
                    previousMetrics.EV,

                evMomentum:
                    evMomentum == null
                        ? null
                        : r(evMomentum),

                internalEarlyEV:
                    earlyMetrics.EV,

                internalLateEV:
                    lateMetrics.EV,

                internalEVChange:
                    r(
                        internalEVChange
                    ),

                lateEV:
                    lateMetrics.EV,

                next:
                    forwardMetrics,

                forwardSuccess:
                    forwardMetrics.EV > 0
            });
        }
    }

    /*
    ---------------------------------------------------------
    AGGREGATORS
    ---------------------------------------------------------
    */

    function summarize(
        rows
    ) {

        const data =
            arr(rows);

        const successful =
            data.filter(
                x =>
                    x.forwardSuccess
            ).length;

        const failed =
            data.filter(
                x =>
                    !x.forwardSuccess
            ).length;

        const forwardTrades =
            data.reduce(
                (sum, x) =>
                    sum +
                    x.next.trades,
                0
            );

        const forwardDecisive =
            data.reduce(
                (sum, x) =>
                    sum +
                    x.next.decisiveTrades,
                0
            );

        const forwardNetR =
            data.reduce(
                (sum, x) =>
                    sum +
                    x.next.netR,
                0
            );

        const avgForwardEV =
            data.length
                ? data.reduce(
                    (sum, x) =>
                        sum +
                        x.next.EV,
                    0
                ) /
                  data.length
                : 0;

        const profitableCheckpoints =
            new Set(
                data
                    .filter(
                        x =>
                            x.next.EV >
                            0
                    )
                    .map(
                        x =>
                            x.checkpoint
                    )
            ).size;

        const losingCheckpoints =
            new Set(
                data
                    .filter(
                        x =>
                            x.next.EV <=
                            0
                    )
                    .map(
                        x =>
                            x.checkpoint
                    )
            ).size;

        return {

            activations:
                data.length,

            successfulForwardContexts:
                successful,

            failedForwardContexts:
                failed,

            forwardContextSuccessRatePct:
                data.length
                    ? r(
                        successful /
                        data.length *
                        100,
                        2
                    )
                    : 0,

            forwardTrades,

            forwardDecisiveTrades:
                forwardDecisive,

            forwardNetR:
                r(
                    forwardNetR
                ),

            forwardEV:
                r(
                    avgForwardEV
                ),

            profitableCheckpoints,

            losingCheckpoints,

            diagnosticOnly:
                true
        };
    }

    /*
    ---------------------------------------------------------
    FIXED INTERACTION DIMENSIONS
    ---------------------------------------------------------
    */

    const dimensions = [
        "setup",
        "trend",
        "regime",
        "volatility",
        "timeBucket",
        "vwapDirection",
        "rsiBucket"
    ];

    const states = [
        "BASELINE_PRIOR_EV_GT_0",
        "HEALTHY",
        "STABLE",
        "DECAYING",
        "BROKEN"
    ];

    function interactionTable(
        state,
        dimension
    ) {

        const map =
            new Map();

        for (
            const row of transitions
        ) {

            if (
                !fixedStateTest(
                    state,
                    row
                )
            ) {
                continue;
            }

            const value =
                row.context[
                    dimension
                ] ??
                "UNKNOWN";

            if (
                !map.has(value)
            ) {
                map.set(
                    value,
                    []
                );
            }

            map.get(value)
                .push(row);
        }

        return Array.from(
            map.entries()
        )
            .map(
                ([value, rows]) => ({
                    state,
                    dimension,
                    value,
                    ...summarize(
                        rows
                    )
                })
            )
            .sort(
                (a, b) =>
                    b.forwardEV -
                    a.forwardEV
            );
    }

    /*
    ---------------------------------------------------------
    HEALTH × EV MOMENTUM
    ---------------------------------------------------------
    Fixed buckets. No outcome-driven threshold selection.
    ---------------------------------------------------------
    */

    function momentumBucket(
        value
    ) {

        if (
            !Number.isFinite(
                value
            )
        ) {
            return "UNAVAILABLE";
        }

        if (value < 0) {
            return "MOM_NEGATIVE";
        }

        if (value < 0.10) {
            return "MOM_0_TO_0_10";
        }

        return "MOM_GE_0_10";
    }

    const momentumRows =
        transitions.map(
            x => ({
                ...x,
                momentumBucket:
                    momentumBucket(
                        x.evMomentum
                    )
            })
        );

    function momentumInteraction(
        state
    ) {

        const rows =
            momentumRows.filter(
                x =>
                    fixedStateTest(
                        state,
                        x
                    )
            );

        const map =
            new Map();

        for (const row of rows) {

            if (
                !map.has(
                    row.momentumBucket
                )
            ) {
                map.set(
                    row.momentumBucket,
                    []
                );
            }

            map.get(
                row.momentumBucket
            ).push(row);
        }

        return Array.from(
            map.entries()
        )
            .map(
                ([value, rows]) => ({
                    state,
                    dimension:
                        "evMomentum",
                    value,
                    ...summarize(
                        rows
                    )
                })
            )
            .sort(
                (a, b) =>
                    b.forwardEV -
                    a.forwardEV
            );
    }

    /*
    ---------------------------------------------------------
    CROSS-INTERACTION SUMMARY
    ---------------------------------------------------------
    Only fixed two-dimensional combinations are evaluated.
    No "best combination" is promoted.
    ---------------------------------------------------------
    */

    const crossDefinitions = [

        {
            key:
                "HEALTH_X_SETUP",
            left:
                "HEALTH",
            right:
                "setup"
        },

        {
            key:
                "HEALTH_X_REGIME",
            left:
                "HEALTH",
            right:
                "regime"
        },

        {
            key:
                "HEALTH_X_TREND",
            left:
                "HEALTH",
            right:
                "trend"
        },

        {
            key:
                "HEALTH_X_VOLATILITY",
            left:
                "HEALTH",
            right:
                "volatility"
        },

        {
            key:
                "HEALTH_X_TIME",
            left:
                "HEALTH",
            right:
                "timeBucket"
        },

        {
            key:
                "HEALTH_X_VWAP",
            left:
                "HEALTH",
            right:
                "vwapDirection"
        },

        {
            key:
                "HEALTH_X_RSI",
            left:
                "HEALTH",
            right:
                "rsiBucket"
        }
    ];

    const interactionMatrices = {};

    for (
        const dimension of dimensions
    ) {

        interactionMatrices[
            dimension
        ] = {};

        for (
            const state of states
        ) {

            interactionMatrices[
                dimension
            ][state] =
                interactionTable(
                    state,
                    dimension
                );
        }
    }

    const momentumInteractions = {};

    for (
        const state of states
    ) {
        momentumInteractions[
            state
        ] =
            momentumInteraction(
                state
            );
    }

    /*
    ---------------------------------------------------------
    CONTEXT INTEGRITY
    ---------------------------------------------------------
    Reconstruct context from featureResolver whenever possible.
    This directly addresses the V22.9 finding that stored
    volatility was missing/undefined.
    ---------------------------------------------------------
    */

    const contextIntegrity = {

        totalSellRecords:
            safe.length,

        reconstructedRecords:
            safe.filter(
                x =>
                    getFeature(x) != null
            ).length,

        missingFeatureRecords:
            safe.filter(
                x =>
                    getFeature(x) == null
            ).length,

        fields: {}
    };

    for (
        const field of [
            "setup",
            "trend",
            "regime",
            "volatility",
            "timeBucket",
            "vwapDirection",
            "rsiBucket"
        ]
    ) {

        contextIntegrity.fields[
            field
        ] = {

            unknown:
                safe.filter(
                    x =>
                        contextValue(
                            x,
                            field
                        ) ===
                        "UNKNOWN"
                ).length,

            known:
                safe.filter(
                    x =>
                        contextValue(
                            x,
                            field
                        ) !==
                        "UNKNOWN"
                ).length
        };
    }

    /*
    ---------------------------------------------------------
    SAMPLE ADEQUACY
    ---------------------------------------------------------
    Rolling observations overlap. They are deliberately
    NOT treated as independent confirmations.
    ---------------------------------------------------------
    */

    const stateResults =
        states.map(
            state => {

                const rows =
                    transitions.filter(
                        x =>
                            fixedStateTest(
                                state,
                                x
                            )
                    );

                return {
                    state,
                    ...summarize(
                        rows
                    )
                };
            }
        );

    const statesWithTenPlus =
        stateResults
            .filter(
                x =>
                    x.activations >=
                    10
            )
            .map(
                x =>
                    x.state
            );

    const result = {

        version:
            "V23.0",

        purpose:
            "Identify whether V22.8/V22.9 edge-health states behave differently across observable market-context dimensions without changing the trading pipeline.",

        hypothesis:
            "The forward behavior of HEALTHY, STABLE, DECAYING and BROKEN may depend on setup, trend, regime, volatility, time, VWAP direction, RSI bucket, and EV momentum.",

        diagnosticOnly:
            true,

        strategyPipelineModified:
            false,

        healthDefinitions: [

            {
                key:
                    "HEALTHY",

                definition:
                    "prior EV > 0 AND internal EV change >= -0.10R AND late-half EV > 0"
            },

            {
                key:
                    "STABLE",

                definition:
                    "prior EV > 0 AND internal EV change >= -0.10R AND late-half EV <= 0"
            },

            {
                key:
                    "DECAYING",

                definition:
                    "prior EV > 0 AND internal EV change < -0.10R AND late-half EV > 0"
            },

            {
                key:
                    "BROKEN",

                definition:
                    "prior EV > 0 AND internal EV change < -0.10R AND late-half EV <= 0"
            }
        ],

        geometry: {

            priorRecords:
                PRIOR_RECORDS,

            forwardRecords:
                FORWARD_RECORDS,

            checkpointStep:
                STEP_RECORDS,

            minimumContextSamples:
                MIN_CONTEXT_SAMPLES,

            minimumForwardSamples:
                MIN_FORWARD_SAMPLES,

            overlappingWindows:
                true,

            independentObservations:
                false
        },

        sample: {

            sellRecords:
                safe.length,

            checkpoints:
                transitions.length
                    ? new Set(
                        transitions.map(
                            x =>
                                x.checkpoint
                        )
                    ).size
                    : 0,

            totalTransitions:
                transitions.length
        },

        contextIntegrity,

        stateResults,

        interactionMatrices,

        momentumInteractions,

        crossInteractionDefinitions:
            crossDefinitions,

        transitionDetail:
            transitions.map(
                x => ({
                    checkpoint:
                        x.checkpoint,

                    contextKey:
                        x.contextKey,

                    context:
                        x.context,

                    healthState:
                        x.healthState,

                    priorEV:
                        x.priorEV,

                    priorPF:
                        x.priorPF,

                    priorWinRate:
                        x.priorWinRate,

                    priorSamples:
                        x.priorSamples,

                    priorDecisive:
                        x.priorDecisive,

                    previousEV:
                        x.previousEV,

                    evMomentum:
                        x.evMomentum,

                    internalEarlyEV:
                        x.internalEarlyEV,

                    internalLateEV:
                        x.internalLateEV,

                    internalEVChange:
                        x.internalEVChange,

                    lateEV:
                        x.lateEV,

                    next:
                        x.next,

                    forwardSuccess:
                        x.forwardSuccess
                })
            ),

        sampleAdequacy: {

            stateObservationCounts:
                Object.fromEntries(
                    stateResults.map(
                        x =>
                            [
                                x.state,
                                x.activations
                            ]
                    )
                ),

            minimumSuggestedObservations:
                10,

            statesMeetingSuggestedMinimum:
                statesWithTenPlus,

            conclusion:
                transitions.length >= 20
                    ? "EXPANDED_BUT_OVERLAPPING"
                    : "INSUFFICIENT_INTERACTION_SAMPLE"
        },

        antiLeakage: {

            chronological:
                true,

            priorWindowOnly:
                true,

            forwardWindowOutcomeOnly:
                true,

            futureOutcomeUsedForContext:
                false,

            futureOutcomeUsedForHealthState:
                false,

            futureOutcomeUsedForInteraction:
                false,

            featureContextReconstructedFromCurrentOrPriorIndex:
                true,

            strategyPipelineModified:
                false
        },

        decisionGuard: {

            noAutomaticFilterPromotion:
                true,

            noThresholdOptimization:
                true,

            noCandidateModification:
                true,

            noValidationModification:
                true,

            noOOSModification:
                true,

            noExitModification:
                true,

            noRiskModification:
                true,

            noLiveTrading:
                true,

            interpretation:
                "An interaction is only a hypothesis generator. It must survive a separately declared chronological validation experiment before it can influence trading."
        },

        interpretationGuard:
            "V23.0 is diagnostic only. Rolling checkpoints intentionally overlap historical observations and therefore cannot be treated as independent confirmations. No interaction cell is a trading rule."
    };

    return result;
}


/*
===========================================================
 V23.0 INTEGRATION
 ----------------------------------------------------------
 This is an AUDIT MODULE, not a replacement engine.

 Add this function to the existing V22.9 learning-engine.js.

 After V22.9 diagnostics are constructed, call:

 const v230EdgeHealthContextInteractionAudit =
     buildV230EdgeHealthContextInteractionAudit({
         candles: historicalCandles,
         records: learningRecords,
         featureResolver: features
     });

 Then expose it inside the existing diagnostics object:

 v230EdgeHealthContextInteractionAudit:
     v230EdgeHealthContextInteractionAudit

 IMPORTANT:
 ----------------------------------------------------------
 Do NOT replace the entire learning-engine.js with this module.
 Do NOT add the V23 states to candidate selection.
 Do NOT modify validation/OOS.
 Do NOT modify exits/risk.
 Do NOT use forward outcomes to classify health.

 V23.0 is an observation layer only.
===========================================================
*/
