import test from "node:test";
import assert from "node:assert/strict";


import {
    runPMSE,
    PMSE_RUNNER_VERSION
}
from "../pipeline/pmse-runner.js";



function createCandles(){

    return [

        {
            c:100,
            h:102,
            l:99,
            o:100,
            v:1000
        },


        {
            c:105,
            h:106,
            l:103,
            o:104,
            v:3000
        }

    ];

}



test(
    "PMSE runner completes full selection pipeline",
    async () => {


        const result =
            await runPMSE({

                stocks:[

                    {
                        symbol:"RELIANCE",
                        candles:createCandles()
                    },


                    {
                        symbol:"INFY",
                        candles:createCandles()
                    }


                ]

            });



        assert.equal(
            result.version,
            PMSE_RUNNER_VERSION
        );


        assert.ok(
            Array.isArray(
                result.output.candidates
            )
        );


        assert.equal(
            result.metadata.tradeCreated,
            false
        );


    }
);



test(
    "PMSE runner limits final output candidates",
    async () => {


        const result =
            await runPMSE({

                stocks:[

                    {
                        symbol:"A",
                        candles:createCandles()
                    },

                    {
                        symbol:"B",
                        candles:createCandles()
                    },

                    {
                        symbol:"C",
                        candles:createCandles()
                    },

                    {
                        symbol:"D",
                        candles:createCandles()
                    }

                ]

            });



        assert.ok(
            result.output.candidates.length <= 3
        );


    }
);



test(
    "PMSE runner remains paper-only",
    async () => {


        const result =
            await runPMSE({

                stocks:[]

            });



        assert.equal(
            result.metadata.brokerCalled,
            false
        );


        assert.equal(
            result.metadata.tradeCreated,
            false
        );


    }
);
