/*
===========================================================
TradeMind Pro
V24.6 — FOUR-SEGMENT CONSOLIDATION AUDIT
BROWSER-ACCESSIBLE / FROZEN EVIDENCE BUILD
===========================================================

PURPOSE
-------
Consolidate the FOUR ACTUAL V24.5 segment JSON results
already supplied for the V24.6 research audit.

IMPORTANT:
This build does NOT:
- call INDstocks
- fetch market data
- rerun V24.5
- discover candidates
- change validation
- change OOS
- change exits
- change risk
- promote HEALTHY
- place orders

It is an evidence-consolidation endpoint only.

CURRENT FROZEN V24.5 EVIDENCE
-----------------------------

S1:
  usable SELL records: 83
  possible complete blocks: 1
  blocks inspected: 1
  blocks tested: 0
  blocks rejected: 1
  rejection: NO_POSITIVE_PRIOR_EDGE
  health observations: 0
  classification: INCONCLUSIVE

S2:
  usable SELL records: 0
  possible complete blocks: 0
  blocks inspected: 0
  blocks tested: 0
  blocks rejected: 0
  audit: NO_COMPLETE_CONFIRMATION_BLOCK
  health observations: 0
  classification: INCONCLUSIVE

S3:
  usable SELL records: 0
  possible complete blocks: 0
  blocks inspected: 0
  blocks tested: 0
  blocks rejected: 0
  audit: NO_COMPLETE_CONFIRMATION_BLOCK
  health observations: 0
  classification: INCONCLUSIVE

S4:
  usable SELL records: 0
  possible complete blocks: 0
  blocks inspected: 0
  blocks tested: 0
  blocks rejected: 0
  audit: NO_COMPLETE_CONFIRMATION_BLOCK
  health observations: 0
  classification: INCONCLUSIVE

These values correspond to the latest four V24.5 result
uploads used for the V24.6 consolidation. Older V24.5
runs are deliberately NOT mixed into this audit.

===========================================================
*/

const VERSION = "V24.6";

const FROZEN_SEGMENTS = [
    {
        segment: 1,
        chronologicalPosition: "CLOSEST_TO_V23",
        usableSELLRecords: 83,
        possibleCompleteBlocks: 1,
        blocksInspected: 1,
        blocksTested: 0,
        blocksRejected: 1,
        rejectionReasons: [
            "NO_POSITIVE_PRIOR_EDGE"
        ],
        remainderRecords: 23,
        healthObservations: {
            HEALTHY: 0,
            STABLE: 0,
            DECAYING: 0,
            BROKEN: 0
        },
        forwardTrades: {
            HEALTHY: 0,
            STABLE: 0,
            DECAYING: 0,
            BROKEN: 0
        },
        forwardEV: {
            HEALTHY: null,
            STABLE: null,
            DECAYING: null,
            BROKEN: null
        },
        classification: "INCONCLUSIVE",
        auditStatus: "COMPLETE_BLOCKS_REJECTED"
    },

    {
        segment: 2,
        chronologicalPosition: "OLDER",
        usableSELLRecords: 0,
        possibleCompleteBlocks: 0,
        blocksInspected: 0,
        blocksTested: 0,
        blocksRejected: 0,
        rejectionReasons: [],
        remainderRecords: 0,
        healthObservations: {
            HEALTHY: 0,
            STABLE: 0,
            DECAYING: 0,
            BROKEN: 0
        },
        forwardTrades: {
            HEALTHY: 0,
            STABLE: 0,
            DECAYING: 0,
            BROKEN: 0
        },
        forwardEV: {
            HEALTHY: null,
            STABLE: null,
            DECAYING: null,
            BROKEN: null
        },
        classification: "INCONCLUSIVE",
        auditStatus: "NO_COMPLETE_CONFIRMATION_BLOCK"
    },

    {
        segment: 3,
        chronologicalPosition: "OLDER",
        usableSELLRecords: 0,
        possibleCompleteBlocks: 0,
        blocksInspected: 0,
        blocksTested: 0,
        blocksRejected: 0,
        rejectionReasons: [],
        remainderRecords: 0,
        healthObservations: {
            HEALTHY: 0,
            STABLE: 0,
            DECAYING: 0,
            BROKEN: 0
        },
        forwardTrades: {
            HEALTHY: 0,
            STABLE: 0,
            DECAYING: 0,
            BROKEN: 0
        },
        forwardEV: {
            HEALTHY: null,
            STABLE: null,
            DECAYING: null,
            BROKEN: null
        },
        classification: "INCONCLUSIVE",
        auditStatus: "NO_COMPLETE_CONFIRMATION_BLOCK"
    },

    {
        segment: 4,
        chronologicalPosition: "OLDEST",
        usableSELLRecords: 0,
        possibleCompleteBlocks: 0,
        blocksInspected: 0,
        blocksTested: 0,
        blocksRejected: 0,
        rejectionReasons: [],
        remainderRecords: 0,
        healthObservations: {
            HEALTHY: 0,
            STABLE: 0,
            DECAYING: 0,
            BROKEN: 0
        },
        forwardTrades: {
            HEALTHY: 0,
            STABLE: 0,
            DECAYING: 0,
            BROKEN: 0
        },
        forwardEV: {
            HEALTHY: null,
            STABLE: null,
            DECAYING: null,
            BROKEN: null
        },
        classification: "INCONCLUSIVE",
        auditStatus: "NO_COMPLETE_CONFIRMATION_BLOCK"
    }
];

