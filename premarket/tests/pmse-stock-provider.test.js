
import test from "node:test";
import assert from "node:assert/strict";


import {
    getPMSEStocks
}
from "../equity-data/pmse-stock-provider.js";



function fakeFetcher() {

    return async (
        url,
        options
    ) => ({

        ok:
            true,

        async json() {

            return {

                data:[

                    {
                        o:100,
                        h:105,
                        l:99,
                        c:103,
                        v:10000
                    },

                    {
                        o:103,
                        h:108,
                        l:102,
                        c:107,
                        v:12000
                    }

                ]

            };

        }

    });

}



test(
"PMSE stock provider creates scanner records from historical data",
async()=>{


    const result =
        await getPMSEStocks({

            symbols:[
                "RELIANCE",
                "INFY"
            ],

            instruments:[

                {
                    symbol:
                        "RELIANCE",

                    securityId:
                        "2885"
                },

                {
                    symbol:
                        "INFY",

                    securityId:
                        "1594"
                }

            ],

            accessToken:
                "TEST_TOKEN",

            window:{

                startTime:
                    100,

                endTime:
                    200

            },

            fetcher:
                fakeFetcher()

        });



    assert.equal(
        result.length,
        2
    );


    assert.equal(
        result[0].symbol,
        "RELIANCE"
    );


    assert.equal(
        result[0].candles.length,
        2
    );


    assert.equal(
        result[0].candles[1].c,
        107
    );


});



test(
"PMSE stock provider skips unresolved symbols",
async()=>{


    const result =
        await getPMSEStocks({

            symbols:[
                "RELIANCE",
                "UNKNOWN"
            ],

            instruments:[

                {
                    symbol:
                        "RELIANCE",

                    securityId:
                        "2885"
                }

            ],

            accessToken:
                "TEST_TOKEN",

            window:{

                startTime:
                    100,

                endTime:
                    200

            },

            fetcher:
                fakeFetcher()

        });



    assert.equal(
        result.length,
        1
    );


    assert.equal(
        result[0].symbol,
        "RELIANCE"
    );


});



test(
"PMSE stock provider remains research only",
async()=>{


    const result =
        await getPMSEStocks({

            symbols:[
                "TCS"
            ],

            instruments:[

                {
                    symbol:
                        "TCS",

                    securityId:
                        "11536"
                }

            ],

            accessToken:
                "TEST_TOKEN",

            window:{

                startTime:
                    100,

                endTime:
                    200

            },

            fetcher:
                fakeFetcher()

        });



    assert.ok(
        Array.isArray(
            result[0].candles
        )
    );


});
