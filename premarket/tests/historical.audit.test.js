/*
============================================================
TradeMind Pro
PMSE M4.4 — Historical Data Quality Audit
============================================================

Purpose:
Audit acquired INDstocks historical data before it enters
the PMSE research pipeline.

M4.4 does NOT:
- normalize data
- repair data
- remove bad candles
- evaluate regime
- calculate trading signals
- create trades
- place orders
- modify research rules
- access frontend
- touch production backend

Research only.
============================================================
*/

import test from "node:test";
import assert from "node:assert/strict";

import {
    auditHistoricalAcquisition
} from "../ingestion/historical-audit.js";


function createWindow() {

    return {

        version:
            "PMSE-M4.1-HISTORICAL-WINDOW-V1",

        startDate:
            "2025-01-01",

        endDate:
            "2025-01-31",

        interval:
            "5minute",

        timezone:
            "Asia/Kolkata",

        indices: [
            "NIFTY50",
            "BANKNIFTY"
        ],

        metadata: {

            researchOnly:
                true,

            lookAheadBiasAllowed:
                false

        }

    };

}


function candle(
    ts,
    o = 100,
    h = 101,
    l = 99,
    c = 100,
    v = 1000
) {

    return {

        ts,
        o,
        h,
        l,
        c,
        v

    };

}


function createResponse(candles) {

    return {

        success:
            true,

        data: {

            candles

        }

    };

}


