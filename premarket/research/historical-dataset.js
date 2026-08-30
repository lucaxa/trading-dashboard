/*
============================================================
TradeMind Pro
PMSE M3.1 — Historical Dataset Builder
============================================================

Purpose:
Build historical research records by joining:

1. Frozen 09:00 regime decision
   - previous completed session only

2. Forward session outcome
   - current session only

Research only.
No trading.
No broker interaction.
============================================================
*/


import {
    replayHistoricalRegimeMorning
} from "../replay/regime-morning.js";


import {
    measureForwardOutcome
} from "../outcome/measure.js";


import {
    createRegimeOutcomeRecord
} from "./regime-outcome-model.js";



export const PMSE_DATASET_VERSION =
    "PMSE-M3.1-HISTORICAL-DATASET-V1";



export function buildHistoricalDatasetRecord({

    marketDate,

    cutoff,

    niftyCandles = [],

    bankniftyCandles = []

} = {}) {


    const regimeReplay =
        replayHistoricalRegimeMorning({

            marketDate,

            cutoff,

            niftyCandles,

            bankniftyCandles

        });



    const forwardOutcome =
    measureForwardOutcome({

        marketDate,

        decisionCutoff:
            cutoff,

        candles:
            niftyCandles

    });


    const record =
        createRegimeOutcomeRecord({

            marketDate,

            cutoff,

            previousSessionDate:
                regimeReplay.previousSessionDate,

            regime:
                regimeReplay.regime,

            observations:
                regimeReplay.observations,

            forwardOutcome

        });



    return {

        ...record,

        metadata: {

            ...record.metadata,

            regimeUsedPreviousSessionOnly:
                true,

            forwardOutcomeUsedCurrentSessionOnly:
                true

        }

    };

}




export function buildHistoricalDataset({

    days = []

} = {}) {


    const records = days.map(

        day =>

            buildHistoricalDatasetRecord({

                marketDate:
                    day.marketDate,

                cutoff:
                    day.cutoff,

                niftyCandles:
                    day.niftyCandles,

                bankniftyCandles:
                    day.bankniftyCandles

            })

    );


    return {

        version:
            PMSE_DATASET_VERSION,

        totalRecords:
            records.length,

        records,

        metadata: {

            researchOnly:
                true,

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