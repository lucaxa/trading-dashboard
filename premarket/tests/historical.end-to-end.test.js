import test from "node:test";
import assert from "node:assert/strict";

import {
    createHistoricalWindow
} from "../ingestion/historical-window.js";

import {
    auditHistoricalAcquisition
} from "../ingestion/historical-audit.js";

import {
    runHistoricalResearchPipeline
} from "../research/historical-pipeline.js";

import {
    auditHistoricalResearch
} from "../research/research-audit.js";


const FIVE_MINUTE_MS =
    5 * 60 * 1000;


function candle(
    ts,
    open,
    high,
    low,
    close,
    volume = 1000
) {

    return {

        ts,

        o:
            open,

        h:
            high,

        l:
            low,

        c:
            close,

        v:
            volume

    };

}


function createWindow() {

    return createHistoricalWindow({

        startDate:
            "2025-01-01",

        endDate:
            "2025-01-03",

        interval:
            "5m",

        timezone:
            "Asia/Kolkata",

        indices: [

            "NIFTY50",

            "BANKNIFTY"

        ]

    });

}


function createAcquisition() {

    const niftyCandles = [

        candle(
            Date.parse("2025-01-01T09:15:00+05:30"),
            100,
            101,
            99,
            100.5
        ),

        candle(
            Date.parse("2025-01-01T09:20:00+05:30"),
            100.5,
            102,
            100,
            101.5
        ),

        candle(
            Date.parse("2025-01-01T15:30:00+05:30"),
            101.5,
            103,
            101,
            102.5
        ),

        candle(
            Date.parse("2025-01-02T09:15:00+05:30"),
            102.5,
            104,
            102,
            103.5
        ),

        candle(
            Date.parse("2025-01-02T15:30:00+05:30"),
            103.5,
            105,
            103,
            104.5
        ),

        candle(
            Date.parse("2025-01-03T09:15:00+05:30"),
            104.5,
            106,
            104,
            105.5
        ),

        candle(
            Date.parse("2025-01-03T15:30:00+05:30"),
            105.5,
            107,
            105,
            106.5
        )

    ];


    const bankniftyCandles = [

        candle(
            Date.parse("2025-01-01T09:15:00+05:30"),
            200,
            202,
            198,
            201
        ),

        candle(
            Date.parse("2025-01-01T09:20:00+05:30"),
            201,
            204,
            200,
            203
        ),

        candle(
            Date.parse("2025-01-01T15:30:00+05:30"),
            203,
            205,
            202,
            204
        ),

        candle(
            Date.parse("2025-01-02T09:15:00+05:30"),
            204,
            206,
            203,
            205
        ),

        candle(
            Date.parse("2025-01-02T15:30:00+05:30"),
            205,
            208,
            204,
            207
        ),

        candle(
            Date.parse("2025-01-03T09:15:00+05:30"),
            207,
            209,
            206,
            208
        ),

        candle(
            Date.parse("2025-01-03T15:30:00+05:30"),
            208,
            211,
            207,
            210
        )

    ];


    return {

        version:
            "PMSE-M4.3-INDSTOCKS-HISTORICAL-ACQUISITION-V1",

        window: {
            ...createWindow(),

            interval:
                "5minute"
        },

        request: {

            startDate:
                "2025-01-01",

            endDate:
                "2025-01-03",

            interval:
                "5minute",

            timezone:
                "Asia/Kolkata",

            startTime:
                Date.parse(
                    "2025-01-01T00:00:00+05:30"
                ),

            endTime:
                Date.parse(
                    "2025-01-03T23:59:59.999+05:30"
                ),

            indices: [

                "NIFTY50",

                "BANKNIFTY"

            ]

        },

        responses: {

            nifty50: {

                success:
                    true,

                data: {

                    candles:
                        niftyCandles

                }

            },

            banknifty50: {

                success:
                    true,

                data: {

                    candles:
                        bankniftyCandles

                }

            }

        },

        metadata: {

            researchOnly:
                true,

            liveAcquisition:
                false,

            lookAheadBiasAllowed:
                false,

            futureInformationUsedForDecision:
                false,

            regimeEvaluated:
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


function createResearchDays(acquisition) {

    return [

        {

            marketDate:
                "2025-01-01",

            cutoff:
                "09:00",

            niftyResponse:
                acquisition.responses.nifty50,

            bankniftyResponse:
                acquisition.responses.banknifty

        },

        {

            marketDate:
                "2025-01-02",

            cutoff:
                "09:00",

            niftyResponse:
                acquisition.responses.nifty50,

            bankniftyResponse:
                acquisition.responses.banknifty

        },

        {

            marketDate:
                "2025-01-03",

            cutoff:
                "09:00",

            niftyResponse:
                acquisition.responses.nifty50,

            bankniftyResponse:
                acquisition.responses.banknifty

        }

    ];

}


test(
    "M4.5 completes the historical research chain",
    () => {

        const window =
            createWindow();

        const acquisition =
            createAcquisition();


        const audit =
            auditHistoricalAcquisition(
                acquisition
            );


        assert.equal(
            audit.status,
            "PASS"
        );


        assert.equal(
            audit.indices.NIFTY50.valid,
            true
        );


        assert.equal(
            audit.indices.BANKNIFTY.valid,
            true
        );


        const pipeline =
            runHistoricalResearchPipeline({

                days:
                    createResearchDays(
                        acquisition
                    )

            });


        assert.equal(
            pipeline.totalDays,
            3
        );


        assert.equal(
            pipeline.metadata.researchOnly,
            true
        );


        assert.equal(
            pipeline.metadata.futureInformationUsedForDecision,
            false
        );


        const researchAudit =
            auditHistoricalResearch({

                records:
                    pipeline.records

            });


        assert.equal(
            researchAudit.auditStatus,
            "PASS"
        );


        assert.equal(
            researchAudit.invalidRecords,
            0
        );


        assert.equal(
            researchAudit.metadata.researchOnly,
            true
        );


        assert.equal(
            researchAudit.metadata.futureInformationUsedForDecision,
            false
        );


        assert.equal(
            researchAudit.metadata.tradeCreated,
            false
        );


        assert.equal(
            researchAudit.metadata.brokerCalled,
            false
        );


        assert.equal(
            researchAudit.metadata.productionBackendTouched,
            false
        );


        assert.equal(
            researchAudit.metadata.frontendTouched,
            false
        );

    }
);


test(
    "M4.5 rejects corrupted historical acquisition before research",
    () => {

        const acquisition =
            createAcquisition();


        acquisition.responses.nifty50.data.candles =
            [

                candle(
                    Date.parse(
                        "2025-01-01T09:15:00+05:30"
                    ),
                    100,
                    101,
                    99,
                    100
                ),

                candle(
                    Date.parse(
                        "2025-01-01T09:10:00+05:30"
                    ),
                    100,
                    101,
                    99,
                    100
                )

            ];


        const audit =
            auditHistoricalAcquisition(
                acquisition
            );


        assert.equal(
            audit.status,
            "FAIL"
        );


        assert.ok(
            audit.indices.NIFTY50
                .failures
                .length > 0
        );

    }
);


test(
    "M4.5 keeps forward outcome downstream",
    () => {

        const acquisition =
            createAcquisition();


        const pipeline =
            runHistoricalResearchPipeline({

                days:
                    createResearchDays(
                        acquisition
                    )

            });


        for (
            const record of
                pipeline.records
        ) {

            assert.equal(
                record.metadata
                    .forwardOutcomeUsedToCreateDecision,
                false
            );

        }

    }
);


test(
    "M4.5 remains research-only",
    () => {

        const acquisition =
            createAcquisition();


        const pipeline =
            runHistoricalResearchPipeline({

                days:
                    createResearchDays(
                        acquisition
                    )

            });


        assert.equal(
            pipeline.metadata.tradeCreated,
            false
        );


        assert.equal(
            pipeline.metadata.brokerCalled,
            false
        );


        assert.equal(
            pipeline.metadata.productionBackendTouched,
            false
        );


        assert.equal(
            pipeline.metadata.frontendTouched,
            false
        );

    }
);
