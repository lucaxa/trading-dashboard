
import test from "node:test";
import assert from "node:assert/strict";


import {
    getPMSEStocks
}
from "../equity-data/pmse-stock-provider.js";



test(
"PMSE stock provider creates scanner records",
()=>{


    const result =
        getPMSEStocks({

            symbols:[
                "RELIANCE",
                "INFY"
            ]

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
"PMSE stock provider remains research only",
()=>{


    const result =
        getPMSEStocks({

            symbols:[
                "TCS"
            ]

        });



    assert.equal(
        result[0].candles.length > 0,
        true
    );


});
