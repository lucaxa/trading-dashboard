import assert from "node:assert/strict";
import test from "node:test";

import {
    buildMarketContext
} from "../market/context.js";


test(
    "market context uses supplied historical candles",
    () => {

        const result =
            buildMarketContext({

                symbol:
                    "NIFTY 50",

                marketDate:
                    "2026-08-28",

                candles: [

                    {
                        ts: 1000,
                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103
                    },

                    {
                        ts: 2000,
                        o: 103,
                        h: 108,
                        l: 102,
                        c: 107
                    }

                ]

            });


        assert.equal(
            result.type,
            "MARKET_CONTEXT"
        );

        assert.equal(
            result.symbol,
            "NIFTY 50"
        );

        assert.equal(
            result.data.close,
            107
        );

        assert.equal(
            result.data.candleCount,
            2
        );

    }
);


test(
    "market context orders candles chronologically",
    () => {

        const result =
            buildMarketContext({

                symbol:
                    "NIFTY 50",

                marketDate:
                    "2026-08-28",

                candles: [

                    {
                        ts: 3000,
                        o: 110,
                        h: 112,
                        l: 109,
                        c: 111
                    },

                    {
                        ts: 1000,
                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103
                    },

                    {
                        ts: 2000,
                        o: 103,
                        h: 108,
                        l: 102,
                        c: 107
                    }

                ]

            });


        assert.equal(
            result.data.close,
            111
        );

        assert.equal(
            result.data.candleCount,
            3
        );

    }
);


test(
    "invalid candles are excluded",
    () => {

        const result =
            buildMarketContext({

                symbol:
                    "NIFTY 50",

                marketDate:
                    "2026-08-28",

                candles: [

                    {
                        ts: 1000,
                        o: 100,
                        h: 105,
                        l: 99,
                        c: 103
                    },

                    {
                        ts: 2000,
                        o: null,
                        h: 108,
                        l: 102,
                        c: 107
                    }

                ]

            });


        assert.equal(
            result.data.candleCount,
            1
        );

    }
);


test(
    "market context fails when no valid candles exist",
    () => {

        assert.throws(

            () =>
                buildMarketContext({

                    symbol:
                        "NIFTY 50",

                    marketDate:
                        "2026-08-28",

                    candles: []

                }),

            /No valid candles/

        );

    }
);


test(
    "market return is calculated from session open",
    () => {

        const result =
            buildMarketContext({

                symbol:
                    "NIFTY 50",

                marketDate:
                    "2026-08-28",

                candles: [

                    {
                        ts: 1000,
                        o: 100,
                        h: 105,
                        l: 99,
                        c: 102
                    },

                    {
                        ts: 2000,
                        o: 102,
                        h: 110,
                        l: 101,
                        c: 105
                    }

                ]

            });


        assert.equal(
            result.data.sessionReturnPct,
            5
        );

    }
);
