
import test from "node:test";
import assert from "node:assert/strict";


import {
    fetchEquityHistorical
}
from "../equity-data/indstocks-equity-fetcher.js";



test(
"PMSE equity fetcher builds normalized historical record",
async()=>{


    const fakeFetcher =
        async (
            url,
            options
        ) => ({


            ok:
                true,


            async json(){

                return {

                    data:[

                        {

                            timestamp:
                                1000,

                            open:
                                100,

                            high:
                                105,

                            low:
                                99,

                            close:
                                103,

                            volume:
                                10000

                        }

                    ]

                };

            }

        });


    const result =
        await fetchEquityHistorical({

            symbol:
                "RELIANCE",

            scripCode:
                "TEST123",

            exchange:
                "NSE",

            accessToken:
                "TEST_TOKEN",

            window:{

                startTime:
                    100,

                endTime:
                    200

            },

            fetcher:
                fakeFetcher

        });


    assert.equal(
        result.symbol,
        "RELIANCE"
    );


    assert.equal(
        result.candles.length,
        1
    );


    assert.equal(
        result.candles[0].c,
        103
    );


    assert.equal(
        result.candles[0].v,
        10000
    );


});



test(
"PMSE equity fetcher remains research only",
async()=>{


    const result =
        await fetchEquityHistorical({

            symbol:
                "TCS",

            scripCode:
                "TEST123",
            exchange:
                "NSE",

            accessToken:
                "TEST_TOKEN",

            window:{

                startTime:
                    100,

                endTime:
                    200

            },

            fetcher:
                async()=>({

                    ok:
                        true,

                    async json(){

                        return {
                            data:[]
                        };

                    }

                })

        });


    assert.equal(
        result.metadata.tradingEnabled,
        false
    );


    assert.equal(
        result.metadata.brokerCalled,
        false
    );


});
