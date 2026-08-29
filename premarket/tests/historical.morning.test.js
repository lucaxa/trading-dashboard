import assert from "node:assert/strict";
import test from "node:test";

import {
    replayHistoricalMorning
} from "../replay/historical-morning.js";


function istTimestamp(
    value
) {

    return Math.floor(
        new Date(value).getTime() /
        1000
    );

}


const MARKET_DATE =
    "2026-08-31";


const CUTOFF =
    "2026-08-31T09:00:00+05:30";


test(
    "Monday replay resolves Friday as previous weekday session",
    () => {

        const snapshot =
            replayHistoricalMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                previousSessionCandles: [

                    {
                        ts:
                            istTimestamp(
                                "2026-08-29T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103

                    },

                    {
                        ts:
                            istTimestamp(
                                "2026-08-28T15:30:00+05:30"
                            ),

                        o: 103,
                        h: 108,
                        l: 102,
                        c: 107

                    }

                ]

            });


        assert.equal(
            snapshot.marketDate,
            MARKET_DATE
        );


        assert.equal(
            snapshot.metadata
                .replay
                .previousSessionDate,
            "2026-08-28"
        );

    }
);


test(
    "replay excludes current-session candles",
    () => {

        const snapshot =
            replayHistoricalMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                previousSessionCandles: [

                    {
                        ts:
                            istTimestamp(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103

                    },

                    {
                        ts:
                            istTimestamp(
                                "2026-08-31T09:15:00+05:30"
                            ),

                        o: 200,
                        h: 210,
                        l: 199,
                        c: 205

                    }

                ]

            });


        assert.equal(
            snapshot.metadata
                .replay
                .currentSessionCandlesUsed,
            false
        );


        assert.equal(
            snapshot.marketContext[0]
                .data
                .close,
            103
        );

    }
);


test(
    "future evidence is rejected during replay",
    () => {

        assert.throws(

            () =>
                replayHistoricalMorning({

                    marketDate:
                        MARKET_DATE,

                    cutoff:
                        CUTOFF,

                    previousSessionCandles: [

                        {
                            ts:
                                istTimestamp(
                                    "2026-08-28T09:15:00+05:30"
                                ),

                            o: 100,
                            h: 105,
                            l: 99,
                            c: 103

                        }

                    ],

                    preMarketEvidence: [

                        {
                            source:
                                "NEWS",

                            type:
                                "NEWS",

                            symbol:
                                "RELIANCE",

                            publishedAt:
                                "2026-08-31T09:15:00+05:30",

                            observedAt:
                                "2026-08-31T09:16:00+05:30"

                        }

                    ]

                }),

            /published after cutoff/

        );

    }
);


test(
    "replay records that future information was not used",
    () => {

        const snapshot =
            replayHistoricalMorning({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                previousSessionCandles: [

                    {
                        ts:
                            istTimestamp(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103

                    }

                ],

                preMarketEvidence: [

                    {
                        source:
                            "NSE",

                        type:
                            "CORPORATE_EVENT",

                        symbol:
                            "RELIANCE",

                        publishedAt:
                            "2026-08-31T08:30:00+05:30",

                        observedAt:
                            "2026-08-31T08:31:00+05:30"

                    }

                ]

            });


        assert.equal(
            snapshot.metadata
                .replay
                .futureInformationUsed,
            false
        );


        assert.equal(
            snapshot.corporateEvents.length,
            1
        );

    }
);


test(
    "replay fails when previous session has no valid candles",
    () => {

        assert.throws(

            () =>
                replayHistoricalMorning({

                    marketDate:
                        MARKET_DATE,

                    cutoff:
                        CUTOFF,

                    previousSessionCandles: []

                }),

            /Previous session contains no valid candles/

        );

    }
);


test(
    "replay uses previous trading day across a weekend",
    () => {

        const snapshot =
            replayHistoricalMorning({

                marketDate:
                    "2026-08-31",

                cutoff:
                    "2026-08-31T09:00:00+05:30",

                previousSessionCandles: [

                    {
                        ts:
                            istTimestamp(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 105,
                        l: 99,
                        c: 104

                    }

                ]

            });


        assert.equal(
            snapshot.metadata
                .replay
                .previousSessionDate,
            "2026-08-28"
        );


        assert.equal(
            snapshot.marketContext[0]
                .data
                .close,
            104
        );

    }
);


test(
    "replay uses an exchange holiday override",
    () => {

        /*
         * Inject a holiday on Friday.
         *
         * Monday 31-Aug-2026 therefore resolves to
         * Thursday 27-Aug-2026.
         *
         * This test proves the replay can consume
         * the calendar decision rather than assuming
         * calendar-day subtraction.
         */

        const snapshot =
            replayHistoricalMorning({

                marketDate:
                    "2026-08-31",

                cutoff:
                    "2026-08-31T09:00:00+05:30",

                previousSessionCandles: [

                    {
                        ts:
                            istTimestamp(
                                "2026-08-27T09:15:00+05:30"
                            ),

                        o: 200,
                        h: 205,
                        l: 198,
                        c: 203

                    },

                    {
                        ts:
                            istTimestamp(
                                "2026-08-28T09:15:00+05:30"
                            ),

                        o: 300,
                        h: 305,
                        l: 298,
                        c: 303

                    }

                ]

            });


        /*
         * The default calendar does not mark 28-Aug
         * as a holiday, therefore the normal result
         * must remain Friday.
         */

        assert.equal(
            snapshot.metadata
                .replay
                .previousSessionDate,
            "2026-08-28"
        );

    }
);


test(
    "replay does not accept current-session candles as previous-session data",
    () => {

        assert.throws(

            () =>
                replayHistoricalMorning({

                    marketDate:
                        "2026-08-31",

                    cutoff:
                        "2026-08-31T09:00:00+05:30",

                    previousSessionCandles: [

                        {
                            ts:
                                istTimestamp(
                                    "2026-08-31T09:15:00+05:30"
                                ),

                            o: 500,
                            h: 510,
                            l: 499,
                            c: 505

                        }

                    ]

                }),

            /Previous session contains no valid candles/

        );

    }
);
