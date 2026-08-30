/*
============================================================
TradeMind Pro
PMSE M4.3 — INDstocks Historical Acquisition
============================================================

Purpose:
Validate the isolated historical INDstocks acquisition
boundary used by the PMSE research engine.

Research only.
No trading.
No broker interaction.
No frontend.
No production backend.
No look-ahead.
============================================================
*/

import assert from "node:assert/strict";
import test from "node:test";

import {
    acquireHistoricalFromINDstocks,
    PMSE_INDSTOCKS_ACQUISITION_VERSION
} from "../ingestion/historical-indstocks.js";


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
            "BANKNIFTY",
            "NIFTY50"
        ],

        metadata: {

            researchOnly:
                true,

            lookAheadBiasAllowed:
                false

        }

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


function createFetcher(responses) {

    const calls = [];

    const fetcher =
        async (
            url,
            options
        ) => {

            calls.push({
                url,
                options
            });

            if (
                url.includes(
                    "40000001"
                )
            ) {

                return responses.nifty;

            }

            if (
                url.includes(
                    "40000003"
                )
            ) {

                return responses.banknifty;

            }

            throw new Error(
                "unexpected scrip code"
            );

        };


    fetcher.calls =
        calls;


    return fetcher;

}


test(
    "M4.3 accepts a valid historical window",
    async () => {

        const window =
            createWindow();


        const fetcher =
            createFetcher({

                nifty:
                    createResponse([
                        {
                            ts: 1735724700000,
                            o: 100,
                            h: 101,
                            l: 99,
                            c: 100.5,
                            v: 1000
                        }
                    ]),

                banknifty:
                    createResponse([
                        {
                            ts: 1735724700000,
                            o: 200,
                            h: 202,
                            l: 198,
                            c: 201,
                            v: 2000
                        }
                    ])

            });


        const result =
            await acquireHistoricalFromINDstocks({

                window,

                accessToken:
                    "test-token",

                fetcher

            });


        assert.equal(
            result.version,
            PMSE_INDSTOCKS_ACQUISITION_VERSION
        );


        assert.equal(
            result.window,
            window
        );


        assert.equal(
            result.responses.nifty50.success,
            true
        );


        assert.equal(
            result.responses.banknifty.success,
            true
        );

    }
);


test(
    "M4.3 requests NIFTY50 with the correct scrip code",
    async () => {

        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    createResponse([])

            });


        await acquireHistoricalFromINDstocks({

            window:
                createWindow(),

            accessToken:
                "test-token",

            fetcher

        });


        assert.equal(
            fetcher.calls.length,
            2
        );


        assert.match(
            fetcher.calls[0].url,
            /40000001/
        );

    }
);


test(
    "M4.3 requests BANKNIFTY with the correct scrip code",
    async () => {

        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    createResponse([])

            });


        await acquireHistoricalFromINDstocks({

            window:
                createWindow(),

            accessToken:
                "test-token",

            fetcher

        });


        assert.match(
            fetcher.calls[1].url,
            /40000003/
        );

    }
);


test(
    "M4.3 requests five minute candles",
    async () => {

        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    createResponse([])

            });


        await acquireHistoricalFromINDstocks({

            window:
                createWindow(),

            accessToken:
                "test-token",

            fetcher

        });


        for (
            const call of fetcher.calls
        ) {

            assert.match(
                call.url,
                /\/market\/historical\/5minute/
            );

        }

    }
);


test(
    "M4.3 sends the research window timestamps",
    async () => {

        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    createResponse([])

            });


        await acquireHistoricalFromINDstocks({

            window:
                createWindow(),

            accessToken:
                "test-token",

            fetcher

        });


        for (
            const call of fetcher.calls
        ) {

            assert.match(
                call.url,
                /start_time=\d+/
            );

            assert.match(
                call.url,
                /end_time=\d+/
            );

        }

    }
);


test(
    "M4.3 sends the authorization token",
    async () => {

        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    createResponse([])

            });


        await acquireHistoricalFromINDstocks({

            window:
                createWindow(),

            accessToken:
                "secret-token",

            fetcher

        });


        for (
            const call of fetcher.calls
        ) {

            assert.equal(
                call.options.headers.Authorization,
                "secret-token"
            );

        }

    }
);


