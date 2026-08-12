/*
===========================================================
 TradeMind Pro
 V24.3 — CONFIRMATION BLOCK EXECUTION AUDIT
 ----------------------------------------------------------
 PURPOSE:
   Surgical diagnostic repair of V24.2.

 V24.2 problem:
   A complete 40 + 20 block could be silently discarded when
   the prior 40-record EV was <= 0. The result therefore
   reported independentBlocks: 0 without showing whether the
   block was actually inspected and rejected.

 V24.3 DOES NOT:
   - change HEALTHY / STABLE / DECAYING / BROKEN definitions
   - tune thresholds
   - modify candidate discovery
   - modify validation
   - modify OOS
   - modify exits
   - modify risk
   - promote a state
   - create a trading filter
   - place live orders

 It ONLY makes block construction and rejection observable.
===========================================================
*/

function buildV243IndependentEdgeHealthConfirmation({
    confirmationRecords,
    sourceLabel = "SEPARATE_HISTORICAL_SLICE",
    sourceStartTs = null,
    sourceEndTs = null
}) {

    const VERSION = "V24.3";

    const PRIOR_RECORDS = 40;
    const FORWARD_RECORDS = 20;
    const BLOCK_SIZE =
        PRIOR_RECORDS + FORWARD_RECORDS;

    // FROZEN from V22.8 / V22.9 / V24.
    const HEALTH_DECAY_THRESHOLD = -0.10;

    const MIN_FORWARD_TRADES = 1;
    const MIN_STATE_OBSERVATIONS = 10;

    function safeArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function round(value, digits = 4) {
        const x = Number(value);
        if (!Number.isFinite(x)) return 0;
        const p = 10 ** digits;
        return Math.round(x * p) / p;
    }

    function metrics(rows) {

        const data =
            safeArray(rows).filter(
                x =>
                    Number.isFinite(
                        Number(x.resultR)
                    )
            );

        const trades = data.length;

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
                    Number(x.resultR) === 0
            ).length;

        const decisiveTrades =
            wins + losses;

        const netR =
            data.reduce(
                (sum, x) =>
                    sum + Number(x.resultR),
                0
            );

        const expectedValueR =
            trades > 0
                ? netR / trades
                : 0;

        const totalWinR =
            data
                .filter(
                    x =>
                        Number(x.resultR) > 0
                )
                .reduce(
                    (sum, x) =>
                        sum + Number(x.resultR),
                    0
                );

        const totalLossR =
            Math.abs(
                data
                    .filter(
                        x =>
                            Number(x.resultR) < 0
                    )
                    .reduce(
                        (sum, x) =>
                            sum + Number(x.resultR),
                        0
                    )
            );

        const profitFactor =
            totalLossR > 0
                ? totalWinR / totalLossR
                : totalWinR > 0
                    ? 999
                    : 0;

        const winRate =
            decisiveTrades > 0
                ? (
                    wins /
                    decisiveTrades *
                    100
                )
                : 0;

        return {
            trades,
            decisiveTrades,
            wins,
            losses,
            timeouts,
            netR: round(netR),
            EV: round(expectedValueR),
            expectedValueR: round(expectedValueR),
            PF: round(profitFactor),
            profitFactor: round(profitFactor),
            winRate: round(winRate, 2)
        };
    }

    function internalEV(rows) {

        const data =
            safeArray(rows).filter(
                x =>
                    Number.isFinite(
                        Number(x.resultR)
                    )
            );

        if (!data.length) {
            return 0;
        }

        return (
            data.reduce(
                (sum, x) =>
                    sum + Number(x.resultR),
                0
            ) /
            data.length
        );
    }

    function healthState(priorRows) {

        const rows =
            safeArray(priorRows);

        if (
            rows.length <
            PRIOR_RECORDS
        ) {
            return "INSUFFICIENT_HISTORY";
        }

        const priorEV =
            internalEV(rows);

        if (priorEV <= 0) {
            return "NO_POSITIVE_PRIOR_EDGE";
        }

        const midpoint =
            Math.floor(
                rows.length / 2
            );

        const early =
            rows.slice(
                0,
                midpoint
            );

        const late =
            rows.slice(
                midpoint
            );

        const earlyEV =
            internalEV(early);

        const lateEV =
            internalEV(late);

        const internalEVChange =
            lateEV - earlyEV;

        if (
            internalEVChange >=
                HEALTH_DECAY_THRESHOLD &&
            lateEV > 0
        ) {
            return "HEALTHY";
        }

        if (
            internalEVChange >=
                HEALTH_DECAY_THRESHOLD &&
            lateEV <= 0
        ) {
            return "STABLE";
        }

        if (
            internalEVChange <
                HEALTH_DECAY_THRESHOLD &&
            lateEV > 0
        ) {
            return "DECAYING";
        }

        return "BROKEN";
    }

    function contextKey(row) {

        return [
            row?.setup ?? "UNKNOWN",
            row?.trend ?? "UNKNOWN",
            row?.regime ?? "UNKNOWN",
            row?.volatility ?? "UNKNOWN",
            row?.timeBucket ?? "UNKNOWN",
            row?.vwapDirection ?? "UNKNOWN",
            row?.rsiBucket ?? "UNKNOWN"
        ].join("|");
    }

    const rawRecords =
        safeArray(confirmationRecords);

    const records =
        rawRecords
            .filter(
                x =>
                    x &&
                    String(x.side).toUpperCase() ===
                        "SELL" &&
                    Number.isFinite(
                        Number(x.index)
                    ) &&
                    Number.isFinite(
                        Number(x.resultR)
                    )
            )
            .sort(
                (a, b) =>
                    Number(a.index) -
                    Number(b.index)
            );

    /*
    =========================================================
     V24.3 BLOCK EXECUTION AUDIT
    ---------------------------------------------------------
     Every geometrically possible block is INSPECTED.

     We never silently discard a block anymore.

     A block can be:
       - TESTED
       - REJECTED_NO_POSITIVE_PRIOR_EDGE
       - REJECTED_INSUFFICIENT_HISTORY

     With 83 SELL records:
       floor(83 / 60) = 1 possible block
       remainder = 23 records
    =========================================================
    */

    const possibleCompleteBlocks =
        Math.floor(
            records.length /
            BLOCK_SIZE
        );

    const remainderRecords =
        records.length %
        BLOCK_SIZE;

    const blocksInspected = [];
    const blockResults = [];
    const blocksRejected = [];

    for (
        let blockIndex = 0;
        blockIndex < possibleCompleteBlocks;
        blockIndex++
    ) {

        const start =
            blockIndex *
            BLOCK_SIZE;

        const priorStart =
            start;

        const priorEnd =
            start +
            PRIOR_RECORDS;

        const forwardStart =
            priorEnd;

        const forwardEnd =
            forwardStart +
            FORWARD_RECORDS;

        const prior =
            records.slice(
                priorStart,
                priorEnd
            );

        const forward =
            records.slice(
                forwardStart,
                forwardEnd
            );

        const state =
            healthState(prior);

        const audit = {
            block:
                blockIndex + 1,

            sourceRecordRange: {
                first:
                    start,
                last:
                    forwardEnd - 1
            },

            priorRecordRange: {
                first:
                    priorStart,
                last:
                    priorEnd - 1
            },

            forwardRecordRange: {
                first:
                    forwardStart,
                last:
                    forwardEnd - 1
            },

            priorRecords:
                prior.length,

            forwardRecords:
                forward.length,

            priorEV:
                round(
                    internalEV(prior)
                ),

            healthState:
                state
        };

        if (
            state ===
            "INSUFFICIENT_HISTORY"
        ) {

            const rejected = {
                ...audit,
                status:
                    "REJECTED",
                rejectionReason:
                    "INSUFFICIENT_HISTORY"
            };

            blocksInspected.push(rejected);
            blocksRejected.push(rejected);
            continue;
        }

        if (
            state ===
            "NO_POSITIVE_PRIOR_EDGE"
        ) {

            const rejected = {
                ...audit,
                status:
                    "REJECTED",
                rejectionReason:
                    "NO_POSITIVE_PRIOR_EDGE"
            };

            blocksInspected.push(rejected);
            blocksRejected.push(rejected);
            continue;
        }

        const midpoint =
            Math.floor(
                prior.length / 2
            );

        const early =
            prior.slice(
                0,
                midpoint
            );

        const late =
            prior.slice(
                midpoint
            );

        const earlyEV =
            internalEV(early);

        const lateEV =
            internalEV(late);

        const internalEVChange =
            lateEV - earlyEV;

        const priorMetrics =
            metrics(prior);

        const forwardMetrics =
            metrics(forward);

        const forwardSuccess =
            forward.length >=
                MIN_FORWARD_TRADES &&
            forwardMetrics.EV > 0;

        const tested = {
            ...audit,

            status:
                "TESTED",

            healthState:
                state,

            contextKey:
                contextKey(
                    prior[
                        prior.length - 1
                    ]
                ),

            prior: {
                ...priorMetrics,
                EV:
                    round(priorEV),
                earlyEV:
                    round(earlyEV),
                lateEV:
                    round(lateEV),
                internalEVChange:
                    round(
                        internalEVChange
                    )
            },

            forward:
                forwardMetrics,

            forwardSuccess,

            forwardLossStreak:
                maxLossStreak(forward)
        };

        blocksInspected.push(tested);
        blockResults.push(tested);
    }

    function maxLossStreak(rows) {

        let current = 0;
        let maximum = 0;

        for (
            const row of safeArray(rows)
        ) {

            const r =
                Number(row.resultR);

            if (r < 0) {
                current++;
                maximum =
                    Math.max(
                        maximum,
                        current
                    );
            } else {
                current = 0;
            }
        }

        return maximum;
    }

    function aggregateState(state) {

        const rows =
            blockResults.filter(
                x =>
                    x.healthState ===
                    state
            );

        const forwardTrades =
            rows.reduce(
                (sum, x) =>
                    sum +
                    x.forward.trades,
                0
            );

        const forwardDecisiveTrades =
            rows.reduce(
                (sum, x) =>
                    sum +
                    x.forward.decisiveTrades,
                0
            );

        const forwardWins =
            rows.reduce(
                (sum, x) =>
                    sum +
                    x.forward.wins,
                0
            );

        const forwardLosses =
            rows.reduce(
                (sum, x) =>
                    sum +
                    x.forward.losses,
                0
            );

        const forwardNetR =
            rows.reduce(
                (sum, x) =>
                    sum +
                    x.forward.netR,
                0
            );

        const forwardEV =
            forwardTrades > 0
                ? forwardNetR /
                  forwardTrades
                : 0;

        const successfulBlocks =
            rows.filter(
                x =>
                    x.forwardSuccess
            ).length;

        const failedBlocks =
            rows.filter(
                x =>
                    !x.forwardSuccess
            ).length;

        return {
            state,
            observations:
                rows.length,
            successfulBlocks,
            failedBlocks,
            blockSuccessRatePct:
                rows.length
                    ? round(
                        successfulBlocks /
                        rows.length *
                        100,
                        2
                    )
                    : 0,
            forwardTrades,
            forwardDecisiveTrades,
            forwardWins,
            forwardLosses,
            forwardNetR:
                round(forwardNetR),
            forwardEV:
                round(forwardEV),
            forwardWinRatePct:
                forwardDecisiveTrades
                    ? round(
                        forwardWins /
                        forwardDecisiveTrades *
                        100,
                        2
                    )
                    : 0,
            meetsSuggestedSample:
                rows.length >=
                MIN_STATE_OBSERVATIONS
        };
    }

    const stateResults = [
        "HEALTHY",
        "STABLE",
        "DECAYING",
        "BROKEN"
    ].map(
        aggregateState
    );

    const healthy =
        stateResults.find(
            x =>
                x.state ===
                "HEALTHY"
        );

    const decaying =
        stateResults.find(
            x =>
                x.state ===
                "DECAYING"
        );

    const healthyObserved =
        (healthy?.observations ?? 0) >=
        MIN_STATE_OBSERVATIONS;

    const decayingObserved =
        (decaying?.observations ?? 0) >=
        MIN_STATE_OBSERVATIONS;

    const healthyEV =
        healthyObserved
            ? healthy.forwardEV
            : null;

    const decayingEV =
        decayingObserved
            ? decaying.forwardEV
            : null;

    const healthyPositive =
        healthyObserved &&
        healthyEV > 0;

    const healthyBeatsDecaying =
        healthyObserved &&
        decayingObserved &&
        healthyEV >
            decayingEV;

    let confirmationClassification =
        "INCONCLUSIVE";

    if (
        healthyObserved &&
        decayingObserved
    ) {

        if (
            healthyPositive &&
            healthyBeatsDecaying
        ) {
            confirmationClassification =
                "HEALTH_PERSISTENCE_SUPPORTED";
        } else if (
            !healthyPositive
        ) {
            confirmationClassification =
                "HEALTH_PERSISTENCE_REJECTED";
        } else {
            confirmationClassification =
                "HEALTH_RELATIONSHIP_NOT_REPLICATED";
        }
    }

    const broken =
        stateResults.find(
            x =>
                x.state ===
                "BROKEN"
        );

    const stable =
        stateResults.find(
            x =>
                x.state ===
                "STABLE"
        );

    const brokenEV =
        broken?.observations
            ? broken.forwardEV
            : 0;

    const brokenInterpretation =
        (broken?.observations ?? 0) <
        MIN_STATE_OBSERVATIONS
            ? "UNDERPOWERED_SAMPLE"
            : brokenEV > 0
                ? "POSITIVE_BUT_NOT_A_PROMOTION_SIGNAL"
                : "NOT_POSITIVE";

    const totalForwardTrades =
        blockResults.reduce(
            (sum, x) =>
                sum +
                x.forward.trades,
            0
        );

    const totalForwardNetR =
        blockResults.reduce(
            (sum, x) =>
                sum +
                x.forward.netR,
            0
        );

    /*
    IMPORTANT:
      "independentFromV23" is now based on the explicit
      semantic source label used by the caller, rather than
      requiring one exact string.

      This fixes the V24.2 false-negative metadata.
    */

    const independentFromV23 =
        [
            "SEPARATE_HISTORICAL_SLICE",
            "SEPARATE_NON_OVERLAPPING_HISTORICAL_SLICE"
        ].includes(
            String(sourceLabel)
        );

    const minimumRecordsForOneBlock =
        BLOCK_SIZE;

    const auditStatus =
        possibleCompleteBlocks === 0
            ? "NO_COMPLETE_CONFIRMATION_BLOCK"
            : blockResults.length > 0
                ? "CONFIRMATION_BLOCKS_TESTED"
                : "COMPLETE_BLOCKS_REJECTED";

    return {

        success:
            true,

        version:
            VERSION,

        status:
            "COMPLETED",

        mode:
            "V24_INDEPENDENT_EDGE_HEALTH_CONFIRMATION",

        paperOnly:
            true,

        realOrders:
            false,

        brokerOrderEnabled:
            false,

        brokerOrderSent:
            false,

        purpose:
            "Audit whether V24 confirmation blocks are actually constructed, tested, or explicitly rejected on the independent chronological slice.",

        hypothesis:
            "HEALTHY should outperform DECAYING on an independent chronological sample if the V23 relationship is genuine.",

        source: {

            label:
                sourceLabel,

            independentFromV23,

            startTs:
                sourceStartTs,

            endTs:
                sourceEndTs,

            records:
                records.length,

            sellRecords:
                records.length
        },

        frozenDefinitions: {

            HEALTHY:
                "prior EV > 0 AND internal EV change >= -0.10R AND late-half EV > 0",

            STABLE:
                "prior EV > 0 AND internal EV change >= -0.10R AND late-half EV <= 0",

            DECAYING:
                "prior EV > 0 AND internal EV change < -0.10R AND late-half EV > 0",

            BROKEN:
                "prior EV > 0 AND internal EV change < -0.10R AND late-half EV <= 0",

            internalEVDecayThreshold:
                HEALTH_DECAY_THRESHOLD
        },

        geometry: {

            priorRecords:
                PRIOR_RECORDS,

            forwardRecords:
                FORWARD_RECORDS,

            blockSize:
                BLOCK_SIZE,

            overlappingBlocks:
                false,

            independentBlocks:
                true,

            blockStep:
                BLOCK_SIZE
        },

        executionAudit: {

            rawConfirmationRecords:
                rawRecords.length,

            usableSELLRecords:
                records.length,

            minimumRecordsForOneBlock,

            possibleCompleteBlocks,

            blocksInspected:
                blocksInspected.length,

            blocksTested:
                blockResults.length,

            blocksRejected:
                blocksRejected.length,

            rejectionReasons:
                blocksRejected.map(
                    x =>
                        x.rejectionReason
                ),

            remainderRecords,

            auditStatus
        },

        sample: {

            usableSELLRecords:
                records.length,

            independentBlocks:
                blockResults.length,

            totalForwardTrades,

            totalForwardNetR:
                round(
                    totalForwardNetR
                ),

            minimumStateObservations:
                MIN_STATE_OBSERVATIONS
        },

        stateResults,

        primaryConfirmation: {

            healthyObserved,

            decayingObserved,

            healthyForwardEV,

            decayingForwardEV,

            healthyMinusDecayingEV:
                healthyEV !== null &&
                decayingEV !== null
                    ? round(
                        healthyEV -
                        decayingEV
                    )
                    : null,

            healthyPositive,

            healthyBeatsDecaying,

            classification:
                confirmationClassification
        },

        brokenDiagnostic: {

            observations:
                broken?.observations ??
                0,

            forwardEV:
                brokenEV,

            interpretation:
                brokenInterpretation,

            usedForPromotion:
                false
        },

        stableDiagnostic: {

            observations:
                stable?.observations ??
                0,

            forwardEV:
                stable?.forwardEV ??
                null,

            usedForPromotion:
                false
        },

        blockResults,

        blockRejectionResults:
            blocksRejected,

        antiLeakage: {

            chronological:
                true,

            nonOverlappingConfirmationBlocks:
                true,

            priorWindowOnly:
                true,

            forwardWindowUsedOnlyForOutcome:
                true,

            futureOutcomeUsedForHealthState:
                false,

            futureOutcomeUsedForStateSelection:
                false,

            thresholdTuningFromConfirmation:
                false,

            v23OutcomeUsedToModifyV24Threshold:
                false,

            productionPipelineModified:
                false,

            candidateDiscoveryModified:
                false,

            validationModified:
                false,

            oosModified:
                false,

            exitModelModified:
                false,

            riskModified:
                false
        },

        decisionGuard: {

            noTradingChange:
                true,

            noThresholdTuning:
                true,

            noStatePromotion:
                true,

            noAutomaticFilter:
                true,

            noLiveTrading:
                true,

            interpretation:
                "V24.3 is a replication-test execution audit. A rejected block is reported explicitly and is not treated as evidence for or against the trading hypothesis."
        },

        interpretationGuard:
            "V24.3 must not be interpreted as proof of live profitability. It first verifies whether the independent confirmation geometry actually produces testable blocks before interpreting health-state outcomes."
    };
}

/*
===========================================================
 INTEGRATION
 -----------------------------------------------------------

 In the existing V24.2 learning-engine.js:

 REPLACE:
   buildV240IndependentEdgeHealthConfirmation

 WITH:
   buildV243IndependentEdgeHealthConfirmation

 AND update the call site to use the new function name.

 Also change the engine's top-level VERSION to:
   "V24.3"

 Do not change any trading mechanics.
===========================================================
*/

export {
    buildV243IndependentEdgeHealthConfirmation
};
