/*
============================================================
TradeMind Pro
PMSE M4.4 — Historical Data Quality Audit
============================================================

Purpose:
Audit acquired INDstocks historical data before it enters
the PMSE research pipeline.

This module audits data integrity.

It does NOT:
- normalize data
- repair data
- remove bad candles
- evaluate regime
- calculate trading signals
- create trades
- place orders
- access frontend
- touch production backend
- acquire live data

Research only.
============================================================
*/

export const PMSE_HISTORICAL_AUDIT_VERSION =
    "PMSE-M4.4-HISTORICAL-DATA-AUDIT-V1";


const REQUIRED_INDICES = Object.freeze([
    "NIFTY50",
    "BANKNIFTY"
]);


const REQUIRED_INTERVAL =
    "5minute";


const REQUIRED_TIMEZONE =
    "Asia/Kolkata";


function validateAcquisition(acquisition) {

    if (
        !acquisition ||
        typeof acquisition !== "object"
    ) {

        throw new Error(
            "acquisition is required"
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


function validateWindowDefinition(window) {

    if (
        window.interval !== REQUIRED_INTERVAL
    ) {

        throw new Error(
            "window interval must be 5minute"
        );

    }


    if (
        window.timezone !== REQUIRED_TIMEZONE
    ) {

        throw new Error(
            "window timezone must be Asia/Kolkata"
        );

    }


    if (
        !Array.isArray(window.indices)
    ) {

        throw new Error(
            "window indices must be an array"
        );

    }


    for (
        const index of REQUIRED_INDICES
    ) {

        if (
            !window.indices.includes(index)
        ) {

            throw new Error(
                `${index} is required in window`
            );

        }

    }


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


function extractCandles(response) {

    if (
        !response ||
        typeof response !== "object"
    ) {

        return [];
    }


    const candidates = [

        response
            ?.data
            ?.candles,

        response
            ?.candles,

        response
            ?.data

    ];


    for (
        const candidate of candidates
    ) {

        if (
            Array.isArray(candidate)
        ) {

            return candidate;
        }

    }


    return [];

}


function getTimestamp(candle) {

    if (
        !candle ||
        typeof candle !== "object"
    ) {

        return null;
    }


    const value =
        candle.ts ??
        candle.timestamp ??
        candle.time;


    if (
        typeof value === "number" &&
        Number.isFinite(value)
    ) {

        return value;
    }


    if (
        typeof value === "string" &&
        value.length > 0
    ) {

        const parsed =
            Number(value);

        if (
            Number.isFinite(parsed)
        ) {

            return parsed;
        }


        const date =
            Date.parse(value);

        if (
            Number.isFinite(date)
        ) {

            return date;
        }

    }


    return null;

}


function normalizeTimestampMs(timestamp) {

    if (
        !Number.isFinite(timestamp)
    ) {

        return null;
    }


    /*
    INDstocks timestamps may be represented
    in seconds or milliseconds.

    Values below 1e12 are interpreted
    as Unix seconds.
    */

    if (
        Math.abs(timestamp) < 1e12
    ) {

        return timestamp * 1000;
    }


    return timestamp;

}


function numericValue(value) {

    if (
        typeof value === "number" &&
        Number.isFinite(value)
    ) {

        return value;
    }


    if (
        typeof value === "string" &&
        value.trim() !== ""
    ) {

        const parsed =
            Number(value);

        if (
            Number.isFinite(parsed)
        ) {

            return parsed;
        }

    }


    return null;

}


function auditIndex({

    index,

    response,

    startTime,

    endTime

}) {

    if (
        !response ||
        typeof response !== "object"
    ) {

        throw new Error(
            `${index} response is required`
        );

    }


    const candles =
        extractCandles(
            response
        );


    let invalidTimestamps = 0;

    let outOfWindow = 0;

    let invalidOHLC = 0;

    let duplicateTimestamps = 0;

    let chronological = true;


    const timestampCounts =
        new Map();


    let previousTimestamp =
        null;


    for (
        const candle of candles
    ) {

        const rawTimestamp =
            getTimestamp(
                candle
            );


        const timestamp =
            normalizeTimestampMs(
                rawTimestamp
            );


        if (
            timestamp === null ||
            !Number.isFinite(timestamp)
        ) {

            invalidTimestamps += 1;

            continue;

        }


        const count =
            timestampCounts.get(
                timestamp
            ) || 0;


        timestampCounts.set(
            timestamp,
            count + 1
        );


        if (
            count > 0
        ) {

            duplicateTimestamps += 1;

        }


        if (
            timestamp < startTime ||
            timestamp > endTime
        ) {

            outOfWindow += 1;

        }


        if (
            previousTimestamp !== null &&
            timestamp < previousTimestamp
        ) {

            chronological = false;

        }


        previousTimestamp =
            timestamp;


        const open =
            numericValue(
                candle.o ??
                candle.open
            );


        const high =
            numericValue(
                candle.h ??
                candle.high
            );


        const low =
            numericValue(
                candle.l ??
                candle.low
            );


        const close =
            numericValue(
                candle.c ??
                candle.close
            );


        if (
            open === null ||
            high === null ||
            low === null ||
            close === null ||
            high < Math.max(open, close) ||
            low > Math.min(open, close) ||
            high < low
        ) {

            invalidOHLC += 1;

        }

    }


    const valid =
        candles.length > 0 &&
        invalidTimestamps === 0 &&
        outOfWindow === 0 &&
        invalidOHLC === 0 &&
        duplicateTimestamps === 0 &&
        chronological;


    return {

        index,

        candleCount:
            candles.length,

        chronological,

        invalidTimestamps,

        outOfWindow,

        invalidOHLC,

        duplicateTimestamps,

        valid

    };

}


export function auditHistoricalAcquisition(

    acquisition

) {

    validateAcquisition(
        acquisition
    );


    validateWindow(
        acquisition.window
    );


    const {
        startTime,
        endTime
    } =
        validateWindowDefinition(
            acquisition.window
        );


    if (
        !acquisition.responses ||
        typeof acquisition.responses !== "object"
    ) {

        throw new Error(
            "responses are required"
        );

    }


    if (
        !acquisition.responses.nifty50
    ) {

        throw new Error(
            "NIFTY50 response is required"
        );

    }


    if (
        !acquisition.responses.banknifty50
    ) {

        throw new Error(
            "BANKNIFTY response is required"
        );

    }


    const nifty50 =
        auditIndex({

            index:
                "NIFTY50",

            response:
                acquisition.responses.nifty50,

            startTime,

            endTime

        });


    const banknifty =
        auditIndex({

            index:
                "BANKNIFTY",

            response:
                acquisition.responses.banknifty50,

            startTime,

            endTime

        });


    const valid =
        nifty50.valid &&
        banknifty.valid;


    return {

        version:
            PMSE_HISTORICAL_AUDIT_VERSION,

        valid,

        status:
            valid
                ? "PASS"
                : "FAIL",

        window: {

            startDate:
                acquisition.window.startDate,

            endDate:
                acquisition.window.endDate,

            interval:
                acquisition.window.interval,

            timezone:
                acquisition.window.timezone

        },

        indices: {

            NIFTY50:
                nifty50,

            BANKNIFTY:
                banknifty

        },

        metadata: {

            researchOnly:
                true,

            acquisitionPerformed:
                false,

            dataRepaired:
                false,

            dataNormalized:
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
