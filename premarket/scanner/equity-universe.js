/*
============================================================
TradeMind Pro
PMSE Equity Universe Scanner

Purpose:

Create the stock universe used for
pre-market candidate selection.

This module does NOT:
- trade
- create signals
- place orders
- predict prices

Scanning foundation only.
============================================================
*/


export const PMSE_UNIVERSE_VERSION =
    "PMSE-EQUITY-UNIVERSE-V1";



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



export function createEquityUniverse({

    symbols = []

} = {}) {


    if (
        !Array.isArray(symbols)
    ) {

        throw new Error(
            "symbols must be an array"
        );

    }


    const normalized =
        symbols
            .map(
                normalizeSymbol
            )
            .filter(
                Boolean
            );


    const unique =
        [
            ...new Set(
                normalized
            )
        ];



    return {

        version:
            PMSE_UNIVERSE_VERSION,


        totalSymbols:
            unique.length,


        symbols:
            unique,


        metadata: {

            researchOnly:
                true,

            tradingEnabled:
                false,

            brokerCalled:
                false,

            frontendTouched:
                false

        }

    };

}
