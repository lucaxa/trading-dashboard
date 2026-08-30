import assert from "node:assert/strict";
import test from "node:test";

import {
    replayHistoricalDays
} from "../research/historical-replay.js";


function istTimestamp(value) {

    return Math.floor(
        new Date(value).getTime() /
        1000
    );

}


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


function bullishCurrentSession() {

    return [

        {
            ts:
                istTimestamp(
                    "2026-08-31T09:15:00+05:30"
                ),

            o: 110,
            h: 112,
            l: 109,
            c: 111

        },

        {
            ts:
                istTimestamp(
                    "2026-08-31T10:00:00+05:30"
                ),

            o: 111,
            h: 115,
            l: 110,
            c: 114

        }

    ];

}


function buildBullishDay(
    marketDate,
    previousDate
) {

    return {

        marketDate,

        cutoff:
            `${marketDate}T09:00:00+05:30`,

        niftyCandles: [

            {
                ts:
                    istTimestamp(
                        `${previousDate}T09:15:00+05:30`
                    ),

                o: 100,
                h: 110,
                l: 99,
                c: 108

            },

            {
                ts:
                    istTimestamp(
                        `${previousDate}T15:30:00+05:30`
                    ),

                o: 108,
                h: 112,
                l: 107,
                c: 110

            },

            {
                ts:
                    istTimestamp(
                        `${marketDate}T09:15:00+05:30`
                    ),

                o: 110,
                h: 112,
                l: 109,
                c: 111

            },

            {
                ts:
                    istTimestamp(
                        `${marketDate}T10:00:00+05:30`
                    ),

                o: 111,
                h: 115,
                l: 110,
                c: 114

            }

        ],

        bankniftyCandles: [

            {
                ts:
                    istTimestamp(
                        `${previousDate}T09:15:00+05:30`
                    ),

                o: 100,
                h: 110,
                l: 99,
                c: 108

            },

            {
                ts:
                    istTimestamp(
                        `${previousDate}T15:30:00+05:30`
                    ),

                o: 108,
                h: 112,
                l: 107,
                c: 110

            },

            {
                ts:
                    istTimestamp(
                        `${marketDate}T09:15:00+05:30`
                    ),

                o: 110,
                h: 112,
                l: 109,
                c: 111

            },

            {
                ts:
                    istTimestamp(
                        `${marketDate}T10:00:00+05:30`
                    ),

                o: 111,
                h: 115,
                l: 110,
                c: 114

            }

        ]

    };

}


test(
    "M3.2 replays multiple historical days",
    () => {

        const result =
            replayHistoricalDays({

                days: [

                    buildBullishDay(
                        "2026-08-31",
                        "2026-08-28"
                    ),

                    buildBullishDay(
                        "2026-09-01",
                        "2026-08-31"
                    )

                ]

            });


        assert.equal(
            result.totalDays,
            2
        );


        assert.equal(
            result.successfulRecords,
            2
        );


        assert.equal(
            result.records.length,
            2
        );

    }
);


test(
    "M3.2 preserves frozen regime decisions",
    () => {

        const result =
            replayHistoricalDays({

                days: [

                    buildBullishDay(
                        "2026-08-31",
                        "2026-08-28"
                    )

                ]

            });


        assert.equal(
            result.records[0].regime.state,
            "GREEN"
        );


        assert.equal(
            result.records[0]
                .metadata
                .regimeUsedPreviousSessionOnly,
            true
        );

    }
);


test(
    "M3.2 keeps forward outcome downstream",
    () => {

        const result =
            replayHistoricalDays({

                days: [

                    buildBullishDay(
                        "2026-08-31",
                        "2026-08-28"
                    )

                ]

            });


        assert.equal(
            result.records[0]
                .metadata
                .forwardOutcomeUsedCurrentSessionOnly,
            true
        );


        assert.equal(
            result.records[0]
                .metadata
                .futureInformationUsedForDecision,
            false
        );

    }
);


test(
    "M3.2 rejects invalid days deterministically",
    () => {

        assert.throws(

            () =>

                replayHistoricalDays({

                    days: [

                        {
                            cutoff:
                                "2026-08-31T09:00:00+05:30"
                        }

                    ]

                }),

            /marketDate is required/

        );

    }
);


test(
    "M3.2 rejects non-array days",
    () => {

        assert.throws(

            () =>

                replayHistoricalDays({

                    days:
                        null

                }),

            /days must be an array/

        );

    }
);


test(
    "M3.2 remains research-only",
    () => {

        const result =
            replayHistoricalDays({

                days: []

            });


        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata.lookAheadBiasAllowed,
            false
        );


        assert.equal(
            result.metadata.regimeDecisionFrozen,
            true
        );


        assert.equal(
            result.metadata.forwardOutcomeDownstreamOnly,
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