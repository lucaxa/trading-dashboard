export const PMSE_REGIME_VERSION =
    "PMSE-M2-REGIME-V1";


export const REGIME_STATES = Object.freeze({

    GREEN:
        "GREEN",

    CAUTION:
        "CAUTION",

    RED:
        "RED"

});


export function createMarketRegime({

    marketDate = null,

    cutoff = null,

    state = REGIME_STATES.CAUTION,

    score = 0,

    confidence = 0,

    reasons = [],

    observations = {}

} = {}) {

    return {

        version:
            PMSE_REGIME_VERSION,

        marketDate,

        cutoff,

        state,

        score,

        confidence,

        reasons: [
            ...reasons
        ],

        observations: {
            ...observations
        },

        metadata: {

            researchOnly:
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
