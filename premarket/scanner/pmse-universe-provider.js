
/*
============================================================
TradeMind Pro

PMSE Universe Provider

Purpose:

Provide the stock list scanned by PMSE.

This module does NOT:
- trade
- create signals
- place orders

Universe supply layer only.
============================================================
*/


import {
    createEquityUniverse
}
from "./equity-universe.js";



export const PMSE_UNIVERSE_PROVIDER_VERSION =
    "PMSE-EQUITY-UNIVERSE-PROVIDER-V1";



const DEFAULT_PMSE_SYMBOLS = [

    "RELIANCE",
    "INFY",
    "HDFCBANK",
    "ICICIBANK",
    "TCS",
    "SBIN",
    "ITC",
    "LT",
    "AXISBANK",
    "BHARTIARTL"

];



export function getPMSEUniverse(){


    return {

        version:
            PMSE_UNIVERSE_PROVIDER_VERSION,


        universe:
            createEquityUniverse({

                symbols:
                    DEFAULT_PMSE_SYMBOLS

            }),


        metadata: {

            researchOnly:
                true,

            tradingEnabled:
                false,

            brokerCalled:
                false

        }

    };

}
