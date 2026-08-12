/*
===========================================================
TradeMind Pro
V25.6 — EDGE HEALTH FAILURE ANATOMY DIAGNOSTIC
===========================================================

PURPOSE
-------
V25.6 investigates WHY an apparently healthy prior edge
can fail in the forward window.

THIS IS A DIAGNOSTIC ENGINE ONLY.

It does NOT:
- modify candidate discovery
- modify qualification
- modify validation
- modify OOS
- modify exits
- modify risk
- create a trading filter
- promote HEALTHY
- suppress DECAYING
- tune thresholds from forward outcomes
- place real orders

RESEARCH QUESTION
-----------------
When a context appears healthy before activation, what
characteristics are associated with forward success versus
forward failure?

FROZEN DIAGNOSTIC DIMENSIONS
----------------------------
1. prior EV
2. prior EV momentum
3. internal EV change
4. early-half EV
5. late-half EV
6. prior PF
7. prior win rate
8. prior decisive sample size
9. timeout rate
10. recent loss streak
11. setup
12. trend
13. regime
14. volatility

IMPORTANT
---------
V25.6 does NOT invent a new threshold or use forward
outcomes to decide which threshold is "best".

The forward result is used ONLY to classify the observed
outcome as SUCCESS / FAILURE / UNRESOLVED.

INPUT
-----
POST JSON:

{
  "observations": [
    {
      "id": "optional-id",

      "prior": {
        "ev": number,
        "evMomentum": number|null,
        "internalEVChange": number|null,
        "earlyHalfEV": number|null,
        "lateHalfEV": number|null,
        "pf": number|null,
        "winRate": number|null,
        "decisiveSampleSize": number|null,
        "timeoutRate": number|null,
        "recentLossStreak": number|null,
        "setup": "string|null",
        "trend": "string|null",
        "regime": "string|null",
        "volatility": number|string|null
      },

      "forward": {
        "ev": number|null,
        "trades": number|null,
        "winRate": number|null,
        "pf": number|null,
        "status": "SUCCESS|FAILURE|UNRESOLVED"
      }
    }
  ]
}

A V25.6 observation must already represent an
apparently healthy prior context. This engine does not
create that eligibility from future information.

SUCCESS / FAILURE CLASSIFICATION
--------------------------------
If forward.status is explicitly supplied, it is preserved.

If omitted:
- SUCCESS = forward EV > 0
- FAILURE = forward EV < 0
- UNRESOLVED = forward EV === 0 or unavailable

No threshold optimization is performed.

OUTPUT
------
The result reports:

- observation counts
- SUCCESS / FAILURE / UNRESOLVED counts
- feature availability
- descriptive averages for SUCCESS vs FAILURE
- failure anatomy
- categorical regime/setup/trend breakdown
- missing-data coverage
- diagnostic conclusion

The comparison is DESCRIPTIVE ONLY.
It does not claim causation.

===========================================================
*/

const VERSION = "V25.6";

const FEATURE_KEYS = [
    "ev",
    "evMomentum",
    "internalEVChange",
    "earlyHalfEV",
    "lateHalfEV",
    "pf",
    "winRate",
    "decisiveSampleSize",
    "timeoutRate",
    "recentLossStreak",
    "setup",
    "trend",
    "regime",
    "volatility"
];

const NUMERIC_FEATURES = [
    "ev",
    "evMomentum",
    "internalEVChange",
    "earlyHalfEV",
    "lateHalfEV",
    "pf",
    "winRate",
    "decisiveSampleSize",
    "timeoutRate",
    "recentLossStreak",
    "volatility"
];

const CATEGORICAL_FEATURES = [
    "setup",
    "trend",
    "regime"
];

function numberOrNull(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}

function normalizeString(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    return String(value);
}

function average(values) {

    const usable =
        values.filter(
            value =>
                Number.isFinite(
                    Number(value)
                )
        );

    if (!usable.length) {
        return null;
    }

    return usable.reduce(
        (sum, value) =>
            sum + Number(value),
        0
    ) / usable.length;
}

function median(values) {

    const usable =
        values
            .filter(
                value =>
                    Number.isFinite(
                        Number(value)
                    )
            )
            .map(Number)
            .sort(
                (a, b) =>
                    a - b
            );

    if (!usable.length) {
        return null;
    }

    const middle =
        Math.floor(
            usable.length / 2
        );

    if (
        usable.length % 2 === 0
    ) {
        return (
            usable[middle - 1] +
            usable[middle]
        ) / 2;
    }

    return usable[middle];
}

function classifyForward(forward) {

    const explicit =
        normalizeString(
            forward?.status
        );

    if (
        explicit === "SUCCESS" ||
        explicit === "FAILURE" ||
        explicit === "UNRESOLVED"
    ) {
        return explicit;
    }

    const ev =
        numberOrNull(
            forward?.ev
        );

    if (ev === null) {
        return "UNRESOLVED";
    }

    if (ev > 0) {
        return "SUCCESS";
    }

    if (ev < 0) {
        return "FAILURE";
    }

    return "UNRESOLVED";
}

