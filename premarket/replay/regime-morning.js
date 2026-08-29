import {
    calculateRegimeEvidence
} from "../regime/evidence.js";

import {
    evaluateMarketRegime
} from "../regime/evaluate.js";

import {
    filterRegularSessionCandles
} from "../market/session.js";

import {
    previousTradingDay
} from "../calendar/trading-days.js";


const NIFTY_SYMBOL =
    "NIFTY 50";

const BANKNIFTY_SYMBOL =
    "BANKNIFTY";


export function replayHistoricalRegimeMorning({

    marketDate,

    cutoff,

    niftyCandles = [],

    bankniftyCandles = []

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


    const previousSessionDate =
        previousTradingDay(
            marketDate
        );


    /*
     * Only the explicitly supplied previous-session
     * candles are eligible for regime evidence.
     *
     * Current-session candles are deliberately filtered
     * out before evidence calculation.
     */

    const niftyPreviousSession =
        filterRegularSessionCandles(

            niftyCandles,

            previousSessionDate

        );


    const bankniftyPreviousSession =
        filterRegularSessionCandles(

            bankniftyCandles,

            previousSessionDate

        );


    const niftyEvidence =
        calculateRegimeEvidence({

            symbol:
                NIFTY_SYMBOL,

            marketDate:
                previousSessionDate,

            candles:
                niftyPreviousSession

        });


    const bankniftyEvidence =
        calculateRegimeEvidence({

            symbol:
                BANKNIFTY_SYMBOL,

            marketDate:
                previousSessionDate,

            candles:
                bankniftyPreviousSession

        });


    /*
     * The M2 evaluator receives only observations
     * derived from the previous completed session.
     *
     * No current-session candle is passed into it.
     */

    const regime =
        evaluateMarketRegime({

            marketDate,

            cutoff,

            observations: {

                [NIFTY_SYMBOL]:
                    niftyEvidence,

                [BANKNIFTY_SYMBOL]:
                    bankniftyEvidence

            }

        });


    return {

        version:
            "PMSE-M2.3-HISTORICAL-REGIME-V1",

        marketDate,

        cutoff,

        previousSessionDate,

        regime,

        observations: {

            [NIFTY_SYMBOL]:
                niftyEvidence,

            [BANKNIFTY_SYMBOL]:
                bankniftyEvidence

        },

        metadata: {

            researchOnly:
                true,

            tradeCreated:
                false,

            brokerCalled:
                false,

            productionBackendTouched:
                false,

            frontendTouched:
                false,

            replay: {

                historical:
                    true,

                currentSessionCandlesUsed:
                    false,

                futureInformationUsed:
                    false,

                decisionFrozenAt:
                    cutoff

            }

        }

    };

}
