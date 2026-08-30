import test from "node:test";
import assert from "node:assert/strict";


import {
    createEquityUniverse
}
from "../scanner/equity-universe.js";



test(
    "PMSE universe normalizes symbols",
    () => {


        const result =
            createEquityUniverse({

                symbols: [

                    "reliance",

                    " HDFCBANK ",

                    "TCS",

                    "reliance"

                ]

            });



        assert.equal(
            result.totalSymbols,
            3
        );


        assert.deepEqual(
            result.symbols,
            [
                "RELIANCE",
                "HDFCBANK",
                "TCS"
            ]
        );


    }
);



test(
    "PMSE universe remains research-only",
    () => {


        const result =
            createEquityUniverse({

                symbols:[
                    "INFY"
                ]

            });



        assert.equal(
            result.metadata.tradingEnabled,
            false
        );


        assert.equal(
            result.metadata.brokerCalled,
            false
        );


    }
);