function normalizeObservation(raw, index) {

    const prior =
        raw?.prior || {};

    const forward =
        raw?.forward || {};

    const normalizedPrior = {};

    for (
        const key of NUMERIC_FEATURES
    ) {
        normalizedPrior[key] =
            numberOrNull(
                prior[key]
            );
    }

    for (
        const key of CATEGORICAL_FEATURES
    ) {
        normalizedPrior[key] =
            normalizeString(
                prior[key]
            );
    }

    return {

        id:
            normalizeString(
                raw?.id
            ) ||
            `V25.6_OBS_${index + 1}`,

        prior:
            normalizedPrior,

        forward: {

            ev:
                numberOrNull(
                    forward.ev
                ),

            trades:
                numberOrNull(
                    forward.trades
                ),

            winRate:
                numberOrNull(
                    forward.winRate
                ),

            pf:
                numberOrNull(
                    forward.pf
                ),

            status:
                classifyForward(
                    forward
                )
        }
    };
}

function featureStats(
    observations,
    feature
) {

    const success =
        observations
            .filter(
                item =>
                    item.forward.status ===
                    "SUCCESS"
            )
            .map(
                item =>
                    item.prior[feature]
            );

    const failure =
        observations
            .filter(
                item =>
                    item.forward.status ===
                    "FAILURE"
            )
            .map(
                item =>
                    item.prior[feature]
            );

    return {

        success: {
            n:
                success.filter(
                    value =>
                        value !== null
                ).length,

            mean:
                average(success),

            median:
                median(success)
        },

        failure: {
            n:
                failure.filter(
                    value =>
                        value !== null
                ).length,

            mean:
                average(failure),

            median:
                median(failure)
        }
    };
}

function categoricalBreakdown(
    observations,
    feature
) {

    const groups = {};

    for (
        const item of observations
    ) {

        const value =
            item.prior[feature];

        if (
            value === null
        ) {
            continue;
        }

        if (
            !groups[value]
        ) {
            groups[value] = {
                observations: 0,
                success: 0,
                failure: 0,
                unresolved: 0,
                forwardEVSum: 0,
                forwardEVCount: 0
            };
        }

        const group =
            groups[value];

        group.observations++;

        if (
            item.forward.status ===
            "SUCCESS"
        ) {
            group.success++;
        }

        if (
            item.forward.status ===
            "FAILURE"
        ) {
            group.failure++;
        }

        if (
            item.forward.status ===
            "UNRESOLVED"
        ) {
            group.unresolved++;
        }

        if (
            item.forward.ev !== null
        ) {
            group.forwardEVSum +=
                item.forward.ev;

            group.forwardEVCount++;
        }
    }

    return Object.fromEntries(
        Object.entries(groups)
            .map(
                ([key, value]) => [
                    key,
                    {
                        observations:
                            value.observations,

                        success:
                            value.success,

                        failure:
                            value.failure,

                        unresolved:
                            value.unresolved,

                        forwardEV:
                            value.forwardEVCount
                                ? value.forwardEVSum /
                                  value.forwardEVCount
                                : null
                    }
                ]
            )
    );
}

function coverage(
    observations,
    feature
) {

    const available =
        observations.filter(
            item =>
                item.prior[feature] !== null
        ).length;

    return {

        available,

        missing:
            observations.length -
            available,

        coverage:
            observations.length
                ? available /
                  observations.length
                : 0
    };
}

function descriptiveDifference(
    stats
) {

    if (
        stats.success.mean === null ||
        stats.failure.mean === null
    ) {
        return null;
    }

    return (
        stats.success.mean -
        stats.failure.mean
    );
}

