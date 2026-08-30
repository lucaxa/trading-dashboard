/*
============================================================
TradeMind Pro
PMSE M3.4 — Historical Data Adapter
============================================================

Purpose:
Adapt an already-fetched historical API response into the
PMSE M3.3 historical dataset contract.

Architecture:

    HISTORICAL API RESPONSE
             ↓
       M3.4 ADAPTER
             ↓
    M3.3 NORMALIZATION
             ↓
       HISTORICAL DATASET
             ↓
       M3.2 REPLAY

This module does NOT:

- evaluate the market regime
- use future information for a decision
- create trades
- call a broker
- touch the frontend
- modify production trading logic

Research only.
============================================================
*/

import {
    createHistoricalDatasetInput
} from "./historical-contract.js";


export const PMSE_ADAPTER_VERSION =
    "PMSE-M3.4-HISTORICAL-ADAPTER-V1";


function extractCandles(payload) {

    if (
        Array.isArray(payload)
    ) {

        return payload;

    }


    if (
        Array.isArray(payload?.candles)
    ) {

        return payload.candles;

    }


    if (
        Array.isArray(payload?.data?.candles)
    ) {

        return payload.data.candles;

    }


    if (
        Array.isArray(payload?.data)
    ) {

        return payload.data;

    }


    return [];

}


export function adaptHistoricalDatasetInput({

    marketDate,

    niftyResponse = [],

    bankniftyResponse = []

} = {}) {

    if (
        !marketDate
    ) {

        throw new Error(
            "marketDate is required"
        );

    }


    const niftyCandles =
        extractCandles(
            niftyResponse
        );


    const bankniftyCandles =
        extractCandles(
            bankniftyResponse
        );


    const dataset =
        createHistoricalDatasetInput({

            marketDate,

            niftyCandles,

            bankniftyCandles

        });


    return {

        ...dataset,

        metadata: {

            adapterVersion:
                PMSE_ADAPTER_VERSION,

            researchOnly:
                true,

            fetchedByAdapter:
                true,

            regimeEvaluated:
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