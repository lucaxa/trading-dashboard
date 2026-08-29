import assert from "node:assert/strict";
import test from "node:test";

import {
    replayHistoricalRegimeMorning
} from "../replay/regime-morning.js";


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


function bullishSessionCandles() {

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


function bearishSessionCandles() {

    return [

        {
            ts:
                istTimestamp(
                    "2026-08-28T09:15:00+05:30"
                ),

            o: 110,
            h: 111,
            l: 99,
            c: 100

        },

        {
            ts:
                istTimestamp(
                    "2026-08-28T15:30:00+05:30"
                ),

            o: 100,
            h: 101,
            l: 90,
            c: 92

        }

    ];

}


test(
    "historical regime replay produces GREEN from aligned bullish previous sessions",
    () => {

        const result =
            replayHistoricalRegimeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles:
                    bullishSessionCandles(),

                bankniftyCandles:
                    bullishSessionCandles()

            });


        assert.equal(
            result.regime.state,
            "GREEN"
        );


        assert.equal(
            result.regime.score,
            1
        );


        assert.equal(
            result.previousSessionDate,
            "2026-08-28"
        );

    }
);


test(
    "historical regime replay produces RED from aligned bearish previous sessions",
    () => {

        const result =
            replayHistoricalRegimeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles:
                    bearishSessionCandles(),

                bankniftyCandles:
                    bearishSessionCandles()

            });


        assert.equal(
            result.regime.state,
            "RED"
        );


        assert.equal(
            result.regime.score,
            0
        );

    }
);


test(
    "historical regime replay does not consume current-session candles",
    () => {

        const result =
            replayHistoricalRegimeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles: [

                    ...bullishSessionCandles(),

                    {
                        ts:
                            istTimestamp(
                                "2026-08-31T09:15:00+05:30"
                            ),

                        o: 500,
                        h: 600,
                        l: 490,
                        c: 590

                    }

                ],

                bankniftyCandles: [

                    ...bullishSessionCandles(),

                    {
                        ts:
                            istTimestamp(
                                "2026-08-31T09:15:00+05:30"
                            ),

                        o: 500,
                        h: 600,
                        l: 490,
                        c: 590

                    }

                ]

            });


        assert.equal(
            result.metadata.replay
                .currentSessionCandlesUsed,
            false
        );


        assert.equal(
            result.metadata.replay
                .futureInformationUsed,
            false
        );


        assert.equal(
            result.regime.state,
            "GREEN"
        );

    }
);


test(
    "historical regime replay freezes decision at cutoff",
    () => {

        const result =
            replayHistoricalRegimeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles:
                    bullishSessionCandles(),

                bankniftyCandles:
                    bullishSessionCandles()

            });


        assert.equal(
            result.metadata.replay
                .decisionFrozenAt,
            CUTOFF
        );


        assert.equal(
            result.regime.cutoff,
            CUTOFF
        );

    }
);


test(
    "historical regime replay remains research-only",
    () => {

        const result =
            replayHistoricalRegimeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles:
                    bullishSessionCandles(),

                bankniftyCandles:
                    bullishSessionCandles()

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


        assert.equal(
            result.regime.metadata
                .researchOnly,
            true
        );

    }
);


test(
    "historical regime replay marks missing index data as RED",
    () => {

        const result =
            replayHistoricalRegimeMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles:
                    bullishSessionCandles(),

                bankniftyCandles:
                    []

            });


        assert.equal(
            result.regime.state,
            "RED"
        );


        assert.equal(
            result.regime.score,
            0
        );


        assert.equal(
            result.observations.BANKNIFTY.valid,
            false
        );


        assert.equal(
            result.metadata.replay
                .futureInformationUsed,
            false
        );

    }
);
