/*
============================================================
TradeMind Pro
PMSE M4.3 — INDstocks Historical Acquisition
============================================================

Purpose:
Acquire explicit historical NIFTY50 and BANKNIFTY data from
the existing INDstocks historical API.

This module is an acquisition boundary only.

It does NOT:
- evaluate market regime
- calculate trading signals
- create trades
- place orders
- modify research rules
- access the frontend
- touch the production trading backend
- use future information

Research only.
============================================================
*/

export const PMSE_INDSTOCKS_ACQUISITION_VERSION =
    "PMSE-M4.3-INDSTOCKS-HISTORICAL-ACQUISITION-V1";


const API_BASE =
    "https://api.indstocks.com";


const INDEX_CONFIG = Object.freeze({

    NIFTY50: {

        name:
            "NIFTY50",

        scripCode:
            "NIDX_40000001"

    },

    BANKNIFTY: {

        name:
            "BANKNIFTY",

        scripCode:
            "NIDX_40000003"

    }

});


function validateWindow(window) {

    if (
        !window ||
        typeof window !== "object"
    ) {

        throw new Error(
            "window is required"
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


function validateFetcher(fetcher) {

    if (
        typeof fetcher !== "function"
    ) {

        throw new Error(
            "fetcher is required"
        );

    }

}


function dateToStartOfDayMs(date) {

    return Date.parse(
        `${date}T00:00:00+05:30`
    );

}


function dateToEndOfDayMs(date) {

    return Date.parse(
        `${date}T23:59:59.999+05:30`
    );

}


function validateWindowDates(window) {

    const startTime =
        dateToStartOfDayMs(
            window.startDate
        );

    const endTime =
        dateToEndOfDayMs(
            window.endDate
        );


    if (
        !Number.isFinite(startTime) ||
        !Number.isFinite(endTime)
    ) {

        throw new Error(
            "window contains invalid dates"
        );

    }


    if (
        startTime > endTime
    ) {

        throw new Error(
            "window startDate must not be after endDate"
        );

    }


    return {

        startTime,

        endTime

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


async function fetchIndex({

    index,

    accessToken,

    startTime,

    endTime,

    fetcher

}) {

    const url =
        buildHistoricalUrl({

            scripCode:
                INDEX_CONFIG[index].scripCode,

            startTime,

            endTime

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
            `${index} acquisition returned an invalid response`
        );

    }


    return response;

}


export async function acquireHistoricalFromINDstocks({

    window,

    accessToken,

    fetcher

} = {}) {

    validateWindow(
        window
    );


    validateAccessToken(
        accessToken
    );


    validateFetcher(
        fetcher
    );


    const {
        startTime,
        endTime
    } =
        validateWindowDates(
            window
        );


    const nifty50 =
        await fetchIndex({

            index:
                "NIFTY50",

            accessToken,

            startTime,

            endTime,

            fetcher

        });


    const banknifty50 =
        await fetchIndex({

            index:
                "BANKNIFTY",

            accessToken,

            startTime,

            endTime,

            fetcher

        });


    return {

        version:
            PMSE_INDSTOCKS_ACQUISITION_VERSION,

        window:
            window,

        request: {

            startDate:
                window.startDate,

            endDate:
                window.endDate,

            interval:
                "5minute",

            timezone:
                "Asia/Kolkata",

            startTime,

            endTime,

            indices: [

                "NIFTY50",

                "BANKNIFTY"

            ]

        },

        responses: {

            nifty50,

            banknifty50,

            banknifty:
                banknifty50

        },

        metadata: {

            researchOnly:
                true,

            liveAcquisition:
                false,

            lookAheadBiasAllowed:
                false,

            futureInformationUsedForDecision:
                false,

            regimeEvaluated:
                false,

            tradeCreated:
                false,

            brokerCalled:
                false,

            productionBackendTouched:
                false,

            frontendTouched:
                false

        }

    };

}
