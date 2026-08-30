
/*
============================================================
TradeMind Pro

PMSE Stock Provider

Purpose:

Convert resolved PMSE equity instruments into
scanner-ready stock records using real historical data.

This module does NOT:
- trade
- create signals
- place orders

Data provider layer only.
============================================================
*/


import {
    fetchEquityHistorical
}
from "./indstocks-equity-fetcher.js";



export const PMSE_STOCK_PROVIDER_VERSION =
    "PMSE-STOCK-PROVIDER-V2";



function normalizeSymbol(symbol) {

    if (
        typeof symbol !== "string"
    ) {

        return null;

    }


    const clean =
        symbol
            .trim()
            .toUpperCase();


    return clean.length > 0
        ? clean
        : null;

}



export async function getPMSEStocks({

    symbols = [],

    instruments = [],

    accessToken,

    window,

    fetcher

} = {}) {


    if (
        !Array.isArray(symbols)
    ) {

        throw new Error(
            "symbols must be an array"
        );

    }


    if (
        !Array.isArray(instruments)
    ) {

        throw new Error(
            "instruments must be an array"
        );

    }



    const instrumentMap =
        new Map(
            instruments.map(
                instrument => [

                    normalizeSymbol(
                        instrument.symbol
                    ),

                    instrument.securityId

                ]
            )
        );



    const stocks = [];



    for (
        const rawSymbol of symbols
    ) {


        const symbol =
            normalizeSymbol(
                rawSymbol
            );


        if (
            !symbol
        ) {

            continue;

        }


        const securityId =
            instrumentMap.get(
                symbol
            );


        if (
            !securityId
        ) {

            continue;

        }



        const result =
            await fetchEquityHistorical({

                symbol,

                scripCode:
                    securityId,

                accessToken,

                window,

                fetcher

            });



        stocks.push({

            symbol:
                result.symbol,

            candles:
                result.candles

        });

    }



    return stocks;

}
