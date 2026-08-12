/*
TradeMind Pro
V24.6 — FOUR-SEGMENT CONSOLIDATION AUDIT

PURPOSE:
Consolidate the four completed V24.5 independent confirmation
JSON results into one evidence-only research audit.

THIS IS NOT A TRADING ENGINE.
It does NOT fetch market data, discover candidates, validate,
run OOS, change exits/risk, promote HEALTHY, or place orders.

INPUT:
POST JSON:
{
  "segments": [
    <V24.5 Segment 1 result>,
    <V24.5 Segment 2 result>,
    <V24.5 Segment 3 result>,
    <V24.5 Segment 4 result>
  ]
}

Segments must be supplied in S1,S2,S3,S4 order.

FROZEN V24.5 GEOMETRY:
4 segments × 180 days = 720 days
40 prior SELL records + 20 forward SELL records = 60/block

IMPORTANT:
NO_POSITIVE_PRIOR_EDGE is NOT a failed HEALTHY test.
Only blocks that actually reach a frozen health-state
classification may contribute to HEALTHY vs DECAYING comparison.
*/

const VERSION = "V24.6";

const SEGMENT_COUNT = 4;
const SEGMENT_DAYS = 180;
const TOTAL_DAYS = 720;

const PRIOR_RECORDS = 40;
const FORWARD_RECORDS = 20;
const RECORDS_PER_BLOCK = 60;

const HEALTH_STATES = [
    "HEALTHY",
    "STABLE",
    "DECAYING",
    "BROKEN"
];

function n(value) {
    const x = Number(value);
    return Number.isFinite(x) ? x : null;
}

function unwrap(value) {
    if (!value || typeof value !== "object") return null;
    return value.result && typeof value.result === "object"
        ? value.result
        : value;
}

function confirmation(result) {
    return result?.v24IndependentEdgeHealthConfirmation ||
        result?.independentEdgeHealthConfirmation ||
        result?.confirmation ||
        result?.v24ResearchProtocol ||
        null;
}

function blocks(result, conf) {
    const candidates = [
        conf?.blockResults,
        conf?.blocks,
        result?.blockResults,
        result?.confirmation?.blockResults
    ];

    return candidates.find(Array.isArray) || [];
}

function stateOf(block) {
    return String(
        block?.classification ??
        block?.healthState ??
        block?.state ??
        ""
    ).toUpperCase();
}

function evOf(block) {
    const values = [
        block?.forwardEV,
        block?.forwardExpectedValueR,
        block?.outcome?.expectedValueR,
        block?.forward?.expectedValueR,
        block?.metrics?.forwardEV,
        block?.metrics?.expectedValueR
    ];

    for (const value of values) {
        const x = n(value);
        if (x !== null) return x;
    }

    return null;
}

function tradesOf(block) {
    const values = [
        block?.forwardTrades,
        block?.forwardTradeCount,
        block?.outcome?.trades,
        block?.forward?.trades,
        block?.metrics?.forwardTrades
    ];

    for (const value of values) {
        const x = n(value);
        if (x !== null) return x;
    }

    return 0;
}

