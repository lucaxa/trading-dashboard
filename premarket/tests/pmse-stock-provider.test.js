import test from "node:test";
import assert from "node:assert/strict";


import {
    getPMSEStocks
}
from "../equity-data/pmse-stock-provider.js";



function fakeFetcher(){

    return async (

        url,
        options

    ) => {


        return {

            ok:
                true,


            async json(){

                return {

                    data:[

                        {

                            ts:
                                1000,

                            o:
                                100,

                            h:
                                105,

                            l:
                                99,

                            c:
                                103,

                            v:
                                10000

                        }

                    ]

                };

            }

        };

    };

}



const TEST_INSTRUMENTS = [

    {

        symbol:
            "RELIANCE",

        securityId:
            "2885",

        exchange:
            "NSE",

        segment:
            "E"

    },


    {

        symbol:
            "TCS",

        securityId:
            "11536",

        exchange:
            "NSE",

        segment:
            "E"

    }

];



const TEST_WINDOW = {

    startTime:
        100,

    endTime:
        200

};



test(
"PMSE stock provider creates scanner records from historical data",
async()=>{


    const result =
        await getPMSEStocks({

            symbols:[

                "RELIANCE",

                "TCS"

            ],


            instruments:
                TEST_INSTRUMENTS,


            accessToken:
                "TEST_TOKEN",


            window:
                TEST_WINDOW,


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


    assert.ok(

        Array.isArray(

            result[0].candles

        )

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


            instruments:
                TEST_INSTRUMENTS,


            accessToken:
                "TEST_TOKEN",


            window:
                TEST_WINDOW,


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

                "RELIANCE"

            ],


            instruments:
                TEST_INSTRUMENTS,


            accessToken:
                "TEST_TOKEN",


            window:
                TEST_WINDOW,


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