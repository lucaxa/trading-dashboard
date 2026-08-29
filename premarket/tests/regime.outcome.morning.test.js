import assert from "node:assert/strict";
import test from "node:test";

import {
    replayHistoricalRegimeOutcomeMorning
} from "../replay/regime-outcome-morning.js";


function istTimestamp(value) {

    return Math.floor(
        new Date(value).getTime() / 1000
    );

}


const MARKET_DATE =
    "2026-08-31";


const CUTOFF =
    "2026-08-31T09:00:00+05:30";


function bullishPreviousSession() {

    return [

        {
            ts:
                istTimestamp(
                    "2026-08-28T09:15:00+05:30"
                ),

            o: 100,
            h: 110,
            l: 99,
            c: 108

        },

        {
            ts:
                istTimestamp(
                    "2026-08-28T15:30:00+05:30"
                ),

            o: 108,
            h: 112,
            l: 107,
            c: 110

        }

    ];

}


function bullishForwardSession() {

    return [

        {
            ts:
                istTimestamp(
                    "2026-08-31T09:15:00+05:30"
                ),

            o: 100,
            h: 103,
            l: 99,
            c: 102

        },

        {
            ts:
                istTimestamp(
                    "2026-08-31T15:30:00+05:30"
                ),

            o: 102,
            h: 110,
            l: 101,
            c: 108

        }

    ];

}


function bearishForwardSession() {

    return [

        {
            ts:
                istTimestamp(
                    "2026-08-31T09:15:00+05:30"
                ),

            o: 100,
            h: 101,
            l: 96,
            c: 98

        },

        {
            ts:
                istTimestamp(
                    "2026-08-31T15:30:00+05:30"
                ),

            o: 98,
            h: 99,
            l: 90,
            c: 92

        }

    ];

}


test(
    "M2.5 historical replay joins frozen regime with forward outcome",
    () => {

        const result =
            replayHistoricalRegimeOutcomeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyPreviousSessionCandles:
                    bullishPreviousSession(),

                bankniftyPreviousSessionCandles:
                    bullishPreviousSession(),

                niftyForwardCandles:
                    bullishForwardSession()

            });


        assert.equal(
            result.regime.state,
            "GREEN"
        );


        assert.equal(
            result.forwardOutcome.state,
            "POSITIVE"
        );


        assert.equal(
            result.marketDate,
            MARKET_DATE
        );


        assert.equal(
            result.decisionCutoff,
            CUTOFF
        );

    }
);


test(
    "forward outcome does not alter the frozen regime",
    () => {

        const result =
            replayHistoricalRegimeOutcomeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyPreviousSessionCandles:
                    bullishPreviousSession(),

                bankniftyPreviousSessionCandles:
                    bullishPreviousSession(),

                niftyForwardCandles:
                    bearishForwardSession()

            });


        assert.equal(
            result.regime.state,
            "GREEN"
        );


        assert.equal(
            result.forwardOutcome.state,
            "NEGATIVE"
        );


        assert.equal(
            result.metadata
                .forwardOutcomeUsedToCreateDecision,
            false
        );


        assert.equal(
            result.metadata
                .futureInformationUsedForDecision,
            false
        );

    }
);


test(
    "historical replay uses previous session for regime",
    () => {

        const result =
            replayHistoricalRegimeOutcomeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyPreviousSessionCandles:
                    bullishPreviousSession(),

                bankniftyPreviousSessionCandles:
                    bullishPreviousSession(),

                niftyForwardCandles:
                    bullishForwardSession()

            });


        assert.equal(
            result.previousSessionDate,
            "2026-08-28"
        );


        assert.equal(
            result.metadata
                .replay
                .currentSessionCandlesUsedForDecision,
            false
        );

    }
);


test(
    "historical replay measures forward outcome only after cutoff",
    () => {

        const result =
            replayHistoricalRegimeOutcomeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyPreviousSessionCandles:
                    bullishPreviousSession(),

                bankniftyPreviousSessionCandles:
                    bullishPreviousSession(),

                niftyForwardCandles:
                    bullishForwardSession()

            });


        assert.equal(
            result.metadata
                .replay
                .forwardOutcomeMeasuredAfterDecision,
            true
        );


        assert.equal(
            result.metadata
                .replay
                .decisionFrozenAt,
            CUTOFF
        );

    }
);


test(
    "M2.5 historical replay remains research-only",
    () => {

        const result =
            replayHistoricalRegimeOutcomeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyPreviousSessionCandles:
                    bullishPreviousSession(),

                bankniftyPreviousSessionCandles:
                    bullishPreviousSession(),

                niftyForwardCandles:
                    bullishForwardSession()

            });


        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata.tradeCreated,
            false
        );


        assert.equal(
            result.metadata.brokerCalled,
            false
        );


        assert.equal(
            result.metadata.productionBackendTouched,
            false
        );


        assert.equal(
            result.metadata.frontendTouched,
            false
        );

    }
);