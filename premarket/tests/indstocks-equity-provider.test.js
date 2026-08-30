import test from "node:test";
import assert from "node:assert/strict";


import {
    createINDstocksEquityRecord,
    PMSE_INDSTOCKS_PROVIDER_VERSION
}
from "../equity-data/indstocks-equity-provider.js";



test(
    "PMSE INDstocks provider normalizes candles",
    () => {


        const result =
            createINDstocksEquityRecord({

                symbol:
                    "reliance",

                candles:[

                    {
                        timestamp:1,
                        open:100,
                        high:102,
                        low:99,
                        close:101,
                        volume:5000
                    }

                ]

            });



        assert.equal(
            result.version,
            PMSE_INDSTOCKS_PROVIDER_VERSION
        );


        assert.equal(
            result.symbol,
            "RELIANCE"
        );


        assert.equal(
            result.candles[0].o,
            100
        );


        assert.equal(
            result.candles[0].c,
            101
        );


        assert.equal(
            result.metadata.source,
            "INDstocks"
        );


    }
);



test(
    "PMSE INDstocks provider remains research-only",
    () => {


        const result =
            createINDstocksEquityRecord({

                symbol:
                    "INFY"

            });



        assert.equal(
            result.metadata.researchOnly,
            true
        );


        assert.equal(
            result.metadata.brokerCalled,
            false
        );


    }
);



test(
    "PMSE INDstocks provider rejects missing symbol",
    () => {


        assert.throws(
            () =>
                createINDstocksEquityRecord({

                    candles:[]

                })
        );


    }
);