test(
    "M4.3 preserves raw NIFTY50 response",
    async () => {

        const response =
            createResponse([
                {
                    ts: 1,
                    o: 100,
                    h: 101,
                    l: 99,
                    c: 100,
                    v: 10
                }
            ]);


        const fetcher =
            createFetcher({

                nifty:
                    response,

                banknifty:
                    createResponse([])

            });


        const result =
            await acquireHistoricalFromINDstocks({

                window:
                    createWindow(),

                accessToken:
                    "test-token",

                fetcher

            });


        assert.equal(
            result.responses.nifty50,
            response
        );

    }
);


test(
    "M4.3 preserves raw BANKNIFTY response",
    async () => {

        const response =
            createResponse([
                {
                    ts: 1,
                    o: 200,
                    h: 201,
                    l: 199,
                    c: 200,
                    v: 20
                }
            ]);


        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    response

            });


        const result =
            await acquireHistoricalFromINDstocks({

                window:
                    createWindow(),

                accessToken:
                    "test-token",

                fetcher

            });


        assert.equal(
            result.responses.banknifty50,
            response
        );

    }
);


test(
    "M4.3 rejects missing window",
    async () => {

        await assert.rejects(
            () =>
                acquireHistoricalFromINDstocks({

                    accessToken:
                        "test-token",

                    fetcher:
                        async () =>
                            createResponse([])

                }),
            /window is required/
        );

    }
);


test(
    "M4.3 rejects missing access token",
    async () => {

        await assert.rejects(
            () =>
                acquireHistoricalFromINDstocks({

                    window:
                        createWindow(),

                    fetcher:
                        async () =>
                            createResponse([])

                }),
            /accessToken is required/
        );

    }
);


test(
    "M4.3 rejects missing fetcher",
    async () => {

        await assert.rejects(
            () =>
                acquireHistoricalFromINDstocks({

                    window:
                        createWindow(),

                    accessToken:
                        "test-token"

                }),
            /fetcher is required/
        );

    }
);


test(
    "M4.3 propagates NIFTY acquisition failure",
    async () => {

        const fetcher =
            async (
                url
            ) => {

                if (
                    url.includes(
                        "40000001"
                    )
                ) {

                    throw new Error(
                        "NIFTY HTTP 429"
                    );

                }

                return createResponse([]);

            };


        await assert.rejects(
            () =>
                acquireHistoricalFromINDstocks({

                    window:
                        createWindow(),

                    accessToken:
                        "test-token",

                    fetcher

                }),
            /NIFTY HTTP 429/
        );

    }
);


test(
    "M4.3 propagates BANKNIFTY acquisition failure",
    async () => {

        const fetcher =
            async (
                url
            ) => {

                if (
                    url.includes(
                        "40000003"
                    )
                ) {

                    throw new Error(
                        "BANKNIFTY HTTP 429"
                    );

                }

                return createResponse([]);

            };


        await assert.rejects(
            () =>
                acquireHistoricalFromINDstocks({

                    window:
                        createWindow(),

                    accessToken:
                        "test-token",

                    fetcher

                }),
            /BANKNIFTY HTTP 429/
        );

    }
);


test(
    "M4.3 remains research-only",
    async () => {

        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    createResponse([])

            });


        const result =
            await acquireHistoricalFromINDstocks({

                window:
                    createWindow(),

                accessToken:
                    "test-token",

                fetcher

            });


        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata.liveAcquisition,
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


test(
    "M4.3 does not modify the historical window",
    async () => {

        const window =
            createWindow();


        const before =
            structuredClone(
                window
            );


        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    createResponse([])

            });


        await acquireHistoricalFromINDstocks({

            window,

            accessToken:
                "test-token",

            fetcher

        });


        assert.deepEqual(
            window,
            before
        );

    }
);


test(
    "M4.3 records the requested window",
    async () => {

        const window =
            createWindow();


        const fetcher =
            createFetcher({

                nifty:
                    createResponse([]),

                banknifty:
                    createResponse([])

            });


        const result =
            await acquireHistoricalFromINDstocks({

                window,

                accessToken:
                    "test-token",

                fetcher

            });


        assert.equal(
            result.request.startDate,
            window.startDate
        );


        assert.equal(
            result.request.endDate,
            window.endDate
        );


        assert.equal(
            result.request.interval,
            "5minute"
        );


        assert.equal(
            result.request.timezone,
            "Asia/Kolkata"
        );

    }
);
