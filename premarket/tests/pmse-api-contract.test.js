
import test from "node:test";
import assert from "node:assert/strict";


import {
    runPMSE
}
from "../pipeline/pmse-runner.js";



test(
    "PMSE API pipeline returns TradeMind compatible output",
    () => {


        const result =
            runPMSE({

                stocks:[

                    {
                        symbol:"RELIANCE",

                        candles:[

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

                        ]

                    }

                ]

            });



        assert.equal(
            result.output.source,
            "PMSE"
        );


        assert.equal(
            result.output.mode,
            "PAPER_ONLY"
        );


        assert.ok(
            Array.isArray(
                result.output.candidates
            )
        );


    }
);



test(
    "PMSE API remains paper only",
    () => {


        const result =
            runPMSE({

                stocks:[]

            });



        assert.equal(
            result.metadata.tradeCreated,
            false
        );


        assert.equal(
            result.metadata.brokerCalled,
            false
        );


    }
);
