
/*
============================================================
TradeMind Pro

PMSE INDstocks Equity Historical Fetcher

Purpose:

Acquire historical 5-minute candles for
individual Indian equity stocks.

This module does NOT:
- rank stocks
- create signals
- trade
- place orders
- modify TradeMind strategy

Data acquisition layer only.
============================================================
*/


export const PMSE_EQUITY_FETCHER_VERSION =
    "PMSE-INDSTOCKS-EQUITY-FETCHER-V1";


const API_BASE =
    "https://api.indstocks.com";


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


function validateScripCode(scripCode) {

    if (
        typeof scripCode !== "string" ||
        scripCode.trim().length === 0
    ) {

        throw new Error(
            "scripCode is required"
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


function validateWindow(window) {

    if (
        !window ||
        typeof window !== "object"
    ) {

        throw new Error(
            "window is required"
        );

    }


    if (
        !Number.isFinite(
            window.startTime
        ) ||
        !Number.isFinite(
            window.endTime
        )
    ) {

        throw new Error(
            "window must contain numeric startTime and endTime"
        );

    }


    if (
        window.startTime >
        window.endTime
    ) {

        throw new Error(
            "window startTime must not be after endTime"
        );

    }

}


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


function buildHistoricalUrl({

    scripCode,

    startTime,

    endTime

}) {

    return (
        `${API_BASE}/market/historical/5minute` +
        `?scrip-codes=${encodeURIComponent(
            scripCode
        )}` +
        `&start_time=${startTime}` +
        `&end_time=${endTime}`
    );

}


export async function fetchEquityHistorical({

    symbol,

    scripCode,

    accessToken,

    window,

    fetcher = fetch

} = {}) {


    validateSymbol(
        symbol
    );


    validateScripCode(
        scripCode
    );


    validateAccessToken(
        accessToken
    );


    validateWindow(
        window
    );


    if (
        typeof fetcher !== "function"
    ) {

        throw new Error(
            "fetcher must be a function"
        );

    }


    const url =
        buildHistoricalUrl({

            scripCode,

            startTime:
                window.startTime,

            endTime:
                window.endTime

        });


    const response =
        await fetcher(

            url,

            {

                method:
                    "GET",

                headers: {

                    Authorization:
                        accessToken,

                    Accept:
                        "application/json"

                }

            }

        );


    if (
        !response ||
        typeof response !== "object"
    ) {

        throw new Error(
            "INDstocks returned an invalid response"
        );

    }


    if (
        response.ok === false
    ) {

        const error =
            new Error(
                `INDstocks equity historical API failed: HTTP ${response.status}`
            );

        error.httpStatus =
            response.status;

        throw error;

    }


    const payload =
        await response.json();


    const rawCandles =
        Array.isArray(
            payload
        )
            ? payload
            :
            Array.isArray(
                payload?.data
            )
                ? payload.data
                :
                Array.isArray(
                    payload?.candles
                )
                    ? payload.candles
                    :
                    [];


    const candles =
        rawCandles.map(
            normalizeCandle
        );


    return {

        version:
            PMSE_EQUITY_FETCHER_VERSION,

        symbol:
            symbol
                .trim()
                .toUpperCase(),

        candles,

        metadata: {

            source:
                "INDstocks",

            interval:
                "5minute",

            researchOnly:
                true,

            tradingEnabled:
                false,

            brokerCalled:
                false

        }

    };

}
