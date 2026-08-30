/*
============================================================
TradeMind Pro
PMSE M3.2 — Multi-Day Historical Replay
============================================================

Purpose:
Replay multiple historical market days through the existing
M3.1 historical dataset builder.

For each day:

1. Freeze the 09:00 regime decision.
2. Use previous completed session only for regime evidence.
3. Measure the current session only as forward outcome.
4. Produce one M3.1 research record.

This module does NOT change regime rules.

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
============================================================
*/

import {
    buildHistoricalDatasetRecord
} from "./historical-dataset.js";


export const PMSE_REPLAY_VERSION =
    "PMSE-M3.2-MULTI-DAY-HISTORICAL-REPLAY-V1";


function validateDay(day, index) {

    if (!day || typeof day !== "object") {

        throw new Error(
            `day ${index} must be an object`
        );

    }


    if (!day.marketDate) {

        throw new Error(
            `day ${index} marketDate is required`
        );

    }


    if (!day.cutoff) {

        throw new Error(
            `day ${index} cutoff is required`
        );

    }


    if (
        day.niftyCandles !== undefined &&
        !Array.isArray(day.niftyCandles)
    ) {

        throw new Error(
            `day ${index} niftyCandles must be an array`
        );

    }


    if (
        day.bankniftyCandles !== undefined &&
        !Array.isArray(day.bankniftyCandles)
    ) {

        throw new Error(
            `day ${index} bankniftyCandles must be an array`
        );

    }

}


export function replayHistoricalDays({

    days = []

} = {}) {

    if (!Array.isArray(days)) {

        throw new Error(
            "days must be an array"
        );

    }


    const records = [];


    for (
        let index = 0;
        index < days.length;
        index += 1
    ) {

        const day =
            days[index];


        validateDay(
            day,
            index
        );


        const record =
            buildHistoricalDatasetRecord({

                marketDate:
                    day.marketDate,

                cutoff:
                    day.cutoff,

                niftyCandles:
                    day.niftyCandles || [],

                bankniftyCandles:
                    day.bankniftyCandles || []

            });


        records.push(
            record
        );

    }


    return {

        version:
            PMSE_REPLAY_VERSION,

        totalDays:
            days.length,

        successfulRecords:
            records.length,

        records,

        metadata: {

            researchOnly:
                true,

            lookAheadBiasAllowed:
                false,

            regimeDecisionFrozen:
                true,

            forwardOutcomeDownstreamOnly:
                true,

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