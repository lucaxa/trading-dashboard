/*
============================================================
TradeMind Pro
PMSE M2.5 — Regime + Forward Outcome Research Record
============================================================

Purpose:
Join the frozen 09:00 market-regime decision with the
forward outcome that occurred later during the same
regular trading session.

Research only.
No trading.
No broker interaction.
No frontend interaction.
No feedback into regime evaluation.

The forward outcome is strictly downstream evidence.
============================================================
*/

export const PMSE_REGIME_OUTCOME_VERSION =
    "PMSE-M2.5-REGIME-OUTCOME-V1";


export function createRegimeOutcomeRecord({

    marketDate = null,

    cutoff = null,

    previousSessionDate = null,

    regime = null,

    observations = {},

    forwardOutcome = null

} = {}) {

    if (!marketDate) {

        throw new Error(
            "marketDate is required"
        );

    }


    if (!cutoff) {

        throw new Error(
            "cutoff is required"
        );

    }


    if (!regime) {

        throw new Error(
            "regime is required"
        );

    }


    if (!forwardOutcome) {

        throw new Error(
            "forwardOutcome is required"
        );

    }


    return {

        version:
            PMSE_REGIME_OUTCOME_VERSION,

        marketDate,

        decisionCutoff:
            cutoff,

        previousSessionDate,

  regime: {

    marketDate:
        marketDate,

    state:
        regime.state ?? null,

    score:
        regime.score ?? null,

    confidence:
        regime.confidence ?? null,

    reasons: [
        ...(regime.reasons || [])
    ]

},

        observations: {

            ...observations

        },

        forwardOutcome: {

            ...forwardOutcome

        },

        metadata: {

            researchOnly:
                true,

            decisionFrozenAt:
                cutoff,

            futureInformationUsedForDecision:
                false,

            forwardOutcomeUsedToCreateDecision:
                false,

            regimeDecisionUsed:
                true,

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