/*
============================================================
TradeMind Pro

PMSE Stock Data Collector

Purpose:

Collect and normalize stock market data
for pre-market ranking.

This module does NOT:
- create trades
- place orders
- generate signals
- call broker execution

Scanning layer only.
============================================================
*/


export const PMSE_STOCK_DATA_VERSION =
    "PMSE-STOCK-DATA-COLLECTOR-V1";



export function createStockDataRecord({

    symbol,

    candles = []

} = {}) {


    if (
        typeof symbol !== "string" ||
        symbol.trim().length === 0
    ) {

        throw new Error(
            "symbol is required"
        );

    }


    if (
        !Array.isArray(candles)
    ) {

        throw new Error(
            "candles must be an array"
        );

    }



    return {

        version:
            PMSE_STOCK_DATA_VERSION,


        symbol:
            symbol
                .trim()
                .toUpperCase(),


        candles,


        metadata: {

            researchOnly:
                true,

            tradingEnabled:
                false,

            brokerCalled:
                false,

            signalCreated:
                false

        }

    };

}
