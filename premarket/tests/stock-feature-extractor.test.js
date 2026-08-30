import test from "node:test";
import assert from "node:assert/strict";


import {
    extractStockFeatures,
    PMSE_FEATURE_VERSION
}
from "../features/stock-feature-extractor.js";



test(
    "PMSE feature extractor calculates stock features",
    () => {


        const result =
            extractStockFeatures({

                symbol:
                    "reliance",

                candles:[

                    {
                        c:100,
                        h:102,
                        l:99,
                        v:1000
                    },

                    {
                        c:110,
                        h:112,
                        l:108,
                        v:2000
                    }

                ]

            });



        assert.equal(
            result.version,
            PMSE_FEATURE_VERSION
        );


        assert.equal(
            result.symbol,
            "RELIANCE"
        );


        assert.equal(
            result.features.priceChangePct,
            10
        );


        assert.equal(
            result.features.volumeRatio,
            1.3333333333333333
        );


        assert.equal(
            result.features.range,
            13
        );


    }
);



test(
    "PMSE feature extractor remains research-only",
    () => {


        const result =
            extractStockFeatures({

                symbol:
                    "INFY",

                candles:[

                    {
                        c:100,
                        h:101,
                        l:99,
                        v:100
                    }

                ]

            });



        assert.equal(
            result.metadata.tradingEnabled,
            false
        );


        assert.equal(
            result.metadata.signalCreated,
            false
        );


    }
);



test(
    "PMSE feature extractor rejects missing candles",
    () => {


        assert.throws(
            () =>
                extractStockFeatures({

                    symbol:
                        "TCS"

                })
        );


    }
);
