/*
============================================================
TradeMind Pro
PMSE M2.4 — Forward Outcome Models
============================================================

Purpose:
Represent what happened AFTER the frozen 09:00
market-regime decision.

Research only.
No trading.
No broker interaction.
No feedback into regime evaluation.
============================================================
*/

export const PMSE_OUTCOME_VERSION =
    "PMSE-M2.4-FORWARD-OUTCOME-V1";


export const OUTCOME_STATES = Object.freeze({

    POSITIVE:
        "POSITIVE",

    NEGATIVE:
        "NEGATIVE",

    FLAT:
        "FLAT",

    UNKNOWN:
        "UNKNOWN"

});


export function createForwardOutcome({

    marketDate = null,

    decisionCutoff = null,

    sessionOpen = null,

    sessionClose = null,

    sessionHigh = null,

    sessionLow = null,

    sessionReturnPct = null,

    maxFavourableMovePct = null,

    maxAdverseMovePct = null,

    state = OUTCOME_STATES.UNKNOWN,

    candleCount = 0

} = {}) {

    return {

        version:
            PMSE_OUTCOME_VERSION,

        marketDate,

        decisionCutoff,

        sessionOpen,

        sessionClose,

        sessionHigh,

        sessionLow,

        sessionReturnPct,

        maxFavourableMovePct,

        maxAdverseMovePct,

        state,

        candleCount,

        metadata: {

            researchOnly:
                true,

            regimeDecisionUsed:
                false,

            futureInformationUsedForDecision:
                false,

            tradeCreated:
                false,

            brokerCalled:
                false,

            productionBackendTouched:
                false,

            frontendTouched:
                false

        }

    };

}