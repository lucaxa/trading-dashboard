import assert from "node:assert/strict";
import test from "node:test";

import {
    createHistoricalWindow,
    validateHistoricalWindow
} from "../ingestion/historical-window.js";


function validWindow(overrides = {}) {

    return {

        startDate:
            "2026-01-01",

        endDate:
            "2026-06-30",

        interval:
            "5m",

        timezone:
            "Asia/Kolkata",

        indices: [

            "NIFTY50",
            "BANKNIFTY"

        ],

        ...overrides

    };

}


test(
    "M4.1 creates a normalized historical window",
    () => {

        const window =
            createHistoricalWindow(
                validWindow()
            );


        assert.equal(
            window.startDate,
            "2026-01-01"
        );


        assert.equal(
            window.endDate,
            "2026-06-30"
        );


        assert.equal(
            window.interval,
            "5m"
        );


        assert.equal(
            window.timezone,
            "Asia/Kolkata"
        );


        assert.deepEqual(
            window.indices,
            [
                "NIFTY50",
                "BANKNIFTY"
            ]
        );

    }
);


test(
    "M4.1 accepts a valid historical window",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow()
            ),
            true
        );

    }
);


test(
    "M4.1 rejects missing start date",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    startDate: null
                })
            ),
            false
        );

    }
);


test(
    "M4.1 rejects missing end date",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    endDate: null
                })
            ),
            false
        );

    }
);


test(
    "M4.1 rejects invalid date range",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({

                    startDate:
                        "2026-07-01",

                    endDate:
                        "2026-01-01"

                })
            ),
            false
        );

    }
);


test(
    "M4.1 requires five minute interval",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    interval: "15m"
                })
            ),
            false
        );

    }
);


test(
    "M4.1 requires Asia Kolkata timezone",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    timezone: "UTC"
                })
            ),
            false
        );

    }
);


test(
    "M4.1 requires NIFTY50 coverage",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    indices: [
                        "BANKNIFTY"
                    ]
                })
            ),
            false
        );

    }
);


test(
    "M4.1 requires BANKNIFTY coverage",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    indices: [
                        "NIFTY50"
                    ]
                })
            ),
            false
        );

    }
);


test(
    "M4.1 rejects non-array indices",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    indices: "NIFTY50,BANKNIFTY"
                })
            ),
            false
        );

    }
);


test(
    "M4.1 rejects unknown indices",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    indices: [
                        "NIFTY50",
                        "UNKNOWN"
                    ]
                })
            ),
            false
        );

    }
);


test(
    "M4.1 normalizes index ordering",
    () => {

        const window =
            createHistoricalWindow({

                ...validWindow(),

                indices: [
                    "BANKNIFTY",
                    "NIFTY50"
                ]

            });


        assert.deepEqual(
            window.indices,
            [
                "NIFTY50",
                "BANKNIFTY"
            ]
        );

    }
);


test(
    "M4.1 rejects missing interval",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    interval: null
                })
            ),
            false
        );

    }
);


test(
    "M4.1 rejects missing timezone",
    () => {

        assert.equal(
            validateHistoricalWindow(
                validWindow({
                    timezone: null
                })
            ),
            false
        );

    }
);


test(
    "M4.1 remains research-only",
    () => {

        const window =
            createHistoricalWindow(
                validWindow()
            );


        assert.equal(
            window.metadata.researchOnly,
            true
        );


        assert.equal(
            window.metadata.tradeCreated,
            false
        );


        assert.equal(
            window.metadata.brokerCalled,
            false
        );


        assert.equal(
            window.metadata.productionBackendTouched,
            false
        );


        assert.equal(
            window.metadata.frontendTouched,
            false
        );

    }
);


test(
    "M4.1 does not allow look-ahead",
    () => {

        const window =
            createHistoricalWindow(
                validWindow()
            );


        assert.equal(
            window.metadata.lookAheadBiasAllowed,
            false
        );


        assert.equal(
            window.metadata.futureInformationUsedForDecision,
            false
        );

    }
);


test(
    "M4.1 creation does not mutate input",
    () => {

        const input =
            validWindow();


        const before =
            JSON.stringify(
                input
            );


        createHistoricalWindow(
            input
        );


        const after =
            JSON.stringify(
                input
            );


        assert.equal(
            after,
            before
        );

    }
);


test(
    "M4.1 rejects invalid window object",
    () => {

        assert.equal(
            validateHistoricalWindow(
                null
            ),
            false
        );


        assert.equal(
            validateHistoricalWindow(
                "invalid"
            ),
            false
        );

    }
);


test(
    "M4.1 rejects unsupported interval values",
    () => {

        for (
            const interval of [
                "1m",
                "3m",
                "10m",
                "30m",
                "1h",
                "1d"
            ]
        ) {

            assert.equal(
                validateHistoricalWindow(
                    validWindow({
                        interval
                    })
                ),
                false
            );

        }

    }
);
