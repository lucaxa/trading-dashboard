/*
============================================================
TradeMind Pro
PMSE M3.5 — Historical Research Pipeline
============================================================

Purpose:
Orchestrate the completed PMSE historical research layers:

    M3.4 Historical Adapter
            ↓
    M3.2 Historical Replay
            ↓
    M3.1 Historical Dataset
            ↓
    M3 Historical Regime Study

This module does NOT modify any underlying research logic.

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
No regime feedback.
No look-ahead.
============================================================
*/

import {
    adaptHistoricalDatasetInput
} from "../ingestion/historical-adapter.js";

import {
    replayHistoricalDays
} from "../research/historical-replay.js";

import {
    studyHistoricalRegimes
} from "../research/regime-study.js";


export const PMSE_PIPELINE_VERSION =
    "PMSE-M3.5-HISTORICAL-RESEARCH-PIPELINE-V1";


function validateDay(day, index) {

    if (
        !day ||
        typeof day !== "object"
    ) {

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

}


function toStudyRecords(records) {

    return records.map(
        record => ({

            ...record,

            outcome:
                record.forwardOutcome

        })
    );

}


export function runHistoricalResearchPipeline({

    days = []

} = {}) {

    if (
        !Array.isArray(days)
    ) {

        throw new Error(
            "days must be an array"
        );

    }


    const adaptedDays =
        days.map(
            (day, index) => {

                validateDay(
                    day,
                    index
                );


                const dataset =
                    adaptHistoricalDatasetInput({

                        marketDate:
                            day.marketDate,

                        niftyResponse:
                            day.niftyResponse ??
                            day.niftyCandles ??
                            [],

                        bankniftyResponse:
                            day.bankniftyResponse ??
                            day.bankniftyCandles ??
                            []

                    });


                return {

                    marketDate:
                        dataset.marketDate,

                    cutoff:
                        day.cutoff,

                    niftyCandles:
                        dataset.niftyCandles,

                    bankniftyCandles:
                        dataset.bankniftyCandles

                };

            }
        );


    const replay =
        replayHistoricalDays({

            days:
                adaptedDays

        });


    const studyRecords =
        toStudyRecords(
            replay.records
        );


    const study =
        studyHistoricalRegimes({

            records:
                studyRecords

        });


    return {

        version:
            PMSE_PIPELINE_VERSION,

        totalDays:
            days.length,

        successfulRecords:
            replay.successfulRecords,

        records:
            replay.records,

        study,

        metadata: {

            researchOnly:
                true,

            adapterUsed:
                true,

            replayUsed:
                true,

            datasetUsed:
                true,

            regimeStudyUsed:
                true,

            regimeDecisionFrozen:
                true,

            forwardOutcomeDownstreamOnly:
                true,

            futureInformationUsedForDecision:
                false,

            lookAheadBiasAllowed:
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