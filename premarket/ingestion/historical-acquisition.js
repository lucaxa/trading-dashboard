/*
============================================================
TradeMind Pro
PMSE M4.2 — Historical Data Acquisition Boundary
============================================================

Purpose:
Define the boundary between the validated M4.1 historical
research window and supplied historical market data.

This module does NOT fetch data.

It accepts historical responses supplied by an external
acquisition layer and validates that they belong to the
requested research window.

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
No live-data acquisition.
No look-ahead.
============================================================
*/

import {
    validateHistoricalWindow
} from "./historical-window.js";


export const PMSE_HISTORICAL_ACQUISITION_VERSION =
    "PMSE-M4.2-HISTORICAL-DATA-ACQUISITION-BOUNDARY-V1";


function clone(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return value;

    }


    if (
        typeof structuredClone === "function"
    ) {

        return structuredClone(value);

    }


    return JSON.parse(
        JSON.stringify(value)
    );

}


function validateResponses(responses) {

    if (
        !responses ||
        typeof responses !== "object" ||
        Array.isArray(responses)
    ) {

        throw new Error(
            "responses must be an object"
        );

    }


    if (
        !responses.NIFTY50
    ) {

        throw new Error(
            "NIFTY50 response is required"
        );

    }


    if (
        !responses.BANKNIFTY
    ) {

        throw new Error(
            "BANKNIFTY response is required"
        );

    }

}


function validateResponseShape(response, index) {

    if (
        !response ||
        typeof response !== "object" ||
        Array.isArray(response)
    ) {

        throw new Error(
            `${index} response must be an object`
        );

    }


    if (
        !Array.isArray(
            response.candles
        )
    ) {

        throw new Error(
            `${index} response candles must be an array`
        );

    }

}


export function acquireHistoricalData({

    window = null,

    responses = null

} = {}) {

    if (
        !validateHistoricalWindow(
            window
        )
    ) {

        throw new Error(
            "valid historical window is required"
        );

    }


    validateResponses(
        responses
    );


    validateResponseShape(
        responses.NIFTY50,
        "NIFTY50"
    );


    validateResponseShape(
        responses.BANKNIFTY,
        "BANKNIFTY"
    );


    return {

        version:
            PMSE_HISTORICAL_ACQUISITION_VERSION,

        window:
            clone(window),

        startDate:
            window.startDate,

        endDate:
            window.endDate,

        interval:
            window.interval,

        timezone:
            window.timezone,

        indices: [
            ...window.indices
        ],

        responses:
            clone(responses),

        metadata: {

            researchOnly:
                true,

            acquisitionBoundaryOnly:
                true,

            liveDataRequested:
                false,

            lookAheadBiasAllowed:
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
