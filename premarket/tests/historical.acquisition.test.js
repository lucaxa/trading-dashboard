/*
============================================================
TradeMind Pro
PMSE M4.2 — Historical Data Acquisition Boundary
============================================================

Purpose:
Define the contract between the validated M4.1 historical
research window and the historical data acquisition layer.

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
No live-data acquisition.
No look-ahead.
============================================================
*/

import assert from "node:assert/strict";
import test from "node:test";

import {
    createHistoricalWindow
} from "../ingestion/historical-window.js";

import {
    acquireHistoricalData
} from "../ingestion/historical-acquisition.js";


function validWindow() {

    return createHistoricalWindow({

        startDate:
            "2025-01-01",

        endDate:
            "2025-01-10",

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


function validResponses() {

    return {

        NIFTY50: {

            candles: [
                {
                    ts: 1735703100000,
                    o: 100,
                    h: 101,
                    l: 99,
                    c: 100.5,
                    v: 1000
                }
            ]

        },

        BANKNIFTY: {

            candles: [
                {
                    ts: 1735703100000,
                    o: 200,
                    h: 202,
                    l: 199,
                    c: 201,
                    v: 2000
                }
            ]

        }

    };

}


test(
    "M4.2 accepts a valid historical window and responses",
    () => {

        const result =
            acquireHistoricalData({

                window:
                    validWindow(),

                responses:
                    validResponses()

            });


        assert.equal(
            result.startDate,
            "2025-01-01"
        );


        assert.equal(
            result.endDate,
            "2025-01-10"
        );


        assert.equal(
            result.interval,
            "5m"
        );


        assert.equal(
            result.timezone,
            "Asia/Kolkata"
        );


        assert.deepEqual(
            result.indices,
            [
                "NIFTY50",
                "BANKNIFTY"
            ]
        );

    }
);


test(
    "M4.2 preserves NIFTY50 data",
    () => {

        const result =
            acquireHistoricalData({

                window:
                    validWindow(),

                responses:
                    validResponses()

            });


        assert.equal(
            result.responses.NIFTY50.candles.length,
            1
        );

    }
);


test(
    "M4.2 preserves BANKNIFTY data",
    () => {

        const result =
            acquireHistoricalData({

                window:
                    validWindow(),

                responses:
                    validResponses()

            });


        assert.equal(
            result.responses.BANKNIFTY.candles.length,
            1
        );

    }
);


test(
    "M4.2 rejects missing window",
    () => {

        assert.throws(
            () =>
                acquireHistoricalData({

                    responses:
                        validResponses()

                })
        );

    }
);


test(
    "M4.2 rejects invalid window",
    () => {

        assert.throws(
            () =>
                acquireHistoricalData({

                    window: {

                        startDate:
                            "2025-01-10",

                        endDate:
                            "2025-01-01"

                    },

                    responses:
                        validResponses()

                })
        );

    }
);


test(
    "M4.2 rejects missing responses",
    () => {

        assert.throws(
            () =>
                acquireHistoricalData({

                    window:
                        validWindow()

                })
        );

    }
);


test(
    "M4.2 rejects missing NIFTY50 response",
    () => {

        const responses =
            validResponses();

        delete responses.NIFTY50;


        assert.throws(
            () =>
                acquireHistoricalData({

                    window:
                        validWindow(),

                    responses

                })
        );

    }
);


test(
    "M4.2 rejects missing BANKNIFTY response",
    () => {

        const responses =
            validResponses();

        delete responses.BANKNIFTY;


        assert.throws(
            () =>
                acquireHistoricalData({

                    window:
                        validWindow(),

                    responses

                })
        );

    }
);


test(
    "M4.2 rejects non-object responses",
    () => {

        assert.throws(
            () =>
                acquireHistoricalData({

                    window:
                        validWindow(),

                    responses:
                        []

                })
        );

    }
);


test(
    "M4.2 does not mutate the window",
    () => {

        const window =
            validWindow();

        const before =
            JSON.stringify(window);


        acquireHistoricalData({

            window,

            responses:
                validResponses()

        });


        assert.equal(
            JSON.stringify(window),
            before
        );

    }
);


test(
    "M4.2 does not mutate responses",
    () => {

        const responses =
            validResponses();

        const before =
            JSON.stringify(responses);


        acquireHistoricalData({

            window:
                validWindow(),

            responses

        });


        assert.equal(
            JSON.stringify(responses),
            before
        );

    }
);


test(
    "M4.2 remains research-only",
    () => {

        const result =
            acquireHistoricalData({

                window:
                    validWindow(),

                responses:
                    validResponses()

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


test(
    "M4.2 does not perform live acquisition",
    () => {

        const result =
            acquireHistoricalData({

                window:
                    validWindow(),

                responses:
                    validResponses()

            });


        assert.equal(
            result.metadata.liveDataRequested,
            false
        );

    }
);


test(
    "M4.2 does not allow look-ahead",
    () => {

        const result =
            acquireHistoricalData({

                window:
                    validWindow(),

                responses:
                    validResponses()

            });


        assert.equal(
            result.metadata.lookAheadBiasAllowed,
            false
        );


        assert.equal(
            result.metadata.futureInformationUsedForDecision,
            false
        );

    }
);


test(
    "M4.2 records the requested research window",
    () => {

        const result =
            acquireHistoricalData({

                window:
                    validWindow(),

                responses:
                    validResponses()

            });


        assert.deepEqual(
            result.window,
            validWindow()
        );

    }
);