function sum(key) {
    return FROZEN_SEGMENTS.reduce(
        (total, segment) =>
            total + Number(segment[key] || 0),
        0
    );
}

function sumState(stateKey) {
    return FROZEN_SEGMENTS.reduce(
        (total, segment) =>
            total +
            Number(
                segment.healthObservations[stateKey] || 0
            ),
        0
    );
}

function sendAudit(req, res) {

    const totalSELLRecords =
        sum("usableSELLRecords");

    const totalPossibleBlocks =
        sum("possibleCompleteBlocks");

    const totalBlocksInspected =
        sum("blocksInspected");

    const totalBlocksTested =
        sum("blocksTested");

    const totalBlocksRejected =
        sum("blocksRejected");

    const totalForwardTrades =
        FROZEN_SEGMENTS.reduce(
            (total, segment) =>
                total +
                Object.values(
                    segment.forwardTrades
                ).reduce(
                    (a, b) => a + b,
                    0
                ),
            0
        );

    const healthObservations = {
        HEALTHY: sumState("HEALTHY"),
        STABLE: sumState("STABLE"),
        DECAYING: sumState("DECAYING"),
        BROKEN: sumState("BROKEN")
    };

    const segmentsWithTestedBlocks =
        FROZEN_SEGMENTS.filter(
            segment =>
                segment.blocksTested > 0
        ).length;

    const segmentsWithPositivePriorEdge =
        FROZEN_SEGMENTS.filter(
            segment =>
                segment.blocksTested > 0
        ).length;

    const healthComparisonAvailable =
        healthObservations.HEALTHY > 0 &&
        healthObservations.DECAYING > 0;

    let conclusion =
        "INCONCLUSIVE";

    let confidence =
        "UNDERPOWERED";

    if (healthComparisonAvailable) {
        conclusion =
            "HEALTHY_VS_DECAYING_COMPARISON_AVAILABLE";

        confidence =
            "OBSERVATIONS_AVAILABLE";
    }

    return res.status(200).json({

        success: true,

        version: VERSION,

        status: "COMPLETED",

        mode:
            "V24_6_FOUR_SEGMENT_CONSOLIDATION_AUDIT",

        paperOnly: true,

        realOrders: false,

        brokerOrderEnabled: false,

        brokerOrderSent: false,

        researchProtocol: {

            segments: 4,

            segmentDays: 180,

            totalResearchDays: 720,

            priorRecords: 40,

            forwardRecords: 20,

            recordsPerBlock: 60,

            targetIndependentBlocks: 5,

            targetUsableSELLRecords: 300,

            healthThresholdFrozen: -0.10,

            chronological: true,

            nonOverlapping: true,

            source:
                "FROZEN_V24_5_SEGMENT_RESULTS",

            marketDataFetched:
                false,

            strategyMechanicsChanged:
                false,

            productionPipelineModified:
                false,

            thresholdTuning:
                false,

            tradingPromotion:
                false
        },

        segmentAudit:
            FROZEN_SEGMENTS,

        consolidation: {

            totalSELLRecords,

            totalPossibleCompleteBlocks: totalPossibleBlocks,

            totalBlocksInspected,

            totalBlocksTested,

            totalBlocksRejected,

            totalForwardTrades,

            segmentsWithTestedBlocks,

            segmentsWithPositivePriorEdge
        },

        healthStates: {

            observations:
                healthObservations,

            segmentsWithHealthy:
                FROZEN_SEGMENTS.filter(
                    x =>
                        x.healthObservations.HEALTHY > 0
                ).length,

            segmentsWithDecaying:
                FROZEN_SEGMENTS.filter(
                    x =>
                        x.healthObservations.DECAYING > 0
                ).length
        },

        primaryComparison: {

            healthyObservations:
                healthObservations.HEALTHY,

            decayingObservations:
                healthObservations.DECAYING,

            healthyForwardEV:
                null,

            decayingForwardEV:
                null,

            healthyMinusDecayingEV:
                null,

            comparisonAvailable:
                healthComparisonAvailable
        },

        chronology: {

            segmentsSupportingHealthy:
                0,

            segmentsContradictingHealthy:
                0,

            assessment:
                "NO_HEALTH_STATE_COMPARISON_AVAILABLE"
        },

        decision: {

            conclusion,

            confidence,

            finalResearchDecision:
                "DO_NOT_MODIFY_STRATEGY",

            strategyImpact:
                "NO_CHANGE"
        },

        interpretation: {

            hypothesisConfirmed:
                false,

            hypothesisRejected:
                false,

            hypothesisInconclusive:
                true,

            reason:
                "Across the frozen S1-S4 results, no independent block reached HEALTHY/DECAYING classification. S1 had one possible block but it was rejected for NO_POSITIVE_PRIOR_EDGE; S2-S4 had no complete confirmation block.",

            criticalDistinction:
                "NO_POSITIVE_PRIOR_EDGE and NO_COMPLETE_CONFIRMATION_BLOCK are evidence-availability outcomes, not failed HEALTHY tests."
        },

        guardrails: {

            noMarketDataFetch:
                true,

            noCandidateDiscovery:
                true,

            noValidation:
                true,

            noOOS:
                true,

            noExitOptimization:
                true,

            noRiskOptimization:
                true,

            noRealOrders:
                true
        }

    });
}

export default async function handler(req, res) {

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
    );

    try {

        /*
         * Browser GET is intentionally supported.
         * V24.6 is a frozen-evidence audit and therefore
         * does not need a POST payload or an INDstocks call.
         */

        if (
            req.method !== "GET" &&
            req.method !== "POST"
        ) {
            return res.status(405).json({
                success: false,
                version: VERSION,
                status: "METHOD_NOT_ALLOWED",
                paperOnly: true,
                realOrders: false,
                brokerOrderEnabled: false,
                brokerOrderSent: false,
                error:
                    "V24.6 supports GET for browser audit access."
            });
        }

        return sendAudit(req, res);

    } catch (error) {

        return res.status(500).json({
            success: false,
            version: VERSION,
            status: "ERROR",
            paperOnly: true,
            realOrders: false,
            brokerOrderEnabled: false,
            brokerOrderSent: false,
            error:
                error?.message ||
                String(error)
        });
    }
}
