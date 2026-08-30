/*
============================================================
TradeMind Pro

PMSE Pipeline Runner

Purpose:

Execute the PMSE pre-market selection flow.

This module does NOT:
- trade
- create orders
- call broker
- generate signals

Pipeline orchestration only.
============================================================
*/


import {
    extractStockFeatures
}
from "../features/stock-feature-extractor.js";


import {
    rankCandidates
}
from "../ranking/candidate-ranking-engine.js";


import {
    applyNewsRiskFilter
}
from "../news/news-risk-filter.js";


import {
    selectFinalCandidates
}
from "../selection/final-candidate-selector.js";


import {
    createTradeMindInput
}
from "../output/trademind-input-contract.js";



export const PMSE_RUNNER_VERSION =
    "PMSE-RUNNER-V1";




export function runPMSE({

    stocks = []

} = {}) {


    if (
        !Array.isArray(stocks)
    ) {

        throw new Error(
            "stocks must be an array"
        );

    }



    const features =
        stocks.map(
            stock => (

                extractStockFeatures({

                    symbol:
                        stock.symbol,

                    candles:
                        stock.candles

                })

            )
        );



    const ranked =
        rankCandidates({

            stocks:
                features.map(
                    item => ({

                        symbol:
                            item.symbol,

                        features:
                            item.features

                    })
                )

        });



    const newsFiltered =
        applyNewsRiskFilter({

            candidates:
                ranked.candidates

        });



    const selected =
        selectFinalCandidates({

            candidates:
                newsFiltered.approved

        });



    const output =
        createTradeMindInput({

            selectedCandidates:
                selected.selected

        });



    return {

        version:
            PMSE_RUNNER_VERSION,


        output,


        metadata: {

            researchOnly:
                true,

            tradeCreated:
                false,

            brokerCalled:
                false

        }

    };

}
