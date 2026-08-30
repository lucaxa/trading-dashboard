/*
============================================================
TradeMind Pro

PMSE INDstocks Equity Data Provider

Purpose:

Convert INDstocks historical stock data
into PMSE stock data format.

This module does NOT:
- rank stocks
- create signals
- trade
- place orders

Data provider only.
============================================================
*/


import {
    createStockDataRecord
}
from "./stock-data-collector.js";



export const PMSE_INDSTOCKS_PROVIDER_VERSION =
    "PMSE-INDSTOCKS-EQUITY-PROVIDER-V1";



function normalizeCandle(candle) {


    return {

        ts:
            candle.ts ??
            candle.timestamp ??
            null,


        o:
            candle.o ??
            candle.open ??
            null,


        h:
            candle.h ??
            candle.high ??
            null,


        l:
            candle.l ??
            candle.low ??
            null,


        c:
            candle.c ??
            candle.close ??
            null,


        v:
            candle.v ??
            candle.volume ??
            null

    };

}



function validateSymbol(symbol) {

    if (
        typeof symbol !== "string" ||
        symbol.trim().length === 0
    ) {

        throw new Error(
            "symbol is required"
        );

    }

}



function validateCandles(candles) {

    if (
        !Array.isArray(candles)
    ) {

        throw new Error(
            "candles must be an array"
        );

    }

}



export function createINDstocksEquityRecord({

    symbol,

    candles = []

} = {}) {


    validateSymbol(
        symbol
    );


    validateCandles(
        candles
    );


    const normalizedCandles =
        candles.map(
            normalizeCandle
        );


    const record =
        createStockDataRecord({

            symbol,

            candles:
                normalizedCandles

        });



    return {

        ...record,


        version:
            PMSE_INDSTOCKS_PROVIDER_VERSION,


        metadata: {

            ...record.metadata,


            source:
                "INDstocks",

            researchOnly:
                true

        }

    };

}
