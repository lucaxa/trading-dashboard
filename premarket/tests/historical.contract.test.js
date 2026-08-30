import assert from "node:assert/strict";
import test from "node:test";

import {
    createHistoricalCandle,
    validateHistoricalCandle,
    normalizeHistoricalCandles,
    createHistoricalDatasetInput
} from "../ingestion/historical-contract.js";


test(
    "M3.3 creates normalized historical candle",
    () => {

        const candle =
            createHistoricalCandle({

                ts: 100,

                open: 100,

                high: 110,

                low: 95,

                close: 105,

                volume: 1000

            });


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
            105
        );

    }
);


test(
    "M3.3 accepts a valid historical candle",
    () => {

        assert.equal(

            validateHistoricalCandle({

                ts: 100,

                open: 100,

                high: 110,

                low: 95,

                close: 105

            }),

            true

        );

    }
);


test(
    "M3.3 rejects invalid historical candle",
    () => {

        assert.equal(

            validateHistoricalCandle({

                ts: 100,

                open: 100,

                high: null,

                low: 95,

                close: 105

            }),

            false

        );

    }
);


test(
    "M3.3 normalizes alternate OHLC field names",
    () => {

        const result =
            normalizeHistoricalCandles([

                {

                    ts: 200,

                    o: 101,

                    h: 111,

                    l: 99,

                    c: 108

                }

            ]);


        assert.equal(
            result.length,
            1
        );


        assert.equal(
            result[0].open,
            101
        );


        assert.equal(
            result[0].high,
            111
        );


        assert.equal(
            result[0].low,
            99
        );


        assert.equal(
            result[0].close,
            108
        );

    }
);


test(
    "M3.3 removes invalid candles",
    () => {

        const result =
            normalizeHistoricalCandles([

                {

                    ts: 100,

                    o: 100,

                    h: 110,

                    l: 95,

                    c: 105

                },

                {

                    ts: 200,

                    o: 100,

                    h: null,

                    l: 95,

                    c: 105

                }

            ]);


        assert.equal(
            result.length,
            1
        );

    }
);


test(
    "M3.3 sorts historical candles chronologically",
    () => {

        const result =
            normalizeHistoricalCandles([

                {
                    ts: 300,
                    o: 100,
                    h: 110,
                    l: 95,
                    c: 105
                },

                {
                    ts: 100,
                    o: 90,
                    h: 100,
                    l: 85,
                    c: 95
                }

            ]);


        assert.equal(
            result[0].ts,
            100
        );


        assert.equal(
            result[1].ts,
            300
        );

    }
);


test(
    "M3.3 creates dataset input for both indices",
    () => {

        const result =
            createHistoricalDatasetInput({

                marketDate:
                    "2026-08-31",

                niftyCandles: [],

                bankniftyCandles: []

            });


        assert.equal(
            result.marketDate,
            "2026-08-31"
        );


        assert.ok(
            Array.isArray(
                result.niftyCandles
            )
        );


        assert.ok(
            Array.isArray(
                result.bankniftyCandles
            )
        );

    }
);


test(
    "M3.3 rejects missing market date",
    () => {

        assert.throws(

            () =>
                createHistoricalDatasetInput({

                    niftyCandles: [],

                    bankniftyCandles: []

                }),

            /marketDate is required/

        );

    }
);