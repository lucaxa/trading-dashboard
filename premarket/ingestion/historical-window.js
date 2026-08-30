/*
============================================================
TradeMind Pro
PMSE M4.1 — Historical Research Window Contract
============================================================

Purpose:
Define and validate the historical research window used by
the PMSE historical research pipeline.

M4.1 defines:

    Historical date range
    5-minute interval
    Asia/Kolkata timezone
    NIFTY50 + BANKNIFTY coverage

This module does NOT fetch data.

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
No look-ahead.
============================================================
*/

export const PMSE_HISTORICAL_WINDOW_VERSION =
    "PMSE-M4.1-HISTORICAL-WINDOW-CONTRACT-V1";


const REQUIRED_INTERVAL =
    "5m";


const REQUIRED_TIMEZONE =
    "Asia/Kolkata";


const REQUIRED_INDICES = Object.freeze([
    "NIFTY50",
    "BANKNIFTY"
]);


function isValidDateString(value) {

    if (
        typeof value !== "string" ||
        value.length !== 10
    ) {

        return false;

    }


    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {

        return false;

    }


    const date =
        new Date(
            `${value}T00:00:00Z`
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return false;

    }


    return (
        date.toISOString()
            .slice(0, 10) === value
    );

}


function normalizeIndices(indices) {

    if (
        !Array.isArray(indices)
    ) {

        return [];

    }


    const unique =
        [
            ...new Set(
                indices
                    .filter(
                        value =>
                            typeof value === "string"
                    )
                    .map(
                        value =>
                            value.trim().toUpperCase()
                    )
            )
        ];


    return REQUIRED_INDICES
        .filter(
            index =>
                unique.includes(index)
        );

}


export function validateHistoricalWindow(window) {

    if (
        !window ||
        typeof window !== "object" ||
        Array.isArray(window)
    ) {

        return false;

    }


    if (
        !isValidDateString(
            window.startDate
        )
    ) {

        return false;

    }


    if (
        !isValidDateString(
            window.endDate
        )
    ) {

        return false;

    }


    if (
        window.startDate >
        window.endDate
    ) {

        return false;

    }


    if (
        window.interval !==
        REQUIRED_INTERVAL
    ) {

        return false;

    }


    if (
        window.timezone !==
        REQUIRED_TIMEZONE
    ) {

        return false;

    }


    if (
        !Array.isArray(
            window.indices
        )
    ) {

        return false;

    }


    const normalizedIndices =
        normalizeIndices(
            window.indices
        );


    if (
        normalizedIndices.length !==
        REQUIRED_INDICES.length
    ) {

        return false;

    }


    return REQUIRED_INDICES.every(
        index =>
            normalizedIndices.includes(
                index
            )
    );

}


export function createHistoricalWindow({

    startDate = null,

    endDate = null,

    interval = REQUIRED_INTERVAL,

    timezone = REQUIRED_TIMEZONE,

    indices = REQUIRED_INDICES

} = {}) {

    const normalizedIndices =
        normalizeIndices(
            indices
        );


    const window = {

        version:
            PMSE_HISTORICAL_WINDOW_VERSION,

        startDate,

        endDate,

        interval,

        timezone,

        indices:
            normalizedIndices,

        metadata: {

            researchOnly:
                true,

            lookAheadBiasAllowed:
                false,

            futureInformationUsedForDecision:
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


    if (
        !validateHistoricalWindow(
            window
        )
    ) {

        throw new Error(
            "invalid historical research window"
        );

    }


    return window;

}
