/*
============================================================
TradeMind Pro

PMSE News Risk Filter

Purpose:

Apply external event risk flags
to ranked equity candidates.

This module does NOT:
- predict prices
- create signals
- trade
- place orders

Risk filtering layer only.
============================================================
*/


export const PMSE_NEWS_FILTER_VERSION =
    "PMSE-NEWS-RISK-FILTER-V1";




function normalizeRisk(
    risk
) {

    if (
        typeof risk !== "string"
    ) {

        return "LOW";

    }


    return risk
        .trim()
        .toUpperCase();

}




export function applyNewsRiskFilter({

    candidates = []

} = {}) {


    if (
        !Array.isArray(candidates)
    ) {

        throw new Error(
            "candidates must be an array"
        );

    }



    const approved = [];

    const blocked = [];



    for (
        const candidate of candidates
    ) {


        const risk =
            normalizeRisk(
                candidate.newsRisk
            );



        if (
            risk === "HIGH"
        ) {

            blocked.push({

                symbol:
                    candidate.symbol
                        .trim()
                        .toUpperCase(),

                reason:
                    "HIGH_NEWS_RISK"

            });


            continue;

        }



        approved.push({

            symbol:
                candidate.symbol
                    .trim()
                    .toUpperCase(),

            score:
                candidate.score,

            newsRisk:
                risk

        });


    }



    return {

        version:
            PMSE_NEWS_FILTER_VERSION,


        approved,

        blocked,


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
