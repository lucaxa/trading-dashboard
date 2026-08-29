import assert from "node:assert/strict";
import test from "node:test";

import {
    measureForwardOutcome
} from "../outcome/measure.js";

import {
    OUTCOME_STATES
} from "../outcome/models.js";


function istTimestamp(value) {

    return Math.floor(
        new Date(value).getTime() /
        1000
    );

}


const MARKET_DATE =
    "2026-08-31";


const CUTOFF =
    "2026-08-31T09:00:00+05:30";


function bullishSession() {

    return [

        {
            ts:
                istTimestamp(
                    "2026-08-31T09:15:00+05:30"
                ),

            o: 100,
            h: 105,
            l: 99,
            c: 103

        },

        {
            ts:
                istTimestamp(
                    "2026-08-31T15:30:00+05:30"
                ),

            o: 103,
            h: 110,
            l: 102,
            c: 108

        }

    ];

}


function bearishSession() {

    return [

        {
            ts:
                istTimestamp(
                    "2026-08-31T09:15:00+05:30"
                ),

            o: 100,
            h: 101,
            l: 95,
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
    "forward outcome measures a positive session",
    () => {

        const result =
            measureForwardOutcome({

                marketDate:
                    MARKET_DATE,

                decisionCutoff:
                    CUTOFF,

                candles:
                    bullishSession()

            });


        assert.equal(
            result.state,
            OUTCOME_STATES.POSITIVE
        );


        assert.equal(
            result.sessionOpen,
            100
        );


        assert.equal(
            result.sessionClose,
            108
        );


        assert.equal(
            result.sessionReturnPct,
            8
        );

    }
);


test(
    "forward outcome measures a negative session",
    () => {

        const result =
            measureForwardOutcome({

                marketDate:
                    MARKET_DATE,

                decisionCutoff:
                    CUTOFF,

                candles:
                    bearishSession()

            });


        assert.equal(
            result.state,
            OUTCOME_STATES.NEGATIVE
        );


        assert.equal(
            result.sessionReturnPct,
            -8
        );

    }
);


test(
    "forward outcome excludes another date",
    () => {

        const result =
            measureForwardOutcome({

                marketDate:
                    MARKET_DATE,

                decisionCutoff:
                    CUTOFF,

                candles: [

                    ...bullishSession(),

                    {
                        ts:
                            istTimestamp(
                                "2026-09-01T09:15:00+05:30"
                            ),

                        o: 500,
                        h: 600,
                        l: 400,
                        c: 550

                    }

                ]

            });


        assert.equal(
            result.sessionClose,
            108
        );


        assert.equal(
            result.candleCount,
            2
        );

    }
);


test(
    "forward outcome excludes pre-market candles",
    () => {

        const result =
            measureForwardOutcome({

                marketDate:
                    MARKET_DATE,

                decisionCutoff:
                    CUTOFF,

                candles: [

                    {
                        ts:
                            istTimestamp(
                                "2026-08-31T09:00:00+05:30"
                            ),

                        o: 1,
                        h: 999,
                        l: 1,
                        c: 999

                    },

                    ...bullishSession()

                ]

            });


        assert.equal(
            result.sessionOpen,
            100
        );


        assert.equal(
            result.candleCount,
            2
        );

    }
);


test(
    "forward outcome excludes post-market candles",
    () => {

        const result =
            measureForwardOutcome({

                marketDate:
                    MARKET_DATE,

                decisionCutoff:
                    CUTOFF,

                candles: [

                    ...bullishSession(),

                    {
                        ts:
                            istTimestamp(
                                "2026-08-31T15:31:00+05:30"
                            ),

                        o: 999,
                        h: 1200,
                        l: 900,
                        c: 1100

                    }

                ]

            });


        assert.equal(
            result.sessionClose,
            108
        );


        assert.equal(
            result.candleCount,
            2
        );

    }
);


test(
    "forward outcome returns UNKNOWN when no valid session exists",
    () => {

        const result =
            measureForwardOutcome({

                marketDate:
                    MARKET_DATE,

                decisionCutoff:
                    CUTOFF,

                candles: []

            });


        assert.equal(
            result.state,
            OUTCOME_STATES.UNKNOWN
        );


        assert.equal(
            result.sessionReturnPct,
            null
        );


        assert.equal(
            result.candleCount,
            0
        );

    }
);


test(
    "forward outcome is research-only",
    () => {

        const result =
            measureForwardOutcome({

                marketDate:
                    MARKET_DATE,

                decisionCutoff:
                    CUTOFF,

                candles:
                    bullishSession()

            });


        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata.regimeDecisionUsed,
            false
        );


        assert.equal(
            result.metadata.futureInformationUsedForDecision,
            false
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