/*
============================================================
TradeMind Pro

PMSE Stock Feature Extractor

Purpose:

Convert stock candles into measurable features.

This module does NOT:
- rank stocks
- create signals
- trade
- place orders

Measurement layer only.
============================================================
*/


export const PMSE_FEATURE_VERSION =
    "PMSE-STOCK-FEATURE-EXTRACTOR-V1";



function percentageChange(
    first,
    last
) {

    if (
        !Number.isFinite(first) ||
        !Number.isFinite(last) ||
        first === 0
    ) {

        return 0;

    }


    return (
        (
            last - first
        )
        /
        first
    )
    *
    100;

}



function averageVolume(
    candles
) {

    if (
        candles.length === 0
    ) {

        return 0;

    }


    const total =
        candles.reduce(
            (
                sum,
                candle
            ) =>
                sum +
                (
                    candle.v || 0
                ),
            0
        );


    return (
        total /
        candles.length
    );

}



function calculateRange(
    candles
) {

    if (
        candles.length === 0
    ) {

        return 0;

    }


    const highs =
        candles.map(
            candle =>
                candle.h
        );


    const lows =
        candles.map(
            candle =>
                candle.l
        );


    return (

        Math.max(...highs)
        -
        Math.min(...lows)

    );

}



export function extractStockFeatures({

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
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        throw new Error(
            "candles are required"
        );

    }



    const first =
        candles[0].c;


    const last =
        candles[
            candles.length - 1
        ].c;



    const avgVolume =
        averageVolume(
            candles
        );


    const latestVolume =
        candles[
            candles.length - 1
        ].v || 0;



    return {

        version:
            PMSE_FEATURE_VERSION,


        symbol:
            symbol
                .trim()
                .toUpperCase(),


        features: {

            priceChangePct:
                percentageChange(
                    first,
                    last
                ),


            volumeRatio:
                avgVolume === 0
                    ? 0
                    :
                    latestVolume /
                    avgVolume,


            range:
                calculateRange(
                    candles
                )

        },


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
