/*
============================================================
TradeMind Pro

PMSE TradeMind Input Contract

Purpose:

Convert PMSE selected candidates into
a stable format consumed by TradeMind Pro.

This module does NOT:
- trade
- create orders
- generate signals

Integration contract only.
============================================================
*/


export const PMSE_OUTPUT_VERSION =
    "PMSE-TRADEMIND-INPUT-CONTRACT-V1";



export function createTradeMindInput({

    selectedCandidates = []

} = {}) {


    if (
        !Array.isArray(selectedCandidates)
    ) {

        throw new Error(
            "selectedCandidates must be an array"
        );

    }



    return {

        version:
            PMSE_OUTPUT_VERSION,


        source:
            "PMSE",


        mode:
            "PAPER_ONLY",


        candidates:
            selectedCandidates
                .slice(0,3)
                .map(
                    candidate => ({

                        symbol:
                            candidate.symbol
                                .trim()
                                .toUpperCase(),

                        score:
                            candidate.score ?? null,

                        newsRisk:
                            candidate.newsRisk ||
                            "LOW"

                    })
                ),


        metadata: {

            researchOnly:
                true,

            tradeCreated:
                false,

            brokerCalled:
                false,

            frontendTouched:
                false

        }

    };

}
