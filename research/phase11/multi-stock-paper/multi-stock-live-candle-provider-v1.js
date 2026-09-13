/*
============================================================
TradeMind Pro

A11 Multi-Stock Live Candle Provider

Version:
A11-MULTI-STOCK-LIVE-CANDLE-PROVIDER-V1

Purpose:

Acquire the latest 5-minute market candles for the
four-stock paper universe.

This module does NOT:
- generate signals
- create paper trades
- modify strategy
- learn
- optimize
- call brokers
- create orders

Data acquisition only.
============================================================
*/

import {
    fetchEquityHistorical
} from "../../../premarket/equity-data/indstocks-equity-fetcher.js";


export const MULTI_STOCK_LIVE_CANDLE_PROVIDER_VERSION =
    "A11-MULTI-STOCK-LIVE-CANDLE-PROVIDER-V1";


const FIVE_MINUTES_MS =
    5 * 60 * 1000;


function validateInstruments(instruments) {

    if (
        !Array.isArray(instruments) ||
        instruments.length !== 4
    ) {

        throw new Error(
            "Exactly four instruments are required"
        );

    }

}


function validateNow(nowMs) {

    if (
        !Number.isFinite(nowMs)
    ) {

        throw new Error(
            "nowMs must be finite"
        );

    }

}


function validateAccessToken(accessToken) {

    if (
        typeof accessToken !== "string" ||
        accessToken.length === 0
    ) {

        throw new Error(
            "accessToken is required"
        );

    }

}


function normalizeInstrument(instrument) {

    if (
        !instrument ||
        typeof instrument !== "object"
    ) {

        throw new Error(
            "Invalid instrument"
        );

    }


    const symbol =
        typeof instrument.symbol === "string"
            ? instrument.symbol.trim().toUpperCase()
            : "";


    const securityId =
        instrument.securityId !== undefined &&
        instrument.securityId !== null
            ? String(
                instrument.securityId
            ).trim()
            : "";


    const exchange =
        typeof instrument.exchange === "string"
            ? instrument.exchange.trim().toUpperCase()
            : "";


    const segment =
        typeof instrument.segment === "string"
            ? instrument.segment.trim().toUpperCase()
            : "";


    if (
        !symbol ||
        !securityId ||
        !exchange ||
        !segment
    ) {

        throw new Error(
            `Incomplete instrument identity: ${symbol || "UNKNOWN"}`
        );

    }


    return {

        ...instrument,

        symbol,

        securityId,

        exchange,

        segment

    };

}


function isCompletedFiveMinuteCandle(
    candle,
    nowMs
) {

    if (
        !candle ||
        !Number.isFinite(
            Number(candle.ts)
        )
    ) {

        return false;

    }


    const ts =
        Number(candle.ts);


    if (
        ts >= nowMs
    ) {

        return false;

    }


    const bucketEnd =
        ts -
        (
            ts %
            FIVE_MINUTES_MS
        ) +
        FIVE_MINUTES_MS;


    return bucketEnd <= nowMs;

}


function normalizeCandle(candle) {

    return {

        ts:
            Number(candle.ts),

        o:
            Number(candle.o),

        h:
            Number(candle.h),

        l:
            Number(candle.l),

        c:
            Number(candle.c),

        v:
            Number(candle.v ?? 0)

    };

}


function isValidCandle(candle) {

    return (

        Number.isFinite(candle.ts) &&

        Number.isFinite(candle.o) &&

        Number.isFinite(candle.h) &&

        Number.isFinite(candle.l) &&

        Number.isFinite(candle.c) &&

        Number.isFinite(candle.v)

    );

}


function sanitizeCandles(
    candles,
    nowMs
) {

    if (
        !Array.isArray(candles)
    ) {

        return [];

    }


    const unique =
        new Map();


    for (
        const rawCandle of candles
    ) {

        const candle =
            normalizeCandle(
                rawCandle
            );


        if (
            !isValidCandle(candle)
        ) {

            continue;

        }


        if (
            !isCompletedFiveMinuteCandle(
                candle,
                nowMs
            )
        ) {

            continue;

        }


        unique.set(
            candle.ts,
            candle
        );

    }


    return Array.from(
        unique.values()
    )
        .sort(
            (a, b) =>
                a.ts -
                b.ts
        );

}


function createResearchWindow(nowMs) {

    return {

        startTime:
            nowMs -
            (
                7 *
                24 *
                60 *
                60 *
                1000
            ),

        endTime:
            nowMs

    };

}


async function fetchInstrumentCandles({

    instrument,

    accessToken,

    nowMs,

    fetcher

}) {

    const result =
        await fetchEquityHistorical({

            symbol:
                instrument.symbol,

            scripCode:
                instrument.securityId,

            exchange:
                instrument.exchange,

            accessToken,

            window:
                createResearchWindow(
                    nowMs
                ),

            fetcher

        });


    return {

        symbol:
            instrument.symbol,

        candles:
            sanitizeCandles(
                result.candles,
                nowMs
            )

    };

}


export async function fetchMultiStockLiveCandles({

    instruments = [],

    nowMs,

    accessToken,

    fetcher = fetch

} = {}) {

    validateInstruments(
        instruments
    );


    validateNow(
        nowMs
    );


    validateAccessToken(
        accessToken
    );


    if (
        typeof fetcher !== "function"
    ) {

        throw new Error(
            "fetcher must be a function"
        );

    }


    const normalizedInstruments =
        instruments.map(
            normalizeInstrument
        );


    const stocks = [];


    for (
        const instrument of
            normalizedInstruments
    ) {

        const result =
            await fetchInstrumentCandles({

                instrument,

                accessToken,

                nowMs,

                fetcher

            });


        stocks.push({

            symbol:
                result.symbol,

            candles:
                result.candles

        });

    }


    return {

        version:
            MULTI_STOCK_LIVE_CANDLE_PROVIDER_VERSION,

        status:
            "READY",

        mode:
            "PAPER_ONLY",

        researchOnly:
            true,

        tradingEnabled:
            false,

        brokerCalled:
            false,

        orderCreationEnabled:
            false,

        learningEnabled:
            false,

        strategyMutation:
            false,

        optimizationEnabled:
            false,

        promotionEnabled:
            false,

        stocks

    };

}
