/*
============================================================
TradeMind Pro
PMSE M3 — Historical Regime Study
============================================================

Purpose:
Aggregate completed M2.5 regime/outcome research records.

M3 does NOT change regime evaluation.

It only measures whether GREEN / CAUTION / RED
historically produced different forward outcomes.

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
============================================================
*/

import {
    REGIME_STATES
} from "../regime/models.js";


function finiteNumber(value) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : null;

}


function emptyState() {

    return {

        records:
            0,

        positive:
            0,

        negative:
            0,

        flat:
            0,

        unknown:
            0,

        averageReturnPct:
            null,

        medianReturnPct:
            null,

        positiveRatePct:
            null

    };

}


function median(values) {

    if (
        values.length === 0
    ) {

        return null;

    }


    const sorted =
        [...values]
            .sort(
                (a, b) =>
                    a - b
            );


    const middle =
        Math.floor(
            sorted.length / 2
        );


    if (
        sorted.length % 2 === 0
    ) {

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;

    }


    return sorted[middle];

}


function summarize(records) {

    const result =
        emptyState();


    const returns = [];


    for (
        const record of records
    ) {

        result.records += 1;


        const state =
            record?.outcome?.state;


        if (state === "POSITIVE") {

            result.positive += 1;

        }

        else if (state === "NEGATIVE") {

            result.negative += 1;

        }

        else if (state === "FLAT") {

            result.flat += 1;

        }

        else {

            result.unknown += 1;

        }


        const returnPct =
            finiteNumber(
                record
                    ?.outcome
                    ?.sessionReturnPct
            );


        if (
            returnPct !== null
        ) {

            returns.push(
                returnPct
            );

        }

    }


    if (
        returns.length > 0
    ) {

        const total =
            returns.reduce(
                (sum, value) =>
                    sum + value,
                0
            );


        result.averageReturnPct =
            total /
            returns.length;


        result.medianReturnPct =
            median(
                returns
            );

    }


    const directionalRecords =
        result.positive +
        result.negative;


    if (
        directionalRecords > 0
    ) {

        result.positiveRatePct =
            (
                result.positive /
                directionalRecords
            ) *
            100;

    }


    return result;

}


export function studyHistoricalRegimes({

    records = []

} = {}) {

    if (
        !Array.isArray(records)
    ) {

        throw new Error(
            "records must be an array"
        );

    }


    const green = [];

    const caution = [];

    const red = [];

    const unknown = [];


    for (
        const record of records
    ) {

        const state =
            record
                ?.regime
                ?.state;


        if (
            state ===
            REGIME_STATES.GREEN
        ) {

            green.push(
                record
            );

        }

        else if (
            state ===
            REGIME_STATES.CAUTION
        ) {

            caution.push(
                record
            );

        }

        else if (
            state ===
            REGIME_STATES.RED
        ) {

            red.push(
                record
            );

        }

        else {

            unknown.push(
                record
            );

        }

    }


    return {

        version:
            "PMSE-M3-HISTORICAL-REGIME-STUDY-V1",

        totalRecords:
            records.length,

        states: {

            GREEN:
                summarize(
                    green
                ),

            CAUTION:
                summarize(
                    caution
                ),

            RED:
                summarize(
                    red
                ),

            UNKNOWN:
                summarize(
                    unknown
                )

        },

        metadata: {

            researchOnly:
                true,

            regimeRulesChanged:
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

}