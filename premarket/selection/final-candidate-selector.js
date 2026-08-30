/*
============================================================
TradeMind Pro

PMSE Final Candidate Selector

Purpose:

Select final equity candidates
for TradeMind Pro.

Output:
Maximum 3 stocks.

This module does NOT:
- trade
- create orders
- generate signals
- predict prices

Selection output only.
============================================================
*/


export const PMSE_SELECTION_VERSION =
    "PMSE-FINAL-CANDIDATE-SELECTOR-V1";



export function selectFinalCandidates({

    candidates = [],

    limit = 3

} = {}) {


    if (
        !Array.isArray(candidates)
    ) {

        throw new Error(
            "candidates must be an array"
        );

    }



    const selected =
        candidates
            .slice(
                0,
                limit
            )
            .map(
                candidate => ({

                    symbol:
                        candidate.symbol
                            .trim()
                            .toUpperCase(),

                    score:
                        candidate.score,

                    newsRisk:
                        candidate.newsRisk || "LOW"

                })
            );



    return {

        version:
            PMSE_SELECTION_VERSION,


        selected,


        metadata: {

            researchOnly:
                true,

            tradingEnabled:
                false,

            signalCreated:
                false,

            brokerCalled:
                false

        }

    };

}
