import {
    createMarketRegime,
    REGIME_STATES
} from "./models.js";

import {
    PMSE_REGIME_CONFIG
} from "./config.js";


export function evaluateMarketRegime({

    marketDate,

    cutoff,

    observations = {}

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


    const nifty =
        observations["NIFTY 50"];

    const banknifty =
        observations["BANKNIFTY"];


    if (!nifty || !banknifty) {

        throw new Error(
            "NIFTY 50 and BANKNIFTY observations are required"
        );

    }


    const reasons = [];


    /*
     * Missing or invalid observations cannot be
     * interpreted as a favourable market regime.
     */

    if (
        nifty.valid !== true ||
        banknifty.valid !== true
    ) {

        if (
            nifty.valid !== true
        ) {

            reasons.push(
                "NIFTY 50 observation is invalid"
            );

        }


        if (
            banknifty.valid !== true
        ) {

            reasons.push(
                "BANKNIFTY observation is invalid"
            );

        }


        return createMarketRegime({

            marketDate,

            cutoff,

            state:
                REGIME_STATES.RED,

            score:
                0,

            confidence:
                0,

            reasons,

            observations

        });

    }


    const niftyReturn =
        Number(
            nifty.sessionReturn
        );


    const bankniftyReturn =
        Number(
            banknifty.sessionReturn
        );


    const niftyCloseLocation =
        Number(
            nifty.closeLocation
        );


    const bankniftyCloseLocation =
        Number(
            banknifty.closeLocation
        );


    const valuesValid =
        Number.isFinite(niftyReturn) &&
        Number.isFinite(bankniftyReturn) &&
        Number.isFinite(niftyCloseLocation) &&
        Number.isFinite(bankniftyCloseLocation);


    if (!valuesValid) {

        reasons.push(
            "Required regime measurements are invalid"
        );


        return createMarketRegime({

            marketDate,

            cutoff,

            state:
                REGIME_STATES.RED,

            score:
                0,

            confidence:
                0,

            reasons,

            observations

        });

    }


    const niftyBullish =
        nifty.direction === "UP" &&
        niftyReturn >=
            PMSE_REGIME_CONFIG.MIN_DIRECTIONAL_RETURN &&
        niftyCloseLocation >=
            PMSE_REGIME_CONFIG.MIN_CLOSE_LOCATION_UP;


    const bankniftyBullish =
        banknifty.direction === "UP" &&
        bankniftyReturn >=
            PMSE_REGIME_CONFIG.MIN_DIRECTIONAL_RETURN &&
        bankniftyCloseLocation >=
            PMSE_REGIME_CONFIG.MIN_CLOSE_LOCATION_UP;


    const niftyBearish =
        nifty.direction === "DOWN" &&
        niftyReturn <=
            -PMSE_REGIME_CONFIG.MIN_DIRECTIONAL_RETURN &&
        niftyCloseLocation <=
            PMSE_REGIME_CONFIG.MAX_CLOSE_LOCATION_DOWN;


    const bankniftyBearish =
        banknifty.direction === "DOWN" &&
        bankniftyReturn <=
            -PMSE_REGIME_CONFIG.MIN_DIRECTIONAL_RETURN &&
        bankniftyCloseLocation <=
            PMSE_REGIME_CONFIG.MAX_CLOSE_LOCATION_DOWN;


    let state =
        REGIME_STATES.CAUTION;


    let score =
        0.5;


    if (
        niftyBullish &&
        bankniftyBullish
    ) {

        state =
            REGIME_STATES.GREEN;

        score =
            1;

        reasons.push(
            "NIFTY 50 shows bullish session structure"
        );

        reasons.push(
            "BANKNIFTY shows bullish session structure"
        );

        reasons.push(
            "Both major indices are directionally aligned"
        );

    }

    else if (
        niftyBearish &&
        bankniftyBearish
    ) {

        state =
            REGIME_STATES.RED;

        score =
            0;

        reasons.push(
            "NIFTY 50 shows bearish session structure"
        );

        reasons.push(
            "BANKNIFTY shows bearish session structure"
        );

        reasons.push(
            "Both major indices are directionally aligned negatively"
        );

    }

    else {

        state =
            REGIME_STATES.CAUTION;

        score =
            0.5;

        reasons.push(
            "NIFTY 50 and BANKNIFTY do not show aligned directional structure"
        );

    }


    return createMarketRegime({

        marketDate,

        cutoff,

        state,

        score,

        confidence:
            score,

        reasons,

        observations

    });

}
