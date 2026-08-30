/*
============================================================
TradeMind Pro
PMSE M3.4 — Historical Data Adapter Tests
============================================================

Research only.
No trading.
No broker interaction.
No frontend.
============================================================
*/

import assert from "node:assert/strict";
import test from "node:test";

import {
    PMSE_ADAPTER_VERSION,
    adaptHistoricalDatasetInput
} from "../ingestion/historical-adapter.js";


test(
    "M3.4 adapter accepts direct candle arrays",
    () => {

        const result =
            adaptHistoricalDatasetInput({

                marketDate:
                    "2026-08-31",

                niftyResponse: [

                    {
                        ts: 3,
                        o: 103,
                        h: 105,
                        l: 102,
                        c: 104
                    }

                ],

                bankniftyResponse: [

                    {
                        ts: 2,
                        o: 203,
                        h: 205,
                        l: 202,
                        c: 204
                    }

                ]

            });


        assert.equal(
            result.marketDate,
            "2026-08-31"
        );


        assert.equal(
            result.niftyCandles.length,
            1
        );


        assert.equal(
            result.bankniftyCandles.length,
            1
        );

    }
);


test(
    "M3.4 adapter accepts candles payload",
    () => {

        const result =
            adaptHistoricalDatasetInput({

                marketDate:
                    "2026-08-31",

                niftyResponse: {

                    candles: [

                        {
                            ts: 10,
                            o: 100,
                            h: 102,
                            l: 99,
                            c: 101
                        }

                    ]

                },

                bankniftyResponse: {

                    candles: [

                        {
                            ts: 20,
                            o: 200,
                            h: 202,
                            l: 199,
                            c: 201
                        }

                    ]

                }

            });


        assert.equal(
            result.niftyCandles.length,
            1
        );


        assert.equal(
            result.bankniftyCandles.length,
            1
        );

    }
);


test(
    "M3.4 adapter normalizes alternate OHLC fields",
    () => {

        const result =
            adaptHistoricalDatasetInput({

                marketDate:
                    "2026-08-31",

                niftyResponse: [

                    {
                        timestamp: 100,
                        open: 100,
                        high: 110,
                        low: 95,
                        close: 108,
                        volume: 500
                    }

                ]

            });


        const candle =
            result.niftyCandles[0];


        assert.equal(
            candle.ts,
            100
        );


        assert.equal(
            candle.open,
            100
        );


        assert.equal(
            candle.high,
            110
        );


        assert.equal(
            candle.low,
            95
        );


        assert.equal(
            candle.close,
            108
        );


        assert.equal(
            candle.volume,
            500
        );

    }
);


test(
    "M3.4 adapter removes invalid candles",
    () => {

        const result =
            adaptHistoricalDatasetInput({

                marketDate:
                    "2026-08-31",

                niftyResponse: [

                    {
                        ts: 1,
                        o: 100,
                        h: 101,
                        l: 99,
                        c: 100
                    },

                    {
                        ts: null,
                        o: 100,
                        h: 101,
                        l: 99,
                        c: 100
                    },

                    {
                        ts: 3,
                        o: null,
                        h: 101,
                        l: 99,
                        c: 100
                    }

                ]

            });


        assert.equal(
            result.niftyCandles.length,
            1
        );


        assert.equal(
            result.niftyCandles[0].ts,
            1
        );

    }
);


test(
    "M3.4 adapter sorts candles chronologically",
    () => {

        const result =
            adaptHistoricalDatasetInput({

                marketDate:
                    "2026-08-31",

                niftyResponse: [

                    {
                        ts: 30,
                        o: 103,
                        h: 104,
                        l: 102,
                        c: 103
                    },

                    {
                        ts: 10,
                        o: 101,
                        h: 102,
                        l: 100,
                        c: 101
                    },

                    {
                        ts: 20,
                        o: 102,
                        h: 103,
                        l: 101,
                        c: 102
                    }

                ]

            });


        assert.deepEqual(

            result.niftyCandles.map(
                candle =>
                    candle.ts
            ),

            [
                10,
                20,
                30
            ]

        );

    }
);


test(
    "M3.4 adapter rejects missing market date",
    () => {

        assert.throws(

            () =>
                adaptHistoricalDatasetInput({

                    niftyResponse: []

                }),

            /marketDate is required/

        );

    }
);


test(
    "M3.4 adapter remains research-only",
    () => {

        const result =
            adaptHistoricalDatasetInput({

                marketDate:
                    "2026-08-31",

                niftyResponse: [],

                bankniftyResponse: []

            });


        assert.equal(
            result.metadata.adapterVersion,
            PMSE_ADAPTER_VERSION
        );


        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata.fetchedByAdapter,
            true
        );


        assert.equal(
            result.metadata.regimeEvaluated,
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