export default async function handler(
    req,
    res
) {

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
    );

    if (
        req.method !== "POST"
    ) {

        return res.status(405).json({

            success: false,

            version: VERSION,

            status:
                "METHOD_NOT_ALLOWED",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            error:
                "V25.6 requires POST observation data. It does not fetch market data."
        });
    }

    try {

        const body =
            req.body &&
            typeof req.body === "object"
                ? req.body
                : null;

        const rawObservations =
            Array.isArray(
                body?.observations
            )
                ? body.observations
                : null;

        if (
            !rawObservations
        ) {

            return res.status(400).json({

                success: false,

                version: VERSION,

                status:
                    "INVALID_INPUT",

                paperOnly: true,

                realOrders: false,

                brokerOrderEnabled: false,

                brokerOrderSent: false,

                error:
                    "Expected POST body with an observations array."
            });
        }

        const observations =
            rawObservations.map(
                normalizeObservation
            );

        const success =
            observations.filter(
                item =>
                    item.forward.status ===
                    "SUCCESS"
            );

        const failure =
            observations.filter(
                item =>
                    item.forward.status ===
                    "FAILURE"
            );

        const unresolved =
            observations.filter(
                item =>
                    item.forward.status ===
                    "UNRESOLVED"
            );

        const featureStatistics = {};

        for (
            const feature
            of NUMERIC_FEATURES
        ) {

            const stats =
                featureStats(
                    observations,
                    feature
                );

            featureStatistics[feature] = {

                ...stats,

                descriptiveSuccessMinusFailure:
                    descriptiveDifference(
                        stats
                    )
            };
        }

        const featureCoverage = {};

        for (
            const feature
            of FEATURE_KEYS
        ) {

            featureCoverage[feature] =
                coverage(
                    observations,
                    feature
                );
        }

        const categoricalAnalysis = {};

        for (
            const feature
            of CATEGORICAL_FEATURES
        ) {

            categoricalAnalysis[feature] =
                categoricalBreakdown(
                    observations,
                    feature
                );
        }

        /*
         * Failure anatomy is descriptive.
         *
         * A feature is flagged as "failure-associated"
         * only when both success and failure groups have
         * observations for that feature and their means
         * can be calculated.
         *
         * No causal claim is made.
         */
        const failureAnatomy =
            NUMERIC_FEATURES
                .map(
                    feature => {

                        const stats =
                            featureStatistics[
                                feature
                            ];

                        const difference =
                            stats
                                .descriptiveSuccessMinusFailure;

                        return {

                            feature,

                            successMean:
                                stats.success.mean,

                            failureMean:
                                stats.failure.mean,

                            successMinusFailure:
                                difference,

                            usableSuccessN:
                                stats.success.n,

                            usableFailureN:
                                stats.failure.n
                        };
                    }
                )
                .filter(
                    item =>
                        item.successMean !== null &&
                        item.failureMean !== null
                )
                .sort(
                    (a, b) =>
                        Math.abs(
                            b.successMinusFailure
                        ) -
                        Math.abs(
                            a.successMinusFailure
                        )
                );

        let diagnosticConclusion =
            "INSUFFICIENT_DATA";

        if (
            success.length > 0 &&
            failure.length > 0
        ) {

            diagnosticConclusion =
                "FAILURE_ANATOMY_AVAILABLE_DESCRIPTIVE_ONLY";

        } else if (
            success.length > 0
        ) {

            diagnosticConclusion =
                "SUCCESS_ONLY_NO_FAILURE_COMPARISON";

        } else if (
            failure.length > 0
        ) {

            diagnosticConclusion =
                "FAILURE_ONLY_NO_SUCCESS_COMPARISON";
        }

        return res.status(200).json({

            success: true,

            version: VERSION,

            status:
                "COMPLETED",

            mode:
                "V25_6_EDGE_HEALTH_FAILURE_ANATOMY_DIAGNOSTIC",

            paperOnly: true,

            realOrders: false,

            brokerOrderEnabled: false,

            brokerOrderSent: false,

            researchQuestion:
                "When an apparently healthy prior edge fails forward, what observable prior characteristics differ between forward success and forward failure?",

            protocol: {

                diagnosticOnly:
                    true,

                forwardOutcomeUsedFor:
                    "OUTCOME_CLASSIFICATION_ONLY",

                thresholdTuning:
                    false,

                causalInference:
                    false,

                strategyModification:
                    false,

                tradingPromotion:
                    false,

                marketDataFetched:
                    false
            },

            sample: {

                totalObservations:
                    observations.length,

                success:
                    success.length,

                failure:
                    failure.length,

                unresolved:
                    unresolved.length,

                successRateAmongResolved:
                    success.length +
                    failure.length
                        ? success.length /
                          (
                            success.length +
                            failure.length
                          )
                        : null
            },

            featureCoverage,

            featureStatistics,

            categoricalAnalysis,

            failureAnatomy,

            forwardSummary: {

                successForwardEV:
                    average(
                        success.map(
                            item =>
                                item.forward.ev
                        )
                    ),

                failureForwardEV:
                    average(
                        failure.map(
                            item =>
                                item.forward.ev
                        )
                    ),

                successForwardTrades:
                    average(
                        success.map(
                            item =>
                                item.forward.trades
                        )
                    ),

                failureForwardTrades:
                    average(
                        failure.map(
                            item =>
                                item.forward.trades
                        )
                    )
            },

            diagnosticConclusion,

            interpretation: {

                whatThisCanShow:
                    "Descriptive differences in frozen prior-context features between forward successes and failures.",

                whatThisCannotShow:
                    "Causation, an optimal threshold, or authorization to change the trading strategy.",

                nextDecision:
                    "Only after sufficient observations should a separate adaptive-edge experiment be considered."
            },

            guardrails: {

                noCandidateDiscovery:
                    true,

                noQualificationChange:
                    true,

                noValidationChange:
                    true,

                noOOSChange:
                    true,

                noExitChange:
                    true,

                noRiskChange:
                    true,

                noHealthThresholdChange:
                    true,

                noRealOrders:
                    true
            }
        });

    } catch (error) {

        return res.status(500).json({

            success: false,

            version: VERSION,

            status:
                "ERROR",

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