function createAcquisition({

    niftyCandles = [
        candle(1735724700000),
        candle(1735725000000)
    ],

    bankniftyCandles = [
        candle(
            1735724700000,
            200,
            201,
            199,
            200,
            2000
        ),

        candle(
            1735725000000,
            200,
            202,
            198,
            201,
            2100
        )
    ]

} = {}) {

    return {

        version:
            "PMSE-M4.3-INDSTOCKS-HISTORICAL-ACQUISITION-V1",

        window:
            createWindow(),

        request: {

            startDate:
                "2025-01-01",

            endDate:
                "2025-01-31",

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
                    "2025-01-31T23:59:59.999+05:30"
                ),

            indices: [
                "NIFTY50",
                "BANKNIFTY"
            ]

        },

        responses: {

            nifty50:
                createResponse(
                    niftyCandles
                ),

            banknifty50:
                createResponse(
                    bankniftyCandles
                )

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


test(
    "M4.4 accepts valid historical acquisition",
    () => {

        const result =
            auditHistoricalAcquisition(
                createAcquisition()
            );

        assert.equal(
            result.valid,
            true
        );

        assert.equal(
            result.status,
            "PASS"
        );

    }
);


test(
    "M4.4 reports NIFTY50 candle count",
    () => {

        const result =
            auditHistoricalAcquisition(
                createAcquisition()
            );

        assert.equal(
            result.indices.NIFTY50.candleCount,
            2
        );

    }
);


test(
    "M4.4 reports BANKNIFTY candle count",
    () => {

        const result =
            auditHistoricalAcquisition(
                createAcquisition()
            );

        assert.equal(
            result.indices.BANKNIFTY.candleCount,
            2
        );

    }
);


test(
    "M4.4 accepts chronological candles",
    () => {

        const result =
            auditHistoricalAcquisition(
                createAcquisition()
            );

        assert.equal(
            result.indices.NIFTY50.chronological,
            true
        );

    }
);


test(
    "M4.4 detects duplicate timestamps",
    () => {

        const result =
            auditHistoricalAcquisition(

                createAcquisition({

                    niftyCandles: [

                        candle(
                            1735724700000
                        ),

                        candle(
                            1735724700000
                        )

                    ]

                })

            );

        assert.equal(
            result.valid,
            false
        );

        assert.equal(
            result.indices.NIFTY50.duplicateTimestamps,
            1
        );

    }
);


test(
    "M4.4 detects non-chronological candles",
    () => {

        const result =
            auditHistoricalAcquisition(

                createAcquisition({

                    niftyCandles: [

                        candle(
                            1735725000000
                        ),

                        candle(
                            1735724700000
                        )

                    ]

                })

            );

        assert.equal(
            result.valid,
            false
        );

        assert.equal(
            result.indices.NIFTY50.chronological,
            false
        );

    }
);


test(
    "M4.4 detects invalid timestamps",
    () => {

        const result =
            auditHistoricalAcquisition(

                createAcquisition({

                    niftyCandles: [

                        candle(
                            "invalid"
                        )

                    ]

                })

            );

        assert.equal(
            result.valid,
            false
        );

        assert.equal(
            result.indices.NIFTY50.invalidTimestamps,
            1
        );

    }
);


test(
    "M4.4 detects candles outside research window",
    () => {

        const result =
            auditHistoricalAcquisition(

                createAcquisition({

                    niftyCandles: [

                        candle(
                            Date.parse(
                                "2024-12-31T12:00:00+05:30"
                            )
                        )

                    ]

                })

            );

        assert.equal(
            result.valid,
            false
        );

        assert.equal(
            result.indices.NIFTY50.outOfWindow,
            1
        );

    }
);


test(
    "M4.4 detects invalid OHLC values",
    () => {

        const result =
            auditHistoricalAcquisition(

                createAcquisition({

                    niftyCandles: [

                        candle(
                            1735724700000,
                            100,
                            90,
                            95,
                            100,
                            1000
                        )

                    ]

                })

            );

        assert.equal(
            result.valid,
            false
        );

        assert.equal(
            result.indices.NIFTY50.invalidOHLC,
            1
        );

    }
);


test(
    "M4.4 detects missing NIFTY50 response",
    () => {

        const acquisition =
            createAcquisition();

        delete acquisition.responses.nifty50;

        assert.throws(
            () =>
                auditHistoricalAcquisition(
                    acquisition
                ),
            /NIFTY50/
        );

    }
);


test(
    "M4.4 detects missing BANKNIFTY response",
    () => {

        const acquisition =
            createAcquisition();

        delete acquisition.responses.banknifty50;

        assert.throws(
            () =>
                auditHistoricalAcquisition(
                    acquisition
                ),
            /BANKNIFTY/
        );

    }
);


test(
    "M4.4 rejects missing acquisition",
    () => {

        assert.throws(
            () =>
                auditHistoricalAcquisition(),
            /acquisition/
        );

    }
);


test(
    "M4.4 rejects missing window",
    () => {

        const acquisition =
            createAcquisition();

        delete acquisition.window;

        assert.throws(
            () =>
                auditHistoricalAcquisition(
                    acquisition
                ),
            /window/
        );

    }
);


test(
    "M4.4 detects empty NIFTY50 data",
    () => {

        const result =
            auditHistoricalAcquisition(

                createAcquisition({

                    niftyCandles: []

                })

            );

        assert.equal(
            result.valid,
            false
        );

        assert.equal(
            result.indices.NIFTY50.candleCount,
            0
        );

    }
);


test(
    "M4.4 detects empty BANKNIFTY data",
    () => {

        const result =
            auditHistoricalAcquisition(

                createAcquisition({

                    bankniftyCandles: []

                })

            );

        assert.equal(
            result.valid,
            false
        );

        assert.equal(
            result.indices.BANKNIFTY.candleCount,
            0
        );

    }
);


test(
    "M4.4 remains research-only",
    () => {

        const result =
            auditHistoricalAcquisition(
                createAcquisition()
            );

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
            result.metadata.regimeEvaluated,
            false
        );

    }
);


test(
    "M4.4 does not mutate acquisition",
    () => {

        const acquisition =
            createAcquisition();

        const before =
            JSON.stringify(
                acquisition
            );

        auditHistoricalAcquisition(
            acquisition
        );

        const after =
            JSON.stringify(
                acquisition
            );

        assert.equal(
            after,
            before
        );

    }
);


test(
    "M4.4 does not repair invalid data",
    () => {

        const candles = [

            candle(
                1735725000000
            ),

            candle(
                1735724700000
            )

        ];

        const acquisition =
            createAcquisition({

                niftyCandles:
                    candles

            });

        const result =
            auditHistoricalAcquisition(
                acquisition
            );

        assert.equal(
            result.valid,
            false
        );

        assert.deepEqual(
            acquisition.responses.nifty50.data.candles,
            candles
        );

    }
);


test(
    "M4.4 records requested research window",
    () => {

        const result =
            auditHistoricalAcquisition(
                createAcquisition()
            );

        assert.equal(
            result.window.startDate,
            "2025-01-01"
        );

        assert.equal(
            result.window.endDate,
            "2025-01-31"
        );

        assert.equal(
            result.window.interval,
            "5minute"
        );

        assert.equal(
            result.window.timezone,
            "Asia/Kolkata"
        );

    }
);


test(
    "M4.4 audits both indices independently",
    () => {

        const result =
            auditHistoricalAcquisition(

                createAcquisition({

                    niftyCandles: [],

                    bankniftyCandles: [

                        candle(
                            1735724700000
                        )

                    ]

                })

            );

        assert.equal(
            result.indices.NIFTY50.candleCount,
            0
        );

        assert.equal(
            result.indices.BANKNIFTY.candleCount,
            1
        );

        assert.equal(
            result.valid,
            false
        );

    }
);


test(
    "M4.4 exposes audit version",
    () => {

        const result =
            auditHistoricalAcquisition(
                createAcquisition()
            );

        assert.match(
            result.version,
            /^PMSE-M4\.4/
        );

    }
);


test(
    "M4.4 rejects future information outside requested window",
    () => {

        const acquisition =
            createAcquisition({

                niftyCandles: [

                    candle(
                        Date.parse(
                            "2025-02-01T09:15:00+05:30"
                        )

                    )

                ]

            });

        const result =
            auditHistoricalAcquisition(
                acquisition
            );

        assert.equal(
            result.valid,
            false
        );

        assert.equal(
            result.indices.NIFTY50.outOfWindow,
            1
        );

    }
);
