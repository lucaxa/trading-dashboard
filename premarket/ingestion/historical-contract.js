/*
============================================================
TradeMind Pro
PMSE M3.3 — Historical Data Ingestion Contract
============================================================

Purpose:
Define and validate the normalized historical-candle contract
consumed by the PMSE historical replay engine.

This module does NOT fetch data.

It defines the boundary between:

    RAW HISTORICAL DATA
            ↓
    NORMALIZED CANDLES
            ↓
    M3.2 HISTORICAL REPLAY

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
============================================================
*/


export const PMSE_INGESTION_VERSION =
    "PMSE-M3.3-HISTORICAL-INGESTION-CONTRACT-V1";


function numberOrNull(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return null;

    }


    const number =
        Number(value);


    return Number.isFinite(number)
        ? number
        : null;

}


export function createHistoricalCandle({

    ts = null,

    open = null,

    high = null,

    low = null,

    close = null,

    volume = null

} = {}) {

    return {

        ts,

        open,

        high,

        low,

        close,

        volume

    };

}


export function validateHistoricalCandle(candle) {

    if (
        !candle ||
        typeof candle !== "object"
    ) {

        return false;

    }


    if (
        !Number.isFinite(
            numberOrNull(candle.ts)
        )
    ) {

        return false;

    }


    if (
        numberOrNull(candle.open) === null
    ) {

        return false;

    }


    if (
        numberOrNull(candle.high) === null
    ) {

        return false;

    }


    if (
        numberOrNull(candle.low) === null
    ) {

        return false;

    }


    if (
        numberOrNull(candle.close) === null
    ) {

        return false;

    }


    return true;

}


export function normalizeHistoricalCandles(

    candles = []

) {

    if (
        !Array.isArray(candles)
    ) {

        throw new Error(
            "candles must be an array"
        );

    }


    return candles

        .map(
            candle =>
                createHistoricalCandle({

                    ts:
                        numberOrNull(
                            candle?.ts ??
                            candle?.timestamp ??
                            candle?.time
                        ),

                    open:
                        numberOrNull(
                            candle?.open ??
                            candle?.o
                        ),

                    high:
                        numberOrNull(
                            candle?.high ??
                            candle?.h
                        ),

                    low:
                        numberOrNull(
                            candle?.low ??
                            candle?.l
                        ),

                    close:
                        numberOrNull(
                            candle?.close ??
                            candle?.c
                        ),

                    volume:
                        numberOrNull(
                            candle?.volume ??
                            candle?.v
                        )

                })
        )

        .filter(
            validateHistoricalCandle
        )

        .sort(
            (a, b) =>
                a.ts - b.ts
        );

}


export function createHistoricalDatasetInput({

    marketDate = null,

    niftyCandles = [],

    bankniftyCandles = []

} = {}) {

    if (!marketDate) {

        throw new Error(
            "marketDate is required"
        );

    }


    return {

        marketDate,

        niftyCandles:
            normalizeHistoricalCandles(
                niftyCandles
            ),

        bankniftyCandles:
            normalizeHistoricalCandles(
                bankniftyCandles
            )

    };

}