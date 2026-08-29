/*
============================================================
TradeMind Pro
PMSE M2.5 — Historical Regime + Outcome Replay
============================================================

Purpose:
Replay one historical trading day.

Phase 1:
Determine the market regime using ONLY the completed
previous trading session.

Phase 2:
Measure what actually happened during the historical
marketDate session.

Phase 3:
Join both into one research record.

IMPORTANT:
The forward outcome is NEVER passed back into the regime
decision.

Research only.
No trading.
No broker interaction.
No frontend interaction.
============================================================
*/

import {
    replayHistoricalRegimeMorning
} from "./regime-morning.js";

import {
    measureForwardOutcome
} from "../outcome/measure.js";

import {
    createRegimeOutcomeRecord
} from "../research/regime-outcome-model.js";


export function replayHistoricalRegimeOutcomeMorning({

    marketDate,

    cutoff,

    niftyPreviousSessionCandles = [],

    bankniftyPreviousSessionCandles = [],

    niftyForwardCandles = [],

    forwardOutcomeSymbol = "NIFTY 50"

} = {}) {

    if (!marketDate) {

        throw new Error(
            "marketDate is required"
        );

    }


    if (!cutoff) {

        throw new Error(
            "cutoff is required"
        );

    }


    /*
     * ------------------------------------------------------
     * PHASE 1
     *
     * Build the regime decision from previous-session data.
     *
     * No current-session candles are supplied here.
     * ------------------------------------------------------
     */

    const regimeReplay =
        replayHistoricalRegimeMorning({

            marketDate,

            cutoff,

            niftyCandles:
                niftyPreviousSessionCandles,

            bankniftyCandles:
                bankniftyPreviousSessionCandles

        });


    /*
     * ------------------------------------------------------
     * PHASE 2
     *
     * Measure the actual forward session outcome.
     *
     * This is deliberately performed AFTER the regime
     * decision has been frozen.
     * ------------------------------------------------------
     */

    const forwardOutcome =
        measureForwardOutcome({

            symbol:
                forwardOutcomeSymbol,

            marketDate,

            decisionCutoff:
                cutoff,

            candles:
                niftyForwardCandles

        });


    /*
     * ------------------------------------------------------
     * PHASE 3
     *
     * Join the frozen decision with the later outcome.
     *
     * The outcome is only an observation.
     * It cannot alter the regime decision.
     * ------------------------------------------------------
     */

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

            replay: {

                historical:
                    true,

                currentSessionCandlesUsedForDecision:
                    false,

                forwardOutcomeMeasuredAfterDecision:
                    true,

                futureInformationUsedForDecision:
                    false,

                decisionFrozenAt:
                    cutoff

            }

        }

    };

}