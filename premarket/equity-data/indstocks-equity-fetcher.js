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
    "PMSE-INDSTOCKS-EQUITY-FETCHER-V2";


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


function validateExchange(exchange) {

    if (
        typeof exchange !== "string" ||
        exchange.trim().length === 0
    ) {

        throw new Error(
            "exchange is required"
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
        !Number.isFinite(window.startTime) ||
        !Number.isFinite(window.endTime)
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


function buildEquityScripCode({

    exchange,

    scripCode

}) {

    return `${exchange}_${scripCode}`;

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


/*
============================================================
Extract candles from INDstocks response.

Supported response shapes:

1. Direct array
   {
       data: [...]
   }

2. Direct candles array
   {
       candles: [...]
   }

3. Keyed INDstocks response
   {
       data: {
           NSE_2885: {
               candles: [...]
           }
       }
   }

4. Keyed response where the instrument object
   itself is the candle container.
============================================================
*/

function extractRawCandles({

    payload,

    equityScripCode

}) {

    if (
        Array.isArray(payload)
    ) {

        return payload;

    }


    if (
        Array.isArray(payload?.candles)
    ) {

        return payload.candles;

    }


    if (
        Array.isArray(payload?.data)
    ) {

        return payload.data;

    }


    const instrumentData =
        payload?.data?.[equityScripCode];


    if (
        Array.isArray(
            instrumentData?.candles
        )
    ) {

        return instrumentData.candles;

    }


    if (
        Array.isArray(
            instrumentData
        )
    ) {

        return instrumentData;

    }


    return [];

}


export async function fetchEquityHistorical({

    symbol,

    scripCode,

    exchange,

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


    validateExchange(
        exchange
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


    const equityScripCode =
        buildEquityScripCode({

            exchange,
            scripCode

        });


    const url =
        buildHistoricalUrl({

            scripCode:
                equityScripCode,

            startTime:
                window.startTime,

            endTime:
                window.endTime

        });


    console.log(
        "PMSE HISTORICAL REQUEST",
        {
            exchange,
            scripCode,
            equityScripCode
        }
    );


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

        const errorText =
            await response.text();


        const error =
            new Error(
                `INDstocks equity historical API failed: HTTP ${response.status} ${errorText}`
            );


        error.httpStatus =
            response.status;


        throw error;

    }


    const payload =
        await response.json();


    const rawCandles =
        extractRawCandles({

            payload,

            equityScripCode

        });


    const candles =
        rawCandles.map(
            normalizeCandle
        );


    console.log(
        "PMSE HISTORICAL RESULT",
        {
            symbol:
                symbol
                    .trim()
                    .toUpperCase(),

            equityScripCode,

            candles:
                candles.length
        }
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
