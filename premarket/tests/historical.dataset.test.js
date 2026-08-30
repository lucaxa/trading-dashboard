import assert from "node:assert/strict";
import test from "node:test";

import {
    buildHistoricalDatasetRecord,
    buildHistoricalDataset
} from "../research/historical-dataset.js";


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


test(
    "M3.1 builds one historical dataset record",
    () => {

        const result =
            buildHistoricalDatasetRecord({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles: [

                    ...bullishPreviousSession(),

                    ...bullishCurrentSession()

                ],

                bankniftyCandles: [

                    ...bullishPreviousSession(),

                    ...bullishCurrentSession()

                ]

            });


        assert.equal(
            result.marketDate,
            MARKET_DATE
        );


        assert.equal(
            result.regime.state,
            "GREEN"
        );


        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata
                .futureInformationUsedForDecision,
            false
        );

    }
);


test(
    "M3.1 keeps regime and forward outcome separate",
    () => {

        const result =
            buildHistoricalDatasetRecord({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles: [

                    ...bullishPreviousSession(),

                    ...bullishCurrentSession()

                ],

                bankniftyCandles: [

                    ...bullishPreviousSession(),

                    ...bullishCurrentSession()

                ]

            });


        assert.equal(
            result.regime.marketDate,
            MARKET_DATE
        );


        assert.equal(
            result.forwardOutcome.marketDate,
            MARKET_DATE
        );


        assert.equal(
            result.metadata
                .regimeUsedPreviousSessionOnly,
            true
        );


        assert.equal(
            result.metadata
                .forwardOutcomeUsedCurrentSessionOnly,
            true
        );

    }
);


test(
    "M3.1 current-session movement cannot alter frozen regime",
    () => {

        const normal =
            buildHistoricalDatasetRecord({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles: [

                    ...bullishPreviousSession(),

                    ...bullishCurrentSession()

                ],

                bankniftyCandles: [

                    ...bullishPreviousSession(),

                    ...bullishCurrentSession()

                ]

            });


        const extremeFuture =
            buildHistoricalDatasetRecord({

                marketDate:
                    MARKET_DATE,

                cutoff:
                    CUTOFF,

                niftyCandles: [

                    ...bullishPreviousSession(),

                    {

                        ts:
                            istTimestamp(
                                "2026-08-31T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 200,
                        l: 90,
                        c: 195

                    }

                ],

                bankniftyCandles: [

                    ...bullishPreviousSession(),

                    {

                        ts:
                            istTimestamp(
                                "2026-08-31T09:15:00+05:30"
                            ),

                        o: 100,
                        h: 200,
                        l: 90,
                        c: 195

                    }

                ]

            });


        assert.equal(
            normal.regime.state,
            extremeFuture.regime.state
        );


        assert.equal(
            normal.regime.score,
            extremeFuture.regime.score
        );

    }
);


test(
    "M3.1 dataset builder handles multiple days",
    () => {

        const result =
            buildHistoricalDataset({

                days: [

                    {

                        marketDate:
                            MARKET_DATE,

                        cutoff:
                            CUTOFF,

                        niftyCandles: [

                            ...bullishPreviousSession(),

                            ...bullishCurrentSession()

                        ],

                        bankniftyCandles: [

                            ...bullishPreviousSession(),

                            ...bullishCurrentSession()

                        ]

                    },

                    {

                        marketDate:
                            "2026-09-01",

                        cutoff:
                            "2026-09-01T09:00:00+05:30",

                        niftyCandles: [],

                        bankniftyCandles: []

                    }

                ]

            });


        assert.equal(
            result.totalRecords,
            2
        );


        assert.equal(
            result.records.length,
            2
        );

    }
);


test(
    "M3.1 remains research-only",
    () => {

        const result =
            buildHistoricalDataset({

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