function weightedEV(items) {
    const usable = items.filter(
        x => x.ev !== null && x.trades > 0
    );

    if (!usable.length) return null;

    const trades = usable.reduce(
        (a, x) => a + x.trades, 0
    );

    if (!trades) return null;

    return usable.reduce(
        (a, x) => a + x.ev * x.trades, 0
    ) / trades;
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

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            version: VERSION,
            status: "METHOD_NOT_ALLOWED",
            paperOnly: true,
            realOrders: false,
            brokerOrderEnabled: false,
            brokerOrderSent: false,
            error:
                "V24.6 requires POST with the four V24.5 JSON results."
        });
    }

    try {

        const input =
            req.body &&
            typeof req.body === "object"
                ? req.body
                : null;

        const segments =
            Array.isArray(input?.segments)
                ? input.segments
                : null;

        if (!segments || segments.length !== SEGMENT_COUNT) {
            return res.status(400).json({
                success: false,
                version: VERSION,
                status: "INVALID_INPUT",
                paperOnly: true,
                realOrders: false,
                brokerOrderEnabled: false,
                brokerOrderSent: false,
                error:
                    "Exactly four V24.5 results are required in S1,S2,S3,S4 order."
            });
        }

        const segmentAudit = [];

        const observations = [];

        let totalSELLRecords = 0;
        let totalPossibleBlocks = 0;
        let totalTestedBlocks = 0;
        let totalRejectedBlocks = 0;
        let totalForwardTrades = 0;

        for (let i = 0; i < SEGMENT_COUNT; i++) {

            const segmentNumber = i + 1;
            const result = unwrap(segments[i]);

            if (!result) {
                return res.status(400).json({
                    success: false,
                    version: VERSION,
                    status: "INVALID_SEGMENT",
                    error:
                        `Segment ${segmentNumber} is not a valid JSON object.`
                });
            }

            const conf = confirmation(result);
            const blockResults = blocks(result, conf);

            const sample = conf?.sample || conf?.source || {};

            const sellRecords =
                n(
                    sample.sellRecords ??
                    conf?.sellRecords ??
                    conf?.usableSELLRecords ??
                    result?.sellRecords
                );

            const possibleBlocks =
                n(
                    conf?.possibleCompleteBlocks ??
                    conf?.possibleBlocks ??
                    result?.possibleCompleteBlocks
                );

            const testedBlocks =
                n(
                    conf?.blocksTested ??
                    conf?.testedBlocks ??
                    result?.blocksTested
                );

            const rejectedBlocks =
                n(
                    conf?.blocksRejected ??
                    conf?.rejectedBlocks ??
                    result?.blocksRejected
                );

            const audit = {
                segment: segmentNumber,
                version: result.version ?? null,
                status: result.status ?? conf?.status ?? "UNKNOWN",
                sample: {
                    sellRecords,
                    possibleCompleteBlocks: possibleBlocks,
                    blocksTested: testedBlocks,
                    blocksRejected: rejectedBlocks
                },
                healthObservations: {
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
                blockResultsSeen: blockResults.length
            };

            for (const block of blockResults) {

                const state = stateOf(block);

                if (!HEALTH_STATES.includes(state)) continue;

                const item = {
                    segment: segmentNumber,
                    state,
                    ev: evOf(block),
                    trades: tradesOf(block)
                };

                observations.push(item);

                audit.healthObservations[state]++;
                totalForwardTrades += item.trades;
            }

            for (const state of HEALTH_STATES) {
                audit.forwardEV[state] =
                    weightedEV(
                        observations.filter(
                            x =>
                                x.segment === segmentNumber &&
                                x.state === state
                        )
                    );
            }

            if (sellRecords !== null)
                totalSELLRecords += sellRecords;

            if (possibleBlocks !== null)
                totalPossibleBlocks += possibleBlocks;

            if (testedBlocks !== null)
                totalTestedBlocks += testedBlocks;

            if (rejectedBlocks !== null)
                totalRejectedBlocks += rejectedBlocks;

            segmentAudit.push(audit);
        }

        const healthy =
            observations.filter(
                x => x.state === "HEALTHY"
            );

        const decaying =
            observations.filter(
                x => x.state === "DECAYING"
            );

        const healthyEV = weightedEV(healthy);
        const decayingEV = weightedEV(decaying);

        const healthyTrades =
            healthy.reduce(
                (a, x) => a + x.trades, 0
            );

        const decayingTrades =
            decaying.reduce(
                (a, x) => a + x.trades, 0
            );

        const difference =
            healthyEV !== null &&
            decayingEV !== null
                ? healthyEV - decayingEV
                : null;

        const healthySegments =
            new Set(
                healthy.map(x => x.segment)
            ).size;

        const decayingSegments =
            new Set(
                decaying.map(x => x.segment)
            ).size;

        const segmentComparisons =
            segmentAudit.filter(
                x =>
                    x.forwardEV.HEALTHY !== null &&
                    x.forwardEV.DECAYING !== null
            );

        const supportingSegments =
            segmentComparisons.filter(
                x =>
                    x.forwardEV.HEALTHY >
                    x.forwardEV.DECAYING
            ).length;

        const contradictingSegments =
            segmentComparisons.filter(
                x =>
                    x.forwardEV.HEALTHY <=
                    x.forwardEV.DECAYING
            ).length;

        /*
         * V24.6 deliberately remains INCONCLUSIVE unless
         * actual HEALTHY and DECAYING observations exist.
         * Cross-segment evidence is reported separately.
         */
        let conclusion = "INCONCLUSIVE";
        let confidence = "UNDERPOWERED";

        if (
            healthy.length > 0 &&
            decaying.length > 0 &&
            healthyEV !== null &&
            decayingEV !== null
        ) {
            confidence = "OBSERVATIONS_AVAILABLE";

            conclusion =
                healthyEV > decayingEV
                    ? "HEALTHY_SUPPORTIVE"
                    : "HEALTHY_NOT_SUPPORTIVE";
        }

        const crossSegment =
            healthySegments >= 2 &&
            decayingSegments >= 2;

        const chronologyAssessment =
            !crossSegment
                ? "INSUFFICIENT_CROSS_SEGMENT_EVIDENCE"
                : supportingSegments > contradictingSegments
                    ? "SUPPORTIVE_ACROSS_SEGMENTS"
                    : supportingSegments < contradictingSegments
                        ? "NOT_SUPPORTIVE_ACROSS_SEGMENTS"
                        : "MIXED_ACROSS_SEGMENTS";

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
                segments: SEGMENT_COUNT,
                segmentDays: SEGMENT_DAYS,
                totalResearchDays: TOTAL_DAYS,
                priorRecords: PRIOR_RECORDS,
                forwardRecords: FORWARD_RECORDS,
                recordsPerBlock: RECORDS_PER_BLOCK,
                chronological: true,
                nonOverlapping: true,
                healthThresholdFrozen: -0.1,
                productionPipelineModified: false,
                strategyMechanicsModified: false,
                thresholdTuning: false,
                tradingPromotion: false
            },

            segmentAudit,

            consolidation: {
                totalSELLRecords,
                totalPossibleCompleteBlocks,
                totalTestedBlocks,
                totalRejectedBlocks,
                totalForwardTrades
            },

            healthStates: {
                HEALTHY: healthy.length,
                STABLE:
                    observations.filter(
                        x => x.state === "STABLE"
                    ).length,
                DECAYING: decaying.length,
                BROKEN:
                    observations.filter(
                        x => x.state === "BROKEN"
                    ).length,
                segmentsWithHealthy: healthySegments,
                segmentsWithDecaying: decayingSegments
            },

            primaryComparison: {
                healthyObservations: healthy.length,
                decayingObservations: decaying.length,
                healthyForwardTrades: healthyTrades,
                decayingForwardTrades: decayingTrades,
                healthyForwardEV: healthyEV,
                decayingForwardEV: decayingEV,
                healthyMinusDecayingEV: difference
            },

            chronology: {
                segmentsWithBothStates:
                    segmentComparisons.length,
                segmentsSupportingHealthy:
                    supportingSegments,
                segmentsContradictingHealthy:
                    contradictingSegments,
                assessment: chronologyAssessment
            },

            decision: {
                conclusion,
                confidence,
                finalResearchDecision:
                    conclusion === "INCONCLUSIVE"
                        ? "DO_NOT_MODIFY_STRATEGY"
                        : "DIAGNOSTIC_ONLY_REVIEW_REQUIRED",
                strategyImpact: "NO_CHANGE"
            },

            interpretation: {
                hypothesisConfirmed:
                    conclusion === "HEALTHY_SUPPORTIVE" &&
                    crossSegment,
                hypothesisRejected:
                    conclusion === "HEALTHY_NOT_SUPPORTIVE" &&
                    crossSegment,
                hypothesisInconclusive:
                    !crossSegment ||
                    conclusion === "INCONCLUSIVE",
                note:
                    "V24.6 consolidates frozen V24.5 evidence only. A rejected block is not treated as a failed HEALTHY test."
            },

            guardrails: {
                noMarketDataFetch: true,
                noCandidateDiscovery: true,
                noValidation: true,
                noOOS: true,
                noExitOptimization: true,
                noRiskOptimization: true,
                noRealOrders: true
            }
        });

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
